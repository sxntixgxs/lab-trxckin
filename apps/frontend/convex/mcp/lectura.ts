import { v } from "convex/values";
import { query, type QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { EMPRESAS_MAP } from "../../lib/empresas";
import { computeSlaState, isSlaPhase, SLA_PHASE_LABELS } from "../lib/facturacionBusinessTime";
import { empresasMcp, requireMcpSecret, resolverEmpresaMcp } from "../lib/mcpScope";
import { normalizePeajesDocumentNumber, normalizePeajesProviderNit } from "../lib/peajes";
import {
  getSaldoLegalizadoAnticipo,
  getSaldoPendienteLegalizableAnticipo,
  getValorLegalizableAnticipo,
} from "../lib/valorLegalizableAnticipo";

/**
 * Read-only queries for apps/mcp-server. Every function checks `MCP_READ_SECRET` and reads
 * only the companies in `MCP_EMPRESAS` (see lib/mcpScope.ts); nothing here writes.
 *
 * Outputs are deliberately small: the fields an agent needs to answer, not whole documents.
 * The caller passes `nowMs` because queries must not read the clock.
 */

/** Active invoices scanned per company when listing pending approvals. */
const ESCANEO_PENDIENTES_MAX = 500;
const LIMITE_MAX = 25;

const FASE_ETIQUETAS: Record<string, string> = {
  ...SLA_PHASE_LABELS,
  jefe_directo: "Jefe directo",
  pendiente_nota_credito: "Pendiente nota crédito",
  reembolso_caja_menor: "Reembolso caja menor",
  aceptada: "Aceptada",
  pagada: "Pagada",
  legalizada: "Legalizada",
  cerrada: "Cerrada",
  rechazada: "Rechazada",
  rechazada_dian: "Rechazada DIAN",
  nota_credito_cerrada: "Nota crédito cerrada",
};

const slaValidator = v.object({
  estado: v.union(v.literal("healthy"), v.literal("warning"), v.literal("breached")),
  umbralDiasLaborales: v.number(),
  diasLaboralesEnFase: v.number(),
  diasLaboralesRestantes: v.number(),
  venceEn: v.string(),
});

const facturaResumenValidator = v.object({
  facturaId: v.id("facturacionFacturas"),
  empresa: v.number(),
  numeroFactura: v.string(),
  proveedor: v.object({ nit: v.string(), nombre: v.string() }),
  valorAPagar: v.number(),
  moneda: v.string(),
  fechaEmision: v.string(),
  fase: v.string(),
  faseEtiqueta: v.string(),
  activa: v.boolean(),
  enFaseDesde: v.union(v.string(), v.null()),
  responsables: v.array(v.object({ nombre: v.string(), email: v.string(), rol: v.string() })),
  sla: v.union(slaValidator, v.null()),
});

type FacturaResumen = typeof facturaResumenValidator.type;

const redondear = (valor: number) => Math.round(valor * 10) / 10;
const iso = (ms: number | undefined) => (ms ? new Date(ms).toISOString() : null);
const sinAcentos = (valor: string) =>
  valor.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

function limite(valor: number | undefined, porDefecto: number) {
  return Math.min(Math.max(Math.trunc(valor ?? porDefecto), 1), LIMITE_MAX);
}

/** SLA recomputed at `nowMs` from the dashboard row (the stored slaEstado can be hours old). */
function slaDe(item: Doc<"facturacionDashboardItems">, nowMs: number): FacturaResumen["sla"] {
  const sla = computeSlaState({
    faseIniciadaEn: item.faseIniciadaEn,
    umbralDiasLaborales: item.slaUmbralDias,
    nowMs,
    esActiva: item.esActiva && isSlaPhase(item.faseActual),
  });
  if (sla.estado === "n_a" || sla.estado === "sin_sla" || !sla.umbralDias || !sla.venceEn) {
    return null;
  }
  return {
    estado: sla.estado,
    umbralDiasLaborales: sla.umbralDias,
    diasLaboralesEnFase: redondear(sla.edadDiasLaborales),
    diasLaboralesRestantes: redondear(sla.umbralDias - sla.edadDiasLaborales),
    venceEn: new Date(sla.venceEn).toISOString(),
  };
}

async function responsablesDe(ctx: QueryCtx, item: Doc<"facturacionDashboardItems">) {
  const filas = await ctx.db
    .query("facturacionDashboardResponsables")
    .withIndex("by_itemId", (q) => q.eq("itemId", item._id))
    .take(10);
  return filas
    .filter((fila) => fila.esActiva)
    .map((fila) => ({ nombre: fila.nombre, email: fila.email, rol: fila.rol }));
}

function resumen(
  item: Doc<"facturacionDashboardItems">,
  responsables: FacturaResumen["responsables"],
  nowMs: number
): FacturaResumen {
  return {
    facturaId: item.facturaId,
    empresa: item.empresa,
    numeroFactura: item.numeroFactura,
    proveedor: { nit: item.proveedorNit, nombre: item.proveedorNombre },
    valorAPagar: item.valorAPagar ?? item.valorContable,
    moneda: item.moneda,
    fechaEmision: item.fechaEmision,
    fase: item.faseActual,
    faseEtiqueta: FASE_ETIQUETAS[item.faseActual] ?? item.faseActual,
    activa: item.esActiva,
    enFaseDesde: item.esActiva ? iso(item.faseIniciadaEn) : null,
    responsables,
    sla: slaDe(item, nowMs),
  };
}

async function itemDeFactura(ctx: QueryCtx, factura: Doc<"facturacionFacturas">) {
  return await ctx.db
    .query("facturacionDashboardItems")
    .withIndex("by_facturaId", (q) => q.eq("facturaId", factura._id))
    .unique();
}

/** Companies this MCP server may read (the `lab://companies` resource). */
export const empresas = query({
  args: { secret: v.string() },
  returns: v.array(v.object({ id: v.number(), nombre: v.string(), nit: v.string() })),
  handler: async (_ctx, args) => {
    requireMcpSecret(args.secret);
    return empresasMcp().map((id) => ({
      id,
      nombre: EMPRESAS_MAP[id].nombre,
      nit: EMPRESAS_MAP[id].nit,
    }));
  },
});

/**
 * Where an invoice is in the approval workflow: phase, current owners and SLA in Colombian
 * business days. Look it up by id, or by number (optionally narrowed by supplier NIT).
 * Invoices outside the scope read as not found.
 */
export const estadoFactura = query({
  args: {
    secret: v.string(),
    nowMs: v.number(),
    facturaId: v.optional(v.string()),
    numeroFactura: v.optional(v.string()),
    proveedorNit: v.optional(v.string()),
    empresa: v.optional(v.number()),
  },
  returns: v.object({ facturas: v.array(facturaResumenValidator) }),
  handler: async (ctx, args) => {
    requireMcpSecret(args.secret);
    const permitidas = empresasMcp();

    let facturas: Doc<"facturacionFacturas">[] = [];
    if (args.facturaId) {
      const id = ctx.db.normalizeId("facturacionFacturas", args.facturaId);
      const factura = id ? await ctx.db.get("facturacionFacturas", id) : null;
      if (factura) facturas = [factura];
    } else {
      const numero = normalizePeajesDocumentNumber(args.numeroFactura);
      if (!numero) throw new Error("Indica facturaId o numeroFactura.");
      const empresas =
        args.empresa === undefined ? permitidas : [resolverEmpresaMcp(args.empresa, permitidas)];
      for (const empresa of empresas) {
        facturas.push(
          ...(await ctx.db
            .query("facturacionFacturas")
            .withIndex("by_empresa_numeroFacturaNormalizado", (q) =>
              q.eq("empresa", empresa).eq("numeroFacturaNormalizado", numero)
            )
            .take(10))
        );
      }
      // The NIT may come with its check digit ("901.555.222-8"); the number is already
      // narrowed, so also accepting the digits minus the last one is safe.
      const nit = normalizePeajesProviderNit(args.proveedorNit);
      if (nit) {
        facturas = facturas.filter((factura) => {
          const propio = factura.proveedorNitNormalizado ?? normalizePeajesProviderNit(factura.proveedorNit);
          return propio === nit || propio === nit.slice(0, -1);
        });
      }
    }

    const resultado: FacturaResumen[] = [];
    for (const factura of facturas) {
      if (factura.empresa === undefined || !permitidas.includes(factura.empresa)) continue;
      const item = await itemDeFactura(ctx, factura);
      if (!item) continue;
      resultado.push(resumen(item, await responsablesDe(ctx, item), args.nowMs));
      if (resultado.length === 5) break;
    }
    return { facturas: resultado };
  },
});

/**
 * Invoices waiting in an approval phase, oldest in their phase first. Optional filters: an
 * owner (email or part of the name) and a supplier (part of the name or NIT).
 */
export const aprobacionesPendientes = query({
  args: {
    secret: v.string(),
    nowMs: v.number(),
    empresa: v.optional(v.number()),
    responsable: v.optional(v.string()),
    proveedor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    empresa: v.number(),
    facturas: v.array(facturaResumenValidator),
    hayMas: v.boolean(),
    escaneoTruncado: v.boolean(),
  }),
  handler: async (ctx, args) => {
    requireMcpSecret(args.secret);
    const empresa = resolverEmpresaMcp(args.empresa);
    const max = limite(args.limit, 10);

    const activas = await ctx.db
      .query("facturacionDashboardItems")
      .withIndex("by_empresa_esActiva_grupoFase", (q) =>
        q.eq("empresa", empresa).eq("esActiva", true)
      )
      .take(ESCANEO_PENDIENTES_MAX);

    const proveedor = args.proveedor ? sinAcentos(args.proveedor) : "";
    const proveedorDigitos = proveedor.replace(/\D/g, "");
    const candidatas = activas
      .filter((item) => item.tipoFlujo !== "peaje")
      .filter(
        (item) =>
          !proveedor ||
          sinAcentos(item.proveedorNombre).includes(proveedor) ||
          (proveedorDigitos.length >= 3 && item.proveedorNit.includes(proveedorDigitos))
      )
      .sort((a, b) => (a.faseIniciadaEn ?? Infinity) - (b.faseIniciadaEn ?? Infinity));

    const responsable = args.responsable ? sinAcentos(args.responsable) : "";
    const facturas: FacturaResumen[] = [];
    let hayMas = false;
    for (const item of candidatas) {
      const responsables = await responsablesDe(ctx, item);
      if (
        responsable &&
        !responsables.some(
          (r) => sinAcentos(r.email) === responsable || sinAcentos(r.nombre).includes(responsable)
        )
      ) {
        continue;
      }
      if (facturas.length === max) {
        hayMas = true;
        break;
      }
      facturas.push(resumen(item, responsables, args.nowMs));
    }

    return {
      empresa,
      facturas,
      hayMas,
      escaneoTruncado: activas.length === ESCANEO_PENDIENTES_MAX,
    };
  },
});

