import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, type QueryCtx, query } from "./_generated/server";
import { refreshAnticipoDashboardProjection } from "./lib/anticiposDashboardProjection";
import { resolveBolsaIdForAnticipo } from "./lib/bolsasAnticipos";
import {
  addCalendarDaysInclusiveRange,
  currentMonthBogotaRange,
  previousMonthBogotaRange,
} from "./lib/facturacionBusinessTime";
import { requireServerSecret } from "./lib/auth";

const BACKFILL_KEY = "projection-v1";
const BACKFILL_BATCH_SIZE = 50;
const MAX_PAGE_SIZE = 50;
const MAX_SUMMARY_ITEMS_PER_COMPANY = 5_000;
const MAX_BUZON_SOURCE_ROWS_PER_PAGE = 500;
const MAX_BOLSA_ITEMS_SCAN = 5_000;
const BAG_INVOICE_PREVIEW_LIMIT = 3;
const BAG_DEFAULT_PAGE_SIZE = 20;

const bagStatusArg = v.union(
  v.literal("pending"),
  v.literal("overdue"),
  v.literal("legalized"),
  v.literal("all")
);
const bagSortArg = v.union(v.literal("priority"), v.literal("pending"), v.literal("recent"));

type BagStatus = "pending" | "overdue" | "legalized" | "all";
type BagSort = "priority" | "pending" | "recent";

type BagItemsCursor = { offset: number };

function decodeBagItemsCursor(cursor?: string): BagItemsCursor {
  if (!cursor) return { offset: 0 };
  try {
    const value = JSON.parse(cursor) as BagItemsCursor;
    if (Number.isInteger(value.offset) && value.offset >= 0) return value;
  } catch {
    // Invalid cursors restart at the first page.
  }
  return { offset: 0 };
}

function encodeBagItemsCursor(offset: number) {
  return JSON.stringify({ offset } satisfies BagItemsCursor);
}

function isBagItemOverdue(item: Doc<"anticiposDashboardItems">, nowMs: number) {
  return item.faseActual === "V_PENDIENTE_LEGALIZACION" && item.maxLegalizacionDate < nowMs;
}

function isBagItemPending(item: Doc<"anticiposDashboardItems">) {
  return item.faseActual === "V_PENDIENTE_LEGALIZACION" && item.saldoPendiente > 0;
}

function isBagItemLegalized(item: Doc<"anticiposDashboardItems">) {
  return item.faseActual !== "V_PENDIENTE_LEGALIZACION" || item.saldoPendiente <= 0;
}

function matchesBagStatus(
  item: Doc<"anticiposDashboardItems">,
  estado: BagStatus,
  nowMs: number
) {
  if (estado === "all") return true;
  if (estado === "overdue") return isBagItemOverdue(item, nowMs);
  if (estado === "legalized") return isBagItemLegalized(item);
  return isBagItemPending(item);
}

function sortBagItems(
  items: Doc<"anticiposDashboardItems">[],
  orden: BagSort,
  nowMs: number
) {
  const sorted = [...items];
  if (orden === "recent") {
    return sorted.sort((a, b) => b.createdAt - a.createdAt || b.consecutivo - a.consecutivo);
  }
  if (orden === "pending") {
    return sorted.sort(
      (a, b) =>
        b.saldoPendiente - a.saldoPendiente ||
        a.maxLegalizacionDate - b.maxLegalizacionDate ||
        b.createdAt - a.createdAt
    );
  }
  return sorted.sort((a, b) => {
    const aOverdue = isBagItemOverdue(a, nowMs);
    const bOverdue = isBagItemOverdue(b, nowMs);
    if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
    const deadlineDiff = a.maxLegalizacionDate - b.maxLegalizacionDate;
    if (deadlineDiff !== 0) return deadlineDiff;
    return (
      b.saldoPendiente - a.saldoPendiente || b.createdAt - a.createdAt || b.consecutivo - a.consecutivo
    );
  });
}

async function buildBagItemRow(ctx: QueryCtx, item: Doc<"anticiposDashboardItems">, nowMs: number) {
  const legalizaciones = await ctx.db
    .query("facturacionAnticipoLegalizaciones")
    .withIndex("by_anticipoId_estado", (q) =>
      q.eq("anticipoId", item.anticipoId).eq("estado", "activa")
    )
    .take(BAG_INVOICE_PREVIEW_LIMIT + 1);
  const previewRows = legalizaciones.slice(0, BAG_INVOICE_PREVIEW_LIMIT);
  return {
    anticipoId: item.anticipoId,
    consecutivo: item.consecutivo,
    razonSocial: item.razonSocial,
    nit: item.nit,
    faseActual: item.faseActual,
    maxLegalizacionDate: item.maxLegalizacionDate,
    isOverdue: isBagItemOverdue(item, nowMs),
    valorContable: item.valorContable,
    valorLegalizable: item.valorLegalizable,
    saldoLegalizado: item.saldoLegalizado,
    saldoPendiente: item.saldoPendiente,
    facturas: await Promise.all(
      previewRows.map(async (row) => {
        const factura = await ctx.db.get("facturacionFacturas", row.facturaId);
        return {
          facturaId: row.facturaId,
          numeroFactura: factura?.numeroFactura ?? String(row.facturaId),
          valorAplicado: row.valorAplicado,
        };
      })
    ),
    hasMoreInvoices: legalizaciones.length > BAG_INVOICE_PREVIEW_LIMIT,
  };
}

