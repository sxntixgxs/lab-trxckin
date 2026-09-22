// Búsqueda global de la paleta de comandos (Ctrl/Cmd+K). Una sola consulta reactiva con la
// identidad del usuario: cada dominio se consulta solo si el actor tiene su permiso y se limita
// a las empresas que puede ver. Nunca lanza por falta de permisos; el grupo queda vacío.
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import { rankRecords } from "../lib/command-palette/rank";
import { RUTAS_SISTEMA } from "../lib/rutas-sistema";
import { matchesSearchText, normalizeSearchText } from "../lib/search-text";
import { getCompanyVisibility, matchesVisibility } from "./lib/anticiposVisibility";
import { actorTienePermiso, requireActor, type BillingActor } from "./lib/billingAuth";
import { looksLikeNit, nitCandidates, resolveEmpresasBusqueda } from "./lib/globalSearch";
import {
  PERMISO_POR_MODULO,
  puedeVerInscripcion,
  resolveOnboardingAccess,
} from "./lib/onboarding/access";
import { buildOnboardingSearchText } from "./lib/onboarding/searchText";

/** Rows read per company and domain before ranking. */
const SCAN_PER_EMPRESA = 8;
/** Rows returned per domain. */
const LIMIT = 5;
const MIN_TERM = 2;
const MAX_TERM = 64;
/** Cap for the "responsable" onboarding level, which matches in memory. */
const RESPONSABLE_SCAN = 200;
const PERMISO_CENTROS_COSTO = "administracion/centro-costo";
const CENTRO_COSTO_EMPRESAS = new Set([1, 2, 3, 4]);

const facturaResult = v.object({
  id: v.id("facturacionFacturas"),
  empresa: v.number(),
  numeroFactura: v.string(),
  proveedorNombre: v.string(),
  proveedorNit: v.string(),
  faseActual: v.string(),
  esActiva: v.boolean(),
  fechaEmision: v.string(),
});

const anticipoResult = v.object({
  id: v.id("anticipos"),
  empresa: v.number(),
  consecutivo: v.number(),
  razonSocial: v.string(),
  nit: v.string(),
  faseActual: v.string(),
  esActiva: v.boolean(),
});

const proveedorResult = v.object({
  id: v.id("onboardingProveedores"),
  empresa: v.number(),
  nit: v.string(),
  razonSocial: v.string(),
  faseActual: v.string(),
});

const clienteResult = v.object({
  id: v.id("onboardingClientes"),
  empresa: v.number(),
  nit: v.string(),
  razonSocial: v.string(),
  faseActual: v.string(),
});

const centroCostoResult = v.object({
  id: v.id("centrosCosto"),
  appEmpresa: v.number(),
  codigo: v.string(),
  descripcion: v.string(),
});

const globalSearchResult = v.object({
  facturas: v.array(facturaResult),
  anticipos: v.array(anticipoResult),
  proveedores: v.array(proveedorResult),
  clientes: v.array(clienteResult),
  centrosCosto: v.array(centroCostoResult),
});

type Result = typeof globalSearchResult.type;

const EMPTY: Result = { facturas: [], anticipos: [], proveedores: [], clientes: [], centrosCosto: [] };

async function buscarFacturas(
  ctx: QueryCtx,
  actor: BillingActor,
  empresas: number[],
  term: string,
): Promise<Result["facturas"]> {
  if (!actorTienePermiso(actor, RUTAS_SISTEMA.FACTURACION_FACTURAS)) return [];
  const rows: Doc<"facturacionDashboardItems">[] = [];
  for (const empresa of empresas) {
    rows.push(
      ...(await ctx.db
        .query("facturacionDashboardItems")
        .withSearchIndex("search_identity", (q) => q.search("searchText", term).eq("empresa", empresa))
        .take(SCAN_PER_EMPRESA)),
    );
  }
  return rankRecords(term, rows, (row) => ({
    ids: [row.numeroFactura, row.proveedorNit],
    text: row.proveedorNombre,
    active: row.esActiva,
  }))
    .slice(0, LIMIT)
    .map((row) => ({
      id: row.facturaId,
      empresa: row.empresa,
      numeroFactura: row.numeroFactura,
      proveedorNombre: row.proveedorNombre,
      proveedorNit: row.proveedorNit,
      faseActual: row.faseActual,
      esActiva: row.esActiva,
      fechaEmision: row.fechaEmision,
    }));
}