const anticipoResumenValidator = v.object({
  anticipoId: v.id("anticipos"),
  consecutivo: v.number(),
  empresa: v.number(),
  solicitante: v.object({ nombre: v.union(v.string(), v.null()), email: v.union(v.string(), v.null()) }),
  proveedor: v.object({ nit: v.string(), razonSocial: v.string() }),
  fase: v.string(),
  valorSolicitado: v.number(),
  valorLegalizable: v.number(),
  legalizado: v.number(),
  pendiente: v.number(),
  legalizaciones: v.number(),
  fechaLimiteLegalizacion: v.string(),
  legalizacionVencida: v.boolean(),
});

const empresaDeAnticipo = (anticipo: Doc<"anticipos">) => anticipo.empresa_id ?? anticipo.empresa;

/**
 * Balance of employee advances: requested, settled against invoices, and still pending.
 * Look up by id, by consecutive number, or every advance a requester (email) holds.
 */
export const saldoAnticipos = query({
  args: {
    secret: v.string(),
    nowMs: v.number(),
    empresa: v.optional(v.number()),
    anticipoId: v.optional(v.string()),
    consecutivo: v.optional(v.number()),
    solicitanteEmail: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    anticipos: v.array(anticipoResumenValidator),
    totalPendiente: v.number(),
  }),
  handler: async (ctx, args) => {
    requireMcpSecret(args.secret);
    const permitidas = empresasMcp();

    let anticipos: Doc<"anticipos">[] = [];
    if (args.anticipoId) {
      const id = ctx.db.normalizeId("anticipos", args.anticipoId);
      const anticipo = id ? await ctx.db.get("anticipos", id) : null;
      if (anticipo) anticipos = [anticipo];
    } else if (args.consecutivo !== undefined) {
      const consecutivo = args.consecutivo;
      anticipos = await ctx.db
        .query("anticipos")
        .withIndex("by_consecutivo", (q) => q.eq("consecutivo", consecutivo))
        .take(10);
    } else if (args.solicitanteEmail) {
      const empresa = resolverEmpresaMcp(args.empresa, permitidas);
      const email = sinAcentos(args.solicitanteEmail);
      const deEmpresa = await ctx.db
        .query("anticipos")
        .withIndex("by_empresa_id", (q) => q.eq("empresa_id", empresa))
        .order("desc")
        .take(300);
      anticipos = deEmpresa.filter((a) => sinAcentos(a.solicitanteEmail ?? "") === email);
    } else {
      throw new Error("Indica anticipoId, consecutivo o solicitanteEmail.");
    }

    const resultado = anticipos
      .filter((anticipo) => {
        const empresa = empresaDeAnticipo(anticipo);
        return empresa !== undefined && permitidas.includes(empresa);
      })
      .slice(0, limite(args.limit, 10))
      .map((anticipo) => {
        const pendiente = getSaldoPendienteLegalizableAnticipo(anticipo);
        const cerrado = ["COMPLETADO", "RECHAZADO", "ANULADO", "VI_LEGALIZADO"].includes(anticipo.faseActual);
        return {
          anticipoId: anticipo._id,
          consecutivo: anticipo.consecutivo,
          empresa: empresaDeAnticipo(anticipo) ?? 0,
          solicitante: {
            nombre: anticipo.solicitanteNombre ?? null,
            email: anticipo.solicitanteEmail ?? null,
          },
          proveedor: { nit: anticipo.nit, razonSocial: anticipo.razonSocial },
          fase: anticipo.faseActual,
          valorSolicitado: anticipo.valorNumerico,
          valorLegalizable: getValorLegalizableAnticipo(anticipo),
          legalizado: getSaldoLegalizadoAnticipo(anticipo),
          pendiente,
          legalizaciones: anticipo.legalizacion.length,
          fechaLimiteLegalizacion: new Date(anticipo.maxLegalizacionDate).toISOString(),
          legalizacionVencida: !cerrado && pendiente > 0 && args.nowMs > anticipo.maxLegalizacionDate,
        };
      });

    return {
      anticipos: resultado,
      totalPendiente: resultado.reduce((suma, a) => suma + a.pendiente, 0),
    };
  },
});