const bagItemRowValidator = v.object({
  anticipoId: v.id("anticipos"),
  consecutivo: v.number(),
  razonSocial: v.string(),
  nit: v.string(),
  faseActual: v.string(),
  maxLegalizacionDate: v.number(),
  isOverdue: v.boolean(),
  valorContable: v.number(),
  valorLegalizable: v.number(),
  saldoLegalizado: v.number(),
  saldoPendiente: v.number(),
  facturas: v.array(
    v.object({
      facturaId: v.id("facturacionFacturas"),
      numeroFactura: v.string(),
      valorAplicado: v.number(),
    })
  ),
  hasMoreInvoices: v.boolean(),
});

const bagSummaryValidator = v.object({
  bolsaId: v.id("bolsasAnticipos"),
  empresa: v.number(),
  tipoBolsa: v.union(v.literal("general"), v.literal("peajes")),
  procesoNombre: v.string(),
  count: v.number(),
  requested: v.number(),
  accounting: v.number(),
  legalizable: v.number(),
  legalized: v.number(),
  pending: v.number(),
  overdue: v.number(),
  pendingCount: v.number(),
  legalizedCount: v.number(),
  summaryComplete: v.boolean(),
});

const scopeArg = v.union(v.literal("buzon"), v.literal("mine"), v.literal("visible"));
const modeArg = v.union(v.literal("flow"), v.literal("backlog"));
const urgencyArg = v.union(
  v.literal("all"),
  v.literal("overdue"),
  v.literal("due_soon"),
  v.literal("returned"),
  v.literal("integrity")
);

type Scope = "buzon" | "mine" | "visible";
type DashboardMode = "flow" | "backlog";
type DateRange = {
  fromKey: string | null;
  toKey: string | null;
  fromMs: number | null;
  toMsExclusive: number | null;
};

type CompanyVisibility = {
  canSeeAll: boolean;
  isAccounting: boolean;
};

function resolveDateRange(args: {
  preset?: string;
  from?: string;
  to?: string;
  nowMs?: number;
}): DateRange {
  const now = args.nowMs ?? Date.now();
  if (args.preset === "mes_anterior") return previousMonthBogotaRange(now);
  if (args.preset === "personalizado") {
    if (!args.from || !args.to || args.from > args.to) {
      throw new Error("Indica un rango de fechas válido.");
    }
    return {
      fromKey: args.from,
      toKey: args.to,
      ...addCalendarDaysInclusiveRange(args.from, args.to),
    };
  }
  return currentMonthBogotaRange(now);
}

function roleIncludesUser(config: Doc<"anticiposRolesConfig">, userId: string) {
  if (config.rol === "CONTABILIDAD") {
    const ids =
      config.usuarios?.map((usuario) => usuario.userId) ?? (config.userId ? [config.userId] : []);
    return ids.includes(userId);
  }
  return config.userId === userId;
}

async function getCompanyVisibility(
  ctx: QueryCtx,
  empresa: number,
  viewerUserId: string
): Promise<CompanyVisibility> {
  const configs = await ctx.db
    .query("anticiposRolesConfig")
    .withIndex("by_empresa", (q) => q.eq("empresa", empresa))
    .take(10);
  const legacy = await ctx.db.query("anticiposRolesConfig").withIndex("by_rol").take(20);
  const applicable = [...configs, ...legacy.filter((config) => config.empresa === undefined)];
  return {
    canSeeAll: applicable.some((config) => roleIncludesUser(config, viewerUserId)),
    isAccounting: applicable.some(
      (config) => config.rol === "CONTABILIDAD" && roleIncludesUser(config, viewerUserId)
    ),
  };
}

function matchesVisibility(
  item: Doc<"anticiposDashboardItems">,
  viewerUserId: string,
  visibility: CompanyVisibility,
  scope: Scope
) {
  if (scope === "mine") return item.createdById === viewerUserId;
  if (scope === "buzon") {
    return (
      item.esActiva &&
      (item.asignadoA === viewerUserId ||
        item.ownerUserIds?.includes(viewerUserId) ||
        (visibility.isAccounting && item.faseActual === "III_REVISION_CONTABILIDAD"))
    );
  }
  return (
    visibility.canSeeAll ||
    item.createdById === viewerUserId ||
    item.responsableUserId === viewerUserId ||
    item.asignadoA === viewerUserId
  );
}