async function buscarAnticipos(
  ctx: QueryCtx,
  actor: BillingActor,
  empresas: number[],
  term: string,
): Promise<Result["anticipos"]> {
  // Same split as /api/finance/advances/items: the dashboard permission sees the "visible"
  // scope; the request-only permission sees just the advances the user created ("mine").
  const gestiona = actorTienePermiso(actor, RUTAS_SISTEMA.FINANZAS_ANTICIPOS_DASHBOARD);
  const solicita = actorTienePermiso(actor, RUTAS_SISTEMA.FINANZAS_ANTICIPOS_SOLICITAR);
  if (!gestiona && !solicita) return [];

  const rows: Doc<"anticiposDashboardItems">[] = [];
  for (const empresa of empresas) {
    const candidates = await ctx.db
      .query("anticiposDashboardItems")
      .withSearchIndex("search_identity", (q) => q.search("searchText", term).eq("empresa", empresa))
      .take(SCAN_PER_EMPRESA);
    if (candidates.length === 0) continue;
    const visibility = gestiona ? await getCompanyVisibility(ctx, empresa, actor.usuarioId) : null;
    for (const item of candidates) {
      const visible = visibility
        ? matchesVisibility(item, actor.usuarioId, visibility, "visible")
        : item.createdById === actor.usuarioId;
      if (visible) rows.push(item);
    }
  }
  return rankRecords(term, rows, (row) => ({
    ids: [String(row.consecutivo), row.nit],
    text: row.razonSocial,
    active: row.esActiva,
  }))
    .slice(0, LIMIT)
    .map((row) => ({
      id: row.anticipoId,
      empresa: row.empresa,
      consecutivo: row.consecutivo,
      razonSocial: row.razonSocial,
      nit: row.nit,
      faseActual: row.faseActual,
      esActiva: row.esActiva,
    }));
}

type OnboardingTable = "onboardingProveedores" | "onboardingClientes";
type OnboardingRow = Doc<"onboardingProveedores"> | Doc<"onboardingClientes">;

const MODULO_POR_TABLA = {
  onboardingProveedores: "supplier",
  onboardingClientes: "customer",
} as const;

async function buscarOnboarding(
  ctx: QueryCtx,
  actor: BillingActor,
  tabla: OnboardingTable,
  empresas: number[],
  empresaFiltro: number | undefined,
  term: string,
  rawTerm: string,
): Promise<Array<{ empresa: number; nit: string; razonSocial: string; faseActual: string; row: OnboardingRow }>> {
  const modulo = MODULO_POR_TABLA[tabla];
  if (!actorTienePermiso(actor, PERMISO_POR_MODULO[modulo]) || empresas.length === 0) return [];
  const { access } = await resolveOnboardingAccess(ctx, modulo, empresaFiltro ?? null);
  const empresasSet = new Set(empresas);

  const found = new Map<string, OnboardingRow>();
  const add = (row: OnboardingRow) => {
    if (empresasSet.has(row.empresa) && puedeVerInscripcion(access, row)) found.set(row._id, row);
  };

  if (access.nivel === "responsable") {
    // Small set (only the user's own processes): match in memory, no text index needed.
    const own = await ctx.db
      .query(tabla)
      .withIndex("by_responsableId", (q) => q.eq("matriz_00.responsableId", actor.usuarioId))
      .take(RESPONSABLE_SCAN);
    for (const row of own) {
      const text =
        row.searchText ??
        buildOnboardingSearchText({ NIT: row.NIT, razonSocial: row.datos_generales_01.razonSocial });
      if (matchesSearchText(text, term)) add(row);
    }
  } else {
    for (const empresa of empresas) {
      const rows = await ctx.db
        .query(tabla)
        .withSearchIndex("search_text", (q) => q.search("searchText", term).eq("empresa", empresa))
        .take(SCAN_PER_EMPRESA);
      rows.forEach(add);
    }
    // Exact NIT: also covers inscriptions not yet backfilled with `searchText`.
    if (looksLikeNit(rawTerm)) {
      for (const nit of nitCandidates(rawTerm)) {
        const rows = await ctx.db
          .query(tabla)
          .withIndex("by_NIT", (q) => q.eq("NIT", nit))
          .take(SCAN_PER_EMPRESA);
        rows.forEach(add);
      }
    }
  }

  const mapped = [...found.values()].map((row) => ({
    empresa: row.empresa,
    nit: row.NIT,
    razonSocial: row.datos_generales_01.razonSocial ?? "",
    faseActual: row.faseActual,
    row,
  }));
  return rankRecords(term, mapped, (item) => ({
    ids: [item.nit],
    text: item.razonSocial,
    active: !item.row.anulacion,
  })).slice(0, LIMIT);
}

