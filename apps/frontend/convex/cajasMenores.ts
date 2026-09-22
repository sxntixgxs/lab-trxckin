import { defineTable } from "convex/server";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
// actor* args are overwritten with the authenticated caller (see lib/serverActor.ts).
import { mutationConActor as mutation, queryConActor as query } from "./lib/serverActor";
import {
  assertCentrosCostoIdentityTransitionForEmpresa,
  type CentroCostoDistribucionRow,
  centrosCostoDistribucionValidator,
  resolveCentrosCostoFromInput,
  roundCOP,
} from "./lib/centrosCostoDistribucion";
import { EMPRESAS_MAP } from "../lib/empresas";
import { refrescarProyeccionFactura } from "./lib/facturacionDashboardProjection";
import { recomputeReembolsoCausacionCounts } from "./facturacionCausacion";
import { aplicarCausacionEnFactura } from "./lib/facturacionCausacionApply";
import { programarRefrescoProyeccionCajaMenor } from "./lib/cajaMenorProjection";
import {
  buildCajaMenorContexto,
  destinatarioFromReembolsoEstado,
  type CajaMenorContexto,
  type CajaMenorDestinatario,
} from "./lib/cajaMenorAuditoria";
import {
  insertMovimientoConBandeja,
  insertReembolsoConBandeja,
  patchMovimientoConBandeja,
  patchReembolsoConBandeja,
} from "./lib/cajaMenorBandeja";
import {
  getPermisosEmpresa,
  puedeObservarReembolsoActivo,
  resolveCajaVisibilityMode,
} from "./lib/cajaMenorReembolsoPermisos";
import { fallbackContactEmail } from "./lib/env";
import { normalizeEmail, normalizeEmpresa } from "./lib/normalize";

const ADMIN_ROLES = new Set([1, 99]);
const DEFAULT_EMPRESA = 1;

type ValorContableCambio = {
  valorAnterior: number;
  valorNuevo: number;
  moneda: string;
};

const usuarioConfigArg = v.object({
  userId: v.string(),
  nombre: v.string(),
  email: v.string(),
});

const actorArg = {
  actorUserId: v.string(),
  actorNombre: v.string(),
  actorEmail: v.string(),
  actorRol: v.optional(v.number()),
};

const cajaMenorMovimientoInputArg = {
  cajaMenorId: v.id("cajasMenores"),
  nit: v.optional(v.string()),
  nombreEmpresa: v.string(),
  concepto: v.string(),
  fechaPago: v.string(),
  valor: v.number(),
  centroCostoId: v.optional(v.string()),
  centroCostoCodigo: v.string(),
  centroCostoNombre: v.string(),
  centrosCostoDistribucion: v.optional(centrosCostoDistribucionValidator),
  observaciones: v.optional(v.string()),
};

type CajaMenorMovimientoInput = {
  cajaMenorId: Id<"cajasMenores">;
  nit?: string;
  nombreEmpresa: string;
  concepto: string;
  fechaPago: string;
  valor: number;
  centroCostoId?: string;
  centroCostoCodigo: string;
  centroCostoNombre: string;
  centrosCostoDistribucion?: CentroCostoDistribucionRow[];
  observaciones?: string;
};

type Actor = {
  actorUserId?: string;
  actorNombre: string;
  actorEmail: string;
};

type MovimientoCajaMenorEstado = "pendiente_reembolso" | "en_reembolso" | "reembolsado" | "anulado";

function getStoredCentrosCostoIdentities(source: {
  centroCostoId?: string;
  centroCostoCodigo?: string;
  centroCostoNombre?: string;
  centrosCostoDistribucion?: CentroCostoDistribucionRow[];
}) {
  if (source.centrosCostoDistribucion?.length) {
    return source.centrosCostoDistribucion;
  }

  const centroCostoCodigo = source.centroCostoCodigo?.trim();
  const centroCostoNombre = source.centroCostoNombre?.trim();
  if (!centroCostoCodigo || !centroCostoNombre) return [];

  return [
    {
      centroCostoId: source.centroCostoId,
      centroCostoCodigo,
      centroCostoNombre,
    },
  ];
}

const REEMBOLSO_ESTADOS_SEGUIMIENTO_ACTIVO = [
  "pendiente_aprobacion_lider",
  "pendiente_revision",
  "pendiente_revision_impuestos",
  "pendiente_eventos_dian",
  "pendiente_aprobacion",
  "pendiente_pago_tesoreria",
] as const;

type ReembolsoEstadoSeguimientoActivo = (typeof REEMBOLSO_ESTADOS_SEGUIMIENTO_ACTIVO)[number];

function isReembolsoEstadoSeguimientoActivo(
  estado: string
): estado is ReembolsoEstadoSeguimientoActivo {
  return (REEMBOLSO_ESTADOS_SEGUIMIENTO_ACTIVO as readonly string[]).includes(estado);
}

function formatCentroCostoDistribucionAuditLine(row: CentroCostoDistribucionRow) {
  const codigo = row.centroCostoCodigo?.trim() || "?";
  const nombre = row.centroCostoNombre?.trim() || "?";
  const valor =
    row.valor !== undefined ? ` valor ${roundCOP(row.valor)}` : "";
  return `${codigo} ${nombre}${valor}`;
}

function formatCentroCostoCajaMenorAuditComentario(
  previous: CentroCostoDistribucionRow[],
  next: CentroCostoDistribucionRow[]
) {
  const anterior =
    previous.length > 0
      ? previous.map(formatCentroCostoDistribucionAuditLine).join("; ")
      : "sin asignar";
  const nuevo =
    next.length > 0
      ? next.map(formatCentroCostoDistribucionAuditLine).join("; ")
      : "sin asignar";
  return `Centro de costo Caja Menor actualizado: ${anterior} → ${nuevo}`;
}

function centrosCostoDistribucionEquals(
  previous: CentroCostoDistribucionRow[],
  next: CentroCostoDistribucionRow[]
) {
  if (previous.length !== next.length) return false;
  return previous.every((row, index) => {
    const other = next[index];
    if (!other) return false;
    return (
      (row.centroCostoId ?? "") === (other.centroCostoId ?? "") &&
      (row.centroCostoCodigo ?? "").trim() === (other.centroCostoCodigo ?? "").trim() &&
      (row.centroCostoNombre ?? "").trim() === (other.centroCostoNombre ?? "").trim() &&
      roundCOP(row.valor ?? 0) === roundCOP(other.valor ?? 0)
    );
  });
}

function getEmpresaNombre(empresa: number) {
  return EMPRESAS_MAP[empresa]?.nombreCorto ?? `Empresa ${empresa}`;
}

function isPdfFile(nombre?: string, mimeType?: string) {
  return (
    mimeType?.trim().toLowerCase() === "application/pdf" ||
    Boolean(nombre?.trim().toLowerCase().endsWith(".pdf"))
  );
}

type NotificacionDestinatario = {
  usuarioId?: string;
  nombre: string;
  email: string;
};

function isAdminRol(actorRol?: number) {
  return typeof actorRol === "number" && ADMIN_ROLES.has(actorRol);
}

export const cajasMenores = defineTable({
  empresa_id: v.number(),
  nombre: v.string(),
  assignedValue: v.number(),
  assignedValueLetras: v.string(),
  assignedUsersIds: v.array(v.string()),
  observations: v.optional(v.string()),
  estado: v.optional(v.union(v.literal("activa"), v.literal("cerrada"), v.literal("anulado"))),
  createdAt: v.optional(v.number()),
  createdByUserId: v.optional(v.string()),
  updatedAt: v.number(),
  updatedByUserId: v.string(),
  lastRefillDate: v.optional(v.number()),
})
  .index("by_empresa_id", ["empresa_id"])
  .index("by_nombre", ["nombre"])
  .index("by_assignedValue", ["assignedValue"]);

export const cajasMenoresRefills = defineTable({
  cajaMenorId: v.id("cajasMenores"),
  refillDate: v.number(),
  refillValue: v.number(),
  refillValueLetras: v.string(),
  refillObservations: v.optional(v.string()),
  refillByUserId: v.string(),
  refillToUserId: v.string(),
  receiptConfirmed: v.boolean(),
  receiptConfirmedDate: v.optional(v.number()),
  receiptConfirmedByUserId: v.optional(v.string()),
})
  .index("by_cajaMenorId", ["cajaMenorId"])
  .index("by_refillDate", ["refillDate"]);

export const cajasMenoresRolesConfig = defineTable({
  empresa: v.number(),
  rol: v.literal("GERENCIA_FINANCIERA"),
  usuarios: v.array(usuarioConfigArg),
  updatedAt: v.number(),
  updatedByUserId: v.optional(v.string()),
  updatedByNombre: v.optional(v.string()),
})
  .index("by_empresa", ["empresa"])
  .index("by_empresa_rol", ["empresa", "rol"]);

export const cajasMenoresConfig = defineTable({
  empresa: v.number(),
  permitirSaldoNegativo: v.boolean(),
  updatedAt: v.number(),
  updatedByUserId: v.string(),
  updatedByNombre: v.string(),
}).index("by_empresa", ["empresa"]);

export const facturacionCajaMenorMovimientos = defineTable({
  facturaId: v.id("facturacionFacturas"),
  cajaMenorId: v.id("cajasMenores"),
  reembolsoId: v.optional(v.id("cajasMenoresReembolsos")),
  origen: v.union(v.literal("factura_sistema"), v.literal("recibo_fisico")),
  estado: v.union(
    v.literal("pendiente_reembolso"),
    v.literal("en_reembolso"),
    v.literal("reembolsado"),
    v.literal("anulado")
  ),
  nit: v.optional(v.string()),
  nombreEmpresa: v.string(),
  concepto: v.string(),
  fechaPago: v.string(),
  valor: v.number(),
  centroCostoId: v.optional(v.string()),
  centroCostoCodigo: v.string(),
  centroCostoNombre: v.string(),
  centrosCostoDistribucion: v.optional(centrosCostoDistribucionValidator),
  observaciones: v.optional(v.string()),
  actorUserId: v.optional(v.string()),
  actorNombre: v.string(),
  actorEmail: v.string(),
  rechazoRevisorUserId: v.optional(v.string()),
  rechazoRevisorNombre: v.optional(v.string()),
  rechazoRevisorEmail: v.optional(v.string()),
  rechazoRevisorComentario: v.optional(v.string()),
  rechazoRevisorEn: v.optional(v.number()),
  creadoEn: v.number(),
  actualizadoEn: v.number(),
  disponibleEnBandeja: v.optional(v.boolean()),
  proyeccionBandejaVersion: v.optional(v.number()),
})
  .index("by_facturaId", ["facturaId"])
  .index("by_cajaMenorId", ["cajaMenorId"])
  .index("by_cajaMenorId_estado", ["cajaMenorId", "estado"])
  .index("by_reembolsoId", ["reembolsoId"])
  .index("by_estado", ["estado"])
  .index("by_cajaMenorId_disponibleEnBandeja_and_actualizadoEn", [
    "cajaMenorId",
    "disponibleEnBandeja",
    "actualizadoEn",
  ]);

const reembolsoFormatoSnapshotValidator = v.object({
  numeroReembolso: v.string(),
  empresa: v.number(),
  empresaNombre: v.string(),
  cajaMenorId: v.id("cajasMenores"),
  cajaNombre: v.string(),
  custodioUserId: v.string(),
  custodioNombre: v.string(),
  custodioEmail: v.string(),
  generadoEn: v.number(),
  valorTotal: v.number(),
  solicitudComentario: v.optional(v.string()),
  movimientos: v.array(
    v.object({
      movimientoId: v.id("facturacionCajaMenorMovimientos"),
      facturaId: v.id("facturacionFacturas"),
      numeroFactura: v.string(),
      proveedorNit: v.optional(v.string()),
      proveedorNombre: v.string(),
      concepto: v.string(),
      fechaPago: v.string(),
      centroCostoCodigo: v.string(),
      centroCostoNombre: v.string(),
      centrosCostoDistribucion: v.optional(centrosCostoDistribucionValidator),
      valor: v.number(),
    })
  ),
});

export const cajasMenoresReembolsoContadores = defineTable({
  empresa: v.number(),
  anio: v.number(),
  consecutivo: v.number(),
  updatedAt: v.number(),
}).index("by_empresa_anio", ["empresa", "anio"]);

export const cajasMenoresReembolsos = defineTable({
  cajaMenorId: v.id("cajasMenores"),
  movimientoIds: v.array(v.id("facturacionCajaMenorMovimientos")),
  valorTotal: v.number(),
  numeroReembolso: v.optional(v.string()),
  formatoSnapshot: v.optional(reembolsoFormatoSnapshotValidator),
  estado: v.union(
    v.literal("pendiente_aprobacion_lider"),
    v.literal("pendiente_revision"),
    v.literal("pendiente_revision_impuestos"),
    v.literal("pendiente_eventos_dian"),
    v.literal("pendiente_aprobacion"),
    v.literal("pendiente_pago_tesoreria"),
    v.literal("aprobado_pendiente_recibo"),
    v.literal("rechazado"),
    v.literal("recibido"),
    v.literal("anulado")
  ),
  liderAprobadorUserId: v.optional(v.string()),
  liderAprobadorNombre: v.optional(v.string()),
  liderAprobadorEmail: v.optional(v.string()),
  liderComentario: v.optional(v.string()),
  liderDecisionEn: v.optional(v.number()),
  reviewerUserId: v.optional(v.string()),
  reviewerNombre: v.optional(v.string()),
  reviewerEmail: v.optional(v.string()),
  reviewerComentario: v.optional(v.string()),
  reviewerDecisionEn: v.optional(v.number()),
  reviewAssignedUserId: v.optional(v.string()),
  reviewAssignedNombre: v.optional(v.string()),
  reviewAssignedEmail: v.optional(v.string()),
  reviewAssignedEn: v.optional(v.number()),
  reviewAssignedByUserId: v.optional(v.string()),
  reviewAssignedByNombre: v.optional(v.string()),
  reviewAssignmentComentario: v.optional(v.string()),
  contadorAsignadoUserId: v.optional(v.string()),
  contadorAsignadoNombre: v.optional(v.string()),
  contadorAsignadoEmail: v.optional(v.string()),
  contadorAsignadoEn: v.optional(v.number()),
  contadorAsignadoByUserId: v.optional(v.string()),
  contadorAsignadoByNombre: v.optional(v.string()),
  contadorAsignacionComentario: v.optional(v.string()),
  contadorUserId: v.optional(v.string()),
  contadorNombre: v.optional(v.string()),
  contadorEmail: v.optional(v.string()),
  contadorComentario: v.optional(v.string()),
  contadorDecisionEn: v.optional(v.number()),
  eventosDianAsignadoUserId: v.optional(v.string()),
  eventosDianAsignadoNombre: v.optional(v.string()),
  eventosDianAsignadoEmail: v.optional(v.string()),
  eventosDianAsignadoEn: v.optional(v.number()),
  eventosDianAsignadoByUserId: v.optional(v.string()),
  eventosDianAsignadoByNombre: v.optional(v.string()),
  eventosDianAsignacionComentario: v.optional(v.string()),
  eventosDianUserId: v.optional(v.string()),
  eventosDianNombre: v.optional(v.string()),
  eventosDianEmail: v.optional(v.string()),
  eventosDianComentario: v.optional(v.string()),
  eventosDianDecisionEn: v.optional(v.number()),
  gfAprobadorUserId: v.optional(v.string()),
  gfAprobadorNombre: v.optional(v.string()),
  gfAprobadorEmail: v.optional(v.string()),
  gfComentario: v.optional(v.string()),
  gfDecisionEn: v.optional(v.number()),
  /** When true, Revisor may resubmit directly to Gerencia after a GF return to revision. */
  permiteReenvioDirectoGerencia: v.optional(v.boolean()),
  /** Explicit GF return shortcut: revision = revisor may skip to GF; contabilidad = impuestos may skip Eventos DIAN. */
  retornoGerenciaPendienteEn: v.optional(
    v.union(v.literal("revision"), v.literal("contabilidad"))
  ),
  tesoreroUserId: v.optional(v.string()),
  tesoreroNombre: v.optional(v.string()),
  tesoreroEmail: v.optional(v.string()),
  comprobanteStorageId: v.optional(v.id("_storage")),
  comprobanteNombre: v.optional(v.string()),
  comprobanteMimeType: v.optional(v.string()),
  comprobanteCargadoEn: v.optional(v.number()),
  comprobanteCargadoPorUserId: v.optional(v.string()),
  comprobanteCargadoPorNombre: v.optional(v.string()),
  comprobanteCargadoPorEmail: v.optional(v.string()),
  comprobanteComentario: v.optional(v.string()),
  custodioUserId: v.string(),
  custodioNombre: v.string(),
  custodioEmail: v.string(),
  solicitudComentario: v.optional(v.string()),
  custodioComentario: v.optional(v.string()),
  recibidoEn: v.optional(v.number()),
  creadoEn: v.number(),
  actualizadoEn: v.number(),
  seguimientoActivo: v.optional(v.boolean()),
  responsableActualUserId: v.optional(v.string()),
  responsableActualNombre: v.optional(v.string()),
  responsableActualTipo: v.optional(
    v.union(
      v.literal("lider"),
      v.literal("revisor"),
      v.literal("contabilidad"),
      v.literal("eventos_dian"),
      v.literal("gerencia_financiera"),
      v.literal("tesoreria")
    )
  ),
  busquedaBandeja: v.optional(v.string()),
  proyeccionBandejaVersion: v.optional(v.number()),
  empresaId: v.optional(v.number()),
  causacionCausadasCount: v.optional(v.number()),
  causacionNoCausadasCount: v.optional(v.number()),
  causacionSinRegistroCount: v.optional(v.number()),
})
  .index("by_cajaMenorId", ["cajaMenorId"])
  .index("by_estado", ["estado"])
  .index("by_cajaMenorId_estado", ["cajaMenorId", "estado"])
  .index("by_custodioUserId_estado", ["custodioUserId", "estado"])
  .index("by_reviewAssignedUserId_estado", ["reviewAssignedUserId", "estado"])
  .index("by_contadorAsignadoUserId_estado", ["contadorAsignadoUserId", "estado"])
  .index("by_eventosDianAsignadoUserId_estado", ["eventosDianAsignadoUserId", "estado"])
  .index("by_liderAprobadorUserId_estado", ["liderAprobadorUserId", "estado"])
  .index("by_numeroReembolso", ["numeroReembolso"])
  .index("by_cajaMenorId_and_seguimientoActivo_and_actualizadoEn", [
    "cajaMenorId",
    "seguimientoActivo",
    "actualizadoEn",
  ])
  .index("by_cajaMenorId_and_seguimientoActivo_and_creadoEn", [
    "cajaMenorId",
    "seguimientoActivo",
    "creadoEn",
  ])
  .index("by_cajaMenorId_and_seguimientoActivo_and_valorTotal", [
    "cajaMenorId",
    "seguimientoActivo",
    "valorTotal",
  ])
  .index("by_custodioUserId_and_seguimientoActivo_and_cajaMenorId", [
    "custodioUserId",
    "seguimientoActivo",
    "cajaMenorId",
  ])
  .index("by_responsableActualUserId_and_seguimientoActivo_and_cajaMenorId", [
    "responsableActualUserId",
    "seguimientoActivo",
    "cajaMenorId",
  ])
  .index("by_seguimientoActivo_and_actualizadoEn", [
    "seguimientoActivo",
    "actualizadoEn",
  ])
  .index("by_empresaId_and_seguimientoActivo_and_actualizadoEn", [
    "empresaId",
    "seguimientoActivo",
    "actualizadoEn",
  ])
  .searchIndex("search_busquedaBandeja", {
    searchField: "busquedaBandeja",
    filterFields: [
      "cajaMenorId",
      "empresaId",
      "seguimientoActivo",
      "estado",
      "custodioUserId",
      "responsableActualUserId",
    ],
  });

export const cajasMenoresReembolsoAdjuntos = defineTable({
  reembolsoId: v.id("cajasMenoresReembolsos"),
  storageId: v.id("_storage"),
  nombre: v.string(),
  mimeType: v.optional(v.string()),
  etapa: v.union(
    v.literal("revision"),
    v.literal("contabilidad"),
    v.literal("eventos_dian"),
    v.literal("aprobacion"),
    v.literal("tesoreria")
  ),
  /** Missing estado is treated as confirmado (legacy rows). */
  estado: v.optional(v.union(v.literal("borrador"), v.literal("confirmado"))),
  actorUserId: v.optional(v.string()),
  actorNombre: v.string(),
  actorEmail: v.string(),
  eventoId: v.optional(v.id("cajasMenoresReembolsoEventos")),
  creadoEn: v.number(),
}).index("by_reembolsoId", ["reembolsoId"]);

export const cajasMenoresReembolsoEventos = defineTable({
  reembolsoId: v.id("cajasMenoresReembolsos"),
  tipo: v.union(
    v.literal("asignacion"),
    v.literal("movimiento"),
    v.literal("aprobacion"),
    v.literal("devolucion"),
    v.literal("rechazo")
  ),
  etapa: v.union(
    v.literal("revision"),
    v.literal("contabilidad"),
    v.literal("eventos_dian"),
    v.literal("aprobacion")
  ),
  destinoEtapa: v.optional(
    v.union(
      v.literal("contabilidad"),
      v.literal("revision"),
      v.literal("eventos_dian"),
      v.literal("gerencia")
    )
  ),
  actorUserId: v.optional(v.string()),
  actorNombre: v.string(),
  actorEmail: v.string(),
  destinatarioUserId: v.optional(v.string()),
  destinatarioNombre: v.optional(v.string()),
  destinatarioEmail: v.optional(v.string()),
  comentario: v.optional(v.string()),
  origen: v.optional(v.literal("salto_fases_consecutivas")),
  creadoEn: v.number(),
}).index("by_reembolsoId", ["reembolsoId"]);

export const facturacionCajaMenorLegalizaciones = defineTable({
  facturaId: v.id("facturacionFacturas"),
  cajaMenorId: v.id("cajasMenores"),
  tareaId: v.optional(v.id("facturacionTareas")),
  asignacionId: v.optional(v.id("facturacionAsignaciones")),
  empresa: v.number(),
  valorAplicado: v.number(),
  saldoAntes: v.number(),
  saldoDespues: v.number(),
  estado: v.union(v.literal("activa"), v.literal("reemplazada"), v.literal("anulada")),
  actorUserId: v.optional(v.string()),
  actorNombre: v.string(),
  actorEmail: v.string(),
  comentario: v.optional(v.string()),
  creadoEn: v.number(),
  actualizadoEn: v.number(),
})
  .index("by_facturaId", ["facturaId"])
  .index("by_cajaMenorId", ["cajaMenorId"])
  .index("by_facturaId_estado", ["facturaId", "estado"])
  .index("by_cajaMenorId_estado", ["cajaMenorId", "estado"])
  .index("by_empresa", ["empresa"]);

async function getGerenciaFinancieraConfig(ctx: QueryCtx | MutationCtx, empresa: number) {
  return await ctx.db
    .query("cajasMenoresRolesConfig")
    .withIndex("by_empresa_rol", (q) => q.eq("empresa", empresa).eq("rol", "GERENCIA_FINANCIERA"))
    .first();
}

async function getCajaMenorEmpresaConfig(ctx: QueryCtx | MutationCtx, empresa: number) {
  return await ctx.db
    .query("cajasMenoresConfig")
    .withIndex("by_empresa", (q) => q.eq("empresa", normalizeEmpresa(empresa)))
    .first();
}

export async function empresaPermiteSaldoNegativo(ctx: QueryCtx | MutationCtx, empresa: number) {
  const config = await getCajaMenorEmpresaConfig(ctx, empresa);
  return config?.permitirSaldoNegativo ?? false;
}