function matchesFilters(
  item: Doc<"anticiposDashboardItems">,
  args: {
    mode?: DashboardMode;
    range: DateRange;
    fase?: string;
    urgencia?: "all" | "overdue" | "due_soon" | "returned" | "integrity";
    cubreFacturaCompleta?: boolean;
    responsable?: string;
    kpi?: string;
    nowMs: number;
    viewerUserId: string;
    isAccounting: boolean;
  }
) {
  const flowEventTimestamp =
    args.kpi === "aprobado_gerencia"
      ? item.gerenciaAprobadoEn
      : args.kpi === "desembolsado"
        ? item.desembolsadoEn
        : args.kpi === "legalizado"
          ? item.legalizadoEn
          : item.createdAt;
  if (
    args.mode === "flow" &&
    args.range.fromMs != null &&
    args.range.toMsExclusive != null &&
    (!flowEventTimestamp ||
      flowEventTimestamp < args.range.fromMs ||
      flowEventTimestamp >= args.range.toMsExclusive)
  ) {
    return false;
  }
  if (args.fase && item.faseActual !== args.fase) return false;
  if (
    args.cubreFacturaCompleta !== undefined &&
    item.cubreFacturaCompleta !== args.cubreFacturaCompleta
  ) {
    return false;
  }
  if (
    args.responsable &&
    item.responsableUserId !== args.responsable &&
    item.asignadoA !== args.responsable &&
    !item.ownerUserIds?.includes(args.responsable)
  ) {
    return false;
  }

  const daysToDue = Math.ceil((item.maxLegalizacionDate - args.nowMs) / 86_400_000);
  if (args.urgencia === "overdue") {
    if (item.faseActual !== "V_PENDIENTE_LEGALIZACION" || daysToDue >= 0) return false;
  }
  if (args.urgencia === "due_soon") {
    if (item.faseActual !== "V_PENDIENTE_LEGALIZACION" || daysToDue < 0 || daysToDue > 7) {
      return false;
    }
  }
  if (args.urgencia === "returned" && !item.fueDevuelto) return false;
  if (args.urgencia === "integrity" && item.integrityIssues.length === 0) return false;
  if (args.mode === "backlog" && !item.esActiva) return false;

  if (args.kpi === "mis_pendientes") {
    return (
      item.asignadoA === args.viewerUserId ||
      Boolean(item.ownerUserIds?.includes(args.viewerUserId)) ||
      (args.isAccounting && item.faseActual === "III_REVISION_CONTABILIDAD")
    );
  }
  if (args.kpi === "en_aprobacion") {
    return [
      "II_APROBACION_JEFE_DIRECTO",
      "III_REVISION_CONTABILIDAD",
      "IV_APROBACION_GERENCIA",
    ].includes(item.faseActual);
  }
  if (args.kpi === "por_desembolsar") {
    return item.faseActual === "IV_DESEMBOLSO_TESORERIA";
  }
  if (args.kpi === "por_legalizar") {
    return item.faseActual === "V_PENDIENTE_LEGALIZACION";
  }
  if (args.kpi === "vencidos") {
    return item.faseActual === "V_PENDIENTE_LEGALIZACION" && daysToDue < 0;
  }
  return true;
}

type DashboardCursor = { empresaIndex: number; cursor: string | null };

function decodeCursor(cursor?: string): DashboardCursor {
  if (!cursor) return { empresaIndex: 0, cursor: null };
  try {
    const value = JSON.parse(cursor) as DashboardCursor;
    if (
      Number.isInteger(value.empresaIndex) &&
      (typeof value.cursor === "string" || value.cursor === null)
    ) {
      return value;
    }
  } catch {
    // Invalid cursors restart at the first company.
  }
  return { empresaIndex: 0, cursor: null };
}