async function buscarCentrosCosto(
  ctx: QueryCtx,
  actor: BillingActor,
  empresas: number[],
  rawTerm: string,
): Promise<Result["centrosCosto"]> {
  if (!actorTienePermiso(actor, PERMISO_CENTROS_COSTO)) return [];
  const rows: Doc<"centrosCosto">[] = [];
  for (const empresa of empresas) {
    if (!CENTRO_COSTO_EMPRESAS.has(empresa)) continue;
    const appEmpresa = empresa as Doc<"centrosCosto">["appEmpresa"];
    rows.push(
      ...(await ctx.db
        .query("centrosCosto")
        // Cost center `searchText` is not accent-normalized: search with the raw term.
        .withSearchIndex("search_text", (q) =>
          q.search("searchText", rawTerm).eq("appEmpresa", appEmpresa).eq("activo", true),
        )
        .take(SCAN_PER_EMPRESA)),
    );
  }
  return rankRecords(rawTerm, rows, (row) => ({ ids: [row.codigo], text: row.descripcion }))
    .slice(0, LIMIT)
    .map((row) => ({
      id: row._id,
      appEmpresa: row.appEmpresa,
      codigo: row.codigo,
      descripcion: row.descripcion,
    }));
}

export const buscar = query({
  args: {
    q: v.string(),
    /** Active company; omitted = every company the user can see. */
    empresa: v.optional(v.number()),
  },
  returns: globalSearchResult,
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx);
    const rawTerm = args.q.trim().slice(0, MAX_TERM);
    const term = normalizeSearchText(rawTerm);
    if (term.length < MIN_TERM) return EMPTY;

    const empresas = resolveEmpresasBusqueda(actor, args.empresa);
    if (empresas.length === 0) return EMPTY;

    const [facturas, anticipos, proveedores, clientes, centrosCosto] = await Promise.all([
      buscarFacturas(ctx, actor, empresas, term),
      buscarAnticipos(ctx, actor, empresas, term),
      buscarOnboarding(ctx, actor, "onboardingProveedores", empresas, args.empresa, term, rawTerm),
      buscarOnboarding(ctx, actor, "onboardingClientes", empresas, args.empresa, term, rawTerm),
      buscarCentrosCosto(ctx, actor, empresas, rawTerm),
    ]);

    return {
      facturas,
      anticipos,
      proveedores: proveedores.map(({ row, ...rest }) => ({
        ...rest,
        id: row._id as Doc<"onboardingProveedores">["_id"],
      })),
      clientes: clientes.map(({ row, ...rest }) => ({
        ...rest,
        id: row._id as Doc<"onboardingClientes">["_id"],
      })),
      centrosCosto,
    };
  },
});