function formatCOPSaldo(value: number) {
  return value.toLocaleString("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  });
}

function throwSaldoInsuficienteCajaMenor(args: {
  cajaNombre: string;
  saldoDisponible: number;
  valorRequerido: number;
}) {
  throw new ConvexError(
    `La Caja Menor ${args.cajaNombre} no tiene saldo suficiente: disponible ${formatCOPSaldo(args.saldoDisponible)}, requerido ${formatCOPSaldo(args.valorRequerido)}. Activa "Permitir saldos negativos" en Finanzas > Cajas Menores o ajusta el valor.`
  );
}

function configIncludesUser(config: Doc<"cajasMenoresRolesConfig"> | null, userId?: string) {
  if (!config || !userId) return false;
  return config.usuarios.some((usuario) => usuario.userId === userId);
}

async function usuarioPuedeGestionarEmpresa(
  ctx: QueryCtx | MutationCtx,
  empresa: number,
  actorUserId?: string,
  actorRol?: number
) {
  if (isAdminRol(actorRol)) return true;
  const config = await getGerenciaFinancieraConfig(ctx, empresa);
  return configIncludesUser(config, actorUserId);
}

async function usuarioEsGerenciaFinancieraConfiguradaEmpresa(
  ctx: QueryCtx | MutationCtx,
  empresa: number,
  actorUserId?: string
) {
  const config = await getGerenciaFinancieraConfig(ctx, empresa);
  return configIncludesUser(config, actorUserId);
}

async function assertCanManage(
  ctx: MutationCtx,
  empresa: number,
  actorUserId: string,
  actorRol?: number
) {
  const canManage = await usuarioPuedeGestionarEmpresa(ctx, empresa, actorUserId, actorRol);
  if (!canManage) {
    throw new Error("No tienes permisos de Gerencia Financiera.");
  }
}

function facturacionConfigIncludesUser(
  config: {
    usuarioId?: string;
    usuarios?: Array<{ usuarioId: string; email: string }>;
    usuariosPonderados?: Array<{ usuarioId: string; email: string }>;
  } | null,
  userId?: string
) {
  if (!config || !userId) return false;
  if (config.usuarioId === userId) return true;
  if ((config.usuarios ?? []).some((usuario) => usuario.usuarioId === userId)) {
    return true;
  }
  return (config.usuariosPonderados ?? []).some((usuario) => usuario.usuarioId === userId);
}

type RevisorCajaMenorPonderado = {
  usuarioId: string;
  nombre: string;
  email: string;
  peso: number;
};

function crearBloqueDistribucionRevisores(
  usuarios: RevisorCajaMenorPonderado[]
): RevisorCajaMenorPonderado[] {
  const totalPeso = usuarios.reduce((total, usuario) => total + usuario.peso, 0);
  const calculados = usuarios.map((usuario, index) => {
    const exacto = (usuario.peso / totalPeso) * 10;
    const base = Math.floor(exacto);
    return {
      usuario,
      index,
      slots: base,
      residuo: exacto - base,
    };
  });

  const asignados = calculados.reduce((total, item) => total + item.slots, 0);
  const faltantes = 10 - asignados;
  const porResiduo = [...calculados].sort((a, b) => b.residuo - a.residuo || a.index - b.index);
  for (let index = 0; index < faltantes; index += 1) {
    porResiduo[index % porResiduo.length].slots += 1;
  }

  const bloque = calculados.flatMap((item) =>
    Array.from({ length: item.slots }, () => item.usuario)
  );

  return bloque.length > 0 ? bloque : usuarios.slice(0, 1);
}

function normalizarRevisoresCajaMenorPonderados(
  config: {
    usuarioId?: string;
    nombre?: string;
    email?: string;
    usuarios?: Array<{ usuarioId: string; nombre: string; email: string }>;
    usuariosPonderados?: RevisorCajaMenorPonderado[];
  },
  options?: { includeZero?: boolean }
): RevisorCajaMenorPonderado[] {
  if (config.usuariosPonderados && config.usuariosPonderados.length > 0) {
    return config.usuariosPonderados.filter(
      (usuario) =>
        usuario.usuarioId &&
        usuario.nombre &&
        usuario.email &&
        Number.isFinite(usuario.peso) &&
        (options?.includeZero ? usuario.peso >= 0 : usuario.peso > 0)
    );
  }

  if (config.usuarios && config.usuarios.length > 0) {
    const pesoBase = Math.floor(100 / config.usuarios.length);
    const remainder = 100 - pesoBase * config.usuarios.length;
    return config.usuarios
      .filter((usuario) => usuario.usuarioId && usuario.nombre && usuario.email)
      .map((usuario, index) => ({
        usuarioId: usuario.usuarioId,
        nombre: usuario.nombre,
        email: normalizeEmail(usuario.email),
        peso: pesoBase + (index === 0 ? remainder : 0),
      }))
      .filter((usuario) => (options?.includeZero ? usuario.peso >= 0 : usuario.peso > 0));
  }

  if (config.usuarioId && config.nombre && config.email) {
    return [
      {
        usuarioId: config.usuarioId,
        nombre: config.nombre,
        email: normalizeEmail(config.email),
        peso: 100,
      },
    ];
  }

  return [];
}

async function getRevisoresCajaMenorIndex(ctx: QueryCtx | MutationCtx, empresa: number) {
  return await ctx.db
    .query("facturacionConfiguracionUsuarios")
    .withIndex("by_empresa_clave", (q) =>
      q.eq("empresa", empresa).eq("clave", "revisor_caja_menor")
    )
    .collect();
}

async function getRevisoresCajaMenorConfigurados(
  ctx: QueryCtx | MutationCtx,
  empresa: number,
  options?: { includeZero?: boolean }
): Promise<RevisorCajaMenorPonderado[]> {
  const indexados = await getRevisoresCajaMenorIndex(ctx, empresa);
  const ponderadosIndexados = indexados
    .filter(
      (usuario) =>
        usuario.usuarioId &&
        usuario.nombre &&
        usuario.email &&
        Number.isFinite(usuario.peso) &&
        (options?.includeZero ? (usuario.peso ?? -1) >= 0 : (usuario.peso ?? 0) > 0)
    )
    .map((usuario) => ({
      usuarioId: usuario.usuarioId,
      nombre: usuario.nombre,
      email: normalizeEmail(usuario.email),
      peso: usuario.peso ?? 0,
    }));
  if (ponderadosIndexados.length > 0) return ponderadosIndexados;

  const config = await getFacturacionConfig(ctx, empresa, "revisor_caja_menor");
  return config ? normalizarRevisoresCajaMenorPonderados(config, options) : [];
}

async function escogerRevisorCajaMenorPonderado(
  ctx: MutationCtx,
  empresa: number
): Promise<RevisorCajaMenorPonderado> {
  const config = await getFacturacionConfig(ctx, empresa, "revisor_caja_menor");
  const usuarios = await getRevisoresCajaMenorConfigurados(ctx, empresa);
  if (usuarios.length === 0) {
    throw new Error("Configura al menos un Revisor Caja Menor con peso mayor a 0.");
  }

  const bloque = crearBloqueDistribucionRevisores(usuarios);
  const cursor =
    config && Number.isFinite(config.distribucionCursor) ? (config.distribucionCursor ?? 0) : 0;
  const elegido = bloque[Math.abs(cursor) % bloque.length];

  if (config) {
    await ctx.db.patch("facturacionConfiguracion", config._id, {
      distribucionCursor: cursor + 1,
      actualizadoEn: Date.now(),
    });
  }

  return elegido;
}

async function assertRevisorCajaMenorConfigurado(
  ctx: QueryCtx | MutationCtx,
  empresa: number,
  usuarioId: string
) {
  const revisores = await getRevisoresCajaMenorConfigurados(ctx, empresa, {
    includeZero: true,
  });
  const revisor = revisores.find((item) => item.usuarioId === usuarioId);
  if (!revisor) {
    throw new Error("El revisor seleccionado no está configurado como Revisor Caja Menor.");
  }
  return revisor;
}

async function asignarRevisorReembolsoCajaMenor(
  ctx: MutationCtx,
  args: {
    reembolsoId: Id<"cajasMenoresReembolsos">;
    revisor: RevisorCajaMenorPonderado;
    actor: Actor;
    comentario?: string;
    esReasignacion?: boolean;
    movimientos?: Array<Doc<"facturacionCajaMenorMovimientos">>;
    estadoAnterior?: string;
  }
) {
  const now = Date.now();
  await patchReembolsoConBandeja(ctx, args.reembolsoId, {
    reviewAssignedUserId: args.revisor.usuarioId,
    reviewAssignedNombre: args.revisor.nombre,
    reviewAssignedEmail: normalizeEmail(args.revisor.email),
    reviewAssignedEn: now,
    reviewAssignedByUserId: args.actor.actorUserId,
    reviewAssignedByNombre: args.actor.actorNombre,
    reviewAssignmentComentario: args.comentario?.trim() || undefined,
    actualizadoEn: now,
  });

  if (args.esReasignacion && args.movimientos?.length) {
    const comentario =
      args.comentario?.trim() || `Reasignado a ${args.revisor.nombre} para revisión.`;
    for (const movimiento of args.movimientos) {
      await registrarAuditoriaCajaMenor(ctx, {
        movimiento,
        accion: "reasignar_revisor_caja_menor",
        actor: args.actor,
        comentario,
        estadoAnterior: args.estadoAnterior ?? "pendiente_revision",
        estadoNuevo: "pendiente_revision",
      });
    }
  }
}

function puedeRevisarReembolsoAsignado(
  reembolso: Doc<"cajasMenoresReembolsos">,
  actorUserId: string | undefined,
  isAdmin: boolean
) {
  if (isAdmin) return true;
  if (!reembolso.reviewAssignedUserId) return true;
  return reembolso.reviewAssignedUserId === actorUserId;
}

function puedeReasignarRevisionReembolso(
  reembolso: Doc<"cajasMenoresReembolsos">,
  actorUserId: string | undefined,
  options: {
    isAdmin: boolean;
    canManage: boolean;
    canReviewReembolso: boolean;
  }
) {
  if (reembolso.estado !== "pendiente_revision") return false;
  if (options.isAdmin || options.canManage) return true;
  if (!options.canReviewReembolso) return false;
  return reembolso.reviewAssignedUserId === actorUserId;
}

type FacturacionConfigClave =
  | "eventos_dian"
  | "revisor_caja_menor"
  | "contadores_impuestos"
  | "tesorero"
  | "tesoreria_default";

async function getFacturacionConfig(
  ctx: QueryCtx | MutationCtx,
  empresa: number,
  clave: FacturacionConfigClave
) {
  const scoped = await ctx.db
    .query("facturacionConfiguracion")
    .withIndex("by_empresa_clave", (q) => q.eq("empresa", empresa).eq("clave", clave))
    .first();
  if (scoped) return scoped;
  if (empresa === DEFAULT_EMPRESA) {
    return await ctx.db
      .query("facturacionConfiguracion")
      .withIndex("by_clave", (q) => q.eq("clave", clave))
      .filter((q) => q.eq(q.field("empresa"), undefined))
      .first();
  }
  return null;
}

async function usuarioPuedeRevisarCajaMenorEmpresa(
  ctx: QueryCtx | MutationCtx,
  empresa: number,
  actorUserId?: string,
  actorRol?: number
) {
  if (isAdminRol(actorRol)) return true;
  const config = await getFacturacionConfig(ctx, empresa, "revisor_caja_menor");
  return facturacionConfigIncludesUser(config, actorUserId);
}

async function usuarioEsRevisorCajaMenorConfiguradoEmpresa(
  ctx: QueryCtx | MutationCtx,
  empresa: number,
  actorUserId?: string
) {
  if (!actorUserId) return false;
  const revisores = await getRevisoresCajaMenorConfigurados(ctx, empresa, {
    includeZero: true,
  });
  if (revisores.some((revisor) => revisor.usuarioId === actorUserId)) {
    return true;
  }
  const config = await getFacturacionConfig(ctx, empresa, "revisor_caja_menor");
  return facturacionConfigIncludesUser(config, actorUserId);
}

async function obtenerEmpresasRevisorCajaMenorForUser(
  ctx: QueryCtx | MutationCtx,
  actorUserId?: string
) {
  if (!actorUserId) return [];
  const empresas = new Set<number>();
  const indexados = await ctx.db
    .query("facturacionConfiguracionUsuarios")
    .withIndex("by_usuarioId_clave", (q) =>
      q.eq("usuarioId", actorUserId).eq("clave", "revisor_caja_menor")
    )
    .collect();
  for (const row of indexados) {
    empresas.add(row.empresa);
  }

  const legacyConfigs = await ctx.db
    .query("facturacionConfiguracion")
    .withIndex("by_clave", (q) => q.eq("clave", "revisor_caja_menor"))
    .collect();
  for (const config of legacyConfigs) {
    if (config.empresa === undefined) continue;
    if (facturacionConfigIncludesUser(config, actorUserId)) {
      empresas.add(config.empresa);
    }
  }

  return [...empresas].sort((a, b) => a - b);
}

type ContadorImpuestosConfig = {
  usuarioId: string;
  nombre: string;
  email: string;
};

type EventosDianConfig = ContadorImpuestosConfig;

function normalizarContadoresImpuestosConfig(config: {
  usuarioId?: string;
  nombre?: string;
  email?: string;
  usuarios?: Array<{ usuarioId: string; nombre: string; email: string }>;
}): ContadorImpuestosConfig[] {
  if (config.usuarios && config.usuarios.length > 0) {
    return config.usuarios
      .filter((usuario) => usuario.usuarioId && usuario.nombre && usuario.email)
      .map((usuario) => ({
        usuarioId: usuario.usuarioId,
        nombre: usuario.nombre,
        email: normalizeEmail(usuario.email),
      }));
  }
  if (config.usuarioId && config.nombre && config.email) {
    return [
      {
        usuarioId: config.usuarioId,
        nombre: config.nombre,
        email: normalizeEmail(config.email),
      },
    ];
  }
  return [];
}

async function getContadoresImpuestosIndex(ctx: QueryCtx | MutationCtx, empresa: number) {
  return await ctx.db
    .query("facturacionConfiguracionUsuarios")
    .withIndex("by_empresa_clave", (q) =>
      q.eq("empresa", empresa).eq("clave", "contadores_impuestos")
    )
    .collect();
}

async function getContadoresImpuestosConfigurados(
  ctx: QueryCtx | MutationCtx,
  empresa: number
): Promise<ContadorImpuestosConfig[]> {
  const indexados = await getContadoresImpuestosIndex(ctx, empresa);
  const fromIndex = indexados
    .filter((usuario) => usuario.usuarioId && usuario.nombre && usuario.email)
    .map((usuario) => ({
      usuarioId: usuario.usuarioId,
      nombre: usuario.nombre,
      email: normalizeEmail(usuario.email),
    }));
  if (fromIndex.length > 0) return fromIndex;

  const config = await getFacturacionConfig(ctx, empresa, "contadores_impuestos");
  return config ? normalizarContadoresImpuestosConfig(config) : [];
}

async function assertContadorImpuestosConfigurado(
  ctx: QueryCtx | MutationCtx,
  empresa: number,
  usuarioId: string
) {
  const contadores = await getContadoresImpuestosConfigurados(ctx, empresa);
  const contador = contadores.find((item) => item.usuarioId === usuarioId);
  if (!contador) {
    throw new Error(
      "El contador seleccionado no está configurado en Contadores Impuestos para esta empresa."
    );
  }
  return contador;
}

async function usuarioEsContadorImpuestosConfiguradoEmpresa(
  ctx: QueryCtx | MutationCtx,
  empresa: number,
  actorUserId?: string
) {
  if (!actorUserId) return false;
  const contadores = await getContadoresImpuestosConfigurados(ctx, empresa);
  if (contadores.some((contador) => contador.usuarioId === actorUserId)) {
    return true;
  }
  const config = await getFacturacionConfig(ctx, empresa, "contadores_impuestos");
  return facturacionConfigIncludesUser(config, actorUserId);
}

async function obtenerEmpresasContadorImpuestosForUser(
  ctx: QueryCtx | MutationCtx,
  actorUserId?: string
) {
  if (!actorUserId) return [];
  const empresas = new Set<number>();
  const indexados = await ctx.db
    .query("facturacionConfiguracionUsuarios")
    .withIndex("by_usuarioId_clave", (q) =>
      q.eq("usuarioId", actorUserId).eq("clave", "contadores_impuestos")
    )
    .collect();
  for (const row of indexados) {
    empresas.add(row.empresa);
  }

  const legacyConfigs = await ctx.db
    .query("facturacionConfiguracion")
    .withIndex("by_clave", (q) => q.eq("clave", "contadores_impuestos"))
    .collect();
  for (const config of legacyConfigs) {
    if (config.empresa === undefined) continue;
    if (facturacionConfigIncludesUser(config, actorUserId)) {
      empresas.add(config.empresa);
    }
  }

  return [...empresas].sort((a, b) => a - b);
}

function puedeDecidirContabilidadReembolso(
  reembolso: Doc<"cajasMenoresReembolsos">,
  actorUserId: string | undefined,
  options: {
    canReviewContabilidad: boolean;
  }
) {
  if (!options.canReviewContabilidad) return false;
  if (!reembolso.contadorAsignadoUserId) return false;
  return reembolso.contadorAsignadoUserId === actorUserId;
}

function puedeReasignarContabilidadReembolso(
  reembolso: Doc<"cajasMenoresReembolsos">,
  actorUserId: string | undefined,
  options: {
    isAdmin: boolean;
    canManage: boolean;
    canReviewContabilidad: boolean;
  }
) {
  if (reembolso.estado !== "pendiente_revision_impuestos") return false;
  if (options.isAdmin || options.canManage) return true;
  if (!options.canReviewContabilidad) return false;
  return reembolso.contadorAsignadoUserId === actorUserId;
}

function normalizarEventosDianConfig(config: {
  usuarioId?: string;
  nombre?: string;
  email?: string;
  usuarios?: Array<{ usuarioId: string; nombre: string; email: string }>;
}): EventosDianConfig[] {
  return normalizarContadoresImpuestosConfig(config);
}

async function getEventosDianIndex(ctx: QueryCtx | MutationCtx, empresa: number) {
  return await ctx.db
    .query("facturacionConfiguracionUsuarios")
    .withIndex("by_empresa_clave", (q) => q.eq("empresa", empresa).eq("clave", "eventos_dian"))
    .collect();
}

async function getEventosDianConfigurados(
  ctx: QueryCtx | MutationCtx,
  empresa: number
): Promise<EventosDianConfig[]> {
  const indexados = await getEventosDianIndex(ctx, empresa);
  const fromIndex = indexados
    .filter((usuario) => usuario.usuarioId && usuario.nombre && usuario.email)
    .map((usuario) => ({
      usuarioId: usuario.usuarioId,
      nombre: usuario.nombre,
      email: normalizeEmail(usuario.email),
    }));
  if (fromIndex.length > 0) return fromIndex;

  const config = await getFacturacionConfig(ctx, empresa, "eventos_dian");
  return config ? normalizarEventosDianConfig(config) : [];
}

async function assertEventosDianConfigurado(
  ctx: QueryCtx | MutationCtx,
  empresa: number,
  usuarioId: string
) {
  const usuarios = await getEventosDianConfigurados(ctx, empresa);
  const usuario = usuarios.find((item) => item.usuarioId === usuarioId);
  if (!usuario) {
    throw new Error(
      "El responsable seleccionado no está configurado en Eventos DIAN para esta empresa."
    );
  }
  return usuario;
}

async function usuarioEsEventosDianConfiguradoEmpresa(
  ctx: QueryCtx | MutationCtx,
  empresa: number,
  actorUserId?: string
) {
  if (!actorUserId) return false;
  const usuarios = await getEventosDianConfigurados(ctx, empresa);
  if (usuarios.some((usuario) => usuario.usuarioId === actorUserId)) {
    return true;
  }
  const config = await getFacturacionConfig(ctx, empresa, "eventos_dian");
  return facturacionConfigIncludesUser(config, actorUserId);
}

async function obtenerEmpresasEventosDianForUser(
  ctx: QueryCtx | MutationCtx,
  actorUserId?: string
) {
  if (!actorUserId) return [];
  const empresas = new Set<number>();
  const indexados = await ctx.db
    .query("facturacionConfiguracionUsuarios")
    .withIndex("by_usuarioId_clave", (q) =>
      q.eq("usuarioId", actorUserId).eq("clave", "eventos_dian")
    )
    .collect();
  for (const row of indexados) {
    empresas.add(row.empresa);
  }

  const legacyConfigs = await ctx.db
    .query("facturacionConfiguracion")
    .withIndex("by_clave", (q) => q.eq("clave", "eventos_dian"))
    .collect();
  for (const config of legacyConfigs) {
    if (config.empresa === undefined) continue;
    if (facturacionConfigIncludesUser(config, actorUserId)) {
      empresas.add(config.empresa);
    }
  }

  return [...empresas].sort((a, b) => a - b);
}

function getRetornoGerenciaPendienteEn(
  reembolso: Doc<"cajasMenoresReembolsos">
): "revision" | "contabilidad" | undefined {
  if (reembolso.retornoGerenciaPendienteEn) return reembolso.retornoGerenciaPendienteEn;
  if (reembolso.permiteReenvioDirectoGerencia) return "revision";
  return undefined;
}

function puedeDecidirEventosDianReembolso(
  reembolso: Doc<"cajasMenoresReembolsos">,
  actorUserId: string | undefined,
  options: {
    canReviewEventosDian: boolean;
  }
) {
  if (!options.canReviewEventosDian) return false;
  if (!reembolso.eventosDianAsignadoUserId) return false;
  return reembolso.eventosDianAsignadoUserId === actorUserId;
}

function puedeReasignarEventosDianReembolso(
  reembolso: Doc<"cajasMenoresReembolsos">,
  actorUserId: string | undefined,
  options: {
    isAdmin: boolean;
    canManage: boolean;
    canReviewEventosDian: boolean;
  }
) {
  if (reembolso.estado !== "pendiente_eventos_dian") return false;
  if (options.isAdmin || options.canManage) return true;
  if (!options.canReviewEventosDian) return false;
  return reembolso.eventosDianAsignadoUserId === actorUserId;
}

function reembolsoTieneAccionParaUsuario(
  reembolso: Doc<"cajasMenoresReembolsos">,
  actorUserId: string | undefined,
  options: {
    isAdmin: boolean;
    canManage: boolean;
    canReviewReembolso: boolean;
    canReviewContabilidad: boolean;
    canReviewEventosDian: boolean;
    canApproveReembolso: boolean;
    canPayTesoreria: boolean;
  }
) {
  if (!actorUserId) return false;
  switch (reembolso.estado) {
    case "pendiente_aprobacion_lider":
      return reembolso.liderAprobadorUserId === actorUserId;
    case "pendiente_revision":
      return (
        puedeRevisarReembolsoAsignado(reembolso, actorUserId, options.isAdmin) ||
        puedeReasignarRevisionReembolso(reembolso, actorUserId, {
          isAdmin: options.isAdmin,
          canManage: options.canManage,
          canReviewReembolso: options.canReviewReembolso,
        })
      );
    case "pendiente_revision_impuestos":
      return (
        puedeDecidirContabilidadReembolso(reembolso, actorUserId, {
          canReviewContabilidad: options.canReviewContabilidad,
        }) ||
        puedeReasignarContabilidadReembolso(reembolso, actorUserId, {
          isAdmin: options.isAdmin,
          canManage: options.canManage,
          canReviewContabilidad: options.canReviewContabilidad,
        })
      );
    case "pendiente_eventos_dian":
      return (
        puedeDecidirEventosDianReembolso(reembolso, actorUserId, {
          canReviewEventosDian: options.canReviewEventosDian,
        }) ||
        puedeReasignarEventosDianReembolso(reembolso, actorUserId, {
          isAdmin: options.isAdmin,
          canManage: options.canManage,
          canReviewEventosDian: options.canReviewEventosDian,
        })
      );
    case "pendiente_aprobacion":
      return options.canApproveReembolso || options.isAdmin;
    case "pendiente_pago_tesoreria":
      return options.canPayTesoreria || options.isAdmin;
    case "aprobado_pendiente_recibo":
      return reembolso.custodioUserId === actorUserId;
    default:
      return false;
  }
}

function emptyConteosVisiblesPorEstado() {
  return {
    pendiente_aprobacion_lider: 0,
    pendiente_revision: 0,
    pendiente_revision_impuestos: 0,
    pendiente_eventos_dian: 0,
    pendiente_aprobacion: 0,
    pendiente_pago_tesoreria: 0,
  };
}

const REEMBOLSO_EVENTOS_TIMELINE_LIMIT = 50;

type ReembolsoEventoEtapa = "revision" | "contabilidad" | "eventos_dian" | "aprobacion";
type ReembolsoEventoDestinoEtapa = "contabilidad" | "revision" | "eventos_dian" | "gerencia";

const CLEAR_CONTADOR_DECISION_FIELDS = {
  contadorUserId: undefined,
  contadorNombre: undefined,
  contadorEmail: undefined,
  contadorComentario: undefined,
  contadorDecisionEn: undefined,
} as const;

const CLEAR_GF_DECISION_FIELDS = {
  gfAprobadorUserId: undefined,
  gfAprobadorNombre: undefined,
  gfAprobadorEmail: undefined,
  gfComentario: undefined,
  gfDecisionEn: undefined,
} as const;

const CLEAR_EVENTOS_DIAN_DECISION_FIELDS = {
  eventosDianUserId: undefined,
  eventosDianNombre: undefined,
  eventosDianEmail: undefined,
  eventosDianComentario: undefined,
  eventosDianDecisionEn: undefined,
} as const;

type SaltoFasesConsecutivasReembolso = {
  destino: "eventos_dian" | "gerencia";
  fasesSaltadas: Array<"contabilidad" | "eventos_dian">;
  requiereSeleccionEventosDian: boolean;
  motivo: "roles_consecutivos";
};

function dedupeUsuariosReembolsoConfig<
  T extends { usuarioId: string; email: string },
>(usuarios: T[]) {
  const vistos = new Set<string>();
  return usuarios.filter((usuario) => {
    const id = usuario.usuarioId.trim();
    if (!id || vistos.has(id)) return false;
    vistos.add(id);
    return true;
  });
}

function usuarioConfiguradoEnLista(usuarioId: string | undefined, lista: Array<{ usuarioId: string }>) {
  if (!usuarioId) return false;
  return lista.some((item) => item.usuarioId === usuarioId);
}

function planificarSaltoFasesConsecutivasReembolso(args: {
  estado: Doc<"cajasMenoresReembolsos">["estado"];
  actorUserId?: string;
  actorEsResponsableAsignado: boolean;
  contadores: ContadorImpuestosConfig[];
  eventosDian: EventosDianConfig[];
  retornoGerenciaPendienteEn?: "revision" | "contabilidad";
}): SaltoFasesConsecutivasReembolso | null {
  if (!args.actorUserId || !args.actorEsResponsableAsignado) return null;
  if (args.retornoGerenciaPendienteEn) return null;

  const contadores = dedupeUsuariosReembolsoConfig(args.contadores);
  const eventosDian = dedupeUsuariosReembolsoConfig(args.eventosDian);
  const actorId = args.actorUserId;
  const esContador = usuarioConfiguradoEnLista(actorId, contadores);
  const esEventosDian = usuarioConfiguradoEnLista(actorId, eventosDian);

  if (args.estado === "pendiente_revision") {
    if (!esContador) return null;
    if (esEventosDian) {
      return {
        destino: "gerencia",
        fasesSaltadas: ["contabilidad", "eventos_dian"],
        requiereSeleccionEventosDian: false,
        motivo: "roles_consecutivos",
      };
    }
    if (eventosDian.length === 0) return null;
    return {
      destino: "eventos_dian",
      fasesSaltadas: ["contabilidad"],
      requiereSeleccionEventosDian: eventosDian.length > 1 && !esEventosDian,
      motivo: "roles_consecutivos",
    };
  }

  if (args.estado === "pendiente_revision_impuestos") {
    if (!esContador || !esEventosDian) return null;
    return {
      destino: "gerencia",
      fasesSaltadas: ["eventos_dian"],
      requiereSeleccionEventosDian: false,
      motivo: "roles_consecutivos",
    };
  }

  return null;
}

async function resolverEventosDianSaltoReembolso(
  ctx: MutationCtx,
  empresa: number,
  actorUserId: string,
  eventosDianUserId?: string
): Promise<EventosDianConfig> {
  const eventosDian = dedupeUsuariosReembolsoConfig(
    await getEventosDianConfigurados(ctx, empresa)
  );
  if (eventosDian.length === 0) {
    throw new Error("No hay usuarios configurados para Eventos DIAN.");
  }
  const actorEnLista = eventosDian.find((item) => item.usuarioId === actorUserId);
  if (actorEnLista) return actorEnLista;
  if (eventosDian.length === 1) return eventosDian[0]!;
  const seleccionado = eventosDianUserId?.trim();
  if (!seleccionado) {
    throw new Error("Selecciona el responsable de Eventos DIAN para continuar.");
  }
  return await assertEventosDianConfigurado(ctx, empresa, seleccionado);
}

async function registrarEventoReembolso(
  ctx: MutationCtx,
  args: {
    reembolsoId: Id<"cajasMenoresReembolsos">;
    tipo: "asignacion" | "movimiento" | "aprobacion" | "devolucion" | "rechazo";
    etapa: ReembolsoEventoEtapa;
    destinoEtapa?: ReembolsoEventoDestinoEtapa;
    actor: Actor;
    destinatario?: Pick<ContadorImpuestosConfig, "usuarioId" | "nombre" | "email">;
    comentario?: string;
    creadoEn?: number;
    origen?: "salto_fases_consecutivas";
  }
): Promise<Id<"cajasMenoresReembolsoEventos">> {
  return await ctx.db.insert("cajasMenoresReembolsoEventos", {
    reembolsoId: args.reembolsoId,
    tipo: args.tipo,
    etapa: args.etapa,
    destinoEtapa: args.destinoEtapa,
    actorUserId: args.actor.actorUserId,
    actorNombre: args.actor.actorNombre,
    actorEmail: normalizeEmail(args.actor.actorEmail),
    destinatarioUserId: args.destinatario?.usuarioId,
    destinatarioNombre: args.destinatario?.nombre,
    destinatarioEmail: args.destinatario ? normalizeEmail(args.destinatario.email) : undefined,
    comentario: args.comentario?.trim() || undefined,
    origen: args.origen,
    creadoEn: args.creadoEn ?? Date.now(),
  });
}

async function asignarContadorReembolsoCajaMenor(
  ctx: MutationCtx,
  args: {
    reembolsoId: Id<"cajasMenoresReembolsos">;
    contador: ContadorImpuestosConfig;
    actor: Actor;
    comentario?: string;
    esReasignacion?: boolean;
    movimientos?: Array<Doc<"facturacionCajaMenorMovimientos">>;
    estadoAnterior?: string;
    now?: number;
  }
) {
  const now = args.now ?? Date.now();
  await patchReembolsoConBandeja(ctx, args.reembolsoId, {
    contadorAsignadoUserId: args.contador.usuarioId,
    contadorAsignadoNombre: args.contador.nombre,
    contadorAsignadoEmail: normalizeEmail(args.contador.email),
    contadorAsignadoEn: now,
    contadorAsignadoByUserId: args.actor.actorUserId,
    contadorAsignadoByNombre: args.actor.actorNombre,
    contadorAsignacionComentario: args.comentario?.trim() || undefined,
    actualizadoEn: now,
  });

  await registrarEventoReembolso(ctx, {
    reembolsoId: args.reembolsoId,
    tipo: args.esReasignacion ? "movimiento" : "asignacion",
    etapa: "contabilidad",
    actor: args.actor,
    destinatario: args.contador,
    comentario: args.comentario,
    creadoEn: now,
  });

  if (args.esReasignacion && args.movimientos?.length) {
    const comentario =
      args.comentario?.trim() ||
      `Reasignado a ${args.contador.nombre} para revisión de impuestos/contabilidad.`;
    for (const movimiento of args.movimientos) {
      await registrarAuditoriaCajaMenor(ctx, {
        movimiento,
        accion: "reasignar_contador_reembolso_caja_menor",
        actor: args.actor,
        comentario,
        estadoAnterior: args.estadoAnterior ?? "pendiente_revision_impuestos",
        estadoNuevo: "pendiente_revision_impuestos",
      });
    }
  }
}

async function asignarEventosDianReembolsoCajaMenor(
  ctx: MutationCtx,
  args: {
    reembolsoId: Id<"cajasMenoresReembolsos">;
    eventosDian: EventosDianConfig;
    actor: Actor;
    comentario?: string;
    esReasignacion?: boolean;
    movimientos?: Array<Doc<"facturacionCajaMenorMovimientos">>;
    estadoAnterior?: string;
    now?: number;
  }
) {
  const now = args.now ?? Date.now();
  await patchReembolsoConBandeja(ctx, args.reembolsoId, {
    eventosDianAsignadoUserId: args.eventosDian.usuarioId,
    eventosDianAsignadoNombre: args.eventosDian.nombre,
    eventosDianAsignadoEmail: normalizeEmail(args.eventosDian.email),
    eventosDianAsignadoEn: now,
    eventosDianAsignadoByUserId: args.actor.actorUserId,
    eventosDianAsignadoByNombre: args.actor.actorNombre,
    eventosDianAsignacionComentario: args.comentario?.trim() || undefined,
    actualizadoEn: now,
  });

  await registrarEventoReembolso(ctx, {
    reembolsoId: args.reembolsoId,
    tipo: args.esReasignacion ? "movimiento" : "asignacion",
    etapa: "eventos_dian",
    actor: args.actor,
    destinatario: args.eventosDian,
    comentario: args.comentario,
    creadoEn: now,
  });

  if (args.esReasignacion && args.movimientos?.length) {
    const comentario =
      args.comentario?.trim() ||
      `Reasignado a ${args.eventosDian.nombre} para Eventos DIAN.`;
    for (const movimiento of args.movimientos) {
      await registrarAuditoriaCajaMenor(ctx, {
        movimiento,
        accion: "reasignar_eventos_dian_reembolso_caja_menor",
        actor: args.actor,
        comentario,
        estadoAnterior: args.estadoAnterior ?? "pendiente_eventos_dian",
        estadoNuevo: "pendiente_eventos_dian",
      });
    }
  }
}

async function usuarioPuedeVerCajaMenor(
  ctx: QueryCtx | MutationCtx,
  caja: Doc<"cajasMenores">,
  actorUserId?: string,
  actorRol?: number
) {
  const canManage = await usuarioPuedeGestionarEmpresa(ctx, caja.empresa_id, actorUserId, actorRol);
  if (canManage) {
    return { canView: true, canManage: true };
  }
  if (actorUserId && caja.assignedUsersIds.includes(actorUserId)) {
    return { canView: true, canManage: false };
  }
  const isRevisor = await usuarioEsRevisorCajaMenorConfiguradoEmpresa(
    ctx,
    caja.empresa_id,
    actorUserId
  );
  if (isRevisor) {
    return { canView: true, canManage: false };
  }
  const isContador = await usuarioEsContadorImpuestosConfiguradoEmpresa(
    ctx,
    caja.empresa_id,
    actorUserId
  );
  if (isContador) {
    return { canView: true, canManage: false };
  }
  return { canView: false, canManage: false };
}

async function assertCanReviewCajaMenor(ctx: MutationCtx, empresa: number, actorUserId: string) {
  const canReview = await usuarioEsRevisorCajaMenorConfiguradoEmpresa(ctx, empresa, actorUserId);
  if (!canReview) {
    throw new Error(
      "Sólo los usuarios configurados como Revisor Caja Menor pueden aprobar o rechazar esta revisión."
    );
  }
}

async function assertCanDecideReembolsoGerencia(
  ctx: MutationCtx,
  empresa: number,
  actorUserId: string
) {
  const canApprove = await usuarioEsGerenciaFinancieraConfiguradaEmpresa(ctx, empresa, actorUserId);
  if (!canApprove) {
    throw new Error(
      "Sólo los usuarios configurados en Gerencia Financiera pueden aprobar, rechazar o devolver este reembolso."
    );
  }
}

async function getTesoreroConfigurado(ctx: QueryCtx | MutationCtx, empresa: number) {
  const tesorero =
    (await getFacturacionConfig(ctx, empresa, "tesorero")) ??
    (await getFacturacionConfig(ctx, empresa, "tesoreria_default"));
  if (!tesorero?.usuarioId || !tesorero.nombre || !tesorero.email) {
    throw new Error("Configura un tesorero para esta empresa.");
  }
  return {
    usuarioId: tesorero.usuarioId,
    nombre: tesorero.nombre,
    email: normalizeEmail(tesorero.email),
  };
}

async function usuarioEsTesoreroConfiguradoEmpresa(
  ctx: QueryCtx | MutationCtx,
  empresa: number,
  actorUserId?: string
) {
  if (!actorUserId) return false;
  const tesoreroConfig =
    (await getFacturacionConfig(ctx, empresa, "tesorero")) ??
    (await getFacturacionConfig(ctx, empresa, "tesoreria_default"));
  return facturacionConfigIncludesUser(tesoreroConfig, actorUserId);
}

async function assertCanCargarComprobanteTesoreria(
  ctx: MutationCtx,
  empresa: number,
  actorUserId: string,
  actorRol?: number
) {
  if (isAdminRol(actorRol)) return;
  const canPay = await usuarioEsTesoreroConfiguradoEmpresa(ctx, empresa, actorUserId);
  if (!canPay) {
    throw new Error(
      "Sólo los usuarios configurados como Tesorería pueden cargar el comprobante de pago."
    );
  }
}

function tareaPermiteReembolsoCajaMenor(estado?: string) {
  return estado === "reembolso_caja_menor" || estado === "legalizada";
}

async function nextNumeroReembolso(ctx: MutationCtx, empresa: number, now = Date.now()) {
  const anio = new Date(now).getFullYear();
  const existente = await ctx.db
    .query("cajasMenoresReembolsoContadores")
    .withIndex("by_empresa_anio", (q) => q.eq("empresa", empresa).eq("anio", anio))
    .unique();
  const consecutivo = (existente?.consecutivo ?? 0) + 1;
  if (existente) {
    await ctx.db.patch("cajasMenoresReembolsoContadores", existente._id, { consecutivo, updatedAt: now });
  } else {
    await ctx.db.insert("cajasMenoresReembolsoContadores", {
      empresa,
      anio,
      consecutivo,
      updatedAt: now,
    });
  }
  return `GFN-F006-${anio}-${String(consecutivo).padStart(4, "0")}`;
}

async function buildFormatoSnapshot(
  ctx: MutationCtx,
  args: {
    numeroReembolso: string;
    caja: Doc<"cajasMenores">;
    movimientos: Array<Doc<"facturacionCajaMenorMovimientos">>;
    custodioUserId: string;
    custodioNombre: string;
    custodioEmail: string;
    valorTotal: number;
    solicitudComentario?: string;
    generadoEn: number;
  }
) {
  const movimientos = [];
  for (const movimiento of args.movimientos) {
    const factura = await ctx.db.get("facturacionFacturas", movimiento.facturaId);
    movimientos.push({
      movimientoId: movimiento._id,
      facturaId: movimiento.facturaId,
      numeroFactura: factura?.numeroFactura ?? String(movimiento.facturaId),
      proveedorNit: factura?.proveedorNit ?? movimiento.nit,
      proveedorNombre: factura?.proveedorNombre ?? movimiento.nombreEmpresa,
      concepto: movimiento.concepto,
      fechaPago: movimiento.fechaPago,
      centroCostoCodigo: movimiento.centroCostoCodigo,
      centroCostoNombre: movimiento.centroCostoNombre,
      centrosCostoDistribucion: movimiento.centrosCostoDistribucion,
      valor: movimiento.valor,
    });
  }
  return {
    numeroReembolso: args.numeroReembolso,
    empresa: args.caja.empresa_id,
    empresaNombre: getEmpresaNombre(args.caja.empresa_id),
    cajaMenorId: args.caja._id,
    cajaNombre: args.caja.nombre,
    custodioUserId: args.custodioUserId,
    custodioNombre: args.custodioNombre,
    custodioEmail: normalizeEmail(args.custodioEmail),
    generadoEn: args.generadoEn,
    valorTotal: args.valorTotal,
    solicitudComentario: args.solicitudComentario,
    movimientos,
  };
}

const reembolsoAdjuntoArg = v.object({
  storageId: v.id("_storage"),
  nombre: v.string(),
  mimeType: v.optional(v.string()),
});

const reembolsoCentroCostoOverrideArg = v.object({
  movimientoId: v.id("facturacionCajaMenorMovimientos"),
  centroCostoId: v.optional(v.string()),
  centroCostoCodigo: v.string(),
  centroCostoNombre: v.string(),
  centrosCostoDistribucion: v.optional(centrosCostoDistribucionValidator),
});

const reembolsoAjusteValorContableArg = v.object({
  movimientoId: v.id("facturacionCajaMenorMovimientos"),
  valorContableNuevo: v.number(),
  centroCostoId: v.optional(v.string()),
  centroCostoCodigo: v.string(),
  centroCostoNombre: v.string(),
  centrosCostoDistribucion: centrosCostoDistribucionValidator,
});

const reembolsoCausacionArg = v.object({
  movimientoId: v.id("facturacionCajaMenorMovimientos"),
  expectedVersion: v.optional(v.number()),
  causado: v.boolean(),
  numeroFp: v.optional(v.string()),
});

type ReembolsoAjusteValorContable = {
  movimientoId: Id<"facturacionCajaMenorMovimientos">;
  valorContableNuevo: number;
  centroCostoId?: string;
  centroCostoCodigo: string;
  centroCostoNombre: string;
  centrosCostoDistribucion: CentroCostoDistribucionRow[];
};

const ESTADOS_EDICION_VALOR_CONTABLE_REEMBOLSO = new Set<
  Doc<"cajasMenoresReembolsos">["estado"]
>(["pendiente_revision", "pendiente_revision_impuestos", "pendiente_eventos_dian"]);

type ReembolsoCentroCostoOverride = {
  movimientoId: Id<"facturacionCajaMenorMovimientos">;
  centroCostoId?: string;
  centroCostoCodigo: string;
  centroCostoNombre: string;
  centrosCostoDistribucion?: CentroCostoDistribucionRow[];
};

const reembolsoAprobacionLiderArg = v.object({
  aprobadorUserId: v.string(),
  aprobadorNombre: v.string(),
  aprobadorEmail: v.string(),
});

type ReembolsoAdjuntoEtapa =
  | "revision"
  | "contabilidad"
  | "eventos_dian"
  | "aprobacion"
  | "tesoreria";
type ReembolsoAdjuntoEstado = "borrador" | "confirmado";
type ReembolsoAdjuntoActor = Actor & {
  actorUserId: string;
  actorRol?: number;
};

const REEMBOLSO_ADJUNTO_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
]);

function getAdjuntoEstado(adjunto: { estado?: ReembolsoAdjuntoEstado }): ReembolsoAdjuntoEstado {
  return adjunto.estado ?? "confirmado";
}

function isAdjuntoConfirmado(adjunto: { estado?: ReembolsoAdjuntoEstado }): boolean {
  return getAdjuntoEstado(adjunto) === "confirmado";
}

function etapaAdjuntoDesdeEstadoReembolso(
  estado: Doc<"cajasMenoresReembolsos">["estado"]
): ReembolsoAdjuntoEtapa | null {
  if (estado === "pendiente_revision") return "revision";
  if (estado === "pendiente_revision_impuestos") return "contabilidad";
  if (estado === "pendiente_eventos_dian") return "eventos_dian";
  if (estado === "pendiente_aprobacion") return "aprobacion";
  if (estado === "pendiente_pago_tesoreria") return "tesoreria";
  return null;
}