function normalizeSearchQuery(value?: string) {
  return value
    ?.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

async function hydrateItem(ctx: QueryCtx, item: Doc<"anticiposDashboardItems">) {
  const anticipo = await ctx.db.get("anticipos", item.anticipoId);
  if (!anticipo) return null;
  const phases = await ctx.db
    .query("anticiposFases")
    .withIndex("by_anticipoId", (q) => q.eq("anticipoId", item.anticipoId))
    .order("desc")
    .take(30);
  const faseEnCurso =
    phases.find((phase) => phase.estado === "EN_PROGRESO" || phase.estado === "PENDIENTE") ?? null;
  const legalizaciones = await ctx.db
    .query("facturacionAnticipoLegalizaciones")
    .withIndex("by_anticipoId_estado", (q) =>
      q.eq("anticipoId", item.anticipoId).eq("estado", "activa")
    )
    .take(50);
  const legalizacionesFacturacion = await Promise.all(
    legalizaciones.map(async (legalizacion) => ({
      ...legalizacion,
      factura: await ctx.db.get("facturacionFacturas", legalizacion.facturaId),
    }))
  );
  const bolsaId = await resolveBolsaIdForAnticipo(ctx, anticipo);
  const bolsa = bolsaId ? await ctx.db.get("bolsasAnticipos", bolsaId) : null;
  return {
    ...anticipo,
    saldoLegalizado: anticipo.saldoLegalizado ?? 0,
    bolsaIdResolved: bolsaId,
    bolsa,
    ultimaFaseInicio:
      phases.reduce((latest, phase) => Math.max(latest, phase.fechaInicio ?? 0), 0) || null,
    faseEnCurso,
    legalizacionesFacturacion,
    dashboard: {
      integrityIssues: item.integrityIssues,
      fueDevuelto: item.fueDevuelto,
      faseIniciadaEn: item.faseIniciadaEn,
      saldoPendiente: item.saldoPendiente,
    },
  };
}

export const items = query({
  args: {
    secret: v.string(),
    empresas: v.array(v.number()),
    viewerUserId: v.string(),
    scope: scopeArg,
    mode: v.optional(modeArg),
    preset: v.optional(v.string()),
    from: v.optional(v.string()),
    to: v.optional(v.string()),
    busqueda: v.optional(v.string()),
    fase: v.optional(v.string()),
    urgencia: v.optional(urgencyArg),
    cubreFacturaCompleta: v.optional(v.boolean()),
    responsable: v.optional(v.string()),
    kpi: v.optional(v.string()),
    pageSize: v.optional(v.number()),
    cursor: v.optional(v.string()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.secret);
    const nowMs = args.nowMs ?? Date.now();
    const range = resolveDateRange(args);
    const pageSize = Math.min(Math.max(args.pageSize ?? 20, 1), MAX_PAGE_SIZE);
    const decoded = decodeCursor(args.cursor);
    const search = normalizeSearchQuery(args.busqueda);

    if (args.scope === "buzon") {
      const matching: Doc<"anticiposDashboardItems">[] = [];
      let empresaIndex = decoded.empresaIndex;
      let ownerCursor = decoded.cursor;
      let sourceRowsRead = 0;

      while (
        matching.length < pageSize &&
        empresaIndex < args.empresas.length &&
        sourceRowsRead < MAX_BUZON_SOURCE_ROWS_PER_PAGE
      ) {
        const empresaActual = args.empresas[empresaIndex]!;
        const visibility = await getCompanyVisibility(ctx, empresaActual, args.viewerUserId);
        const remaining = pageSize - matching.length;
        const ownerPage = await ctx.db
          .query("anticiposDashboardResponsables")
          .withIndex("by_empresa_userId_esActivo_buzonPrioridad_buzonOrden", (q) =>
            q.eq("empresa", empresaActual).eq("userId", args.viewerUserId).eq("esActivo", true)
          )
          .order("asc")
          .paginate({ numItems: remaining, cursor: ownerCursor });
        sourceRowsRead += ownerPage.page.length;

        const candidates = await Promise.all(
          ownerPage.page.map((owner) => ctx.db.get("anticiposDashboardItems", owner.itemId))
        );
        for (const item of candidates) {
          if (!item) continue;
          if (search && search.length >= 2 && !item.searchText.includes(search)) continue;
          if (
            !matchesVisibility(item, args.viewerUserId, visibility, "buzon") ||
            !matchesFilters(item, {
              mode: args.mode,
              range,
              fase: args.fase,
              urgencia: args.urgencia,
              cubreFacturaCompleta: args.cubreFacturaCompleta,
              responsable: args.responsable,
              kpi: args.kpi,
              nowMs,
              viewerUserId: args.viewerUserId,
              isAccounting: visibility.isAccounting,
            })
          ) {
            continue;
          }
          matching.push(item);
        }

        if (ownerPage.isDone) {
          empresaIndex += 1;
          ownerCursor = null;
        } else {
          ownerCursor = ownerPage.continueCursor;
        }
      }

      const page = (await Promise.all(matching.map((item) => hydrateItem(ctx, item)))).filter(
        (item): item is NonNullable<typeof item> => item !== null
      );
      const isDone = empresaIndex >= args.empresas.length;
      return {
        page,
        isDone,
        continueCursor: isDone
          ? ""
          : JSON.stringify({
              empresaIndex,
              cursor: ownerCursor,
            } satisfies DashboardCursor),
      };
    }

    const empresa = args.empresas[decoded.empresaIndex];
    if (empresa === undefined) return { page: [], isDone: true, continueCursor: "" };
    const visibility = await getCompanyVisibility(ctx, empresa, args.viewerUserId);
    const pagination = { numItems: pageSize, cursor: decoded.cursor };
    const source =
      search && search.length >= 2
        ? await ctx.db
            .query("anticiposDashboardItems")
            .withSearchIndex("search_identity", (q) =>
              q.search("searchText", search).eq("empresa", empresa)
            )
            .paginate(pagination)
        : await ctx.db
            .query("anticiposDashboardItems")
            .withIndex("by_empresa_createdAt", (q) => q.eq("empresa", empresa))
            .order("desc")
            .paginate(pagination);

    const matching = source.page.filter(
      (item) =>
        matchesVisibility(item, args.viewerUserId, visibility, args.scope) &&
        matchesFilters(item, {
          mode: args.mode,
          range,
          fase: args.fase,
          urgencia: args.urgencia,
          cubreFacturaCompleta: args.cubreFacturaCompleta,
          responsable: args.responsable,
          kpi: args.kpi,
          nowMs,
          viewerUserId: args.viewerUserId,
          isAccounting: visibility.isAccounting,
        })
    );
    const page = (await Promise.all(matching.map((item) => hydrateItem(ctx, item)))).filter(
      (item): item is NonNullable<typeof item> => item !== null
    );
    const nextEmpresaIndex = source.isDone ? decoded.empresaIndex + 1 : decoded.empresaIndex;
    const isDone = source.isDone && nextEmpresaIndex >= args.empresas.length;
    return {
      page,
      isDone,
      continueCursor: isDone
        ? ""
        : JSON.stringify({
            empresaIndex: nextEmpresaIndex,
            cursor: source.isDone ? null : source.continueCursor,
          } satisfies DashboardCursor),
    };
  },
});

function emptyMetric() {
  return { count: 0, amount: 0 };
}

function incrementMetric(metric: { count: number; amount: number }, amount: number) {
  metric.count += 1;
  metric.amount += amount;
}

function weekStart(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const value = Date.UTC(year!, month! - 1, day!);
  const dow = new Date(value).getUTCDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  return new Date(value + mondayOffset * 86_400_000).toISOString().slice(0, 10);
}

export const resumen = query({
  args: {
    secret: v.string(),
    empresas: v.array(v.number()),
    viewerUserId: v.string(),
    preset: v.optional(v.string()),
    from: v.optional(v.string()),
    to: v.optional(v.string()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.secret);
    const nowMs = args.nowMs ?? Date.now();
    const range = resolveDateRange(args);
    const flow = {
      solicitado: emptyMetric(),
      aprobadoGerencia: emptyMetric(),
      desembolsado: emptyMetric(),
      legalizado: emptyMetric(),
    };
    const previousFlow = {
      solicitado: emptyMetric(),
      aprobadoGerencia: emptyMetric(),
      desembolsado: emptyMetric(),
      legalizado: emptyMetric(),
    };
    const rangeDuration =
      range.fromMs != null && range.toMsExclusive != null ? range.toMsExclusive - range.fromMs : 0;
    const previousFrom = range.fromMs != null ? range.fromMs - rangeDuration : null;
    const previousTo = range.fromMs;
    const backlog = {
      misPendientes: emptyMetric(),
      enAprobacion: emptyMetric(),
      porDesembolsar: emptyMetric(),
      porLegalizar: emptyMetric(),
      vencidos: emptyMetric(),
    };
    const alerts = {
      overdue: 0,
      dueSoon: 0,
      returned: 0,
      integrity: 0,
    };
    const trend = new Map<
      string,
      { solicitado: number; desembolsado: number; legalizado: number }
    >();

    for (const empresa of args.empresas) {
      const visibility = await getCompanyVisibility(ctx, empresa, args.viewerUserId);
      const items = await ctx.db
        .query("anticiposDashboardItems")
        .withIndex("by_empresa_createdAt", (q) => q.eq("empresa", empresa))
        .order("desc")
        .take(MAX_SUMMARY_ITEMS_PER_COMPANY);

      for (const item of items) {
        if (!matchesVisibility(item, args.viewerUserId, visibility, "visible")) continue;
        const inRange =
          range.fromMs != null && range.toMsExclusive != null
            ? item.createdAt >= range.fromMs && item.createdAt < range.toMsExclusive
            : true;
        if (inRange) {
          incrementMetric(flow.solicitado, item.valorNumerico);
          const week = weekStart(new Date(item.createdAt).toISOString().slice(0, 10));
          const weekly = trend.get(week) ?? { solicitado: 0, desembolsado: 0, legalizado: 0 };
          weekly.solicitado += 1;
          trend.set(week, weekly);
        } else if (
          previousFrom != null &&
          previousTo != null &&
          item.createdAt >= previousFrom &&
          item.createdAt < previousTo
        ) {
          incrementMetric(previousFlow.solicitado, item.valorNumerico);
        }
        if (
          item.gerenciaAprobadoEn &&
          range.fromMs != null &&
          range.toMsExclusive != null &&
          item.gerenciaAprobadoEn >= range.fromMs &&
          item.gerenciaAprobadoEn < range.toMsExclusive
        ) {
          incrementMetric(flow.aprobadoGerencia, item.valorContable);
        } else if (
          item.gerenciaAprobadoEn &&
          previousFrom != null &&
          previousTo != null &&
          item.gerenciaAprobadoEn >= previousFrom &&
          item.gerenciaAprobadoEn < previousTo
        ) {
          incrementMetric(previousFlow.aprobadoGerencia, item.valorContable);
        }
        if (
          item.desembolsadoEn &&
          range.fromMs != null &&
          range.toMsExclusive != null &&
          item.desembolsadoEn >= range.fromMs &&
          item.desembolsadoEn < range.toMsExclusive
        ) {
          incrementMetric(flow.desembolsado, item.valorContable);
          const week = weekStart(new Date(item.desembolsadoEn).toISOString().slice(0, 10));
          const weekly = trend.get(week) ?? { solicitado: 0, desembolsado: 0, legalizado: 0 };
          weekly.desembolsado += 1;
          trend.set(week, weekly);
        } else if (
          item.desembolsadoEn &&
          previousFrom != null &&
          previousTo != null &&
          item.desembolsadoEn >= previousFrom &&
          item.desembolsadoEn < previousTo
        ) {
          incrementMetric(previousFlow.desembolsado, item.valorContable);
        }
        if (
          item.legalizadoEn &&
          range.fromMs != null &&
          range.toMsExclusive != null &&
          item.legalizadoEn >= range.fromMs &&
          item.legalizadoEn < range.toMsExclusive
        ) {
          incrementMetric(flow.legalizado, item.valorContable);
          const week = weekStart(new Date(item.legalizadoEn).toISOString().slice(0, 10));
          const weekly = trend.get(week) ?? { solicitado: 0, desembolsado: 0, legalizado: 0 };
          weekly.legalizado += 1;
          trend.set(week, weekly);
        } else if (
          item.legalizadoEn &&
          previousFrom != null &&
          previousTo != null &&
          item.legalizadoEn >= previousFrom &&
          item.legalizadoEn < previousTo
        ) {
          incrementMetric(previousFlow.legalizado, item.valorContable);
        }

        if (!item.esActiva) continue;
        const amount = item.valorContable;
        if (
          item.asignadoA === args.viewerUserId ||
          (visibility.isAccounting && item.faseActual === "III_REVISION_CONTABILIDAD")
        ) {
          incrementMetric(backlog.misPendientes, amount);
        }
        if (
          [
            "II_APROBACION_JEFE_DIRECTO",
            "III_REVISION_CONTABILIDAD",
            "IV_APROBACION_GERENCIA",
          ].includes(item.faseActual)
        ) {
          incrementMetric(backlog.enAprobacion, amount);
        }
        if (item.faseActual === "IV_DESEMBOLSO_TESORERIA") {
          incrementMetric(backlog.porDesembolsar, amount);
        }
        if (item.faseActual === "V_PENDIENTE_LEGALIZACION") {
          incrementMetric(backlog.porLegalizar, item.saldoPendiente);
          const daysToDue = Math.ceil((item.maxLegalizacionDate - nowMs) / 86_400_000);
          if (daysToDue < 0) {
            incrementMetric(backlog.vencidos, item.saldoPendiente);
            alerts.overdue += 1;
          } else if (daysToDue <= 7) {
            alerts.dueSoon += 1;
          }
        }
        if (item.fueDevuelto) alerts.returned += 1;
        if (item.integrityIssues.length > 0) alerts.integrity += 1;
      }
    }

    return {
      generatedAt: nowMs,
      period: {
        preset: args.preset ?? "mes_actual",
        from: range.fromKey,
        to: range.toKey,
      },
      flow,
      previousFlow,
      backlog,
      alerts: [
        { kind: "overdue", label: "Legalizaciones vencidas", count: alerts.overdue },
        { kind: "due_soon", label: "Vencen en los próximos 7 días", count: alerts.dueSoon },
        { kind: "returned", label: "Solicitudes devueltas", count: alerts.returned },
        { kind: "integrity", label: "Asignaciones por revisar", count: alerts.integrity },
      ].filter((alert) => alert.count > 0),
      weeklyTrend: [...trend.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([week, values]) => ({ week, ...values })),
    };
  },
});

export const responsables = query({
  args: {
    secret: v.string(),
    empresas: v.array(v.number()),
    viewerUserId: v.string(),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.secret);
    const groups = new Map<
      string,
      {
        userId: string | null;
        nombre: string;
        rol: string;
        count: number;
        amount: number;
        oldestAssignmentAt: number | null;
      }
    >();
    for (const empresa of args.empresas) {
      const visibility = await getCompanyVisibility(ctx, empresa, args.viewerUserId);
      const rows = await ctx.db
        .query("anticiposDashboardResponsables")
        .withIndex("by_empresa_esActivo_fechaAsignacion", (q) =>
          q.eq("empresa", empresa).eq("esActivo", true)
        )
        .take(MAX_SUMMARY_ITEMS_PER_COMPANY);
      for (const row of rows) {
        const item = await ctx.db.get("anticiposDashboardItems", row.itemId);
        if (!item || !matchesVisibility(item, args.viewerUserId, visibility, "visible")) continue;
        const key = row.userId ?? `${row.rol}:${row.nombre}`;
        const current = groups.get(key) ?? {
          userId: row.userId ?? null,
          nombre: row.nombre,
          rol: row.rol,
          count: 0,
          amount: 0,
          oldestAssignmentAt: null,
        };
        current.count += 1;
        current.amount += row.valorContable;
        current.oldestAssignmentAt =
          current.oldestAssignmentAt == null
            ? row.fechaAsignacion
            : Math.min(current.oldestAssignmentAt, row.fechaAsignacion);
        groups.set(key, current);
      }
    }
    return [...groups.values()].sort(
      (a, b) => b.count - a.count || a.nombre.localeCompare(b.nombre)
    );
  },
});

export const bolsas = query({
  args: {
    secret: v.string(),
    empresas: v.array(v.number()),
    viewerUserId: v.string(),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.secret);
    const groups = new Map<
      string,
      {
        key: string;
        bolsaId: Id<"bolsasAnticipos"> | null;
        empresa: number;
        tipoBolsa: "general" | "peajes";
        procesoNombre: string;
        count: number;
        requested: number;
        accounting: number;
        legalized: number;
        legalizable: number;
        pending: number;
        overdue: number;
        recentItemIds: Id<"anticipos">[];
      }
    >();
    const now = Date.now();
    for (const empresa of args.empresas) {
      const visibility = await getCompanyVisibility(ctx, empresa, args.viewerUserId);
      const items = await ctx.db
        .query("anticiposDashboardItems")
        .withIndex("by_empresa_createdAt", (q) => q.eq("empresa", empresa))
        .order("desc")
        .take(MAX_SUMMARY_ITEMS_PER_COMPANY);
      for (const item of items) {
        if (!matchesVisibility(item, args.viewerUserId, visibility, "visible")) continue;
        const key = item.bolsaId
          ? String(item.bolsaId)
          : `${empresa}:${item.tipoBolsa}:${item.procesoId ?? item.procesoNombre ?? "sin-proceso"}`;
        const current = groups.get(key) ?? {
          key,
          bolsaId: item.bolsaId ?? null,
          empresa,
          tipoBolsa: item.tipoBolsa,
          procesoNombre:
            item.tipoBolsa === "peajes" ? "PEAJES" : (item.procesoNombre ?? "Sin proceso"),
          count: 0,
          requested: 0,
          accounting: 0,
          legalized: 0,
          legalizable: 0,
          pending: 0,
          overdue: 0,
          recentItemIds: [],
        };
        current.count += 1;
        current.requested += item.valorNumerico;
        current.accounting += item.valorContable;
        current.legalized += item.saldoLegalizado;
        current.legalizable += item.valorLegalizable;
        current.pending += item.saldoPendiente;
        if (item.faseActual === "V_PENDIENTE_LEGALIZACION" && item.maxLegalizacionDate < now) {
          current.overdue += 1;
        }
        if (current.recentItemIds.length < 5) current.recentItemIds.push(item.anticipoId);
        groups.set(key, current);
      }
    }

    return await Promise.all(
      [...groups.values()]
        .sort((a, b) => b.pending - a.pending || a.procesoNombre.localeCompare(b.procesoNombre))
        .slice(0, 100)
        .map(async (group) => ({
          ...group,
          recentItems: await Promise.all(
            group.recentItemIds.map(async (anticipoId) => {
              const anticipo = await ctx.db.get("anticipos", anticipoId);
              if (!anticipo) return null;
              const legalizaciones = await ctx.db
                .query("facturacionAnticipoLegalizaciones")
                .withIndex("by_anticipoId_estado", (q) =>
                  q.eq("anticipoId", anticipoId).eq("estado", "activa")
                )
                .take(5);
              return {
                anticipoId,
                consecutivo: anticipo.consecutivo,
                razonSocial: anticipo.razonSocial,
                faseActual: anticipo.faseActual,
                valorContable: anticipo.valorContable ?? anticipo.valorNumerico,
                valorLegalizable:
                  anticipo.valorLegalizableActual ??
                  anticipo.valorContable ??
                  anticipo.valorNumerico,
                saldoLegalizado: anticipo.saldoLegalizado ?? 0,
                saldoPendiente: Math.max(
                  0,
                  (anticipo.valorLegalizableActual ??
                    anticipo.valorContable ??
                    anticipo.valorNumerico) - (anticipo.saldoLegalizado ?? 0)
                ),
                facturas: await Promise.all(
                  legalizaciones.map(async (row) => {
                    const factura = await ctx.db.get("facturacionFacturas", row.facturaId);
                    return {
                      facturaId: row.facturaId,
                      numeroFactura: factura?.numeroFactura ?? String(row.facturaId),
                      valorAplicado: row.valorAplicado,
                    };
                  })
                ),
              };
            })
          ).then((items) =>
            items.filter((item): item is NonNullable<typeof item> => item !== null)
          ),
        }))
    );
  },
});