function getReembolsoAdjuntoMimeType(
  metadata: { contentType?: string },
  nombre: string,
  declaredMimeType?: string
) {
  const storageContentType = metadata.contentType?.trim().toLowerCase();
  const declared = declaredMimeType?.trim().toLowerCase();
  const name = nombre.trim().toLowerCase();
  const hasTrustedStorageMime =
    Boolean(storageContentType) && storageContentType !== "application/octet-stream";
  if (hasTrustedStorageMime && !REEMBOLSO_ADJUNTO_MIME_TYPES.has(storageContentType!)) {
    throw new Error("Sólo se permiten archivos PDF, PNG, JPG o WEBP.");
  }
  const mimeType = hasTrustedStorageMime ? storageContentType : declared;
  const hasAllowedExtension = /\.(pdf|png|jpe?g|webp)$/.test(name);
  if ((!mimeType || !REEMBOLSO_ADJUNTO_MIME_TYPES.has(mimeType)) && !hasAllowedExtension) {
    throw new Error("Sólo se permiten archivos PDF, PNG, JPG o WEBP.");
  }
  if (mimeType && REEMBOLSO_ADJUNTO_MIME_TYPES.has(mimeType)) return mimeType;
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

async function assertPuedeGestionarAdjuntoReembolso(
  ctx: MutationCtx,
  reembolso: Doc<"cajasMenoresReembolsos">,
  caja: Doc<"cajasMenores">,
  actor: ReembolsoAdjuntoActor
): Promise<ReembolsoAdjuntoEtapa> {
  const etapa = etapaAdjuntoDesdeEstadoReembolso(reembolso.estado);
  if (!etapa) {
    throw new Error("Sólo puedes cargar archivos en Revisión, Contabilidad, Eventos DIAN, Gerencia o Tesorería.");
  }

  if (etapa === "revision") {
    await assertCanReviewCajaMenor(ctx, caja.empresa_id, actor.actorUserId);
    if (!puedeRevisarReembolsoAsignado(reembolso, actor.actorUserId, isAdminRol(actor.actorRol))) {
      throw new Error("Sólo el revisor asignado puede cargar archivos en esta solicitud.");
    }
  } else if (etapa === "contabilidad") {
    const canReviewContabilidad = await usuarioEsContadorImpuestosConfiguradoEmpresa(
      ctx,
      caja.empresa_id,
      actor.actorUserId
    );
    if (
      !puedeDecidirContabilidadReembolso(reembolso, actor.actorUserId, {
        canReviewContabilidad,
      })
    ) {
      throw new Error("Sólo el contador asignado puede cargar archivos en esta solicitud.");
    }
  } else if (etapa === "eventos_dian") {
    const canReviewEventosDian = await usuarioEsEventosDianConfiguradoEmpresa(
      ctx,
      caja.empresa_id,
      actor.actorUserId
    );
    if (
      !puedeDecidirEventosDianReembolso(reembolso, actor.actorUserId, {
        canReviewEventosDian,
      })
    ) {
      throw new Error("Sólo el responsable asignado de Eventos DIAN puede cargar archivos en esta solicitud.");
    }
  } else if (etapa === "aprobacion") {
    await assertCanDecideReembolsoGerencia(ctx, caja.empresa_id, actor.actorUserId);
  } else {
    await assertCanCargarComprobanteTesoreria(
      ctx,
      caja.empresa_id,
      actor.actorUserId,
      actor.actorRol
    );
  }

  return etapa;
}

async function listAdjuntosReembolso(
  ctx: QueryCtx | MutationCtx,
  reembolsoId: Id<"cajasMenoresReembolsos">
) {
  return await ctx.db
    .query("cajasMenoresReembolsoAdjuntos")
    .withIndex("by_reembolsoId", (q) => q.eq("reembolsoId", reembolsoId))
    .collect();
}

async function confirmarAdjuntosBorradorFase(
  ctx: MutationCtx,
  reembolsoId: Id<"cajasMenoresReembolsos">,
  etapa: ReembolsoAdjuntoEtapa
) {
  const adjuntos = await listAdjuntosReembolso(ctx, reembolsoId);
  for (const adjunto of adjuntos) {
    if (adjunto.etapa !== etapa) continue;
    if (getAdjuntoEstado(adjunto) !== "borrador") continue;
    await ctx.db.patch("cajasMenoresReembolsoAdjuntos", adjunto._id, { estado: "confirmado" });
  }
}

async function guardarAdjuntosReembolso(
  ctx: MutationCtx,
  args: {
    reembolsoId: Id<"cajasMenoresReembolsos">;
    adjuntos?: Array<{
      storageId: Id<"_storage">;
      nombre: string;
      mimeType?: string;
    }>;
    etapa: ReembolsoAdjuntoEtapa;
    actor: Actor & { actorUserId: string };
    now: number;
    eventoId?: Id<"cajasMenoresReembolsoEventos">;
  }
) {
  if (!args.adjuntos?.length) return;
  const existentes = await listAdjuntosReembolso(ctx, args.reembolsoId);
  const byStorageId = new Map(
    existentes
      .filter((adjunto) => adjunto.etapa === args.etapa)
      .map((adjunto) => [String(adjunto.storageId), adjunto] as const)
  );

  for (const adjunto of args.adjuntos) {
    const metadata = await ctx.db.system.get("_storage", adjunto.storageId);
    if (!metadata) {
      throw new Error("El archivo subido no está disponible en almacenamiento.");
    }
    const mimeType = getReembolsoAdjuntoMimeType(metadata, adjunto.nombre, adjunto.mimeType);
    const storageKey = String(adjunto.storageId);
    const existente = byStorageId.get(storageKey);
    if (existente) {
      if (getAdjuntoEstado(existente) === "borrador") {
        await ctx.db.patch("cajasMenoresReembolsoAdjuntos", existente._id, { estado: "confirmado" });
      }
      continue;
    }
    await ctx.db.insert("cajasMenoresReembolsoAdjuntos", {
      reembolsoId: args.reembolsoId,
      storageId: adjunto.storageId,
      nombre: adjunto.nombre.trim(),
      mimeType,
      etapa: args.etapa,
      estado: "confirmado",
      actorUserId: args.actor.actorUserId,
      actorNombre: args.actor.actorNombre,
      actorEmail: normalizeEmail(args.actor.actorEmail),
      eventoId: args.eventoId,
      creadoEn: args.now,
    });
  }
}

type ReembolsoAdjuntoConUrl = {
  _id: Id<"cajasMenoresReembolsoAdjuntos">;
  storageId: Id<"_storage">;
  nombre: string;
  mimeType?: string;
  etapa: ReembolsoAdjuntoEtapa;
  estado?: ReembolsoAdjuntoEstado;
  actorUserId?: string;
  actorNombre: string;
  actorEmail: string;
  eventoId?: Id<"cajasMenoresReembolsoEventos">;
  creadoEn: number;
  url: string | null;
};

type ReembolsoTimelineEvento = {
  id: string;
  etapa:
    | "solicitud"
    | "aprobacion_lider"
    | "revision"
    | "contabilidad"
    | "eventos_dian"
    | "aprobacion"
    | "tesoreria"
    | "recibido";
  tipo: "creado" | "aprobado" | "rechazado" | "devuelto" | "movido" | "comprobante" | "recibido";
  titulo: string;
  fecha: number;
  usuarioNombre: string;
  usuarioEmail?: string;
  comentario?: string;
  adjuntos: Array<{
    nombre: string;
    url: string | null;
    mimeType?: string;
  }>;
};

function adjuntosPorEtapa(adjuntos: ReembolsoAdjuntoConUrl[], etapa: ReembolsoAdjuntoEtapa) {
  return adjuntos
    .filter(
      (adjunto) => adjunto.etapa === etapa && isAdjuntoConfirmado(adjunto) && !adjunto.eventoId
    )
    .map((adjunto) => ({
      nombre: adjunto.nombre,
      url: adjunto.url,
      mimeType: adjunto.mimeType,
    }));
}

function adjuntosPorEvento(
  adjuntos: ReembolsoAdjuntoConUrl[],
  eventoId: Id<"cajasMenoresReembolsoEventos">
) {
  return adjuntos
    .filter((adjunto) => adjunto.eventoId === eventoId && isAdjuntoConfirmado(adjunto))
    .map((adjunto) => ({
      nombre: adjunto.nombre,
      url: adjunto.url,
      mimeType: adjunto.mimeType,
    }));
}

function buildReembolsoTimeline(
  reembolso: Doc<"cajasMenoresReembolsos">,
  adjuntos: ReembolsoAdjuntoConUrl[],
  eventosPersistidos: Array<Doc<"cajasMenoresReembolsoEventos">> = []
): ReembolsoTimelineEvento[] {
  const eventos: ReembolsoTimelineEvento[] = [];

  eventos.push({
    id: "solicitud",
    etapa: "solicitud",
    tipo: "creado",
    titulo: "Solicitud creada",
    fecha: reembolso.creadoEn,
    usuarioNombre: reembolso.custodioNombre,
    usuarioEmail: reembolso.custodioEmail,
    comentario: reembolso.solicitudComentario,
    adjuntos: [],
  });

  if (reembolso.liderDecisionEn) {
    const rechazadoPorLider =
      reembolso.estado === "rechazado" &&
      !reembolso.reviewerDecisionEn &&
      !reembolso.contadorDecisionEn &&
      !reembolso.gfDecisionEn;
    eventos.push({
      id: "aprobacion_lider",
      etapa: "aprobacion_lider",
      tipo: rechazadoPorLider ? "rechazado" : "aprobado",
      titulo: rechazadoPorLider ? "Rechazado por líder custodio" : "Aprobado por líder custodio",
      fecha: reembolso.liderDecisionEn,
      usuarioNombre: reembolso.liderAprobadorNombre ?? "Líder custodio",
      usuarioEmail: reembolso.liderAprobadorEmail,
      comentario: reembolso.liderComentario,
      adjuntos: [],
    });
  }

  if (
    reembolso.reviewAssignedEn &&
    reembolso.reviewAssignedNombre &&
    !reembolso.reviewerDecisionEn
  ) {
    eventos.push({
      id: "asignacion_revision",
      etapa: "revision",
      tipo: "creado",
      titulo: `Asignado a ${reembolso.reviewAssignedNombre}`,
      fecha: reembolso.reviewAssignedEn,
      usuarioNombre: reembolso.reviewAssignedByNombre ?? reembolso.reviewAssignedNombre,
      usuarioEmail: reembolso.reviewAssignedEmail,
      comentario: reembolso.reviewAssignmentComentario,
      adjuntos: [],
    });
  }

  const revisionEventos = eventosPersistidos
    .filter((evento) => evento.etapa === "revision")
    .slice(-REEMBOLSO_EVENTOS_TIMELINE_LIMIT);
  const hasRevisionGerenciaEventos = revisionEventos.some(
    (evento) => evento.tipo === "aprobacion" && evento.destinoEtapa === "gerencia"
  );

  if (reembolso.reviewerDecisionEn) {
    const rechazadoEnRevision =
      reembolso.estado === "rechazado" && !reembolso.contadorDecisionEn && !reembolso.gfDecisionEn;
    const enviadoAContabilidad =
      Boolean(reembolso.contadorAsignadoUserId) ||
      Boolean(reembolso.contadorDecisionEn) ||
      reembolso.estado === "pendiente_revision_impuestos";
    if (rechazadoEnRevision || !hasRevisionGerenciaEventos) {
      eventos.push({
        id: "revision",
        etapa: "revision",
        tipo: rechazadoEnRevision ? "rechazado" : "aprobado",
        titulo: rechazadoEnRevision
          ? "Rechazado por Revisor Caja Menor"
          : enviadoAContabilidad
            ? "Enviado a Contabilidad por Revisor Caja Menor"
            : "Aprobado por Revisor Caja Menor",
        fecha: reembolso.reviewerDecisionEn,
        usuarioNombre: reembolso.reviewerNombre ?? "Revisor Caja Menor",
        usuarioEmail: reembolso.reviewerEmail,
        // When sent to Contabilidad, the transition comment lives only on the
        // "Asignado a Contabilidad" event to avoid duplicating it in the timeline.
        comentario: enviadoAContabilidad ? undefined : reembolso.reviewerComentario,
        adjuntos: adjuntosPorEtapa(adjuntos, "revision"),
      });
    }
  }

  for (const evento of revisionEventos) {
    if (evento.tipo === "aprobacion" && evento.destinoEtapa === "gerencia") {
      eventos.push({
        id: `revision_gerencia_${evento._id}`,
        etapa: "revision",
        tipo: "aprobado",
        titulo: "Reenviado a Gerencia Financiera por Revisor Caja Menor",
        fecha: evento.creadoEn,
        usuarioNombre: evento.actorNombre,
        usuarioEmail: evento.actorEmail,
        comentario: evento.comentario,
        adjuntos: adjuntosPorEvento(adjuntos, evento._id),
      });
    }
  }

  const contabilidadEventos = eventosPersistidos
    .filter((evento) => evento.etapa === "contabilidad")
    .slice(-REEMBOLSO_EVENTOS_TIMELINE_LIMIT);
  const hasContabilidadEventos = contabilidadEventos.length > 0;

  for (const evento of contabilidadEventos) {
    const adjuntosContabilidad =
      evento.tipo === "aprobacion" || evento.tipo === "rechazo" || evento.tipo === "devolucion"
        ? adjuntosPorEvento(adjuntos, evento._id).length > 0
          ? adjuntosPorEvento(adjuntos, evento._id)
          : adjuntosPorEtapa(adjuntos, "contabilidad")
        : [];
    if (evento.tipo === "asignacion") {
      eventos.push({
        id: `contabilidad_asignacion_${evento._id}`,
        etapa: "contabilidad",
        tipo: "creado",
        titulo: `Asignado a Contabilidad · ${evento.destinatarioNombre ?? "contador"}`,
        fecha: evento.creadoEn,
        usuarioNombre: evento.actorNombre,
        usuarioEmail: evento.actorEmail,
        comentario: evento.comentario,
        adjuntos: [],
      });
      continue;
    }
    if (evento.tipo === "movimiento") {
      eventos.push({
        id: `contabilidad_movimiento_${evento._id}`,
        etapa: "contabilidad",
        tipo: "movido",
        titulo: `Movido a ${evento.destinatarioNombre ?? "otro contador"}`,
        fecha: evento.creadoEn,
        usuarioNombre: evento.actorNombre,
        usuarioEmail: evento.actorEmail,
        comentario: evento.comentario,
        adjuntos: [],
      });
      continue;
    }
    if (evento.tipo === "aprobacion") {
      const titulo =
        evento.origen === "salto_fases_consecutivas"
          ? evento.etapa === "contabilidad"
            ? "Contabilidad completada automáticamente por roles consecutivos"
            : evento.etapa === "eventos_dian"
              ? "Eventos DIAN completada automáticamente por roles consecutivos"
              : "Aprobado por roles consecutivos"
          : evento.destinoEtapa === "eventos_dian"
            ? "Enviado a Eventos DIAN por Impuestos/Contabilidad"
            : evento.destinoEtapa === "gerencia"
              ? "Reenviado directamente a Gerencia Financiera por Impuestos/Contabilidad"
              : "Aprobado por Impuestos/Contabilidad";
      eventos.push({
        id: `contabilidad_aprobacion_${evento._id}`,
        etapa: "contabilidad",
        tipo: "aprobado",
        titulo,
        fecha: evento.creadoEn,
        usuarioNombre: evento.actorNombre,
        usuarioEmail: evento.actorEmail,
        comentario: evento.comentario,
        adjuntos: adjuntosContabilidad,
      });
      continue;
    }
    if (evento.tipo === "devolucion") {
      eventos.push({
        id: `contabilidad_devolucion_${evento._id}`,
        etapa: "contabilidad",
        tipo: "devuelto",
        titulo: "Devuelto a Revisor Caja Menor",
        fecha: evento.creadoEn,
        usuarioNombre: evento.actorNombre,
        usuarioEmail: evento.actorEmail,
        comentario: evento.comentario,
        adjuntos: adjuntosContabilidad,
      });
      continue;
    }
    eventos.push({
      id: `contabilidad_rechazo_${evento._id}`,
      etapa: "contabilidad",
      tipo: "rechazado",
      titulo: "Rechazado por Impuestos/Contabilidad",
      fecha: evento.creadoEn,
      usuarioNombre: evento.actorNombre,
      usuarioEmail: evento.actorEmail,
      comentario: evento.comentario,
      adjuntos: adjuntosContabilidad,
    });
  }

  if (!hasContabilidadEventos && reembolso.contadorAsignadoEn && reembolso.contadorAsignadoNombre) {
    eventos.push({
      id: "asignacion_contabilidad",
      etapa: "contabilidad",
      tipo: "creado",
      titulo: `Asignado a Contabilidad · ${reembolso.contadorAsignadoNombre}`,
      fecha: reembolso.contadorAsignadoEn,
      usuarioNombre: reembolso.contadorAsignadoByNombre ?? reembolso.contadorAsignadoNombre,
      usuarioEmail: reembolso.contadorAsignadoEmail,
      comentario: reembolso.contadorAsignacionComentario,
      adjuntos: [],
    });
  }

  if (!hasContabilidadEventos && reembolso.contadorDecisionEn) {
    const rechazadoEnContabilidad = reembolso.estado === "rechazado" && !reembolso.gfDecisionEn;
    eventos.push({
      id: "contabilidad",
      etapa: "contabilidad",
      tipo: rechazadoEnContabilidad ? "rechazado" : "aprobado",
      titulo: rechazadoEnContabilidad
        ? "Rechazado por Impuestos/Contabilidad"
        : "Aprobado por Impuestos/Contabilidad",
      fecha: reembolso.contadorDecisionEn,
      usuarioNombre: reembolso.contadorNombre ?? "Contabilidad",
      usuarioEmail: reembolso.contadorEmail,
      comentario: reembolso.contadorComentario,
      adjuntos: adjuntosPorEtapa(adjuntos, "contabilidad"),
    });
  }

  const eventosDianEventos = eventosPersistidos
    .filter((evento) => evento.etapa === "eventos_dian")
    .slice(-REEMBOLSO_EVENTOS_TIMELINE_LIMIT);
  const hasEventosDianEventos = eventosDianEventos.length > 0;

  for (const evento of eventosDianEventos) {
    const adjuntosEventosDian =
      evento.tipo === "aprobacion" || evento.tipo === "rechazo" || evento.tipo === "devolucion"
        ? adjuntosPorEvento(adjuntos, evento._id).length > 0
          ? adjuntosPorEvento(adjuntos, evento._id)
          : adjuntosPorEtapa(adjuntos, "eventos_dian")
        : [];
    if (evento.tipo === "asignacion") {
      eventos.push({
        id: `eventos_dian_asignacion_${evento._id}`,
        etapa: "eventos_dian",
        tipo: "creado",
        titulo: `Asignado a Eventos DIAN · ${evento.destinatarioNombre ?? "responsable"}`,
        fecha: evento.creadoEn,
        usuarioNombre: evento.actorNombre,
        usuarioEmail: evento.actorEmail,
        comentario: evento.comentario,
        adjuntos: [],
      });
      continue;
    }
    if (evento.tipo === "movimiento") {
      eventos.push({
        id: `eventos_dian_movimiento_${evento._id}`,
        etapa: "eventos_dian",
        tipo: "movido",
        titulo: `Movido a ${evento.destinatarioNombre ?? "otro responsable"}`,
        fecha: evento.creadoEn,
        usuarioNombre: evento.actorNombre,
        usuarioEmail: evento.actorEmail,
        comentario: evento.comentario,
        adjuntos: [],
      });
      continue;
    }
    if (evento.tipo === "aprobacion") {
      eventos.push({
        id: `eventos_dian_aprobacion_${evento._id}`,
        etapa: "eventos_dian",
        tipo: "aprobado",
        titulo:
          evento.origen === "salto_fases_consecutivas"
            ? "Eventos DIAN completada automáticamente por roles consecutivos"
            : "Enviado a Gerencia Financiera por Eventos DIAN",
        fecha: evento.creadoEn,
        usuarioNombre: evento.actorNombre,
        usuarioEmail: evento.actorEmail,
        comentario: evento.comentario,
        adjuntos: adjuntosEventosDian,
      });
      continue;
    }
    if (evento.tipo === "devolucion") {
      eventos.push({
        id: `eventos_dian_devolucion_${evento._id}`,
        etapa: "eventos_dian",
        tipo: "devuelto",
        titulo: "Devuelto a Impuestos/Contabilidad por Eventos DIAN",
        fecha: evento.creadoEn,
        usuarioNombre: evento.actorNombre,
        usuarioEmail: evento.actorEmail,
        comentario: evento.comentario,
        adjuntos: adjuntosEventosDian,
      });
      continue;
    }
    eventos.push({
      id: `eventos_dian_rechazo_${evento._id}`,
      etapa: "eventos_dian",
      tipo: "rechazado",
      titulo: "Rechazado por Eventos DIAN",
      fecha: evento.creadoEn,
      usuarioNombre: evento.actorNombre,
      usuarioEmail: evento.actorEmail,
      comentario: evento.comentario,
      adjuntos: adjuntosEventosDian,
    });
  }

  if (
    !hasEventosDianEventos &&
    reembolso.eventosDianAsignadoEn &&
    reembolso.eventosDianAsignadoNombre
  ) {
    eventos.push({
      id: "asignacion_eventos_dian",
      etapa: "eventos_dian",
      tipo: "creado",
      titulo: `Asignado a Eventos DIAN · ${reembolso.eventosDianAsignadoNombre}`,
      fecha: reembolso.eventosDianAsignadoEn,
      usuarioNombre: reembolso.eventosDianAsignadoByNombre ?? reembolso.eventosDianAsignadoNombre,
      usuarioEmail: reembolso.eventosDianAsignadoEmail,
      comentario: reembolso.eventosDianAsignacionComentario,
      adjuntos: [],
    });
  }

  const aprobacionEventos = eventosPersistidos
    .filter((evento) => evento.etapa === "aprobacion")
    .slice(-REEMBOLSO_EVENTOS_TIMELINE_LIMIT);
  const hasAprobacionEventos = aprobacionEventos.length > 0;

  for (const evento of aprobacionEventos) {
    const adjuntosAprobacion =
      evento.tipo === "aprobacion" || evento.tipo === "rechazo" || evento.tipo === "devolucion"
        ? adjuntosPorEvento(adjuntos, evento._id).length > 0
          ? adjuntosPorEvento(adjuntos, evento._id)
          : adjuntosPorEtapa(adjuntos, "aprobacion")
        : [];
    if (evento.tipo === "devolucion") {
      eventos.push({
        id: `aprobacion_devolucion_${evento._id}`,
        etapa: "aprobacion",
        tipo: "devuelto",
        titulo:
          evento.destinoEtapa === "contabilidad"
            ? "Devuelto por Gerencia Financiera a Impuestos/Contabilidad"
            : evento.destinoEtapa === "eventos_dian"
              ? "Devuelto por Gerencia Financiera a Eventos DIAN"
              : "Devuelto por Gerencia Financiera a Revisor Caja Menor",
        fecha: evento.creadoEn,
        usuarioNombre: evento.actorNombre,
        usuarioEmail: evento.actorEmail,
        comentario: evento.comentario,
        adjuntos: adjuntosAprobacion,
      });
      continue;
    }
    if (evento.tipo === "aprobacion") {
      eventos.push({
        id: `aprobacion_evento_${evento._id}`,
        etapa: "aprobacion",
        tipo: "aprobado",
        titulo: "Aprobado por Gerencia Financiera",
        fecha: evento.creadoEn,
        usuarioNombre: evento.actorNombre,
        usuarioEmail: evento.actorEmail,
        comentario: evento.comentario,
        adjuntos: adjuntosAprobacion,
      });
      continue;
    }
    if (evento.tipo === "rechazo") {
      eventos.push({
        id: `aprobacion_rechazo_${evento._id}`,
        etapa: "aprobacion",
        tipo: "rechazado",
        titulo: "Rechazado por Gerencia Financiera",
        fecha: evento.creadoEn,
        usuarioNombre: evento.actorNombre,
        usuarioEmail: evento.actorEmail,
        comentario: evento.comentario,
        adjuntos: adjuntosAprobacion,
      });
    }
  }

  if (!hasAprobacionEventos && reembolso.gfDecisionEn) {
    const rechazadoEnGerencia = reembolso.estado === "rechazado";
    eventos.push({
      id: "aprobacion",
      etapa: "aprobacion",
      tipo: rechazadoEnGerencia ? "rechazado" : "aprobado",
      titulo: rechazadoEnGerencia
        ? "Rechazado por Gerencia Financiera"
        : "Aprobado por Gerencia Financiera",
      fecha: reembolso.gfDecisionEn,
      usuarioNombre: reembolso.gfAprobadorNombre ?? "Gerencia Financiera",
      usuarioEmail: reembolso.gfAprobadorEmail,
      comentario: reembolso.gfComentario,
      adjuntos: adjuntosPorEtapa(adjuntos, "aprobacion"),
    });
  }

  if (reembolso.comprobanteCargadoEn) {
    eventos.push({
      id: "tesoreria",
      etapa: "tesoreria",
      tipo: "comprobante",
      titulo: "Comprobante de pago cargado",
      fecha: reembolso.comprobanteCargadoEn,
      usuarioNombre:
        reembolso.comprobanteCargadoPorNombre ?? reembolso.tesoreroNombre ?? "Tesorería",
      usuarioEmail: reembolso.comprobanteCargadoPorEmail ?? reembolso.tesoreroEmail,
      comentario: reembolso.comprobanteComentario,
      adjuntos: adjuntosPorEtapa(adjuntos, "tesoreria"),
    });
  } else if (
    reembolso.estado === "recibido" &&
    reembolso.recibidoEn &&
    !reembolso.comprobanteCargadoEn
  ) {
    eventos.push({
      id: "recibido",
      etapa: "recibido",
      tipo: "recibido",
      titulo: "Recibo confirmado (legacy)",
      fecha: reembolso.recibidoEn,
      usuarioNombre: reembolso.custodioNombre,
      usuarioEmail: reembolso.custodioEmail,
      comentario: reembolso.custodioComentario,
      adjuntos: [],
    });
  }

  return eventos.sort((a, b) => a.fecha - b.fecha);
}

function assertCanGenerateReembolso(caja: Doc<"cajasMenores">, actorUserId: string) {
  if (!caja.assignedUsersIds.includes(actorUserId)) {
    throw new Error("Sólo el custodio/líder asignado a la Caja Menor puede generar reembolsos.");
  }
}

async function getCajaSaldos(ctx: QueryCtx | MutationCtx, cajaId: Id<"cajasMenores">) {
  const refills = await ctx.db
    .query("cajasMenoresRefills")
    .withIndex("by_cajaMenorId", (q) => q.eq("cajaMenorId", cajaId))
    .collect();
  const movimientos = await ctx.db
    .query("facturacionCajaMenorMovimientos")
    .withIndex("by_cajaMenorId", (q) => q.eq("cajaMenorId", cajaId))
    .collect();
  const reembolsosRecibidos = await ctx.db
    .query("cajasMenoresReembolsos")
    .withIndex("by_cajaMenorId_estado", (q) => q.eq("cajaMenorId", cajaId).eq("estado", "recibido"))
    .collect();
  const legacyLegalizaciones = await ctx.db
    .query("facturacionCajaMenorLegalizaciones")
    .withIndex("by_cajaMenorId_estado", (q) => q.eq("cajaMenorId", cajaId).eq("estado", "activa"))
    .collect();
  const totalRefills = refills.reduce(
    (total, refill) => total + (refill.receiptConfirmed ? Math.max(0, refill.refillValue) : 0),
    0
  );
  const totalReembolsado = reembolsosRecibidos.reduce(
    (total, reembolso) => total + Math.max(0, reembolso.valorTotal),
    0
  );
  const totalMovimientos = movimientos.reduce(
    (total, movimiento) =>
      total + (movimiento.estado !== "anulado" ? Math.max(0, movimiento.valor) : 0),
    0
  );
  const totalLegacyLegalizado = legacyLegalizaciones.reduce(
    (total, legalizacion) => total + Math.max(0, legalizacion.valorAplicado),
    0
  );
  const totalLegalizado = totalMovimientos + totalLegacyLegalizado;
  const refillPendiente = refills.some((refill) => !refill.receiptConfirmed);

  return {
    refills,
    movimientos,
    reembolsosRecibidos,
    legacyLegalizaciones,
    totalRefills,
    totalReembolsado,
    totalLegalizado,
    refillPendiente,
  };
}

async function enrichCaja(ctx: QueryCtx | MutationCtx, caja: Doc<"cajasMenores">) {
  const saldos = await getCajaSaldos(ctx, caja._id);
  const saldoActual =
    caja.assignedValue + saldos.totalRefills + saldos.totalReembolsado - saldos.totalLegalizado;
  const cerrada = caja.estado === "cerrada";
  return {
    ...caja,
    estado: caja.estado ?? "activa",
    totalRefills: saldos.totalRefills,
    totalReembolsado: saldos.totalReembolsado,
    totalLegalizado: saldos.totalLegalizado,
    saldoActual,
    saldoDisponible: cerrada || saldos.refillPendiente ? 0 : saldoActual,
    refillPendiente: saldos.refillPendiente,
    movimientosCount:
      saldos.movimientos.filter((movimiento) => movimiento.estado !== "anulado").length +
      saldos.legacyLegalizaciones.length,
    refillsCount: saldos.refills.length,
  };
}

function dedupeUsuarios(usuarios: Array<{ userId: string; nombre: string; email: string }>) {
  const seen = new Set<string>();
  return usuarios
    .map((usuario) => ({
      userId: usuario.userId,
      nombre: usuario.nombre.trim() || usuario.userId,
      email: normalizeEmail(usuario.email || fallbackContactEmail()),
    }))
    .filter((usuario) => {
      if (!usuario.userId || seen.has(usuario.userId)) return false;
      seen.add(usuario.userId);
      return true;
    });
}

function normalizeDocumentToken(value: string) {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase();
  return normalized || value.trim().toUpperCase();
}

async function getMovimientoActivoFactura(
  ctx: QueryCtx | MutationCtx,
  facturaId: Id<"facturacionFacturas">
) {
  const movimientos = await ctx.db
    .query("facturacionCajaMenorMovimientos")
    .withIndex("by_facturaId", (q) => q.eq("facturaId", facturaId))
    .collect();
  return movimientos.find((movimiento) => movimiento.estado !== "anulado") ?? null;
}

async function getMovimientosByIds(
  ctx: QueryCtx | MutationCtx,
  movimientoIds: Array<Id<"facturacionCajaMenorMovimientos">>
) {
  const movimientos = await Promise.all(
    movimientoIds.map((movimientoId) => ctx.db.get("facturacionCajaMenorMovimientos", movimientoId))
  );
  return movimientos.filter((movimiento): movimiento is Doc<"facturacionCajaMenorMovimientos"> =>
    Boolean(movimiento)
  );
}

function getSolicitanteReembolsoRecipient(
  reembolso: Doc<"cajasMenoresReembolsos">
): NotificacionDestinatario {
  return {
    usuarioId: reembolso.custodioUserId,
    nombre: reembolso.custodioNombre,
    email: reembolso.custodioEmail,
  };
}

async function getTareaByFactura(
  ctx: QueryCtx | MutationCtx,
  facturaId: Id<"facturacionFacturas">
) {
  return await ctx.db
    .query("facturacionTareas")
    .withIndex("by_facturaId", (q) => q.eq("facturaId", facturaId))
    .unique();
}

function getMovimientoDistribucionCompleta(
  movimiento: Doc<"facturacionCajaMenorMovimientos">
): CentroCostoDistribucionRow[] {
  if (movimiento.centrosCostoDistribucion?.length) {
    return movimiento.centrosCostoDistribucion;
  }
  return [
    {
      centroCostoId: movimiento.centroCostoId,
      centroCostoCodigo: movimiento.centroCostoCodigo,
      centroCostoNombre: movimiento.centroCostoNombre,
      valor: movimiento.valor,
    },
  ];
}

function distribucionEsIgual(
  left: CentroCostoDistribucionRow[],
  right: CentroCostoDistribucionRow[]
) {
  const normalize = (rows: CentroCostoDistribucionRow[]) =>
    rows
      .map((row) => ({
        centroCostoId: row.centroCostoId?.trim() || undefined,
        centroCostoCodigo: row.centroCostoCodigo.trim(),
        centroCostoNombre: row.centroCostoNombre.trim(),
        valor: roundCOP(row.valor),
      }))
      .sort((a, b) =>
        `${a.centroCostoCodigo}\u0000${a.centroCostoNombre}\u0000${a.valor}`.localeCompare(
          `${b.centroCostoCodigo}\u0000${b.centroCostoNombre}\u0000${b.valor}`
        )
      );
  const normalizedLeft = normalize(left);
  const normalizedRight = normalize(right);
  if (normalizedLeft.length !== normalizedRight.length) return false;
  return normalizedLeft.every((row, index) => {
    const other = normalizedRight[index]!;
    return (
      row.centroCostoId === other.centroCostoId &&
      row.centroCostoCodigo === other.centroCostoCodigo &&
      row.centroCostoNombre === other.centroCostoNombre &&
      row.valor === other.valor
    );
  });
}

async function aplicarAjustesValorContableReembolso(
  ctx: MutationCtx,
  args: {
    reembolso: Doc<"cajasMenoresReembolsos">;
    caja: Doc<"cajasMenores">;
    movimientos: Doc<"facturacionCajaMenorMovimientos">[];
    ajustesValorContable?: ReembolsoAjusteValorContable[];
    comentario?: string;
    actor: Actor & { actorUserId: string };
    now: number;
  }
): Promise<{
  movimientos: Doc<"facturacionCajaMenorMovimientos">[];
  reembolso: Doc<"cajasMenoresReembolsos">;
  valorTotal: number;
  cambiosPorMovimiento: Map<string, ValorContableCambio>;
}> {
  const ajustes = args.ajustesValorContable ?? [];
  const movimientosById = new Map(
    args.movimientos.map((movimiento) => [String(movimiento._id), movimiento])
  );
  const cambiosPorMovimiento = new Map<string, ValorContableCambio>();

  if (ajustes.length === 0) {
    return {
      movimientos: args.movimientos,
      reembolso: args.reembolso,
      valorTotal: args.reembolso.valorTotal,
      cambiosPorMovimiento,
    };
  }

  if (!ESTADOS_EDICION_VALOR_CONTABLE_REEMBOLSO.has(args.reembolso.estado)) {
    throw new Error("No puedes ajustar el valor contable en esta fase del reembolso.");
  }

  const ajustesByMovimientoId = new Map<string, ReembolsoAjusteValorContable>();
  for (const ajuste of ajustes) {
    const key = String(ajuste.movimientoId);
    if (ajustesByMovimientoId.has(key)) {
      throw new Error("No repitas movimientos al ajustar el valor contable.");
    }
    ajustesByMovimientoId.set(key, ajuste);
  }

  for (const movimientoId of ajustesByMovimientoId.keys()) {
    if (!args.reembolso.movimientoIds.some((id) => String(id) === movimientoId)) {
      throw new Error("Uno de los movimientos no pertenece a este reembolso.");
    }
  }

  let deltaAgregado = 0;
  const cambiosPendientes: Array<{
    movimiento: Doc<"facturacionCajaMenorMovimientos">;
    factura: Doc<"facturacionFacturas">;
    valorAnterior: number;
    valorNuevo: number;
    resolvedCentrosCosto: ReturnType<typeof resolveCentrosCostoFromInput>;
  }> = [];

  for (const ajuste of ajustes) {
    const movimiento = movimientosById.get(String(ajuste.movimientoId));
    if (!movimiento) {
      throw new Error("Uno de los movimientos del reembolso no existe.");
    }
    if (
      movimiento.reembolsoId !== args.reembolso._id ||
      movimiento.estado !== "en_reembolso"
    ) {
      throw new Error("Uno de los movimientos ya no está en reembolso.");
    }

    const valorContableInput = ajuste.valorContableNuevo;
    if (
      !Number.isFinite(valorContableInput) ||
      !Number.isInteger(valorContableInput) ||
      valorContableInput < 1
    ) {
      throw new Error("El valor contable debe ser un entero mayor o igual a $1 COP.");
    }
    const valorNuevo = roundCOP(valorContableInput);

    const valorAnterior = movimiento.valor;
    const distribucionAnterior = getMovimientoDistribucionCompleta(movimiento);
    const resolvedCentrosCosto = resolveCentrosCostoFromInput({
      centroCostoId: ajuste.centroCostoId,
      centroCostoCodigo: ajuste.centroCostoCodigo,
      centroCostoNombre: ajuste.centroCostoNombre,
      centrosCostoDistribucion: ajuste.centrosCostoDistribucion,
      valorTotal: valorNuevo,
    });

    const valorCambio = valorNuevo !== valorAnterior;
    const distribucionCambio = !distribucionEsIgual(
      distribucionAnterior,
      resolvedCentrosCosto.centrosCostoDistribucion
    );

    if (!valorCambio && !distribucionCambio) {
      continue;
    }
    if (!valorCambio && distribucionCambio) {
      throw new Error(
        "Para cambiar la distribución de centros de costo debes ajustar el valor contable."
      );
    }

    const factura = await ctx.db.get("facturacionFacturas", movimiento.facturaId);
    if (!factura) throw new Error("Factura no encontrada.");

    const empresaFactura = factura.empresa ?? DEFAULT_EMPRESA;
    if (empresaFactura !== args.caja.empresa_id) {
      throw new Error("La Caja Menor pertenece a otra empresa.");
    }

    assertCentrosCostoIdentityTransitionForEmpresa({
      previous: getStoredCentrosCostoIdentities(movimiento),
      next: resolvedCentrosCosto.centrosCostoDistribucion,
      appEmpresa: empresaFactura,
    });

    deltaAgregado += valorNuevo - valorAnterior;
    cambiosPendientes.push({
      movimiento,
      factura,
      valorAnterior,
      valorNuevo,
      resolvedCentrosCosto,
    });
  }

  if (cambiosPendientes.length > 0 && !args.comentario?.trim()) {
    throw new Error("Debes registrar un comentario cuando ajustas el valor contable.");
  }

  if (deltaAgregado > 0) {
    const saldo = await enrichCaja(ctx, args.caja);
    if (saldo.refillPendiente) {
      throw new Error("Esta Caja Menor tiene un refill manual pendiente de confirmación.");
    }
    const permitirSaldoNegativo = await empresaPermiteSaldoNegativo(
      ctx,
      normalizeEmpresa(args.caja.empresa_id)
    );
    if (!permitirSaldoNegativo && saldo.saldoDisponible + 0.001 < deltaAgregado) {
      throwSaldoInsuficienteCajaMenor({
        cajaNombre: args.caja.nombre,
        saldoDisponible: saldo.saldoDisponible,
        valorRequerido: deltaAgregado,
      });
    }
  }

  const movimientosActualizados = [...args.movimientos];
  const movimientosActualizadosById = new Map(
    movimientosActualizados.map((movimiento) => [String(movimiento._id), movimiento])
  );

  for (const cambio of cambiosPendientes) {
    const { movimiento, factura, valorAnterior, valorNuevo, resolvedCentrosCosto } = cambio;
    await patchMovimientoConBandeja(ctx, movimiento._id, {
      valor: valorNuevo,
      centroCostoId: resolvedCentrosCosto.centroCostoId,
      centroCostoCodigo: resolvedCentrosCosto.centroCostoCodigo,
      centroCostoNombre: resolvedCentrosCosto.centroCostoNombre,
      centrosCostoDistribucion: resolvedCentrosCosto.centrosCostoDistribucion,
      actualizadoEn: args.now,
    });
    await ctx.db.patch("facturacionFacturas", factura._id, {
      valorContable: valorNuevo,
      valorContableActualizadoEn: args.now,
      valorContableActualizadoPorUserId: args.actor.actorUserId,
      valorContableActualizadoPorNombre: args.actor.actorNombre,
      valorContableActualizadoPorEmail: normalizeEmail(args.actor.actorEmail),
      centroCostoCodigo: resolvedCentrosCosto.centroCostoCodigo,
      centroCostoNombre: resolvedCentrosCosto.centroCostoNombre,
      centrosCostoDistribucion: resolvedCentrosCosto.centrosCostoDistribucion,
      actualizadoEn: args.now,
    });
    await refrescarProyeccionFactura(ctx, factura._id, args.now);

    const movimientoActualizado = {
      ...movimiento,
      valor: valorNuevo,
      centroCostoId: resolvedCentrosCosto.centroCostoId,
      centroCostoCodigo: resolvedCentrosCosto.centroCostoCodigo,
      centroCostoNombre: resolvedCentrosCosto.centroCostoNombre,
      centrosCostoDistribucion: resolvedCentrosCosto.centrosCostoDistribucion,
      actualizadoEn: args.now,
    };
    movimientosActualizadosById.set(String(movimiento._id), movimientoActualizado);
    cambiosPorMovimiento.set(String(movimiento._id), {
      valorAnterior,
      valorNuevo,
      moneda: factura.moneda,
    });
  }

  const movimientosFinales = args.reembolso.movimientoIds.map(
    (movimientoId) => movimientosActualizadosById.get(String(movimientoId))!
  );
  const valorTotal = movimientosFinales.reduce(
    (total, movimiento) => total + Math.max(0, movimiento.valor),
    0
  );

  let reembolsoActualizado: Doc<"cajasMenoresReembolsos"> = args.reembolso;
  if (cambiosPendientes.length > 0) {
    const patchReembolso: Partial<Doc<"cajasMenoresReembolsos">> = {
      valorTotal,
      actualizadoEn: args.now,
    };
    if (args.reembolso.formatoSnapshot) {
      const snapshotMovimientos = args.reembolso.formatoSnapshot.movimientos.map((row) => {
        const movimientoActualizado = movimientosActualizadosById.get(String(row.movimientoId));
        if (!movimientoActualizado) return row;
        const cambio = cambiosPorMovimiento.get(String(row.movimientoId));
        if (!cambio) return row;
        return {
          ...row,
          valor: movimientoActualizado.valor,
          centroCostoCodigo: movimientoActualizado.centroCostoCodigo,
          centroCostoNombre: movimientoActualizado.centroCostoNombre,
          centrosCostoDistribucion: movimientoActualizado.centrosCostoDistribucion,
        };
      });
      patchReembolso.formatoSnapshot = {
        ...args.reembolso.formatoSnapshot,
        valorTotal,
        movimientos: snapshotMovimientos,
      };
    }
    await patchReembolsoConBandeja(ctx, args.reembolso._id, patchReembolso);
    reembolsoActualizado = {
      ...args.reembolso,
      ...patchReembolso,
    } as Doc<"cajasMenoresReembolsos">;
  }

  return {
    movimientos: movimientosFinales,
    reembolso: reembolsoActualizado,
    valorTotal,
    cambiosPorMovimiento,
  };
}

async function aplicarCausacionesReembolso(
  ctx: MutationCtx,
  args: {
    reembolso: Doc<"cajasMenoresReembolsos">;
    movimientos: Doc<"facturacionCajaMenorMovimientos">[];
    causaciones?: Array<{
      movimientoId: Id<"facturacionCajaMenorMovimientos">;
      expectedVersion?: number;
      causado: boolean;
      numeroFp?: string;
    }>;
    actor: ReembolsoAdjuntoActor;
    faseOperativa: string;
    now: number;
  }
) {
  const cambios = new Map<
    string,
    NonNullable<Doc<"facturacionAprobaciones">["causacionCambio"]>
  >();
  const items = args.causaciones ?? [];
  const movimientosById = new Map(
    args.movimientos.map((movimiento) => [String(movimiento._id), movimiento])
  );
  const seen = new Set<string>();

  for (const item of items) {
    const key = String(item.movimientoId);
    if (seen.has(key)) throw new Error("No repitas movimientos al actualizar la causación.");
    seen.add(key);
    const movimiento = movimientosById.get(key);
    if (
      !movimiento ||
      movimiento.reembolsoId !== args.reembolso._id ||
      movimiento.estado !== "en_reembolso"
    ) {
      throw new Error("Uno de los movimientos de causación no pertenece a este reembolso activo.");
    }
    const factura = await ctx.db.get("facturacionFacturas", movimiento.facturaId);
    if (!factura) throw new Error("Factura de movimiento no encontrada.");
    const cambio = await aplicarCausacionEnFactura(ctx, {
      factura,
      input: {
        expectedVersion: item.expectedVersion,
        causado: item.causado,
        numeroFp: item.numeroFp,
      },
      actor: {
        userId: args.actor.actorUserId,
        nombre: args.actor.actorNombre,
        email: args.actor.actorEmail,
      },
      contexto: {
        tipo: "reembolso_caja_menor",
        reembolsoId: args.reembolso._id,
        movimientoId: movimiento._id,
      },
      faseOperativa: args.faseOperativa,
      now: args.now,
    });
    if (cambio) cambios.set(key, cambio);
  }

  if (items.length > 0) {
    await recomputeReembolsoCausacionCounts(ctx, args.reembolso._id, args.now);
  }
  return cambios;
}

async function scheduleProjectionRefreshForMovimientos(
  ctx: MutationCtx,
  movimientos: Array<Pick<Doc<"facturacionCajaMenorMovimientos">, "facturaId">>,
  now = Date.now()
) {
  const facturaIds = [...new Set(movimientos.map((movimiento) => movimiento.facturaId))];
  if (facturaIds.length === 0) return;
  await programarRefrescoProyeccionCajaMenor(ctx, facturaIds, now);
}

async function scheduleProjectionRefreshForReembolso(
  ctx: MutationCtx,
  reembolso: Pick<Doc<"cajasMenoresReembolsos">, "movimientoIds">,
  now = Date.now()
) {
  const movimientos = await getMovimientosByIds(ctx, reembolso.movimientoIds);
  await scheduleProjectionRefreshForMovimientos(ctx, movimientos, now);
}

async function registrarAuditoriaCajaMenor(
  ctx: MutationCtx,
  args: {
    movimiento: Doc<"facturacionCajaMenorMovimientos">;
    accion: Doc<"facturacionAprobaciones">["accion"];
    actor: Actor;
    comentario: string;
    estadoAnterior: string;
    estadoNuevo: string;
    valorContableCambio?: ValorContableCambio;
    causacionCambio?: NonNullable<Doc<"facturacionAprobaciones">["causacionCambio"]>;
    reembolsoId?: Id<"cajasMenoresReembolsos">;
    eventoReembolsoId?: Id<"cajasMenoresReembolsoEventos">;
    responsableDestino?: CajaMenorDestinatario | null;
    tipoEvento?: CajaMenorContexto["tipoEvento"];
    fasesOmitidas?: string[];
    cajaMenorContexto?: CajaMenorContexto;
    creadoEn?: number;
  }
) {
  const tarea = await getTareaByFactura(ctx, args.movimiento.facturaId);
  if (!tarea) return;

  const reembolsoId = args.reembolsoId ?? args.movimiento.reembolsoId;
  const cajaMenorContexto =
    args.cajaMenorContexto ??
    buildCajaMenorContexto({
      movimientoId: args.movimiento._id,
      ...(reembolsoId ? { reembolsoId } : {}),
      ...(args.eventoReembolsoId ? { eventoReembolsoId: args.eventoReembolsoId } : {}),
      faseAnterior: args.estadoAnterior,
      faseNueva: args.estadoNuevo,
      ...(args.tipoEvento ? { tipoEvento: args.tipoEvento } : {}),
      responsableDestino: args.responsableDestino,
      ...(args.fasesOmitidas ? { fasesOmitidas: args.fasesOmitidas } : {}),
      accion: args.accion,
    });

  const hasContext =
    cajaMenorContexto.reembolsoId ||
    cajaMenorContexto.eventoReembolsoId ||
    cajaMenorContexto.responsableDestino ||
    cajaMenorContexto.tipoEvento;

  await ctx.db.insert("facturacionAprobaciones", {
    tareaId: tarea._id,
    facturaId: args.movimiento.facturaId,
    empresa: tarea.empresa,
    ...(args.actor.actorUserId ? { actorUserId: args.actor.actorUserId } : {}),
    actorNombre: args.actor.actorNombre,
    actorEmail: normalizeEmail(args.actor.actorEmail),
    accion: args.accion,
    comentario: args.comentario,
    estadoAnterior: args.estadoAnterior,
    estadoNuevo: args.estadoNuevo,
    ...(args.valorContableCambio ? { valorContableCambio: args.valorContableCambio } : {}),
    ...(args.causacionCambio ? { causacionCambio: args.causacionCambio } : {}),
    ...(hasContext ? { cajaMenorContexto } : {}),
    creadoEn: args.creadoEn ?? Date.now(),
  });
}

async function registrarAuditoriaMovimientosCajaMenor(
  ctx: MutationCtx,
  args: Omit<Parameters<typeof registrarAuditoriaCajaMenor>[1], "movimiento"> & {
    movimientos: Array<Doc<"facturacionCajaMenorMovimientos">>;
  }
) {
  for (const movimiento of args.movimientos) {
    await registrarAuditoriaCajaMenor(ctx, {
      movimiento,
      accion: args.accion,
      actor: args.actor,
      comentario: args.comentario,
      estadoAnterior: args.estadoAnterior,
      estadoNuevo: args.estadoNuevo,
      ...(args.valorContableCambio ? { valorContableCambio: args.valorContableCambio } : {}),
      ...(args.causacionCambio ? { causacionCambio: args.causacionCambio } : {}),
      ...(args.reembolsoId ? { reembolsoId: args.reembolsoId } : {}),
      ...(args.eventoReembolsoId ? { eventoReembolsoId: args.eventoReembolsoId } : {}),
      ...(args.responsableDestino !== undefined ? { responsableDestino: args.responsableDestino } : {}),
      ...(args.tipoEvento ? { tipoEvento: args.tipoEvento } : {}),
      ...(args.fasesOmitidas ? { fasesOmitidas: args.fasesOmitidas } : {}),
      ...(args.cajaMenorContexto ? { cajaMenorContexto: args.cajaMenorContexto } : {}),
      ...(args.creadoEn ? { creadoEn: args.creadoEn } : {}),
    });
  }
}

export async function anularMovimientosCajaMenorFacturaInterno(
  ctx: MutationCtx,
  facturaId: Id<"facturacionFacturas">,
  actor: Actor,
  comentario?: string,
  now = Date.now()
) {
  const movimientos = await ctx.db
    .query("facturacionCajaMenorMovimientos")
    .withIndex("by_facturaId", (q) => q.eq("facturaId", facturaId))
    .collect();
  for (const movimiento of movimientos.filter((row) => row.estado === "pendiente_reembolso")) {
    await patchMovimientoConBandeja(ctx, movimiento._id, {
      estado: "anulado" as MovimientoCajaMenorEstado,
      actualizadoEn: now,
    });
    await registrarAuditoriaCajaMenor(ctx, {
      movimiento,
      accion: "anular_movimiento_caja_menor",
      actor,
      comentario: comentario || "Movimiento de Caja Menor anulado.",
      estadoAnterior: movimiento.estado,
      estadoNuevo: "anulado",
    });
  }
}

export async function crearMovimientoCajaMenorInterno(
  ctx: MutationCtx,
  args: {
    factura: Doc<"facturacionFacturas">;
    input: CajaMenorMovimientoInput;
    origen: "factura_sistema" | "recibo_fisico";
    actor: Actor;
    now?: number;
  }
) {
  const now = args.now ?? Date.now();
  const caja = await ctx.db.get("cajasMenores", args.input.cajaMenorId);
  if (!caja) throw new Error("Caja menor no encontrada.");
  const empresaFactura = args.factura.empresa ?? DEFAULT_EMPRESA;
  if (caja.empresa_id !== empresaFactura) {
    throw new Error("La Caja Menor pertenece a otra empresa.");
  }
  if ((caja.estado ?? "activa") !== "activa") {
    throw new Error("La Caja Menor está cerrada.");
  }
  if (!args.actor.actorUserId || !caja.assignedUsersIds.includes(args.actor.actorUserId)) {
    throw new Error("Sólo un custodio asignado puede usar esta Caja Menor.");
  }
  if (!args.input.concepto.trim()) {
    throw new Error("El concepto es obligatorio.");
  }
  if (!args.input.fechaPago.trim()) {
    throw new Error("La fecha de pago es obligatoria.");
  }
  if (args.input.valor <= 0) {
    throw new Error("El valor debe ser mayor a cero.");
  }

  const resolvedCentrosCosto = resolveCentrosCostoFromInput({
    centroCostoId: args.input.centroCostoId,
    centroCostoCodigo: args.input.centroCostoCodigo,
    centroCostoNombre: args.input.centroCostoNombre,
    centrosCostoDistribucion: args.input.centrosCostoDistribucion,
    valorTotal: args.input.valor,
  });
  assertCentrosCostoIdentityTransitionForEmpresa({
    previous: getStoredCentrosCostoIdentities(args.factura),
    next: resolvedCentrosCosto.centrosCostoDistribucion,
    appEmpresa: empresaFactura,
  });

  const movimientoActivo = await getMovimientoActivoFactura(ctx, args.factura._id);
  if (movimientoActivo) {
    throw new Error("Esta factura ya tiene un movimiento de Caja Menor activo.");
  }

  const saldo = await enrichCaja(ctx, caja);
  if (saldo.refillPendiente) {
    throw new Error("Esta Caja Menor tiene un refill manual pendiente de confirmación.");
  }
  const permitirSaldoNegativo = await empresaPermiteSaldoNegativo(
    ctx,
    normalizeEmpresa(caja.empresa_id)
  );
  if (!permitirSaldoNegativo && saldo.saldoDisponible + 0.001 < args.input.valor) {
    throwSaldoInsuficienteCajaMenor({
      cajaNombre: caja.nombre,
      saldoDisponible: saldo.saldoDisponible,
      valorRequerido: args.input.valor,
    });
  }

  const movimientoId = await insertMovimientoConBandeja(ctx, {
    facturaId: args.factura._id,
    cajaMenorId: args.input.cajaMenorId,
    origen: args.origen,
    estado: "pendiente_reembolso",
    nit: args.input.nit?.trim() || undefined,
    nombreEmpresa: args.input.nombreEmpresa.trim(),
    concepto: args.input.concepto.trim(),
    fechaPago: args.input.fechaPago.trim(),
    valor: args.input.valor,
    centroCostoId: resolvedCentrosCosto.centroCostoId,
    centroCostoCodigo: resolvedCentrosCosto.centroCostoCodigo,
    centroCostoNombre: resolvedCentrosCosto.centroCostoNombre,
    centrosCostoDistribucion: resolvedCentrosCosto.centrosCostoDistribucion,
    observaciones: args.input.observaciones?.trim() || undefined,
    actorUserId: args.actor.actorUserId,
    actorNombre: args.actor.actorNombre,
    actorEmail: normalizeEmail(args.actor.actorEmail),
    creadoEn: now,
    actualizadoEn: now,
  });

  await ctx.db.patch("facturacionFacturas", args.factura._id, {
    esLegalizacionCajaMenor: true,
    cajaMenorId: args.input.cajaMenorId,
    cajaMenorNombre: caja.nombre,
    cajaMenorMarcadorUserId: args.actor.actorUserId,
    cajaMenorMarcadorNombre: args.actor.actorNombre,
    cajaMenorMarcadorEmail: normalizeEmail(args.actor.actorEmail),
    esLegalizacionAnticipo: false,
    anticipoLiderUserId: undefined,
    anticipoLiderNombre: undefined,
    anticipoLiderEmail: undefined,
    anticipoProcesoId: undefined,
    anticipoProcesoNombre: undefined,
    centroCostoCodigo: resolvedCentrosCosto.centroCostoCodigo,
    centroCostoNombre: resolvedCentrosCosto.centroCostoNombre,
    centrosCostoDistribucion: resolvedCentrosCosto.centrosCostoDistribucion,
    fechaPagoCajaMenor: args.input.fechaPago.trim(),
    conceptoCajaMenor: args.input.concepto.trim(),
    esReciboFisicoCajaMenor: args.origen === "recibo_fisico",
    actualizadoEn: now,
  });

  const movimiento = await ctx.db.get("facturacionCajaMenorMovimientos", movimientoId);
  if (!movimiento) throw new Error("No se pudo crear el movimiento.");


  return {
    movimiento,
    caja,
    saldoAntes: saldo.saldoActual,
    saldoDespues: Math.max(0, saldo.saldoActual - args.input.valor),
  };
}

export const obtenerRolesConfig = query({
  args: { empresa: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const empresa = normalizeEmpresa(args.empresa);
    const config = await getGerenciaFinancieraConfig(ctx, empresa);
    return config ? [config] : [];
  },
});

export const configurarGerenciaFinanciera = mutation({
  args: {
    empresa: v.optional(v.number()),
    usuarios: v.array(usuarioConfigArg),
    ...actorArg,
  },
  handler: async (ctx, args) => {
    if (!isAdminRol(args.actorRol)) {
      throw new Error("Sólo un administrador puede configurar Gerencia Financiera.");
    }
    const empresa = normalizeEmpresa(args.empresa);
    const usuarios = dedupeUsuarios(args.usuarios);
    if (usuarios.length === 0) {
      throw new Error("Configura al menos un usuario de Gerencia Financiera.");
    }
    const now = Date.now();
    const existing = await getGerenciaFinancieraConfig(ctx, empresa);
    const payload = {
      empresa,
      rol: "GERENCIA_FINANCIERA" as const,
      usuarios,
      updatedAt: now,
      updatedByUserId: args.actorUserId,
      updatedByNombre: args.actorNombre,
    };

    if (existing) {
      await ctx.db.replace("cajasMenoresRolesConfig", existing._id, payload);
      return existing._id;
    }
    return await ctx.db.insert("cajasMenoresRolesConfig", payload);
  },
});

export const usuarioPuedeGestionar = query({
  args: {
    empresa: v.optional(v.number()),
    actorUserId: v.optional(v.string()),
    actorRol: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await usuarioPuedeGestionarEmpresa(
      ctx,
      normalizeEmpresa(args.empresa),
      args.actorUserId,
      args.actorRol
    );
  },
});

export const obtenerConfigCajaMenorEmpresa = query({
  args: {
    empresa: v.number(),
  },
  returns: v.object({
    permitirSaldoNegativo: v.boolean(),
  }),
  handler: async (ctx, args) => {
    return {
      permitirSaldoNegativo: await empresaPermiteSaldoNegativo(ctx, normalizeEmpresa(args.empresa)),
    };
  },
});

export const configurarPermitirSaldoNegativo = mutation({
  args: {
    empresa: v.number(),
    permitirSaldoNegativo: v.boolean(),
    ...actorArg,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const empresa = normalizeEmpresa(args.empresa);
    await assertCanManage(ctx, empresa, args.actorUserId, args.actorRol);
    const now = Date.now();
    const existing = await getCajaMenorEmpresaConfig(ctx, empresa);
    const payload = {
      empresa,
      permitirSaldoNegativo: args.permitirSaldoNegativo,
      updatedAt: now,
      updatedByUserId: args.actorUserId,
      updatedByNombre: args.actorNombre,
    };
    if (existing) {
      await ctx.db.replace("cajasMenoresConfig", existing._id, payload);
    } else {
      await ctx.db.insert("cajasMenoresConfig", payload);
    }
    return null;
  },
});

export const obtenerEmpresasRevisorCajaMenor = query({
  args: {
    actorUserId: v.string(),
  },
  handler: async (ctx, args) => {
    return await obtenerEmpresasRevisorCajaMenorForUser(ctx, args.actorUserId);
  },
});

export const obtenerCajas = query({
  args: {
    empresas: v.optional(v.array(v.number())),
    incluirAnuladas: v.optional(v.boolean()),
    actorUserId: v.optional(v.string()),
    actorRol: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const empresas = args.empresas?.length ? args.empresas.map(normalizeEmpresa) : undefined;
    const rows = empresas?.length
      ? (
          await Promise.all(
            empresas.map((empresa) =>
              ctx.db
                .query("cajasMenores")
                .withIndex("by_empresa_id", (q) => q.eq("empresa_id", empresa))
                .collect()
            )
          )
        ).flat()
      : await ctx.db.query("cajasMenores").collect();

    const out = [];
    for (const caja of rows) {
      if (!args.incluirAnuladas && (caja.estado ?? "activa") === "anulado") {
        continue;
      }
      const access = await usuarioPuedeVerCajaMenor(ctx, caja, args.actorUserId, args.actorRol);
      if (!access.canView) {
        continue;
      }
      out.push({
        ...(await enrichCaja(ctx, caja)),
        canManage: access.canManage,
      });
    }

    return out.sort((a, b) => {
      if (a.empresa_id !== b.empresa_id) return a.empresa_id - b.empresa_id;
      return a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" });
    });
  },
});

const cajasAsignadasDisponiblesArgs = {
  empresa: v.optional(v.number()),
  userId: v.string(),
  valorMinimo: v.optional(v.number()),
};

type CajasAsignadasDisponiblesArgs = {
  empresa?: number;
  userId: string;
  valorMinimo?: number;
};

async function obtenerCajasAsignadasDisponiblesData(
  ctx: QueryCtx,
  args: CajasAsignadasDisponiblesArgs
) {
  const empresa = normalizeEmpresa(args.empresa);
  const valorMinimo = Math.max(0, args.valorMinimo ?? 0);
  const permitirSaldoNegativo = await empresaPermiteSaldoNegativo(ctx, empresa);
  const rows = await ctx.db
    .query("cajasMenores")
    .withIndex("by_empresa_id", (q) => q.eq("empresa_id", empresa))
    .collect();

  const enriched = await Promise.all(
    rows
      .filter(
        (caja) =>
          (caja.estado ?? "activa") === "activa" && caja.assignedUsersIds.includes(args.userId)
      )
      .map(async (caja) => enrichCaja(ctx, caja))
  );

  const cajas = enriched
    .filter(
      (caja) =>
        !caja.refillPendiente &&
        (permitirSaldoNegativo || caja.saldoDisponible + 0.001 >= valorMinimo)
    )
    .sort((a, b) => b.saldoDisponible - a.saldoDisponible);

  return { cajas, permitirSaldoNegativo };
}

export const obtenerCajasAsignadasDisponiblesV2 = query({
  args: cajasAsignadasDisponiblesArgs,
  returns: v.object({
    cajas: v.array(v.any()),
    permitirSaldoNegativo: v.boolean(),
  }),
  handler: async (ctx, args) => {
    return await obtenerCajasAsignadasDisponiblesData(ctx, args);
  },
});

export const obtenerDetalleCaja = query({
  args: {
    cajaMenorId: v.id("cajasMenores"),
    actorUserId: v.optional(v.string()),
    actorRol: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const caja = await ctx.db.get("cajasMenores", args.cajaMenorId);
    if (!caja) return null;
    const access = await usuarioPuedeVerCajaMenor(ctx, caja, args.actorUserId, args.actorRol);
    if (!access.canView) return null;
    const refills = await ctx.db
      .query("cajasMenoresRefills")
      .withIndex("by_cajaMenorId", (q) => q.eq("cajaMenorId", args.cajaMenorId))
      .collect();
    const legalizaciones = await ctx.db
      .query("facturacionCajaMenorLegalizaciones")
      .withIndex("by_cajaMenorId", (q) => q.eq("cajaMenorId", args.cajaMenorId))
      .collect();
    const legalizacionesDetalle = await Promise.all(
      legalizaciones.map(async (legalizacion) => ({
        ...legalizacion,
        factura: await ctx.db.get("facturacionFacturas", legalizacion.facturaId),
      }))
    );
    const movimientos = await ctx.db
      .query("facturacionCajaMenorMovimientos")
      .withIndex("by_cajaMenorId", (q) => q.eq("cajaMenorId", args.cajaMenorId))
      .collect();
    const movimientosDetalle = await Promise.all(
      movimientos.map(async (movimiento) => ({
        ...movimiento,
        factura: await ctx.db.get("facturacionFacturas", movimiento.facturaId),
      }))
    );
    const reembolsos = await ctx.db
      .query("cajasMenoresReembolsos")
      .withIndex("by_cajaMenorId", (q) => q.eq("cajaMenorId", args.cajaMenorId))
      .collect();
    const reembolsosDetalle = await Promise.all(
      reembolsos.map(async (reembolso) => {
        const reembolsoMovimientos = await getMovimientosByIds(ctx, reembolso.movimientoIds);
        return {
          ...reembolso,
          movimientos: await Promise.all(
            reembolsoMovimientos.map(async (movimiento) => ({
              ...movimiento,
              factura: await ctx.db.get("facturacionFacturas", movimiento.facturaId),
            }))
          ),
        };
      })
    );

    return {
      caja: await enrichCaja(ctx, caja),
      refills: refills.sort((a, b) => b.refillDate - a.refillDate),
      movimientos: movimientosDetalle.sort((a, b) => b.creadoEn - a.creadoEn),
      pendientesReembolso: movimientosDetalle
        .filter((movimiento) => movimiento.estado === "pendiente_reembolso")
        .sort((a, b) => b.creadoEn - a.creadoEn),
      reembolsos: reembolsosDetalle.sort((a, b) => b.creadoEn - a.creadoEn),
      legalizaciones: legalizacionesDetalle.sort((a, b) => b.creadoEn - a.creadoEn),
    };
  },
});

export const crearCajaMenor = mutation({
  args: {
    empresa_id: v.number(),
    nombre: v.string(),
    assignedValue: v.number(),
    assignedValueLetras: v.string(),
    assignedUsersIds: v.array(v.string()),
    observations: v.optional(v.string()),
    ...actorArg,
  },
  handler: async (ctx, args) => {
    const empresa = normalizeEmpresa(args.empresa_id);
    await assertCanManage(ctx, empresa, args.actorUserId, args.actorRol);
    if (!args.nombre.trim()) throw new Error("El nombre es obligatorio.");
    if (args.assignedValue <= 0) {
      throw new Error("El valor asignado debe ser mayor a cero.");
    }
    const assignedUsersIds = Array.from(new Set(args.assignedUsersIds)).filter(Boolean);
    if (assignedUsersIds.length === 0) {
      throw new Error("Asigna al menos un usuario custodio.");
    }
    const now = Date.now();
    return await ctx.db.insert("cajasMenores", {
      empresa_id: empresa,
      nombre: args.nombre.trim(),
      assignedValue: args.assignedValue,
      assignedValueLetras: args.assignedValueLetras.trim(),
      assignedUsersIds,
      observations: args.observations?.trim() || undefined,
      estado: "activa",
      createdAt: now,
      createdByUserId: args.actorUserId,
      updatedAt: now,
      updatedByUserId: args.actorUserId,
    });
  },
});

export const actualizarCajaMenor = mutation({
  args: {
    cajaMenorId: v.id("cajasMenores"),
    nombre: v.string(),
    assignedUsersIds: v.array(v.string()),
    observations: v.optional(v.string()),
    estado: v.optional(v.union(v.literal("activa"), v.literal("cerrada"), v.literal("anulado"))),
    ...actorArg,
  },
  handler: async (ctx, args) => {
    const caja = await ctx.db.get("cajasMenores", args.cajaMenorId);
    if (!caja) throw new Error("Caja menor no encontrada.");
    if ((caja.estado ?? "activa") === "anulado") {
      throw new Error("No se puede editar una Caja Menor anulada.");
    }
    await assertCanManage(ctx, caja.empresa_id, args.actorUserId, args.actorRol);
    const assignedUsersIds = Array.from(new Set(args.assignedUsersIds)).filter(Boolean);
    if (assignedUsersIds.length === 0) {
      throw new Error("Asigna al menos un usuario custodio.");
    }
    await ctx.db.patch("cajasMenores", args.cajaMenorId, {
      nombre: args.nombre.trim(),
      assignedUsersIds,
      observations: args.observations?.trim() || undefined,
      ...(args.estado ? { estado: args.estado } : {}),
      updatedAt: Date.now(),
      updatedByUserId: args.actorUserId,
    });
    return args.cajaMenorId;
  },
});

export const eliminarCajaMenor = mutation({
  args: {
    cajaMenorId: v.id("cajasMenores"),
    ...actorArg,
  },
  handler: async (ctx, args) => {
    const caja = await ctx.db.get("cajasMenores", args.cajaMenorId);
    if (!caja) throw new Error("Caja menor no encontrada.");
    if ((caja.estado ?? "activa") === "anulado") {
      throw new Error("Esta Caja Menor ya está anulada.");
    }
    await assertCanManage(ctx, caja.empresa_id, args.actorUserId, args.actorRol);
    await ctx.db.patch("cajasMenores", args.cajaMenorId, {
      estado: "anulado",
      updatedAt: Date.now(),
      updatedByUserId: args.actorUserId,
    });
    return { anulado: true };
  },
});

export const crearRefill = mutation({
  args: {
    cajaMenorId: v.id("cajasMenores"),
    refillValue: v.number(),
    refillValueLetras: v.string(),
    refillObservations: v.optional(v.string()),
    refillToUserId: v.string(),
    ...actorArg,
  },
  handler: async (ctx, args) => {
    const caja = await ctx.db.get("cajasMenores", args.cajaMenorId);
    if (!caja) throw new Error("Caja menor no encontrada.");
    if ((caja.estado ?? "activa") === "anulado") {
      throw new Error("No se puede hacer refill en una Caja Menor anulada.");
    }
    await assertCanManage(ctx, caja.empresa_id, args.actorUserId, args.actorRol);
    if (args.refillValue <= 0) {
      throw new Error("El valor del refill debe ser mayor a cero.");
    }
    if (!caja.assignedUsersIds.includes(args.refillToUserId)) {
      throw new Error("El receptor del refill debe estar asignado a la caja.");
    }
    const now = Date.now();
    const refillId = await ctx.db.insert("cajasMenoresRefills", {
      cajaMenorId: args.cajaMenorId,
      refillDate: now,
      refillValue: args.refillValue,
      refillValueLetras: args.refillValueLetras.trim(),
      refillObservations: args.refillObservations?.trim() || undefined,
      refillByUserId: args.actorUserId,
      refillToUserId: args.refillToUserId,
      receiptConfirmed: false,
    });
    await ctx.db.patch("cajasMenores", args.cajaMenorId, {
      lastRefillDate: now,
      updatedAt: now,
      updatedByUserId: args.actorUserId,
    });
    return refillId;
  },
});

export const confirmarReceiptRefill = mutation({
  args: {
    refillId: v.id("cajasMenoresRefills"),
    ...actorArg,
  },
  handler: async (ctx, args) => {
    const refill = await ctx.db.get("cajasMenoresRefills", args.refillId);
    if (!refill) throw new Error("Refill no encontrado.");
    if (refill.receiptConfirmed) return args.refillId;
    const caja = await ctx.db.get("cajasMenores", refill.cajaMenorId);
    if (!caja) throw new Error("Caja menor no encontrada.");
    const isReceiver = refill.refillToUserId === args.actorUserId;
    const canManage = await usuarioPuedeGestionarEmpresa(
      ctx,
      caja.empresa_id,
      args.actorUserId,
      args.actorRol
    );
    if (!isReceiver && !canManage) {
      throw new Error("Sólo el receptor o Gerencia Financiera puede confirmar.");
    }
    await ctx.db.patch("cajasMenoresRefills", args.refillId, {
      receiptConfirmed: true,
      receiptConfirmedDate: Date.now(),
      receiptConfirmedByUserId: args.actorUserId,
    });
    return args.refillId;
  },
});

export const usuarioPuedeRevisarCajaMenor = query({
  args: {
    empresa: v.optional(v.number()),
    actorUserId: v.optional(v.string()),
    actorRol: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await usuarioPuedeRevisarCajaMenorEmpresa(
      ctx,
      normalizeEmpresa(args.empresa),
      args.actorUserId,
      args.actorRol
    );
  },
});

export const usuarioPuedeAccederReembolsoCajaMenor = internalQuery({
  args: {
    empresa: v.optional(v.number()),
    actorUserId: v.optional(v.string()),
    actorRol: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const empresa = normalizeEmpresa(args.empresa);
    const [canReview, canManage, canReviewContabilidad, canReviewEventosDian] = await Promise.all([
      usuarioPuedeRevisarCajaMenorEmpresa(ctx, empresa, args.actorUserId, args.actorRol),
      usuarioPuedeGestionarEmpresa(ctx, empresa, args.actorUserId, args.actorRol),
      usuarioEsContadorImpuestosConfiguradoEmpresa(ctx, empresa, args.actorUserId),
      usuarioEsEventosDianConfiguradoEmpresa(ctx, empresa, args.actorUserId),
    ]);
    if (canReview || canManage || canReviewContabilidad || canReviewEventosDian) return true;
    const canPay = await usuarioEsTesoreroConfiguradoEmpresa(ctx, empresa, args.actorUserId);
    if (canPay) return true;
    if (!args.actorUserId) return false;

    const cajas = await ctx.db
      .query("cajasMenores")
      .withIndex("by_empresa_id", (q) => q.eq("empresa_id", empresa))
      .collect();
    return cajas.some(
      (caja) =>
        (caja.estado ?? "activa") === "activa" &&
        caja.assignedUsersIds.includes(args.actorUserId ?? "")
    );
  },
});

export const obtenerEmpresasContadorImpuestos = internalQuery({
  args: {
    actorUserId: v.string(),
  },
  returns: v.array(v.number()),
  handler: async (ctx, args) => {
    return await obtenerEmpresasContadorImpuestosForUser(ctx, args.actorUserId);
  },
});

export const obtenerEmpresasEventosDian = internalQuery({
  args: {
    actorUserId: v.string(),
  },
  returns: v.array(v.number()),
  handler: async (ctx, args) => {
    return await obtenerEmpresasEventosDianForUser(ctx, args.actorUserId);
  },
});

export const listarContadoresImpuestosConfigurados = query({
  args: { empresa: v.optional(v.number()) },
  returns: v.array(
    v.object({
      usuarioId: v.string(),
      nombre: v.string(),
      email: v.string(),
    })
  ),
  handler: async (ctx, args) => {
    return await getContadoresImpuestosConfigurados(ctx, normalizeEmpresa(args.empresa));
  },
});

export const listarEventosDianConfigurados = query({
  args: { empresa: v.optional(v.number()) },
  returns: v.array(
    v.object({
      usuarioId: v.string(),
      nombre: v.string(),
      email: v.string(),
    })
  ),
  handler: async (ctx, args) => {
    return await getEventosDianConfigurados(ctx, normalizeEmpresa(args.empresa));
  },
});

export const obtenerDashboardReembolsos = query({
  args: {
    empresas: v.optional(v.array(v.number())),
    incluirAnuladas: v.optional(v.boolean()),
    actorUserId: v.optional(v.string()),
    actorRol: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const empresas = args.empresas?.length ? args.empresas.map(normalizeEmpresa) : undefined;
    const rows = empresas?.length
      ? (
          await Promise.all(
            empresas.map((empresa) =>
              ctx.db
                .query("cajasMenores")
                .withIndex("by_empresa_id", (q) => q.eq("empresa_id", empresa))
                .collect()
            )
          )
        ).flat()
      : await ctx.db.query("cajasMenores").collect();

    const permisosPorEmpresa = new Map<
      number,
      {
        canReview: boolean;
        canManage: boolean;
        canReviewReembolso: boolean;
        canReviewContabilidad: boolean;
        canReviewEventosDian: boolean;
        canApproveReembolso: boolean;
        canPayTesoreria: boolean;
      }
    >();
    async function getPermisosEmpresa(empresa: number) {
      const cached = permisosPorEmpresa.get(empresa);
      if (cached) return cached;
      const [
        canReview,
        canManage,
        canReviewReembolso,
        canReviewContabilidad,
        canReviewEventosDian,
        canApproveReembolso,
        canPayTesoreria,
      ] = await Promise.all([
        usuarioPuedeRevisarCajaMenorEmpresa(ctx, empresa, args.actorUserId, args.actorRol),
        usuarioPuedeGestionarEmpresa(ctx, empresa, args.actorUserId, args.actorRol),
        usuarioEsRevisorCajaMenorConfiguradoEmpresa(ctx, empresa, args.actorUserId),
        usuarioEsContadorImpuestosConfiguradoEmpresa(ctx, empresa, args.actorUserId),
        usuarioEsEventosDianConfiguradoEmpresa(ctx, empresa, args.actorUserId),
        usuarioEsGerenciaFinancieraConfiguradaEmpresa(ctx, empresa, args.actorUserId),
        usuarioEsTesoreroConfiguradoEmpresa(ctx, empresa, args.actorUserId),
      ]);
      const permisos = {
        canReview,
        canManage,
        canReviewReembolso,
        canReviewContabilidad,
        canReviewEventosDian,
        canApproveReembolso,
        canPayTesoreria,
      };
      permisosPorEmpresa.set(empresa, permisos);
      return permisos;
    }

    if (empresas?.length) {
      await Promise.all(empresas.map((empresa) => getPermisosEmpresa(empresa)));
    }

    const actorUserId = args.actorUserId ?? "";
    let leaderPendingReembolsos = actorUserId
      ? await ctx.db
          .query("cajasMenoresReembolsos")
          .withIndex("by_liderAprobadorUserId_estado", (q) =>
            q.eq("liderAprobadorUserId", actorUserId).eq("estado", "pendiente_aprobacion_lider")
          )
          .collect()
      : [];
    if (empresas?.length) {
      const empresaSet = new Set(empresas);
      const filteredLeaderPending = [];
      for (const reembolso of leaderPendingReembolsos) {
        const cajaReembolso = await ctx.db.get("cajasMenores", reembolso.cajaMenorId);
        if (cajaReembolso && empresaSet.has(normalizeEmpresa(cajaReembolso.empresa_id))) {
          filteredLeaderPending.push(reembolso);
        }
      }
      leaderPendingReembolsos = filteredLeaderPending;
    }
    const cajaIdsWithLeaderPending = new Set(
      leaderPendingReembolsos.map((reembolso) => String(reembolso.cajaMenorId))
    );

    const reembolsosEventosDianAsignados = actorUserId
      ? await ctx.db
          .query("cajasMenoresReembolsos")
          .withIndex("by_eventosDianAsignadoUserId_estado", (q) =>
            q.eq("eventosDianAsignadoUserId", actorUserId)
          )
          .collect()
      : [];
    const cajasConEventoDianAsignado = new Set(
      reembolsosEventosDianAsignados
        .filter((reembolso) => reembolso.estado === "pendiente_eventos_dian")
        .map((reembolso) => String(reembolso.cajaMenorId))
    );

    const cajas = [];
    for (const caja of rows) {
      if (!args.incluirAnuladas && (caja.estado ?? "activa") === "anulado") {
        continue;
      }
      const permisos = await getPermisosEmpresa(caja.empresa_id);
      const isCustodio = caja.assignedUsersIds.includes(actorUserId);
      const isLeaderApproverForCaja = cajaIdsWithLeaderPending.has(String(caja._id));
      const isEventosDianAsignadoForCaja = cajasConEventoDianAsignado.has(String(caja._id));
      if (
        !permisos.canReview &&
        !permisos.canManage &&
        !permisos.canReviewReembolso &&
        !permisos.canReviewContabilidad &&
        !permisos.canReviewEventosDian &&
        !permisos.canApproveReembolso &&
        !permisos.canPayTesoreria &&
        !isCustodio &&
        !isLeaderApproverForCaja &&
        !isEventosDianAsignadoForCaja
      ) {
        continue;
      }

      const canViewMovimientos =
        permisos.canReview ||
        permisos.canManage ||
        permisos.canReviewContabilidad ||
        permisos.canPayTesoreria ||
        isCustodio ||
        isLeaderApproverForCaja;

      const canViewReembolsos =
        canViewMovimientos ||
        permisos.canReviewReembolso ||
        permisos.canReviewEventosDian ||
        permisos.canApproveReembolso;

      const movimientos = canViewMovimientos
        ? await ctx.db
            .query("facturacionCajaMenorMovimientos")
            .withIndex("by_cajaMenorId", (q) => q.eq("cajaMenorId", caja._id))
            .collect()
        : [];
      const movimientosDetalle = await Promise.all(
        movimientos.map(async (movimiento) => ({
          ...movimiento,
          empresa_id: caja.empresa_id,
          factura: await ctx.db.get("facturacionFacturas", movimiento.facturaId),
          tarea: await getTareaByFactura(ctx, movimiento.facturaId),
        }))
      );
      const reembolsos = await ctx.db
        .query("cajasMenoresReembolsos")
        .withIndex("by_cajaMenorId", (q) => q.eq("cajaMenorId", caja._id))
        .collect();
      const reembolsosVisibles = canViewReembolsos
        ? reembolsos
        : reembolsos.filter(
            (reembolso) =>
              reembolso.estado === "pendiente_eventos_dian" &&
              reembolso.eventosDianAsignadoUserId === actorUserId
          );
      const reembolsosDetalle = await Promise.all(
        reembolsosVisibles.map(async (reembolso) => {
          const reembolsoMovimientos = await getMovimientosByIds(ctx, reembolso.movimientoIds);
          return {
            ...reembolso,
            empresa_id: caja.empresa_id,
            movimientos: await Promise.all(
              reembolsoMovimientos.map(async (movimiento) => ({
                ...movimiento,
                empresa_id: caja.empresa_id,
                factura: await ctx.db.get("facturacionFacturas", movimiento.facturaId),
                tarea: await getTareaByFactura(ctx, movimiento.facturaId),
              }))
            ),
          };
        })
      );
      cajas.push({
        ...(await enrichCaja(ctx, caja)),
        canManage: permisos.canManage,
        canReview: permisos.canReview,
        canReviewReembolso: permisos.canReviewReembolso,
        canReviewContabilidad: permisos.canReviewContabilidad,
        canReviewEventosDian: permisos.canReviewEventosDian,
        canApproveReembolso: permisos.canApproveReembolso,
        canGenerate: isCustodio,
        isCustodio,
        pendientes: movimientosDetalle
          .filter(
            (movimiento) =>
              movimiento.estado === "pendiente_reembolso" &&
              !movimiento.reembolsoId &&
              isCustodio &&
              (movimiento.origen === "recibo_fisico" ||
                tareaPermiteReembolsoCajaMenor(movimiento.tarea?.estado))
          )
          .sort((a, b) => b.creadoEn - a.creadoEn),
        movimientos: movimientosDetalle.sort((a, b) => b.creadoEn - a.creadoEn),
        reembolsos: reembolsosDetalle.sort((a, b) => b.creadoEn - a.creadoEn),
      });
    }

    const canReview = [...permisosPorEmpresa.values()].some((p) => p.canReview);
    const canManage = [...permisosPorEmpresa.values()].some((p) => p.canManage);
    const canReviewContabilidad = [...permisosPorEmpresa.values()].some(
      (p) => p.canReviewContabilidad
    );
    const canReviewEventosDian = [...permisosPorEmpresa.values()].some(
      (p) => p.canReviewEventosDian
    );
    const canApproveReembolso = [...permisosPorEmpresa.values()].some(
      (p) => p.canApproveReembolso
    );
    const canPayTesoreria = [...permisosPorEmpresa.values()].some((p) => p.canPayTesoreria);
    const isAdmin = isAdminRol(args.actorRol);

    const sortedCajas = cajas.sort((a, b) => {
      if (a.empresa_id !== b.empresa_id) return a.empresa_id - b.empresa_id;
      return a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" });
    });
    const canGenerate = sortedCajas.some((caja) => caja.isCustodio);

    type ReembolsoDashboardItem = (typeof sortedCajas)[number]["reembolsos"][number] & {
      caja: (typeof sortedCajas)[number];
    };

    const cajasById = new Map(sortedCajas.map((caja) => [String(caja._id), caja]));
    const reembolsosVisiblesMap = new Map<string, ReembolsoDashboardItem>();

    for (const caja of sortedCajas) {
      for (const reembolso of caja.reembolsos) {
        if (!isReembolsoEstadoSeguimientoActivo(reembolso.estado)) continue;
        const permisos = permisosPorEmpresa.get(caja.empresa_id);
        if (!permisos) continue;
        if (
          !puedeObservarReembolsoActivo(reembolso, caja, actorUserId, permisos, args.actorRol)
        ) {
          continue;
        }
        reembolsosVisiblesMap.set(String(reembolso._id), { ...reembolso, caja });
      }
    }

    if (actorUserId) {
      for (const estado of REEMBOLSO_ESTADOS_SEGUIMIENTO_ACTIVO) {
        const reembolsosSolicitante = await ctx.db
          .query("cajasMenoresReembolsos")
          .withIndex("by_custodioUserId_estado", (q) =>
            q.eq("custodioUserId", actorUserId).eq("estado", estado)
          )
          .collect();
        for (const reembolso of reembolsosSolicitante) {
          if (reembolsosVisiblesMap.has(String(reembolso._id))) continue;
          const cajaDoc = await ctx.db.get("cajasMenores", reembolso.cajaMenorId);
          if (!cajaDoc) continue;
          if (empresas?.length && !empresas.includes(normalizeEmpresa(cajaDoc.empresa_id))) {
            continue;
          }
          if (!args.incluirAnuladas && (cajaDoc.estado ?? "activa") === "anulado") {
            continue;
          }
          const permisos = await getPermisosEmpresa(cajaDoc.empresa_id);
          if (
            !puedeObservarReembolsoActivo(reembolso, cajaDoc, actorUserId, permisos, args.actorRol)
          ) {
            continue;
          }
          const cajaEnriched =
            cajasById.get(String(cajaDoc._id)) ?? {
              ...(await enrichCaja(ctx, cajaDoc)),
              canManage: permisos.canManage,
              canReview: permisos.canReview,
              canReviewReembolso: permisos.canReviewReembolso,
              canReviewContabilidad: permisos.canReviewContabilidad,
              canReviewEventosDian: permisos.canReviewEventosDian,
              canApproveReembolso: permisos.canApproveReembolso,
              canGenerate: cajaDoc.assignedUsersIds.includes(actorUserId),
              isCustodio: cajaDoc.assignedUsersIds.includes(actorUserId),
              pendientes: [],
              movimientos: [],
              reembolsos: [],
            };
          const reembolsoMovimientos = await getMovimientosByIds(ctx, reembolso.movimientoIds);
          reembolsosVisiblesMap.set(String(reembolso._id), {
            ...reembolso,
            empresa_id: cajaDoc.empresa_id,
            movimientos: await Promise.all(
              reembolsoMovimientos.map(async (movimiento) => ({
                ...movimiento,
                empresa_id: cajaDoc.empresa_id,
                factura: await ctx.db.get("facturacionFacturas", movimiento.facturaId),
                tarea: await getTareaByFactura(ctx, movimiento.facturaId),
              }))
            ),
            caja: cajaEnriched,
          });
        }
      }
    }

    const conteosVisiblesPorEstado = emptyConteosVisiblesPorEstado();
    for (const reembolso of reembolsosVisiblesMap.values()) {
      if (isReembolsoEstadoSeguimientoActivo(reembolso.estado)) {
        conteosVisiblesPorEstado[reembolso.estado] += 1;
      }
    }

    const accionesOptionsBase = {
      isAdmin,
    };

    const getAccionesOptionsForEmpresa = (empresa: number) => {
      const permisos = permisosPorEmpresa.get(empresa);
      return {
        ...accionesOptionsBase,
        canManage: permisos?.canManage ?? false,
        canReviewReembolso: permisos?.canReviewReembolso ?? false,
        canReviewContabilidad: permisos?.canReviewContabilidad ?? false,
        canReviewEventosDian: permisos?.canReviewEventosDian ?? false,
        canApproveReembolso: permisos?.canApproveReembolso ?? false,
        canPayTesoreria: permisos?.canPayTesoreria ?? false,
      };
    };

    const pendientesAprobacionLider = [...reembolsosVisiblesMap.values()]
      .filter(
        (reembolso) =>
          reembolso.estado === "pendiente_aprobacion_lider" &&
          reembolsoTieneAccionParaUsuario(
            reembolso,
            args.actorUserId,
            getAccionesOptionsForEmpresa(reembolso.caja.empresa_id)
          )
      )
      .map((reembolso) => ({
        ...reembolso,
        puedeAprobarLider: reembolso.liderAprobadorUserId === (args.actorUserId ?? ""),
      }))
      .sort((a, b) => b.creadoEn - a.creadoEn);

    const pendientesRevision = [...reembolsosVisiblesMap.values()]
      .filter((reembolso) => {
        if (reembolso.estado !== "pendiente_revision") return false;
        return reembolsoTieneAccionParaUsuario(
          reembolso,
          args.actorUserId,
          getAccionesOptionsForEmpresa(reembolso.caja.empresa_id)
        );
      })
      .map((reembolso) => {
        const permisos = permisosPorEmpresa.get(reembolso.caja.empresa_id)!;
        return {
          ...reembolso,
          puedeRevisar:
            permisos.canReviewReembolso &&
            puedeRevisarReembolsoAsignado(reembolso, args.actorUserId, isAdmin),
          puedeReasignarRevision: puedeReasignarRevisionReembolso(reembolso, args.actorUserId, {
            isAdmin,
            canManage: permisos.canManage,
            canReviewReembolso: permisos.canReviewReembolso,
          }),
        };
      })
      .sort((a, b) => b.creadoEn - a.creadoEn);

    const pendientesContabilidad = [...reembolsosVisiblesMap.values()]
      .filter((reembolso) => {
        if (reembolso.estado !== "pendiente_revision_impuestos") return false;
        return reembolsoTieneAccionParaUsuario(
          reembolso,
          args.actorUserId,
          getAccionesOptionsForEmpresa(reembolso.caja.empresa_id)
        );
      })
      .map((reembolso) => {
        const permisos = permisosPorEmpresa.get(reembolso.caja.empresa_id)!;
        return {
          ...reembolso,
          puedeDecidirContabilidad: puedeDecidirContabilidadReembolso(
            reembolso,
            args.actorUserId,
            { canReviewContabilidad: permisos.canReviewContabilidad }
          ),
          puedeReasignarContabilidad: puedeReasignarContabilidadReembolso(
            reembolso,
            args.actorUserId,
            {
              isAdmin,
              canManage: permisos.canManage,
              canReviewContabilidad: permisos.canReviewContabilidad,
            }
          ),
        };
      })
      .sort((a, b) => b.creadoEn - a.creadoEn);

    const pendientesEventosDian = [...reembolsosVisiblesMap.values()]
      .filter((reembolso) => {
        if (reembolso.estado !== "pendiente_eventos_dian") return false;
        return reembolsoTieneAccionParaUsuario(
          reembolso,
          args.actorUserId,
          getAccionesOptionsForEmpresa(reembolso.caja.empresa_id)
        );
      })
      .map((reembolso) => {
        const permisos = permisosPorEmpresa.get(reembolso.caja.empresa_id)!;
        return {
          ...reembolso,
          puedeDecidirEventosDian: puedeDecidirEventosDianReembolso(
            reembolso,
            args.actorUserId,
            { canReviewEventosDian: permisos.canReviewEventosDian }
          ),
          puedeReasignarEventosDian: puedeReasignarEventosDianReembolso(
            reembolso,
            args.actorUserId,
            {
              isAdmin,
              canManage: permisos.canManage,
              canReviewEventosDian: permisos.canReviewEventosDian,
            }
          ),
        };
      })
      .sort((a, b) => b.creadoEn - a.creadoEn);

    const pendientesAprobacion = [...reembolsosVisiblesMap.values()]
      .filter(
        (reembolso) =>
          reembolso.estado === "pendiente_aprobacion" &&
          reembolsoTieneAccionParaUsuario(
            reembolso,
            args.actorUserId,
            getAccionesOptionsForEmpresa(reembolso.caja.empresa_id)
          )
      )
      .map((reembolso) => ({
        ...reembolso,
        puedeAprobar: reembolso.caja.canApproveReembolso,
      }))
      .sort((a, b) => b.creadoEn - a.creadoEn);

    const pendientesRecibo = (
      await Promise.all(
        [...reembolsosVisiblesMap.values()]
          .filter(
            (reembolso) =>
              reembolso.estado === "aprobado_pendiente_recibo" ||
              reembolso.estado === "pendiente_pago_tesoreria"
          )
          .map(async (reembolso) => {
            const puedeCargarComprobante =
              reembolso.estado === "pendiente_pago_tesoreria" &&
              (isAdmin ||
                (await usuarioEsTesoreroConfiguradoEmpresa(
                  ctx,
                  reembolso.caja.empresa_id,
                  args.actorUserId
                )));
            const puedeConfirmar =
              reembolso.estado === "aprobado_pendiente_recibo"
                ? reembolso.custodioUserId === (args.actorUserId ?? "")
                : false;
            if (!puedeCargarComprobante && !puedeConfirmar) return null;
            return {
              ...reembolso,
              puedeConfirmar,
              puedeCargarComprobante,
            };
          })
      )
    )
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .sort((a, b) => b.creadoEn - a.creadoEn);

    const operationalIds = new Set<string>([
      ...pendientesAprobacionLider,
      ...pendientesRevision,
      ...pendientesContabilidad,
      ...pendientesEventosDian,
      ...pendientesAprobacion,
      ...pendientesRecibo,
    ].map((reembolso) => String(reembolso._id)));

    const seguimientoEnProceso = [...reembolsosVisiblesMap.values()]
      .filter((reembolso) => !operationalIds.has(String(reembolso._id)))
      .map((reembolso) => ({
        ...reembolso,
        soloLectura: true as const,
      }))
      .sort((a, b) => {
        const updatedDiff = b.actualizadoEn - a.actualizadoEn;
        if (updatedDiff !== 0) return updatedDiff;
        return b.creadoEn - a.creadoEn;
      });

    return {
      canReview,
      canManage,
      canReviewContabilidad,
      canReviewEventosDian,
      canGenerate,
      canPayTesoreria,
      canAccess:
        canReview ||
        canManage ||
        canReviewContabilidad ||
        canReviewEventosDian ||
        canApproveReembolso ||
        canPayTesoreria ||
        cajas.length > 0 ||
        leaderPendingReembolsos.length > 0 ||
        reembolsosVisiblesMap.size > 0,
      cajas: sortedCajas,
      conteosVisiblesPorEstado,
      seguimientoEnProceso,
      pendientesAprobacionLider,
      pendientesRevision,
      pendientesContabilidad,
      pendientesEventosDian,
      pendientesAprobacion,
      pendientesRecibo,
    };
  },
});

export const generarReembolsoCajaMenor = mutation({
  args: {
    cajaMenorId: v.id("cajasMenores"),
    movimientoIds: v.array(v.id("facturacionCajaMenorMovimientos")),
    custodioUserId: v.string(),
    custodioNombre: v.string(),
    custodioEmail: v.string(),
    comentario: v.optional(v.string()),
    centroCostoOverrides: v.optional(v.array(reembolsoCentroCostoOverrideArg)),
    aprobacionLider: v.optional(reembolsoAprobacionLiderArg),
    ...actorArg,
  },
  handler: async (ctx, args) => {
    const caja = await ctx.db.get("cajasMenores", args.cajaMenorId);
    if (!caja) throw new Error("Caja menor no encontrada.");
    assertCanGenerateReembolso(caja, args.actorUserId);
    if (args.movimientoIds.length === 0) {
      throw new Error("Selecciona al menos un movimiento.");
    }
    if (args.custodioUserId !== args.actorUserId) {
      throw new Error("El solicitante del reembolso debe ser el custodio autenticado.");
    }
    if (args.aprobacionLider) {
      if (!args.aprobacionLider.aprobadorUserId.trim()) {
        throw new Error("Selecciona el líder aprobador.");
      }
      if (args.aprobacionLider.aprobadorUserId === args.actorUserId) {
        throw new Error("No puedes aprobar tu propia solicitud de reembolso.");
      }
      if (
        !args.aprobacionLider.aprobadorNombre.trim() ||
        !args.aprobacionLider.aprobadorEmail.trim()
      ) {
        throw new Error("El aprobador seleccionado no tiene nombre o correo válido.");
      }
    }

    const movimientos = await getMovimientosByIds(ctx, args.movimientoIds);
    if (movimientos.length !== args.movimientoIds.length) {
      throw new Error("Uno de los movimientos no existe.");
    }
    const uniqueIds = new Set(args.movimientoIds.map(String));
    if (uniqueIds.size !== args.movimientoIds.length) {
      throw new Error("No repitas movimientos en el reembolso.");
    }
    for (const movimiento of movimientos) {
      if (movimiento.cajaMenorId !== args.cajaMenorId) {
        throw new Error("Todos los movimientos deben pertenecer a la misma Caja Menor.");
      }
      if (movimiento.estado !== "pendiente_reembolso" || movimiento.reembolsoId) {
        throw new Error("Uno de los movimientos ya está en otro reembolso.");
      }
      const tarea = await getTareaByFactura(ctx, movimiento.facturaId);
      if (movimiento.origen !== "recibo_fisico" && !tareaPermiteReembolsoCajaMenor(tarea?.estado)) {
        throw new Error(
          "Sólo puedes generar reembolso de facturas en reembolso de Caja Menor o ya legalizadas."
        );
      }
    }

    const now = Date.now();
    const centroCostoOverrides = (args.centroCostoOverrides ??
      []) as ReembolsoCentroCostoOverride[];
    const overridesByMovimientoId = new Map<string, ReembolsoCentroCostoOverride>(
      centroCostoOverrides.map((override) => [String(override.movimientoId), override])
    );
    if (overridesByMovimientoId.size !== centroCostoOverrides.length) {
      throw new Error("No repitas movimientos al cambiar centro de costo.");
    }
    for (const movimientoId of overridesByMovimientoId.keys()) {
      if (!uniqueIds.has(movimientoId)) {
        throw new Error("Sólo puedes cambiar centro de costo de movimientos seleccionados.");
      }
    }
    const movimientosActualizados: Array<Doc<"facturacionCajaMenorMovimientos">> = [];
    const centroCostoCambios: Array<{
      movimiento: Doc<"facturacionCajaMenorMovimientos">;
      resolvedCentrosCosto: ReturnType<typeof resolveCentrosCostoFromInput>;
      distribucionAnterior: CentroCostoDistribucionRow[];
    }> = [];
    for (const movimiento of movimientos) {
      const override = overridesByMovimientoId.get(String(movimiento._id));
      if (!override) {
        movimientosActualizados.push(movimiento);
        continue;
      }
      const resolvedCentrosCosto = resolveCentrosCostoFromInput({
        centroCostoId: override.centroCostoId,
        centroCostoCodigo: override.centroCostoCodigo,
        centroCostoNombre: override.centroCostoNombre,
        centrosCostoDistribucion: override.centrosCostoDistribucion,
        valorTotal: movimiento.valor,
      });
      const factura = await ctx.db.get("facturacionFacturas", movimiento.facturaId);
      if (!factura) throw new Error("Factura no encontrada.");
      const empresaFactura = factura.empresa ?? DEFAULT_EMPRESA;
      const empresaCaja = caja.empresa_id;
      if (empresaFactura !== empresaCaja) {
        throw new Error("La Caja Menor pertenece a otra empresa.");
      }
      const distribucionAnterior = getStoredCentrosCostoIdentities(
        movimiento
      ) as CentroCostoDistribucionRow[];
      assertCentrosCostoIdentityTransitionForEmpresa({
        previous: distribucionAnterior,
        next: resolvedCentrosCosto.centrosCostoDistribucion,
        appEmpresa: empresaFactura,
      });
      if (
        !centrosCostoDistribucionEquals(
          distribucionAnterior,
          resolvedCentrosCosto.centrosCostoDistribucion
        )
      ) {
        centroCostoCambios.push({
          movimiento,
          resolvedCentrosCosto,
          distribucionAnterior,
        });
      }
      movimientosActualizados.push({
        ...movimiento,
        centroCostoId: resolvedCentrosCosto.centroCostoId,
        centroCostoCodigo: resolvedCentrosCosto.centroCostoCodigo,
        centroCostoNombre: resolvedCentrosCosto.centroCostoNombre,
        centrosCostoDistribucion: resolvedCentrosCosto.centrosCostoDistribucion,
      });
    }

    const valorTotal = movimientosActualizados.reduce(
      (total, movimiento) => total + Math.max(0, movimiento.valor),
      0
    );
    const numeroReembolso = await nextNumeroReembolso(ctx, caja.empresa_id, now);
    const formatoSnapshot = await buildFormatoSnapshot(ctx, {
      numeroReembolso,
      caja,
      movimientos: movimientosActualizados,
      custodioUserId: args.custodioUserId,
      custodioNombre: args.custodioNombre.trim(),
      custodioEmail: args.custodioEmail,
      valorTotal,
      solicitudComentario: args.comentario?.trim() || undefined,
      generadoEn: now,
    });
    const vaDirectoARevision = !args.aprobacionLider;
    const revisorAsignado = vaDirectoARevision
      ? await escogerRevisorCajaMenorPonderado(ctx, caja.empresa_id)
      : null;
    const reembolsoId = await insertReembolsoConBandeja(ctx, {
      cajaMenorId: args.cajaMenorId,
      movimientoIds: args.movimientoIds,
      valorTotal,
      numeroReembolso,
      formatoSnapshot,
      estado: args.aprobacionLider ? "pendiente_aprobacion_lider" : "pendiente_revision",
      ...(args.aprobacionLider
        ? {
            liderAprobadorUserId: args.aprobacionLider.aprobadorUserId,
            liderAprobadorNombre: args.aprobacionLider.aprobadorNombre.trim(),
            liderAprobadorEmail: normalizeEmail(args.aprobacionLider.aprobadorEmail),
          }
        : {}),
      ...(revisorAsignado
        ? {
            reviewAssignedUserId: revisorAsignado.usuarioId,
            reviewAssignedNombre: revisorAsignado.nombre,
            reviewAssignedEmail: normalizeEmail(revisorAsignado.email),
            reviewAssignedEn: now,
            reviewAssignedByUserId: args.actorUserId,
            reviewAssignedByNombre: args.actorNombre,
          }
        : {}),
      custodioUserId: args.custodioUserId,
      custodioNombre: args.custodioNombre.trim(),
      custodioEmail: normalizeEmail(args.custodioEmail),
      solicitudComentario: args.comentario?.trim() || undefined,
      creadoEn: now,
      actualizadoEn: now,
    });

    for (const movimiento of movimientos) {
      await patchMovimientoConBandeja(ctx, movimiento._id, {
        reembolsoId,
        estado: "en_reembolso" as MovimientoCajaMenorEstado,
        actualizadoEn: now,
      });
    }

    const reembolsoInsertado = await ctx.db.get("cajasMenoresReembolsos", reembolsoId);
    const estadoNuevoReembolso = args.aprobacionLider
      ? "pendiente_aprobacion_lider"
      : "pendiente_revision";
    const responsableDestinoGeneracion = reembolsoInsertado
      ? destinatarioFromReembolsoEstado(reembolsoInsertado, estadoNuevoReembolso)
      : undefined;

    for (const cambio of centroCostoCambios) {
      const { movimiento, resolvedCentrosCosto, distribucionAnterior } = cambio;
      await patchMovimientoConBandeja(ctx, movimiento._id, {
        centroCostoId: resolvedCentrosCosto.centroCostoId,
        centroCostoCodigo: resolvedCentrosCosto.centroCostoCodigo,
        centroCostoNombre: resolvedCentrosCosto.centroCostoNombre,
        centrosCostoDistribucion: resolvedCentrosCosto.centrosCostoDistribucion,
        actualizadoEn: now,
      });
      await ctx.db.patch("facturacionFacturas", movimiento.facturaId, {
        centroCostoCodigo: resolvedCentrosCosto.centroCostoCodigo,
        centroCostoNombre: resolvedCentrosCosto.centroCostoNombre,
        centrosCostoDistribucion: resolvedCentrosCosto.centrosCostoDistribucion,
        actualizadoEn: now,
      });
      await registrarAuditoriaCajaMenor(ctx, {
        movimiento,
        accion: "actualizar_centro_costo_caja_menor",
        actor: args,
        comentario: formatCentroCostoCajaMenorAuditComentario(
          distribucionAnterior,
          resolvedCentrosCosto.centrosCostoDistribucion
        ),
        estadoAnterior: movimiento.estado,
        estadoNuevo: movimiento.estado,
        reembolsoId,
      });
    }

    await registrarAuditoriaMovimientosCajaMenor(ctx, {
      movimientos,
      accion: "generar_reembolso_caja_menor",
      actor: args,
      comentario:
        args.comentario?.trim() || `Reembolso de Caja Menor generado por ${valorTotal}.`,
      estadoAnterior: "pendiente_reembolso",
      estadoNuevo: estadoNuevoReembolso,
      reembolsoId,
      responsableDestino: responsableDestinoGeneracion,
      creadoEn: now,
    });

    if (args.aprobacionLider) {
    } else {
    }

    await scheduleProjectionRefreshForMovimientos(ctx, movimientos, now);
    await recomputeReembolsoCausacionCounts(ctx, reembolsoId, now);
    return reembolsoId;
  },
});

export const decidirAprobacionLiderReembolsoCajaMenor = mutation({
  args: {
    reembolsoId: v.id("cajasMenoresReembolsos"),
    decision: v.union(v.literal("aprobar"), v.literal("rechazar")),
    comentario: v.optional(v.string()),
    ...actorArg,
  },
  handler: async (ctx, args) => {
    const reembolso = await ctx.db.get("cajasMenoresReembolsos", args.reembolsoId);
    if (!reembolso) throw new Error("Reembolso no encontrado.");
    if (reembolso.estado !== "pendiente_aprobacion_lider") {
      throw new Error("Este reembolso no está pendiente de aprobación líder.");
    }
    if (reembolso.liderAprobadorUserId !== args.actorUserId) {
      throw new Error("Sólo el líder/custodio seleccionado puede decidir esta solicitud.");
    }
    const caja = await ctx.db.get("cajasMenores", reembolso.cajaMenorId);
    if (!caja) throw new Error("Caja menor no encontrada.");

    const movimientos = await getMovimientosByIds(ctx, reembolso.movimientoIds);
    if (movimientos.length !== reembolso.movimientoIds.length) {
      throw new Error("Uno de los movimientos del reembolso no existe.");
    }
    for (const movimiento of movimientos) {
      if (movimiento.reembolsoId !== args.reembolsoId || movimiento.estado !== "en_reembolso") {
        throw new Error("Uno de los movimientos ya no está en aprobación líder.");
      }
    }

    const now = Date.now();
    const comentario =
      args.comentario?.trim() ||
      (args.decision === "aprobar"
        ? "Solicitud aprobada por líder/custodio."
        : "Solicitud rechazada por líder/custodio.");

    if (args.decision === "rechazar") {
      await patchReembolsoConBandeja(ctx, args.reembolsoId, {
        estado: "rechazado",
        liderAprobadorUserId: args.actorUserId,
        liderAprobadorNombre: args.actorNombre,
        liderAprobadorEmail: normalizeEmail(args.actorEmail),
        liderComentario: comentario,
        liderDecisionEn: now,
        actualizadoEn: now,
      });
      for (const movimiento of movimientos) {
        await patchMovimientoConBandeja(ctx, movimiento._id, {
          reembolsoId: undefined,
          estado: "pendiente_reembolso" as MovimientoCajaMenorEstado,
          actualizadoEn: now,
        });
        await registrarAuditoriaCajaMenor(ctx, {
          movimiento,
          accion: "rechazar_lider_reembolso_caja_menor",
          actor: args,
          comentario,
          estadoAnterior: "pendiente_aprobacion_lider",
          estadoNuevo: "pendiente_reembolso",
        });
      }
      await scheduleProjectionRefreshForReembolso(ctx, reembolso);
      return args.reembolsoId;
    }

    await patchReembolsoConBandeja(ctx, args.reembolsoId, {
      estado: "pendiente_revision",
      liderAprobadorUserId: args.actorUserId,
      liderAprobadorNombre: args.actorNombre,
      liderAprobadorEmail: normalizeEmail(args.actorEmail),
      liderComentario: comentario,
      liderDecisionEn: now,
      actualizadoEn: now,
    });
    const revisorAsignado = await escogerRevisorCajaMenorPonderado(ctx, caja.empresa_id);
    await asignarRevisorReembolsoCajaMenor(ctx, {
      reembolsoId: args.reembolsoId,
      revisor: revisorAsignado,
      actor: args,
    });
    for (const movimiento of movimientos) {
      await registrarAuditoriaCajaMenor(ctx, {
        movimiento,
        accion: "aprobar_lider_reembolso_caja_menor",
        actor: args,
        comentario,
        estadoAnterior: "pendiente_aprobacion_lider",
        estadoNuevo: "pendiente_revision",
      });
    }

    await scheduleProjectionRefreshForReembolso(ctx, reembolso);
    return args.reembolsoId;
  },
});

export const revisarReembolsoCajaMenor = mutation({
  args: {
    reembolsoId: v.id("cajasMenoresReembolsos"),
    decision: v.union(v.literal("aprobar"), v.literal("rechazar")),
    contadorUserId: v.optional(v.string()),
    destinoAprobacion: v.optional(v.union(v.literal("contabilidad"), v.literal("gerencia"))),
    comentario: v.optional(v.string()),
    adjuntos: v.optional(v.array(reembolsoAdjuntoArg)),
    ajustesValorContable: v.optional(v.array(reembolsoAjusteValorContableArg)),
    causaciones: v.optional(v.array(reembolsoCausacionArg)),
    ...actorArg,
  },
  handler: async (ctx, args) => {
    const reembolso = await ctx.db.get("cajasMenoresReembolsos", args.reembolsoId);
    if (!reembolso) throw new Error("Reembolso no encontrado.");
    if (reembolso.estado !== "pendiente_revision") {
      throw new Error("Este reembolso no está pendiente de revisión.");
    }
    const caja = await ctx.db.get("cajasMenores", reembolso.cajaMenorId);
    if (!caja) throw new Error("Caja menor no encontrada.");
    await assertCanReviewCajaMenor(ctx, caja.empresa_id, args.actorUserId);
    if (!puedeRevisarReembolsoAsignado(reembolso, args.actorUserId, isAdminRol(args.actorRol))) {
      throw new Error("Sólo el revisor asignado puede decidir esta solicitud en revisión.");
    }

    const movimientos = await getMovimientosByIds(ctx, reembolso.movimientoIds);
    if (movimientos.length !== reembolso.movimientoIds.length) {
      throw new Error("Uno de los movimientos del reembolso no existe.");
    }
    for (const movimiento of movimientos) {
      if (movimiento.reembolsoId !== args.reembolsoId || movimiento.estado !== "en_reembolso") {
        throw new Error("Uno de los movimientos ya no está en revisión.");
      }
    }

    const now = Date.now();
    const causacionCambios = await aplicarCausacionesReembolso(ctx, {
      reembolso,
      movimientos,
      causaciones: args.causaciones,
      actor: args,
      faseOperativa: reembolso.estado,
      now,
    });
    const {
      movimientos: movimientosActivos,
      cambiosPorMovimiento,
    } = await aplicarAjustesValorContableReembolso(ctx, {
      reembolso,
      caja,
      movimientos,
      ajustesValorContable: args.ajustesValorContable as ReembolsoAjusteValorContable[] | undefined,
      comentario: args.comentario,
      actor: args,
      now,
    });

    const comentario =
      args.comentario?.trim() ||
      (args.decision === "aprobar"
        ? "Solicitud enviada a Contabilidad por Revisor Caja Menor."
        : "Solicitud rechazada por Revisor Caja Menor.");

    if (args.decision === "rechazar") {
      await patchReembolsoConBandeja(ctx, args.reembolsoId, {
        estado: "rechazado",
        reviewerUserId: args.actorUserId,
        reviewerNombre: args.actorNombre,
        reviewerEmail: normalizeEmail(args.actorEmail),
        reviewerComentario: comentario,
        reviewerDecisionEn: now,
        permiteReenvioDirectoGerencia: undefined,
        retornoGerenciaPendienteEn: undefined,
        actualizadoEn: now,
      });
      for (const movimiento of movimientosActivos) {
        await patchMovimientoConBandeja(ctx, movimiento._id, {
          reembolsoId: undefined,
          estado: "pendiente_reembolso" as MovimientoCajaMenorEstado,
          rechazoRevisorUserId: args.actorUserId,
          rechazoRevisorNombre: args.actorNombre,
          rechazoRevisorEmail: normalizeEmail(args.actorEmail),
          rechazoRevisorComentario: comentario,
          rechazoRevisorEn: now,
          actualizadoEn: now,
        });
        await registrarAuditoriaCajaMenor(ctx, {
          movimiento,
          accion: "rechazar_reembolso_caja_menor",
          actor: args,
          comentario,
          estadoAnterior: "pendiente_revision",
          estadoNuevo: "pendiente_reembolso",
          valorContableCambio: cambiosPorMovimiento.get(String(movimiento._id)),
          causacionCambio: causacionCambios.get(String(movimiento._id)),
        });
      }
      await confirmarAdjuntosBorradorFase(ctx, args.reembolsoId, "revision");
      await guardarAdjuntosReembolso(ctx, {
        reembolsoId: args.reembolsoId,
        adjuntos: args.adjuntos,
        etapa: "revision",
        actor: args,
        now,
      });
      await scheduleProjectionRefreshForReembolso(ctx, reembolso);
      return args.reembolsoId;
    }

    const retornoGerencia = getRetornoGerenciaPendienteEn(reembolso);
    const destinoAprobacion =
      retornoGerencia === "contabilidad"
        ? "contabilidad"
        : (args.destinoAprobacion ?? "contabilidad");
    if (destinoAprobacion === "gerencia") {
      if (retornoGerencia !== "revision") {
        throw new Error(
          "Este reembolso debe pasar por Impuestos/Contabilidad antes de Gerencia Financiera."
        );
      }

      await patchReembolsoConBandeja(ctx, args.reembolsoId, {
        estado: "pendiente_aprobacion",
        reviewerUserId: args.actorUserId,
        reviewerNombre: args.actorNombre,
        reviewerEmail: normalizeEmail(args.actorEmail),
        reviewerComentario: comentario,
        reviewerDecisionEn: now,
        permiteReenvioDirectoGerencia: undefined,
        retornoGerenciaPendienteEn: undefined,
        actualizadoEn: now,
      });
      await registrarEventoReembolso(ctx, {
        reembolsoId: args.reembolsoId,
        tipo: "aprobacion",
        etapa: "revision",
        destinoEtapa: "gerencia",
        actor: args,
        comentario,
        creadoEn: now,
      });
      for (const movimiento of movimientosActivos) {
        await registrarAuditoriaCajaMenor(ctx, {
          movimiento,
          accion: "reenviar_gerencia_reembolso_caja_menor",
          actor: args,
          comentario,
          estadoAnterior: "pendiente_revision",
          estadoNuevo: "pendiente_aprobacion",
          valorContableCambio: cambiosPorMovimiento.get(String(movimiento._id)),
          causacionCambio: causacionCambios.get(String(movimiento._id)),
        });
      }
      await confirmarAdjuntosBorradorFase(ctx, args.reembolsoId, "revision");
      await guardarAdjuntosReembolso(ctx, {
        reembolsoId: args.reembolsoId,
        adjuntos: args.adjuntos,
        etapa: "revision",
        actor: args,
        now,
      });
      await scheduleProjectionRefreshForReembolso(ctx, reembolso);
      return args.reembolsoId;
    }

    const contadores = await getContadoresImpuestosConfigurados(ctx, caja.empresa_id);
    if (contadores.length === 0) {
      throw new Error("Configura al menos un contador de impuestos para esta empresa.");
    }

    const contadorPrevioId = reembolso.contadorAsignadoUserId;
    const contadorPrevioAunValido = Boolean(
      contadorPrevioId && contadores.some((item) => item.usuarioId === contadorPrevioId)
    );
    const esReenvio = Boolean(contadorPrevioId);
    let contadorUserId = args.contadorUserId?.trim() || undefined;
    if (!contadorUserId) {
      if (esReenvio && contadorPrevioAunValido) {
        contadorUserId = contadorPrevioId;
      } else {
        throw new Error(
          esReenvio && !contadorPrevioAunValido
            ? "El contador anterior ya no está configurado. Selecciona un contador válido."
            : "Selecciona el contador de Impuestos/Contabilidad."
        );
      }
    }
    if (!contadorUserId) {
      throw new Error("Selecciona el contador de Impuestos/Contabilidad.");
    }

    const contador = await assertContadorImpuestosConfigurado(ctx, caja.empresa_id, contadorUserId);

    await patchReembolsoConBandeja(ctx, args.reembolsoId, {
      estado: "pendiente_revision_impuestos",
      reviewerUserId: args.actorUserId,
      reviewerNombre: args.actorNombre,
      reviewerEmail: normalizeEmail(args.actorEmail),
      reviewerComentario: comentario,
      reviewerDecisionEn: now,
      permiteReenvioDirectoGerencia: undefined,
      retornoGerenciaPendienteEn:
        retornoGerencia === "contabilidad"
          ? "contabilidad"
          : undefined,
      ...CLEAR_CONTADOR_DECISION_FIELDS,
      actualizadoEn: now,
    });
    await asignarContadorReembolsoCajaMenor(ctx, {
      reembolsoId: args.reembolsoId,
      contador,
      actor: args,
      comentario,
      now,
    });
    for (const movimiento of movimientosActivos) {
      await registrarAuditoriaCajaMenor(ctx, {
        movimiento,
        accion: "enviar_impuestos_reembolso_caja_menor",
        actor: args,
        comentario,
        estadoAnterior: "pendiente_revision",
        estadoNuevo: "pendiente_revision_impuestos",
        valorContableCambio: cambiosPorMovimiento.get(String(movimiento._id)),
        causacionCambio: causacionCambios.get(String(movimiento._id)),
      });
    }
    await confirmarAdjuntosBorradorFase(ctx, args.reembolsoId, "revision");
    await guardarAdjuntosReembolso(ctx, {
      reembolsoId: args.reembolsoId,
      adjuntos: args.adjuntos,
      etapa: "revision",
      actor: args,
      now,
    });

    await scheduleProjectionRefreshForReembolso(ctx, reembolso);
    return args.reembolsoId;
  },
});

export const reasignarRevisorReembolsoCajaMenor = mutation({
  args: {
    reembolsoId: v.id("cajasMenoresReembolsos"),
    revisorUserId: v.string(),
    comentario: v.string(),
    ...actorArg,
  },
  handler: async (ctx, args) => {
    const reembolso = await ctx.db.get("cajasMenoresReembolsos", args.reembolsoId);
    if (!reembolso) throw new Error("Reembolso no encontrado.");
    if (reembolso.estado !== "pendiente_revision") {
      throw new Error("Sólo puedes reasignar reembolsos pendientes de revisión.");
    }

    const caja = await ctx.db.get("cajasMenores", reembolso.cajaMenorId);
    if (!caja) throw new Error("Caja menor no encontrada.");

    const comentario = args.comentario.trim();
    if (!comentario) {
      throw new Error("Indica el motivo de la reasignación.");
    }

    const [canReviewReembolso, canManage] = await Promise.all([
      usuarioEsRevisorCajaMenorConfiguradoEmpresa(ctx, caja.empresa_id, args.actorUserId),
      usuarioPuedeGestionarEmpresa(ctx, caja.empresa_id, args.actorUserId, args.actorRol),
    ]);
    const isAdmin = isAdminRol(args.actorRol);
    if (
      !puedeReasignarRevisionReembolso(reembolso, args.actorUserId, {
        isAdmin,
        canManage,
        canReviewReembolso,
      })
    ) {
      throw new Error("No tienes permiso para reasignar este reembolso.");
    }

    const revisor = await assertRevisorCajaMenorConfigurado(
      ctx,
      caja.empresa_id,
      args.revisorUserId
    );
    if (reembolso.reviewAssignedUserId === revisor.usuarioId) {
      throw new Error("Selecciona un revisor distinto al asignado actualmente.");
    }

    const movimientos = await getMovimientosByIds(ctx, reembolso.movimientoIds);
    await asignarRevisorReembolsoCajaMenor(ctx, {
      reembolsoId: args.reembolsoId,
      revisor,
      actor: args,
      comentario,
      esReasignacion: true,
      movimientos,
      estadoAnterior: reembolso.estado,
    });

    await scheduleProjectionRefreshForReembolso(ctx, reembolso);
    return args.reembolsoId;
  },
});

export const decidirRevisionImpuestosReembolsoCajaMenor = mutation({
  args: {
    reembolsoId: v.id("cajasMenoresReembolsos"),
    decision: v.union(v.literal("aprobar"), v.literal("rechazar"), v.literal("devolver")),
    destinoAprobacion: v.optional(v.union(v.literal("eventos_dian"), v.literal("gerencia"))),
    eventosDianUserId: v.optional(v.string()),
    comentario: v.optional(v.string()),
    adjuntos: v.optional(v.array(reembolsoAdjuntoArg)),
    ajustesValorContable: v.optional(v.array(reembolsoAjusteValorContableArg)),
    causaciones: v.optional(v.array(reembolsoCausacionArg)),
    ...actorArg,
  },
  handler: async (ctx, args) => {
    const reembolso = await ctx.db.get("cajasMenoresReembolsos", args.reembolsoId);
    if (!reembolso) throw new Error("Reembolso no encontrado.");
    if (reembolso.estado !== "pendiente_revision_impuestos") {
      throw new Error("Este reembolso no está pendiente de revisión de Impuestos/Contabilidad.");
    }
    const caja = await ctx.db.get("cajasMenores", reembolso.cajaMenorId);
    if (!caja) throw new Error("Caja menor no encontrada.");

    const canReviewContabilidad = await usuarioEsContadorImpuestosConfiguradoEmpresa(
      ctx,
      caja.empresa_id,
      args.actorUserId
    );
    if (
      !puedeDecidirContabilidadReembolso(reembolso, args.actorUserId, {
        canReviewContabilidad,
      })
    ) {
      throw new Error(
        "Sólo el contador asignado y configurado puede decidir esta solicitud en Contabilidad."
      );
    }

    const movimientos = await getMovimientosByIds(ctx, reembolso.movimientoIds);
    if (movimientos.length !== reembolso.movimientoIds.length) {
      throw new Error("Uno de los movimientos del reembolso no existe.");
    }
    for (const movimiento of movimientos) {
      if (movimiento.reembolsoId !== args.reembolsoId || movimiento.estado !== "en_reembolso") {
        throw new Error("Uno de los movimientos ya no está en reembolso.");
      }
    }

    const now = Date.now();
    const causacionCambios = await aplicarCausacionesReembolso(ctx, {
      reembolso,
      movimientos,
      causaciones: args.causaciones,
      actor: args,
      faseOperativa: reembolso.estado,
      now,
    });
    const {
      movimientos: movimientosActivos,
      cambiosPorMovimiento,
    } = await aplicarAjustesValorContableReembolso(ctx, {
      reembolso,
      caja,
      movimientos,
      ajustesValorContable: args.ajustesValorContable as ReembolsoAjusteValorContable[] | undefined,
      comentario: args.comentario,
      actor: args,
      now,
    });

    const comentarioObligatorio =
      args.decision === "rechazar" || args.decision === "devolver"
        ? args.comentario?.trim()
        : args.comentario?.trim();
    if ((args.decision === "rechazar" || args.decision === "devolver") && !comentarioObligatorio) {
      throw new Error(
        args.decision === "devolver"
          ? "Indica el motivo de la devolución a Revisor Caja Menor."
          : "Indica el motivo del rechazo."
      );
    }
    const comentario =
      comentarioObligatorio ||
      (args.decision === "aprobar"
        ? "Solicitud enviada a Gerencia Financiera por Contabilidad."
        : "");

    if (args.decision === "rechazar") {
      await patchReembolsoConBandeja(ctx, args.reembolsoId, {
        estado: "rechazado",
        contadorUserId: args.actorUserId,
        contadorNombre: args.actorNombre,
        contadorEmail: normalizeEmail(args.actorEmail),
        contadorComentario: comentario,
        contadorDecisionEn: now,
        actualizadoEn: now,
      });
      await registrarEventoReembolso(ctx, {
        reembolsoId: args.reembolsoId,
        tipo: "rechazo",
        etapa: "contabilidad",
        actor: args,
        comentario,
        creadoEn: now,
      });
      for (const movimiento of movimientosActivos) {
        await patchMovimientoConBandeja(ctx, movimiento._id, {
          reembolsoId: undefined,
          estado: "pendiente_reembolso" as MovimientoCajaMenorEstado,
          rechazoRevisorUserId: args.actorUserId,
          rechazoRevisorNombre: args.actorNombre,
          rechazoRevisorEmail: normalizeEmail(args.actorEmail),
          rechazoRevisorComentario: comentario,
          rechazoRevisorEn: now,
          actualizadoEn: now,
        });
        await registrarAuditoriaCajaMenor(ctx, {
          movimiento,
          accion: "rechazar_impuestos_reembolso_caja_menor",
          actor: args,
          comentario,
          estadoAnterior: "pendiente_revision_impuestos",
          estadoNuevo: "pendiente_reembolso",
          valorContableCambio: cambiosPorMovimiento.get(String(movimiento._id)),
          causacionCambio: causacionCambios.get(String(movimiento._id)),
        });
      }
      await confirmarAdjuntosBorradorFase(ctx, args.reembolsoId, "contabilidad");
      await guardarAdjuntosReembolso(ctx, {
        reembolsoId: args.reembolsoId,
        adjuntos: args.adjuntos,
        etapa: "contabilidad",
        actor: args,
        now,
      });
      const destinatarios: NotificacionDestinatario[] = [
        getSolicitanteReembolsoRecipient(reembolso),
      ];
      if (
        reembolso.reviewAssignedUserId &&
        reembolso.reviewAssignedNombre &&
        reembolso.reviewAssignedEmail
      ) {
        destinatarios.push({
          usuarioId: reembolso.reviewAssignedUserId,
          nombre: reembolso.reviewAssignedNombre,
          email: reembolso.reviewAssignedEmail,
        });
      } else if (reembolso.reviewerUserId && reembolso.reviewerNombre && reembolso.reviewerEmail) {
        destinatarios.push({
          usuarioId: reembolso.reviewerUserId,
          nombre: reembolso.reviewerNombre,
          email: reembolso.reviewerEmail,
        });
      }
      await scheduleProjectionRefreshForReembolso(ctx, reembolso);
      return args.reembolsoId;
    }

    if (args.decision === "devolver") {
      await patchReembolsoConBandeja(ctx, args.reembolsoId, {
        estado: "pendiente_revision",
        contadorUserId: args.actorUserId,
        contadorNombre: args.actorNombre,
        contadorEmail: normalizeEmail(args.actorEmail),
        contadorComentario: comentario,
        contadorDecisionEn: now,
        retornoGerenciaPendienteEn:
          getRetornoGerenciaPendienteEn(reembolso) === "contabilidad"
            ? "contabilidad"
            : undefined,
        actualizadoEn: now,
      });
      await registrarEventoReembolso(ctx, {
        reembolsoId: args.reembolsoId,
        tipo: "devolucion",
        etapa: "contabilidad",
        actor: args,
        comentario,
        creadoEn: now,
      });
      for (const movimiento of movimientosActivos) {
        await registrarAuditoriaCajaMenor(ctx, {
          movimiento,
          accion: "devolver_impuestos_reembolso_caja_menor",
          actor: args,
          comentario,
          estadoAnterior: "pendiente_revision_impuestos",
          estadoNuevo: "pendiente_revision",
          valorContableCambio: cambiosPorMovimiento.get(String(movimiento._id)),
          causacionCambio: causacionCambios.get(String(movimiento._id)),
        });
      }
      await confirmarAdjuntosBorradorFase(ctx, args.reembolsoId, "contabilidad");
      await guardarAdjuntosReembolso(ctx, {
        reembolsoId: args.reembolsoId,
        adjuntos: args.adjuntos,
        etapa: "contabilidad",
        actor: args,
        now,
      });
      await scheduleProjectionRefreshForReembolso(ctx, reembolso);
      return args.reembolsoId;
    }

    const retornoGerencia = getRetornoGerenciaPendienteEn(reembolso);
    const destinoAprobacion = args.destinoAprobacion ?? "eventos_dian";

    if (destinoAprobacion === "gerencia") {
      if (retornoGerencia !== "contabilidad") {
        throw new Error(
          "Solo puedes enviar directamente a Gerencia cuando Gerencia devolvió el reembolso a Impuestos."
        );
      }

      await patchReembolsoConBandeja(ctx, args.reembolsoId, {
        estado: "pendiente_aprobacion",
        contadorUserId: args.actorUserId,
        contadorNombre: args.actorNombre,
        contadorEmail: normalizeEmail(args.actorEmail),
        contadorComentario: comentario,
        contadorDecisionEn: now,
        retornoGerenciaPendienteEn: undefined,
        permiteReenvioDirectoGerencia: undefined,
        actualizadoEn: now,
      });
      await registrarEventoReembolso(ctx, {
        reembolsoId: args.reembolsoId,
        tipo: "aprobacion",
        etapa: "contabilidad",
        destinoEtapa: "gerencia",
        actor: args,
        comentario,
        creadoEn: now,
      });
      for (const movimiento of movimientosActivos) {
        await registrarAuditoriaCajaMenor(ctx, {
          movimiento,
          accion: "reenviar_gerencia_impuestos_reembolso_caja_menor",
          actor: args,
          comentario,
          estadoAnterior: "pendiente_revision_impuestos",
          estadoNuevo: "pendiente_aprobacion",
          valorContableCambio: cambiosPorMovimiento.get(String(movimiento._id)),
          causacionCambio: causacionCambios.get(String(movimiento._id)),
        });
      }
      await confirmarAdjuntosBorradorFase(ctx, args.reembolsoId, "contabilidad");
      await guardarAdjuntosReembolso(ctx, {
        reembolsoId: args.reembolsoId,
        adjuntos: args.adjuntos,
        etapa: "contabilidad",
        actor: args,
        now,
      });
      await scheduleProjectionRefreshForReembolso(ctx, reembolso);
      return args.reembolsoId;
    }

    const eventosDianUserId = args.eventosDianUserId?.trim();
    if (!eventosDianUserId) {
      throw new Error("Selecciona el responsable de Eventos DIAN.");
    }
    const eventosDian = await assertEventosDianConfigurado(
      ctx,
      caja.empresa_id,
      eventosDianUserId
    );

    await patchReembolsoConBandeja(ctx, args.reembolsoId, {
      estado: "pendiente_eventos_dian",
      contadorUserId: args.actorUserId,
      contadorNombre: args.actorNombre,
      contadorEmail: normalizeEmail(args.actorEmail),
      contadorComentario: comentario,
      contadorDecisionEn: now,
      retornoGerenciaPendienteEn: undefined,
      permiteReenvioDirectoGerencia: undefined,
      ...CLEAR_EVENTOS_DIAN_DECISION_FIELDS,
      actualizadoEn: now,
    });
    await asignarEventosDianReembolsoCajaMenor(ctx, {
      reembolsoId: args.reembolsoId,
      eventosDian,
      actor: args,
      comentario,
      now,
    });
    await registrarEventoReembolso(ctx, {
      reembolsoId: args.reembolsoId,
      tipo: "aprobacion",
      etapa: "contabilidad",
      destinoEtapa: "eventos_dian",
      actor: args,
      destinatario: eventosDian,
      comentario,
      creadoEn: now,
    });
    for (const movimiento of movimientosActivos) {
      await registrarAuditoriaCajaMenor(ctx, {
        movimiento,
        accion: "enviar_eventos_dian_reembolso_caja_menor",
        actor: args,
        comentario,
        estadoAnterior: "pendiente_revision_impuestos",
        estadoNuevo: "pendiente_eventos_dian",
        valorContableCambio: cambiosPorMovimiento.get(String(movimiento._id)),
        causacionCambio: causacionCambios.get(String(movimiento._id)),
      });
    }
    await confirmarAdjuntosBorradorFase(ctx, args.reembolsoId, "contabilidad");
    await guardarAdjuntosReembolso(ctx, {
      reembolsoId: args.reembolsoId,
      adjuntos: args.adjuntos,
      etapa: "contabilidad",
      actor: args,
      now,
    });

    await scheduleProjectionRefreshForReembolso(ctx, reembolso);
    return args.reembolsoId;
  },
});

export const avanzarFasesConsecutivasReembolsoCajaMenor = mutation({
  args: {
    reembolsoId: v.id("cajasMenoresReembolsos"),
    destinoEsperado: v.union(v.literal("eventos_dian"), v.literal("gerencia")),
    eventosDianUserId: v.optional(v.string()),
    comentario: v.optional(v.string()),
    adjuntos: v.optional(v.array(reembolsoAdjuntoArg)),
    ajustesValorContable: v.optional(v.array(reembolsoAjusteValorContableArg)),
    causaciones: v.optional(v.array(reembolsoCausacionArg)),
    ...actorArg,
  },
  handler: async (ctx, args) => {
    const reembolso = await ctx.db.get("cajasMenoresReembolsos", args.reembolsoId);
    if (!reembolso) throw new Error("Reembolso no encontrado.");
    if (
      reembolso.estado !== "pendiente_revision" &&
      reembolso.estado !== "pendiente_revision_impuestos"
    ) {
      throw new Error("Este reembolso no admite salto de fases consecutivas.");
    }

    const caja = await ctx.db.get("cajasMenores", reembolso.cajaMenorId);
    if (!caja) throw new Error("Caja menor no encontrada.");

    const actorEsResponsable =
      reembolso.estado === "pendiente_revision"
        ? puedeRevisarReembolsoAsignado(reembolso, args.actorUserId, false)
        : reembolso.contadorAsignadoUserId === args.actorUserId;
    if (!actorEsResponsable) {
      throw new Error(
        "Sólo el responsable asignado puede usar el salto por roles consecutivos."
      );
    }

    const [contadores, eventosDianUsuarios] = await Promise.all([
      getContadoresImpuestosConfigurados(ctx, caja.empresa_id),
      getEventosDianConfigurados(ctx, caja.empresa_id),
    ]);
    const plan = planificarSaltoFasesConsecutivasReembolso({
      estado: reembolso.estado,
      actorUserId: args.actorUserId,
      actorEsResponsableAsignado: actorEsResponsable,
      contadores,
      eventosDian: eventosDianUsuarios,
      retornoGerenciaPendienteEn: getRetornoGerenciaPendienteEn(reembolso),
    });
    if (!plan) {
      throw new Error("No hay fases consecutivas disponibles para el responsable actual.");
    }
    if (plan.destino !== args.destinoEsperado) {
      throw new Error(
        "La configuración cambió desde que abriste la acción. Actualiza la pantalla e intenta de nuevo."
      );
    }

    const movimientos = await getMovimientosByIds(ctx, reembolso.movimientoIds);
    if (movimientos.length !== reembolso.movimientoIds.length) {
      throw new Error("Uno de los movimientos del reembolso no existe.");
    }
    for (const movimiento of movimientos) {
      if (movimiento.reembolsoId !== args.reembolsoId || movimiento.estado !== "en_reembolso") {
        throw new Error("Uno de los movimientos ya no está en reembolso.");
      }
    }

    const now = Date.now();
    const causacionCambios = await aplicarCausacionesReembolso(ctx, {
      reembolso,
      movimientos,
      causaciones: args.causaciones,
      actor: args,
      faseOperativa: reembolso.estado,
      now,
    });
    const {
      movimientos: movimientosActivos,
      cambiosPorMovimiento,
    } = await aplicarAjustesValorContableReembolso(ctx, {
      reembolso,
      caja,
      movimientos,
      ajustesValorContable: args.ajustesValorContable as ReembolsoAjusteValorContable[] | undefined,
      comentario: args.comentario,
      actor: args,
      now,
    });

    const contadorActor = contadores.find((item) => item.usuarioId === args.actorUserId);
    if (!contadorActor) {
      throw new Error("El responsable ya no está configurado como contador.");
    }

    let timestamp = now;
    const comentario =
      args.comentario?.trim() ||
      (plan.destino === "gerencia"
        ? "Enviado a Gerencia Financiera por roles consecutivos."
        : "Enviado a Eventos DIAN por roles consecutivos.");
    const etapaOrigen =
      reembolso.estado === "pendiente_revision" ? ("revision" as const) : ("contabilidad" as const);

    if (reembolso.estado === "pendiente_revision") {
      if (
        !puedeRevisarReembolsoAsignado(reembolso, args.actorUserId, isAdminRol(args.actorRol))
      ) {
        throw new Error("Sólo el revisor asignado puede decidir esta solicitud en revisión.");
      }
      await patchReembolsoConBandeja(ctx, args.reembolsoId, {
        reviewerUserId: args.actorUserId,
        reviewerNombre: args.actorNombre,
        reviewerEmail: normalizeEmail(args.actorEmail),
        reviewerComentario: comentario,
        reviewerDecisionEn: timestamp,
        permiteReenvioDirectoGerencia: undefined,
        retornoGerenciaPendienteEn: undefined,
        actualizadoEn: timestamp,
      });
      await registrarEventoReembolso(ctx, {
        reembolsoId: args.reembolsoId,
        tipo: "aprobacion",
        etapa: "revision",
        destinoEtapa: plan.destino === "gerencia" ? "gerencia" : "eventos_dian",
        actor: args,
        comentario,
        creadoEn: timestamp,
        origen: "salto_fases_consecutivas",
      });
    } else {
      if (
        !puedeDecidirContabilidadReembolso(reembolso, args.actorUserId, {
          canReviewContabilidad: true,
        })
      ) {
        throw new Error(
          "Sólo el contador asignado puede decidir esta solicitud en Impuestos/Contabilidad."
        );
      }
    }

    if (plan.fasesSaltadas.includes("contabilidad")) {
      timestamp += 1;
      await patchReembolsoConBandeja(ctx, args.reembolsoId, {
        contadorAsignadoUserId: contadorActor.usuarioId,
        contadorAsignadoNombre: contadorActor.nombre,
        contadorAsignadoEmail: normalizeEmail(contadorActor.email),
        contadorAsignadoEn: timestamp,
        contadorAsignadoByUserId: args.actorUserId,
        contadorAsignadoByNombre: args.actorNombre,
        contadorAsignacionComentario: comentario,
        contadorUserId: contadorActor.usuarioId,
        contadorNombre: contadorActor.nombre,
        contadorEmail: normalizeEmail(contadorActor.email),
        contadorComentario: comentario,
        contadorDecisionEn: timestamp + 1,
        actualizadoEn: timestamp + 1,
      });
      await registrarEventoReembolso(ctx, {
        reembolsoId: args.reembolsoId,
        tipo: "asignacion",
        etapa: "contabilidad",
        actor: args,
        destinatario: contadorActor,
        comentario,
        creadoEn: timestamp,
        origen: "salto_fases_consecutivas",
      });
      await registrarEventoReembolso(ctx, {
        reembolsoId: args.reembolsoId,
        tipo: "aprobacion",
        etapa: "contabilidad",
        destinoEtapa: plan.destino === "gerencia" ? "gerencia" : "eventos_dian",
        actor: args,
        comentario,
        creadoEn: timestamp + 1,
        origen: "salto_fases_consecutivas",
      });
      for (const movimiento of movimientos) {
        await registrarAuditoriaCajaMenor(ctx, {
          movimiento,
          accion: "enviar_impuestos_reembolso_caja_menor",
          actor: args,
          comentario,
          estadoAnterior: "pendiente_revision",
          estadoNuevo:
            plan.destino === "gerencia" ? "pendiente_aprobacion" : "pendiente_eventos_dian",
          causacionCambio: causacionCambios.get(String(movimiento._id)),
        });
      }
    }

    if (plan.fasesSaltadas.includes("eventos_dian")) {
      const eventosDianActor = eventosDianUsuarios.find(
        (item) => item.usuarioId === args.actorUserId
      );
      if (!eventosDianActor) {
        throw new Error("El responsable ya no está configurado en Eventos DIAN.");
      }
      timestamp += 2;
      await patchReembolsoConBandeja(ctx, args.reembolsoId, {
        eventosDianAsignadoUserId: eventosDianActor.usuarioId,
        eventosDianAsignadoNombre: eventosDianActor.nombre,
        eventosDianAsignadoEmail: normalizeEmail(eventosDianActor.email),
        eventosDianAsignadoEn: timestamp,
        eventosDianAsignadoByUserId: args.actorUserId,
        eventosDianAsignadoByNombre: args.actorNombre,
        eventosDianAsignacionComentario: comentario,
        eventosDianUserId: eventosDianActor.usuarioId,
        eventosDianNombre: eventosDianActor.nombre,
        eventosDianEmail: normalizeEmail(eventosDianActor.email),
        eventosDianComentario: comentario,
        eventosDianDecisionEn: timestamp + 1,
        actualizadoEn: timestamp + 1,
      });
      await registrarEventoReembolso(ctx, {
        reembolsoId: args.reembolsoId,
        tipo: "asignacion",
        etapa: "eventos_dian",
        actor: args,
        destinatario: eventosDianActor,
        comentario,
        creadoEn: timestamp,
        origen: "salto_fases_consecutivas",
      });
      await registrarEventoReembolso(ctx, {
        reembolsoId: args.reembolsoId,
        tipo: "aprobacion",
        etapa: "eventos_dian",
        destinoEtapa: "gerencia",
        actor: args,
        comentario,
        creadoEn: timestamp + 1,
        origen: "salto_fases_consecutivas",
      });
    }

    if (plan.destino === "eventos_dian") {
      const eventosDian = await resolverEventosDianSaltoReembolso(
        ctx,
        caja.empresa_id,
        args.actorUserId ?? "",
        args.eventosDianUserId
      );
      timestamp += 3;
      await patchReembolsoConBandeja(ctx, args.reembolsoId, {
        estado: "pendiente_eventos_dian",
        retornoGerenciaPendienteEn: undefined,
        permiteReenvioDirectoGerencia: undefined,
        actualizadoEn: timestamp,
      });
      await asignarEventosDianReembolsoCajaMenor(ctx, {
        reembolsoId: args.reembolsoId,
        eventosDian,
        actor: args,
        comentario,
        now: timestamp,
      });
      for (const movimiento of movimientosActivos) {
        await registrarAuditoriaCajaMenor(ctx, {
          movimiento,
          accion: "enviar_eventos_dian_reembolso_caja_menor",
          actor: args,
          comentario,
          estadoAnterior:
            reembolso.estado === "pendiente_revision"
              ? "pendiente_revision"
              : "pendiente_revision_impuestos",
          estadoNuevo: "pendiente_eventos_dian",
          valorContableCambio: cambiosPorMovimiento.get(String(movimiento._id)),
          causacionCambio: causacionCambios.get(String(movimiento._id)),
        });
      }
      await confirmarAdjuntosBorradorFase(ctx, args.reembolsoId, etapaOrigen);
      await guardarAdjuntosReembolso(ctx, {
        reembolsoId: args.reembolsoId,
        adjuntos: args.adjuntos,
        etapa: etapaOrigen,
        actor: args,
        now: timestamp,
      });
      await scheduleProjectionRefreshForReembolso(ctx, reembolso);
      return args.reembolsoId;
    }

    timestamp += 3;
    await patchReembolsoConBandeja(ctx, args.reembolsoId, {
      estado: "pendiente_aprobacion",
      retornoGerenciaPendienteEn: undefined,
      permiteReenvioDirectoGerencia: undefined,
      actualizadoEn: timestamp,
    });
    if (reembolso.estado === "pendiente_revision_impuestos") {
      await patchReembolsoConBandeja(ctx, args.reembolsoId, {
        contadorUserId: args.actorUserId,
        contadorNombre: args.actorNombre,
        contadorEmail: normalizeEmail(args.actorEmail),
        contadorComentario: comentario,
        contadorDecisionEn: timestamp,
      });
      await registrarEventoReembolso(ctx, {
        reembolsoId: args.reembolsoId,
        tipo: "aprobacion",
        etapa: "contabilidad",
        destinoEtapa: "gerencia",
        actor: args,
        comentario,
        creadoEn: timestamp,
        origen: "salto_fases_consecutivas",
      });
    }
    for (const movimiento of movimientosActivos) {
      await registrarAuditoriaCajaMenor(ctx, {
        movimiento,
        accion:
          reembolso.estado === "pendiente_revision"
            ? "reenviar_gerencia_reembolso_caja_menor"
            : "reenviar_gerencia_impuestos_reembolso_caja_menor",
        actor: args,
        comentario,
        estadoAnterior:
          reembolso.estado === "pendiente_revision"
            ? "pendiente_revision"
            : "pendiente_revision_impuestos",
        estadoNuevo: "pendiente_aprobacion",
        valorContableCambio: cambiosPorMovimiento.get(String(movimiento._id)),
        causacionCambio: causacionCambios.get(String(movimiento._id)),
      });
    }
    await confirmarAdjuntosBorradorFase(ctx, args.reembolsoId, etapaOrigen);
    await guardarAdjuntosReembolso(ctx, {
      reembolsoId: args.reembolsoId,
      adjuntos: args.adjuntos,
      etapa: etapaOrigen,
      actor: args,
      now: timestamp,
    });
    await scheduleProjectionRefreshForReembolso(ctx, reembolso);
    return args.reembolsoId;
  },
});

export const reasignarContadorReembolsoCajaMenor = mutation({
  args: {
    reembolsoId: v.id("cajasMenoresReembolsos"),
    contadorUserId: v.string(),
    comentario: v.string(),
    ...actorArg,
  },
  handler: async (ctx, args) => {
    const reembolso = await ctx.db.get("cajasMenoresReembolsos", args.reembolsoId);
    if (!reembolso) throw new Error("Reembolso no encontrado.");
    if (reembolso.estado !== "pendiente_revision_impuestos") {
      throw new Error(
        "Sólo puedes reasignar reembolsos pendientes de revisión de Impuestos/Contabilidad."
      );
    }

    const caja = await ctx.db.get("cajasMenores", reembolso.cajaMenorId);
    if (!caja) throw new Error("Caja menor no encontrada.");

    const comentario = args.comentario.trim();
    if (!comentario) {
      throw new Error("Indica el motivo de la reasignación.");
    }

    const [canReviewContabilidad, canManage] = await Promise.all([
      usuarioEsContadorImpuestosConfiguradoEmpresa(ctx, caja.empresa_id, args.actorUserId),
      usuarioPuedeGestionarEmpresa(ctx, caja.empresa_id, args.actorUserId, args.actorRol),
    ]);
    const isAdmin = isAdminRol(args.actorRol);
    if (
      !puedeReasignarContabilidadReembolso(reembolso, args.actorUserId, {
        isAdmin,
        canManage,
        canReviewContabilidad,
      })
    ) {
      throw new Error("No tienes permiso para reasignar este reembolso.");
    }

    const contador = await assertContadorImpuestosConfigurado(
      ctx,
      caja.empresa_id,
      args.contadorUserId
    );
    if (reembolso.contadorAsignadoUserId === contador.usuarioId) {
      throw new Error("Selecciona un contador distinto al asignado actualmente.");
    }

    const movimientos = await getMovimientosByIds(ctx, reembolso.movimientoIds);
    await asignarContadorReembolsoCajaMenor(ctx, {
      reembolsoId: args.reembolsoId,
      contador,
      actor: args,
      comentario,
      esReasignacion: true,
      movimientos,
      estadoAnterior: reembolso.estado,
    });

    await scheduleProjectionRefreshForReembolso(ctx, reembolso);
    return args.reembolsoId;
  },
});

export const decidirEventosDianReembolsoCajaMenor = mutation({
  args: {
    reembolsoId: v.id("cajasMenoresReembolsos"),
    decision: v.union(v.literal("aprobar"), v.literal("rechazar"), v.literal("devolver")),
    contadorUserId: v.optional(v.string()),
    comentario: v.optional(v.string()),
    adjuntos: v.optional(v.array(reembolsoAdjuntoArg)),
    ajustesValorContable: v.optional(v.array(reembolsoAjusteValorContableArg)),
    causaciones: v.optional(v.array(reembolsoCausacionArg)),
    ...actorArg,
  },
  handler: async (ctx, args) => {
    const reembolso = await ctx.db.get("cajasMenoresReembolsos", args.reembolsoId);
    if (!reembolso) throw new Error("Reembolso no encontrado.");
    if (reembolso.estado !== "pendiente_eventos_dian") {
      throw new Error("Este reembolso no está pendiente de Eventos DIAN.");
    }
    const caja = await ctx.db.get("cajasMenores", reembolso.cajaMenorId);
    if (!caja) throw new Error("Caja menor no encontrada.");

    const canReviewEventosDian = await usuarioEsEventosDianConfiguradoEmpresa(
      ctx,
      caja.empresa_id,
      args.actorUserId
    );
    if (
      !puedeDecidirEventosDianReembolso(reembolso, args.actorUserId, {
        canReviewEventosDian,
      })
    ) {
      throw new Error(
        "Sólo el responsable asignado y configurado en Eventos DIAN puede decidir esta solicitud."
      );
    }

    const movimientos = await getMovimientosByIds(ctx, reembolso.movimientoIds);
    if (movimientos.length !== reembolso.movimientoIds.length) {
      throw new Error("Uno de los movimientos del reembolso no existe.");
    }
    for (const movimiento of movimientos) {
      if (movimiento.reembolsoId !== args.reembolsoId || movimiento.estado !== "en_reembolso") {
        throw new Error("Uno de los movimientos ya no está en reembolso.");
      }
    }

    const now = Date.now();
    const causacionCambios = await aplicarCausacionesReembolso(ctx, {
      reembolso,
      movimientos,
      causaciones: args.causaciones,
      actor: args,
      faseOperativa: reembolso.estado,
      now,
    });
    const {
      movimientos: movimientosActivos,
      cambiosPorMovimiento,
    } = await aplicarAjustesValorContableReembolso(ctx, {
      reembolso,
      caja,
      movimientos,
      ajustesValorContable: args.ajustesValorContable as ReembolsoAjusteValorContable[] | undefined,
      comentario: args.comentario,
      actor: args,
      now,
    });

    const comentarioObligatorio =
      args.decision === "rechazar" || args.decision === "devolver"
        ? args.comentario?.trim()
        : args.comentario?.trim();
    if ((args.decision === "rechazar" || args.decision === "devolver") && !comentarioObligatorio) {
      throw new Error(
        args.decision === "devolver"
          ? "Indica el motivo de la devolución a Impuestos/Contabilidad."
          : "Indica el motivo del rechazo."
      );
    }
    const comentario =
      comentarioObligatorio ||
      (args.decision === "aprobar"
        ? "Solicitud enviada a Gerencia Financiera por Eventos DIAN."
        : "");

    if (args.decision === "rechazar") {
      await patchReembolsoConBandeja(ctx, args.reembolsoId, {
        estado: "rechazado",
        eventosDianUserId: args.actorUserId,
        eventosDianNombre: args.actorNombre,
        eventosDianEmail: normalizeEmail(args.actorEmail),
        eventosDianComentario: comentario,
        eventosDianDecisionEn: now,
        actualizadoEn: now,
      });
      await registrarEventoReembolso(ctx, {
        reembolsoId: args.reembolsoId,
        tipo: "rechazo",
        etapa: "eventos_dian",
        actor: args,
        comentario,
        creadoEn: now,
      });
      for (const movimiento of movimientosActivos) {
        await patchMovimientoConBandeja(ctx, movimiento._id, {
          reembolsoId: undefined,
          estado: "pendiente_reembolso" as MovimientoCajaMenorEstado,
          rechazoRevisorUserId: args.actorUserId,
          rechazoRevisorNombre: args.actorNombre,
          rechazoRevisorEmail: normalizeEmail(args.actorEmail),
          rechazoRevisorComentario: comentario,
          rechazoRevisorEn: now,
          actualizadoEn: now,
        });
        await registrarAuditoriaCajaMenor(ctx, {
          movimiento,
          accion: "rechazar_eventos_dian_reembolso_caja_menor",
          actor: args,
          comentario,
          estadoAnterior: "pendiente_eventos_dian",
          estadoNuevo: "pendiente_reembolso",
          valorContableCambio: cambiosPorMovimiento.get(String(movimiento._id)),
          causacionCambio: causacionCambios.get(String(movimiento._id)),
        });
      }
      await confirmarAdjuntosBorradorFase(ctx, args.reembolsoId, "eventos_dian");
      await guardarAdjuntosReembolso(ctx, {
        reembolsoId: args.reembolsoId,
        adjuntos: args.adjuntos,
        etapa: "eventos_dian",
        actor: args,
        now,
      });
      const destinatarios: NotificacionDestinatario[] = [
        getSolicitanteReembolsoRecipient(reembolso),
      ];
      if (reembolso.contadorAsignadoEmail && reembolso.contadorAsignadoNombre) {
        destinatarios.push({
          usuarioId: reembolso.contadorAsignadoUserId,
          nombre: reembolso.contadorAsignadoNombre,
          email: reembolso.contadorAsignadoEmail,
        });
      }
      await scheduleProjectionRefreshForReembolso(ctx, reembolso);
      return args.reembolsoId;
    }

    if (args.decision === "devolver") {
      const contadores = await getContadoresImpuestosConfigurados(ctx, caja.empresa_id);
      if (contadores.length === 0) {
        throw new Error("Configura al menos un contador de impuestos para esta empresa.");
      }
      const contadorPrevioId = reembolso.contadorAsignadoUserId;
      const contadorPrevioValido = Boolean(
        contadorPrevioId && contadores.some((item) => item.usuarioId === contadorPrevioId)
      );
      const contadorUserId =
        args.contadorUserId?.trim() ||
        (contadorPrevioValido ? contadorPrevioId : undefined);
      if (!contadorUserId) {
        throw new Error(
          contadorPrevioId && !contadorPrevioValido
            ? "El contador anterior ya no está configurado. Selecciona un contador válido."
            : "Selecciona el contador de Impuestos/Contabilidad."
        );
      }
      const contador = await assertContadorImpuestosConfigurado(
        ctx,
        caja.empresa_id,
        contadorUserId
      );

      await patchReembolsoConBandeja(ctx, args.reembolsoId, {
        estado: "pendiente_revision_impuestos",
        eventosDianUserId: args.actorUserId,
        eventosDianNombre: args.actorNombre,
        eventosDianEmail: normalizeEmail(args.actorEmail),
        eventosDianComentario: comentario,
        eventosDianDecisionEn: now,
        ...CLEAR_CONTADOR_DECISION_FIELDS,
        actualizadoEn: now,
      });
      const eventoId = await registrarEventoReembolso(ctx, {
        reembolsoId: args.reembolsoId,
        tipo: "devolucion",
        etapa: "eventos_dian",
        destinoEtapa: "contabilidad",
        actor: args,
        destinatario: contador,
        comentario,
        creadoEn: now,
      });
      await asignarContadorReembolsoCajaMenor(ctx, {
        reembolsoId: args.reembolsoId,
        contador,
        actor: args,
        now,
      });
      for (const movimiento of movimientosActivos) {
        await registrarAuditoriaCajaMenor(ctx, {
          movimiento,
          accion: "devolver_eventos_dian_reembolso_caja_menor",
          actor: args,
          comentario,
          estadoAnterior: "pendiente_eventos_dian",
          estadoNuevo: "pendiente_revision_impuestos",
          valorContableCambio: cambiosPorMovimiento.get(String(movimiento._id)),
          causacionCambio: causacionCambios.get(String(movimiento._id)),
        });
      }
      await confirmarAdjuntosBorradorFase(ctx, args.reembolsoId, "eventos_dian");
      await guardarAdjuntosReembolso(ctx, {
        reembolsoId: args.reembolsoId,
        adjuntos: args.adjuntos,
        etapa: "eventos_dian",
        actor: args,
        now,
        eventoId,
      });
      await scheduleProjectionRefreshForReembolso(ctx, reembolso);
      return args.reembolsoId;
    }

    await patchReembolsoConBandeja(ctx, args.reembolsoId, {
      estado: "pendiente_aprobacion",
      eventosDianUserId: args.actorUserId,
      eventosDianNombre: args.actorNombre,
      eventosDianEmail: normalizeEmail(args.actorEmail),
      eventosDianComentario: comentario,
      eventosDianDecisionEn: now,
      actualizadoEn: now,
    });
    await registrarEventoReembolso(ctx, {
      reembolsoId: args.reembolsoId,
      tipo: "aprobacion",
      etapa: "eventos_dian",
      destinoEtapa: "gerencia",
      actor: args,
      comentario,
      creadoEn: now,
    });
    for (const movimiento of movimientosActivos) {
      await registrarAuditoriaCajaMenor(ctx, {
        movimiento,
        accion: "aprobar_eventos_dian_reembolso_caja_menor",
        actor: args,
        comentario,
        estadoAnterior: "pendiente_eventos_dian",
        estadoNuevo: "pendiente_aprobacion",
        valorContableCambio: cambiosPorMovimiento.get(String(movimiento._id)),
        causacionCambio: causacionCambios.get(String(movimiento._id)),
      });
    }
    await confirmarAdjuntosBorradorFase(ctx, args.reembolsoId, "eventos_dian");
    await guardarAdjuntosReembolso(ctx, {
      reembolsoId: args.reembolsoId,
      adjuntos: args.adjuntos,
      etapa: "eventos_dian",
      actor: args,
      now,
    });

    await scheduleProjectionRefreshForReembolso(ctx, reembolso);
    return args.reembolsoId;
  },
});

export const reasignarEventosDianReembolsoCajaMenor = mutation({
  args: {
    reembolsoId: v.id("cajasMenoresReembolsos"),
    eventosDianUserId: v.string(),
    comentario: v.string(),
    ...actorArg,
  },
  handler: async (ctx, args) => {
    const reembolso = await ctx.db.get("cajasMenoresReembolsos", args.reembolsoId);
    if (!reembolso) throw new Error("Reembolso no encontrado.");
    if (reembolso.estado !== "pendiente_eventos_dian") {
      throw new Error("Sólo puedes reasignar reembolsos pendientes de Eventos DIAN.");
    }

    const caja = await ctx.db.get("cajasMenores", reembolso.cajaMenorId);
    if (!caja) throw new Error("Caja menor no encontrada.");

    const comentario = args.comentario.trim();
    if (!comentario) {
      throw new Error("Indica el motivo de la reasignación.");
    }

    const [canReviewEventosDian, canManage] = await Promise.all([
      usuarioEsEventosDianConfiguradoEmpresa(ctx, caja.empresa_id, args.actorUserId),
      usuarioPuedeGestionarEmpresa(ctx, caja.empresa_id, args.actorUserId, args.actorRol),
    ]);
    const isAdmin = isAdminRol(args.actorRol);
    if (
      !puedeReasignarEventosDianReembolso(reembolso, args.actorUserId, {
        isAdmin,
        canManage,
        canReviewEventosDian,
      })
    ) {
      throw new Error("No tienes permiso para reasignar este reembolso.");
    }

    const eventosDian = await assertEventosDianConfigurado(
      ctx,
      caja.empresa_id,
      args.eventosDianUserId
    );
    if (reembolso.eventosDianAsignadoUserId === eventosDian.usuarioId) {
      throw new Error("Selecciona un responsable distinto al asignado actualmente.");
    }

    const movimientos = await getMovimientosByIds(ctx, reembolso.movimientoIds);
    await asignarEventosDianReembolsoCajaMenor(ctx, {
      reembolsoId: args.reembolsoId,
      eventosDian,
      actor: args,
      comentario,
      esReasignacion: true,
      movimientos,
      estadoAnterior: reembolso.estado,
    });

    await scheduleProjectionRefreshForReembolso(ctx, reembolso);
    return args.reembolsoId;
  },
});

export const decidirReembolsoCajaMenor = mutation({
  args: {
    reembolsoId: v.id("cajasMenoresReembolsos"),
    decision: v.union(v.literal("aprobar"), v.literal("rechazar"), v.literal("devolver")),
    destinoDevolucion: v.optional(
      v.union(v.literal("contabilidad"), v.literal("revision"), v.literal("eventos_dian"))
    ),
    responsableDestinoUserId: v.optional(v.string()),
    comentario: v.optional(v.string()),
    adjuntos: v.optional(v.array(reembolsoAdjuntoArg)),
    ...actorArg,
  },
  handler: async (ctx, args) => {
    const reembolso = await ctx.db.get("cajasMenoresReembolsos", args.reembolsoId);
    if (!reembolso) throw new Error("Reembolso no encontrado.");
    if (reembolso.estado !== "pendiente_aprobacion") {
      throw new Error("Este reembolso ya fue decidido.");
    }
    const caja = await ctx.db.get("cajasMenores", reembolso.cajaMenorId);
    if (!caja) throw new Error("Caja menor no encontrada.");
    await assertCanDecideReembolsoGerencia(ctx, caja.empresa_id, args.actorUserId);

    const now = Date.now();
    const movimientos = await getMovimientosByIds(ctx, reembolso.movimientoIds);
    for (const movimiento of movimientos) {
      if (movimiento.reembolsoId !== args.reembolsoId || movimiento.estado !== "en_reembolso") {
        throw new Error("Uno de los movimientos ya no está en reembolso.");
      }
    }

    if (args.decision === "devolver") {
      const comentario = args.comentario?.trim();
      if (!comentario) {
        throw new Error("Indica el motivo de la devolución.");
      }
      if (!args.destinoDevolucion) {
        throw new Error("Selecciona el destino de la devolución.");
      }

      if (args.destinoDevolucion === "contabilidad") {
        const contadores = await getContadoresImpuestosConfigurados(ctx, caja.empresa_id);
        if (contadores.length === 0) {
          throw new Error("Configura al menos un contador de impuestos para esta empresa.");
        }
        const contadorPrevioId = reembolso.contadorAsignadoUserId;
        const contadorPrevioValido = Boolean(
          contadorPrevioId && contadores.some((item) => item.usuarioId === contadorPrevioId)
        );
        const contadorUserId =
          args.responsableDestinoUserId?.trim() ||
          (contadorPrevioValido ? contadorPrevioId : undefined);
        if (!contadorUserId) {
          throw new Error(
            contadorPrevioId && !contadorPrevioValido
              ? "El contador anterior ya no está configurado. Selecciona un contador válido."
              : "Selecciona el contador de Impuestos/Contabilidad."
          );
        }
        const contador = await assertContadorImpuestosConfigurado(
          ctx,
          caja.empresa_id,
          contadorUserId
        );

        await patchReembolsoConBandeja(ctx, args.reembolsoId, {
          estado: "pendiente_revision_impuestos",
          retornoGerenciaPendienteEn: "contabilidad",
          permiteReenvioDirectoGerencia: undefined,
          ...CLEAR_CONTADOR_DECISION_FIELDS,
          ...CLEAR_EVENTOS_DIAN_DECISION_FIELDS,
          ...CLEAR_GF_DECISION_FIELDS,
          actualizadoEn: now,
        });
        const eventoId = await registrarEventoReembolso(ctx, {
          reembolsoId: args.reembolsoId,
          tipo: "devolucion",
          etapa: "aprobacion",
          destinoEtapa: "contabilidad",
          actor: args,
          destinatario: contador,
          comentario,
          creadoEn: now,
        });
        await asignarContadorReembolsoCajaMenor(ctx, {
          reembolsoId: args.reembolsoId,
          contador,
          actor: args,
          now,
        });
        for (const movimiento of movimientos) {
          await registrarAuditoriaCajaMenor(ctx, {
            movimiento,
            accion: "devolver_gerencia_contabilidad_reembolso_caja_menor",
            actor: args,
            comentario,
            estadoAnterior: "pendiente_aprobacion",
            estadoNuevo: "pendiente_revision_impuestos",
          });
        }
        await confirmarAdjuntosBorradorFase(ctx, args.reembolsoId, "aprobacion");
        await guardarAdjuntosReembolso(ctx, {
          reembolsoId: args.reembolsoId,
          adjuntos: args.adjuntos,
          etapa: "aprobacion",
          actor: args,
          now,
          eventoId,
        });
        await scheduleProjectionRefreshForReembolso(ctx, reembolso);
        return args.reembolsoId;
      }

      if (args.destinoDevolucion === "eventos_dian") {
        const eventosDianUsuarios = await getEventosDianConfigurados(ctx, caja.empresa_id);
        if (eventosDianUsuarios.length === 0) {
          throw new Error("Configura al menos un usuario de Eventos DIAN para esta empresa.");
        }
        const eventosPrevioId = reembolso.eventosDianAsignadoUserId;
        const eventosPrevioValido = Boolean(
          eventosPrevioId && eventosDianUsuarios.some((item) => item.usuarioId === eventosPrevioId)
        );
        const eventosDianUserId =
          args.responsableDestinoUserId?.trim() ||
          (eventosPrevioValido ? eventosPrevioId : undefined);
        if (!eventosDianUserId) {
          throw new Error(
            eventosPrevioId && !eventosPrevioValido
              ? "El responsable anterior de Eventos DIAN ya no está configurado. Selecciona uno válido."
              : "Selecciona el responsable de Eventos DIAN."
          );
        }
        const eventosDian = await assertEventosDianConfigurado(
          ctx,
          caja.empresa_id,
          eventosDianUserId
        );

        await patchReembolsoConBandeja(ctx, args.reembolsoId, {
          estado: "pendiente_eventos_dian",
          retornoGerenciaPendienteEn: undefined,
          permiteReenvioDirectoGerencia: undefined,
          ...CLEAR_EVENTOS_DIAN_DECISION_FIELDS,
          ...CLEAR_GF_DECISION_FIELDS,
          actualizadoEn: now,
        });
        const eventoId = await registrarEventoReembolso(ctx, {
          reembolsoId: args.reembolsoId,
          tipo: "devolucion",
          etapa: "aprobacion",
          destinoEtapa: "eventos_dian",
          actor: args,
          destinatario: eventosDian,
          comentario,
          creadoEn: now,
        });
        await asignarEventosDianReembolsoCajaMenor(ctx, {
          reembolsoId: args.reembolsoId,
          eventosDian,
          actor: args,
          now,
        });
        for (const movimiento of movimientos) {
          await registrarAuditoriaCajaMenor(ctx, {
            movimiento,
            accion: "devolver_gerencia_eventos_dian_reembolso_caja_menor",
            actor: args,
            comentario,
            estadoAnterior: "pendiente_aprobacion",
            estadoNuevo: "pendiente_eventos_dian",
          });
        }
        await confirmarAdjuntosBorradorFase(ctx, args.reembolsoId, "aprobacion");
        await guardarAdjuntosReembolso(ctx, {
          reembolsoId: args.reembolsoId,
          adjuntos: args.adjuntos,
          etapa: "aprobacion",
          actor: args,
          now,
          eventoId,
        });
        await scheduleProjectionRefreshForReembolso(ctx, reembolso);
        return args.reembolsoId;
      }

      const revisores = await getRevisoresCajaMenorConfigurados(ctx, caja.empresa_id, {
        includeZero: true,
      });
      if (revisores.length === 0) {
        throw new Error("Configura al menos un Revisor Caja Menor para esta empresa.");
      }
      const revisorPrevioId = reembolso.reviewAssignedUserId;
      const revisorPrevioValido = Boolean(
        revisorPrevioId && revisores.some((item) => item.usuarioId === revisorPrevioId)
      );
      const revisorUserId =
        args.responsableDestinoUserId?.trim() ||
        (revisorPrevioValido ? revisorPrevioId : undefined);
      if (!revisorUserId) {
        throw new Error(
          revisorPrevioId && !revisorPrevioValido
            ? "El revisor anterior ya no está configurado. Selecciona un revisor válido."
            : "Selecciona el Revisor Caja Menor."
        );
      }
      const revisor = await assertRevisorCajaMenorConfigurado(ctx, caja.empresa_id, revisorUserId);

      await patchReembolsoConBandeja(ctx, args.reembolsoId, {
        estado: "pendiente_revision",
        retornoGerenciaPendienteEn: "revision",
        permiteReenvioDirectoGerencia: undefined,
        ...CLEAR_CONTADOR_DECISION_FIELDS,
        ...CLEAR_EVENTOS_DIAN_DECISION_FIELDS,
        ...CLEAR_GF_DECISION_FIELDS,
        actualizadoEn: now,
      });
      const eventoId = await registrarEventoReembolso(ctx, {
        reembolsoId: args.reembolsoId,
        tipo: "devolucion",
        etapa: "aprobacion",
        destinoEtapa: "revision",
        actor: args,
        destinatario: revisor,
        comentario,
        creadoEn: now,
      });
      await asignarRevisorReembolsoCajaMenor(ctx, {
        reembolsoId: args.reembolsoId,
        revisor,
        actor: args,
        comentario,
      });
      for (const movimiento of movimientos) {
        await registrarAuditoriaCajaMenor(ctx, {
          movimiento,
          accion: "devolver_gerencia_revision_reembolso_caja_menor",
          actor: args,
          comentario,
          estadoAnterior: "pendiente_aprobacion",
          estadoNuevo: "pendiente_revision",
        });
      }
      await confirmarAdjuntosBorradorFase(ctx, args.reembolsoId, "aprobacion");
      await guardarAdjuntosReembolso(ctx, {
        reembolsoId: args.reembolsoId,
        adjuntos: args.adjuntos,
        etapa: "aprobacion",
        actor: args,
        now,
        eventoId,
      });
      await scheduleProjectionRefreshForReembolso(ctx, reembolso);
      return args.reembolsoId;
    }

    if (args.decision === "rechazar") {
      await patchReembolsoConBandeja(ctx, args.reembolsoId, {
        estado: "rechazado",
        gfAprobadorUserId: args.actorUserId,
        gfAprobadorNombre: args.actorNombre,
        gfAprobadorEmail: normalizeEmail(args.actorEmail),
        gfComentario: args.comentario?.trim() || undefined,
        gfDecisionEn: now,
        actualizadoEn: now,
      });
      await registrarEventoReembolso(ctx, {
        reembolsoId: args.reembolsoId,
        tipo: "rechazo",
        etapa: "aprobacion",
        actor: args,
        comentario: args.comentario?.trim() || "Reembolso de Caja Menor rechazado.",
        creadoEn: now,
      });
      for (const movimiento of movimientos) {
        await patchMovimientoConBandeja(ctx, movimiento._id, {
          reembolsoId: undefined,
          estado: "pendiente_reembolso" as MovimientoCajaMenorEstado,
          actualizadoEn: now,
        });
        await registrarAuditoriaCajaMenor(ctx, {
          movimiento,
          accion: "rechazar_reembolso_caja_menor",
          actor: args,
          comentario: args.comentario?.trim() || "Reembolso de Caja Menor rechazado.",
          estadoAnterior: "pendiente_aprobacion",
          estadoNuevo: "pendiente_reembolso",
        });
      }

      const destinatariosRechazo: NotificacionDestinatario[] = [];
      if (reembolso.reviewerNombre && reembolso.reviewerEmail) {
        destinatariosRechazo.push({
          usuarioId: reembolso.reviewerUserId,
          nombre: reembolso.reviewerNombre,
          email: reembolso.reviewerEmail,
        });
      }
      destinatariosRechazo.push({
        usuarioId: reembolso.custodioUserId,
        nombre: reembolso.custodioNombre,
        email: reembolso.custodioEmail,
      });

      await confirmarAdjuntosBorradorFase(ctx, args.reembolsoId, "aprobacion");
      await guardarAdjuntosReembolso(ctx, {
        reembolsoId: args.reembolsoId,
        adjuntos: args.adjuntos,
        etapa: "aprobacion",
        actor: args,
        now,
      });

      await scheduleProjectionRefreshForReembolso(ctx, reembolso);
      return args.reembolsoId;
    }

    const tesorero = await getTesoreroConfigurado(ctx, caja.empresa_id);

    await patchReembolsoConBandeja(ctx, args.reembolsoId, {
      estado: "pendiente_pago_tesoreria",
      gfAprobadorUserId: args.actorUserId,
      gfAprobadorNombre: args.actorNombre,
      gfAprobadorEmail: normalizeEmail(args.actorEmail),
      gfComentario: args.comentario?.trim() || undefined,
      gfDecisionEn: now,
      actualizadoEn: now,
      tesoreroUserId: tesorero.usuarioId,
      tesoreroNombre: tesorero.nombre,
      tesoreroEmail: tesorero.email,
    });
    await registrarEventoReembolso(ctx, {
      reembolsoId: args.reembolsoId,
      tipo: "aprobacion",
      etapa: "aprobacion",
      actor: args,
      comentario: args.comentario?.trim() || "Reembolso de Caja Menor aprobado.",
      creadoEn: now,
    });
    for (const movimiento of movimientos) {
      await registrarAuditoriaCajaMenor(ctx, {
        movimiento,
        accion: "aprobar_reembolso_caja_menor",
        actor: args,
        comentario: args.comentario?.trim() || "Reembolso de Caja Menor aprobado.",
        estadoAnterior: "pendiente_aprobacion",
        estadoNuevo: "pendiente_pago_tesoreria",
      });
    }

    await confirmarAdjuntosBorradorFase(ctx, args.reembolsoId, "aprobacion");
    await guardarAdjuntosReembolso(ctx, {
      reembolsoId: args.reembolsoId,
      adjuntos: args.adjuntos,
      etapa: "aprobacion",
      actor: args,
      now,
    });

    await scheduleProjectionRefreshForReembolso(ctx, reembolso);
    return args.reembolsoId;
  },
});

export const confirmarRecepcionReembolsoCajaMenor = mutation({
  args: {
    reembolsoId: v.id("cajasMenoresReembolsos"),
    comentario: v.optional(v.string()),
    ...actorArg,
  },
  handler: async (ctx, args) => {
    const reembolso = await ctx.db.get("cajasMenoresReembolsos", args.reembolsoId);
    if (!reembolso) throw new Error("Reembolso no encontrado.");
    if (reembolso.estado !== "aprobado_pendiente_recibo") {
      throw new Error("Este reembolso no está pendiente de recibo.");
    }
    if (reembolso.custodioUserId !== args.actorUserId) {
      throw new Error("Sólo el custodio designado puede confirmar el recibo.");
    }
    const caja = await ctx.db.get("cajasMenores", reembolso.cajaMenorId);
    if (!caja) throw new Error("Caja menor no encontrada.");
    const now = Date.now();
    await patchReembolsoConBandeja(ctx, args.reembolsoId, {
      estado: "recibido",
      custodioComentario: args.comentario?.trim() || undefined,
      recibidoEn: now,
      actualizadoEn: now,
    });

    const movimientos = await getMovimientosByIds(ctx, reembolso.movimientoIds);
    for (const movimiento of movimientos) {
      await patchMovimientoConBandeja(ctx, movimiento._id, {
        estado: "reembolsado" as MovimientoCajaMenorEstado,
        actualizadoEn: now,
      });
      const tarea = await getTareaByFactura(ctx, movimiento.facturaId);
      const isLegacyReembolsoTask = tarea?.estado === "reembolso_caja_menor";
      if (tarea && isLegacyReembolsoTask) {
        await ctx.db.patch("facturacionTareas", tarea._id, {
          estado: "legalizada",
          asignadoAUserId: args.actorUserId,
          asignadoANombre: args.actorNombre,
          asignadoAEmail: normalizeEmail(args.actorEmail),
          actualizadoEn: now,
        });
      }
      await registrarAuditoriaCajaMenor(ctx, {
        movimiento,
        accion: "confirmar_reembolso_caja_menor",
        actor: args,
        comentario:
          args.comentario?.trim() || "Custodio confirmó el recibo del reembolso de Caja Menor.",
        estadoAnterior: "aprobado_pendiente_recibo",
        estadoNuevo: isLegacyReembolsoTask ? "legalizada" : "reembolsado",
      });
    }

    await scheduleProjectionRefreshForReembolso(ctx, reembolso);
    return args.reembolsoId;
  },
});

export const cargarComprobantePagoReembolsoCajaMenor = mutation({
  args: {
    reembolsoId: v.id("cajasMenoresReembolsos"),
    /** Preferred: confirm an already-persisted draft attachment. */
    adjuntoId: v.optional(v.id("cajasMenoresReembolsoAdjuntos")),
    /** Legacy client args — kept for deployed clients. */
    comprobanteStorageId: v.optional(v.id("_storage")),
    comprobanteNombre: v.optional(v.string()),
    comprobanteMimeType: v.optional(v.string()),
    comentario: v.optional(v.string()),
    ...actorArg,
  },
  handler: async (ctx, args) => {
    const reembolso = await ctx.db.get("cajasMenoresReembolsos", args.reembolsoId);
    if (!reembolso) throw new Error("Reembolso no encontrado.");
    if (reembolso.estado !== "pendiente_pago_tesoreria") {
      throw new Error("Este reembolso no está pendiente de pago en Tesorería.");
    }
    const caja = await ctx.db.get("cajasMenores", reembolso.cajaMenorId);
    if (!caja) throw new Error("Caja menor no encontrada.");
    await assertCanCargarComprobanteTesoreria(
      ctx,
      caja.empresa_id,
      args.actorUserId,
      args.actorRol
    );

    let comprobanteStorageId: Id<"_storage">;
    let comprobanteNombre: string;
    let comprobanteMimeType: string | undefined;
    let adjuntoAConfirmar: Id<"cajasMenoresReembolsoAdjuntos"> | null = null;

    if (args.adjuntoId) {
      const adjunto = await ctx.db.get("cajasMenoresReembolsoAdjuntos", args.adjuntoId);
      if (!adjunto || adjunto.reembolsoId !== args.reembolsoId) {
        throw new Error("Comprobante no encontrado.");
      }
      if (adjunto.etapa !== "tesoreria") {
        throw new Error("El adjunto no pertenece a Tesorería.");
      }
      if (getAdjuntoEstado(adjunto) !== "borrador") {
        throw new Error("El comprobante ya fue confirmado.");
      }
      comprobanteStorageId = adjunto.storageId;
      comprobanteNombre = adjunto.nombre;
      comprobanteMimeType = adjunto.mimeType;
      adjuntoAConfirmar = adjunto._id;
    } else if (args.comprobanteStorageId && args.comprobanteNombre?.trim()) {
      comprobanteStorageId = args.comprobanteStorageId;
      comprobanteNombre = args.comprobanteNombre.trim();
      comprobanteMimeType = args.comprobanteMimeType?.trim() || undefined;
    } else {
      throw new Error("Debes indicar el comprobante de pago.");
    }

    const now = Date.now();
    await patchReembolsoConBandeja(ctx, args.reembolsoId, {
      estado: "recibido",
      comprobanteStorageId,
      comprobanteNombre,
      comprobanteMimeType,
      comprobanteCargadoEn: now,
      comprobanteCargadoPorUserId: args.actorUserId,
      comprobanteCargadoPorNombre: args.actorNombre,
      comprobanteCargadoPorEmail: normalizeEmail(args.actorEmail),
      comprobanteComentario: args.comentario?.trim() || undefined,
      recibidoEn: now,
      actualizadoEn: now,
    });

    const movimientos = await getMovimientosByIds(ctx, reembolso.movimientoIds);
    for (const movimiento of movimientos) {
      await patchMovimientoConBandeja(ctx, movimiento._id, {
        estado: "reembolsado" as MovimientoCajaMenorEstado,
        actualizadoEn: now,
      });
      const tarea = await getTareaByFactura(ctx, movimiento.facturaId);
      if (tarea?.estado === "reembolso_caja_menor") {
        await ctx.db.patch("facturacionTareas", tarea._id, {
          estado: "legalizada",
          asignadoAUserId: reembolso.custodioUserId,
          asignadoANombre: reembolso.custodioNombre,
          asignadoAEmail: normalizeEmail(reembolso.custodioEmail),
          comprobantePagoStorageId: comprobanteStorageId,
          comprobantePagoNombre: comprobanteNombre,
          actualizadoEn: now,
        });
      } else if (tarea) {
        await ctx.db.patch("facturacionTareas", tarea._id, {
          comprobantePagoStorageId: comprobanteStorageId,
          comprobantePagoNombre: comprobanteNombre,
          actualizadoEn: now,
        });
      }
      await registrarAuditoriaCajaMenor(ctx, {
        movimiento,
        accion: "confirmar_reembolso_caja_menor",
        actor: args,
        comentario:
          args.comentario?.trim() ||
          "Tesorería cargó comprobante de pago del reembolso de Caja Menor.",
        estadoAnterior: "pendiente_pago_tesoreria",
        estadoNuevo: "reembolsado",
      });
    }

    if (adjuntoAConfirmar) {
      await ctx.db.patch("cajasMenoresReembolsoAdjuntos", adjuntoAConfirmar, { estado: "confirmado" });
      // Confirm any other stray drafts in tesoreria (should be none).
      await confirmarAdjuntosBorradorFase(ctx, args.reembolsoId, "tesoreria");
    } else {
      await confirmarAdjuntosBorradorFase(ctx, args.reembolsoId, "tesoreria");
      await guardarAdjuntosReembolso(ctx, {
        reembolsoId: args.reembolsoId,
        adjuntos: [
          {
            storageId: comprobanteStorageId,
            nombre: comprobanteNombre,
            mimeType: comprobanteMimeType,
          },
        ],
        etapa: "tesoreria",
        actor: args,
        now,
      });
    }

    await scheduleProjectionRefreshForReembolso(ctx, reembolso);
    return args.reembolsoId;
  },
});

export const crearAdjuntoBorradorReembolsoCajaMenor = mutation({
  args: {
    reembolsoId: v.id("cajasMenoresReembolsos"),
    storageId: v.id("_storage"),
    nombre: v.string(),
    mimeType: v.optional(v.string()),
    ...actorArg,
  },
  returns: v.id("cajasMenoresReembolsoAdjuntos"),
  handler: async (ctx, args) => {
    const reembolso = await ctx.db.get("cajasMenoresReembolsos", args.reembolsoId);
    if (!reembolso) throw new Error("Reembolso no encontrado.");
    const caja = await ctx.db.get("cajasMenores", reembolso.cajaMenorId);
    if (!caja) throw new Error("Caja menor no encontrada.");
    const etapa = await assertPuedeGestionarAdjuntoReembolso(ctx, reembolso, caja, args);

    const nombre = args.nombre.trim();
    if (!nombre) throw new Error("Indica el nombre del archivo.");

    const metadata = await ctx.db.system.get("_storage", args.storageId);
    if (!metadata) {
      throw new Error("El archivo subido no está disponible en almacenamiento.");
    }
    const mimeType = getReembolsoAdjuntoMimeType(metadata, nombre, args.mimeType);

    const existentes = await listAdjuntosReembolso(ctx, args.reembolsoId);
    const duplicado = existentes.find(
      (adjunto) => adjunto.etapa === etapa && String(adjunto.storageId) === String(args.storageId)
    );
    if (duplicado) {
      return duplicado._id;
    }

    if (etapa === "tesoreria") {
      const borradoresTesoreria = existentes.filter(
        (adjunto) => adjunto.etapa === "tesoreria" && getAdjuntoEstado(adjunto) === "borrador"
      );
      if (borradoresTesoreria.length > 0) {
        throw new Error(
          "Tesorería sólo permite un comprobante. Elimina el actual para cargar otro."
        );
      }
    }

    return await ctx.db.insert("cajasMenoresReembolsoAdjuntos", {
      reembolsoId: args.reembolsoId,
      storageId: args.storageId,
      nombre,
      mimeType,
      etapa,
      estado: "borrador",
      actorUserId: args.actorUserId,
      actorNombre: args.actorNombre,
      actorEmail: normalizeEmail(args.actorEmail),
      creadoEn: Date.now(),
    });
  },
});

export const eliminarAdjuntoBorradorReembolsoCajaMenor = mutation({
  args: {
    adjuntoId: v.id("cajasMenoresReembolsoAdjuntos"),
    ...actorArg,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const adjunto = await ctx.db.get("cajasMenoresReembolsoAdjuntos", args.adjuntoId);
    if (!adjunto) throw new Error("Adjunto no encontrado.");
    if (getAdjuntoEstado(adjunto) !== "borrador") {
      throw new Error("Sólo puedes eliminar archivos en borrador.");
    }

    const reembolso = await ctx.db.get("cajasMenoresReembolsos", adjunto.reembolsoId);
    if (!reembolso) throw new Error("Reembolso no encontrado.");
    const etapaActiva = etapaAdjuntoDesdeEstadoReembolso(reembolso.estado);
    if (!etapaActiva || etapaActiva !== adjunto.etapa) {
      throw new Error("Sólo puedes eliminar borradores de la fase activa del reembolso.");
    }
    if (adjunto.actorUserId !== args.actorUserId) {
      throw new Error("Sólo quien subió el archivo puede eliminarlo.");
    }

    await ctx.db.delete("cajasMenoresReembolsoAdjuntos", args.adjuntoId);
    try {
      await ctx.storage.delete(adjunto.storageId);
    } catch {
      // Storage may already be gone; DB row is the source of truth.
    }
    return null;
  },
});

/** Removes a storage object only when its draft row could not be created. */
export const eliminarArchivoFallidoReembolsoCajaMenor = mutation({
  args: {
    reembolsoId: v.id("cajasMenoresReembolsos"),
    storageId: v.id("_storage"),
    ...actorArg,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const reembolso = await ctx.db.get("cajasMenoresReembolsos", args.reembolsoId);
    if (!reembolso) throw new Error("Reembolso no encontrado.");
    const caja = await ctx.db.get("cajasMenores", reembolso.cajaMenorId);
    if (!caja) throw new Error("Caja menor no encontrada.");
    await assertPuedeGestionarAdjuntoReembolso(ctx, reembolso, caja, args);

    const existing = (await listAdjuntosReembolso(ctx, args.reembolsoId)).some(
      (adjunto) => String(adjunto.storageId) === String(args.storageId)
    );
    if (existing) return null;

    try {
      await ctx.storage.delete(args.storageId);
    } catch {
      // The object may already have been deleted; there is no DB row to retain.
    }
    return null;
  },
});

export const obtenerAdjuntosReembolsoCajaMenor = internalQuery({
  args: { reembolsoId: v.id("cajasMenoresReembolsos") },
  handler: async (ctx, args) => {
    const adjuntos = await ctx.db
      .query("cajasMenoresReembolsoAdjuntos")
      .withIndex("by_reembolsoId", (q) => q.eq("reembolsoId", args.reembolsoId))
      .collect();
    return await Promise.all(
      adjuntos
        .filter((adjunto) => isAdjuntoConfirmado(adjunto))
        .map(async (adjunto) => ({
          ...adjunto,
          url: await ctx.storage.getUrl(adjunto.storageId),
        }))
    );
  },
});

const reembolsoTimelineEventoValidator = v.object({
  id: v.string(),
  etapa: v.union(
    v.literal("solicitud"),
    v.literal("aprobacion_lider"),
    v.literal("revision"),
    v.literal("contabilidad"),
    v.literal("eventos_dian"),
    v.literal("aprobacion"),
    v.literal("tesoreria"),
    v.literal("recibido")
  ),
  tipo: v.union(
    v.literal("creado"),
    v.literal("aprobado"),
    v.literal("rechazado"),
    v.literal("devuelto"),
    v.literal("movido"),
    v.literal("comprobante"),
    v.literal("recibido")
  ),
  titulo: v.string(),
  fecha: v.number(),
  usuarioNombre: v.string(),
  usuarioEmail: v.optional(v.string()),
  comentario: v.optional(v.string()),
  adjuntos: v.array(
    v.object({
      nombre: v.string(),
      url: v.union(v.string(), v.null()),
      mimeType: v.optional(v.string()),
    })
  ),
});

export const obtenerDetalleReembolsoCajaMenor = query({
  args: {
    reembolsoId: v.id("cajasMenoresReembolsos"),
    actorUserId: v.optional(v.string()),
    actorRol: v.optional(v.number()),
  },
  returns: v.union(
    v.object({
      reembolso: v.any(),
      caja: v.union(v.any(), v.null()),
      movimientos: v.array(v.any()),
      adjuntos: v.array(v.any()),
      adjuntosBorradorFaseActual: v.array(
        v.object({
          _id: v.id("cajasMenoresReembolsoAdjuntos"),
          storageId: v.id("_storage"),
          nombre: v.string(),
          mimeType: v.optional(v.string()),
          etapa: v.union(
            v.literal("revision"),
            v.literal("contabilidad"),
            v.literal("eventos_dian"),
            v.literal("aprobacion"),
            v.literal("tesoreria")
          ),
          actorUserId: v.optional(v.string()),
          actorNombre: v.string(),
          creadoEn: v.number(),
          url: v.union(v.string(), v.null()),
          puedeEliminar: v.boolean(),
        })
      ),
      timeline: v.array(reembolsoTimelineEventoValidator),
      faseModal: v.union(
        v.literal("pendiente_aprobacion_lider"),
        v.literal("pendiente_revision"),
        v.literal("pendiente_revision_impuestos"),
        v.literal("pendiente_eventos_dian"),
        v.literal("pendiente_aprobacion"),
        v.literal("pendiente_pago_tesoreria"),
        v.literal("solo_lectura")
      ),
      puedeActuar: v.boolean(),
      puedeReasignarRevision: v.boolean(),
      puedeReasignarContabilidad: v.boolean(),
      puedeReasignarEventosDian: v.boolean(),
      contadorPrevioDisponible: v.union(
        v.object({
          usuarioId: v.string(),
          nombre: v.string(),
          email: v.string(),
        }),
        v.null()
      ),
      revisorPrevioDisponible: v.union(
        v.object({
          usuarioId: v.string(),
          nombre: v.string(),
          email: v.string(),
        }),
        v.null()
      ),
      eventosDianPrevioDisponible: v.union(
        v.object({
          usuarioId: v.string(),
          nombre: v.string(),
          email: v.string(),
        }),
        v.null()
      ),
      retornoGerenciaPendienteEn: v.optional(
        v.union(v.literal("revision"), v.literal("contabilidad"))
      ),
      permiteReenvioDirectoGerencia: v.boolean(),
      saltoFasesConsecutivas: v.union(
        v.object({
          destino: v.union(v.literal("eventos_dian"), v.literal("gerencia")),
          fasesSaltadas: v.array(
            v.union(v.literal("contabilidad"), v.literal("eventos_dian"))
          ),
          requiereSeleccionEventosDian: v.boolean(),
          motivo: v.literal("roles_consecutivos"),
        }),
        v.null()
      ),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const reembolso = await ctx.db.get("cajasMenoresReembolsos", args.reembolsoId);
    if (!reembolso) return null;

    const caja = await ctx.db.get("cajasMenores", reembolso.cajaMenorId);
    if (!caja) return null;

    const [
      access,
      canReviewReembolso,
      canReviewContabilidad,
      canReviewEventosDian,
      canApproveReembolso,
      canPayTesoreria,
    ] = await Promise.all([
      usuarioPuedeVerCajaMenor(ctx, caja, args.actorUserId, args.actorRol),
      usuarioEsRevisorCajaMenorConfiguradoEmpresa(ctx, caja.empresa_id, args.actorUserId),
      usuarioEsContadorImpuestosConfiguradoEmpresa(ctx, caja.empresa_id, args.actorUserId),
      usuarioEsEventosDianConfiguradoEmpresa(ctx, caja.empresa_id, args.actorUserId),
      usuarioEsGerenciaFinancieraConfiguradaEmpresa(ctx, caja.empresa_id, args.actorUserId),
      usuarioEsTesoreroConfiguradoEmpresa(ctx, caja.empresa_id, args.actorUserId),
    ]);
    const isAdmin = isAdminRol(args.actorRol);
    const canManage = access.canManage;
    const isCustodio = Boolean(args.actorUserId && caja.assignedUsersIds.includes(args.actorUserId));
    const isLiderAprobador = reembolso.liderAprobadorUserId === (args.actorUserId ?? "");
    const isSolicitanteRetirado =
      Boolean(args.actorUserId && reembolso.custodioUserId === args.actorUserId && !isCustodio);
    const isActiveSeguimiento = isReembolsoEstadoSeguimientoActivo(reembolso.estado);

    const puedeVerPorObservacion = puedeObservarReembolsoActivo(
      reembolso,
      caja,
      args.actorUserId ?? "",
      {
        canReviewReembolso,
        canReviewContabilidad,
        canReviewEventosDian,
        canApproveReembolso,
        canPayTesoreria,
        canManage,
      },
      args.actorRol
    );

    const puedeVer = isSolicitanteRetirado
      ? isActiveSeguimiento
      : isActiveSeguimiento
        ? access.canView ||
          isLiderAprobador ||
          puedeVerPorObservacion
        : access.canView ||
          isLiderAprobador ||
          reembolso.custodioUserId === args.actorUserId ||
          canPayTesoreria ||
          canApproveReembolso ||
          isAdmin;
    if (!puedeVer) return null;

    const movimientos = await Promise.all(
      (await getMovimientosByIds(ctx, reembolso.movimientoIds)).map(async (movimiento) => ({
        ...movimiento,
        factura: await ctx.db.get("facturacionFacturas", movimiento.facturaId),
        tarea: await getTareaByFactura(ctx, movimiento.facturaId),
      }))
    );

    const adjuntosRaw = await listAdjuntosReembolso(ctx, args.reembolsoId);
    const adjuntos: ReembolsoAdjuntoConUrl[] = await Promise.all(
      adjuntosRaw.map(async (adjunto) => ({
        ...adjunto,
        url: await ctx.storage.getUrl(adjunto.storageId),
      }))
    );

    const eventosPersistidos = (
      await ctx.db
        .query("cajasMenoresReembolsoEventos")
        .withIndex("by_reembolsoId", (q) => q.eq("reembolsoId", args.reembolsoId))
        .collect()
    )
      .sort((a, b) => a.creadoEn - b.creadoEn)
      .slice(-REEMBOLSO_EVENTOS_TIMELINE_LIMIT);

    const adjuntosConfirmados = adjuntos.filter((adjunto) => isAdjuntoConfirmado(adjunto));
    const timeline = buildReembolsoTimeline(reembolso, adjuntosConfirmados, eventosPersistidos);

    let faseModal:
      | "pendiente_aprobacion_lider"
      | "pendiente_revision"
      | "pendiente_revision_impuestos"
      | "pendiente_eventos_dian"
      | "pendiente_aprobacion"
      | "pendiente_pago_tesoreria"
      | "solo_lectura" = "solo_lectura";
    let puedeActuar = false;

    if (reembolso.estado === "pendiente_aprobacion_lider" && isLiderAprobador) {
      faseModal = "pendiente_aprobacion_lider";
      puedeActuar = true;
    } else if (reembolso.estado === "pendiente_revision" && (canReviewReembolso || isAdmin)) {
      faseModal = "pendiente_revision";
      puedeActuar =
        (canReviewReembolso || isAdmin) &&
        puedeRevisarReembolsoAsignado(reembolso, args.actorUserId, isAdmin);
    } else if (
      reembolso.estado === "pendiente_revision_impuestos" &&
      (canReviewContabilidad || isAdmin || canManage)
    ) {
      faseModal = "pendiente_revision_impuestos";
      puedeActuar = puedeDecidirContabilidadReembolso(reembolso, args.actorUserId, {
        canReviewContabilidad,
      });
    } else if (
      reembolso.estado === "pendiente_eventos_dian" &&
      (canReviewEventosDian || isAdmin || canManage)
    ) {
      faseModal = "pendiente_eventos_dian";
      puedeActuar = puedeDecidirEventosDianReembolso(reembolso, args.actorUserId, {
        canReviewEventosDian,
      });
    } else if (reembolso.estado === "pendiente_aprobacion" && (canApproveReembolso || isAdmin)) {
      faseModal = "pendiente_aprobacion";
      puedeActuar = canApproveReembolso || isAdmin;
    } else if (reembolso.estado === "pendiente_pago_tesoreria" && (canPayTesoreria || isAdmin)) {
      faseModal = "pendiente_pago_tesoreria";
      puedeActuar = canPayTesoreria || isAdmin;
    }

    const etapaBorrador = etapaAdjuntoDesdeEstadoReembolso(reembolso.estado);
    const adjuntosBorradorFaseActual =
      etapaBorrador === null
        ? []
        : adjuntos
            .filter(
              (adjunto) =>
                adjunto.etapa === etapaBorrador && getAdjuntoEstado(adjunto) === "borrador"
            )
            .map((adjunto) => ({
              _id: adjunto._id,
              storageId: adjunto.storageId,
              nombre: adjunto.nombre,
              mimeType: adjunto.mimeType,
              etapa: adjunto.etapa,
              actorUserId: adjunto.actorUserId,
              actorNombre: adjunto.actorNombre,
              creadoEn: adjunto.creadoEn,
              url: adjunto.url,
              puedeEliminar: Boolean(args.actorUserId) && adjunto.actorUserId === args.actorUserId,
            }));

    let contadorPrevioDisponible: ContadorImpuestosConfig | null = null;
    if (reembolso.contadorAsignadoUserId) {
      const contadores = await getContadoresImpuestosConfigurados(ctx, caja.empresa_id);
      contadorPrevioDisponible =
        contadores.find((item) => item.usuarioId === reembolso.contadorAsignadoUserId) ?? null;
    }

    let revisorPrevioDisponible: RevisorCajaMenorPonderado | null = null;
    if (reembolso.reviewAssignedUserId) {
      const revisores = await getRevisoresCajaMenorConfigurados(ctx, caja.empresa_id, {
        includeZero: true,
      });
      revisorPrevioDisponible =
        revisores.find((item) => item.usuarioId === reembolso.reviewAssignedUserId) ?? null;
    }

    let eventosDianPrevioDisponible: EventosDianConfig | null = null;
    if (reembolso.eventosDianAsignadoUserId) {
      const eventosDianUsuarios = await getEventosDianConfigurados(ctx, caja.empresa_id);
      eventosDianPrevioDisponible =
        eventosDianUsuarios.find((item) => item.usuarioId === reembolso.eventosDianAsignadoUserId) ??
        null;
    }

    const [contadoresConfig, eventosDianConfig] = await Promise.all([
      getContadoresImpuestosConfigurados(ctx, caja.empresa_id),
      getEventosDianConfigurados(ctx, caja.empresa_id),
    ]);
    const actorEsResponsableAsignado =
      reembolso.estado === "pendiente_revision"
        ? puedeRevisarReembolsoAsignado(reembolso, args.actorUserId, false)
        : reembolso.estado === "pendiente_revision_impuestos"
          ? reembolso.contadorAsignadoUserId === args.actorUserId
          : false;
    const saltoFasesConsecutivas = planificarSaltoFasesConsecutivasReembolso({
      estado: reembolso.estado,
      actorUserId: args.actorUserId,
      actorEsResponsableAsignado,
      contadores: contadoresConfig,
      eventosDian: eventosDianConfig,
      retornoGerenciaPendienteEn: getRetornoGerenciaPendienteEn(reembolso),
    });

    return {
      reembolso,
      caja,
      movimientos,
      adjuntos: adjuntosConfirmados,
      adjuntosBorradorFaseActual,
      timeline,
      faseModal,
      puedeActuar,
      puedeReasignarRevision: puedeReasignarRevisionReembolso(reembolso, args.actorUserId, {
        isAdmin,
        canManage,
        canReviewReembolso,
      }),
      puedeReasignarContabilidad: puedeReasignarContabilidadReembolso(reembolso, args.actorUserId, {
        isAdmin,
        canManage,
        canReviewContabilidad,
      }),
      puedeReasignarEventosDian: puedeReasignarEventosDianReembolso(reembolso, args.actorUserId, {
        isAdmin,
        canManage,
        canReviewEventosDian,
      }),
      contadorPrevioDisponible,
      revisorPrevioDisponible: revisorPrevioDisponible
        ? {
            usuarioId: revisorPrevioDisponible.usuarioId,
            nombre: revisorPrevioDisponible.nombre,
            email: revisorPrevioDisponible.email,
          }
        : null,
      eventosDianPrevioDisponible,
      retornoGerenciaPendienteEn: getRetornoGerenciaPendienteEn(reembolso),
      permiteReenvioDirectoGerencia: getRetornoGerenciaPendienteEn(reembolso) === "revision",
      saltoFasesConsecutivas,
    };
  },
});

export const listarRevisoresCajaMenorConfigurados = query({
  args: { empresa: v.optional(v.number()) },
  returns: v.array(
    v.object({
      usuarioId: v.string(),
      nombre: v.string(),
      email: v.string(),
      peso: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    return await getRevisoresCajaMenorConfigurados(ctx, normalizeEmpresa(args.empresa), {
      includeZero: true,
    });
  },
});

export const obtenerFormatoReembolsoCajaMenor = query({
  args: {
    reembolsoId: v.id("cajasMenoresReembolsos"),
    actorUserId: v.string(),
    actorRol: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const reembolso = await ctx.db.get("cajasMenoresReembolsos", args.reembolsoId);
    if (!reembolso?.formatoSnapshot) return null;
    const caja = await ctx.db.get("cajasMenores", reembolso.cajaMenorId);
    if (!caja) return null;
    const permisos = await getPermisosEmpresa(
      ctx,
      caja.empresa_id,
      args.actorUserId,
      args.actorRol
    );
    const visibilityMode = resolveCajaVisibilityMode(
      caja,
      permisos,
      args.actorUserId,
      args.actorRol
    );
    if (
      !puedeObservarReembolsoActivo(
        reembolso,
        caja,
        args.actorUserId,
        permisos,
        args.actorRol,
        visibilityMode
      )
    ) {
      return null;
    }
    return reembolso.formatoSnapshot;
  },
});

export const devolverMovimientoABuzon = mutation({
  args: {
    movimientoId: v.id("facturacionCajaMenorMovimientos"),
    ...actorArg,
  },
  returns: v.object({
    movimientoId: v.id("facturacionCajaMenorMovimientos"),
    facturaId: v.id("facturacionFacturas"),
    tareaId: v.id("facturacionTareas"),
    asignacionId: v.id("facturacionAsignaciones"),
  }),
  handler: async (ctx, args) => {
    const movimiento = await ctx.db.get("facturacionCajaMenorMovimientos", args.movimientoId);
    if (!movimiento) throw new Error("Movimiento no encontrado.");
    if (movimiento.estado !== "pendiente_reembolso") {
      throw new Error("Sólo se pueden devolver al buzón movimientos pendientes de reembolso.");
    }
    if (movimiento.reembolsoId) {
      const reembolso = await ctx.db.get("cajasMenoresReembolsos", movimiento.reembolsoId);
      if (reembolso && reembolso.estado !== "rechazado") {
        throw new Error("No se puede devolver un movimiento ligado a un reembolso generado.");
      }
    }

    const caja = await ctx.db.get("cajasMenores", movimiento.cajaMenorId);
    if (!caja) throw new Error("Caja menor no encontrada.");
    assertCanGenerateReembolso(caja, args.actorUserId);

    const tarea = await getTareaByFactura(ctx, movimiento.facturaId);
    if (!tarea) throw new Error("Tarea de facturación no encontrada.");

    const now = Date.now();
    const empresa = normalizeEmpresa(tarea.empresa ?? caja.empresa_id);
    const actorEmail = normalizeEmail(args.actorEmail);

    const movimientosFactura = await ctx.db
      .query("facturacionCajaMenorMovimientos")
      .withIndex("by_facturaId", (q) => q.eq("facturaId", movimiento.facturaId))
      .collect();
    for (const row of movimientosFactura) {
      if (row.estado !== "pendiente_reembolso") continue;
      await ctx.db.patch("facturacionCajaMenorMovimientos", row._id, {
        estado: "anulado" as MovimientoCajaMenorEstado,
        reembolsoId: undefined,
        actualizadoEn: now,
      });
    }

    const legalizacionesActivas = await ctx.db
      .query("facturacionCajaMenorLegalizaciones")
      .withIndex("by_facturaId_estado", (q) =>
        q.eq("facturaId", movimiento.facturaId).eq("estado", "activa")
      )
      .collect();
    for (const legalizacion of legalizacionesActivas) {
      await ctx.db.patch("facturacionCajaMenorLegalizaciones", legalizacion._id, {
        estado: "reemplazada",
        actualizadoEn: now,
      });
    }

    await ctx.db.patch("facturacionFacturas", movimiento.facturaId, {
      esLegalizacionCajaMenor: false,
      cajaMenorId: undefined,
      cajaMenorNombre: undefined,
      cajaMenorMarcadorUserId: undefined,
      cajaMenorMarcadorNombre: undefined,
      cajaMenorMarcadorEmail: undefined,
      centroCostoCodigo: undefined,
      centroCostoNombre: undefined,
      centrosCostoDistribucion: undefined,
      fechaPagoCajaMenor: undefined,
      conceptoCajaMenor: undefined,
      actualizadoEn: now,
    });

    if (tarea.grupoAsignacionActualId) {
      const grupoActualId = tarea.grupoAsignacionActualId;
      const pendientesGrupo = await ctx.db
        .query("facturacionAsignaciones")
        .withIndex("by_grupoId", (q) => q.eq("grupoId", grupoActualId))
        .collect();
      for (const asignacion of pendientesGrupo) {
        if (asignacion.estado !== "pendiente") continue;
        await ctx.db.patch("facturacionAsignaciones", asignacion._id, {
          estado: "cancelada",
          fechaCompletado: now,
          duracionMs: Math.max(0, now - asignacion.fechaAsignacion),
          comentario: "Cancelada al devolver el documento a Revisión Líder.",
          actualizadoEn: now,
        });
      }
    }

    const grupoId = `revision_lider:${String(movimiento.facturaId)}:${now}:${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const asignacionId = await ctx.db.insert("facturacionAsignaciones", {
      facturaId: movimiento.facturaId,
      tareaId: tarea._id,
      empresa,
      fase: "revision_lider",
      estado: "pendiente",
      rol: "lider",
      grupoId,
      asignadoAUserId: args.actorUserId,
      asignadoANombre: args.actorNombre,
      asignadoAEmail: actorEmail,
      fechaAsignacion: now,
      creadoEn: now,
      actualizadoEn: now,
    });

    const estadoAnterior = tarea.estado;
    await ctx.db.patch("facturacionTareas", tarea._id, {
      estado: "revision_lider",
      grupoAsignacionActualId: grupoId,
      currentAsignacionId: asignacionId,
      lideresTotal: 1,
      lideresCompletados: 0,
      asignadoAUserId: args.actorUserId,
      asignadoANombre: args.actorNombre,
      asignadoAEmail: actorEmail,
      liderProcesoUserId: args.actorUserId,
      liderProcesoNombre: args.actorNombre,
      liderProcesoEmail: actorEmail,
      actualizadoEn: now,
    });

    await ctx.db.insert("facturacionAprobaciones", {
      tareaId: tarea._id,
      facturaId: movimiento.facturaId,
      asignacionId,
      empresa,
      actorUserId: args.actorUserId,
      actorNombre: args.actorNombre,
      actorEmail,
      accion: "devolver_buzon",
      comentario: `Documento devuelto a Revisión Líder y desvinculado de Caja Menor por ${args.actorNombre}`,
      estadoAnterior,
      estadoNuevo: "revision_lider",
      creadoEn: now,
    });

    await scheduleProjectionRefreshForMovimientos(ctx, [movimiento], now);
    return {
      movimientoId: args.movimientoId,
      facturaId: movimiento.facturaId,
      tareaId: tarea._id,
      asignacionId,
    };
  },
});

export const crearReciboFisicoCajaMenor = mutation({
  args: {
    empresa: v.optional(v.number()),
    ...cajaMenorMovimientoInputArg,
    soporteStorageId: v.id("_storage"),
    soporteNombre: v.string(),
    soporteMimeType: v.optional(v.string()),
    soporteSize: v.optional(v.number()),
    ...actorArg,
  },
  handler: async (ctx, args) => {
    if (!args.soporteNombre.trim()) {
      throw new Error("Adjunta el soporte del recibo físico.");
    }
    const empresa = args.empresa ?? DEFAULT_EMPRESA;
    const now = Date.now();
    const numeroFactura = `RCM-${empresa}-${now}`;
    const soporteNombre = args.soporteNombre.trim();
    const soporteEsPdf = isPdfFile(soporteNombre, args.soporteMimeType);
    const facturaId = await ctx.db.insert("facturacionFacturas", {
      empresa,
      numeroFactura,
      numeroFacturaNormalizado: normalizeDocumentToken(numeroFactura),
      tipoDocumento: "RECIBO_FISICO_CAJA_MENOR",
      tipoDocumentoNormalizado: "RECIBO_FISICO_CAJA_MENOR",
      documentoClase: "otro",
      proveedorNit: args.nit?.trim() || "",
      proveedorNitNormalizado: args.nit ? normalizeDocumentToken(args.nit) : undefined,
      proveedorNombre: args.nombreEmpresa.trim(),
      fechaEmision: args.fechaPago,
      subtotal: args.valor,
      impuestos: 0,
      total: args.valor,
      moneda: "COP",
      descripcion: args.concepto.trim(),
      lineas: [
        {
          descripcion: args.concepto.trim(),
          cantidad: 1,
          precioUnitario: args.valor,
          total: args.valor,
        },
      ],
      origen: "recibo_fisico",
      esReciboFisicoCajaMenor: true,
      ...(soporteEsPdf
        ? { pdfStorageId: args.soporteStorageId }
        : {
            soportesStorageId: args.soporteStorageId,
            soportesNombre: soporteNombre,
          }),
      creadoEn: now,
      actualizadoEn: now,
    });

    const tareaId = await ctx.db.insert("facturacionTareas", {
      facturaId,
      empresa,
      estado: "reembolso_caja_menor",
      categoria: "administracion",
      asignadoAUserId: args.actorUserId,
      asignadoANombre: args.actorNombre,
      asignadoAEmail: normalizeEmail(args.actorEmail),
      liderProcesoUserId: args.actorUserId,
      liderProcesoNombre: args.actorNombre,
      liderProcesoEmail: normalizeEmail(args.actorEmail),
      creadoEn: now,
      actualizadoEn: now,
    });

    await ctx.db.insert("facturacionAdjuntos", {
      facturaId,
      empresa,
      storageId: args.soporteStorageId,
      nombre: soporteNombre,
      mimeType: args.soporteMimeType?.trim() || undefined,
      size: args.soporteSize,
      subidoPorUserId: args.actorUserId,
      subidoPorNombre: args.actorNombre,
      subidoPorEmail: normalizeEmail(args.actorEmail),
      creadoEn: now,
    });

    const factura = await ctx.db.get("facturacionFacturas", facturaId);
    if (!factura) throw new Error("No se pudo crear el recibo físico.");
    const result = await crearMovimientoCajaMenorInterno(ctx, {
      factura,
      input: {
        cajaMenorId: args.cajaMenorId,
        nit: args.nit,
        nombreEmpresa: args.nombreEmpresa,
        concepto: args.concepto,
        fechaPago: args.fechaPago,
        valor: args.valor,
        centroCostoId: args.centroCostoId,
        centroCostoCodigo: args.centroCostoCodigo,
        centroCostoNombre: args.centroCostoNombre,
        centrosCostoDistribucion: args.centrosCostoDistribucion,
        observaciones: args.observaciones,
      },
      origen: "recibo_fisico",
      actor: args,
      now,
    });

    await ctx.db.insert("facturacionAprobaciones", {
      tareaId,
      facturaId,
      empresa,
      actorUserId: args.actorUserId,
      actorNombre: args.actorNombre,
      actorEmail: normalizeEmail(args.actorEmail),
      accion: "crear_movimiento_caja_menor",
      comentario:
        args.observaciones?.trim() || `Recibo físico asociado a Caja Menor ${result.caja.nombre}.`,
      estadoAnterior: "captura",
      estadoNuevo: "reembolso_caja_menor",
      creadoEn: now,
    });

    await refrescarProyeccionFactura(ctx, facturaId, now);
    return { facturaId, tareaId, movimientoId: result.movimiento._id };
  },
});