export const bolsaItems = query({
  args: {
    secret: v.string(),
    bolsaId: v.id("bolsasAnticipos"),
    empresas: v.array(v.number()),
    viewerUserId: v.string(),
    q: v.optional(v.string()),
    estado: v.optional(bagStatusArg),
    orden: v.optional(bagSortArg),
    pageSize: v.optional(v.number()),
    cursor: v.optional(v.string()),
    nowMs: v.optional(v.number()),
  },
  returns: v.union(
    v.object({
      summary: bagSummaryValidator,
      page: v.array(bagItemRowValidator),
      isDone: v.boolean(),
      continueCursor: v.string(),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    requireServerSecret(args.secret);
    const bolsa = await ctx.db.get("bolsasAnticipos", args.bolsaId);
    if (!bolsa || !args.empresas.includes(bolsa.empresa)) return null;

    const visibility = await getCompanyVisibility(ctx, bolsa.empresa, args.viewerUserId);
    const nowMs = args.nowMs ?? Date.now();
    const estado = args.estado ?? "pending";
    const orden = args.orden ?? "priority";
    const pageSize = Math.min(Math.max(args.pageSize ?? BAG_DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
    const search = normalizeSearchQuery(args.q);
    const decoded = decodeBagItemsCursor(args.cursor);

    const sourceRows = await ctx.db
      .query("anticiposDashboardItems")
      .withIndex("by_bolsaId_createdAt", (q) => q.eq("bolsaId", args.bolsaId))
      .order("desc")
      .take(MAX_BOLSA_ITEMS_SCAN + 1);
    const summaryComplete = sourceRows.length <= MAX_BOLSA_ITEMS_SCAN;
    const scannedRows = sourceRows.slice(0, MAX_BOLSA_ITEMS_SCAN);

    const visibleRows = scannedRows.filter((item) =>
      matchesVisibility(item, args.viewerUserId, visibility, "visible")
    );

    const summary = {
      bolsaId: args.bolsaId,
      empresa: bolsa.empresa,
      tipoBolsa: bolsa.tipoBolsa,
      procesoNombre:
        bolsa.tipoBolsa === "peajes" ? "PEAJES" : (bolsa.procesoNombre ?? "Sin proceso"),
      count: 0,
      requested: 0,
      accounting: 0,
      legalizable: 0,
      legalized: 0,
      pending: 0,
      overdue: 0,
      pendingCount: 0,
      legalizedCount: 0,
      summaryComplete,
    };

    for (const item of visibleRows) {
      summary.count += 1;
      summary.requested += item.valorNumerico;
      summary.accounting += item.valorContable;
      summary.legalizable += item.valorLegalizable;
      summary.legalized += item.saldoLegalizado;
      summary.pending += item.saldoPendiente;
      if (isBagItemOverdue(item, nowMs)) summary.overdue += 1;
      if (isBagItemPending(item)) summary.pendingCount += 1;
      if (isBagItemLegalized(item)) summary.legalizedCount += 1;
    }

    let filteredRows = visibleRows.filter((item) => matchesBagStatus(item, estado, nowMs));
    if (search && search.length >= 2) {
      filteredRows = filteredRows.filter((item) => item.searchText.includes(search));
    }
    const sortedRows = sortBagItems(filteredRows, orden, nowMs);
    const pageRows = sortedRows.slice(decoded.offset, decoded.offset + pageSize);
    const nextOffset = decoded.offset + pageRows.length;
    const isDone = nextOffset >= sortedRows.length;

    return {
      summary,
      page: await Promise.all(pageRows.map((item) => buildBagItemRow(ctx, item, nowMs))),
      isDone,
      continueCursor: isDone ? "" : encodeBagItemsCursor(nextOffset),
    };
  },
});

export const refrescarProyeccion = internalMutation({
  args: { anticipoId: v.id("anticipos"), nowMs: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await refreshAnticipoDashboardProjection(ctx, args.anticipoId, args.nowMs);
    return null;
  },
});

/** Internal only: run from the Convex dashboard / CLI (`npx convex run`). */
export const iniciarBackfill = internalMutation({
  args: { reiniciar: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("anticiposDashboardBackfills")
      .withIndex("by_clave", (q) => q.eq("clave", BACKFILL_KEY))
      .unique();
    if (existing?.estado === "running" && !args.reiniciar) {
      return { estado: existing.estado, procesadas: existing.procesadas };
    }
    if (existing) {
      await ctx.db.patch("anticiposDashboardBackfills", existing._id, {
        estado: "running",
        cursor: null,
        procesadas: 0,
        lotes: 0,
        iniciadoEn: now,
        completadoEn: undefined,
        actualizadoEn: now,
        error: undefined,
      });
    } else {
      await ctx.db.insert("anticiposDashboardBackfills", {
        clave: BACKFILL_KEY,
        estado: "running",
        cursor: null,
        procesadas: 0,
        lotes: 0,
        iniciadoEn: now,
        actualizadoEn: now,
      });
    }
    await ctx.scheduler.runAfter(0, internal.anticiposDashboard.ejecutarBackfillLote, {});
    return { estado: "running", procesadas: 0 };
  },
});

export const estadoBackfill = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("anticiposDashboardBackfills")
      .withIndex("by_clave", (q) => q.eq("clave", BACKFILL_KEY))
      .unique();
  },
});

export const ejecutarBackfillLote = internalMutation({
  args: {},
  handler: async (ctx) => {
    const state = await ctx.db
      .query("anticiposDashboardBackfills")
      .withIndex("by_clave", (q) => q.eq("clave", BACKFILL_KEY))
      .unique();
    if (!state || state.estado !== "running") return null;
    try {
      const page = await ctx.db.query("anticipos").paginate({
        numItems: BACKFILL_BATCH_SIZE,
        cursor: state.cursor,
      });
      const now = Date.now();
      for (const anticipo of page.page) {
        await refreshAnticipoDashboardProjection(ctx, anticipo._id, now);
      }
      await ctx.db.patch("anticiposDashboardBackfills", state._id, {
        cursor: page.isDone ? null : page.continueCursor,
        procesadas: state.procesadas + page.page.length,
        lotes: state.lotes + 1,
        estado: page.isDone ? "completed" : "running",
        completadoEn: page.isDone ? now : undefined,
        actualizadoEn: now,
      });
      if (!page.isDone) {
        await ctx.scheduler.runAfter(0, internal.anticiposDashboard.ejecutarBackfillLote, {});
      }
    } catch (error) {
      await ctx.db.patch("anticiposDashboardBackfills", state._id, {
        estado: "failed",
        actualizadoEn: Date.now(),
        error: error instanceof Error ? error.message : "Error desconocido",
      });
    }
    return null;
  },
});

export const reconciliarProyecciones = internalMutation({
  args: {
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const page = await ctx.db.query("anticipos").paginate({
      numItems: Math.min(Math.max(args.limit ?? BACKFILL_BATCH_SIZE, 1), BACKFILL_BATCH_SIZE),
      cursor: args.cursor ?? null,
    });
    const now = args.nowMs ?? Date.now();
    for (const anticipo of page.page) {
      await refreshAnticipoDashboardProjection(ctx, anticipo._id, now);
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.anticiposDashboard.reconciliarProyecciones, {
        cursor: page.continueCursor,
        limit: args.limit,
        nowMs: now,
      });
    }
    return {
      processed: page.page.length,
      continueCursor: page.isDone ? null : page.continueCursor,
      isDone: page.isDone,
    };
  },
});
