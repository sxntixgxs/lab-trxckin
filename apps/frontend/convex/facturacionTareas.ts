import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { isCloseInvoicePhase } from "../app/(default)/billing/lib/workflow-config";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  type MutationCtx,
  mutation,
  type QueryCtx,
  query,
} from "./_generated/server";
import {
  anularMovimientosCajaMenorFacturaInterno,
  crearMovimientoCajaMenorInterno,
  empresaPermiteSaldoNegativo,
} from "./cajasMenores";
import {
  deleteReembolsoConBandeja,
  deleteMovimientoConBandeja,
  patchReembolsoConBandeja,
} from "./lib/cajaMenorBandeja";
import {
  buildBolsaAnticipoSnapshot,
  ensureBolsaAnticipo,
  getBolsaAnticipoBySnapshot,
  resolveBolsaIdForAnticipo,
  resolveBolsaIdForFactura,
} from "./lib/bolsasAnticipos";
import { centrosCostoDistribucionValidator } from "./lib/centrosCostoDistribucion";
import {
  type AnticipoOwnerSnapshot,
  buildAnticipoDuenoCambioComentario,
  buildAnticipoOwnerCandidates,
  buildLiderAsignadoSnapshot,
  fasePermitePermisoAnticipo,
  hasAnticipoProcesoSnapshot,
  sameAnticipoBolsaSnapshot,
  sameAnticipoProcesoSnapshot,
  sessionMatchesAsignacion,
  type PermisoAnticipo,
} from "./lib/facturacionAnticipoDueno";
import {
  eliminarProyeccionFactura,
  refrescarProyeccionFactura,
} from "./lib/facturacionDashboardProjection";
import { reconciliarEstadoLegalizacionAnticipo } from "./lib/anticiposLegalizacionReconciliacion";
import {
  assertDestinoDevolucionValido,
  DEVOLUCION_STAGE_LABELS,
  type FaseDevolucionDestino,
  getDevolucionDestinos,
  isEstadoTerminalDevolucion,
  puedeDevolverFactura,
  requiereReaperturaSinAsignacionActiva,
  resolveFaseOrigenDevolucion,
} from "./lib/facturacionDevolucionRules";
import { phaseTransitionPatch } from "./lib/facturacionOwnership";
import {
  listNotasCreditoRelacionadasAFactura,
  resolveRelacionEfectiva,
} from "./lib/notaCreditoRelacion";
import {
  isPeajesFactura,
  isPeajesNotaCredito,
  normalizePeajesDocumentNumber,
  normalizePeajesProviderNit,
} from "./lib/peajes";
import { getAuthenticatedSessionActor, type SessionActor } from "./lib/sessionAuth";
import {
  assertObligacionCubrePagos,
  buildComentarioSinDesembolso,
  buildResumenContableFactura,
  calcularValorAPagarFactura,
  getPagosAplicadosFromAprobaciones,
  getSaldoTesoreriaFactura,
  type PagoFinalSnapshot,
  sumarDocumentosInternosActivos,
  syncValorAPagarFactura,
  validarElegibilidadSinDesembolso,
  validarYRecalcularValorAPagarTrasCambioObligacion,
} from "./lib/valorAPagar";
import {
  getValorContable,
  getValorContableAnticipo,
  isFacturaNormalParaValorContable,
  puedeEditarValorContable,
  type ValorContableCambio,
} from "./lib/valorContable";
import {
  aplicarCausacionEnFactura,
  causacionActionValidator,
  type CausacionActionInput,
} from "./lib/facturacionCausacionApply";
import {
  getSaldoLegalizadoAnticipo,
  getSaldoPendienteLegalizableAnticipo,
} from "./lib/valorLegalizableAnticipo";
import { fallbackContactEmail, SYSTEM_ACTOR_EMAIL } from "./lib/env";
import { requireServerSecret } from "./lib/auth";
import { requireActor as requireBillingActor } from "./lib/billingAuth";
import { normalizeEmail, normalizeEmpresa } from "./lib/normalize";

const DEFAULT_EMPRESA = 1;

const estadoTareaValidator = v.union(
  v.literal("recepcion"),
  v.literal("revision_lider"),
  v.literal("jefe_directo"),
  v.literal("aceptada"),
  v.literal("rechazada"),
  v.literal("rechazada_dian"),
  v.literal("pendiente_rechazar_dian"),
  v.literal("pendiente_nota_credito"),
  v.literal("causacion"),
  v.literal("revision_impuestos"),
  v.literal("eventos_dian"),
  v.literal("reembolso_caja_menor"),
  v.literal("gerencia"),
  v.literal("revision_tesoreria"),
  v.literal("pagada"),
  v.literal("legalizada"),
  v.literal("nota_credito_cerrada"),
  v.literal("cerrada")
);

const decisionRevisionLiderValidator = v.union(v.literal("aprobar"), v.literal("rechazar"));

const decisionRevisionImpuestosValidator = v.union(v.literal("aprobar"), v.literal("devolver"));

const decisionEventosDianValidator = v.union(
  v.literal("devolver"),
  v.literal("legalizar"),
  v.literal("gerencia")
);

const faseDevolucionValidator = v.union(
  v.literal("recepcion"),
  v.literal("revision_lider"),
  v.literal("jefe_directo"),
  v.literal("causacion"),
  v.literal("revision_impuestos"),
  v.literal("eventos_dian"),
  v.literal("gerencia"),
  v.literal("revision_tesoreria")
);

const faseDevolucionDestinoValidator = v.union(
  v.literal("recepcion"),
  v.literal("revision_lider"),
  v.literal("causacion"),
  v.literal("revision_impuestos"),
  v.literal("eventos_dian"),
  v.literal("gerencia"),
  v.literal("revision_tesoreria")
);

const responsableDevolucionValidator = v.object({
  usuarioId: v.optional(v.string()),
  nombre: v.string(),
  email: v.string(),
  procesoId: v.optional(v.number()),
  procesoNombre: v.optional(v.string()),
});

const destinoDevolucionContextoValidator = v.object({
  fase: faseDevolucionValidator,
  label: v.string(),
  responsableHistorico: v.union(responsableDevolucionValidator, v.null()),
  candidatos: v.array(responsableDevolucionValidator),
  requiereSeleccionResponsable: v.boolean(),
});

const categoriaValidator = v.union(
  v.literal("tecnologia"),
  v.literal("administracion"),
  v.literal("otro")
);

const usuarioAsignacionValidator = v.object({
  usuarioId: v.optional(v.string()),
  nombre: v.string(),
  email: v.string(),
  procesoId: v.optional(v.number()),
  procesoNombre: v.optional(v.string()),
});

const actorValidator = {
  actorUserId: v.optional(v.string()),
  actorNombre: v.string(),
  actorEmail: v.string(),
  comentario: v.string(),
};

const valorContableNuevoArg = {
  valorContableNuevo: v.optional(v.number()),
};

const causacionArg = {
  causacion: v.optional(causacionActionValidator),
};

type UsuarioConfig = {
  usuarioId?: string;
  nombre: string;
  email: string;
  procesoId?: number;
  procesoNombre?: string;
};

type UsuarioConfiguracionLista = {
  usuarioId: string;
  nombre: string;
  email: string;
};

type AnalistaCausacionConfig = {
  usuarioId: string;
  nombre: string;
  email: string;
  peso: number;
};

type UsuarioRolConfig = UsuarioConfig & {
  peso?: number;
  orden?: number;
};

type AsignacionPonderada = {
  asignadoAUserId?: string;
  asignadoANombre: string;
  asignadoAEmail: string;
};

type AsignacionCausacion = AsignacionPonderada & {
  origenAsignacion: "proveedor_fijo" | "distribucion_ponderada";
  proveedorNit?: string;
  proveedorNitNormalizado?: string;
  proveedorNombre?: string;
};

type AccionAuditoria = Doc<"facturacionAprobaciones">["accion"];
type FaseAsignacion = Doc<"facturacionAsignaciones">["fase"];
type RolAsignacion = Doc<"facturacionAsignaciones">["rol"];
type EstadoAsignacion = Doc<"facturacionAsignaciones">["estado"];
type ClaveConfiguracion = Doc<"facturacionConfiguracion">["clave"];
type ClaveUsuarioIndexada = Exclude<ClaveConfiguracion, "cuenta_recepcion">;
type FacturacionCtx = QueryCtx | MutationCtx;
type EstadoFacturacionEmail =
  | FaseAsignacion
  | "pagada"
  | "legalizada"
  | "nota_credito_cerrada"
  | "rechazada_dian"
  | "cerrada";

type AnticipoLegalizacionItem = {
  legalizadoPorUserId: string;
  fechaLegalizacion: number;
  facturaId: Id<"facturacionFacturas">;
  valorLegalizado: number;
  observaciones?: string;
};

type CajaMenorLegalizacionActor = {
  actorUserId?: string;
  actorNombre: string;
  actorEmail: string;
  comentario?: string;
  causacionCambio?: NonNullable<Doc<"facturacionAprobaciones">["causacionCambio"]>;
};

type NotaCreditoRelacionResumen = {
  tipo: "factura" | "nota_credito";
  cantidadNotasCredito: number;
  valorNotasCredito: number;
  notasCredito: Array<{
    facturaId: Id<"facturacionFacturas">;
    numeroFactura: string;
    total: number;
    moneda: string;
  }>;
  facturaOrigen?: {
    facturaId: Id<"facturacionFacturas">;
    numeroFactura: string;
    total: number;
    moneda: string;
  };
};

const BUZON_QUERY_PAGE_CAP = 200;

function queryAsignacionesPendientesBuzon(
  ctx: QueryCtx,
  asignadoAUserId: string,
  empresa?: number
) {
  if (empresa !== undefined) {
    return ctx.db
      .query("facturacionAsignaciones")
      .withIndex("by_asignadoAUserId_estado_empresa", (q) =>
        q.eq("asignadoAUserId", asignadoAUserId).eq("estado", "pendiente").eq("empresa", empresa)
      );
  }

  return ctx.db
    .query("facturacionAsignaciones")
    .withIndex("by_asignadoAUserId_estado", (q) =>
      q.eq("asignadoAUserId", asignadoAUserId).eq("estado", "pendiente")
    );
}

async function mapAsignacionParaBuzon(ctx: QueryCtx, asignacion: Doc<"facturacionAsignaciones">) {
  const tarea = asignacion.tareaId ? await ctx.db.get("facturacionTareas", asignacion.tareaId) : null;
  if (!tarea || isEstadoTerminalFacturacion(tarea.estado)) {
    return null;
  }
  if (tarea.estado !== asignacion.fase) {
    return null;
  }

  const factura = await ctx.db.get("facturacionFacturas", asignacion.facturaId);
  if (factura && (isFacturaPeajes(factura) || isNotaCreditoPeajes(factura))) {
    return null;
  }

  const pdfUrl = factura?.pdfStorageId ? await ctx.storage.getUrl(factura.pdfStorageId) : null;
  const adjuntos = factura
    ? await ctx.db
        .query("facturacionAdjuntos")
        .withIndex("by_facturaId", (q) => q.eq("facturaId", factura._id))
        .take(100)
    : [];

  return {
    ...tarea,
    tareaIdReal: tarea._id,
    asignacionId: asignacion._id,
    asignacion,
    faseAsignacion: asignacion.fase,
    rolAsignacion: asignacion.rol,
    asignadoAUserId: asignacion.asignadoAUserId,
    asignadoANombre: asignacion.asignadoANombre,
    asignadoAEmail: asignacion.asignadoAEmail,
    creadoEn: asignacion.fechaAsignacion,
    actualizadoEn: asignacion.actualizadoEn,
    factura,
    notaCreditoRelacion: factura ? await buildNotaCreditoRelacionResumen(ctx, factura) : null,
    pdfUrl,
    adjuntosCount: adjuntos.length,
  };
}

async function collectAsignacionesBuzonResumen(
  ctx: QueryCtx,
  asignadoAUserId: string,
  empresa?: number
) {
  const asignaciones = await queryAsignacionesPendientesBuzon(
    ctx,
    asignadoAUserId,
    empresa
  ).collect();

  const counts = {
    todas: 0,
    por_vencer: 0,
    anticipos: 0,
    cajas_menores: 0,
    devueltas: 0,
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isDueSoon = (fecha?: string) => {
    if (!fecha) return false;
    const due = new Date(`${fecha}T00:00:00`);
    if (Number.isNaN(due.getTime())) return false;
    const diff = Math.ceil((due.getTime() - today.getTime()) / 86_400_000);
    return diff <= 7;
  };
  const esDevuelta = (asignacion: Doc<"facturacionAsignaciones">) => {
    const metadata = asignacion.metadata;
    if (!metadata || typeof metadata !== "object") return false;
    return (metadata as Record<string, unknown>).origen === "devolucion";
  };

  for (const asignacion of asignaciones) {
    const tarea = asignacion.tareaId ? await ctx.db.get("facturacionTareas", asignacion.tareaId) : null;
    if (!tarea || isEstadoTerminalFacturacion(tarea.estado)) continue;
    if (tarea.estado !== asignacion.fase) continue;

    const factura = await ctx.db.get("facturacionFacturas", asignacion.facturaId);
    if (!factura) continue;
    if (isFacturaPeajes(factura) || isNotaCreditoPeajes(factura)) continue;

    counts.todas += 1;
    if (isDueSoon(factura.fechaVencimiento)) counts.por_vencer += 1;
    if (factura.esLegalizacionAnticipo) counts.anticipos += 1;
    if (factura.esLegalizacionCajaMenor) counts.cajas_menores += 1;
    if (esDevuelta(asignacion)) counts.devueltas += 1;
  }

  return counts;
}

const TERMINAL_NOTIFICATION_CONFIG: Partial<Record<EstadoFacturacionEmail, ClaveConfiguracion>> = {
  pagada: "notificacion_pagadas",
  legalizada: "notificacion_legalizadas",
  cerrada: "notificacion_legalizadas",
  rechazada_dian: "notificacion_rechazado_dian",
};

function normalizeDocumentNumber(value?: string) {
  return normalizePeajesDocumentNumber(value);
}

function normalizeProveedorNit(value?: string) {
  return normalizePeajesProviderNit(value);
}

function isFacturaPeajes(factura: Doc<"facturacionFacturas">) {
  return isPeajesFactura(factura);
}

function isNotaCreditoPeajes(factura: Doc<"facturacionFacturas">) {
  return isPeajesNotaCredito(factura);
}

function isNotaCreditoNoPeajes(factura: Doc<"facturacionFacturas">) {
  return (
    !isFacturaPeajes(factura) &&
    !isNotaCreditoPeajes(factura) &&
    (factura.documentoClase === "nota_credito" ||
      factura.tipoDocumentoNormalizado === "91" ||
      factura.tipoDocumento === "91")
  );
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

function usuariosCoincidenPorIdentidad(
  configurado: { usuarioId?: string; email?: string },
  usuario: { usuarioId?: string; email?: string }
) {
  const configuradoId = configurado.usuarioId?.trim();
  const usuarioId = usuario.usuarioId?.trim();

  if (configuradoId && usuarioId) {
    return configuradoId === usuarioId;
  }

  return Boolean(
    configurado.email &&
      usuario.email &&
      normalizeEmail(configurado.email) === normalizeEmail(usuario.email)
  );
}

function usuariosCoincidenPorId(
  configurado: { usuarioId?: string },
  usuario: { usuarioId?: string }
) {
  const configuradoId = configurado.usuarioId?.trim();
  const usuarioId = usuario.usuarioId?.trim();
  return Boolean(configuradoId && usuarioId && configuradoId === usuarioId);
}

function normalizeProcesoNombre(nombre?: string) {
  return (nombre ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function sanitizeProcesoNombre(nombre?: string) {
  const trimmed = nombre?.trim();
  return trimmed ? trimmed : undefined;
}

function getProcesoSnapshot(row: { procesoId?: number; procesoNombre?: string }) {
  return {
    procesoId:
      typeof row.procesoId === "number" && Number.isFinite(row.procesoId)
        ? row.procesoId
        : undefined,
    procesoNombre: sanitizeProcesoNombre(row.procesoNombre),
  };
}

function hasProcesoSnapshot(row: { procesoId?: number; procesoNombre?: string }) {
  const snapshot = getProcesoSnapshot(row);
  return snapshot.procesoId !== undefined || Boolean(snapshot.procesoNombre);
}

function sameProcesoSnapshot(
  left: { procesoId?: number; procesoNombre?: string },
  right: { procesoId?: number; procesoNombre?: string }
) {
  const leftProceso = getProcesoSnapshot(left);
  const rightProceso = getProcesoSnapshot(right);
  if (
    leftProceso.procesoId !== undefined &&
    rightProceso.procesoId !== undefined &&
    leftProceso.procesoId === rightProceso.procesoId
  ) {
    return true;
  }

  const leftNombre = normalizeProcesoNombre(leftProceso.procesoNombre);
  const rightNombre = normalizeProcesoNombre(rightProceso.procesoNombre);
  return Boolean(leftNombre && rightNombre && leftNombre === rightNombre);
}

function facturaTieneReferenciaBolsaAnticipo(factura: Doc<"facturacionFacturas">) {
  return Boolean(
    factura.anticipoBolsaId ||
      factura.anticipoLiderUserId ||
      hasProcesoSnapshot({
        procesoId: factura.anticipoProcesoId,
        procesoNombre: factura.anticipoProcesoNombre,
      })
  );
}

function createGroupId(
  fase: FaseAsignacion,
  facturaId: Id<"facturacionFacturas">,
  timestamp = Date.now()
) {
  return `${fase}:${facturaId}:${timestamp}:${Math.random().toString(36).slice(2, 8)}`;
}

async function getConfig(ctx: FacturacionCtx, empresa: number, clave: ClaveConfiguracion) {
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

function normalizarUsuariosRolIndex(
  usuarios: Array<Doc<"facturacionConfiguracionUsuarios">>
): UsuarioRolConfig[] {
  return [...usuarios]
    .sort(
      (a, b) =>
        (a.orden ?? 0) - (b.orden ?? 0) ||
        a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" })
    )
    .map((usuario) => ({
      usuarioId: usuario.usuarioId,
      nombre: usuario.nombre,
      email: normalizeEmail(usuario.email),
      ...(typeof usuario.peso === "number" ? { peso: usuario.peso } : {}),
      ...(typeof usuario.orden === "number" ? { orden: usuario.orden } : {}),
    }));
}

async function getUsuariosRolIndex(
  ctx: FacturacionCtx,
  empresa: number,
  clave: ClaveUsuarioIndexada
): Promise<UsuarioRolConfig[]> {
  const usuarios = await ctx.db
    .query("facturacionConfiguracionUsuarios")
    .withIndex("by_empresa_clave", (q) => q.eq("empresa", empresa).eq("clave", clave))
    .collect();

  return normalizarUsuariosRolIndex(usuarios);
}

async function getUsuariosConfigurados(
  ctx: FacturacionCtx,
  empresa: number,
  clave: ClaveUsuarioIndexada
) {
  const indexados = await getUsuariosRolIndex(ctx, empresa, clave);
  if (indexados.length > 0) return indexados;
  return normalizarUsuariosLista(await getConfig(ctx, empresa, clave));
}

async function getUsuariosPonderadosConfigurados(
  ctx: FacturacionCtx,
  empresa: number,
  clave: ClaveUsuarioIndexada
) {
  const indexados = await getUsuariosRolIndex(ctx, empresa, clave);
  const ponderadosIndexados = indexados.filter((usuario): usuario is AnalistaCausacionConfig =>
    Boolean(
      usuario.usuarioId &&
        usuario.nombre &&
        usuario.email &&
        Number.isFinite(usuario.peso) &&
        (usuario.peso ?? -1) >= 0
    )
  );
  if (ponderadosIndexados.length > 0) return ponderadosIndexados;

  const config = await getConfig(ctx, empresa, clave);
  return config ? normalizarAnalistasCausacion(config, { includeZero: true }) : [];
}

function normalizarUsuariosLista(config: Doc<"facturacionConfiguracion"> | null): UsuarioConfig[] {
  if (!config) return [];

  if (config.usuarios && config.usuarios.length > 0) {
    const usuarios = config.usuarios as UsuarioConfiguracionLista[];
    return usuarios
      .filter((usuario) => usuario.nombre && usuario.email)
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

function dedupeUsuariosConfig(usuarios: UsuarioConfig[]) {
  const seen = new Set<string>();
  const out: UsuarioConfig[] = [];

  for (const usuario of usuarios) {
    const email = normalizeEmail(usuario.email);
    const key = usuario.usuarioId ? `id:${usuario.usuarioId}` : `email:${email}`;
    if (!usuario.nombre || !email || seen.has(key)) continue;
    seen.add(key);
    out.push({
      usuarioId: usuario.usuarioId,
      nombre: usuario.nombre,
      email,
    });
  }

  return out;
}

async function programarNotificacionFacturacion(
  ctx: MutationCtx,
  args: {
    facturaId: Id<"facturacionFacturas">;
    tareaId?: Id<"facturacionTareas">;
    fase: EstadoFacturacionEmail;
    destinatarios: UsuarioConfig[];
    comentario?: string;
  }
) {
  const destinatarios = dedupeUsuariosConfig(args.destinatarios);
  if (destinatarios.length === 0) return;

  const factura = await ctx.db.get("facturacionFacturas", args.facturaId);
  if (!factura) return;

  await ctx.scheduler.runAfter(0, internal.notificacionesFacturacion.enviarNotificacion, {
    destinatarios: destinatarios.map((usuario) => ({
      ...(usuario.usuarioId ? { usuarioId: usuario.usuarioId } : {}),
      nombre: usuario.nombre,
      email: usuario.email,
    })),
    fase: args.fase,
    facturaId: String(factura._id),
    ...(args.tareaId ? { tareaId: String(args.tareaId) } : {}),
    ...(factura.empresa !== undefined ? { empresa: factura.empresa } : {}),
    facturaNumero: factura.numeroFactura,
    proveedorNombre: factura.proveedorNombre,
    ...(factura.proveedorNit ? { proveedorNit: factura.proveedorNit } : {}),
    total: isFacturaNormalParaValorContable(factura) ? getValorContable(factura) : factura.total,
    moneda: factura.moneda,
    fechaEmision: factura.fechaEmision,
    ...(factura.fechaVencimiento ? { fechaVencimiento: factura.fechaVencimiento } : {}),
    ...(args.comentario ? { comentario: args.comentario } : {}),
  });
}

async function programarNotificacionEstadoTerminal(
  ctx: MutationCtx,
  tarea: Doc<"facturacionTareas">,
  fase: "pagada" | "legalizada" | "cerrada" | "rechazada_dian",
  comentario?: string
) {
  const clave = TERMINAL_NOTIFICATION_CONFIG[fase];
  if (!clave) return;

  const destinatarios = normalizarUsuariosLista(
    await getConfig(ctx, normalizeEmpresa(tarea.empresa), clave)
  );
  await programarNotificacionFacturacion(ctx, {
    facturaId: tarea.facturaId,
    tareaId: tarea._id,
    fase,
    destinatarios,
    comentario,
  });
}

async function getRecepcionUsuarios(ctx: MutationCtx, empresa: number) {
  const recepcion = await getUsuariosConfigurados(ctx, empresa, "recepcion");
  if (recepcion.length > 0) return recepcion;

  // Compatibilidad: instalaciones previas sólo tenían líderes por categoría.
  const legacy = (await getUsuariosConfigurados(ctx, empresa, "lider_administracion"))[0];
  if (legacy) return [legacy];

  throw new Error("Configura al menos un usuario de recepción para esta empresa.");
}

async function getContadoresImpuestos(ctx: MutationCtx, empresa: number) {
  const contadores = await getUsuariosConfigurados(ctx, empresa, "contadores_impuestos");
  if (contadores.length > 0) return contadores;
  throw new Error("Configura al menos un contador/revisor de impuestos.");
}

async function getEventosDianUsuarios(ctx: MutationCtx, empresa: number) {
  const usuarios = await getUsuariosConfigurados(ctx, empresa, "eventos_dian");
  if (usuarios.length > 0) return usuarios;
  throw new Error("Configura al menos un usuario de Eventos DIAN.");
}

async function getGerenciasConfiguradas(ctx: MutationCtx, empresa: number) {
  const gerencias = await getUsuariosConfigurados(ctx, empresa, "gerencia");
  if (gerencias.length > 0) return gerencias;

  // Compatibilidad temporal: instalaciones anteriores usaban gerente_financiero.
  const financiero = await getUsuariosConfigurados(ctx, empresa, "gerente_financiero");
  if (financiero.length > 0) return financiero;

  return [];
}

async function getGerenciaDefault(ctx: MutationCtx, empresa: number) {
  const gerencia = (await getGerenciasConfiguradas(ctx, empresa))[0];
  if (gerencia) return gerencia;
  throw new Error("Configura un usuario de Gerencia para esta empresa.");
}

async function getTesorero(ctx: MutationCtx, empresa: number) {
  const tesorero =
    (await getUsuariosConfigurados(ctx, empresa, "tesorero"))[0] ??
    (await getUsuariosConfigurados(ctx, empresa, "tesoreria_default"))[0];
  if (!tesorero) throw new Error("Configura un tesorero para esta empresa.");
  return tesorero;
}

async function getTesoreriaUsuarios(ctx: FacturacionCtx, empresa: number) {
  const tesoreros = await getUsuariosConfigurados(ctx, empresa, "tesorero");
  if (tesoreros.length > 0) return tesoreros;
  return await getUsuariosConfigurados(ctx, empresa, "tesoreria_default");
}

function crearBloqueDistribucion(usuarios: AnalistaCausacionConfig[]): AnalistaCausacionConfig[] {
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

function normalizarAnalistasCausacion(
  config: {
    usuarioId?: string;
    nombre?: string;
    email?: string;
    usuariosPonderados?: AnalistaCausacionConfig[];
  },
  options?: { includeZero?: boolean }
) {
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

  if (config.usuarioId && config.nombre && config.email) {
    return [
      {
        usuarioId: config.usuarioId,
        nombre: config.nombre,
        email: config.email,
        peso: 100,
      },
    ];
  }

  return [];
}

async function escogerAnalistaCausacion(
  ctx: MutationCtx,
  empresa: number
): Promise<AsignacionCausacion> {
  const asignacion = await escogerUsuarioPonderado(ctx, {
    empresa,
    clave: "analista_causacion",
    emptyMessage:
      "Configura al menos un analista de causación antes de enviar facturas a análisis.",
  });
  return {
    ...asignacion,
    origenAsignacion: "distribucion_ponderada",
  };
}

async function resolverAsignacionCausacion(
  ctx: MutationCtx,
  empresa: number,
  factura: Doc<"facturacionFacturas">
): Promise<AsignacionCausacion> {
  const proveedorNitNormalizado =
    factura.proveedorNitNormalizado ?? normalizeProveedorNit(factura.proveedorNit);

  if (proveedorNitNormalizado) {
    const override = await ctx.db
      .query("facturacionCausacionProveedorAnalistas")
      .withIndex("by_empresa_proveedorNitNormalizado", (q) =>
        q.eq("empresa", empresa).eq("proveedorNitNormalizado", proveedorNitNormalizado)
      )
      .first();

    if (override) {
      return {
        asignadoAUserId: override.analistaUsuarioId,
        asignadoANombre: override.analistaNombre,
        asignadoAEmail: normalizeEmail(override.analistaEmail),
        origenAsignacion: "proveedor_fijo",
        proveedorNit: override.proveedorNit,
        proveedorNitNormalizado: override.proveedorNitNormalizado,
        proveedorNombre: override.proveedorNombre,
      };
    }
  }

  return await escogerAnalistaCausacion(ctx, empresa);
}

async function escogerUsuarioRechazosDian(
  ctx: MutationCtx,
  empresa: number
): Promise<AsignacionPonderada> {
  return await escogerUsuarioPonderado(ctx, {
    empresa,
    clave: "rechazos_dian",
    emptyMessage: "Configura al menos un usuario de Rechazos DIAN antes de rechazar facturas.",
  });
}

async function escogerUsuarioPonderado(
  ctx: MutationCtx,
  args: {
    empresa: number;
    clave: ClaveUsuarioIndexada;
    emptyMessage: string;
  }
): Promise<AsignacionPonderada> {
  const config = await getConfig(ctx, args.empresa, args.clave);
  const indexados = await getUsuariosRolIndex(ctx, args.empresa, args.clave);
  const usuariosIndexados = indexados.filter((usuario): usuario is AnalistaCausacionConfig =>
    Boolean(
      usuario.usuarioId &&
        usuario.nombre &&
        usuario.email &&
        Number.isFinite(usuario.peso) &&
        (usuario.peso ?? 0) > 0
    )
  );

  const usuarios =
    usuariosIndexados.length > 0
      ? usuariosIndexados
      : config
        ? normalizarAnalistasCausacion(config)
        : [];
  if (usuarios.length === 0) {
    throw new Error(args.emptyMessage);
  }

  const bloque = crearBloqueDistribucion(usuarios);
  const cursor =
    config && Number.isFinite(config.distribucionCursor) ? (config.distribucionCursor ?? 0) : 0;
  const elegido = bloque[Math.abs(cursor) % bloque.length];

  if (config) {
    await ctx.db.patch("facturacionConfiguracion", config._id, {
      distribucionCursor: cursor + 1,
      actualizadoEn: Date.now(),
    });
  }

  return {
    asignadoAUserId: elegido.usuarioId,
    asignadoANombre: elegido.nombre,
    asignadoAEmail: normalizeEmail(elegido.email),
  };
}

async function registrarAprobacion(
  ctx: MutationCtx,
  args: {
    tareaId: Id<"facturacionTareas">;
    facturaId: Id<"facturacionFacturas">;
    asignacionId?: Id<"facturacionAsignaciones">;
    empresa?: number;
    actorUserId?: string;
    actorNombre?: string;
    actorEmail?: string;
    accion: AccionAuditoria;
    comentario: string;
    estadoAnterior: string;
    estadoNuevo: string;
    firmaStorageId?: Id<"_storage">;
    valorContableCambio?: ValorContableCambio;
    anticipoDuenoCambio?: {
      anterior?: AnticipoOwnerSnapshot;
      nuevo: AnticipoOwnerSnapshot;
      crucesRevertidos?: {
        cantidad: number;
        valor: number;
        legalizacionIds: Id<"facturacionAnticipoLegalizaciones">[];
      };
    };
    pagoParcial?: {
      monto: number;
      comprobanteStorageId: Id<"_storage">;
      comprobanteNombre: string;
    };
    pagoFinal?: PagoFinalSnapshot;
    causacionCambio?: NonNullable<Doc<"facturacionAprobaciones">["causacionCambio"]>;
    creadoEn?: number;
  }
) {
  await ctx.db.insert("facturacionAprobaciones", {
    tareaId: args.tareaId,
    facturaId: args.facturaId,
    ...(args.asignacionId ? { asignacionId: args.asignacionId } : {}),
    empresa: normalizeEmpresa(args.empresa),
    ...(args.actorUserId ? { actorUserId: args.actorUserId } : {}),
    ...(args.actorNombre?.trim() ? { actorNombre: args.actorNombre.trim() } : {}),
    ...(args.actorEmail?.trim() ? { actorEmail: normalizeEmail(args.actorEmail) } : {}),
    accion: args.accion,
    comentario: args.comentario,
    ...(args.firmaStorageId ? { firmaStorageId: args.firmaStorageId } : {}),
    ...(args.valorContableCambio ? { valorContableCambio: args.valorContableCambio } : {}),
    ...(args.anticipoDuenoCambio ? { anticipoDuenoCambio: args.anticipoDuenoCambio } : {}),
    ...(args.pagoParcial ? { pagoParcial: args.pagoParcial } : {}),
    ...(args.pagoFinal ? { pagoFinal: args.pagoFinal } : {}),
    ...(args.causacionCambio ? { causacionCambio: args.causacionCambio } : {}),
    estadoAnterior: args.estadoAnterior,
    estadoNuevo: args.estadoNuevo,
    creadoEn: args.creadoEn ?? Date.now(),
  });
}

async function aplicarCambioValorContable(
  ctx: MutationCtx,
  args: {
    factura: Doc<"facturacionFacturas">;
    fase: string;
    valorContableNuevo: number;
    comentario: string;
    actorUserId?: string;
    actorNombre: string;
    actorEmail: string;
  }
): Promise<{ valorContableCambio?: ValorContableCambio }> {
  if (!puedeEditarValorContable(args.fase, args.factura)) {
    throw new Error("No puedes modificar el valor contable en esta fase o tipo de documento.");
  }

  const valorAnterior = getValorContable(args.factura);
  const valorNuevo = args.valorContableNuevo;

  if (!Number.isFinite(valorNuevo) || valorNuevo < 0) {
    throw new Error("El valor contable debe ser un número finito mayor o igual a cero.");
  }

  if (valorNuevo !== valorAnterior && !args.comentario.trim()) {
    throw new Error("Debes registrar una observación cuando cambias el valor contable.");
  }

  if (valorNuevo === valorAnterior) {
    return {};
  }

  const documentosInternos = await sumarDocumentosInternosActivos(ctx, args.factura._id);
  const aprobaciones = await ctx.db
    .query("facturacionAprobaciones")
    .withIndex("by_facturaId", (q) => q.eq("facturaId", args.factura._id))
    .collect();
  const pagosAplicados = getPagosAplicadosFromAprobaciones(aprobaciones);
  // Documentos internos y pagos son compromisos fijos; los anticipos se ajustan
  // después contra la nueva base contable y no deben bloquear esta corrección.
  assertObligacionCubrePagos({
    valorContable: valorNuevo,
    valorDocumentosInternos: documentosInternos.total,
    pagosAplicados,
  });

  const now = Date.now();
  await ctx.db.patch("facturacionFacturas", args.factura._id, {
    valorContable: valorNuevo,
    valorContableActualizadoEn: now,
    ...(args.actorUserId ? { valorContableActualizadoPorUserId: args.actorUserId } : {}),
    valorContableActualizadoPorNombre: args.actorNombre,
    valorContableActualizadoPorEmail: normalizeEmail(args.actorEmail),
    actualizadoEn: now,
  });

  const facturaActualizada = {
    ...args.factura,
    valorContable: valorNuevo,
    valorContableActualizadoEn: now,
  };
  await recalcularLegalizacionesActivasPorValorContable(ctx, facturaActualizada, {
    actorUserId: args.actorUserId,
    actorNombre: args.actorNombre,
    actorEmail: args.actorEmail,
    now,
  });
  await validarYRecalcularValorAPagarTrasCambioObligacion(ctx, facturaActualizada, now);
  await refrescarProyeccionFactura(ctx, args.factura._id, now);

  return {
    valorContableCambio: {
      valorAnterior,
      valorNuevo,
      moneda: args.factura.moneda,
    },
  };
}

async function procesarValorContableEnAccion(
  ctx: MutationCtx,
  args: {
    factura: Doc<"facturacionFacturas">;
    asignacion: Doc<"facturacionAsignaciones">;
    valorContableNuevo?: number;
    comentario: string;
    actorUserId?: string;
    actorNombre: string;
    actorEmail: string;
  }
): Promise<{ valorContableCambio?: ValorContableCambio }> {
  if (args.valorContableNuevo === undefined) {
    return {};
  }

  return aplicarCambioValorContable(ctx, {
    factura: args.factura,
    fase: args.asignacion.fase,
    valorContableNuevo: args.valorContableNuevo,
    comentario: args.comentario,
    actorUserId: args.actorUserId,
    actorNombre: args.actorNombre,
    actorEmail: args.actorEmail,
  });
}

function getSaldoPendienteAnticipo(anticipo: Doc<"anticipos">) {
  return getSaldoPendienteLegalizableAnticipo(anticipo);
}

async function obtenerAnticiposPorResponsableLegalizacion(
  ctx: FacturacionCtx,
  responsableUserId: string
) {
  const [porResponsable, porSolicitante] = await Promise.all([
    ctx.db
      .query("anticipos")
      .withIndex("by_responsableUserId", (q) => q.eq("responsableUserId", responsableUserId))
      .collect(),
    ctx.db
      .query("anticipos")
      .withIndex("by_createdById", (q) => q.eq("createdById", responsableUserId))
      .collect(),
  ]);
  const byId = new Map<string, Doc<"anticipos">>();
  [...porResponsable, ...porSolicitante].forEach((anticipo) => {
    byId.set(String(anticipo._id), anticipo);
  });
  return Array.from(byId.values());
}

async function obtenerAnticiposPorEmpresa(ctx: FacturacionCtx, empresa: number) {
  const [porEmpresaId, porEmpresa] = await Promise.all([
    ctx.db
      .query("anticipos")
      .withIndex("by_empresa_id", (q) => q.eq("empresa_id", empresa))
      .collect(),
    ctx.db
      .query("anticipos")
      .withIndex("by_empresa", (q) => q.eq("empresa", empresa))
      .collect(),
  ]);
  const byId = new Map<string, Doc<"anticipos">>();
  [...porEmpresaId, ...porEmpresa].forEach((anticipo) => {
    byId.set(String(anticipo._id), anticipo);
  });
  return Array.from(byId.values());
}

function anticipoPerteneceAResponsableHistorico(
  anticipo: Doc<"anticipos">,
  responsableUserId?: string
) {
  if (!responsableUserId) return false;
  return (
    anticipo.responsableUserId === responsableUserId || anticipo.createdById === responsableUserId
  );
}

function anticipoPerteneceABolsaFactura(
  anticipo: Doc<"anticipos">,
  factura: Doc<"facturacionFacturas">
) {
  if (factura.anticipoBolsaId && anticipo.bolsaId) {
    return factura.anticipoBolsaId === anticipo.bolsaId;
  }

  if (
    normalizeEmpresa(anticipo.empresa_id ?? anticipo.empresa) !== normalizeEmpresa(factura.empresa)
  ) {
    return false;
  }

  if (isFacturaPeajes(factura)) {
    return anticipo.tipoBolsa === "peajes";
  }

  if (anticipo.tipoBolsa === "peajes") {
    return false;
  }

  const facturaProceso = {
    procesoId: factura.anticipoProcesoId,
    procesoNombre: factura.anticipoProcesoNombre,
  };
  const anticipoProceso = {
    procesoId: anticipo.procesoId,
    procesoNombre: anticipo.procesoNombre,
  };

  if (hasProcesoSnapshot(facturaProceso) && hasProcesoSnapshot(anticipoProceso)) {
    return sameProcesoSnapshot(facturaProceso, anticipoProceso);
  }

  return anticipoPerteneceAResponsableHistorico(anticipo, factura.anticipoLiderUserId);
}

async function obtenerAnticiposParaBolsaFactura(
  ctx: FacturacionCtx,
  factura: Doc<"facturacionFacturas">
) {
  const empresa = normalizeEmpresa(factura.empresa);
  const bolsaId = await resolveBolsaIdForFactura(ctx, factura);
  const anticiposPorBolsa = bolsaId
    ? await ctx.db
        .query("anticipos")
        .withIndex("by_bolsaId", (q) => q.eq("bolsaId", bolsaId))
        .collect()
    : [];
  let anticiposLegacy: Doc<"anticipos">[] = [];

  if (isFacturaPeajes(factura)) {
    anticiposLegacy =
      typeof factura.empresa === "number"
        ? (await obtenerAnticiposPorEmpresa(ctx, empresa)).filter(
            (anticipo) => anticipo.tipoBolsa === "peajes"
          )
        : await ctx.db.query("anticipos").collect();
  } else {
    const facturaProceso = {
      procesoId: factura.anticipoProcesoId,
      procesoNombre: factura.anticipoProcesoNombre,
    };

    if (hasProcesoSnapshot(facturaProceso)) {
      const anticipos =
        typeof factura.empresa === "number"
          ? await obtenerAnticiposPorEmpresa(ctx, empresa)
          : await ctx.db.query("anticipos").collect();

      const porProceso = anticipos.filter((anticipo) =>
        anticipoPerteneceABolsaFactura(anticipo, factura)
      );

      if (!factura.anticipoLiderUserId) {
        anticiposLegacy = porProceso;
      } else {
        const historicos = await obtenerAnticiposPorResponsableLegalizacion(
          ctx,
          factura.anticipoLiderUserId
        );
        const byId = new Map<string, Doc<"anticipos">>();
        [...porProceso, ...historicos].forEach((anticipo) => {
          if (anticipoPerteneceABolsaFactura(anticipo, factura)) {
            byId.set(String(anticipo._id), anticipo);
          }
        });
        anticiposLegacy = Array.from(byId.values());
      }
    } else if (factura.anticipoLiderUserId) {
      anticiposLegacy = (
        await obtenerAnticiposPorResponsableLegalizacion(ctx, factura.anticipoLiderUserId)
      ).filter((anticipo) => anticipoPerteneceABolsaFactura(anticipo, factura));
    }
  }

  const byId = new Map<string, Doc<"anticipos">>();
  [...anticiposPorBolsa, ...anticiposLegacy].forEach((anticipo) => {
    if (anticipoPerteneceABolsaFactura(anticipo, factura)) {
      byId.set(String(anticipo._id), anticipo);
    }
  });
  return Array.from(byId.values());
}

function isEstadoTerminalFacturacion(estado: string) {
  return (
    estado === "pagada" ||
    estado === "legalizada" ||
    estado === "cerrada" ||
    estado === "rechazada" ||
    estado === "rechazada_dian" ||
    estado === "nota_credito_cerrada"
  );
}

function isAnticipoPendienteLegalizacion(anticipo: Doc<"anticipos">) {
  return (
    anticipo.faseActual === "V_PENDIENTE_LEGALIZACION" && getSaldoPendienteAnticipo(anticipo) > 0
  );
}

async function listarLegalizacionesActivasFactura(
  ctx: FacturacionCtx,
  facturaId: Id<"facturacionFacturas">
) {
  return await ctx.db
    .query("facturacionAnticipoLegalizaciones")
    .withIndex("by_facturaId_estado", (q) => q.eq("facturaId", facturaId).eq("estado", "activa"))
    .collect();
}

async function obtenerNotasCreditoPeajesFactura(
  ctx: FacturacionCtx,
  factura: Doc<"facturacionFacturas">
) {
  if (!isFacturaPeajes(factura)) return [];

  const empresa = normalizeEmpresa(factura.empresa);
  const numeroNormalizado =
    factura.numeroFacturaNormalizado ?? normalizeDocumentNumber(factura.numeroFactura);
  const porReferencia = numeroNormalizado
    ? await ctx.db
        .query("facturacionFacturas")
        .withIndex("by_empresa_referenciaDocumentoNormalizado", (q) =>
          q.eq("empresa", empresa).eq("referenciaDocumentoNormalizado", numeroNormalizado)
        )
        .collect()
    : [];
  const porRelacion = (
    await ctx.db
      .query("facturacionFacturas")
      .withIndex("by_empresa", (q) => q.eq("empresa", empresa))
      .collect()
  ).filter((row) => row.facturaRelacionadaId === factura._id && isNotaCreditoPeajes(row));
  const byId = new Map<string, Doc<"facturacionFacturas">>();
  [...porReferencia, ...porRelacion]
    .filter(isNotaCreditoPeajes)
    .forEach((nota) => byId.set(String(nota._id), nota));
  return Array.from(byId.values());
}

async function obtenerValorLegalizableFactura(
  ctx: FacturacionCtx,
  factura: Doc<"facturacionFacturas">
) {
  let valorBase = getValorContable(factura);
  if (isFacturaPeajes(factura)) {
    const notas = await obtenerNotasCreditoPeajesFactura(ctx, factura);
    const totalNotas = notas.reduce((total, nota) => total + nota.total, 0);
    valorBase = Math.max(0, valorBase - totalNotas);
  }

  const documentosInternos = await sumarDocumentosInternosActivos(ctx, factura._id);
  const aprobaciones = await ctx.db
    .query("facturacionAprobaciones")
    .withIndex("by_facturaId", (q) => q.eq("facturaId", factura._id))
    .collect();
  const pagosAplicados = getPagosAplicadosFromAprobaciones(aprobaciones);

  return Math.max(0, valorBase - documentosInternos.total - pagosAplicados);
}

const MONEY_TOLERANCE = 0.001;

function anticipoCruceCubiertoTotalmente(valorAplicado: number, valorLegalizable: number) {
  return valorAplicado + MONEY_TOLERANCE >= valorLegalizable;
}

function actualizarLegalizacionFacturaEnAnticipo(
  anticipo: Doc<"anticipos">,
  facturaId: Id<"facturacionFacturas">,
  valorLegalizado: number
) {
  const legalizaciones = (anticipo.legalizacion ?? []) as AnticipoLegalizacionItem[];
  return legalizaciones.map((item) =>
    String(item.facturaId) === String(facturaId) ? { ...item, valorLegalizado } : item
  );
}

async function recalcularLegalizacionesActivasPorValorContable(
  ctx: MutationCtx,
  factura: Doc<"facturacionFacturas">,
  args: {
    actorUserId?: string;
    actorNombre: string;
    actorEmail: string;
    now: number;
  }
) {
  const legalizaciones = await listarLegalizacionesActivasFactura(ctx, factura._id);
  if (legalizaciones.length === 0) return;

  const valorLegalizable = await obtenerValorLegalizableFactura(ctx, factura);
  const valorAplicadoActual = legalizaciones.reduce((total, row) => total + row.valorAplicado, 0);
  const actorUserId = args.actorUserId ?? "sin-usuario";

  if (valorLegalizable + 0.001 >= valorAplicadoActual) {
    for (const row of legalizaciones) {
      const anticipo = await ctx.db.get("anticipos", row.anticipoId);
      if (!anticipo) continue;
      await ctx.db.patch("facturacionAnticipoLegalizaciones", row._id, {
        valorContableFactura: getValorContable(factura),
        valorContableAnticipo: getValorContableAnticipo(anticipo),
        actualizadoEn: args.now,
      });
    }
    await validarYRecalcularValorAPagarTrasCambioObligacion(ctx, factura, args.now);
    return;
  }

  if (valorLegalizable + 0.001 < valorAplicadoActual) {
    let exceso = valorAplicadoActual - valorLegalizable;
    const sorted = [...legalizaciones].sort((a, b) => {
      if (b.creadoEn !== a.creadoEn) return b.creadoEn - a.creadoEn;
      return b._creationTime - a._creationTime;
    });

    for (const row of sorted) {
      if (exceso <= 0.001) break;
      const reduccion = Math.min(exceso, row.valorAplicado);
      if (reduccion <= 0.001) continue;

      const anticipo = await ctx.db.get("anticipos", row.anticipoId);
      if (!anticipo) continue;

      const saldoAntes = getSaldoLegalizadoAnticipo(anticipo);
      const saldoDespues = Math.max(0, saldoAntes - reduccion);
      const nuevoValorAplicado = row.valorAplicado - reduccion;
      const legalizacionAnticipo = actualizarLegalizacionFacturaEnAnticipo(
        anticipo,
        factura._id,
        nuevoValorAplicado
      );

      await aplicarSaldoAnticipo(
        ctx,
        anticipo,
        saldoDespues,
        actorUserId,
        args.now,
        legalizacionAnticipo
      );

      if (nuevoValorAplicado <= 0.001) {
        await ctx.db.patch("facturacionAnticipoLegalizaciones", row._id, {
          estado: "reemplazada",
          actualizadoEn: args.now,
        });
      } else {
        await ctx.db.patch("facturacionAnticipoLegalizaciones", row._id, {
          valorAplicado: nuevoValorAplicado,
          saldoDespues,
          valorContableFactura: getValorContable(factura),
          valorContableAnticipo: getValorContableAnticipo(anticipo),
          actualizadoEn: args.now,
        });
      }

      exceso -= reduccion;
    }
    await validarYRecalcularValorAPagarTrasCambioObligacion(ctx, factura, args.now);
    return;
  }
}

function limpiarLegalizacionesFacturaEnAnticipo(
  anticipo: Doc<"anticipos">,
  facturaId: Id<"facturacionFacturas">
) {
  const legalizaciones = (anticipo.legalizacion ?? []) as AnticipoLegalizacionItem[];
  return legalizaciones.filter((item) => String(item.facturaId) !== String(facturaId));
}

async function aplicarSaldoAnticipo(
  ctx: MutationCtx,
  anticipo: Doc<"anticipos">,
  saldoLegalizado: number,
  actorUserId: string,
  now: number,
  legalizacion: Doc<"anticipos">["legalizacion"],
  observaciones?: string
) {
  await reconciliarEstadoLegalizacionAnticipo(ctx, anticipo, saldoLegalizado, actorUserId, now, {
    legalizacion,
    observaciones,
  });
}

async function revertirLegalizacionesFactura(
  ctx: MutationCtx,
  facturaId: Id<"facturacionFacturas">,
  actorUserId: string,
  now: number
) {
  const actuales = await listarLegalizacionesActivasFactura(ctx, facturaId);

  for (const row of actuales) {
    const anticipo = await ctx.db.get("anticipos", row.anticipoId);
    if (!anticipo) {
      await ctx.db.patch("facturacionAnticipoLegalizaciones", row._id, {
        estado: "reemplazada",
        actualizadoEn: now,
      });
      continue;
    }

    const saldoAnterior = getSaldoLegalizadoAnticipo(anticipo);
    const saldoRevertido = Math.max(0, saldoAnterior - row.valorAplicado);
    await aplicarSaldoAnticipo(
      ctx,
      anticipo,
      saldoRevertido,
      actorUserId,
      now,
      limpiarLegalizacionesFacturaEnAnticipo(anticipo, facturaId)
    );
    await ctx.db.patch("facturacionAnticipoLegalizaciones", row._id, {
      estado: "reemplazada",
      actualizadoEn: now,
    });
  }
}

async function obtenerResumenLegalizacionFactura(
  ctx: FacturacionCtx,
  factura: Doc<"facturacionFacturas">
) {
  const activas = await listarLegalizacionesActivasFactura(ctx, factura._id);
  const valorLegalizable = await obtenerValorLegalizableFactura(ctx, factura);
  const valorAplicado = activas.reduce((total, row) => total + row.valorAplicado, 0);

  if (!facturaTieneReferenciaBolsaAnticipo(factura)) {
    return {
      valorAplicado,
      valorLegalizable,
      maxLegalizable: valorAplicado,
      pendienteDisponible: 0,
      legalizaciones: activas,
    };
  }

  const anticipos = await obtenerAnticiposParaBolsaFactura(ctx, factura);
  const pendienteDisponible = anticipos
    .filter((anticipo) => isAnticipoPendienteLegalizacion(anticipo))
    .reduce((total, anticipo) => total + getSaldoPendienteAnticipo(anticipo), 0);

  return {
    valorAplicado,
    valorLegalizable,
    maxLegalizable: Math.min(valorLegalizable, valorAplicado + pendienteDisponible),
    pendienteDisponible,
    legalizaciones: activas,
  };
}

async function validarLegalizacionAnticipoParaAvanzar(
  ctx: FacturacionCtx,
  factura: Doc<"facturacionFacturas">
) {
  if (!factura.esLegalizacionAnticipo) return;
  if (!facturaTieneReferenciaBolsaAnticipo(factura)) {
    throw new Error("La factura está marcada como anticipo, pero no tiene proceso de bolsa.");
  }

  const resumen = await obtenerResumenLegalizacionFactura(ctx, factura);
  if (resumen.valorLegalizable <= 0) return;
  if (resumen.valorAplicado <= 0 || resumen.legalizaciones.length === 0) {
    throw new Error("Legaliza al menos un anticipo antes de avanzar.");
  }
  const minimoRequerido = Math.min(resumen.valorLegalizable, resumen.maxLegalizable);
  if (minimoRequerido <= 0) return;
  if (resumen.valorAplicado + 0.001 < minimoRequerido) {
    throw new Error("Completa el cruce de anticipos disponible antes de avanzar.");
  }
}

async function validarLegalizacionAnticipoMinimaParaLider(
  ctx: FacturacionCtx,
  factura: Doc<"facturacionFacturas">
) {
  if (!factura.esLegalizacionAnticipo) return;
  if (!facturaTieneReferenciaBolsaAnticipo(factura)) {
    throw new Error("La factura está marcada como anticipo, pero no tiene proceso de bolsa.");
  }

  const resumen = await obtenerResumenLegalizacionFactura(ctx, factura);
  if (resumen.valorLegalizable <= 0) return;
  if (resumen.valorAplicado <= 0) {
    throw new Error("Legaliza al menos un anticipo antes de enviar a causación.");
  }
}

async function listarLegalizacionesActivasCajaMenorFactura(
  ctx: FacturacionCtx,
  facturaId: Id<"facturacionFacturas">
) {
  return await ctx.db
    .query("facturacionCajaMenorLegalizaciones")
    .withIndex("by_facturaId_estado", (q) => q.eq("facturaId", facturaId).eq("estado", "activa"))
    .collect();
}

async function listarMovimientosActivosCajaMenorFactura(
  ctx: FacturacionCtx,
  facturaId: Id<"facturacionFacturas">
) {
  const movimientos = await ctx.db
    .query("facturacionCajaMenorMovimientos")
    .withIndex("by_facturaId", (q) => q.eq("facturaId", facturaId))
    .collect();
  return movimientos.filter((movimiento) => movimiento.estado !== "anulado");
}

async function getCajaMenorRefills(ctx: FacturacionCtx, cajaMenorId: Id<"cajasMenores">) {
  return await ctx.db
    .query("cajasMenoresRefills")
    .withIndex("by_cajaMenorId", (q) => q.eq("cajaMenorId", cajaMenorId))
    .collect();
}

async function getCajaMenorSaldo(ctx: FacturacionCtx, caja: Doc<"cajasMenores">) {
  const [refills, legalizaciones] = await Promise.all([
    getCajaMenorRefills(ctx, caja._id),
    ctx.db
      .query("facturacionCajaMenorLegalizaciones")
      .withIndex("by_cajaMenorId_estado", (q) =>
        q.eq("cajaMenorId", caja._id).eq("estado", "activa")
      )
      .collect(),
  ]);
  const totalRefills = refills.reduce(
    (total, refill) => total + Math.max(0, refill.refillValue),
    0
  );
  const totalLegalizado = legalizaciones.reduce(
    (total, row) => total + Math.max(0, row.valorAplicado),
    0
  );
  const saldoActual = caja.assignedValue + totalRefills - totalLegalizado;
  const refillPendiente = refills.some((refill) => !refill.receiptConfirmed);
  return {
    totalRefills,
    totalLegalizado,
    saldoActual,
    saldoDisponible: (caja.estado ?? "activa") === "activa" && !refillPendiente ? saldoActual : 0,
    refillPendiente,
  };
}

async function revertirLegalizacionesCajaMenorFactura(
  ctx: MutationCtx,
  facturaId: Id<"facturacionFacturas">,
  now: number
) {
  const actuales = await listarLegalizacionesActivasCajaMenorFactura(ctx, facturaId);
  for (const row of actuales) {
    await ctx.db.patch("facturacionCajaMenorLegalizaciones", row._id, {
      estado: "reemplazada",
      actualizadoEn: now,
    });
  }
}

async function validarLegalizacionCajaMenorParaAvanzar(
  ctx: FacturacionCtx,
  factura: Doc<"facturacionFacturas">
) {
  if (!factura.esLegalizacionCajaMenor) return;
  const movimientos = await listarMovimientosActivosCajaMenorFactura(ctx, factura._id);
  if (movimientos.length === 0) {
    throw new Error("La factura no tiene movimiento activo de Caja Menor.");
  }
  const total = movimientos.reduce((sum, row) => sum + row.valor, 0);
  if (total + 0.001 < factura.total) {
    throw new Error("El movimiento de Caja Menor no cubre el valor total de la factura.");
  }
}

async function legalizarCajaMenorDesdeAsignacion(
  ctx: MutationCtx,
  args: {
    asignacion: Doc<"facturacionAsignaciones">;
    tarea: Doc<"facturacionTareas">;
    empresa: number;
    actor: CajaMenorLegalizacionActor;
  }
) {
  const factura = await ctx.db.get("facturacionFacturas", args.tarea.facturaId);
  if (!factura) throw new Error("Factura no encontrada.");
  if (!factura.esLegalizacionCajaMenor) {
    throw new Error("La factura no está marcada como legalización de Caja Menor.");
  }
  await validarLegalizacionCajaMenorParaAvanzar(ctx, factura);

  await cerrarAsignacion(ctx, args.asignacion, "completada", args.actor.comentario ?? "");
  await cancelarPendientesDelGrupo(ctx, args.asignacion.grupoId, args.asignacion._id, {
    tareaId: args.tarea._id,
    facturaId: args.tarea.facturaId,
    empresa: args.empresa,
    actorUserId: args.actor.actorUserId,
    actorNombre: args.actor.actorNombre,
    actorEmail: args.actor.actorEmail,
    estadoAnterior: args.tarea.estado,
    estadoNuevo: "legalizada",
    ...(args.actor.causacionCambio ? { causacionCambio: args.actor.causacionCambio } : {}),
  });
  await registrarAprobacion(ctx, {
    tareaId: args.tarea._id,
    facturaId: args.tarea.facturaId,
    asignacionId: args.asignacion._id,
    empresa: args.empresa,
    actorUserId: args.actor.actorUserId,
    actorNombre: args.actor.actorNombre,
    actorEmail: args.actor.actorEmail,
    accion: "legalizar_caja_menor",
    comentario: args.actor.comentario || "Legalización de Caja Menor.",
    estadoAnterior: args.tarea.estado,
    estadoNuevo: "legalizada",
  });
  await ctx.db.patch("facturacionTareas", args.tarea._id, {
    estado: "legalizada",
    asignadoAUserId: args.asignacion.asignadoAUserId,
    asignadoANombre: args.asignacion.asignadoANombre,
    asignadoAEmail: normalizeEmail(args.asignacion.asignadoAEmail),
    grupoAsignacionActualId: args.asignacion.grupoId,
    currentAsignacionId: args.asignacion._id,
    actualizadoEn: Date.now(),
  });
  await programarNotificacionEstadoTerminal(ctx, args.tarea, "legalizada", args.actor.comentario);
}

async function cerrarNotaCreditoDesdeAsignacion(
  ctx: MutationCtx,
  args: {
    asignacion: Doc<"facturacionAsignaciones">;
    tarea: Doc<"facturacionTareas">;
    empresa: number;
    actorUserId?: string;
    actorNombre: string;
    actorEmail: string;
    comentario: string;
  }
) {
  const fasesPermitidas = [
    "causacion",
    "revision_impuestos",
    "eventos_dian",
    "gerencia",
    "revision_tesoreria",
  ];
  if (
    !fasesPermitidas.includes(args.asignacion.fase) ||
    args.tarea.estado !== args.asignacion.fase
  ) {
    throw new Error(
      "La nota crédito sólo se puede cerrar desde causación, contabilidad, Eventos DIAN, Gerencia o Tesorería."
    );
  }

  const factura = await ctx.db.get("facturacionFacturas", args.tarea.facturaId);
  if (!factura) throw new Error("Nota crédito no encontrada.");
  if (getDocumentoClaseFacturacion(factura) !== "nota_credito") {
    throw new Error("Esta acción sólo aplica para notas crédito.");
  }
  if (isNotaCreditoPeajes(factura)) {
    throw new Error("Las notas crédito PEAJES se manejan desde /facturacion/peajes.");
  }

  await cerrarAsignacion(ctx, args.asignacion, "completada", args.comentario, {
    origen: "cierre_nota_credito",
  });
  await cancelarPendientesDelGrupo(ctx, args.asignacion.grupoId, args.asignacion._id, {
    tareaId: args.tarea._id,
    facturaId: args.tarea.facturaId,
    empresa: args.empresa,
    actorUserId: args.actorUserId,
    actorNombre: args.actorNombre,
    actorEmail: args.actorEmail,
    estadoAnterior: args.tarea.estado,
    estadoNuevo: "nota_credito_cerrada",
  });
  await registrarAprobacion(ctx, {
    tareaId: args.tarea._id,
    facturaId: args.tarea.facturaId,
    asignacionId: args.asignacion._id,
    empresa: args.empresa,
    actorUserId: args.actorUserId,
    actorNombre: args.actorNombre,
    actorEmail: args.actorEmail,
    accion: "cerrar_nota_credito",
    comentario: args.comentario,
    estadoAnterior: args.tarea.estado,
    estadoNuevo: "nota_credito_cerrada",
  });
  await ctx.db.patch("facturacionTareas", args.tarea._id, {
    estado: "nota_credito_cerrada",
    asignadoAUserId: args.asignacion.asignadoAUserId,
    asignadoANombre: args.asignacion.asignadoANombre,
    asignadoAEmail: normalizeEmail(args.asignacion.asignadoAEmail),
    grupoAsignacionActualId: args.asignacion.grupoId,
    currentAsignacionId: args.asignacion._id,
    actualizadoEn: Date.now(),
  });
}

async function cerrarFacturaRecepcionDesdeAsignacion(
  ctx: MutationCtx,
  args: {
    asignacion: Doc<"facturacionAsignaciones">;
    tarea: Doc<"facturacionTareas">;
    empresa: number;
    actorUserId?: string;
    actorNombre: string;
    actorEmail: string;
    comentario: string;
  }
) {
  const faseOrigen = args.asignacion.fase;
  if (!isCloseInvoicePhase(faseOrigen) || args.tarea.estado !== faseOrigen) {
    throw new Error(
      "La factura sólo se puede cerrar desde recepción, causación, contabilidad, eventos DIAN o gerencia."
    );
  }

  const factura = await ctx.db.get("facturacionFacturas", args.tarea.facturaId);
  if (!factura) throw new Error("Factura no encontrada.");

  const closureMetadata =
    faseOrigen === "recepcion"
      ? { origen: "cierre_factura_recepcion" }
      : { origen: "cierre_factura", fase: faseOrigen };

  await cerrarAsignacion(ctx, args.asignacion, "completada", args.comentario, closureMetadata);
  await cancelarPendientesDelGrupo(ctx, args.asignacion.grupoId, args.asignacion._id, {
    tareaId: args.tarea._id,
    facturaId: args.tarea.facturaId,
    empresa: args.empresa,
    actorUserId: args.actorUserId,
    actorNombre: args.actorNombre,
    actorEmail: args.actorEmail,
    estadoAnterior: args.tarea.estado,
    estadoNuevo: "cerrada",
  });
  await registrarAprobacion(ctx, {
    tareaId: args.tarea._id,
    facturaId: args.tarea.facturaId,
    asignacionId: args.asignacion._id,
    empresa: args.empresa,
    actorUserId: args.actorUserId,
    actorNombre: args.actorNombre,
    actorEmail: args.actorEmail,
    accion: "cerrar_factura",
    comentario: args.comentario,
    estadoAnterior: args.tarea.estado,
    estadoNuevo: "cerrada",
  });
  await patchTareaEstado(ctx, args.tarea, "cerrada", {
    asignadoAUserId: args.asignacion.asignadoAUserId,
    asignadoANombre: args.asignacion.asignadoANombre,
    asignadoAEmail: normalizeEmail(args.asignacion.asignadoAEmail),
    grupoAsignacionActualId: args.asignacion.grupoId,
    currentAsignacionId: args.asignacion._id,
  });
  await programarNotificacionEstadoTerminal(ctx, args.tarea, "cerrada", args.comentario);
}

async function insertarAsignacion(
  ctx: MutationCtx,
  args: {
    facturaId: Id<"facturacionFacturas">;
    tareaId: Id<"facturacionTareas">;
    empresa: number;
    fase: FaseAsignacion;
    rol: RolAsignacion;
    grupoId: string;
    usuario: UsuarioConfig;
    metadata?: unknown;
    notificar?: boolean;
    now?: number;
  }
) {
  const now = args.now ?? Date.now();
  const asignacionId = await ctx.db.insert("facturacionAsignaciones", {
    facturaId: args.facturaId,
    tareaId: args.tareaId,
    empresa: args.empresa,
    fase: args.fase,
    estado: "pendiente",
    rol: args.rol,
    grupoId: args.grupoId,
    ...(args.usuario.usuarioId ? { asignadoAUserId: args.usuario.usuarioId } : {}),
    asignadoANombre: args.usuario.nombre,
    asignadoAEmail: normalizeEmail(args.usuario.email),
    asignadoAProcesoId: args.usuario.procesoId,
    asignadoAProcesoNombre: sanitizeProcesoNombre(args.usuario.procesoNombre),
    fechaAsignacion: now,
    ...(args.metadata !== undefined ? { metadata: args.metadata } : {}),
    creadoEn: now,
    actualizadoEn: now,
  });

  if (args.notificar !== false) {
    await programarNotificacionFacturacion(ctx, {
      facturaId: args.facturaId,
      tareaId: args.tareaId,
      fase: args.fase,
      destinatarios: [args.usuario],
    });
  }

  await refrescarProyeccionFactura(ctx, args.facturaId, now);

  return asignacionId;
}

async function cerrarAsignacion(
  ctx: MutationCtx,
  asignacion: Doc<"facturacionAsignaciones">,
  estado: EstadoAsignacion,
  comentario: string,
  metadata?: unknown
) {
  const now = Date.now();
  await ctx.db.patch("facturacionAsignaciones", asignacion._id, {
    estado,
    fechaCompletado: now,
    duracionMs: Math.max(0, now - asignacion.fechaAsignacion),
    comentario,
    actualizadoEn: now,
    ...(metadata !== undefined ? { metadata } : {}),
  });
  await refrescarProyeccionFactura(ctx, asignacion.facturaId, now);
}

/** Patch tarea estado and maintain faseIniciadaEn / finalizadoEn clocks. */
async function patchTareaEstado(
  ctx: MutationCtx,
  tarea: Doc<"facturacionTareas">,
  estadoNuevo: string,
  extras: Record<string, unknown> = {},
  nowMs: number = Date.now()
) {
  const clocks = phaseTransitionPatch({
    estadoAnterior: tarea.estado,
    estadoNuevo,
    nowMs,
    existingFaseIniciadaEn: tarea.faseIniciadaEn,
  });
  const patch: Partial<Doc<"facturacionTareas">> = {
    ...(extras as Partial<Doc<"facturacionTareas">>),
    estado: clocks.estado as Doc<"facturacionTareas">["estado"],
    ...(clocks.faseIniciadaEn !== undefined ? { faseIniciadaEn: clocks.faseIniciadaEn } : {}),
    ...(clocks.faseIniciadaEnEstimado !== undefined
      ? { faseIniciadaEnEstimado: clocks.faseIniciadaEnEstimado }
      : {}),
    ...(clocks.finalizadoEn !== undefined ? { finalizadoEn: clocks.finalizadoEn } : {}),
    actualizadoEn: nowMs,
  };
  await ctx.db.patch("facturacionTareas", tarea._id, patch);
  await refrescarProyeccionFactura(ctx, tarea.facturaId, nowMs);
}

async function cancelarPendientesDelGrupo(
  ctx: MutationCtx,
  grupoId: string,
  exceptId?: Id<"facturacionAsignaciones">,
  audit?: {
    tareaId: Id<"facturacionTareas">;
    facturaId: Id<"facturacionFacturas">;
    empresa?: number;
    actorUserId?: string;
    actorNombre?: string;
    actorEmail?: string;
    estadoAnterior: string;
    estadoNuevo: string;
  }
) {
  const pendientes = await ctx.db
    .query("facturacionAsignaciones")
    .withIndex("by_grupoId", (q) => q.eq("grupoId", grupoId))
    .collect();

  for (const item of pendientes.filter(
    (asignacion) => asignacion.estado === "pendiente" && asignacion._id !== exceptId
  )) {
    await cerrarAsignacion(ctx, item, "cancelada", "Cancelada por avance del flujo.");
    if (audit) {
      await registrarAprobacion(ctx, {
        tareaId: audit.tareaId,
        facturaId: audit.facturaId,
        asignacionId: item._id,
        empresa: audit.empresa,
        actorUserId: audit.actorUserId,
        actorNombre: audit.actorNombre,
        actorEmail: audit.actorEmail,
        accion: "cancelar",
        comentario: "Asignación cancelada por avance del flujo.",
        estadoAnterior: audit.estadoAnterior,
        estadoNuevo: audit.estadoNuevo,
      });
    }
  }
}

/**
 * Resolves the acting user from the Convex identity (never from client args) and checks
 * that they are the assignee of `asignacion` (or have full access).
 */
async function resolverActorAsignacion(
  ctx: MutationCtx,
  asignacion: Doc<"facturacionAsignaciones">
): Promise<{ actorUserId: string; actorNombre: string; actorEmail: string }> {
  const actor = await requireBillingActor(ctx);
  const esAsignado =
    (asignacion.asignadoAUserId && asignacion.asignadoAUserId === actor.usuarioId) ||
    normalizeEmail(asignacion.asignadoAEmail) === normalizeEmail(actor.email);
  if (!esAsignado && !actor.hasFullAccess) {
    throw new Error("No tienes asignada esta tarea.");
  }
  return { actorUserId: actor.usuarioId, actorNombre: actor.nombre, actorEmail: actor.email };
}

async function getTareaFromAsignacion(
  ctx: MutationCtx,
  asignacionId: Id<"facturacionAsignaciones">
): Promise<{
  asignacion: Doc<"facturacionAsignaciones">;
  tarea: Doc<"facturacionTareas">;
  empresa: number;
}> {
  const asignacion = await ctx.db.get("facturacionAsignaciones", asignacionId);
  if (!asignacion) throw new Error("Asignación no encontrada.");
  if (asignacion.estado !== "pendiente") {
    throw new Error("La asignación ya no está pendiente.");
  }

  const tarea = asignacion.tareaId ? await ctx.db.get("facturacionTareas", asignacion.tareaId) : null;
  if (!tarea) throw new Error("Tarea de facturación no encontrada.");

  return { asignacion, tarea, empresa: normalizeEmpresa(asignacion.empresa) };
}

type OrigenRevisionLiderRef = {
  asignacionId: Id<"facturacionAsignaciones">;
  userId?: string;
  nombre: string;
  email: string;
};

function metadataOrigenRevisionLider(
  origen?: OrigenRevisionLiderRef
): Record<string, unknown> | undefined {
  if (!origen) return undefined;
  return {
    origenRevisionLiderAsignacionId: origen.asignacionId,
    ...(origen.userId ? { origenRevisionLiderUserId: origen.userId } : {}),
    origenRevisionLiderEmail: normalizeEmail(origen.email),
    origenRevisionLiderNombre: origen.nombre,
  };
}

function leerOrigenRevisionLiderDesdeMetadata(metadata: unknown): OrigenRevisionLiderRef | null {
  if (!metadata || typeof metadata !== "object") return null;
  const meta = metadata as Record<string, unknown>;
  const nombre = meta.origenRevisionLiderNombre;
  const email = meta.origenRevisionLiderEmail;
  const asignacionId = meta.origenRevisionLiderAsignacionId;
  if (typeof nombre === "string" && typeof email === "string" && typeof asignacionId === "string") {
    return {
      asignacionId: asignacionId as Id<"facturacionAsignaciones">,
      userId:
        typeof meta.origenRevisionLiderUserId === "string"
          ? meta.origenRevisionLiderUserId
          : undefined,
      nombre,
      email: normalizeEmail(email),
    };
  }

  const esTransferenciaLiderACausacion =
    meta.origen === "asignar_fase_usuario" &&
    meta.faseOrigen === "revision_lider" &&
    meta.faseDestino === "causacion";
  if (
    !esTransferenciaLiderACausacion ||
    typeof meta.asignacionOrigenId !== "string" ||
    typeof meta.actorNombre !== "string" ||
    typeof meta.actorEmail !== "string"
  ) {
    return null;
  }

  return {
    asignacionId: meta.asignacionOrigenId as Id<"facturacionAsignaciones">,
    userId: typeof meta.actorUserId === "string" ? meta.actorUserId : undefined,
    nombre: meta.actorNombre,
    email: normalizeEmail(meta.actorEmail),
  };
}

function seleccionarAsignacionPendiente(
  pendientes: Doc<"facturacionAsignaciones">[],
  preferUserId?: string,
  preferEmail?: string
) {
  if (preferUserId) {
    const match = pendientes.find((item) => item.asignadoAUserId === preferUserId);
    if (match) return match;
  }
  if (preferEmail) {
    const normalized = normalizeEmail(preferEmail);
    const match = pendientes.find((item) => normalizeEmail(item.asignadoAEmail) === normalized);
    if (match) return match;
  }
  return [...pendientes].sort((a, b) => a.creadoEn - b.creadoEn)[0]!;
}

async function resolverRemitenteLiderDevolucion(
  ctx: MutationCtx,
  tarea: Doc<"facturacionTareas">,
  asignacionOrigen: Doc<"facturacionAsignaciones">
): Promise<UsuarioConfig | null> {
  if (asignacionOrigen.fase === "causacion") {
    const origen = leerOrigenRevisionLiderDesdeMetadata(asignacionOrigen.metadata);
    if (origen) {
      const asignacionOrigenLider = await ctx.db.get("facturacionAsignaciones", origen.asignacionId);
      return {
        usuarioId: origen.userId ?? asignacionOrigenLider?.asignadoAUserId,
        nombre: origen.nombre,
        email: origen.email,
        procesoId: asignacionOrigenLider?.asignadoAProcesoId,
        procesoNombre: asignacionOrigenLider?.asignadoAProcesoNombre,
      };
    }
  }

  const aprobaciones = await ctx.db
    .query("facturacionAprobaciones")
    .withIndex("by_facturaId", (q) => q.eq("facturaId", tarea.facturaId))
    .collect();
  const aprobacionesLider = aprobaciones
    .filter((item) => item.accion === "aceptar")
    .sort((a, b) => b.creadoEn - a.creadoEn);

  for (const aprobacion of aprobacionesLider) {
    if (!aprobacion.asignacionId) continue;
    const asignacion = await ctx.db.get("facturacionAsignaciones", aprobacion.asignacionId);
    if (
      asignacion?.fase === "revision_lider" &&
      asignacion.estado !== "cancelada" &&
      asignacion.estado !== "reasignada"
    ) {
      return {
        usuarioId: asignacion.asignadoAUserId,
        nombre: asignacion.asignadoANombre,
        email: normalizeEmail(asignacion.asignadoAEmail),
        procesoId: asignacion.asignadoAProcesoId,
        procesoNombre: asignacion.asignadoAProcesoNombre,
      };
    }
  }

  const asignacionesLider = await ctx.db
    .query("facturacionAsignaciones")
    .withIndex("by_facturaId_fase", (q) =>
      q.eq("facturaId", tarea.facturaId).eq("fase", "revision_lider")
    )
    .collect();
  const ultimaCompletada = asignacionesLider
    .filter((item) => item.estado === "completada")
    .sort((a, b) => (b.fechaCompletado ?? b.creadoEn) - (a.fechaCompletado ?? a.creadoEn))[0];
  if (ultimaCompletada) {
    return {
      usuarioId: ultimaCompletada.asignadoAUserId,
      nombre: ultimaCompletada.asignadoANombre,
      email: normalizeEmail(ultimaCompletada.asignadoAEmail),
      procesoId: ultimaCompletada.asignadoAProcesoId,
      procesoNombre: ultimaCompletada.asignadoAProcesoNombre,
    };
  }

  return usuarioHistoricoParaFase(tarea, "revision_lider");
}

async function crearAsignacionCausacion(
  ctx: MutationCtx,
  tarea: Doc<"facturacionTareas">,
  actor: {
    actorUserId?: string;
    actorNombre: string;
    actorEmail: string;
    comentario: string;
    origenRevisionLider?: OrigenRevisionLiderRef;
  }
) {
  const empresa = normalizeEmpresa(tarea.empresa);
  const factura = await ctx.db.get("facturacionFacturas", tarea.facturaId);
  if (!factura) throw new Error("Factura no encontrada.");

  const asignacion = await resolverAsignacionCausacion(ctx, empresa, factura);
  const grupoId = createGroupId("causacion", tarea.facturaId);
  const asignacionId = await insertarAsignacion(ctx, {
    facturaId: tarea.facturaId,
    tareaId: tarea._id,
    empresa,
    fase: "causacion",
    rol: "analista_causacion",
    grupoId,
    usuario: {
      usuarioId: asignacion.asignadoAUserId,
      nombre: asignacion.asignadoANombre,
      email: asignacion.asignadoAEmail,
    },
    metadata: {
      origenAsignacion: asignacion.origenAsignacion,
      ...(asignacion.proveedorNit ? { proveedorNit: asignacion.proveedorNit } : {}),
      ...(asignacion.proveedorNitNormalizado
        ? { proveedorNitNormalizado: asignacion.proveedorNitNormalizado }
        : {}),
      ...(asignacion.proveedorNombre ? { proveedorNombre: asignacion.proveedorNombre } : {}),
      ...metadataOrigenRevisionLider(actor.origenRevisionLider),
    },
  });

  await registrarAprobacion(ctx, {
    tareaId: tarea._id,
    facturaId: tarea.facturaId,
    empresa,
    actorUserId: actor.actorUserId,
    actorNombre: actor.actorNombre,
    actorEmail: actor.actorEmail,
    accion: "causar",
    comentario: actor.comentario,
    estadoAnterior: tarea.estado,
    estadoNuevo: "causacion",
  });

  await patchTareaEstado(ctx, tarea, "causacion", {
    asignadoAUserId: asignacion.asignadoAUserId,
    asignadoANombre: asignacion.asignadoANombre,
    asignadoAEmail: asignacion.asignadoAEmail,
    causacionAsignadoAUserId: asignacion.asignadoAUserId,
    causacionAsignadoANombre: asignacion.asignadoANombre,
    causacionAsignadoAEmail: asignacion.asignadoAEmail,
    fechaAsignacionCausacion: Date.now(),
    grupoAsignacionActualId: grupoId,
    currentAsignacionId: asignacionId,
  });
}

async function crearAsignacionJefeDirecto(
  ctx: MutationCtx,
  tarea: Doc<"facturacionTareas">,
  jefeDirecto: UsuarioConfig,
  actor: {
    actorUserId?: string;
    actorNombre: string;
    actorEmail: string;
    comentario: string;
  }
) {
  const empresa = normalizeEmpresa(tarea.empresa);
  const grupoId = createGroupId("jefe_directo", tarea.facturaId);
  const asignacionId = await insertarAsignacion(ctx, {
    facturaId: tarea.facturaId,
    tareaId: tarea._id,
    empresa,
    fase: "jefe_directo",
    rol: "jefe_directo",
    grupoId,
    usuario: {
      usuarioId: jefeDirecto.usuarioId,
      nombre: jefeDirecto.nombre,
      email: jefeDirecto.email,
    },
  });

  await registrarAprobacion(ctx, {
    tareaId: tarea._id,
    facturaId: tarea.facturaId,
    empresa,
    actorUserId: actor.actorUserId,
    actorNombre: actor.actorNombre,
    actorEmail: actor.actorEmail,
    accion: "asignar_jefe_directo",
    comentario: actor.comentario,
    estadoAnterior: tarea.estado,
    estadoNuevo: "jefe_directo",
  });

  await patchTareaEstado(ctx, tarea, "jefe_directo", {
    jefeDirectoAsignadoAUserId: jefeDirecto.usuarioId,
    jefeDirectoAsignadoANombre: jefeDirecto.nombre,
    jefeDirectoAsignadoAEmail: normalizeEmail(jefeDirecto.email),
    asignadoAUserId: jefeDirecto.usuarioId,
    asignadoANombre: jefeDirecto.nombre,
    asignadoAEmail: normalizeEmail(jefeDirecto.email),
    grupoAsignacionActualId: grupoId,
    currentAsignacionId: asignacionId,
  });
}

async function crearAsignacionEventosDian(
  ctx: MutationCtx,
  tarea: Doc<"facturacionTareas">,
  eventosDian: UsuarioConfig,
  actor: {
    actorUserId?: string;
    actorNombre: string;
    actorEmail: string;
    comentario: string;
    valorContableCambio?: ValorContableCambio;
    causacionCambio?: NonNullable<Doc<"facturacionAprobaciones">["causacionCambio"]>;
  }
) {
  const empresa = normalizeEmpresa(tarea.empresa);
  const usuariosValidos = await getEventosDianUsuarios(ctx, empresa);
  const email = normalizeEmail(eventosDian.email);
  const esValido = usuariosValidos.some((usuario) =>
    usuariosCoincidenPorIdentidad(usuario, eventosDian)
  );
  if (!esValido) {
    throw new Error("Selecciona un usuario configurado para Eventos DIAN.");
  }

  const grupoId = createGroupId("eventos_dian", tarea.facturaId);
  const asignacionId = await insertarAsignacion(ctx, {
    facturaId: tarea.facturaId,
    tareaId: tarea._id,
    empresa,
    fase: "eventos_dian",
    rol: "eventos_dian",
    grupoId,
    usuario: {
      usuarioId: eventosDian.usuarioId,
      nombre: eventosDian.nombre,
      email,
    },
  });

  await registrarAprobacion(ctx, {
    tareaId: tarea._id,
    facturaId: tarea.facturaId,
    empresa,
    actorUserId: actor.actorUserId,
    actorNombre: actor.actorNombre,
    actorEmail: actor.actorEmail,
    accion: "asignar_eventos_dian",
    comentario: actor.comentario,
    estadoAnterior: tarea.estado,
    estadoNuevo: "eventos_dian",
    ...(actor.valorContableCambio ? { valorContableCambio: actor.valorContableCambio } : {}),
    ...(actor.causacionCambio ? { causacionCambio: actor.causacionCambio } : {}),
  });

  await patchTareaEstado(ctx, tarea, "eventos_dian", {
    eventosDianAsignadoAUserId: eventosDian.usuarioId,
    eventosDianAsignadoANombre: eventosDian.nombre,
    eventosDianAsignadoAEmail: email,
    asignadoAUserId: eventosDian.usuarioId,
    asignadoANombre: eventosDian.nombre,
    asignadoAEmail: email,
    grupoAsignacionActualId: grupoId,
    currentAsignacionId: asignacionId,
  });
}

async function crearAsignacionGerencia(
  ctx: MutationCtx,
  tarea: Doc<"facturacionTareas">,
  actor: {
    actorUserId?: string;
    actorNombre: string;
    actorEmail: string;
    comentario: string;
    valorContableCambio?: ValorContableCambio;
    causacionCambio?: NonNullable<Doc<"facturacionAprobaciones">["causacionCambio"]>;
  }
) {
  const empresa = normalizeEmpresa(tarea.empresa);
  const gerencia = await getGerenciaDefault(ctx, empresa);
  const grupoId = createGroupId("gerencia", tarea.facturaId);
  const asignacionId = await insertarAsignacion(ctx, {
    facturaId: tarea.facturaId,
    tareaId: tarea._id,
    empresa,
    fase: "gerencia",
    rol: "gerencia",
    grupoId,
    usuario: gerencia,
  });

  await registrarAprobacion(ctx, {
    tareaId: tarea._id,
    facturaId: tarea.facturaId,
    empresa,
    actorUserId: actor.actorUserId,
    actorNombre: actor.actorNombre,
    actorEmail: actor.actorEmail,
    accion: "asignar_gerencia",
    comentario: actor.comentario,
    estadoAnterior: tarea.estado,
    estadoNuevo: "gerencia",
    ...(actor.valorContableCambio ? { valorContableCambio: actor.valorContableCambio } : {}),
    ...(actor.causacionCambio ? { causacionCambio: actor.causacionCambio } : {}),
  });

  await patchTareaEstado(ctx, tarea, "gerencia", {
    gerenciaAsignadoAUserId: gerencia.usuarioId,
    gerenciaAsignadoANombre: gerencia.nombre,
    gerenciaAsignadoAEmail: normalizeEmail(gerencia.email),
    asignadoAUserId: gerencia.usuarioId,
    asignadoANombre: gerencia.nombre,
    asignadoAEmail: normalizeEmail(gerencia.email),
    grupoAsignacionActualId: grupoId,
    currentAsignacionId: asignacionId,
  });
}

type FaseSaltoContable = "causacion" | "revision_impuestos" | "eventos_dian";
type DestinoSaltoContable = "eventos_dian" | "gerencia";

type PlanSaltoFasesContables = {
  desde: FaseSaltoContable;
  destino: DestinoSaltoContable;
  contador?: UsuarioConfig;
  eventosDian?: UsuarioConfig;
  fasesSaltadas: FaseSaltoContable[];
};

function dedupeUsuariosConfigurados(usuarios: UsuarioConfig[]): UsuarioConfig[] {
  const vistos = new Set<string>();
  return usuarios.filter((usuario) => {
    const id = usuario.usuarioId?.trim();
    if (id) {
      const key = `id:${id}`;
      if (vistos.has(key)) return false;
      vistos.add(key);
      return true;
    }
    const email = normalizeEmail(usuario.email);
    if (!email) return false;
    const key = `email:${email}`;
    if (vistos.has(key)) return false;
    vistos.add(key);
    return true;
  });
}

async function resolverEventosDianParaSalto(
  ctx: MutationCtx,
  empresa: number,
  actual: UsuarioConfig,
  eventosDianEnviado?: UsuarioConfig | null
): Promise<UsuarioConfig> {
  const eventosDianUsuarios = dedupeUsuariosConfigurados(
    await getUsuariosConfigurados(ctx, empresa, "eventos_dian")
  );
  if (eventosDianUsuarios.length === 0) {
    throw new Error("No hay usuarios configurados para Eventos DIAN.");
  }

  const actualEnLista = eventosDianUsuarios.find((usuario) =>
    usuariosCoincidenPorIdentidad(usuario, actual)
  );
  if (actualEnLista) return actualEnLista;

  if (eventosDianUsuarios.length === 1) {
    return eventosDianUsuarios[0]!;
  }

  if (!eventosDianEnviado) {
    throw new Error("Selecciona el responsable de Eventos DIAN para continuar.");
  }

  const resuelto = eventosDianUsuarios.find((usuario) =>
    usuariosCoincidenPorIdentidad(usuario, eventosDianEnviado)
  );
  if (!resuelto) {
    throw new Error("El responsable de Eventos DIAN seleccionado ya no está configurado.");
  }
  return resuelto;
}

function validarResultadoEsperadoSalto(
  args: {
    resultadoEsperado?: "eventos_dian" | "gerencia" | "legalizada";
    finalizarLegalizacionAnticipo?: boolean;
  },
  plan: PlanSaltoFasesContables
) {
  if (args.finalizarLegalizacionAnticipo) {
    if (args.resultadoEsperado && args.resultadoEsperado !== "legalizada") {
      throw new Error("La acción de legalización no coincide con el plan.");
    }
    if (plan.destino !== "gerencia") {
      throw new Error("Solo puedes legalizar cuando el salto contable omitiría Gerencia.");
    }
    return;
  }

  if (!args.resultadoEsperado) return;

  if (args.resultadoEsperado === "legalizada") {
    throw new Error("Usa finalizarLegalizacionAnticipo para legalizar.");
  }
  if (args.resultadoEsperado !== plan.destino) {
    throw new Error(
      "La configuración cambió desde que abriste la acción. Actualiza la pantalla e intenta de nuevo."
    );
  }
}

function usuarioDesdeAsignacion(asignacion: Doc<"facturacionAsignaciones">): UsuarioConfig {
  return {
    usuarioId: asignacion.asignadoAUserId,
    nombre: asignacion.asignadoANombre,
    email: normalizeEmail(asignacion.asignadoAEmail),
    procesoId: asignacion.asignadoAProcesoId,
    procesoNombre: asignacion.asignadoAProcesoNombre,
  };
}

async function planificarSaltoFasesContables(
  ctx: MutationCtx,
  args: {
    empresa: number;
    asignacion: Doc<"facturacionAsignaciones">;
    factura: Doc<"facturacionFacturas">;
  }
): Promise<PlanSaltoFasesContables | null> {
  const actual = usuarioDesdeAsignacion(args.asignacion);
  const contadores = dedupeUsuariosConfigurados(
    await getUsuariosConfigurados(ctx, args.empresa, "contadores_impuestos")
  );
  const eventosDianUsuarios = dedupeUsuariosConfigurados(
    await getUsuariosConfigurados(ctx, args.empresa, "eventos_dian")
  );

  if (args.factura.esLegalizacionCajaMenor) return null;

  const contadorAsignado = contadores.find((usuario) =>
    usuariosCoincidenPorIdentidad(usuario, actual)
  );
  if (!contadorAsignado) return null;

  if (args.asignacion.fase === "causacion") {
    const eventosDianAsignado = eventosDianUsuarios.find((usuario) =>
      usuariosCoincidenPorIdentidad(usuario, actual)
    );
    if (eventosDianAsignado) {
      return {
        desde: "causacion",
        destino: "gerencia",
        contador: contadorAsignado,
        eventosDian: eventosDianAsignado,
        fasesSaltadas: ["revision_impuestos", "eventos_dian"],
      };
    }
    if (eventosDianUsuarios.length === 0) return null;
    return {
      desde: "causacion",
      destino: "eventos_dian",
      contador: contadorAsignado,
      fasesSaltadas: ["revision_impuestos"],
    };
  }

  if (args.asignacion.fase === "revision_impuestos") {
    const eventosDianAsignado = eventosDianUsuarios.find((usuario) =>
      usuariosCoincidenPorIdentidad(usuario, actual)
    );
    if (!eventosDianAsignado) return null;
    return {
      desde: "revision_impuestos",
      destino: "gerencia",
      eventosDian: eventosDianAsignado,
      fasesSaltadas: ["eventos_dian"],
    };
  }

  return null;
}

const SALTO_FASES_CONTABLES_METADATA = {
  origen: "salto_fases_contables",
};

async function crearAsignacionContableSaltada(
  ctx: MutationCtx,
  args: {
    tarea: Doc<"facturacionTareas">;
    empresa: number;
    fase: FaseAsignacion;
    rol: RolAsignacion;
    usuario: UsuarioConfig;
    comentario: string;
  }
) {
  const grupoId = createGroupId(args.fase, args.tarea.facturaId);
  const asignacionId = await insertarAsignacion(ctx, {
    facturaId: args.tarea.facturaId,
    tareaId: args.tarea._id,
    empresa: args.empresa,
    fase: args.fase,
    rol: args.rol,
    grupoId,
    usuario: args.usuario,
    metadata: SALTO_FASES_CONTABLES_METADATA,
    notificar: false,
  });
  const asignacion = await ctx.db.get("facturacionAsignaciones", asignacionId);
  if (!asignacion) throw new Error("No se pudo crear la asignación contable.");
  await cerrarAsignacion(ctx, asignacion, "completada", args.comentario, {
    ...SALTO_FASES_CONTABLES_METADATA,
    completadaAutomaticamente: true,
  });
  return { asignacionId, grupoId };
}

async function crearAsignacionEventosDianFinalSalto(
  ctx: MutationCtx,
  args: {
    tarea: Doc<"facturacionTareas">;
    empresa: number;
    eventosDian: UsuarioConfig;
  }
) {
  const grupoId = createGroupId("eventos_dian", args.tarea.facturaId);
  const asignacionId = await insertarAsignacion(ctx, {
    facturaId: args.tarea.facturaId,
    tareaId: args.tarea._id,
    empresa: args.empresa,
    fase: "eventos_dian",
    rol: "eventos_dian",
    grupoId,
    usuario: args.eventosDian,
    metadata: SALTO_FASES_CONTABLES_METADATA,
  });
  return { asignacionId, grupoId };
}

async function crearAsignacionGerenciaFinalSalto(
  ctx: MutationCtx,
  args: {
    tarea: Doc<"facturacionTareas">;
    empresa: number;
  }
) {
  const gerencia = await getGerenciaDefault(ctx, args.empresa);
  const grupoId = createGroupId("gerencia", args.tarea.facturaId);
  const asignacionId = await insertarAsignacion(ctx, {
    facturaId: args.tarea.facturaId,
    tareaId: args.tarea._id,
    empresa: args.empresa,
    fase: "gerencia",
    rol: "gerencia",
    grupoId,
    usuario: gerencia,
    metadata: SALTO_FASES_CONTABLES_METADATA,
  });
  return { asignacionId, grupoId, gerencia };
}

async function validarFinalizarLegalizacionAnticipoDesdeSalto(
  ctx: MutationCtx,
  factura: Doc<"facturacionFacturas">,
  plan: PlanSaltoFasesContables
) {
  if (plan.destino !== "gerencia") {
    throw new Error("Solo puedes legalizar cuando el salto contable omitiría Gerencia.");
  }
  if (!factura.esLegalizacionAnticipo) {
    throw new Error("La factura no está marcada como legalización de anticipo.");
  }
  const resumen = await obtenerResumenLegalizacionFactura(ctx, factura);
  if (!anticipoCruceCubiertoTotalmente(resumen.valorAplicado, resumen.valorLegalizable)) {
    throw new Error("El cruce de anticipos no cubre el valor legalizable de la factura.");
  }
}

async function registrarLegalizacionAnticipoDesdeSaltoContable(
  ctx: MutationCtx,
  args: {
    tarea: Doc<"facturacionTareas">;
    asignacionId: Id<"facturacionAsignaciones">;
    asignadoAUserId: string;
    asignadoANombre: string;
    asignadoAEmail: string;
    grupoId: string;
    empresa: number;
    actorUserId: string;
    actorNombre: string;
    actorEmail: string;
    comentario: string;
    estadoAnterior: string;
    creadoEn: number;
    valorContableCambio?: ValorContableCambio;
    tareaPatch?: Partial<Doc<"facturacionTareas">>;
  }
) {
  await registrarAprobacion(ctx, {
    tareaId: args.tarea._id,
    facturaId: args.tarea.facturaId,
    asignacionId: args.asignacionId,
    empresa: args.empresa,
    actorUserId: args.actorUserId,
    actorNombre: args.actorNombre,
    actorEmail: args.actorEmail,
    accion: "legalizar_factura",
    comentario: args.comentario,
    estadoAnterior: args.estadoAnterior,
    estadoNuevo: "legalizada",
    creadoEn: args.creadoEn,
    ...(args.valorContableCambio ? { valorContableCambio: args.valorContableCambio } : {}),
  });
  await ctx.db.patch("facturacionTareas", args.tarea._id, {
    estado: "legalizada",
    asignadoAUserId: args.asignadoAUserId,
    asignadoANombre: args.asignadoANombre,
    asignadoAEmail: normalizeEmail(args.asignadoAEmail),
    grupoAsignacionActualId: args.grupoId,
    currentAsignacionId: args.asignacionId,
    actualizadoEn: args.creadoEn,
    ...(args.tareaPatch ?? {}),
  });
  await programarNotificacionEstadoTerminal(ctx, args.tarea, "legalizada", args.comentario);
}

async function crearAsignacionRechazosDian(
  ctx: MutationCtx,
  tarea: Doc<"facturacionTareas">,
  actor: {
    actorUserId?: string;
    actorNombre: string;
    actorEmail: string;
    comentario: string;
    asignacionOrigenId?: Id<"facturacionAsignaciones">;
    causacionCambio?: NonNullable<Doc<"facturacionAprobaciones">["causacionCambio"]>;
  }
) {
  const empresa = normalizeEmpresa(tarea.empresa);
  const asignacion = await escogerUsuarioRechazosDian(ctx, empresa);
  const grupoId = createGroupId("pendiente_rechazar_dian", tarea.facturaId);
  const asignacionId = await insertarAsignacion(ctx, {
    facturaId: tarea.facturaId,
    tareaId: tarea._id,
    empresa,
    fase: "pendiente_rechazar_dian",
    rol: "rechazos_dian",
    grupoId,
    usuario: {
      usuarioId: asignacion.asignadoAUserId,
      nombre: asignacion.asignadoANombre,
      email: asignacion.asignadoAEmail,
    },
    metadata: {
      origen: "rechazo_dian",
      tipo: "solicitud_rechazo_dian",
      motivo: actor.comentario,
      ...(actor.asignacionOrigenId ? { asignacionOrigenId: actor.asignacionOrigenId } : {}),
    },
  });

  await registrarAprobacion(ctx, {
    tareaId: tarea._id,
    facturaId: tarea.facturaId,
    asignacionId: actor.asignacionOrigenId,
    empresa,
    actorUserId: actor.actorUserId,
    actorNombre: actor.actorNombre,
    actorEmail: actor.actorEmail,
    accion: "solicitar_rechazo_dian",
    comentario: actor.comentario,
    estadoAnterior: tarea.estado,
    estadoNuevo: "pendiente_rechazar_dian",
    ...(actor.causacionCambio ? { causacionCambio: actor.causacionCambio } : {}),
  });

  await patchTareaEstado(ctx, tarea, "pendiente_rechazar_dian", {
    asignadoAUserId: asignacion.asignadoAUserId,
    asignadoANombre: asignacion.asignadoANombre,
    asignadoAEmail: asignacion.asignadoAEmail,
    grupoAsignacionActualId: grupoId,
    currentAsignacionId: asignacionId,
  });
}

async function solicitarRechazoDianDesdeAsignacion(
  ctx: MutationCtx,
  args: {
    asignacion: Doc<"facturacionAsignaciones">;
    tarea: Doc<"facturacionTareas">;
    empresa: number;
    actorUserId?: string;
    actorNombre: string;
    actorEmail: string;
    comentario: string;
  }
) {
  const { asignacion, tarea, empresa } = args;
  if (isEstadoTerminalFacturacion(tarea.estado)) {
    throw new Error("La factura ya está cerrada.");
  }
  if (tarea.estado === "pendiente_nota_credito") {
    throw new Error("La factura ya está pendiente de nota crédito.");
  }
  if (tarea.estado === "pendiente_rechazar_dian") {
    throw new Error("La factura ya está asignada para rechazo DIAN.");
  }

  await revertirLegalizacionesCajaMenorFactura(ctx, tarea.facturaId, Date.now());
  await anularMovimientosCajaMenorFacturaInterno(
    ctx,
    tarea.facturaId,
    {
      actorUserId: args.actorUserId,
      actorNombre: args.actorNombre,
      actorEmail: args.actorEmail,
    },
    args.comentario
  );
  await cerrarAsignacion(ctx, asignacion, "rechazada", args.comentario, {
    origen: "rechazo_dian",
    tipo: "solicitud_rechazo_dian",
    motivo: args.comentario,
  });
  await cancelarPendientesDelGrupo(ctx, asignacion.grupoId, asignacion._id, {
    tareaId: tarea._id,
    facturaId: tarea.facturaId,
    empresa,
    actorUserId: args.actorUserId,
    actorNombre: args.actorNombre,
    actorEmail: args.actorEmail,
    estadoAnterior: tarea.estado,
    estadoNuevo: "pendiente_rechazar_dian",
  });

  await crearAsignacionRechazosDian(ctx, tarea, {
    actorUserId: args.actorUserId,
    actorNombre: args.actorNombre,
    actorEmail: args.actorEmail,
    comentario: args.comentario,
    asignacionOrigenId: asignacion._id,
  });
}

async function confirmarRechazoDian(
  ctx: MutationCtx,
  args: {
    tarea: Doc<"facturacionTareas">;
    asignacion?: Doc<"facturacionAsignaciones">;
    empresa: number;
    actorUserId?: string;
    actorNombre: string;
    actorEmail: string;
    comentario: string;
  }
) {
  const { tarea, asignacion } = args;
  if (tarea.estado !== "pendiente_rechazar_dian") {
    throw new Error("La factura no está pendiente de confirmar rechazo DIAN.");
  }
  const factura = await ctx.db.get("facturacionFacturas", tarea.facturaId);
  if (!factura) throw new Error("Factura no encontrada.");
  if (getDocumentoClaseFacturacion(factura) !== "factura") {
    throw new Error("Solo una factura puede confirmarse como rechazo DIAN.");
  }

  if (asignacion) {
    if (asignacion.fase !== "pendiente_rechazar_dian" || asignacion.estado !== "pendiente") {
      throw new Error("La asignación ya no está pendiente de rechazo DIAN.");
    }
    await cerrarAsignacion(ctx, asignacion, "completada", args.comentario, {
      origen: "rechazo_dian",
      tipo: "confirmacion_rechazo_dian",
    });
    await cancelarPendientesDelGrupo(ctx, asignacion.grupoId, asignacion._id, {
      tareaId: tarea._id,
      facturaId: tarea.facturaId,
      empresa: args.empresa,
      actorUserId: args.actorUserId,
      actorNombre: args.actorNombre,
      actorEmail: args.actorEmail,
      estadoAnterior: tarea.estado,
      estadoNuevo: "rechazada_dian",
    });
  }

  await registrarAprobacion(ctx, {
    tareaId: tarea._id,
    facturaId: tarea.facturaId,
    asignacionId: asignacion?._id,
    empresa: args.empresa,
    actorUserId: args.actorUserId,
    actorNombre: args.actorNombre,
    actorEmail: args.actorEmail,
    accion: "confirmar_rechazo_dian",
    comentario: args.comentario,
    estadoAnterior: tarea.estado,
    estadoNuevo: "rechazada_dian",
  });

  await patchTareaEstado(ctx, tarea, "rechazada_dian", {
    asignadoAUserId: undefined,
    asignadoANombre: "Rechazada DIAN",
    asignadoAEmail: "sin-asignar@example.com",
    grupoAsignacionActualId: undefined,
    currentAsignacionId: undefined,
  });

  await programarNotificacionEstadoTerminal(ctx, tarea, "rechazada_dian", args.comentario);
}

function usuarioHistoricoParaFase(
  tarea: Doc<"facturacionTareas">,
  fase: FaseAsignacion
): UsuarioConfig | null {
  const map: Partial<
    Record<
      FaseAsignacion,
      {
        usuarioId?: string;
        nombre?: string;
        email?: string;
        procesoId?: number;
        procesoNombre?: string;
      }
    >
  > = {
    revision_lider: {
      usuarioId: tarea.liderProcesoUserId,
      nombre: tarea.liderProcesoNombre,
      email: tarea.liderProcesoEmail,
      procesoId: tarea.liderProcesoProcesoId,
      procesoNombre: tarea.liderProcesoProcesoNombre,
    },
    jefe_directo: {
      usuarioId: tarea.jefeDirectoAsignadoAUserId,
      nombre: tarea.jefeDirectoAsignadoANombre,
      email: tarea.jefeDirectoAsignadoAEmail,
    },
    causacion: {
      usuarioId: tarea.causacionAsignadoAUserId,
      nombre: tarea.causacionAsignadoANombre,
      email: tarea.causacionAsignadoAEmail,
    },
    revision_impuestos: {
      usuarioId: tarea.contadorAsignadoAUserId,
      nombre: tarea.contadorAsignadoANombre,
      email: tarea.contadorAsignadoAEmail,
    },
    eventos_dian: {
      usuarioId: tarea.eventosDianAsignadoAUserId,
      nombre: tarea.eventosDianAsignadoANombre,
      email: tarea.eventosDianAsignadoAEmail,
    },
    gerencia: {
      usuarioId: tarea.gerenciaAsignadoAUserId,
      nombre: tarea.gerenciaAsignadoANombre,
      email: tarea.gerenciaAsignadoAEmail,
    },
    revision_tesoreria: {
      usuarioId: tarea.tesoreroAsignadoAUserId,
      nombre: tarea.tesoreroAsignadoANombre,
      email: tarea.tesoreroAsignadoAEmail,
    },
  };
  const usuario = map[fase];
  if (!usuario?.nombre || !usuario.email) return null;
  return {
    usuarioId: usuario.usuarioId,
    nombre: usuario.nombre,
    email: normalizeEmail(usuario.email),
    procesoId: usuario.procesoId,
    procesoNombre: sanitizeProcesoNombre(usuario.procesoNombre),
  };
}

async function crearDevolucionAFase(
  ctx: MutationCtx,
  args: {
    tarea: Doc<"facturacionTareas">;
    asignacionOrigen: Doc<"facturacionAsignaciones">;
    faseDestino: FaseAsignacion;
    actorUserId: string;
    comentario: string;
    responsableOverride?: UsuarioConfig;
    causacionCambio?: NonNullable<Doc<"facturacionAprobaciones">["causacionCambio"]>;
  }
) {
  const { tarea, asignacionOrigen, faseDestino } = args;
  const actorUserId = args.actorUserId?.trim();
  if (!actorUserId) {
    throw new Error("No se pudo identificar al usuario que devuelve la factura.");
  }
  const empresa = normalizeEmpresa(tarea.empresa);
  const grupoId = createGroupId(faseDestino, tarea.facturaId);
  const metadata = {
    origen: "devolucion",
    devueltaDesde: asignacionOrigen.fase,
    devueltaHacia: faseDestino,
    motivo: args.comentario,
    asignacionOrigenId: asignacionOrigen._id,
  };

  await cerrarAsignacion(ctx, asignacionOrigen, "devuelta", args.comentario, metadata);
  await cancelarPendientesDelGrupo(ctx, asignacionOrigen.grupoId, asignacionOrigen._id, {
    tareaId: tarea._id,
    facturaId: tarea.facturaId,
    empresa,
    actorUserId,
    estadoAnterior: tarea.estado,
    estadoNuevo: faseDestino,
  });

  await aplicarAsignacionesDevolucionAFase(ctx, {
    tarea,
    faseDestino,
    empresa,
    grupoId,
    metadata,
    asignacionOrigen,
    responsableOverride: args.responsableOverride,
  });

  await registrarAprobacion(ctx, {
    tareaId: tarea._id,
    facturaId: tarea.facturaId,
    asignacionId: asignacionOrigen._id,
    empresa,
    actorUserId,
    accion: "devolver_fase",
    comentario: args.comentario,
    estadoAnterior: tarea.estado,
    estadoNuevo: faseDestino,
    ...(args.causacionCambio ? { causacionCambio: args.causacionCambio } : {}),
  });
}

async function resolverUltimaAsignacionReferencia(
  ctx: FacturacionCtx,
  tarea: Doc<"facturacionTareas">
) {
  const asignaciones = await ctx.db
    .query("facturacionAsignaciones")
    .withIndex("by_tareaId", (q) => q.eq("tareaId", tarea._id))
    .collect();

  return [...asignaciones].sort((left, right) => right.creadoEn - left.creadoEn)[0] ?? null;
}

async function resolverEstadoAnteriorHistoricoTerminal(
  ctx: FacturacionCtx,
  tareaId: Id<"facturacionTareas">,
  estadoActual: string
) {
  if (!isEstadoTerminalDevolucion(estadoActual)) return null;

  const eventos = await ctx.db
    .query("facturacionAprobaciones")
    .withIndex("by_tareaId", (q) => q.eq("tareaId", tareaId))
    .collect();

  const reciente = eventos
    .filter((evento) => evento.estadoNuevo === estadoActual)
    .sort((left, right) => right.creadoEn - left.creadoEn)[0];

  return reciente?.estadoAnterior ?? null;
}

async function crearReaperturaDesdeEstado(
  ctx: MutationCtx,
  args: {
    tarea: Doc<"facturacionTareas">;
    faseDestino: FaseAsignacion;
    actorUserId: string;
    comentario: string;
    responsableOverride?: UsuarioConfig;
    asignacionReferencia?: Doc<"facturacionAsignaciones"> | null;
  }
) {
  const { tarea, faseDestino } = args;
  const estadoAnterior = tarea.estado;
  const empresa = normalizeEmpresa(tarea.empresa);
  const asignacionReferencia =
    args.asignacionReferencia ??
    (tarea.currentAsignacionId ? await ctx.db.get("facturacionAsignaciones", tarea.currentAsignacionId) : null) ??
    (await resolverUltimaAsignacionReferencia(ctx, tarea));
  const grupoId = createGroupId(faseDestino, tarea.facturaId);
  const metadata = {
    origen: "devolucion",
    devueltaDesde: estadoAnterior,
    devueltaHacia: faseDestino,
    motivo: args.comentario,
    reaperturaDesdeEstado: true,
    ...(asignacionReferencia ? { asignacionOrigenId: asignacionReferencia._id } : {}),
  };

  await aplicarAsignacionesDevolucionAFase(ctx, {
    tarea,
    faseDestino,
    empresa,
    grupoId,
    metadata,
    asignacionOrigen: asignacionReferencia ?? undefined,
    responsableOverride: args.responsableOverride,
    limpiarFinalizadoEn: true,
  });

  await registrarAprobacion(ctx, {
    tareaId: tarea._id,
    facturaId: tarea.facturaId,
    asignacionId: asignacionReferencia?._id,
    empresa,
    actorUserId: args.actorUserId,
    accion: "devolver_fase",
    comentario: args.comentario,
    estadoAnterior,
    estadoNuevo: faseDestino,
  });
}

async function aplicarAsignacionesDevolucionAFase(
  ctx: MutationCtx,
  args: {
    tarea: Doc<"facturacionTareas">;
    faseDestino: FaseAsignacion;
    empresa: number;
    grupoId: string;
    metadata: Record<string, unknown>;
    asignacionOrigen?: Doc<"facturacionAsignaciones">;
    responsableOverride?: UsuarioConfig;
    limpiarFinalizadoEn?: boolean;
  }
) {
  const { tarea, faseDestino, empresa, grupoId, metadata } = args;

  if (faseDestino === "recepcion") {
    const recepcionUsuarios = await getRecepcionUsuarios(ctx, empresa);
    const ids: Id<"facturacionAsignaciones">[] = [];
    for (const usuario of recepcionUsuarios) {
      ids.push(
        await insertarAsignacion(ctx, {
          facturaId: tarea.facturaId,
          tareaId: tarea._id,
          empresa,
          fase: "recepcion",
          rol: "recepcion",
          grupoId,
          usuario,
          metadata,
        })
      );
    }
    const first = recepcionUsuarios[0];
    await patchTareaEstado(ctx, tarea, "recepcion", {
      ...(args.limpiarFinalizadoEn ? { finalizadoEn: undefined } : {}),
      grupoAsignacionActualId: grupoId,
      currentAsignacionId: ids[0],
      asignadoAUserId: first.usuarioId,
      asignadoANombre:
        recepcionUsuarios.length === 1
          ? first.nombre
          : `${recepcionUsuarios.length} recepción asignados`,
      asignadoAEmail: normalizeEmail(first.email),
    });
    return;
  }

  if (faseDestino === "revision_lider") {
    let remitente = args.asignacionOrigen
      ? await resolverRemitenteLiderDevolucion(ctx, tarea, args.asignacionOrigen)
      : usuarioHistoricoParaFase(tarea, "revision_lider");
    if (!remitente && args.responsableOverride) {
      await validarResponsableDevolucion(ctx, empresa, "revision_lider", args.responsableOverride);
      remitente = args.responsableOverride;
    }
    if (!remitente) {
      throw new Error("No hay responsable histórico para devolver a esa fase.");
    }
    const legalizacionesActivas = await listarLegalizacionesActivasFactura(ctx, tarea.facturaId);
    const metadataDevolucionLider = {
      ...metadata,
      ...(legalizacionesActivas.length > 0
        ? {
            anticipoCruceReabierto: true,
            legalizacionIds: legalizacionesActivas.map((row) => row._id),
          }
        : {}),
    };
    await recrearAsignacionesLideres(ctx, {
      tarea,
      empresa,
      grupoId,
      lideres: [remitente],
      metadata: metadataDevolucionLider,
    });
    if (args.limpiarFinalizadoEn) {
      await ctx.db.patch("facturacionTareas", tarea._id, { finalizadoEn: undefined, actualizadoEn: Date.now() });
      await refrescarProyeccionFactura(ctx, tarea.facturaId, Date.now());
    }
    return;
  }

  let usuario = usuarioHistoricoParaFase(tarea, faseDestino);
  if (!usuario && args.responsableOverride) {
    await validarResponsableDevolucion(ctx, empresa, faseDestino, args.responsableOverride);
    usuario = args.responsableOverride;
  }
  if (!usuario && faseDestino === "gerencia") {
    usuario = await getGerenciaDefault(ctx, empresa);
  }
  if (!usuario) {
    throw new Error("No hay responsable histórico para devolver a esa fase.");
  }

  const rolPorFase: Partial<Record<FaseAsignacion, RolAsignacion>> = {
    recepcion: "recepcion",
    revision_lider: "lider",
    jefe_directo: "jefe_directo",
    causacion: "analista_causacion",
    revision_impuestos: "contador_impuestos",
    eventos_dian: "eventos_dian",
    pendiente_rechazar_dian: "rechazos_dian",
    gerencia: "gerencia",
    revision_tesoreria: "tesorero",
  };
  const rol = rolPorFase[faseDestino];
  if (!rol) {
    throw new Error("No se puede devolver a esa fase.");
  }
  const asignacionId = await insertarAsignacion(ctx, {
    facturaId: tarea.facturaId,
    tareaId: tarea._id,
    empresa,
    fase: faseDestino,
    rol,
    grupoId,
    usuario,
    metadata,
  });

  await patchTareaEstado(ctx, tarea, faseDestino, {
    ...(args.limpiarFinalizadoEn ? { finalizadoEn: undefined } : {}),
    grupoAsignacionActualId: grupoId,
    currentAsignacionId: asignacionId,
    asignadoAUserId: usuario.usuarioId,
    asignadoANombre: usuario.nombre,
    asignadoAEmail: normalizeEmail(usuario.email),
  });
}

async function actualizarProgresoLideres(
  ctx: MutationCtx,
  tareaId: Id<"facturacionTareas">,
  grupoId: string,
  options?: {
    preferUserId?: string;
    preferEmail?: string;
  }
) {
  const asignaciones = await ctx.db
    .query("facturacionAsignaciones")
    .withIndex("by_grupoId", (q) => q.eq("grupoId", grupoId))
    .collect();
  const relevantes = asignaciones.filter(
    (item) =>
      item.fase === "revision_lider" && item.estado !== "reasignada" && item.estado !== "cancelada"
  );
  const completadas = relevantes.filter((item) => item.estado === "completada");
  const pendientes = relevantes.filter((item) => item.estado === "pendiente");

  const patch: Partial<Doc<"facturacionTareas">> = {
    lideresTotal: relevantes.length,
    lideresCompletados: completadas.length,
    actualizadoEn: Date.now(),
  };

  if (pendientes.length > 0) {
    const tarea = await ctx.db.get("facturacionTareas", tareaId);
    if (tarea) {
      const current = tarea.currentAsignacionId
        ? await ctx.db.get("facturacionAsignaciones", tarea.currentAsignacionId)
        : null;
      const currentEsPendienteValido =
        current &&
        current.grupoId === grupoId &&
        current.fase === "revision_lider" &&
        current.estado === "pendiente";

      if (!currentEsPendienteValido) {
        const next = seleccionarAsignacionPendiente(
          pendientes,
          options?.preferUserId,
          options?.preferEmail
        );
        patch.currentAsignacionId = next._id;
        patch.asignadoAUserId = next.asignadoAUserId;
        patch.asignadoANombre =
          pendientes.length === 1
            ? next.asignadoANombre
            : `${pendientes.length} líderes pendientes`;
        patch.asignadoAEmail = normalizeEmail(next.asignadoAEmail);
      }
    }
  }

  await ctx.db.patch("facturacionTareas", tareaId, patch);

  return { relevantes, completadas, pendientes };
}

function usuarioKey(usuario: Pick<UsuarioConfig, "usuarioId" | "email">) {
  return usuario.usuarioId ?? normalizeEmail(usuario.email);
}

async function validarParMismaFase(
  ctx: MutationCtx,
  empresa: number,
  fase: FaseAsignacion,
  usuario: UsuarioConfig
) {
  if (fase === "causacion") {
    const analistas = await getUsuariosPonderadosConfigurados(ctx, empresa, "analista_causacion");
    const valido = analistas.some((analista) => usuariosCoincidenPorIdentidad(analista, usuario));
    if (!valido) {
      throw new Error("Selecciona un analista de causación configurado para esta empresa.");
    }
    return;
  }

  if (fase === "revision_impuestos") {
    const contadores = await getContadoresImpuestos(ctx, empresa);
    const valido = contadores.some((contador) => usuariosCoincidenPorIdentidad(contador, usuario));
    if (!valido) {
      throw new Error("Selecciona un usuario de contabilidad configurado para esta empresa.");
    }
    return;
  }

  if (fase === "eventos_dian") {
    const usuarios = await getEventosDianUsuarios(ctx, empresa);
    const valido = usuarios.some((row) => usuariosCoincidenPorIdentidad(row, usuario));
    if (!valido) {
      throw new Error("Selecciona un usuario de Eventos DIAN configurado para esta empresa.");
    }
    return;
  }

  if (fase === "pendiente_rechazar_dian") {
    const usuarios = await getUsuariosPonderadosConfigurados(ctx, empresa, "rechazos_dian");
    const valido = usuarios.some((row) => usuariosCoincidenPorIdentidad(row, usuario));
    if (!valido) {
      throw new Error("Selecciona un usuario de Rechazos DIAN configurado para esta empresa.");
    }
    return;
  }

  if (fase === "gerencia") {
    const gerencias = await getGerenciasConfiguradas(ctx, empresa);
    const usuarioId = usuario.usuarioId?.trim();
    if (!usuarioId) {
      throw new Error("Selecciona un usuario de Gerencia válido.");
    }
    const valido = gerencias.some((row) => usuariosCoincidenPorId(row, { usuarioId }));
    if (!valido) {
      throw new Error("Selecciona un usuario de Gerencia configurado para esta empresa.");
    }
    return;
  }

  throw new Error("Esta fase no admite transferencia horizontal entre pares.");
}

async function validarResponsableDevolucion(
  ctx: MutationCtx,
  empresa: number,
  fase: FaseAsignacion,
  usuario: UsuarioConfig
) {
  if (fase === "revision_tesoreria") {
    const usuarios = await getTesoreriaUsuarios(ctx, empresa);
    const valido = usuarios.some((row) => usuariosCoincidenPorIdentidad(row, usuario));
    if (!valido) {
      throw new Error("Selecciona un tesorero configurado para esta empresa.");
    }
    return;
  }

  if (fase === "revision_lider") {
    if (!usuario.nombre?.trim() || !usuario.email?.trim()) {
      throw new Error("Selecciona un líder válido para esta devolución.");
    }
    return;
  }

  if (fase === "recepcion") {
    const recepcion = await getRecepcionUsuarios(ctx, empresa);
    const valido = recepcion.some((row) => usuariosCoincidenPorIdentidad(row, usuario));
    if (!valido) {
      throw new Error("Selecciona un usuario de recepción configurado para esta empresa.");
    }
    return;
  }

  await validarParMismaFase(ctx, empresa, fase, usuario);
}

async function resolverResponsableHistoricoDevolucion(
  ctx: FacturacionCtx,
  tarea: Doc<"facturacionTareas">,
  empresa: number,
  faseDestino: FaseDevolucionDestino
): Promise<UsuarioConfig | null> {
  if (faseDestino === "recepcion") {
    return null;
  }

  if (faseDestino === "revision_lider") {
    return usuarioHistoricoParaFase(tarea, "revision_lider");
  }

  let historico = usuarioHistoricoParaFase(tarea, faseDestino);
  if (!historico && faseDestino === "gerencia") {
    try {
      historico = await getGerenciaDefault(ctx as MutationCtx, empresa);
    } catch {
      historico = null;
    }
  }
  return historico;
}

async function listarCandidatosDevolucionFase(
  ctx: FacturacionCtx,
  empresa: number,
  faseDestino: FaseDevolucionDestino
): Promise<UsuarioConfig[]> {
  switch (faseDestino) {
    case "recepcion":
      try {
        return await getRecepcionUsuarios(ctx as MutationCtx, empresa);
      } catch {
        return [];
      }
    case "revision_lider":
      return [];
    case "causacion":
      return await getUsuariosPonderadosConfigurados(ctx, empresa, "analista_causacion");
    case "revision_impuestos":
      try {
        return await getContadoresImpuestos(ctx as MutationCtx, empresa);
      } catch {
        return [];
      }
    case "eventos_dian":
      try {
        return await getEventosDianUsuarios(ctx as MutationCtx, empresa);
      } catch {
        return [];
      }
    case "gerencia":
      return await getGerenciasConfiguradas(ctx as MutationCtx, empresa);
    case "revision_tesoreria":
      return await getTesoreriaUsuarios(ctx, empresa);
    default:
      return [];
  }
}

function serializarUsuarioDevolucion(usuario: UsuarioConfig) {
  return {
    ...(usuario.usuarioId ? { usuarioId: usuario.usuarioId } : {}),
    nombre: usuario.nombre,
    email: normalizeEmail(usuario.email),
    ...(usuario.procesoId !== undefined ? { procesoId: usuario.procesoId } : {}),
    ...(usuario.procesoNombre ? { procesoNombre: usuario.procesoNombre } : {}),
  };
}

async function construirDestinosDevolucionContexto(
  ctx: FacturacionCtx,
  tarea: Doc<"facturacionTareas">,
  estadoActual: string,
  faseOrigenResuelta: FaseDevolucionDestino | null
) {
  const empresa = normalizeEmpresa(tarea.empresa);
  const destinos = [];

  for (const destino of getDevolucionDestinos(estadoActual, faseOrigenResuelta)) {
    const historico = await resolverResponsableHistoricoDevolucion(
      ctx,
      tarea,
      empresa,
      destino.fase
    );
    const candidatos = historico
      ? []
      : await listarCandidatosDevolucionFase(ctx, empresa, destino.fase);
    destinos.push({
      fase: destino.fase,
      label: destino.label,
      responsableHistorico: historico ? serializarUsuarioDevolucion(historico) : null,
      candidatos: candidatos.map(serializarUsuarioDevolucion),
      requiereSeleccionResponsable:
        destino.fase !== "recepcion" && !historico && candidatos.length > 0,
    });
  }

  return destinos;
}

async function resolverAsignacionActivaDevolucion(
  ctx: FacturacionCtx,
  tarea: Doc<"facturacionTareas">
) {
  if (requiereReaperturaSinAsignacionActiva(tarea.estado)) return null;

  const asignaciones = await ctx.db
    .query("facturacionAsignaciones")
    .withIndex("by_tareaId", (q) => q.eq("tareaId", tarea._id))
    .collect();

  const pendientes = asignaciones.filter(
    (asignacion) =>
      asignacion.estado === "pendiente" &&
      asignacion.fase === tarea.estado &&
      (!tarea.grupoAsignacionActualId || asignacion.grupoId === tarea.grupoAsignacionActualId)
  );

  if (tarea.currentAsignacionId) {
    const current = asignaciones.find((row) => row._id === tarea.currentAsignacionId);
    if (current && current.estado === "pendiente" && current.fase === tarea.estado) {
      return current;
    }
  }

  return [...pendientes].sort((left, right) => left.creadoEn - right.creadoEn)[0] ?? null;
}

async function recrearAsignacionesLideres(
  ctx: MutationCtx,
  args: {
    tarea: Doc<"facturacionTareas">;
    empresa: number;
    grupoId: string;
    lideres: UsuarioConfig[];
    metadata?: unknown;
  }
) {
  const assignmentIds: Id<"facturacionAsignaciones">[] = [];
  for (const lider of args.lideres) {
    assignmentIds.push(
      await insertarAsignacion(ctx, {
        facturaId: args.tarea.facturaId,
        tareaId: args.tarea._id,
        empresa: args.empresa,
        fase: "revision_lider",
        rol: "lider",
        grupoId: args.grupoId,
        usuario: lider,
        metadata: args.metadata,
      })
    );
  }

  const first = args.lideres[0];
  await ctx.db.patch("facturacionTareas", args.tarea._id, {
    estado: "revision_lider",
    grupoAsignacionActualId: args.grupoId,
    currentAsignacionId: assignmentIds[0],
    lideresTotal: args.lideres.length,
    lideresCompletados: 0,
    asignadoAUserId: first.usuarioId,
    asignadoANombre:
      args.lideres.length === 1 ? first.nombre : `${args.lideres.length} líderes asignados`,
    asignadoAEmail: first.email,
    liderProcesoUserId: first.usuarioId,
    liderProcesoNombre:
      args.lideres.length === 1 ? first.nombre : `${args.lideres.length} líderes asignados`,
    liderProcesoEmail: first.email,
    liderProcesoProcesoId: first.procesoId,
    liderProcesoProcesoNombre: sanitizeProcesoNombre(first.procesoNombre),
    actualizadoEn: Date.now(),
  });
}

function toNotaCreditoRelacionItem(factura: Doc<"facturacionFacturas">) {
  return {
    facturaId: factura._id,
    numeroFactura: factura.numeroFactura,
    total: factura.total,
    moneda: factura.moneda,
  };
}

async function findFacturaOrigenParaNotaCreditoResumen(
  ctx: QueryCtx,
  nota: Doc<"facturacionFacturas">
) {
  const efectiva = await resolveRelacionEfectiva(ctx, nota, {
    permitirPeajes: false,
  });
  return efectiva.factura;
}

async function buildNotaCreditoRelacionResumen(
  ctx: QueryCtx,
  factura: Doc<"facturacionFacturas">
): Promise<NotaCreditoRelacionResumen | null> {
  if (isFacturaPeajes(factura) || isNotaCreditoPeajes(factura)) return null;

  const clase = getDocumentoClaseFacturacion(factura);
  if (clase === "nota_credito") {
    const facturaOrigen = await findFacturaOrigenParaNotaCreditoResumen(ctx, factura);
    return {
      tipo: "nota_credito",
      cantidadNotasCredito: 1,
      valorNotasCredito: factura.total,
      notasCredito: [toNotaCreditoRelacionItem(factura)],
      ...(facturaOrigen ? { facturaOrigen: toNotaCreditoRelacionItem(facturaOrigen) } : {}),
    };
  }

  if (clase !== "factura") return null;

  const notasDocs = await listNotasCreditoRelacionadasAFactura(ctx, factura, {
    incluirPeajes: false,
  });
  const notasCredito = notasDocs.map(toNotaCreditoRelacionItem);
  if (notasCredito.length === 0) return null;

  return {
    tipo: "factura",
    cantidadNotasCredito: notasCredito.length,
    valorNotasCredito: notasCredito.reduce((total, nota) => total + nota.total, 0),
    notasCredito,
    facturaOrigen: toNotaCreditoRelacionItem(factura),
  };
}

export const listar = query({
  args: {
    estado: v.optional(estadoTareaValidator),
    asignadoAUserId: v.optional(v.string()),
    asignadoAEmail: v.optional(v.string()),
    empresa: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 200;
    let tareas: Doc<"facturacionTareas">[];

    if (typeof args.empresa === "number" && args.estado) {
      tareas = await ctx.db
        .query("facturacionTareas")
        .withIndex("by_empresa_estado", (q) =>
          q.eq("empresa", args.empresa).eq("estado", args.estado!)
        )
        .order("desc")
        .take(limit);
    } else if (args.estado) {
      tareas = await ctx.db
        .query("facturacionTareas")
        .withIndex("by_estado", (q) => q.eq("estado", args.estado!))
        .order("desc")
        .take(limit);
    } else if (args.asignadoAUserId) {
      tareas = await ctx.db
        .query("facturacionTareas")
        .withIndex("by_asignadoAUserId", (q) => q.eq("asignadoAUserId", args.asignadoAUserId))
        .order("desc")
        .take(limit);
    } else if (args.asignadoAEmail) {
      tareas = await ctx.db
        .query("facturacionTareas")
        .withIndex("by_asignadoAEmail", (q) =>
          q.eq("asignadoAEmail", normalizeEmail(args.asignadoAEmail!))
        )
        .order("desc")
        .take(limit);
    } else if (typeof args.empresa === "number") {
      tareas = await ctx.db
        .query("facturacionTareas")
        .withIndex("by_empresa", (q) => q.eq("empresa", args.empresa))
        .order("desc")
        .take(limit);
    } else {
      tareas = await ctx.db.query("facturacionTareas").order("desc").take(limit);
    }

    return await Promise.all(
      tareas.map(async (tarea) => {
        const factura = await ctx.db.get("facturacionFacturas", tarea.facturaId);
        return {
          ...tarea,
          factura,
          notaCreditoRelacion: factura ? await buildNotaCreditoRelacionResumen(ctx, factura) : null,
        };
      })
    );
  },
});

export const resumenParaBuzon = query({
  args: {
    asignadoAUserId: v.string(),
    empresa: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await collectAsignacionesBuzonResumen(ctx, args.asignadoAUserId, args.empresa);
  },
});

export const listarParaBuzon = query({
  args: {
    asignadoAUserId: v.string(),
    empresa: v.optional(v.number()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const paginationOpts = {
      ...args.paginationOpts,
      numItems: Math.min(args.paginationOpts.numItems, BUZON_QUERY_PAGE_CAP),
    };
    const asignacionesPage = await queryAsignacionesPendientesBuzon(
      ctx,
      args.asignadoAUserId,
      args.empresa
    )
      .order("desc")
      .paginate(paginationOpts);

    const page = await Promise.all(
      asignacionesPage.page.map((asignacion) => mapAsignacionParaBuzon(ctx, asignacion))
    );

    return {
      ...asignacionesPage,
      page: page.filter(isPresent),
    };
  },
});

export const obtenerLegalizacionAnticiposFactura = query({
  args: {
    facturaId: v.id("facturacionFacturas"),
  },
  handler: async (ctx, args) => {
    const factura = await ctx.db.get("facturacionFacturas", args.facturaId);
    if (!factura) return null;

    const tarea = await ctx.db
      .query("facturacionTareas")
      .withIndex("by_facturaId", (q) => q.eq("facturaId", args.facturaId))
      .unique();
    const legalizaciones = await listarLegalizacionesActivasFactura(ctx, args.facturaId);
    const legalizacionesDetalle = await Promise.all(
      legalizaciones.map(async (legalizacion) => ({
        ...legalizacion,
        anticipo: await ctx.db.get("anticipos", legalizacion.anticipoId),
      }))
    );
    const aplicadoPorAnticipo = new Map<string, number>(
      legalizaciones.map((row) => [String(row.anticipoId), row.valorAplicado])
    );
    const empresa = normalizeEmpresa(factura.empresa);

    const anticiposDeBolsa = await obtenerAnticiposParaBolsaFactura(ctx, factura);

    const faltantesActuales = await Promise.all(
      legalizaciones
        .filter(
          (row) =>
            !anticiposDeBolsa.some((anticipo) => String(anticipo._id) === String(row.anticipoId))
        )
        .map((row) => ctx.db.get("anticipos", row.anticipoId))
    );

    const anticiposMap = new Map<string, Doc<"anticipos">>();
    for (const anticipo of [...anticiposDeBolsa, ...faltantesActuales]) {
      if (anticipo) {
        anticiposMap.set(String(anticipo._id), anticipo);
      }
    }

    const anticipos = Array.from(anticiposMap.values())
      .filter((anticipo) => {
        const aplicadoEnFactura = aplicadoPorAnticipo.has(String(anticipo._id));
        return (
          normalizeEmpresa(anticipo.empresa_id ?? anticipo.empresa) === empresa &&
          (isAnticipoPendienteLegalizacion(anticipo) || aplicadoEnFactura)
        );
      })
      .map((anticipo) => {
        const aplicadoEnFactura = aplicadoPorAnticipo.get(String(anticipo._id)) ?? 0;
        const valorLegalizado = getSaldoLegalizadoAnticipo(anticipo);
        const pendiente = getSaldoPendienteAnticipo(anticipo);
        const disponibleParaFactura = pendiente + aplicadoEnFactura;
        return {
          ...anticipo,
          valorLegalizado,
          pendienteLegalizar: pendiente,
          aplicadoEnFactura,
          disponibleParaFactura,
        };
      })
      .filter((anticipo) => anticipo.disponibleParaFactura > 0 || anticipo.aplicadoEnFactura > 0)
      .sort((a, b) => a.consecutivo - b.consecutivo);

    const valorLegalizable = await obtenerValorLegalizableFactura(ctx, factura);
    const notasCreditoPeajes = await obtenerNotasCreditoPeajesFactura(ctx, factura);
    const valorAplicadoFactura = legalizaciones.reduce(
      (total, row) => total + row.valorAplicado,
      0
    );
    const totalPendienteDisponible = anticipos.reduce(
      (total, anticipo) => total + anticipo.disponibleParaFactura,
      0
    );

    return {
      factura,
      tarea,
      legalizaciones,
      legalizacionesDetalle,
      anticipos,
      notasCreditoPeajes,
      totales: {
        valorFactura: valorLegalizable,
        valorBrutoFactura: factura.total,
        valorNotasCredito: notasCreditoPeajes.reduce((total, nota) => total + nota.total, 0),
        valorAplicadoFactura,
        pendienteDisponible: totalPendienteDisponible,
        diferenciaNoCubierta: Math.max(valorLegalizable - valorAplicadoFactura, 0),
        valorSolicitado: anticipos.reduce(
          (total, anticipo) => total + getValorContableAnticipo(anticipo),
          0
        ),
        valorLegalizado: anticipos.reduce((total, anticipo) => total + anticipo.valorLegalizado, 0),
      },
    };
  },
});

export const obtenerResumenCrucesAnticiposFacturas = query({
  args: {
    facturaIds: v.array(v.id("facturacionFacturas")),
  },
  handler: async (ctx, args) => {
    const uniqueFacturaIds: Id<"facturacionFacturas">[] = [];
    const seen = new Set<string>();
    for (const facturaId of args.facturaIds) {
      const key = String(facturaId);
      if (seen.has(key)) continue;
      seen.add(key);
      uniqueFacturaIds.push(facturaId);
    }

    return await Promise.all(
      uniqueFacturaIds.map(async (facturaId) => {
        const factura = await ctx.db.get("facturacionFacturas", facturaId);
        const legalizaciones = await listarLegalizacionesActivasFactura(ctx, facturaId);
        const valorAplicado = legalizaciones.reduce(
          (total, legalizacion) => total + legalizacion.valorAplicado,
          0
        );
        const valorLegalizable = factura ? await obtenerValorLegalizableFactura(ctx, factura) : 0;
        const diferenciaNoCubierta = Math.max(valorLegalizable - valorAplicado, 0);
        const cubiertaTotal = anticipoCruceCubiertoTotalmente(valorAplicado, valorLegalizable);
        return {
          facturaId,
          legalizacionesCount: legalizaciones.length,
          valorAplicado,
          valorLegalizable,
          diferenciaNoCubierta,
          cubiertaTotal,
        };
      })
    );
  },
});

export const obtenerLegalizacionCajaMenorFactura = query({
  args: {
    facturaId: v.id("facturacionFacturas"),
    actorUserId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const factura = await ctx.db.get("facturacionFacturas", args.facturaId);
    if (!factura) return null;
    const tarea = await ctx.db
      .query("facturacionTareas")
      .withIndex("by_facturaId", (q) => q.eq("facturaId", args.facturaId))
      .unique();
    const legalizaciones = await listarLegalizacionesActivasCajaMenorFactura(ctx, args.facturaId);
    const legalizacionesDetalle = await Promise.all(
      legalizaciones.map(async (legalizacion) => ({
        ...legalizacion,
        cajaMenor: await ctx.db.get("cajasMenores", legalizacion.cajaMenorId),
      }))
    );
    const movimientos = await listarMovimientosActivosCajaMenorFactura(ctx, args.facturaId);
    const movimientosDetalle = await Promise.all(
      movimientos.map(async (movimiento) => ({
        ...movimiento,
        cajaMenor: await ctx.db.get("cajasMenores", movimiento.cajaMenorId),
        reembolso: movimiento.reembolsoId ? await ctx.db.get("cajasMenoresReembolsos", movimiento.reembolsoId) : null,
      }))
    );
    const empresa = normalizeEmpresa(factura.empresa);
    const permitirSaldoNegativo = await empresaPermiteSaldoNegativo(ctx, empresa);
    const cajas = args.actorUserId
      ? await Promise.all(
          (
            await ctx.db
              .query("cajasMenores")
              .withIndex("by_empresa_id", (q) => q.eq("empresa_id", empresa))
              .collect()
          )
            .filter(
              (caja) =>
                (caja.estado ?? "activa") === "activa" &&
                caja.assignedUsersIds.includes(args.actorUserId ?? "")
            )
            .map(async (caja) => ({
              ...caja,
              ...(await getCajaMenorSaldo(ctx, caja)),
              permitirSaldoNegativo,
            }))
        )
      : [];

    return {
      factura,
      tarea,
      legalizaciones,
      legalizacionesDetalle,
      movimientos,
      movimientosDetalle,
      cajas: cajas
        .filter(
          (caja) =>
            !caja.refillPendiente &&
            (permitirSaldoNegativo || caja.saldoDisponible + 0.001 >= factura.total)
        )
        .sort((a, b) => b.saldoDisponible - a.saldoDisponible),
      totales: {
        valorFactura: factura.total,
        valorAplicadoFactura:
          movimientos.length > 0
            ? movimientos.reduce((total, row) => total + row.valor, 0)
            : legalizaciones.reduce((total, row) => total + row.valorAplicado, 0),
      },
    };
  },
});

export const legalizarCajaMenorFactura = mutation({
  args: {
    asignacionId: v.id("facturacionAsignaciones"),
    ...causacionArg,
    ...actorValidator,
  },
  handler: async (ctx, args) => {
    const { asignacion, tarea, empresa } = await getTareaFromAsignacion(ctx, args.asignacionId);
    if (asignacion.fase !== "revision_impuestos" || tarea.estado !== "revision_impuestos") {
      throw new Error(
        "La factura debe estar en Contabilidad para completar y legalizar con Caja Menor."
      );
    }
    const factura = await ctx.db.get("facturacionFacturas", tarea.facturaId);
    if (!factura) throw new Error("Factura no encontrada.");
    const causacionCambio = await aplicarCausacionEnFactura(ctx, {
      factura,
      input: args.causacion as CausacionActionInput | undefined,
      actor: {
        userId: args.actorUserId ?? "",
        nombre: args.actorNombre,
        email: args.actorEmail,
      },
      contexto: { tipo: "flujo_factura" },
      faseOperativa: asignacion.fase,
    });
    await legalizarCajaMenorDesdeAsignacion(ctx, {
      asignacion,
      tarea,
      empresa,
      actor: {
        actorUserId: args.actorUserId,
        actorNombre: args.actorNombre,
        actorEmail: args.actorEmail,
        comentario: args.comentario,
        ...(causacionCambio ? { causacionCambio } : {}),
      },
    });
  },
});

export const cerrarNotaCreditoAsignacion = mutation({
  args: {
    asignacionId: v.id("facturacionAsignaciones"),
    ...actorValidator,
  },
  handler: async (ctx, args) => {
    const { asignacion, tarea, empresa } = await getTareaFromAsignacion(ctx, args.asignacionId);
    await cerrarNotaCreditoDesdeAsignacion(ctx, {
      asignacion,
      tarea,
      empresa,
      actorUserId: args.actorUserId,
      actorNombre: args.actorNombre,
      actorEmail: args.actorEmail,
      comentario: args.comentario,
    });
  },
});

export const cerrarFacturaRecepcionAsignacion = mutation({
  args: {
    asignacionId: v.id("facturacionAsignaciones"),
    ...actorValidator,
  },
  handler: async (ctx, args) => {
    const { asignacion, tarea, empresa } = await getTareaFromAsignacion(ctx, args.asignacionId);
    await cerrarFacturaRecepcionDesdeAsignacion(ctx, {
      asignacion,
      tarea,
      empresa,
      actorUserId: args.actorUserId,
      actorNombre: args.actorNombre,
      actorEmail: args.actorEmail,
      comentario: args.comentario,
    });
  },
});

export const asignarLideres = mutation({
  args: {
    asignacionId: v.id("facturacionAsignaciones"),
    lideres: v.array(usuarioAsignacionValidator),
    ...actorValidator,
  },
  handler: async (ctx, args) => {
    const { asignacion, tarea, empresa } = await getTareaFromAsignacion(ctx, args.asignacionId);
    if (asignacion.fase !== "recepcion" || tarea.estado !== "recepcion") {
      throw new Error("La factura no está pendiente de asignación por recepción.");
    }
    if (args.lideres.length === 0) {
      throw new Error("Selecciona al menos un líder para revisar la factura.");
    }

    const seen = new Set<string>();
    const lideres = (args.lideres as UsuarioConfig[]).map((lider) => {
      const key = lider.usuarioId ?? normalizeEmail(lider.email);
      if (seen.has(key)) throw new Error("No repitas líderes en la asignación.");
      seen.add(key);
      return { ...lider, email: normalizeEmail(lider.email) };
    });

    await cerrarAsignacion(ctx, asignacion, "completada", args.comentario);
    await cancelarPendientesDelGrupo(ctx, asignacion.grupoId, asignacion._id, {
      tareaId: tarea._id,
      facturaId: tarea.facturaId,
      empresa,
      actorUserId: args.actorUserId,
      actorNombre: args.actorNombre,
      actorEmail: args.actorEmail,
      estadoAnterior: tarea.estado,
      estadoNuevo: "revision_lider",
    });

    const grupoId = createGroupId("revision_lider", tarea.facturaId);
    const assignmentIds: Id<"facturacionAsignaciones">[] = [];
    for (const lider of lideres) {
      assignmentIds.push(
        await insertarAsignacion(ctx, {
          facturaId: tarea.facturaId,
          tareaId: tarea._id,
          empresa,
          fase: "revision_lider",
          rol: "lider",
          grupoId,
          usuario: {
            usuarioId: lider.usuarioId,
            nombre: lider.nombre,
            email: lider.email,
            procesoId: lider.procesoId,
            procesoNombre: lider.procesoNombre,
          },
        })
      );
    }

    await registrarAprobacion(ctx, {
      tareaId: tarea._id,
      facturaId: tarea.facturaId,
      asignacionId: asignacion._id,
      empresa,
      actorUserId: args.actorUserId,
      actorNombre: args.actorNombre,
      actorEmail: args.actorEmail,
      accion: "asignar_lider",
      comentario: args.comentario,
      estadoAnterior: tarea.estado,
      estadoNuevo: "revision_lider",
    });

    const first = lideres[0];
    await patchTareaEstado(ctx, tarea, "revision_lider", {
      grupoAsignacionActualId: grupoId,
      currentAsignacionId: assignmentIds[0],
      lideresTotal: lideres.length,
      lideresCompletados: 0,
      asignadoAUserId: first.usuarioId,
      asignadoANombre: lideres.length === 1 ? first.nombre : `${lideres.length} líderes asignados`,
      asignadoAEmail: first.email,
      liderProcesoUserId: first.usuarioId,
      liderProcesoNombre:
        lideres.length === 1 ? first.nombre : `${lideres.length} líderes asignados`,
      liderProcesoEmail: first.email,
      liderProcesoProcesoId: first.procesoId,
      liderProcesoProcesoNombre: sanitizeProcesoNombre(first.procesoNombre),
    });
  },
});

export const completarRevisionLider = mutation({
  args: {
    asignacionId: v.id("facturacionAsignaciones"),
    decision: decisionRevisionLiderValidator,
    ...actorValidator,
  },
  handler: async (ctx, args) => {
    const { asignacion, tarea, empresa } = await getTareaFromAsignacion(ctx, args.asignacionId);
    if (asignacion.fase !== "revision_lider" || tarea.estado !== "revision_lider") {
      throw new Error("La factura ya no está en revisión de líderes.");
    }

    if (args.decision === "rechazar") {
      await revertirLegalizacionesCajaMenorFactura(ctx, tarea.facturaId, Date.now());
      await anularMovimientosCajaMenorFacturaInterno(
        ctx,
        tarea.facturaId,
        {
          actorUserId: args.actorUserId ?? "sin-usuario",
          actorNombre: args.actorNombre,
          actorEmail: args.actorEmail,
        },
        args.comentario
      );
      await cerrarAsignacion(ctx, asignacion, "rechazada", args.comentario);
      await cancelarPendientesDelGrupo(ctx, asignacion.grupoId, asignacion._id, {
        tareaId: tarea._id,
        facturaId: tarea.facturaId,
        empresa,
        actorUserId: args.actorUserId,
        actorNombre: args.actorNombre,
        actorEmail: args.actorEmail,
        estadoAnterior: tarea.estado,
        estadoNuevo: "rechazada",
      });
      await registrarAprobacion(ctx, {
        tareaId: tarea._id,
        facturaId: tarea.facturaId,
        asignacionId: asignacion._id,
        empresa,
        actorUserId: args.actorUserId ?? "sin-usuario",
        actorNombre: args.actorNombre,
        actorEmail: args.actorEmail,
        accion: "rechazar",
        comentario: args.comentario,
        estadoAnterior: tarea.estado,
        estadoNuevo: "rechazada",
      });
      await patchTareaEstado(ctx, tarea, "rechazada");
      return;
    }

    const factura = await ctx.db.get("facturacionFacturas", tarea.facturaId);
    if (!factura) throw new Error("Factura no encontrada.");
    await validarLegalizacionAnticipoMinimaParaLider(ctx, factura);

    await cerrarAsignacion(ctx, asignacion, "completada", args.comentario);
    await registrarAprobacion(ctx, {
      tareaId: tarea._id,
      facturaId: tarea.facturaId,
      asignacionId: asignacion._id,
      empresa,
      actorUserId: args.actorUserId,
      actorNombre: args.actorNombre,
      actorEmail: args.actorEmail,
      accion: "aceptar",
      comentario: args.comentario,
      estadoAnterior: tarea.estado,
      estadoNuevo: tarea.estado,
    });

    const progreso = await actualizarProgresoLideres(ctx, tarea._id, asignacion.grupoId);
    if (progreso.pendientes.length === 0 && progreso.relevantes.length > 0) {
      await crearAsignacionCausacion(ctx, tarea, {
        actorUserId: args.actorUserId,
        actorNombre: args.actorNombre,
        actorEmail: args.actorEmail,
        comentario: "Revisión de líderes completada. Enviado a causación.",
        origenRevisionLider: {
          asignacionId: asignacion._id,
          userId: asignacion.asignadoAUserId,
          nombre: asignacion.asignadoANombre,
          email: asignacion.asignadoAEmail,
        },
      });
    }
  },
});

export const asignarJefeDirecto = mutation({
  args: {
    asignacionId: v.id("facturacionAsignaciones"),
    jefeDirecto: usuarioAsignacionValidator,
    ...actorValidator,
  },
  handler: async (ctx, args) => {
    const { asignacion, tarea, empresa } = await getTareaFromAsignacion(ctx, args.asignacionId);
    if (asignacion.fase !== "revision_lider" || tarea.estado !== "revision_lider") {
      throw new Error("La factura ya no está en revisión de líder.");
    }

    await cerrarAsignacion(ctx, asignacion, "completada", args.comentario);
    await cancelarPendientesDelGrupo(ctx, asignacion.grupoId, asignacion._id, {
      tareaId: tarea._id,
      facturaId: tarea.facturaId,
      empresa,
      actorUserId: args.actorUserId,
      actorNombre: args.actorNombre,
      actorEmail: args.actorEmail,
      estadoAnterior: tarea.estado,
      estadoNuevo: "jefe_directo",
    });
    await crearAsignacionJefeDirecto(ctx, tarea, args.jefeDirecto, {
      actorUserId: args.actorUserId,
      actorNombre: args.actorNombre,
      actorEmail: args.actorEmail,
      comentario: args.comentario,
    });
  },
});

export const completarJefeDirecto = mutation({
  args: {
    asignacionId: v.id("facturacionAsignaciones"),
    decision: decisionRevisionLiderValidator,
    ...actorValidator,
  },
  handler: async (ctx, args) => {
    const { asignacion, tarea, empresa } = await getTareaFromAsignacion(ctx, args.asignacionId);
    if (asignacion.fase !== "jefe_directo" || tarea.estado !== "jefe_directo") {
      throw new Error("La factura ya no está en revisión de jefe directo.");
    }

    if (args.decision === "rechazar") {
      await crearDevolucionAFase(ctx, {
        tarea,
        asignacionOrigen: asignacion,
        faseDestino: "revision_lider",
        actorUserId: args.actorUserId ?? "",
        comentario: args.comentario,
      });
      return;
    }

    await cerrarAsignacion(ctx, asignacion, "completada", args.comentario);
    await cancelarPendientesDelGrupo(ctx, asignacion.grupoId, asignacion._id, {
      tareaId: tarea._id,
      facturaId: tarea.facturaId,
      empresa,
      actorUserId: args.actorUserId,
      actorNombre: args.actorNombre,
      actorEmail: args.actorEmail,
      estadoAnterior: tarea.estado,
      estadoNuevo: "causacion",
    });
    await crearAsignacionCausacion(ctx, tarea, {
      actorUserId: args.actorUserId,
      actorNombre: args.actorNombre,
      actorEmail: args.actorEmail,
      comentario: args.comentario,
    });
  },
});

export const asignarOtroLider = mutation({
  args: {
    asignacionId: v.id("facturacionAsignaciones"),
    lideres: v.array(usuarioAsignacionValidator),
    ...actorValidator,
  },
  handler: async (ctx, args) => {
    const { asignacion, tarea, empresa } = await getTareaFromAsignacion(ctx, args.asignacionId);
    if (asignacion.fase !== "revision_lider" || tarea.estado !== "revision_lider") {
      throw new Error("La factura ya no está en revisión de líderes.");
    }
    if (args.lideres.length === 0) {
      throw new Error("Selecciona al menos un líder para continuar la revisión.");
    }

    const pendientesActuales = await ctx.db
      .query("facturacionAsignaciones")
      .withIndex("by_grupoId", (q) => q.eq("grupoId", asignacion.grupoId))
      .collect();
    const activosKeys = new Set(
      pendientesActuales
        .filter(
          (item) =>
            item.fase === "revision_lider" &&
            item.estado === "pendiente" &&
            item._id !== asignacion._id
        )
        .map((item) => item.asignadoAUserId ?? normalizeEmail(item.asignadoAEmail))
    );

    const seen = new Set<string>();
    const lideres = (args.lideres as UsuarioConfig[]).map((lider) => {
      const key = usuarioKey(lider);
      if (seen.has(key)) {
        throw new Error("No repitas líderes en la asignación.");
      }
      if (activosKeys.has(key)) {
        throw new Error("Uno de los líderes seleccionados ya tiene la factura pendiente.");
      }
      seen.add(key);
      return { ...lider, email: normalizeEmail(lider.email) };
    });

    const horizontalMetadata = {
      origen: "movimiento_horizontal",
      tipo: "asignar_lider_horizontal",
      asignacionOrigenId: asignacion._id,
      actorUserId: args.actorUserId,
      actorNombre: args.actorNombre,
      actorEmail: normalizeEmail(args.actorEmail),
    };

    await cerrarAsignacion(ctx, asignacion, "completada", args.comentario, horizontalMetadata);

    const assignmentIds: Id<"facturacionAsignaciones">[] = [];
    for (const lider of lideres) {
      assignmentIds.push(
        await insertarAsignacion(ctx, {
          facturaId: tarea.facturaId,
          tareaId: tarea._id,
          empresa,
          fase: "revision_lider",
          rol: "lider",
          grupoId: asignacion.grupoId,
          usuario: {
            usuarioId: lider.usuarioId,
            nombre: lider.nombre,
            email: lider.email,
            procesoId: lider.procesoId,
            procesoNombre: lider.procesoNombre,
          },
          metadata: horizontalMetadata,
        })
      );
    }

    await registrarAprobacion(ctx, {
      tareaId: tarea._id,
      facturaId: tarea.facturaId,
      asignacionId: asignacion._id,
      empresa,
      actorUserId: args.actorUserId,
      actorNombre: args.actorNombre,
      actorEmail: args.actorEmail,
      accion: "asignar_lider_horizontal",
      comentario: args.comentario,
      estadoAnterior: tarea.estado,
      estadoNuevo: tarea.estado,
    });

    await actualizarProgresoLideres(ctx, tarea._id, asignacion.grupoId);
  },
});

export const asignarPar = mutation({
  args: {
    asignacionId: v.id("facturacionAsignaciones"),
    nuevoAsignado: usuarioAsignacionValidator,
    ...causacionArg,
    ...actorValidator,
  },
  handler: async (ctx, args) => {
    const { asignacion, tarea, empresa } = await getTareaFromAsignacion(ctx, args.asignacionId);
    const fasesPermitidas = [
      "causacion",
      "revision_impuestos",
      "eventos_dian",
      "pendiente_rechazar_dian",
      "gerencia",
    ] as const;
    if (
      !fasesPermitidas.includes(asignacion.fase as (typeof fasesPermitidas)[number]) ||
      tarea.estado !== asignacion.fase
    ) {
      throw new Error("La factura no admite transferencia horizontal en esta fase.");
    }

    const nuevoAsignado: UsuarioConfig = {
      ...args.nuevoAsignado,
      email: normalizeEmail(args.nuevoAsignado.email),
    };
    const nuevoUsuarioId = nuevoAsignado.usuarioId?.trim();
    const actualUsuarioId = asignacion.asignadoAUserId?.trim();
    if (!nuevoUsuarioId) {
      throw new Error("Selecciona un responsable válido.");
    }
    if (!actualUsuarioId) {
      throw new Error("La asignación actual no tiene usuario identificado.");
    }
    if (nuevoUsuarioId === actualUsuarioId) {
      throw new Error("Selecciona un par distinto al responsable actual.");
    }

    await validarParMismaFase(ctx, empresa, asignacion.fase, nuevoAsignado);

    const factura = await ctx.db.get("facturacionFacturas", tarea.facturaId);
    if (!factura) throw new Error("Factura no encontrada.");
    const causacionCambio = await aplicarCausacionEnFactura(ctx, {
      factura,
      input: args.causacion as CausacionActionInput | undefined,
      actor: {
        userId: args.actorUserId ?? "",
        nombre: args.actorNombre,
        email: args.actorEmail,
      },
      contexto: { tipo: "flujo_factura" },
      faseOperativa: asignacion.fase,
    });

    const horizontalMetadata = {
      origen: "movimiento_horizontal",
      tipo: "asignar_par",
      asignacionOrigenId: asignacion._id,
      actorUserId: args.actorUserId,
      actorNombre: args.actorNombre,
      actorEmail: normalizeEmail(args.actorEmail),
    };

    await cerrarAsignacion(ctx, asignacion, "reasignada", args.comentario, {
      ...horizontalMetadata,
      reasignadoAUserId: nuevoAsignado.usuarioId,
      reasignadoANombre: nuevoAsignado.nombre,
      reasignadoAEmail: nuevoAsignado.email,
    });

    const rolPorFase: Record<(typeof fasesPermitidas)[number], RolAsignacion> = {
      causacion: "analista_causacion",
      revision_impuestos: "contador_impuestos",
      eventos_dian: "eventos_dian",
      pendiente_rechazar_dian: "rechazos_dian",
      gerencia: "gerencia",
    };

    const nuevaAsignacionId = await insertarAsignacion(ctx, {
      facturaId: tarea.facturaId,
      tareaId: tarea._id,
      empresa,
      fase: asignacion.fase,
      rol: rolPorFase[asignacion.fase as (typeof fasesPermitidas)[number]],
      grupoId: asignacion.grupoId,
      usuario: nuevoAsignado,
      metadata: horizontalMetadata,
    });

    await registrarAprobacion(ctx, {
      tareaId: tarea._id,
      facturaId: tarea.facturaId,
      asignacionId: asignacion._id,
      empresa,
      actorUserId: args.actorUserId,
      actorNombre: args.actorNombre,
      actorEmail: args.actorEmail,
      accion: "asignar_par",
      comentario: args.comentario,
      estadoAnterior: tarea.estado,
      estadoNuevo: tarea.estado,
      ...(causacionCambio ? { causacionCambio } : {}),
    });

    const patch: Partial<Doc<"facturacionTareas">> = {
      currentAsignacionId: nuevaAsignacionId,
      asignadoAUserId: nuevoAsignado.usuarioId,
      asignadoANombre: nuevoAsignado.nombre,
      asignadoAEmail: nuevoAsignado.email,
      actualizadoEn: Date.now(),
    };

    if (asignacion.fase === "causacion") {
      patch.causacionAsignadoAUserId = nuevoAsignado.usuarioId;
      patch.causacionAsignadoANombre = nuevoAsignado.nombre;
      patch.causacionAsignadoAEmail = nuevoAsignado.email;
    } else if (asignacion.fase === "revision_impuestos") {
      patch.contadorAsignadoAUserId = nuevoAsignado.usuarioId;
      patch.contadorAsignadoANombre = nuevoAsignado.nombre;
      patch.contadorAsignadoAEmail = nuevoAsignado.email;
    } else if (asignacion.fase === "eventos_dian") {
      patch.eventosDianAsignadoAUserId = nuevoAsignado.usuarioId;
      patch.eventosDianAsignadoANombre = nuevoAsignado.nombre;
      patch.eventosDianAsignadoAEmail = nuevoAsignado.email;
    } else if (asignacion.fase === "gerencia") {
      patch.gerenciaAsignadoAUserId = nuevoAsignado.usuarioId;
      patch.gerenciaAsignadoANombre = nuevoAsignado.nombre;
      patch.gerenciaAsignadoAEmail = nuevoAsignado.email;
    }

    await patchTareaEstado(ctx, tarea, tarea.estado, patch);
  },
});

const COMENTARIO_VALOR_CONTABLE_PRE_CRUCE = "Ajuste de valor contable previo al cruce de anticipos";

export const guardarValorContableFactura = mutation({
  args: {
    asignacionId: v.id("facturacionAsignaciones"),
    valorContableNuevo: v.number(),
    ...actorValidator,
  },
  handler: async (ctx, args) => {
    const { asignacion, tarea } = await getTareaFromAsignacion(ctx, args.asignacionId);

    const factura = await ctx.db.get("facturacionFacturas", tarea.facturaId);
    if (!factura) throw new Error("Factura no encontrada.");

    if (!puedeEditarValorContable(asignacion.fase, factura)) {
      throw new Error("No puedes modificar el valor contable en esta fase o tipo de documento.");
    }

    const comentario = args.comentario.trim() || COMENTARIO_VALOR_CONTABLE_PRE_CRUCE;

    return aplicarCambioValorContable(ctx, {
      factura,
      fase: asignacion.fase,
      valorContableNuevo: args.valorContableNuevo,
      comentario,
      actorUserId: args.actorUserId,
      actorNombre: args.actorNombre,
      actorEmail: args.actorEmail,
    });
  },
});

export const completarCausacion = mutation({
  args: {
    asignacionId: v.id("facturacionAsignaciones"),
    contador: usuarioAsignacionValidator,
    ...actorValidator,
    ...valorContableNuevoArg,
    ...causacionArg,
  },
  handler: async (ctx, args) => {
    const { asignacion, tarea, empresa } = await getTareaFromAsignacion(ctx, args.asignacionId);
    if (asignacion.fase !== "causacion" || tarea.estado !== "causacion") {
      throw new Error("La factura ya no está en causación.");
    }

    const factura = await ctx.db.get("facturacionFacturas", tarea.facturaId);
    if (!factura) throw new Error("Factura no encontrada.");
    await validarLegalizacionAnticipoParaAvanzar(ctx, factura);
    await validarLegalizacionCajaMenorParaAvanzar(ctx, factura);

    const causacionCambio = await aplicarCausacionEnFactura(ctx, {
      factura,
      input: args.causacion as CausacionActionInput | undefined,
      actor: {
        userId: args.actorUserId ?? "",
        nombre: args.actorNombre,
        email: args.actorEmail,
      },
      contexto: { tipo: "flujo_factura" },
      faseOperativa: asignacion.fase,
    });

    const valorContableResult = await procesarValorContableEnAccion(ctx, {
      factura,
      asignacion,
      valorContableNuevo: args.valorContableNuevo,
      comentario: args.comentario,
      actorUserId: args.actorUserId,
      actorNombre: args.actorNombre,
      actorEmail: args.actorEmail,
    });

    const contadores = await getContadoresImpuestos(ctx, empresa);
    const contadorEmail = normalizeEmail(args.contador.email);
    const contadorValido = contadores.some((contador) =>
      usuariosCoincidenPorIdentidad(contador, args.contador)
    );
    if (!contadorValido) {
      throw new Error("Selecciona un contador/revisor configurado para esta empresa.");
    }

    await cerrarAsignacion(ctx, asignacion, "completada", args.comentario);
    const grupoId = createGroupId("revision_impuestos", tarea.facturaId);
    const asignacionImpuestosId = await insertarAsignacion(ctx, {
      facturaId: tarea.facturaId,
      tareaId: tarea._id,
      empresa,
      fase: "revision_impuestos",
      rol: "contador_impuestos",
      grupoId,
      usuario: {
        usuarioId: args.contador.usuarioId,
        nombre: args.contador.nombre,
        email: args.contador.email,
      },
    });

    await registrarAprobacion(ctx, {
      tareaId: tarea._id,
      facturaId: tarea.facturaId,
      asignacionId: asignacion._id,
      empresa,
      actorUserId: args.actorUserId,
      actorNombre: args.actorNombre,
      actorEmail: args.actorEmail,
      accion: "enviar_impuestos",
      comentario: args.comentario,
      estadoAnterior: tarea.estado,
      estadoNuevo: "revision_impuestos",
      ...(valorContableResult.valorContableCambio
        ? { valorContableCambio: valorContableResult.valorContableCambio }
        : {}),
      ...(causacionCambio ? { causacionCambio } : {}),
    });

    await patchTareaEstado(ctx, tarea, "revision_impuestos", {
      contadorAsignadoAUserId: args.contador.usuarioId,
      contadorAsignadoANombre: args.contador.nombre,
      contadorAsignadoAEmail: contadorEmail,
      asignadoAUserId: args.contador.usuarioId,
      asignadoANombre: args.contador.nombre,
      asignadoAEmail: contadorEmail,
      grupoAsignacionActualId: grupoId,
      currentAsignacionId: asignacionImpuestosId,
    });
  },
});

export const reenviarAImpuestos = mutation({
  args: {
    asignacionId: v.id("facturacionAsignaciones"),
    ...actorValidator,
    ...valorContableNuevoArg,
    ...causacionArg,
  },
  handler: async (ctx, args) => {
    const { asignacion, tarea, empresa } = await getTareaFromAsignacion(ctx, args.asignacionId);
    if (asignacion.fase !== "causacion" || tarea.estado !== "causacion") {
      throw new Error("La factura ya no está en corrección de causación.");
    }
    if (!tarea.contadorAsignadoANombre || !tarea.contadorAsignadoAEmail) {
      throw new Error("No hay contador previo para reenviar la factura.");
    }

    const factura = await ctx.db.get("facturacionFacturas", tarea.facturaId);
    if (!factura) throw new Error("Factura no encontrada.");
    await validarLegalizacionAnticipoParaAvanzar(ctx, factura);
    await validarLegalizacionCajaMenorParaAvanzar(ctx, factura);

    const causacionCambio = await aplicarCausacionEnFactura(ctx, {
      factura,
      input: args.causacion as CausacionActionInput | undefined,
      actor: {
        userId: args.actorUserId ?? "",
        nombre: args.actorNombre,
        email: args.actorEmail,
      },
      contexto: { tipo: "flujo_factura" },
      faseOperativa: asignacion.fase,
    });

    const valorContableResult = await procesarValorContableEnAccion(ctx, {
      factura,
      asignacion,
      valorContableNuevo: args.valorContableNuevo,
      comentario: args.comentario,
      actorUserId: args.actorUserId,
      actorNombre: args.actorNombre,
      actorEmail: args.actorEmail,
    });

    await cerrarAsignacion(ctx, asignacion, "completada", args.comentario);
    const grupoId = createGroupId("revision_impuestos", tarea.facturaId);
    const asignacionImpuestosId = await insertarAsignacion(ctx, {
      facturaId: tarea.facturaId,
      tareaId: tarea._id,
      empresa,
      fase: "revision_impuestos",
      rol: "contador_impuestos",
      grupoId,
      usuario: {
        usuarioId: tarea.contadorAsignadoAUserId,
        nombre: tarea.contadorAsignadoANombre,
        email: tarea.contadorAsignadoAEmail,
      },
      metadata: { origen: "correccion_causacion" },
    });

    await registrarAprobacion(ctx, {
      tareaId: tarea._id,
      facturaId: tarea.facturaId,
      asignacionId: asignacion._id,
      empresa,
      actorUserId: args.actorUserId,
      actorNombre: args.actorNombre,
      actorEmail: args.actorEmail,
      accion: "reenviar_impuestos",
      comentario: args.comentario,
      estadoAnterior: tarea.estado,
      estadoNuevo: "revision_impuestos",
      ...(valorContableResult.valorContableCambio
        ? { valorContableCambio: valorContableResult.valorContableCambio }
        : {}),
      ...(causacionCambio ? { causacionCambio } : {}),
    });

    await patchTareaEstado(ctx, tarea, "revision_impuestos", {
      asignadoAUserId: tarea.contadorAsignadoAUserId,
      asignadoANombre: tarea.contadorAsignadoANombre,
      asignadoAEmail: normalizeEmail(tarea.contadorAsignadoAEmail),
      grupoAsignacionActualId: grupoId,
      currentAsignacionId: asignacionImpuestosId,
    });
  },
});

export const completarRevisionImpuestos = mutation({
  args: {
    asignacionId: v.id("facturacionAsignaciones"),
    decision: decisionRevisionImpuestosValidator,
    eventosDian: v.optional(usuarioAsignacionValidator),
    ...actorValidator,
    ...valorContableNuevoArg,
    ...causacionArg,
  },
  handler: async (ctx, args) => {
    const { asignacion, tarea, empresa } = await getTareaFromAsignacion(ctx, args.asignacionId);
    if (asignacion.fase !== "revision_impuestos" || tarea.estado !== "revision_impuestos") {
      throw new Error("La factura ya no está en revisión de impuestos.");
    }

    const factura = await ctx.db.get("facturacionFacturas", tarea.facturaId);
    if (!factura) throw new Error("Factura no encontrada.");
    if (factura.esLegalizacionCajaMenor && args.decision === "aprobar") {
      throw new Error(
        "Usa la acción Completar y legalizar con Caja Menor para cerrar esta factura desde Contabilidad."
      );
    }

    if (args.decision === "aprobar") {
      await validarLegalizacionAnticipoParaAvanzar(ctx, factura);
    }

    const causacionCambio = await aplicarCausacionEnFactura(ctx, {
      factura,
      input: args.causacion as CausacionActionInput | undefined,
      actor: {
        userId: args.actorUserId ?? "",
        nombre: args.actorNombre,
        email: args.actorEmail,
      },
      contexto: { tipo: "flujo_factura" },
      faseOperativa: asignacion.fase,
    });

    if (args.decision === "devolver") {
      if (args.valorContableNuevo !== undefined) {
        throw new Error("No puedes modificar el valor contable al devolver la factura.");
      }
      await crearDevolucionAFase(ctx, {
        tarea,
        asignacionOrigen: asignacion,
        faseDestino: "causacion",
        actorUserId: args.actorUserId ?? "",
        comentario: args.comentario,
        causacionCambio,
      });
      return;
    }

    const valorContableResult = await procesarValorContableEnAccion(ctx, {
      factura,
      asignacion,
      valorContableNuevo: args.valorContableNuevo,
      comentario: args.comentario,
      actorUserId: args.actorUserId,
      actorNombre: args.actorNombre,
      actorEmail: args.actorEmail,
    });

    await cerrarAsignacion(ctx, asignacion, "completada", args.comentario);
    await cancelarPendientesDelGrupo(ctx, asignacion.grupoId, asignacion._id, {
      tareaId: tarea._id,
      facturaId: tarea.facturaId,
      empresa,
      actorUserId: args.actorUserId,
      actorNombre: args.actorNombre,
      actorEmail: args.actorEmail,
      estadoAnterior: tarea.estado,
      estadoNuevo: "eventos_dian",
    });
    const eventosDian = args.eventosDian ?? (await getEventosDianUsuarios(ctx, empresa))[0];
    await crearAsignacionEventosDian(ctx, tarea, eventosDian, {
      actorUserId: args.actorUserId,
      actorNombre: args.actorNombre,
      actorEmail: args.actorEmail,
      comentario: args.comentario,
      valorContableCambio: valorContableResult.valorContableCambio,
      causacionCambio,
    });
  },
});

export const enviarContadorAGerencia = mutation({
  args: {
    asignacionId: v.id("facturacionAsignaciones"),
    ...actorValidator,
    ...valorContableNuevoArg,
    ...causacionArg,
  },
  handler: async (ctx, args) => {
    const { asignacion, tarea, empresa } = await getTareaFromAsignacion(ctx, args.asignacionId);
    if (asignacion.fase !== "revision_impuestos" || tarea.estado !== "revision_impuestos") {
      throw new Error("La factura ya no está en revisión de contador.");
    }

    const factura = await ctx.db.get("facturacionFacturas", tarea.facturaId);
    if (!factura) throw new Error("Factura no encontrada.");
    if (factura.esLegalizacionCajaMenor) {
      throw new Error("Las facturas de Caja Menor se legalizan o se envían a Eventos DIAN.");
    }

    await validarLegalizacionAnticipoParaAvanzar(ctx, factura);

    const causacionCambio = await aplicarCausacionEnFactura(ctx, {
      factura,
      input: args.causacion as CausacionActionInput | undefined,
      actor: {
        userId: args.actorUserId ?? "",
        nombre: args.actorNombre,
        email: args.actorEmail,
      },
      contexto: { tipo: "flujo_factura" },
      faseOperativa: asignacion.fase,
    });

    const valorContableResult = await procesarValorContableEnAccion(ctx, {
      factura,
      asignacion,
      valorContableNuevo: args.valorContableNuevo,
      comentario: args.comentario,
      actorUserId: args.actorUserId,
      actorNombre: args.actorNombre,
      actorEmail: args.actorEmail,
    });

    await cerrarAsignacion(ctx, asignacion, "completada", args.comentario);
    await cancelarPendientesDelGrupo(ctx, asignacion.grupoId, asignacion._id, {
      tareaId: tarea._id,
      facturaId: tarea.facturaId,
      empresa,
      actorUserId: args.actorUserId,
      actorNombre: args.actorNombre,
      actorEmail: args.actorEmail,
      estadoAnterior: tarea.estado,
      estadoNuevo: "gerencia",
    });
    await crearAsignacionGerencia(ctx, tarea, {
      actorUserId: args.actorUserId,
      actorNombre: args.actorNombre,
      actorEmail: args.actorEmail,
      comentario: args.comentario,
      valorContableCambio: valorContableResult.valorContableCambio,
      causacionCambio,
    });
  },
});

export const completarEventosDian = mutation({
  args: {
    asignacionId: v.id("facturacionAsignaciones"),
    decision: decisionEventosDianValidator,
    ...actorValidator,
    ...valorContableNuevoArg,
    ...causacionArg,
  },
  handler: async (ctx, args) => {
    const { asignacion, tarea, empresa } = await getTareaFromAsignacion(ctx, args.asignacionId);
    if (asignacion.fase !== "eventos_dian" || tarea.estado !== "eventos_dian") {
      throw new Error("La factura ya no está en Eventos DIAN.");
    }

    const factura = await ctx.db.get("facturacionFacturas", tarea.facturaId);
    if (!factura) throw new Error("Factura no encontrada.");
    if (factura.esLegalizacionCajaMenor && args.decision !== "devolver") {
      throw new Error("Las facturas de Caja Menor se completan y legalizan desde Contabilidad.");
    }

    const causacionCambio = await aplicarCausacionEnFactura(ctx, {
      factura,
      input: args.causacion as CausacionActionInput | undefined,
      actor: {
        userId: args.actorUserId ?? "",
        nombre: args.actorNombre,
        email: args.actorEmail,
      },
      contexto: { tipo: "flujo_factura" },
      faseOperativa: asignacion.fase,
    });

    if (args.decision === "devolver") {
      if (args.valorContableNuevo !== undefined) {
        throw new Error("No puedes modificar el valor contable al devolver la factura.");
      }
      await crearDevolucionAFase(ctx, {
        tarea,
        asignacionOrigen: asignacion,
        faseDestino: "revision_impuestos",
        actorUserId: args.actorUserId ?? "",
        comentario: args.comentario,
        causacionCambio,
      });
      return;
    }

    const valorContableResult = await procesarValorContableEnAccion(ctx, {
      factura,
      asignacion,
      valorContableNuevo: args.valorContableNuevo,
      comentario: args.comentario,
      actorUserId: args.actorUserId,
      actorNombre: args.actorNombre,
      actorEmail: args.actorEmail,
    });

    await cerrarAsignacion(ctx, asignacion, "completada", args.comentario);
    await cancelarPendientesDelGrupo(ctx, asignacion.grupoId, asignacion._id, {
      tareaId: tarea._id,
      facturaId: tarea.facturaId,
      empresa,
      actorUserId: args.actorUserId,
      actorNombre: args.actorNombre,
      actorEmail: args.actorEmail,
      estadoAnterior: tarea.estado,
      estadoNuevo: args.decision === "legalizar" ? "legalizada" : "gerencia",
    });

    if (args.decision === "legalizar") {
      await registrarAprobacion(ctx, {
        tareaId: tarea._id,
        facturaId: tarea.facturaId,
        asignacionId: asignacion._id,
        empresa,
        actorUserId: args.actorUserId,
        actorNombre: args.actorNombre,
        actorEmail: args.actorEmail,
        accion: "legalizar_factura",
        comentario: args.comentario,
        estadoAnterior: tarea.estado,
        estadoNuevo: "legalizada",
        ...(valorContableResult.valorContableCambio
          ? { valorContableCambio: valorContableResult.valorContableCambio }
          : {}),
        ...(causacionCambio ? { causacionCambio } : {}),
      });
      await patchTareaEstado(ctx, tarea, "legalizada", {
        asignadoAUserId: asignacion.asignadoAUserId,
        asignadoANombre: asignacion.asignadoANombre,
        asignadoAEmail: normalizeEmail(asignacion.asignadoAEmail),
        grupoAsignacionActualId: asignacion.grupoId,
        currentAsignacionId: asignacion._id,
      });
      await programarNotificacionEstadoTerminal(ctx, tarea, "legalizada", args.comentario);
      return;
    }

    await crearAsignacionGerencia(ctx, tarea, {
      actorUserId: args.actorUserId,
      actorNombre: args.actorNombre,
      actorEmail: args.actorEmail,
      comentario: args.comentario,
      valorContableCambio: valorContableResult.valorContableCambio,
      causacionCambio,
    });
  },
});

export const avanzarFasesContablesConsecutivas = mutation({
  args: {
    asignacionId: v.id("facturacionAsignaciones"),
    finalizarLegalizacionAnticipo: v.optional(v.boolean()),
    resultadoEsperado: v.optional(
      v.union(v.literal("eventos_dian"), v.literal("gerencia"), v.literal("legalizada"))
    ),
    eventosDian: v.optional(usuarioAsignacionValidator),
    ...actorValidator,
    ...valorContableNuevoArg,
    ...causacionArg,
  },
  handler: async (ctx, args) => {
    const comentario = args.comentario.trim();
    if (!comentario) {
      throw new Error("Escribe una observación para dejar trazabilidad.");
    }

    const { asignacion, tarea, empresa } = await getTareaFromAsignacion(ctx, args.asignacionId);
    if (
      (asignacion.fase !== "causacion" && asignacion.fase !== "revision_impuestos") ||
      tarea.estado !== asignacion.fase
    ) {
      throw new Error("La factura no está en una fase contable con salto disponible.");
    }

    const factura = await ctx.db.get("facturacionFacturas", tarea.facturaId);
    if (!factura) throw new Error("Factura no encontrada.");

    const plan = await planificarSaltoFasesContables(ctx, {
      empresa,
      asignacion,
      factura,
    });
    if (!plan) {
      throw new Error(
        "No hay fases contables consecutivas configuradas para el responsable actual."
      );
    }

    validarResultadoEsperadoSalto(args, plan);

    const actual = usuarioDesdeAsignacion(asignacion);
    const eventosDianResuelto =
      plan.destino === "eventos_dian"
        ? await resolverEventosDianParaSalto(ctx, empresa, actual, args.eventosDian ?? null)
        : plan.eventosDian;
    if (!eventosDianResuelto) {
      throw new Error("No se pudo resolver el responsable de Eventos DIAN.");
    }
    const planEjecutable = {
      ...plan,
      eventosDian: eventosDianResuelto,
    } satisfies PlanSaltoFasesContables;

    const causacionCambio = await aplicarCausacionEnFactura(ctx, {
      factura,
      input: args.causacion as CausacionActionInput | undefined,
      actor: {
        userId: args.actorUserId ?? "",
        nombre: args.actorNombre,
        email: args.actorEmail,
      },
      contexto: { tipo: "flujo_factura" },
      faseOperativa: asignacion.fase,
    });

    if (asignacion.fase === "causacion") {
      await validarLegalizacionAnticipoParaAvanzar(ctx, factura);
      await validarLegalizacionCajaMenorParaAvanzar(ctx, factura);
    }
    if (asignacion.fase === "revision_impuestos") {
      await validarLegalizacionAnticipoParaAvanzar(ctx, factura);
    }

    const valorContableResult = await procesarValorContableEnAccion(ctx, {
      factura,
      asignacion,
      valorContableNuevo: args.valorContableNuevo,
      comentario,
      actorUserId: args.actorUserId,
      actorNombre: args.actorNombre,
      actorEmail: args.actorEmail,
    });
    const baseNow = Date.now();
    const facturaActualizada = await ctx.db.get("facturacionFacturas", tarea.facturaId);
    if (!facturaActualizada) throw new Error("Factura no encontrada.");
    const finalizarLegalizacionAnticipo = args.finalizarLegalizacionAnticipo === true;
    if (finalizarLegalizacionAnticipo) {
      await validarFinalizarLegalizacionAnticipoDesdeSalto(ctx, facturaActualizada, planEjecutable);
    }

    if (planEjecutable.desde === "causacion") {
      if (!planEjecutable.contador) {
        throw new Error("No se encontró el contador configurado para el salto.");
      }

      await cerrarAsignacion(ctx, asignacion, "completada", comentario, {
        ...SALTO_FASES_CONTABLES_METADATA,
        destino: planEjecutable.destino,
      });
      const asignacionImpuestos = await crearAsignacionContableSaltada(ctx, {
        tarea,
        empresa,
        fase: "revision_impuestos",
        rol: "contador_impuestos",
        usuario: planEjecutable.contador,
        comentario,
      });
      await registrarAprobacion(ctx, {
        tareaId: tarea._id,
        facturaId: tarea.facturaId,
        asignacionId: asignacion._id,
        empresa,
        actorUserId: args.actorUserId,
        actorNombre: args.actorNombre,
        actorEmail: args.actorEmail,
        accion: "enviar_impuestos",
        comentario,
        estadoAnterior: "causacion",
        estadoNuevo: "revision_impuestos",
        creadoEn: baseNow,
        ...(valorContableResult.valorContableCambio
          ? { valorContableCambio: valorContableResult.valorContableCambio }
          : {}),
        ...(causacionCambio ? { causacionCambio } : {}),
      });

      if (planEjecutable.destino === "eventos_dian") {
        const finalEventos = await crearAsignacionEventosDianFinalSalto(ctx, {
          tarea,
          empresa,
          eventosDian: planEjecutable.eventosDian!,
        });
        const eventosEmail = normalizeEmail(planEjecutable.eventosDian!.email);
        await registrarAprobacion(ctx, {
          tareaId: tarea._id,
          facturaId: tarea.facturaId,
          asignacionId: asignacionImpuestos.asignacionId,
          empresa,
          actorUserId: args.actorUserId,
          actorNombre: args.actorNombre,
          actorEmail: args.actorEmail,
          accion: "asignar_eventos_dian",
          comentario,
          estadoAnterior: "revision_impuestos",
          estadoNuevo: "eventos_dian",
          creadoEn: baseNow + 1,
        });
        await patchTareaEstado(
          ctx,
          tarea,
          "eventos_dian",
          {
            contadorAsignadoAUserId: planEjecutable.contador.usuarioId,
            contadorAsignadoANombre: planEjecutable.contador.nombre,
            contadorAsignadoAEmail: normalizeEmail(planEjecutable.contador.email),
            eventosDianAsignadoAUserId: planEjecutable.eventosDian.usuarioId,
            eventosDianAsignadoANombre: planEjecutable.eventosDian.nombre,
            eventosDianAsignadoAEmail: eventosEmail,
            asignadoAUserId: planEjecutable.eventosDian.usuarioId,
            asignadoANombre: planEjecutable.eventosDian.nombre,
            asignadoAEmail: eventosEmail,
            grupoAsignacionActualId: finalEventos.grupoId,
            currentAsignacionId: finalEventos.asignacionId,
          },
          baseNow + 1
        );
        return {
          targetStage: "eventos_dian",
          skippedStages: planEjecutable.fasesSaltadas,
        };
      }

      const asignacionEventos = await crearAsignacionContableSaltada(ctx, {
        tarea,
        empresa,
        fase: "eventos_dian",
        rol: "eventos_dian",
        usuario: planEjecutable.eventosDian,
        comentario,
      });
      await registrarAprobacion(ctx, {
        tareaId: tarea._id,
        facturaId: tarea.facturaId,
        asignacionId: asignacionImpuestos.asignacionId,
        empresa,
        actorUserId: args.actorUserId,
        actorNombre: args.actorNombre,
        actorEmail: args.actorEmail,
        accion: "asignar_eventos_dian",
        comentario,
        estadoAnterior: "revision_impuestos",
        estadoNuevo: "eventos_dian",
        creadoEn: baseNow + 1,
      });

      if (finalizarLegalizacionAnticipo) {
        await registrarLegalizacionAnticipoDesdeSaltoContable(ctx, {
          tarea,
          asignacionId: asignacionEventos.asignacionId,
          asignadoAUserId:
            planEjecutable.eventosDian.usuarioId ?? args.actorUserId ?? "sin-usuario",
          asignadoANombre: planEjecutable.eventosDian.nombre,
          asignadoAEmail: normalizeEmail(planEjecutable.eventosDian.email),
          grupoId: asignacionEventos.grupoId,
          empresa,
          actorUserId: args.actorUserId ?? "sin-usuario",
          actorNombre: args.actorNombre,
          actorEmail: args.actorEmail,
          comentario,
          estadoAnterior: "eventos_dian",
          creadoEn: baseNow + 2,
          tareaPatch: {
            contadorAsignadoAUserId: planEjecutable.contador.usuarioId,
            contadorAsignadoANombre: planEjecutable.contador.nombre,
            contadorAsignadoAEmail: normalizeEmail(planEjecutable.contador.email),
            eventosDianAsignadoAUserId: planEjecutable.eventosDian.usuarioId,
            eventosDianAsignadoANombre: planEjecutable.eventosDian.nombre,
            eventosDianAsignadoAEmail: normalizeEmail(planEjecutable.eventosDian.email),
          },
        });
        return {
          targetStage: "legalizada",
          skippedStages: planEjecutable.fasesSaltadas,
        };
      }

      const finalGerencia = await crearAsignacionGerenciaFinalSalto(ctx, {
        tarea,
        empresa,
      });
      await registrarAprobacion(ctx, {
        tareaId: tarea._id,
        facturaId: tarea.facturaId,
        asignacionId: asignacionEventos.asignacionId,
        empresa,
        actorUserId: args.actorUserId,
        actorNombre: args.actorNombre,
        actorEmail: args.actorEmail,
        accion: "asignar_gerencia",
        comentario,
        estadoAnterior: "eventos_dian",
        estadoNuevo: "gerencia",
        creadoEn: baseNow + 2,
      });
      await patchTareaEstado(
        ctx,
        tarea,
        "gerencia",
        {
          contadorAsignadoAUserId: planEjecutable.contador.usuarioId,
          contadorAsignadoANombre: planEjecutable.contador.nombre,
          contadorAsignadoAEmail: normalizeEmail(planEjecutable.contador.email),
          eventosDianAsignadoAUserId: planEjecutable.eventosDian.usuarioId,
          eventosDianAsignadoANombre: planEjecutable.eventosDian.nombre,
          eventosDianAsignadoAEmail: normalizeEmail(planEjecutable.eventosDian.email),
          gerenciaAsignadoAUserId: finalGerencia.gerencia.usuarioId,
          gerenciaAsignadoANombre: finalGerencia.gerencia.nombre,
          gerenciaAsignadoAEmail: normalizeEmail(finalGerencia.gerencia.email),
          asignadoAUserId: finalGerencia.gerencia.usuarioId,
          asignadoANombre: finalGerencia.gerencia.nombre,
          asignadoAEmail: normalizeEmail(finalGerencia.gerencia.email),
          grupoAsignacionActualId: finalGerencia.grupoId,
          currentAsignacionId: finalGerencia.asignacionId,
        },
        baseNow + 2
      );
      return {
        targetStage: "gerencia",
        skippedStages: planEjecutable.fasesSaltadas,
      };
    }

    await cerrarAsignacion(ctx, asignacion, "completada", comentario, {
      ...SALTO_FASES_CONTABLES_METADATA,
      destino: planEjecutable.destino,
    });
    await cancelarPendientesDelGrupo(ctx, asignacion.grupoId, asignacion._id, {
      tareaId: tarea._id,
      facturaId: tarea.facturaId,
      empresa,
      actorUserId: args.actorUserId,
      actorNombre: args.actorNombre,
      actorEmail: args.actorEmail,
      estadoAnterior: "revision_impuestos",
      estadoNuevo: "eventos_dian",
    });
    const asignacionEventos = await crearAsignacionContableSaltada(ctx, {
      tarea,
      empresa,
      fase: "eventos_dian",
      rol: "eventos_dian",
      usuario: planEjecutable.eventosDian,
      comentario,
    });
    await registrarAprobacion(ctx, {
      tareaId: tarea._id,
      facturaId: tarea.facturaId,
      asignacionId: asignacion._id,
      empresa,
      actorUserId: args.actorUserId,
      actorNombre: args.actorNombre,
      actorEmail: args.actorEmail,
      accion: "asignar_eventos_dian",
      comentario,
      estadoAnterior: "revision_impuestos",
      estadoNuevo: "eventos_dian",
      creadoEn: baseNow,
      ...(valorContableResult.valorContableCambio
        ? { valorContableCambio: valorContableResult.valorContableCambio }
        : {}),
      ...(causacionCambio ? { causacionCambio } : {}),
    });

    if (finalizarLegalizacionAnticipo) {
      await registrarLegalizacionAnticipoDesdeSaltoContable(ctx, {
        tarea,
        asignacionId: asignacionEventos.asignacionId,
        asignadoAUserId: planEjecutable.eventosDian.usuarioId ?? args.actorUserId ?? "sin-usuario",
        asignadoANombre: planEjecutable.eventosDian.nombre,
        asignadoAEmail: normalizeEmail(planEjecutable.eventosDian.email),
        grupoId: asignacionEventos.grupoId,
        empresa,
        actorUserId: args.actorUserId ?? "sin-usuario",
        actorNombre: args.actorNombre,
        actorEmail: args.actorEmail,
        comentario,
        estadoAnterior: "eventos_dian",
        creadoEn: baseNow + 1,
        tareaPatch: {
          eventosDianAsignadoAUserId: planEjecutable.eventosDian.usuarioId,
          eventosDianAsignadoANombre: planEjecutable.eventosDian.nombre,
          eventosDianAsignadoAEmail: normalizeEmail(planEjecutable.eventosDian.email),
        },
      });
      return {
        targetStage: "legalizada",
        skippedStages: planEjecutable.fasesSaltadas,
      };
    }

    const finalGerencia = await crearAsignacionGerenciaFinalSalto(ctx, {
      tarea,
      empresa,
    });
    await registrarAprobacion(ctx, {
      tareaId: tarea._id,
      facturaId: tarea.facturaId,
      asignacionId: asignacionEventos.asignacionId,
      empresa,
      actorUserId: args.actorUserId,
      actorNombre: args.actorNombre,
      actorEmail: args.actorEmail,
      accion: "asignar_gerencia",
      comentario,
      estadoAnterior: "eventos_dian",
      estadoNuevo: "gerencia",
      creadoEn: baseNow + 1,
    });
    await patchTareaEstado(
      ctx,
      tarea,
      "gerencia",
      {
        eventosDianAsignadoAUserId: planEjecutable.eventosDian.usuarioId,
        eventosDianAsignadoANombre: planEjecutable.eventosDian.nombre,
        eventosDianAsignadoAEmail: normalizeEmail(planEjecutable.eventosDian.email),
        gerenciaAsignadoAUserId: finalGerencia.gerencia.usuarioId,
        gerenciaAsignadoANombre: finalGerencia.gerencia.nombre,
        gerenciaAsignadoAEmail: normalizeEmail(finalGerencia.gerencia.email),
        asignadoAUserId: finalGerencia.gerencia.usuarioId,
        asignadoANombre: finalGerencia.gerencia.nombre,
        asignadoAEmail: normalizeEmail(finalGerencia.gerencia.email),
        grupoAsignacionActualId: finalGerencia.grupoId,
        currentAsignacionId: finalGerencia.asignacionId,
      },
      baseNow + 1
    );
    return {
      targetStage: "gerencia",
      skippedStages: planEjecutable.fasesSaltadas,
    };
  },
});

export const devolverAFase = mutation({
  args: {
    asignacionId: v.id("facturacionAsignaciones"),
    faseDestino: faseDevolucionValidator,
    ...causacionArg,
    ...actorValidator,
  },
  handler: async (ctx, args) => {
    const { asignacion, tarea } = await getTareaFromAsignacion(ctx, args.asignacionId);
    if (isEstadoTerminalFacturacion(tarea.estado)) {
      throw new Error("No se puede devolver una factura cerrada.");
    }
    if (asignacion.fase === args.faseDestino) {
      throw new Error("Selecciona una fase diferente para devolver.");
    }
    assertDestinoDevolucionValido(tarea.estado, args.faseDestino);

    let causacionCambio: NonNullable<Doc<"facturacionAprobaciones">["causacionCambio"]> | undefined;
    if (args.causacion) {
      const actorUserId = args.actorUserId ?? "";
      if (
        !["causacion", "revision_impuestos", "eventos_dian"].includes(tarea.estado) ||
        asignacion.asignadoAUserId !== actorUserId
      ) {
        throw new Error("No puedes editar la causación desde esta fase.");
      }
      const factura = await ctx.db.get("facturacionFacturas", tarea.facturaId);
      if (!factura) throw new Error("Factura no encontrada.");
      causacionCambio = await aplicarCausacionEnFactura(ctx, {
        factura,
        input: args.causacion as CausacionActionInput,
        actor: {
          userId: actorUserId,
          nombre: args.actorNombre,
          email: args.actorEmail,
        },
        contexto: { tipo: "flujo_factura" },
        faseOperativa: tarea.estado,
      });
    }

    await crearDevolucionAFase(ctx, {
      tarea,
      asignacionOrigen: asignacion,
      faseDestino: args.faseDestino,
      actorUserId: args.actorUserId ?? "",
      comentario: args.comentario,
      ...(causacionCambio ? { causacionCambio } : {}),
    });
  },
});

export const solicitarRechazoDianAsignacion = mutation({
  args: {
    asignacionId: v.id("facturacionAsignaciones"),
    ...causacionArg,
    ...actorValidator,
  },
  handler: async (ctx, args) => {
    const { asignacion, tarea, empresa } = await getTareaFromAsignacion(ctx, args.asignacionId);
    const factura = await ctx.db.get("facturacionFacturas", tarea.facturaId);
    if (!factura) throw new Error("Factura no encontrada.");
    const causacionCambio = await aplicarCausacionEnFactura(ctx, {
      factura,
      input: args.causacion as CausacionActionInput | undefined,
      actor: {
        userId: args.actorUserId ?? "",
        nombre: args.actorNombre,
        email: args.actorEmail,
      },
      contexto: { tipo: "flujo_factura" },
      faseOperativa: asignacion.fase,
    });
    await solicitarRechazoDianDesdeAsignacion(ctx, {
      asignacion,
      tarea,
      empresa,
      actorUserId: args.actorUserId,
      actorNombre: args.actorNombre,
      actorEmail: args.actorEmail,
      comentario: args.comentario,
      ...(causacionCambio ? { causacionCambio } : {}),
    });
  },
});

export const confirmarRechazoDianAsignacion = mutation({
  args: {
    asignacionId: v.id("facturacionAsignaciones"),
    ...actorValidator,
  },
  handler: async (ctx, args) => {
    const { asignacion, tarea, empresa } = await getTareaFromAsignacion(ctx, args.asignacionId);
    await confirmarRechazoDian(ctx, {
      tarea,
      asignacion,
      empresa,
      actorUserId: args.actorUserId,
      actorNombre: args.actorNombre,
      actorEmail: args.actorEmail,
      comentario: args.comentario,
    });
  },
});

export const aprobarGerencia = mutation({
  args: {
    asignacionId: v.id("facturacionAsignaciones"),
    ...actorValidator,
  },
  handler: async (ctx, args) => {
    const { asignacion, tarea, empresa } = await getTareaFromAsignacion(ctx, args.asignacionId);
    // Actor derived server-side; client-sent actor* args are ignored.
    const actor = await resolverActorAsignacion(ctx, asignacion);
    if (asignacion.fase !== "gerencia" || tarea.estado !== "gerencia") {
      throw new Error("La factura ya no está en aprobación de gerencia.");
    }
    const estadoNuevo = "revision_tesoreria";

    await cerrarAsignacion(ctx, asignacion, "completada", args.comentario);
    await cancelarPendientesDelGrupo(ctx, asignacion.grupoId, asignacion._id, {
      tareaId: tarea._id,
      facturaId: tarea.facturaId,
      empresa,
      actorUserId: actor.actorUserId,
      actorNombre: actor.actorNombre,
      actorEmail: actor.actorEmail,
      estadoAnterior: tarea.estado,
      estadoNuevo,
    });

    const tesorero = await getTesorero(ctx, empresa);
    const grupoId = createGroupId("revision_tesoreria", tarea.facturaId);
    const tesoreriaId = await insertarAsignacion(ctx, {
      facturaId: tarea.facturaId,
      tareaId: tarea._id,
      empresa,
      fase: "revision_tesoreria",
      rol: "tesorero",
      grupoId,
      usuario: tesorero,
    });

    await registrarAprobacion(ctx, {
      tareaId: tarea._id,
      facturaId: tarea.facturaId,
      asignacionId: asignacion._id,
      empresa,
      actorUserId: actor.actorUserId,
      actorNombre: actor.actorNombre,
      actorEmail: actor.actorEmail,
      accion: "aprobar_gerencia",
      comentario: args.comentario,
      estadoAnterior: tarea.estado,
      estadoNuevo,
    });

    await patchTareaEstado(ctx, tarea, "revision_tesoreria", {
      tesoreroAsignadoAUserId: tesorero.usuarioId,
      tesoreroAsignadoANombre: tesorero.nombre,
      tesoreroAsignadoAEmail: normalizeEmail(tesorero.email),
      asignadoAUserId: tesorero.usuarioId,
      asignadoANombre: tesorero.nombre,
      asignadoAEmail: normalizeEmail(tesorero.email),
      grupoAsignacionActualId: grupoId,
      currentAsignacionId: tesoreriaId,
    });
  },
});

async function finalizarTesoreriaSinDesembolso(
  ctx: MutationCtx,
  args: {
    asignacion: Doc<"facturacionAsignaciones">;
    tarea: Doc<"facturacionTareas">;
    empresa: number;
    actorUserId?: string;
    actorNombre: string;
    actorEmail: string;
    comentario: string;
  }
) {
  const factura = await ctx.db.get("facturacionFacturas", args.tarea.facturaId);
  if (!factura) throw new Error("Factura no encontrada");

  await validarElegibilidadSinDesembolso(ctx, {
    factura,
    tarea: args.tarea,
    asignacion: args.asignacion,
  });

  const legalizacionesActivas = await listarLegalizacionesActivasFactura(ctx, factura._id);
  const documentosInternosActivos = await sumarDocumentosInternosActivos(ctx, factura._id);
  const comentarioLegalizacion = buildComentarioSinDesembolso({
    userComment: args.comentario,
    tieneDocumentosInternos: documentosInternosActivos.count > 0,
    tieneAnticipos: legalizacionesActivas.length > 0,
  });
  const now = Date.now();

  await cerrarAsignacion(ctx, args.asignacion, "completada", comentarioLegalizacion);
  await cancelarPendientesDelGrupo(ctx, args.asignacion.grupoId, args.asignacion._id, {
    tareaId: args.tarea._id,
    facturaId: args.tarea.facturaId,
    empresa: args.empresa,
    actorUserId: args.actorUserId,
    actorNombre: args.actorNombre,
    actorEmail: args.actorEmail,
    estadoAnterior: args.tarea.estado,
    estadoNuevo: "legalizada",
  });

  await registrarAprobacion(ctx, {
    tareaId: args.tarea._id,
    facturaId: args.tarea.facturaId,
    asignacionId: args.asignacion._id,
    empresa: args.empresa,
    actorUserId: args.actorUserId,
    actorNombre: args.actorNombre,
    actorEmail: args.actorEmail,
    accion: "legalizar_factura",
    comentario: comentarioLegalizacion,
    estadoAnterior: args.tarea.estado,
    estadoNuevo: "legalizada",
  });

  if (factura.valorAPagar !== undefined && factura.valorAPagar !== 0) {
    await ctx.db.patch("facturacionFacturas", factura._id, { valorAPagar: 0, actualizadoEn: now });
  }

  await patchTareaEstado(
    ctx,
    args.tarea,
    "legalizada",
    {
      asignadoAUserId: args.asignacion.asignadoAUserId,
      asignadoANombre: args.asignacion.asignadoANombre,
      asignadoAEmail: normalizeEmail(args.asignacion.asignadoAEmail),
      grupoAsignacionActualId: args.asignacion.grupoId,
      currentAsignacionId: args.asignacion._id,
    },
    now
  );
  await programarNotificacionEstadoTerminal(ctx, args.tarea, "legalizada", comentarioLegalizacion);
}

async function obtenerSaldoTesoreriaAutoritativo(
  ctx: MutationCtx,
  factura: Doc<"facturacionFacturas">,
  now: number
) {
  const calculo = await calcularValorAPagarFactura(ctx, factura);
  if (calculo.valorAPagar !== undefined) {
    if (factura.valorAPagar !== calculo.valorAPagar) {
      await ctx.db.patch("facturacionFacturas", factura._id, {
        valorAPagar: calculo.valorAPagar,
        actualizadoEn: now,
      });
    }
    return calculo.valorAPagar;
  }

  const aprobaciones = await ctx.db
    .query("facturacionAprobaciones")
    .withIndex("by_facturaId", (q) => q.eq("facturaId", factura._id))
    .collect();
  const pagosParciales = getPagosAplicadosFromAprobaciones(
    aprobaciones.filter((item) => item.accion === "pago_parcial")
  );
  return Math.max(0, getValorContable(factura) - pagosParciales);
}

export const registrarPagoAsignacion = mutation({
  args: {
    asignacionId: v.id("facturacionAsignaciones"),
    comprobantePagoStorageId: v.optional(v.id("_storage")),
    comprobantePagoNombre: v.optional(v.string()),
    sinDesembolso: v.optional(v.boolean()),
    ...actorValidator,
  },
  handler: async (ctx, args) => {
    const { asignacion, tarea, empresa } = await getTareaFromAsignacion(ctx, args.asignacionId);
    if (asignacion.fase !== "revision_tesoreria" || tarea.estado !== "revision_tesoreria") {
      throw new Error("La factura debe estar en revisión de tesorería.");
    }

    const factura = await ctx.db.get("facturacionFacturas", tarea.facturaId);
    if (!factura) throw new Error("Factura no encontrada");

    if (args.sinDesembolso === true) {
      await finalizarTesoreriaSinDesembolso(ctx, {
        asignacion,
        tarea,
        empresa,
        actorUserId: args.actorUserId,
        actorNombre: args.actorNombre,
        actorEmail: args.actorEmail,
        comentario: args.comentario,
      });
      return;
    }

    const now = Date.now();
    const saldoVigente = await obtenerSaldoTesoreriaAutoritativo(ctx, factura, now);

    if (
      factura.esLegalizacionAnticipo &&
      factura.valorAPagar !== undefined &&
      saldoVigente <= 0.001
    ) {
      const aprobaciones = await ctx.db
        .query("facturacionAprobaciones")
        .withIndex("by_facturaId", (q) => q.eq("facturaId", factura._id))
        .collect();
      const pagosAplicados = getPagosAplicadosFromAprobaciones(aprobaciones);
      if (pagosAplicados <= 0.001) {
        throw new Error(
          "El saldo a pagar ya está en cero. Usa Confirmar sin desembolso para finalizar la factura."
        );
      }
    }

    const montoPagoFinal = saldoVigente;

    await cerrarAsignacion(ctx, asignacion, "completada", args.comentario);
    await registrarAprobacion(ctx, {
      tareaId: tarea._id,
      facturaId: tarea.facturaId,
      asignacionId: asignacion._id,
      empresa,
      actorUserId: args.actorUserId,
      actorNombre: args.actorNombre,
      actorEmail: args.actorEmail,
      accion: "registrar_pago",
      comentario: args.comentario,
      estadoAnterior: tarea.estado,
      estadoNuevo: "pagada",
      pagoFinal: {
        monto: montoPagoFinal,
        moneda: factura.moneda,
        sinDesembolso: false,
      },
    });

    if (factura.esLegalizacionAnticipo && factura.valorAPagar !== undefined) {
      await ctx.db.patch("facturacionFacturas", factura._id, { valorAPagar: 0, actualizadoEn: now });
    }

    await patchTareaEstado(ctx, tarea, "pagada", {
      ...(args.comprobantePagoStorageId
        ? { comprobantePagoStorageId: args.comprobantePagoStorageId }
        : {}),
      ...(args.comprobantePagoNombre ? { comprobantePagoNombre: args.comprobantePagoNombre } : {}),
    });
    await refrescarProyeccionFactura(ctx, tarea.facturaId, now);
    await programarNotificacionEstadoTerminal(ctx, tarea, "pagada", args.comentario);
  },
});

export const registrarPagoParcialAsignacion = mutation({
  args: {
    asignacionId: v.id("facturacionAsignaciones"),
    monto: v.number(),
    comprobanteStorageId: v.id("_storage"),
    comprobanteNombre: v.string(),
    comprobanteMimeType: v.optional(v.string()),
    comprobanteSize: v.optional(v.number()),
    ...actorValidator,
  },
  handler: async (ctx, args) => {
    const comentario = args.comentario.trim();
    if (!comentario) {
      throw new Error("La observación es obligatoria para registrar el pago parcial.");
    }
    if (args.monto <= 0) {
      throw new Error("El monto del pago parcial debe ser mayor a cero.");
    }

    const { asignacion, tarea, empresa } = await getTareaFromAsignacion(ctx, args.asignacionId);
    if (asignacion.fase !== "revision_tesoreria" || tarea.estado !== "revision_tesoreria") {
      throw new Error("La factura debe estar en revisión de tesorería.");
    }

    const factura = await ctx.db.get("facturacionFacturas", tarea.facturaId);
    if (!factura) throw new Error("Factura no encontrada");

    const saldoPendiente = getSaldoTesoreriaFactura(factura);
    if (saldoPendiente <= 0.001) {
      throw new Error("No queda saldo pendiente para registrar otro pago parcial.");
    }
    if (args.monto > saldoPendiente + 0.001) {
      throw new Error(
        `El monto del pago parcial no puede superar el saldo pendiente (${saldoPendiente}).`
      );
    }

    const now = Date.now();

    await ctx.db.insert("facturacionAdjuntos", {
      facturaId: tarea.facturaId,
      empresa,
      asignacionId: asignacion._id,
      storageId: args.comprobanteStorageId,
      nombre: args.comprobanteNombre,
      ...(args.comprobanteMimeType ? { mimeType: args.comprobanteMimeType } : {}),
      ...(typeof args.comprobanteSize === "number" ? { size: args.comprobanteSize } : {}),
      ...(args.actorUserId ? { subidoPorUserId: args.actorUserId } : {}),
      subidoPorNombre: args.actorNombre,
      subidoPorEmail: normalizeEmail(args.actorEmail),
      creadoEn: now,
    });

    await registrarAprobacion(ctx, {
      tareaId: tarea._id,
      facturaId: tarea.facturaId,
      asignacionId: asignacion._id,
      empresa,
      actorUserId: args.actorUserId,
      actorNombre: args.actorNombre,
      actorEmail: args.actorEmail,
      accion: "pago_parcial",
      comentario,
      estadoAnterior: tarea.estado,
      estadoNuevo: tarea.estado,
      pagoParcial: {
        monto: args.monto,
        comprobanteStorageId: args.comprobanteStorageId,
        comprobanteNombre: args.comprobanteNombre,
      },
    });

    await patchTareaEstado(ctx, tarea, tarea.estado, {});
    await ctx.db.patch("facturacionAsignaciones", asignacion._id, {
      actualizadoEn: now,
    });

    if (factura.esLegalizacionAnticipo && factura.valorAPagar !== undefined) {
      await ctx.db.patch("facturacionFacturas", factura._id, {
        valorAPagar: Math.max(0, saldoPendiente - args.monto),
        actualizadoEn: now,
      });
      await refrescarProyeccionFactura(ctx, tarea.facturaId, now);
    }
  },
});

// ========= Compatibilidad con flujo legacy =========
export const aceptarFactura = mutation({
  args: {
    tareaId: v.id("facturacionTareas"),
    ...actorValidator,
  },
  handler: async (ctx, args) => {
    const tarea = await ctx.db.get("facturacionTareas", args.tareaId);
    if (!tarea) throw new Error("Tarea no encontrada");
    if (tarea.estado !== "revision_lider") {
      throw new Error("La factura ya no está en revisión del líder");
    }

    await revertirLegalizacionesCajaMenorFactura(ctx, tarea.facturaId, Date.now());
    await anularMovimientosCajaMenorFacturaInterno(
      ctx,
      tarea.facturaId,
      {
        actorUserId: args.actorUserId,
        actorNombre: args.actorNombre,
        actorEmail: args.actorEmail,
      },
      args.comentario
    );
    await registrarAprobacion(ctx, {
      tareaId: tarea._id,
      facturaId: tarea.facturaId,
      empresa: tarea.empresa,
      actorUserId: args.actorUserId,
      actorNombre: args.actorNombre,
      actorEmail: args.actorEmail,
      accion: "aceptar",
      comentario: args.comentario,
      estadoAnterior: tarea.estado,
      estadoNuevo: "aceptada",
    });

    await ctx.db.patch("facturacionTareas", args.tareaId, {
      estado: "aceptada",
      actualizadoEn: Date.now(),
    });
  },
});

export const rechazarFactura = mutation({
  args: {
    tareaId: v.id("facturacionTareas"),
    ...actorValidator,
  },
  handler: async (ctx, args) => {
    const tarea = await ctx.db.get("facturacionTareas", args.tareaId);
    if (!tarea) throw new Error("Tarea no encontrada");
    if (tarea.estado !== "revision_lider") {
      throw new Error("La factura ya no está en revisión del líder");
    }

    await registrarAprobacion(ctx, {
      tareaId: tarea._id,
      facturaId: tarea.facturaId,
      empresa: tarea.empresa,
      actorUserId: args.actorUserId,
      actorNombre: args.actorNombre,
      actorEmail: args.actorEmail,
      accion: "rechazar",
      comentario: args.comentario,
      estadoAnterior: tarea.estado,
      estadoNuevo: "rechazada",
    });

    await ctx.db.patch("facturacionTareas", args.tareaId, {
      estado: "rechazada",
      actualizadoEn: Date.now(),
    });
  },
});

export const enviarACausacion = mutation({
  args: {
    tareaId: v.id("facturacionTareas"),
    asignadoAUserId: v.optional(v.string()),
    asignadoANombre: v.optional(v.string()),
    asignadoAEmail: v.optional(v.string()),
    ...actorValidator,
  },
  handler: async (ctx, args) => {
    const tarea = await ctx.db.get("facturacionTareas", args.tareaId);
    if (!tarea) throw new Error("Tarea no encontrada");
    if (tarea.estado !== "aceptada" && tarea.estado !== "revision_lider") {
      throw new Error("La factura debe estar aceptada para pasar a análisis");
    }

    await crearAsignacionCausacion(ctx, tarea, {
      actorUserId: args.actorUserId,
      actorNombre: args.actorNombre,
      actorEmail: args.actorEmail,
      comentario: args.comentario,
    });
  },
});

export const enviarATesoreria = mutation({
  args: {
    tareaId: v.id("facturacionTareas"),
    asignadoAUserId: v.optional(v.string()),
    asignadoANombre: v.string(),
    asignadoAEmail: v.string(),
    ...actorValidator,
  },
  handler: async (ctx, args) => {
    const tarea = await ctx.db.get("facturacionTareas", args.tareaId);
    if (!tarea) throw new Error("Tarea no encontrada");
    if (tarea.estado !== "causacion") {
      throw new Error("La factura debe estar en análisis para pasar a tesorería");
    }

    await registrarAprobacion(ctx, {
      tareaId: tarea._id,
      facturaId: tarea.facturaId,
      empresa: tarea.empresa,
      actorUserId: args.actorUserId,
      actorNombre: args.actorNombre,
      actorEmail: args.actorEmail,
      accion: "aprobar_pago",
      comentario: args.comentario,
      estadoAnterior: tarea.estado,
      estadoNuevo: "revision_tesoreria",
    });

    await ctx.db.patch("facturacionTareas", args.tareaId, {
      estado: "revision_tesoreria",
      asignadoANombre: args.asignadoANombre,
      asignadoAEmail: normalizeEmail(args.asignadoAEmail),
      actualizadoEn: Date.now(),
      ...(args.asignadoAUserId ? { asignadoAUserId: args.asignadoAUserId } : {}),
    });
  },
});

export const registrarPago = mutation({
  args: {
    tareaId: v.id("facturacionTareas"),
    comprobantePagoStorageId: v.optional(v.id("_storage")),
    comprobantePagoNombre: v.optional(v.string()),
    sinDesembolso: v.optional(v.boolean()),
    ...actorValidator,
  },
  handler: async (ctx, args) => {
    const tarea = await ctx.db.get("facturacionTareas", args.tareaId);
    if (!tarea) throw new Error("Tarea no encontrada");
    if (tarea.estado !== "revision_tesoreria") {
      throw new Error("La factura debe estar en revisión de tesorería");
    }

    const factura = await ctx.db.get("facturacionFacturas", tarea.facturaId);
    if (!factura) throw new Error("Factura no encontrada");

    const asignacion = tarea.currentAsignacionId
      ? await ctx.db.get("facturacionAsignaciones", tarea.currentAsignacionId)
      : null;
    if (!asignacion || asignacion.estado !== "pendiente") {
      throw new Error("La asignación ya no está activa.");
    }
    if (asignacion.fase !== "revision_tesoreria") {
      throw new Error("La factura debe estar en revisión de tesorería.");
    }
    // Actor derived server-side; client-sent actor* args are ignored.
    const actor = await resolverActorAsignacion(ctx, asignacion);

    if (args.sinDesembolso === true) {
      await finalizarTesoreriaSinDesembolso(ctx, {
        asignacion,
        tarea,
        empresa: normalizeEmpresa(tarea.empresa),
        actorUserId: actor.actorUserId,
        actorNombre: actor.actorNombre,
        actorEmail: actor.actorEmail,
        comentario: args.comentario,
      });
      return;
    }

    const now = Date.now();
    const saldoVigente = await obtenerSaldoTesoreriaAutoritativo(ctx, factura, now);

    if (
      factura.esLegalizacionAnticipo &&
      factura.valorAPagar !== undefined &&
      saldoVigente <= 0.001
    ) {
      const aprobaciones = await ctx.db
        .query("facturacionAprobaciones")
        .withIndex("by_facturaId", (q) => q.eq("facturaId", factura._id))
        .collect();
      const pagosAplicados = getPagosAplicadosFromAprobaciones(aprobaciones);
      if (pagosAplicados <= 0.001) {
        throw new Error(
          "El saldo a pagar ya está en cero. Usa Confirmar sin desembolso para finalizar la factura."
        );
      }
    }

    await cerrarAsignacion(ctx, asignacion, "completada", args.comentario);

    await registrarAprobacion(ctx, {
      tareaId: tarea._id,
      facturaId: tarea.facturaId,
      asignacionId: asignacion._id,
      empresa: tarea.empresa,
      actorUserId: actor.actorUserId,
      actorNombre: actor.actorNombre,
      actorEmail: actor.actorEmail,
      accion: "registrar_pago",
      comentario: args.comentario,
      estadoAnterior: tarea.estado,
      estadoNuevo: "pagada",
      pagoFinal: {
        monto: saldoVigente,
        moneda: factura.moneda,
        sinDesembolso: false,
      },
    });

    if (factura.esLegalizacionAnticipo && factura.valorAPagar !== undefined) {
      await ctx.db.patch("facturacionFacturas", factura._id, { valorAPagar: 0, actualizadoEn: now });
    }

    await patchTareaEstado(ctx, tarea, "pagada", {
      ...(args.comprobantePagoStorageId
        ? { comprobantePagoStorageId: args.comprobantePagoStorageId }
        : {}),
      ...(args.comprobantePagoNombre ? { comprobantePagoNombre: args.comprobantePagoNombre } : {}),
    });
    await programarNotificacionEstadoTerminal(ctx, tarea, "pagada", args.comentario);
  },
});

export const agregarComentario = mutation({
  args: {
    tareaId: v.id("facturacionTareas"),
    ...actorValidator,
  },
  handler: async (ctx, args) => {
    const tarea = await ctx.db.get("facturacionTareas", args.tareaId);
    if (!tarea) throw new Error("Tarea no encontrada");

    await registrarAprobacion(ctx, {
      tareaId: tarea._id,
      facturaId: tarea.facturaId,
      empresa: tarea.empresa,
      actorUserId: args.actorUserId,
      actorNombre: args.actorNombre,
      actorEmail: args.actorEmail,
      accion: "comentar",
      comentario: args.comentario,
      estadoAnterior: tarea.estado,
      estadoNuevo: tarea.estado,
    });

    await ctx.db.patch("facturacionTareas", args.tareaId, {
      actualizadoEn: Date.now(),
    });
  },
});

export const marcarEsLegalizacionAnticipo = mutation({
  args: {
    tareaId: v.id("facturacionTareas"),
    asignacionId: v.optional(v.id("facturacionAsignaciones")),
    esLegalizacionAnticipo: v.boolean(),
    anticipoProcesoId: v.optional(v.number()),
    anticipoProcesoNombre: v.optional(v.string()),
    actorUserId: v.optional(v.string()),
    actorNombre: v.string(),
    actorEmail: v.string(),
  },
  handler: async (ctx, args) => {
    const tarea = await ctx.db.get("facturacionTareas", args.tareaId);
    if (!tarea) throw new Error("Tarea no encontrada");

    const factura = await ctx.db.get("facturacionFacturas", tarea.facturaId);
    if (!factura) throw new Error("Factura no encontrada");

    const marcandoDesdeCausacion = args.esLegalizacionAnticipo && tarea.estado === "causacion";
    const marcandoDesdeLider =
      args.esLegalizacionAnticipo &&
      (tarea.estado === "revision_lider" || tarea.estado === "jefe_directo");
    const puedeMarcar = marcandoDesdeLider || marcandoDesdeCausacion;
    const puedeDesmarcar =
      tarea.estado === "revision_lider" ||
      tarea.estado === "jefe_directo" ||
      tarea.estado === "causacion";

    if (tarea.estado === "revision_impuestos") {
      throw new Error(
        args.esLegalizacionAnticipo
          ? "Contabilidad no puede marcar una factura como anticipo."
          : "Contabilidad no puede desmarcar una factura como anticipo."
      );
    }

    if (
      (args.esLegalizacionAnticipo && !puedeMarcar) ||
      (!args.esLegalizacionAnticipo && !puedeDesmarcar)
    ) {
      throw new Error(
        args.esLegalizacionAnticipo
          ? "El anticipo sólo se marca durante la revisión del líder, jefe directo o causación."
          : "El anticipo sólo se desmarca durante la revisión del líder, jefe directo o causación."
      );
    }

    if (args.esLegalizacionAnticipo) {
      if (isFacturaPeajes(factura) || isNotaCreditoNoPeajes(factura)) {
        throw new Error("Este tipo de documento no admite legalización de anticipo.");
      }
      if (factura.esLegalizacionCajaMenor) {
        throw new Error("Desmarca Caja Menor antes de marcar como anticipo.");
      }
    }

    const asignacion = args.asignacionId
      ? await ctx.db.get("facturacionAsignaciones", args.asignacionId)
      : tarea.currentAsignacionId
        ? await ctx.db.get("facturacionAsignaciones", tarea.currentAsignacionId)
        : null;
    const faseEsperada =
      tarea.estado === "jefe_directo"
        ? "jefe_directo"
        : tarea.estado === "causacion"
          ? "causacion"
          : "revision_lider";
    const asignacionActivaValida =
      asignacion &&
      asignacion.tareaId === tarea._id &&
      asignacion.fase === faseEsperada &&
      asignacion.estado === "pendiente";
    if (args.esLegalizacionAnticipo && !asignacionActivaValida) {
      throw new Error("No se encontró la asignación activa para marcar el anticipo.");
    }
    if (!args.esLegalizacionAnticipo && asignacion && !asignacionActivaValida) {
      throw new Error("No se encontró la asignación activa para desmarcar el anticipo.");
    }

    const marcadorUserId = asignacion?.asignadoAUserId ?? args.actorUserId;
    const marcadorNombre = asignacion?.asignadoANombre ?? args.actorNombre;
    const marcadorEmail = normalizeEmail(asignacion?.asignadoAEmail ?? args.actorEmail);

    let liderRemitente: UsuarioConfig | null = null;
    if (marcandoDesdeCausacion && asignacion) {
      liderRemitente = await resolverRemitenteLiderDevolucion(ctx, tarea, asignacion);
      if (!liderRemitente?.usuarioId) {
        throw new Error("No se pudo identificar al líder remitente.");
      }
      if (!hasProcesoSnapshot(liderRemitente)) {
        throw new Error("El líder remitente no tiene proceso asignado.");
      }
    }

    const procesoAsignacion = marcandoDesdeCausacion
      ? {
          procesoId: liderRemitente?.procesoId,
          procesoNombre: liderRemitente?.procesoNombre,
        }
      : tarea.estado === "revision_lider"
        ? {
            procesoId: asignacion?.asignadoAProcesoId,
            procesoNombre: asignacion?.asignadoAProcesoNombre,
          }
        : {
            procesoId: tarea.liderProcesoProcesoId,
            procesoNombre: tarea.liderProcesoProcesoNombre,
          };
    const procesoSnapshot = getProcesoSnapshot({
      procesoId: procesoAsignacion.procesoId ?? args.anticipoProcesoId,
      procesoNombre: procesoAsignacion.procesoNombre ?? args.anticipoProcesoNombre,
    });

    const anterior = Boolean(factura.esLegalizacionAnticipo);
    if (
      anterior === args.esLegalizacionAnticipo &&
      (!args.esLegalizacionAnticipo || factura.anticipoBolsaId)
    ) {
      return;
    }

    if (args.esLegalizacionAnticipo && marcandoDesdeLider && !marcadorUserId) {
      throw new Error("No se pudo identificar quién marcó el anticipo.");
    }
    if (!args.esLegalizacionAnticipo && factura.anticipoLiderUserId) {
      const esDueno =
        (marcadorUserId && factura.anticipoLiderUserId === marcadorUserId) ||
        normalizeEmail(factura.anticipoLiderEmail ?? "") === marcadorEmail;
      const esAsignadoActivo = Boolean(asignacionActivaValida);
      if (!esDueno && !esAsignadoActivo) {
        throw new Error("Sólo quien marcó el anticipo puede desmarcarlo.");
      }
    }
    const now = Date.now();
    if (!args.esLegalizacionAnticipo) {
      await revertirLegalizacionesFactura(
        ctx,
        factura._id,
        marcadorUserId ?? args.actorUserId ?? "sin-usuario",
        now
      );
    }

    const marcadorFinalUserId = marcandoDesdeCausacion
      ? liderRemitente!.usuarioId
      : (factura.anticipoLiderUserId ?? marcadorUserId);
    const marcadorFinalNombre = marcandoDesdeCausacion
      ? liderRemitente!.nombre
      : (factura.anticipoLiderNombre ?? marcadorNombre);
    const marcadorFinalEmail = marcandoDesdeCausacion
      ? normalizeEmail(liderRemitente!.email)
      : factura.anticipoLiderEmail
        ? normalizeEmail(factura.anticipoLiderEmail)
        : marcadorEmail;
    const anticipoBolsaId = args.esLegalizacionAnticipo
      ? await ensureBolsaAnticipo(ctx, {
          empresa: factura.empresa ?? tarea.empresa,
          tipoBolsa: isFacturaPeajes(factura) ? "peajes" : "general",
          procesoId: procesoSnapshot.procesoId,
          procesoNombre: procesoSnapshot.procesoNombre,
        })
      : undefined;

    await ctx.db.patch("facturacionFacturas", factura._id, {
      esLegalizacionAnticipo: args.esLegalizacionAnticipo,
      esLegalizacionCajaMenor: args.esLegalizacionAnticipo
        ? false
        : factura.esLegalizacionCajaMenor,
      cajaMenorId: args.esLegalizacionAnticipo ? undefined : factura.cajaMenorId,
      cajaMenorNombre: args.esLegalizacionAnticipo ? undefined : factura.cajaMenorNombre,
      cajaMenorMarcadorUserId: args.esLegalizacionAnticipo
        ? undefined
        : factura.cajaMenorMarcadorUserId,
      cajaMenorMarcadorNombre: args.esLegalizacionAnticipo
        ? undefined
        : factura.cajaMenorMarcadorNombre,
      cajaMenorMarcadorEmail: args.esLegalizacionAnticipo
        ? undefined
        : factura.cajaMenorMarcadorEmail,
      anticipoLiderUserId: args.esLegalizacionAnticipo ? marcadorFinalUserId : undefined,
      anticipoLiderNombre: args.esLegalizacionAnticipo ? marcadorFinalNombre : undefined,
      anticipoLiderEmail: args.esLegalizacionAnticipo ? marcadorFinalEmail : undefined,
      anticipoBolsaId: args.esLegalizacionAnticipo
        ? (factura.anticipoBolsaId ?? anticipoBolsaId)
        : undefined,
      anticipoProcesoId: args.esLegalizacionAnticipo
        ? (factura.anticipoProcesoId ?? procesoSnapshot.procesoId)
        : undefined,
      anticipoProcesoNombre: args.esLegalizacionAnticipo
        ? (factura.anticipoProcesoNombre ?? procesoSnapshot.procesoNombre)
        : undefined,
      valorAPagar: args.esLegalizacionAnticipo ? factura.valorAPagar : undefined,
      actualizadoEn: now,
    });
    if (args.esLegalizacionAnticipo) {
      await revertirLegalizacionesCajaMenorFactura(ctx, factura._id, now);
      await anularMovimientosCajaMenorFacturaInterno(
        ctx,
        factura._id,
        {
          actorUserId: args.actorUserId,
          actorNombre: args.actorNombre,
          actorEmail: args.actorEmail,
        },
        "Movimiento de Caja Menor anulado por marcación de anticipo."
      );
    }

    await registrarAprobacion(ctx, {
      tareaId: tarea._id,
      facturaId: tarea.facturaId,
      asignacionId: args.asignacionId,
      empresa: tarea.empresa,
      actorUserId: args.actorUserId,
      actorNombre: args.actorNombre,
      actorEmail: args.actorEmail,
      accion: "marcar_anticipo",
      comentario: args.esLegalizacionAnticipo
        ? marcandoDesdeCausacion
          ? "Marcada como legalización de anticipo desde causación"
          : "Marcada como legalización de anticipo"
        : "Desmarcada como legalización de anticipo",
      estadoAnterior: tarea.estado,
      estadoNuevo: tarea.estado,
    });
    await syncValorAPagarFactura(ctx, factura._id, now);
    await refrescarProyeccionFactura(ctx, factura._id, now);
  },
});

export const marcarEsLegalizacionCajaMenor = mutation({
  args: {
    tareaId: v.id("facturacionTareas"),
    asignacionId: v.optional(v.id("facturacionAsignaciones")),
    esLegalizacionCajaMenor: v.boolean(),
    cajaMenorId: v.optional(v.id("cajasMenores")),
    nit: v.optional(v.string()),
    nombreEmpresa: v.optional(v.string()),
    concepto: v.optional(v.string()),
    fechaPago: v.optional(v.string()),
    centroCostoId: v.optional(v.string()),
    centroCostoCodigo: v.optional(v.string()),
    centroCostoNombre: v.optional(v.string()),
    centrosCostoDistribucion: v.optional(centrosCostoDistribucionValidator),
    observaciones: v.optional(v.string()),
    actorUserId: v.optional(v.string()),
    actorNombre: v.string(),
    actorEmail: v.string(),
    comentario: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const tarea = await ctx.db.get("facturacionTareas", args.tareaId);
    if (!tarea) throw new Error("Tarea no encontrada");
    const puedeMarcar = tarea.estado === "revision_lider" || tarea.estado === "jefe_directo";
    const puedeDesmarcar = puedeMarcar || tarea.estado === "reembolso_caja_menor";
    if (
      (args.esLegalizacionCajaMenor && !puedeMarcar) ||
      (!args.esLegalizacionCajaMenor && !puedeDesmarcar)
    ) {
      throw new Error(
        args.esLegalizacionCajaMenor
          ? "La Caja Menor sólo se marca durante la revisión del líder o jefe directo."
          : "La Caja Menor sólo se desmarca durante revisión o reembolso de Caja Menor."
      );
    }

    const factura = await ctx.db.get("facturacionFacturas", tarea.facturaId);
    if (!factura) throw new Error("Factura no encontrada");

    const asignacion = args.asignacionId
      ? await ctx.db.get("facturacionAsignaciones", args.asignacionId)
      : tarea.currentAsignacionId
        ? await ctx.db.get("facturacionAsignaciones", tarea.currentAsignacionId)
        : null;
    const faseEsperada = tarea.estado === "jefe_directo" ? "jefe_directo" : "revision_lider";
    const requiereAsignacionActiva =
      args.esLegalizacionCajaMenor || tarea.estado !== "reembolso_caja_menor";
    if (
      requiereAsignacionActiva &&
      (!asignacion ||
        asignacion.tareaId !== tarea._id ||
        asignacion.fase !== faseEsperada ||
        asignacion.estado !== "pendiente")
    ) {
      throw new Error("No se encontró la revisión activa para Caja Menor.");
    }

    const now = Date.now();
    if (!args.esLegalizacionCajaMenor) {
      await revertirLegalizacionesCajaMenorFactura(ctx, factura._id, now);
      await anularMovimientosCajaMenorFacturaInterno(
        ctx,
        factura._id,
        {
          actorUserId: args.actorUserId,
          actorNombre: args.actorNombre,
          actorEmail: args.actorEmail,
        },
        args.comentario,
        now
      );
      await ctx.db.patch("facturacionFacturas", factura._id, {
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
      await registrarAprobacion(ctx, {
        tareaId: tarea._id,
        facturaId: tarea.facturaId,
        empresa: tarea.empresa,
        actorUserId: args.actorUserId,
        actorNombre: args.actorNombre,
        actorEmail: args.actorEmail,
        accion: "marcar_caja_menor",
        comentario: args.comentario || "Desmarcada como legalización de Caja Menor",
        estadoAnterior: tarea.estado,
        estadoNuevo: tarea.estado,
      });
      if (tarea.estado === "reembolso_caja_menor") {
        await crearAsignacionCausacion(ctx, tarea, {
          actorUserId: args.actorUserId,
          actorNombre: args.actorNombre,
          actorEmail: args.actorEmail,
          comentario:
            args.comentario || "Desmarcada como legalización de Caja Menor. Enviada a causación.",
        });
      }
      return;
    }

    if (!asignacion) {
      throw new Error("No se encontró la revisión activa para Caja Menor.");
    }
    if (!args.cajaMenorId) {
      throw new Error("Selecciona una Caja Menor.");
    }
    if (!args.actorUserId) {
      throw new Error("No se pudo identificar el usuario que marca la Caja Menor.");
    }
    if (!args.centroCostoCodigo?.trim() && !args.centrosCostoDistribucion?.length) {
      throw new Error("Selecciona el centro de costo.");
    }
    if (!args.fechaPago?.trim()) {
      throw new Error("Ingresa la fecha de pago.");
    }
    if (!args.concepto?.trim()) {
      throw new Error("Ingresa el concepto del movimiento.");
    }
    await revertirLegalizacionesFactura(ctx, factura._id, args.actorUserId ?? "sin-usuario", now);
    await revertirLegalizacionesCajaMenorFactura(ctx, factura._id, now);
    await anularMovimientosCajaMenorFacturaInterno(
      ctx,
      factura._id,
      {
        actorUserId: args.actorUserId,
        actorNombre: args.actorNombre,
        actorEmail: args.actorEmail,
      },
      args.comentario,
      now
    );
    const result = await crearMovimientoCajaMenorInterno(ctx, {
      factura,
      input: {
        cajaMenorId: args.cajaMenorId,
        nit: args.nit ?? factura.proveedorNit,
        nombreEmpresa: args.nombreEmpresa ?? factura.proveedorNombre,
        concepto: args.concepto,
        fechaPago: args.fechaPago,
        valor: factura.total,
        centroCostoId: args.centroCostoId,
        centroCostoCodigo: args.centroCostoCodigo ?? "",
        centroCostoNombre: args.centroCostoNombre ?? "",
        centrosCostoDistribucion: args.centrosCostoDistribucion,
        observaciones: args.observaciones ?? args.comentario,
      },
      origen: "factura_sistema",
      actor: {
        actorUserId: args.actorUserId,
        actorNombre: args.actorNombre,
        actorEmail: args.actorEmail,
      },
      now,
    });

    await registrarAprobacion(ctx, {
      tareaId: tarea._id,
      facturaId: tarea.facturaId,
      asignacionId: asignacion._id,
      empresa: tarea.empresa,
      actorUserId: args.actorUserId,
      actorNombre: args.actorNombre,
      actorEmail: args.actorEmail,
      accion: "marcar_caja_menor",
      comentario:
        args.comentario || `Marcada como Caja Menor. Enviada a reembolso: ${result.caja.nombre}`,
      estadoAnterior: tarea.estado,
      estadoNuevo: "reembolso_caja_menor",
    });

    await cerrarAsignacion(
      ctx,
      asignacion,
      "completada",
      args.comentario || "Marcada como Caja Menor. Factura enviada a reembolso sin causación."
    );

    await patchTareaEstado(
      ctx,
      tarea,
      "reembolso_caja_menor",
      {
        currentAsignacionId: undefined,
        grupoAsignacionActualId: undefined,
        asignadoAUserId: args.actorUserId,
        asignadoANombre: args.actorNombre,
        asignadoAEmail: normalizeEmail(args.actorEmail),
      },
      now
    );
  },
});

export const reasignar = mutation({
  args: {
    tareaId: v.id("facturacionTareas"),
    nuevoAsignadoUserId: v.optional(v.string()),
    nuevoAsignadoNombre: v.string(),
    nuevoAsignadoEmail: v.string(),
    nuevoAsignadoProcesoId: v.optional(v.number()),
    nuevoAsignadoProcesoNombre: v.optional(v.string()),
    ...actorValidator,
  },
  handler: async (ctx, args) => {
    const tarea = await ctx.db.get("facturacionTareas", args.tareaId);
    if (!tarea) throw new Error("Tarea no encontrada");
    if (isEstadoTerminalFacturacion(tarea.estado)) {
      throw new Error("No se puede reasignar una tarea cerrada");
    }

    await registrarAprobacion(ctx, {
      tareaId: tarea._id,
      facturaId: tarea.facturaId,
      empresa: tarea.empresa,
      actorUserId: args.actorUserId,
      actorNombre: args.actorNombre,
      actorEmail: args.actorEmail,
      accion: "reasignar",
      comentario: args.comentario,
      estadoAnterior: tarea.estado,
      estadoNuevo: tarea.estado,
    });

    const patch: {
      asignadoAUserId?: string;
      asignadoANombre: string;
      asignadoAEmail: string;
      actualizadoEn: number;
      liderProcesoUserId?: string;
      liderProcesoNombre?: string;
      liderProcesoEmail?: string;
      liderProcesoProcesoId?: number;
      liderProcesoProcesoNombre?: string;
    } = {
      asignadoANombre: args.nuevoAsignadoNombre,
      asignadoAEmail: normalizeEmail(args.nuevoAsignadoEmail),
      actualizadoEn: Date.now(),
    };

    if (args.nuevoAsignadoUserId) {
      patch.asignadoAUserId = args.nuevoAsignadoUserId;
    }

    if (tarea.estado === "revision_lider") {
      patch.liderProcesoUserId = args.nuevoAsignadoUserId;
      patch.liderProcesoNombre = args.nuevoAsignadoNombre;
      patch.liderProcesoEmail = normalizeEmail(args.nuevoAsignadoEmail);
      patch.liderProcesoProcesoId = args.nuevoAsignadoProcesoId;
      patch.liderProcesoProcesoNombre = sanitizeProcesoNombre(args.nuevoAsignadoProcesoNombre);
    }

    await ctx.db.patch("facturacionTareas", args.tareaId, patch);
  },
});

function getDocumentoClaseFacturacion(factura: Doc<"facturacionFacturas">) {
  if (factura.documentoClase) return factura.documentoClase;
  const tipo = factura.tipoDocumentoNormalizado ?? factura.tipoDocumento;
  if (tipo === "91") return "nota_credito";
  if (tipo === "92") return "nota_debito";
  if (tipo === "01" || tipo === "1") return "factura";
  return "otro";
}

type LimpiezaFlujoFacturaSnapshot = {
  tareas: Array<Doc<"facturacionTareas">>;
  asignaciones: Array<Doc<"facturacionAsignaciones">>;
  aprobaciones: Array<Doc<"facturacionAprobaciones">>;
  adjuntos: Array<Doc<"facturacionAdjuntos">>;
  legalizacionesAnticipo: Array<Doc<"facturacionAnticipoLegalizaciones">>;
  legalizacionesCajaMenor: Array<Doc<"facturacionCajaMenorLegalizaciones">>;
  movimientosCajaMenor: Array<Doc<"facturacionCajaMenorMovimientos">>;
};

async function obtenerSnapshotLimpiezaFlujoFactura(
  ctx: MutationCtx,
  facturaId: Id<"facturacionFacturas">
): Promise<LimpiezaFlujoFacturaSnapshot> {
  const tareas = await ctx.db
    .query("facturacionTareas")
    .withIndex("by_facturaId", (q) => q.eq("facturaId", facturaId))
    .collect();
  const asignaciones = await ctx.db
    .query("facturacionAsignaciones")
    .withIndex("by_facturaId", (q) => q.eq("facturaId", facturaId))
    .collect();
  const aprobaciones = await ctx.db
    .query("facturacionAprobaciones")
    .withIndex("by_facturaId", (q) => q.eq("facturaId", facturaId))
    .collect();
  const adjuntos = await ctx.db
    .query("facturacionAdjuntos")
    .withIndex("by_facturaId", (q) => q.eq("facturaId", facturaId))
    .collect();
  const legalizacionesAnticipo = await ctx.db
    .query("facturacionAnticipoLegalizaciones")
    .withIndex("by_facturaId", (q) => q.eq("facturaId", facturaId))
    .collect();
  const legalizacionesCajaMenor = await ctx.db
    .query("facturacionCajaMenorLegalizaciones")
    .withIndex("by_facturaId", (q) => q.eq("facturaId", facturaId))
    .collect();
  const movimientosCajaMenor = await ctx.db
    .query("facturacionCajaMenorMovimientos")
    .withIndex("by_facturaId", (q) => q.eq("facturaId", facturaId))
    .collect();

  return {
    tareas,
    asignaciones,
    aprobaciones,
    adjuntos,
    legalizacionesAnticipo,
    legalizacionesCajaMenor,
    movimientosCajaMenor,
  };
}

const REPARAR_PROCESO_LIDER_MAX_ASIGNACIONES = 100;

/**
 * Repara snapshots de proceso perdidos usando asignaciones históricas del mismo líder.
 *
 * PAC737 dry run:
 * `npx convex run facturacionTareas:repararProcesoLiderFactura '{"numeroFactura":"PAC737","empresa":1,"dryRun":true}' --prod`
 *
 * PAC737 ejecución:
 * `npx convex run facturacionTareas:repararProcesoLiderFactura '{"numeroFactura":"PAC737","empresa":1}' --prod`
 */
export const repararProcesoLiderFactura = internalMutation({
  args: {
    numeroFactura: v.string(),
    empresa: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
  },
  returns: v.object({
    facturaId: v.id("facturacionFacturas"),
    tareaId: v.id("facturacionTareas"),
    dryRun: v.boolean(),
    reparado: v.boolean(),
    procesoId: v.optional(v.number()),
    procesoNombre: v.optional(v.string()),
    tareaActualizada: v.boolean(),
    asignacionesActualizadas: v.number(),
    cambiosPendientes: v.number(),
  }),
  handler: async (ctx, args) => {
    const empresa = normalizeEmpresa(args.empresa);
    const numeroNormalizado = normalizeDocumentNumber(args.numeroFactura);
    if (!numeroNormalizado) {
      throw new Error("Número de factura inválido.");
    }

    const porNumeroNormalizado = await ctx.db
      .query("facturacionFacturas")
      .withIndex("by_empresa_numeroFacturaNormalizado", (q) =>
        q.eq("empresa", empresa).eq("numeroFacturaNormalizado", numeroNormalizado)
      )
      .take(3);
    const candidatos =
      porNumeroNormalizado.length > 0
        ? porNumeroNormalizado
        : await ctx.db
            .query("facturacionFacturas")
            .withIndex("by_empresa_numeroFactura", (q) =>
              q.eq("empresa", empresa).eq("numeroFactura", args.numeroFactura.trim())
            )
            .take(3);
    const facturasExactas = candidatos.filter(
      (row) => normalizeDocumentNumber(row.numeroFactura) === numeroNormalizado
    );
    if (facturasExactas.length === 0) {
      throw new Error(`Factura ${args.numeroFactura} no encontrada para la empresa ${empresa}.`);
    }
    if (facturasExactas.length > 1) {
      throw new Error(
        `Hay más de una factura ${args.numeroFactura} en la empresa ${empresa}; la reparación no es segura.`
      );
    }
    const factura = facturasExactas[0]!;

    const tarea = await ctx.db
      .query("facturacionTareas")
      .withIndex("by_facturaId", (q) => q.eq("facturaId", factura._id))
      .unique();
    if (!tarea) {
      throw new Error("Tarea de facturación no encontrada.");
    }

    const asignacionesLider = await ctx.db
      .query("facturacionAsignaciones")
      .withIndex("by_facturaId_fase", (q) =>
        q.eq("facturaId", factura._id).eq("fase", "revision_lider")
      )
      .take(REPARAR_PROCESO_LIDER_MAX_ASIGNACIONES + 1);
    if (asignacionesLider.length > REPARAR_PROCESO_LIDER_MAX_ASIGNACIONES) {
      throw new Error(
        `La factura supera ${REPARAR_PROCESO_LIDER_MAX_ASIGNACIONES} asignaciones de líder; requiere reparación por lotes.`
      );
    }

    const liderUserId = tarea.liderProcesoUserId?.trim();
    const liderEmail = normalizeEmail(tarea.liderProcesoEmail);
    const perteneceAlLiderActual = (row: Doc<"facturacionAsignaciones">) => {
      if (liderUserId && row.asignadoAUserId) {
        return row.asignadoAUserId === liderUserId;
      }
      return Boolean(liderEmail && normalizeEmail(row.asignadoAEmail) === liderEmail);
    };
    const asignacionesDelLider = asignacionesLider.filter(perteneceAlLiderActual);
    if (asignacionesDelLider.length === 0) {
      throw new Error("No se encontraron asignaciones históricas del líder de la factura.");
    }

    const fuentesConProceso = asignacionesDelLider
      .filter((row) =>
        hasProcesoSnapshot({
          procesoId: row.asignadoAProcesoId,
          procesoNombre: row.asignadoAProcesoNombre,
        })
      )
      .sort((a, b) => b.creadoEn - a.creadoEn);
    const fuente = fuentesConProceso[0];
    if (!fuente) {
      throw new Error(
        "No existe una asignación histórica con proceso para reparar la factura automáticamente."
      );
    }

    const procesoFuente = getProcesoSnapshot({
      procesoId: fuente.asignadoAProcesoId,
      procesoNombre: fuente.asignadoAProcesoNombre,
    });
    for (const candidata of fuentesConProceso.slice(1)) {
      if (
        !sameProcesoSnapshot(procesoFuente, {
          procesoId: candidata.asignadoAProcesoId,
          procesoNombre: candidata.asignadoAProcesoNombre,
        })
      ) {
        throw new Error(
          "Las asignaciones históricas del líder tienen procesos diferentes; la reparación no es segura."
        );
      }
    }

    const procesoTarea = getProcesoSnapshot({
      procesoId: tarea.liderProcesoProcesoId,
      procesoNombre: tarea.liderProcesoProcesoNombre,
    });
    if (hasProcesoSnapshot(procesoTarea) && !sameProcesoSnapshot(procesoTarea, procesoFuente)) {
      throw new Error(
        "El proceso actual de la tarea no coincide con el histórico; la reparación no es segura."
      );
    }

    const tareaPatch: Partial<Doc<"facturacionTareas">> = {};
    if (tarea.liderProcesoProcesoId === undefined && procesoFuente.procesoId !== undefined) {
      tareaPatch.liderProcesoProcesoId = procesoFuente.procesoId;
    }
    if (!sanitizeProcesoNombre(tarea.liderProcesoProcesoNombre) && procesoFuente.procesoNombre) {
      tareaPatch.liderProcesoProcesoNombre = procesoFuente.procesoNombre;
    }

    const asignacionesParaActualizar = asignacionesDelLider
      .map((row) => {
        const patch: Partial<Doc<"facturacionAsignaciones">> = {};
        if (row.asignadoAProcesoId === undefined && procesoFuente.procesoId !== undefined) {
          patch.asignadoAProcesoId = procesoFuente.procesoId;
        }
        if (!sanitizeProcesoNombre(row.asignadoAProcesoNombre) && procesoFuente.procesoNombre) {
          patch.asignadoAProcesoNombre = procesoFuente.procesoNombre;
        }
        return { row, patch };
      })
      .filter(({ patch }) => Object.keys(patch).length > 0);

    const tareaActualizada = Object.keys(tareaPatch).length > 0;
    const cambiosPendientes = (tareaActualizada ? 1 : 0) + asignacionesParaActualizar.length;
    const dryRun = args.dryRun === true;
    if (!dryRun && cambiosPendientes > 0) {
      const now = Date.now();
      if (tareaActualizada) {
        await ctx.db.patch("facturacionTareas", tarea._id, {
          ...tareaPatch,
          actualizadoEn: now,
        });
      }
      for (const { row, patch } of asignacionesParaActualizar) {
        await ctx.db.patch("facturacionAsignaciones", row._id, {
          ...patch,
          actualizadoEn: now,
        });
      }
      await registrarAprobacion(ctx, {
        tareaId: tarea._id,
        facturaId: factura._id,
        empresa: tarea.empresa,
        actorUserId: "reparacion-proceso-lider",
        actorNombre: "Sistema",
        actorEmail: SYSTEM_ACTOR_EMAIL,
        accion: "comentar",
        comentario: `Reparación de proceso del líder: ${procesoFuente.procesoNombre ?? procesoFuente.procesoId ?? "proceso identificado"}.`,
        estadoAnterior: tarea.estado,
        estadoNuevo: tarea.estado,
      });
      await refrescarProyeccionFactura(ctx, factura._id, now);
    }

    return {
      facturaId: factura._id,
      tareaId: tarea._id,
      dryRun,
      reparado: !dryRun && cambiosPendientes > 0,
      procesoId: procesoFuente.procesoId,
      procesoNombre: procesoFuente.procesoNombre,
      tareaActualizada,
      asignacionesActualizadas: asignacionesParaActualizar.length,
      cambiosPendientes,
    };
  },
});

export const autoAsignarDocumentoFisicoALiderInterno = internalMutation({
  args: {
    tareaId: v.id("facturacionTareas"),
    actorUserId: v.string(),
    actorNombre: v.string(),
    actorEmail: v.string(),
    actorProcesoId: v.optional(v.number()),
    actorProcesoNombre: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const tarea = await ctx.db.get("facturacionTareas", args.tareaId);
    if (!tarea) throw new Error("Tarea de facturación no encontrada.");
    if (tarea.estado !== "recepcion") {
      throw new Error("La factura no está pendiente de recepción.");
    }

    const empresa = normalizeEmpresa(tarea.empresa);
    const grupoRecepcionId = tarea.grupoAsignacionActualId;
    if (!grupoRecepcionId) {
      throw new Error("La tarea no tiene grupo de asignación activo.");
    }

    await cancelarPendientesDelGrupo(ctx, grupoRecepcionId, undefined, {
      tareaId: tarea._id,
      facturaId: tarea.facturaId,
      empresa,
      actorUserId: args.actorUserId,
      actorNombre: args.actorNombre,
      actorEmail: args.actorEmail,
      estadoAnterior: tarea.estado,
      estadoNuevo: "revision_lider",
    });

    const lider = {
      usuarioId: args.actorUserId,
      nombre: args.actorNombre,
      email: normalizeEmail(args.actorEmail),
      procesoId: args.actorProcesoId,
      procesoNombre: args.actorProcesoNombre,
    };
    const liderGrupoId = createGroupId("revision_lider", tarea.facturaId);
    const asignacionId = await insertarAsignacion(ctx, {
      facturaId: tarea.facturaId,
      tareaId: tarea._id,
      empresa,
      fase: "revision_lider",
      rol: "lider",
      grupoId: liderGrupoId,
      usuario: lider,
    });

    await registrarAprobacion(ctx, {
      tareaId: tarea._id,
      facturaId: tarea.facturaId,
      empresa,
      actorUserId: args.actorUserId,
      actorNombre: args.actorNombre,
      actorEmail: args.actorEmail,
      accion: "asignar_lider",
      comentario: "Asignación automática al creador del documento físico",
      estadoAnterior: tarea.estado,
      estadoNuevo: "revision_lider",
    });

    await patchTareaEstado(ctx, tarea, "revision_lider", {
      grupoAsignacionActualId: liderGrupoId,
      currentAsignacionId: asignacionId,
      lideresTotal: 1,
      lideresCompletados: 0,
      asignadoAUserId: lider.usuarioId,
      asignadoANombre: lider.nombre,
      asignadoAEmail: lider.email,
      liderProcesoUserId: lider.usuarioId,
      liderProcesoNombre: lider.nombre,
      liderProcesoEmail: lider.email,
      liderProcesoProcesoId: lider.procesoId,
      liderProcesoProcesoNombre: sanitizeProcesoNombre(lider.procesoNombre),
    });

    return { asignacionId, estado: "revision_lider" as const };
  },
});

export const crearDesdeFacturaInterno = internalMutation({
  args: {
    facturaId: v.id("facturacionFacturas"),
    empresa: v.optional(v.number()),
    categoria: categoriaValidator,
    liderProcesoUserId: v.optional(v.string()),
    liderProcesoNombre: v.optional(v.string()),
    liderProcesoEmail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const factura = await ctx.db.get("facturacionFacturas", args.facturaId);
    if (!factura) throw new Error("Factura no encontrada.");

    const existing = await ctx.db
      .query("facturacionTareas")
      .withIndex("by_facturaId", (q) => q.eq("facturaId", args.facturaId))
      .unique();

    if (existing) return existing._id;

    const empresa = normalizeEmpresa(args.empresa ?? factura?.empresa);
    const recepcionUsuarios = await getRecepcionUsuarios(ctx, empresa);
    const first = recepcionUsuarios[0];
    const now = Date.now();

    const tareaId = await ctx.db.insert("facturacionTareas", {
      facturaId: args.facturaId,
      empresa,
      estado: "recepcion",
      categoria: args.categoria,
      asignadoAUserId: first.usuarioId,
      asignadoANombre:
        recepcionUsuarios.length === 1
          ? first.nombre
          : `${recepcionUsuarios.length} usuarios de recepción`,
      asignadoAEmail: normalizeEmail(first.email),
      liderProcesoNombre: args.liderProcesoNombre ?? "Sin asignar",
      liderProcesoEmail: normalizeEmail(args.liderProcesoEmail ?? fallbackContactEmail()),
      creadoEn: now,
      actualizadoEn: now,
      ...(args.liderProcesoUserId ? { liderProcesoUserId: args.liderProcesoUserId } : {}),
    });

    const grupoId = createGroupId("recepcion", args.facturaId);
    const assignmentIds: Id<"facturacionAsignaciones">[] = [];
    for (const usuario of recepcionUsuarios) {
      assignmentIds.push(
        await insertarAsignacion(ctx, {
          facturaId: args.facturaId,
          tareaId,
          empresa,
          fase: "recepcion",
          rol: "recepcion",
          grupoId,
          usuario,
          notificar: false,
        })
      );
    }

    await ctx.db.patch("facturacionTareas", tareaId, {
      grupoAsignacionActualId: grupoId,
      currentAsignacionId: assignmentIds[0],
    });

    await registrarAprobacion(ctx, {
      tareaId,
      facturaId: args.facturaId,
      asignacionId: assignmentIds[0],
      empresa,
      actorNombre: "Sistema",
      actorEmail: SYSTEM_ACTOR_EMAIL,
      accion: "asignar_recepcion",
      comentario: "Factura recibida y asignada a recepción.",
      estadoAnterior: "captura",
      estadoNuevo: "recepcion",
    });

    return tareaId;
  },
});

const ELIMINACION_FACTURA_COMPLETA_OMITIDO_MOTIVO = "eliminacion_administrativa_factura";

type EliminacionFacturaCompletaResumen = {
  tareas: number;
  asignaciones: number;
  aprobaciones: number;
  adjuntos: number;
  legalizacionesAnticipo: number;
  legalizacionesCajaMenor: number;
  movimientosCajaMenor: number;
  reembolsosReescritos: number;
  reembolsosEliminados: number;
  correosReescritos: number;
  facturasDesvinculadas: number;
  archivosEliminados: number;
};

const eliminacionFacturaCompletaResumenValidator = v.object({
  tareas: v.number(),
  asignaciones: v.number(),
  aprobaciones: v.number(),
  adjuntos: v.number(),
  legalizacionesAnticipo: v.number(),
  legalizacionesCajaMenor: v.number(),
  movimientosCajaMenor: v.number(),
  reembolsosReescritos: v.number(),
  reembolsosEliminados: v.number(),
  correosReescritos: v.number(),
  facturasDesvinculadas: v.number(),
  archivosEliminados: v.number(),
});

function crearResumenEliminacionFacturaCompleta(): EliminacionFacturaCompletaResumen {
  return {
    tareas: 0,
    asignaciones: 0,
    aprobaciones: 0,
    adjuntos: 0,
    legalizacionesAnticipo: 0,
    legalizacionesCajaMenor: 0,
    movimientosCajaMenor: 0,
    reembolsosReescritos: 0,
    reembolsosEliminados: 0,
    correosReescritos: 0,
    facturasDesvinculadas: 0,
    archivosEliminados: 0,
  };
}

function assertPuedeEliminarFacturaCompleta(actor: SessionActor, empresa: number) {
  if (actor.role !== 1) {
    throw new Error("Solo los usuarios con rol 1 pueden eliminar facturas.");
  }
  if (!actor.hasAllCompanies && actor.empresas.length > 0 && !actor.empresas.includes(empresa)) {
    throw new Error("No tiene permisos para gestionar esta empresa.");
  }
}

async function eliminarArchivoAlmacenamientoFactura(
  ctx: MutationCtx,
  storageId: Id<"_storage"> | undefined,
  archivosProcesados: Set<string>,
  preservados: Set<string>
) {
  if (!storageId) return false;
  const key = String(storageId);
  if (preservados.has(key) || archivosProcesados.has(key)) return false;
  archivosProcesados.add(key);

  const metadata = await ctx.db.system.get("_storage", storageId);
  if (!metadata) return false;

  try {
    await ctx.storage.delete(storageId);
    return true;
  } catch {
    throw new Error(`No se pudo eliminar el archivo asociado a la factura (${key}).`);
  }
}

async function eliminarReembolsoCajaMenorCompleto(
  ctx: MutationCtx,
  reembolsoId: Id<"cajasMenoresReembolsos">,
  archivosProcesados: Set<string>,
  resumen: EliminacionFacturaCompletaResumen
) {
  const adjuntos = await ctx.db
    .query("cajasMenoresReembolsoAdjuntos")
    .withIndex("by_reembolsoId", (q) => q.eq("reembolsoId", reembolsoId))
    .collect();
  for (const adjunto of adjuntos) {
    if (
      await eliminarArchivoAlmacenamientoFactura(
        ctx,
        adjunto.storageId,
        archivosProcesados,
        new Set<string>()
      )
    ) {
      resumen.archivosEliminados += 1;
    }
    await ctx.db.delete("cajasMenoresReembolsoAdjuntos", adjunto._id);
  }

  const eventos = await ctx.db
    .query("cajasMenoresReembolsoEventos")
    .withIndex("by_reembolsoId", (q) => q.eq("reembolsoId", reembolsoId))
    .collect();
  for (const evento of eventos) {
    await ctx.db.delete("cajasMenoresReembolsoEventos", evento._id);
  }

  await deleteReembolsoConBandeja(ctx, reembolsoId);
  resumen.reembolsosEliminados += 1;
}

async function reescribirReembolsosPorEliminacionFactura(
  ctx: MutationCtx,
  facturaId: Id<"facturacionFacturas">,
  movimientos: Array<Doc<"facturacionCajaMenorMovimientos">>,
  now: number,
  archivosProcesados: Set<string>,
  resumen: EliminacionFacturaCompletaResumen
) {
  const movimientoIdsObjetivo = new Set(movimientos.map((row) => String(row._id)));
  const reembolsoIds = Array.from(
    new Set(
      movimientos
        .map((row) => row.reembolsoId)
        .filter((reembolsoId): reembolsoId is Id<"cajasMenoresReembolsos"> => Boolean(reembolsoId))
    )
  );

  for (const reembolsoId of reembolsoIds) {
    const reembolso = await ctx.db.get("cajasMenoresReembolsos", reembolsoId);
    if (!reembolso) continue;

    const movimientoIdsRestantes = reembolso.movimientoIds.filter(
      (movimientoId) => !movimientoIdsObjetivo.has(String(movimientoId))
    );

    if (movimientoIdsRestantes.length === 0) {
      await eliminarReembolsoCajaMenorCompleto(ctx, reembolsoId, archivosProcesados, resumen);
      continue;
    }

    const movimientosRestantes = (
      await Promise.all(movimientoIdsRestantes.map((movimientoId) => ctx.db.get("facturacionCajaMenorMovimientos", movimientoId)))
    ).filter((row): row is Doc<"facturacionCajaMenorMovimientos"> => Boolean(row));
    const valorTotal = movimientosRestantes.reduce(
      (total, movimiento) => total + Math.max(0, movimiento.valor),
      0
    );

    const patchReembolso: Partial<Doc<"cajasMenoresReembolsos">> = {
      movimientoIds: movimientoIdsRestantes,
      valorTotal,
      actualizadoEn: now,
    };

    if (reembolso.formatoSnapshot) {
      const movimientosRestantesIds = new Set(movimientoIdsRestantes.map(String));
      patchReembolso.formatoSnapshot = {
        ...reembolso.formatoSnapshot,
        valorTotal,
        movimientos: reembolso.formatoSnapshot.movimientos.filter(
          (row) =>
            movimientosRestantesIds.has(String(row.movimientoId)) &&
            String(row.facturaId) !== String(facturaId)
        ),
      };
    }

    await patchReembolsoConBandeja(ctx, reembolsoId, patchReembolso);
    resumen.reembolsosReescritos += 1;
  }
}

async function desvincularNotasCreditoApuntandoAFactura(
  ctx: MutationCtx,
  factura: Doc<"facturacionFacturas">,
  now: number,
  resumen: EliminacionFacturaCompletaResumen
) {
  const empresa = normalizeEmpresa(factura.empresa);
  const notasRelacionadas = await ctx.db
    .query("facturacionFacturas")
    .withIndex("by_empresa_facturaRelacionadaId", (q) =>
      q.eq("empresa", empresa).eq("facturaRelacionadaId", factura._id)
    )
    .collect();

  for (const nota of notasRelacionadas) {
    await ctx.db.patch("facturacionFacturas", nota._id, {
      facturaRelacionadaId: undefined,
      relacionDocumentoOrigen: undefined,
      relacionDocumentoAuditadaPorUserId: undefined,
      relacionDocumentoAuditadaPorNombre: undefined,
      relacionDocumentoAuditadaPorEmail: undefined,
      relacionDocumentoAuditadaEn: undefined,
      relacionDocumentoComentario: undefined,
      actualizadoEn: now,
    });
    await refrescarProyeccionFactura(ctx, nota._id, now);
    resumen.facturasDesvinculadas += 1;
  }

  if (factura.facturaRelacionadaId) {
    const legalizacionesRelacionadas = await ctx.db
      .query("facturacionAnticipoLegalizaciones")
      .withIndex("by_facturaId", (q) => q.eq("facturaId", factura.facturaRelacionadaId!))
      .collect();
    for (const legalizacion of legalizacionesRelacionadas) {
      if (!legalizacion.notaCreditoIds?.some((id) => String(id) === String(factura._id))) {
        continue;
      }
      const notasRestantes = legalizacion.notaCreditoIds.filter(
        (notaCreditoId) => String(notaCreditoId) !== String(factura._id)
      );
      await ctx.db.patch("facturacionAnticipoLegalizaciones", legalizacion._id, {
        notaCreditoIds: notasRestantes.length > 0 ? notasRestantes : undefined,
        actualizadoEn: now,
      });
    }
  }
}

async function reescribirCorreosPorEliminacionFactura(
  ctx: MutationCtx,
  factura: Doc<"facturacionFacturas">,
  archivosProcesados: Set<string>,
  resumen: EliminacionFacturaCompletaResumen
): Promise<Set<string>> {
  const preservados = new Set<string>();
  const correoIds = new Set<string>();

  if (factura.emailId) {
    correoIds.add(String(factura.emailId));
  } else if (factura.graphMessageId) {
    const correo = await ctx.db
      .query("facturacionCorreos")
      .withIndex("by_graphMessageId", (q) => q.eq("graphMessageId", factura.graphMessageId!))
      .unique();
    if (correo) correoIds.add(String(correo._id));
  }

  const correosByFacturaId = await ctx.db
    .query("facturacionCorreos")
    .withIndex("by_facturaId", (q) => q.eq("facturaId", factura._id))
    .collect();
  for (const correo of correosByFacturaId) {
    correoIds.add(String(correo._id));
  }

  for (const correoId of correoIds) {
    const correo = await ctx.db.get("facturacionCorreos", correoId as Id<"facturacionCorreos">);
    if (!correo) continue;

    const facturaIdsRestantes = (correo.facturaIds ?? []).filter(
      (id) => String(id) !== String(factura._id)
    );
    const facturaIdRestante =
      correo.facturaId && String(correo.facturaId) !== String(factura._id)
        ? correo.facturaId
        : facturaIdsRestantes[0];

    for (const facturaId of facturaIdsRestantes) {
      const facturaRestante = await ctx.db.get("facturacionFacturas", facturaId);
      if (facturaRestante?.xmlStorageId) preservados.add(String(facturaRestante.xmlStorageId));
      if (facturaRestante?.pdfStorageId) preservados.add(String(facturaRestante.pdfStorageId));
      if (facturaRestante?.soportesStorageId) {
        preservados.add(String(facturaRestante.soportesStorageId));
      }
    }
    if (facturaIdRestante) {
      const primaria = await ctx.db.get("facturacionFacturas", facturaIdRestante);
      if (primaria?.xmlStorageId) preservados.add(String(primaria.xmlStorageId));
      if (primaria?.pdfStorageId) preservados.add(String(primaria.pdfStorageId));
      if (primaria?.soportesStorageId) preservados.add(String(primaria.soportesStorageId));
    }

    const attachments = correo.attachments ?? [];
    const storageIdsObjetivo = new Set<string>();
    if (factura.xmlStorageId) storageIdsObjetivo.add(String(factura.xmlStorageId));
    if (factura.pdfStorageId) storageIdsObjetivo.add(String(factura.pdfStorageId));

    const attachmentsRestantes = attachments.filter(
      (attachment) => !storageIdsObjetivo.has(String(attachment.storageId))
    );

    for (const attachment of attachments) {
      if (!storageIdsObjetivo.has(String(attachment.storageId))) continue;
      if (preservados.has(String(attachment.storageId))) continue;
      if (
        await eliminarArchivoAlmacenamientoFactura(
          ctx,
          attachment.storageId,
          archivosProcesados,
          preservados
        )
      ) {
        resumen.archivosEliminados += 1;
      }
    }

    if (facturaIdsRestantes.length === 0 && !facturaIdRestante) {
      await ctx.db.patch("facturacionCorreos", correo._id, {
        facturaId: undefined,
        facturaIds: undefined,
        procesado: true,
        omitidoMotivo: ELIMINACION_FACTURA_COMPLETA_OMITIDO_MOTIVO,
        attachments: attachmentsRestantes.length > 0 ? attachmentsRestantes : undefined,
      });
    } else {
      await ctx.db.patch("facturacionCorreos", correo._id, {
        facturaId: facturaIdRestante,
        facturaIds: facturaIdsRestantes.length > 0 ? facturaIdsRestantes : undefined,
        attachments: attachmentsRestantes.length > 0 ? attachmentsRestantes : undefined,
      });
    }

    resumen.correosReescritos += 1;
  }

  return preservados;
}

async function ejecutarEliminacionFacturaCompletaInterno(
  ctx: MutationCtx,
  factura: Doc<"facturacionFacturas">,
  actor: SessionActor,
  now: number
) {
  const resumen = crearResumenEliminacionFacturaCompleta();
  const archivosProcesados = new Set<string>();
  const snapshot = await obtenerSnapshotLimpiezaFlujoFactura(ctx, factura._id);

  await desvincularNotasCreditoApuntandoAFactura(ctx, factura, now, resumen);
  await revertirLegalizacionesFactura(ctx, factura._id, actor.userId, now);
  await revertirLegalizacionesCajaMenorFactura(ctx, factura._id, now);
  await reescribirReembolsosPorEliminacionFactura(
    ctx,
    factura._id,
    snapshot.movimientosCajaMenor,
    now,
    archivosProcesados,
    resumen
  );

  const preservadosCorreo = await reescribirCorreosPorEliminacionFactura(
    ctx,
    factura,
    archivosProcesados,
    resumen
  );
  const preservados = new Set(preservadosCorreo);

  for (const aprobacion of snapshot.aprobaciones) {
    if (
      await eliminarArchivoAlmacenamientoFactura(
        ctx,
        aprobacion.firmaStorageId,
        archivosProcesados,
        preservados
      )
    ) {
      resumen.archivosEliminados += 1;
    }
    if (
      await eliminarArchivoAlmacenamientoFactura(
        ctx,
        aprobacion.pagoParcial?.comprobanteStorageId,
        archivosProcesados,
        preservados
      )
    ) {
      resumen.archivosEliminados += 1;
    }
    await ctx.db.delete("facturacionAprobaciones", aprobacion._id);
    resumen.aprobaciones += 1;
  }

  for (const adjunto of snapshot.adjuntos) {
    if (
      await eliminarArchivoAlmacenamientoFactura(
        ctx,
        adjunto.storageId,
        archivosProcesados,
        preservados
      )
    ) {
      resumen.archivosEliminados += 1;
    }
    await ctx.db.delete("facturacionAdjuntos", adjunto._id);
    resumen.adjuntos += 1;
  }

  for (const asignacion of snapshot.asignaciones) {
    await ctx.db.delete("facturacionAsignaciones", asignacion._id);
    resumen.asignaciones += 1;
  }

  for (const tarea of snapshot.tareas) {
    if (
      await eliminarArchivoAlmacenamientoFactura(
        ctx,
        tarea.comprobantePagoStorageId,
        archivosProcesados,
        preservados
      )
    ) {
      resumen.archivosEliminados += 1;
    }
    await ctx.db.delete("facturacionTareas", tarea._id);
    resumen.tareas += 1;
  }

  for (const legalizacion of snapshot.legalizacionesAnticipo) {
    await ctx.db.delete("facturacionAnticipoLegalizaciones", legalizacion._id);
    resumen.legalizacionesAnticipo += 1;
  }

  for (const legalizacion of snapshot.legalizacionesCajaMenor) {
    await ctx.db.delete("facturacionCajaMenorLegalizaciones", legalizacion._id);
    resumen.legalizacionesCajaMenor += 1;
  }

  for (const movimiento of snapshot.movimientosCajaMenor) {
    await deleteMovimientoConBandeja(ctx, movimiento._id);
    resumen.movimientosCajaMenor += 1;
  }

  await eliminarProyeccionFactura(ctx, factura._id, now);

  if (
    await eliminarArchivoAlmacenamientoFactura(
      ctx,
      factura.xmlStorageId,
      archivosProcesados,
      preservados
    )
  ) {
    resumen.archivosEliminados += 1;
  }
  if (
    await eliminarArchivoAlmacenamientoFactura(
      ctx,
      factura.pdfStorageId,
      archivosProcesados,
      preservados
    )
  ) {
    resumen.archivosEliminados += 1;
  }
  if (
    await eliminarArchivoAlmacenamientoFactura(
      ctx,
      factura.soportesStorageId,
      archivosProcesados,
      preservados
    )
  ) {
    resumen.archivosEliminados += 1;
  }

  await ctx.db.delete("facturacionFacturas", factura._id);

  await ctx.db.insert("facturacionEliminacionesAuditoria", {
    facturaId: String(factura._id),
    empresa: normalizeEmpresa(factura.empresa),
    numeroFactura: factura.numeroFactura,
    proveedorNit: factura.proveedorNit,
    proveedorNombre: factura.proveedorNombre,
    actorUserId: actor.userId,
    actorNombre: actor.name ?? actor.userId,
    actorEmail: actor.email ?? "",
    actorRole: actor.role ?? 0,
    eliminadoEn: now,
    resumen,
  });

  return {
    facturaId: factura._id,
    numeroFactura: factura.numeroFactura,
    resumen,
  };
}

export const eliminarFacturaCompleta = mutation({
  args: {
    facturaId: v.id("facturacionFacturas"),
    confirmacionNumeroFactura: v.string(),
  },
  returns: v.object({
    facturaId: v.id("facturacionFacturas"),
    numeroFactura: v.string(),
    resumen: eliminacionFacturaCompletaResumenValidator,
  }),
  handler: async (ctx, args) => {
    const actor = await getAuthenticatedSessionActor(ctx);
    const factura = await ctx.db.get("facturacionFacturas", args.facturaId);
    if (!factura) {
      throw new Error("Factura no encontrada o ya fue eliminada");
    }

    if (isFacturaPeajes(factura) || isNotaCreditoPeajes(factura)) {
      throw new Error(
        "Las facturas PEAJES no pueden eliminarse desde el buzón. Usa el flujo de peajes."
      );
    }

    const empresa = normalizeEmpresa(factura.empresa);
    assertPuedeEliminarFacturaCompleta(actor, empresa);

    if (factura.numeroFactura.trim() !== args.confirmacionNumeroFactura.trim()) {
      throw new Error("El número de factura ingresado no coincide.");
    }

    const now = Date.now();
    return await ejecutarEliminacionFacturaCompletaInterno(ctx, factura, actor, now);
  },
});

async function ejecutarDevolucionDetalleInterno(
  ctx: MutationCtx,
  args: {
    facturaId: Id<"facturacionFacturas">;
    faseDestino: FaseDevolucionDestino;
    actorUserId: string;
    comentario: string;
    asignacionId?: Id<"facturacionAsignaciones">;
    responsableOverride?: UsuarioConfig;
  }
) {
  const factura = await ctx.db.get("facturacionFacturas", args.facturaId);
  if (!factura) throw new Error("Factura no encontrada.");
  if (isFacturaPeajes(factura)) {
    throw new Error("No se puede devolver una factura de peajes.");
  }

  const tarea = await ctx.db
    .query("facturacionTareas")
    .withIndex("by_facturaId", (q) => q.eq("facturaId", args.facturaId))
    .unique();
  if (!tarea) {
    throw new Error("La factura no tiene tarea de workflow.");
  }

  if (
    !puedeDevolverFactura({
      estadoActual: tarea.estado,
      esPeaje: Boolean(factura.esPeaje),
      tieneTarea: true,
    })
  ) {
    throw new Error("Esta factura no admite devolución.");
  }

  const estadoAnteriorHistorico = await resolverEstadoAnteriorHistoricoTerminal(
    ctx,
    tarea._id,
    tarea.estado
  );
  const faseOrigenResuelta = resolveFaseOrigenDevolucion(tarea.estado, estadoAnteriorHistorico);

  assertDestinoDevolucionValido(tarea.estado, args.faseDestino, faseOrigenResuelta);
  if (args.faseDestino === tarea.estado) {
    throw new Error("Selecciona una fase diferente para devolver.");
  }

  const comentario = args.comentario.trim();
  if (!comentario) {
    throw new Error("La observación es obligatoria para devolver la factura.");
  }

  const asignacionActiva = args.asignacionId
    ? (await getTareaFromAsignacion(ctx, args.asignacionId)).asignacion
    : await resolverAsignacionActivaDevolucion(ctx, tarea);

  if (
    asignacionActiva &&
    asignacionActiva.estado === "pendiente" &&
    asignacionActiva.fase === tarea.estado
  ) {
    if (String(asignacionActiva.tareaId) !== String(tarea._id)) {
      throw new Error("La asignación no corresponde a esta factura.");
    }
    if (args.asignacionId && String(asignacionActiva._id) !== String(args.asignacionId)) {
      throw new Error("La factura cambió de fase. Actualiza e intenta de nuevo.");
    }

    await crearDevolucionAFase(ctx, {
      tarea,
      asignacionOrigen: asignacionActiva,
      faseDestino: args.faseDestino,
      actorUserId: args.actorUserId,
      comentario,
      responsableOverride: args.responsableOverride,
    });
    return;
  }

  if (requiereReaperturaSinAsignacionActiva(tarea.estado)) {
    await crearReaperturaDesdeEstado(ctx, {
      tarea,
      faseDestino: args.faseDestino,
      actorUserId: args.actorUserId,
      comentario,
      responsableOverride: args.responsableOverride,
      asignacionReferencia:
        asignacionActiva ?? (await resolverUltimaAsignacionReferencia(ctx, tarea)),
    });
    return;
  }

  throw new Error("La asignación activa ya no está disponible.");
}

export const obtenerContextoDevolucionDesdeServidor = query({
  args: {
    secret: v.string(),
    facturaId: v.id("facturacionFacturas"),
  },
  returns: v.object({
    puedeDevolver: v.boolean(),
    estadoActual: v.string(),
    empresa: v.number(),
    asignacionId: v.union(v.id("facturacionAsignaciones"), v.null()),
    destinos: v.array(destinoDevolucionContextoValidator),
  }),
  handler: async (ctx, args) => {
    requireServerSecret(args.secret);

    const factura = await ctx.db.get("facturacionFacturas", args.facturaId);
    if (!factura) {
      throw new Error("Factura no encontrada.");
    }
    const empresa = normalizeEmpresa(factura.empresa);

    const tarea = await ctx.db
      .query("facturacionTareas")
      .withIndex("by_facturaId", (q) => q.eq("facturaId", args.facturaId))
      .unique();

    const estadoActual = tarea?.estado ?? "";
    const estadoAnteriorHistorico = tarea
      ? await resolverEstadoAnteriorHistoricoTerminal(ctx, tarea._id, estadoActual)
      : null;
    const faseOrigenResuelta = tarea
      ? resolveFaseOrigenDevolucion(estadoActual, estadoAnteriorHistorico)
      : null;
    const puedeDevolver = Boolean(
      tarea &&
        puedeDevolverFactura({
          estadoActual,
          esPeaje: Boolean(factura.esPeaje),
          tieneTarea: true,
          faseOrigenResuelta,
        })
    );

    if (!tarea || !puedeDevolver) {
      return {
        puedeDevolver: false,
        estadoActual,
        empresa,
        asignacionId: null,
        destinos: [],
      };
    }

    const asignacionActiva = await resolverAsignacionActivaDevolucion(ctx, tarea);
    if (!asignacionActiva && !requiereReaperturaSinAsignacionActiva(estadoActual)) {
      return {
        puedeDevolver: false,
        estadoActual,
        empresa,
        asignacionId: null,
        destinos: [],
      };
    }

    const destinos = await construirDestinosDevolucionContexto(
      ctx,
      tarea,
      estadoActual,
      faseOrigenResuelta
    );

    return {
      puedeDevolver: true,
      estadoActual,
      empresa,
      asignacionId: asignacionActiva?._id ?? null,
      destinos: destinos.map((destino) => ({
        ...destino,
        label: destino.label || DEVOLUCION_STAGE_LABELS[destino.fase],
      })),
    };
  },
});

export const ejecutarDevolucionDesdeServidor = mutation({
  args: {
    secret: v.string(),
    facturaId: v.id("facturacionFacturas"),
    faseDestino: faseDevolucionDestinoValidator,
    actorUserId: v.string(),
    comentario: v.string(),
    asignacionId: v.optional(v.id("facturacionAsignaciones")),
    responsableOverride: v.optional(responsableDevolucionValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireServerSecret(args.secret);

    await ejecutarDevolucionDetalleInterno(ctx, {
      facturaId: args.facturaId,
      faseDestino: args.faseDestino,
      actorUserId: args.actorUserId,
      comentario: args.comentario,
      asignacionId: args.asignacionId,
      responsableOverride: args.responsableOverride
        ? {
            ...args.responsableOverride,
            email: normalizeEmail(args.responsableOverride.email),
          }
        : undefined,
    });

    return null;
  },
});

const faseAsignacionGerenciaValidator = v.union(
  v.literal("recepcion"),
  v.literal("revision_lider"),
  v.literal("causacion"),
  v.literal("revision_impuestos"),
  v.literal("eventos_dian"),
  v.literal("gerencia"),
  v.literal("revision_tesoreria")
);

async function validarActorGerenciaEmpresa(ctx: MutationCtx, empresa: number, actorUserId: string) {
  const actorId = actorUserId.trim();
  if (!actorId) {
    throw new Error("No se pudo identificar al usuario de la sesión.");
  }
  const gerencias = await getGerenciasConfiguradas(ctx, empresa);
  const autorizado = gerencias.some((row) => usuariosCoincidenPorId(row, { usuarioId: actorId }));
  if (!autorizado) {
    throw new Error("No tienes permisos de Gerencia para esta empresa.");
  }
}

async function validarDestinatarioAsignacionGerencia(
  ctx: MutationCtx,
  empresa: number,
  targetStage: FaseAsignacion,
  assignee: UsuarioConfig
) {
  if (targetStage === "revision_lider") {
    if (!assignee.usuarioId?.trim() || !assignee.nombre?.trim() || !assignee.email?.trim()) {
      throw new Error("Selecciona un líder de proceso válido.");
    }
    return;
  }
  await validarResponsableDevolucion(ctx, empresa, targetStage, assignee);
}

function rolAsignacionPorFaseGerencia(fase: FaseAsignacion): RolAsignacion {
  const rolPorFase: Partial<Record<FaseAsignacion, RolAsignacion>> = {
    recepcion: "recepcion",
    revision_lider: "lider",
    jefe_directo: "jefe_directo",
    causacion: "analista_causacion",
    revision_impuestos: "contador_impuestos",
    eventos_dian: "eventos_dian",
    pendiente_rechazar_dian: "rechazos_dian",
    gerencia: "gerencia",
    revision_tesoreria: "tesorero",
  };
  const rol = rolPorFase[fase];
  if (!rol) {
    throw new Error("Fase destino no permitida.");
  }
  return rol;
}

function buildSnapshotPatchAsignacionGerencia(
  faseDestino: FaseAsignacion,
  usuario: UsuarioConfig
): Partial<Doc<"facturacionTareas">> {
  const email = normalizeEmail(usuario.email);
  const base = {
    asignadoAUserId: usuario.usuarioId,
    asignadoANombre: usuario.nombre,
    asignadoAEmail: email,
  };

  switch (faseDestino) {
    case "recepcion":
      return base;
    case "revision_lider":
      return {
        ...base,
        liderProcesoUserId: usuario.usuarioId,
        liderProcesoNombre: usuario.nombre,
        liderProcesoEmail: email,
        liderProcesoProcesoId: usuario.procesoId,
        liderProcesoProcesoNombre: sanitizeProcesoNombre(usuario.procesoNombre),
        lideresTotal: 1,
        lideresCompletados: 0,
      };
    case "causacion":
      return {
        ...base,
        causacionAsignadoAUserId: usuario.usuarioId,
        causacionAsignadoANombre: usuario.nombre,
        causacionAsignadoAEmail: email,
        fechaAsignacionCausacion: Date.now(),
      };
    case "revision_impuestos":
      return {
        ...base,
        contadorAsignadoAUserId: usuario.usuarioId,
        contadorAsignadoANombre: usuario.nombre,
        contadorAsignadoAEmail: email,
      };
    case "eventos_dian":
      return {
        ...base,
        eventosDianAsignadoAUserId: usuario.usuarioId,
        eventosDianAsignadoANombre: usuario.nombre,
        eventosDianAsignadoAEmail: email,
      };
    case "gerencia":
      return {
        ...base,
        gerenciaAsignadoAUserId: usuario.usuarioId,
        gerenciaAsignadoANombre: usuario.nombre,
        gerenciaAsignadoAEmail: email,
      };
    case "revision_tesoreria":
      return {
        ...base,
        tesoreroAsignadoAUserId: usuario.usuarioId,
        tesoreroAsignadoANombre: usuario.nombre,
        tesoreroAsignadoAEmail: email,
      };
    default:
      return base;
  }
}

async function cancelarTodasAsignacionesPendientesDeTarea(
  ctx: MutationCtx,
  tareaId: Id<"facturacionTareas">,
  exceptId?: Id<"facturacionAsignaciones">,
  audit?: {
    facturaId: Id<"facturacionFacturas">;
    empresa?: number;
    actorUserId?: string;
    actorNombre?: string;
    actorEmail?: string;
    estadoAnterior: string;
    estadoNuevo: string;
  }
) {
  const pendientes = await ctx.db
    .query("facturacionAsignaciones")
    .withIndex("by_tareaId_estado", (q) => q.eq("tareaId", tareaId).eq("estado", "pendiente"))
    .collect();

  for (const item of pendientes.filter((asignacion) => asignacion._id !== exceptId)) {
    await cerrarAsignacion(ctx, item, "cancelada", "Cancelada por reasignación de Gerencia.");
    if (audit) {
      await registrarAprobacion(ctx, {
        tareaId,
        facturaId: audit.facturaId,
        asignacionId: item._id,
        empresa: audit.empresa,
        actorUserId: audit.actorUserId,
        actorNombre: audit.actorNombre,
        actorEmail: audit.actorEmail,
        accion: "cancelar",
        comentario: "Asignación cancelada por reasignación de Gerencia.",
        estadoAnterior: audit.estadoAnterior,
        estadoNuevo: audit.estadoNuevo,
      });
    }
  }
}

async function validarEntradaAsignacionFaseUsuario(
  ctx: MutationCtx,
  args: {
    asignacionId: Id<"facturacionAsignaciones">;
    targetStage: FaseAsignacion;
    assignee: UsuarioConfig;
    observation: string;
    actorUserId: string;
  }
) {
  const { asignacion, tarea, empresa } = await getTareaFromAsignacion(ctx, args.asignacionId);
  const assignee: UsuarioConfig = {
    ...args.assignee,
    email: normalizeEmail(args.assignee.email),
  };
  const assigneeId = assignee.usuarioId?.trim();
  if (!assigneeId) {
    throw new Error("Selecciona un responsable válido.");
  }
  if (!args.observation.trim()) {
    throw new Error("La observación es obligatoria.");
  }

  await validarActorGerenciaEmpresa(ctx, empresa, args.actorUserId);
  await validarDestinatarioAsignacionGerencia(ctx, empresa, args.targetStage, assignee);

  const faseActual = tarea.estado;
  const responsableActualId = asignacion.asignadoAUserId?.trim() ?? "";
  if (args.targetStage === faseActual && assigneeId === responsableActualId) {
    throw new Error(
      "La factura ya está en esa fase con el mismo responsable. Elige otro usuario o cambia la fase destino."
    );
  }

  return { asignacion, tarea, empresa };
}

async function ejecutarAsignacionFaseUsuarioInterno(
  ctx: MutationCtx,
  args: {
    asignacionId: Id<"facturacionAsignaciones">;
    targetStage: FaseAsignacion;
    assignee: UsuarioConfig;
    observation: string;
    actorUserId: string;
    actorNombre: string;
    actorEmail: string;
  }
) {
  const { asignacion, tarea, empresa } = await validarEntradaAsignacionFaseUsuario(ctx, args);
  const assignee: UsuarioConfig = {
    ...args.assignee,
    email: normalizeEmail(args.assignee.email),
  };
  const faseActual = tarea.estado;

  const metadata = {
    origen: "asignar_fase_usuario",
    faseOrigen: asignacion.fase,
    faseDestino: args.targetStage,
    actorUserId: args.actorUserId,
    actorNombre: args.actorNombre,
    actorEmail: normalizeEmail(args.actorEmail),
    asignacionOrigenId: asignacion._id,
    reasignadoAUserId: assignee.usuarioId,
    reasignadoANombre: assignee.nombre,
    reasignadoAEmail: assignee.email,
    ...(asignacion.fase === "revision_lider" && args.targetStage === "causacion"
      ? metadataOrigenRevisionLider({
          asignacionId: asignacion._id,
          userId: asignacion.asignadoAUserId,
          nombre: asignacion.asignadoANombre,
          email: asignacion.asignadoAEmail,
        })
      : {}),
  };

  await cerrarAsignacion(ctx, asignacion, "reasignada", args.observation, metadata);
  await cancelarTodasAsignacionesPendientesDeTarea(ctx, tarea._id, undefined, {
    facturaId: tarea.facturaId,
    empresa,
    actorUserId: args.actorUserId,
    actorNombre: args.actorNombre,
    actorEmail: args.actorEmail,
    estadoAnterior: faseActual,
    estadoNuevo: args.targetStage,
  });

  const grupoId = createGroupId(args.targetStage, tarea.facturaId);
  const rol = rolAsignacionPorFaseGerencia(args.targetStage);
  const nuevaAsignacionId = await insertarAsignacion(ctx, {
    facturaId: tarea.facturaId,
    tareaId: tarea._id,
    empresa,
    fase: args.targetStage,
    rol,
    grupoId,
    usuario: assignee,
    metadata,
  });

  await registrarAprobacion(ctx, {
    tareaId: tarea._id,
    facturaId: tarea.facturaId,
    asignacionId: asignacion._id,
    empresa,
    actorUserId: args.actorUserId,
    actorNombre: args.actorNombre,
    actorEmail: args.actorEmail,
    accion: "asignar_fase_usuario",
    comentario: args.observation,
    estadoAnterior: faseActual,
    estadoNuevo: args.targetStage,
  });

  const snapshotPatch = buildSnapshotPatchAsignacionGerencia(args.targetStage, assignee);
  await patchTareaEstado(ctx, tarea, args.targetStage, {
    ...snapshotPatch,
    ...(tarea.finalizadoEn !== undefined ? { finalizadoEn: undefined } : {}),
    grupoAsignacionActualId: grupoId,
    currentAsignacionId: nuevaAsignacionId,
  });
}

export const ejecutarAsignarFaseUsuarioDesdeServidor = mutation({
  args: {
    secret: v.string(),
    actorUserId: v.string(),
    actorNombre: v.string(),
    actorEmail: v.string(),
    assignments: v.array(
      v.object({
        asignacionId: v.id("facturacionAsignaciones"),
        targetStage: faseAsignacionGerenciaValidator,
        assignee: usuarioAsignacionValidator,
        observation: v.string(),
      })
    ),
  },
  returns: v.object({
    ok: v.literal(true),
    updated: v.number(),
  }),
  handler: async (ctx, args) => {
    requireServerSecret(args.secret);

    if (args.assignments.length === 0) {
      throw new Error("No hay asignaciones para procesar.");
    }

    const actorUserId = args.actorUserId.trim();
    if (!actorUserId) {
      throw new Error("No se pudo identificar al usuario de la sesión.");
    }

    for (const item of args.assignments) {
      await validarEntradaAsignacionFaseUsuario(ctx, {
        asignacionId: item.asignacionId,
        targetStage: item.targetStage,
        assignee: item.assignee,
        observation: item.observation,
        actorUserId,
      });
    }

    for (const item of args.assignments) {
      await ejecutarAsignacionFaseUsuarioInterno(ctx, {
        asignacionId: item.asignacionId,
        targetStage: item.targetStage,
        assignee: item.assignee,
        observation: item.observation.trim(),
        actorUserId,
        actorNombre: args.actorNombre,
        actorEmail: args.actorEmail,
      });
    }

    return { ok: true as const, updated: args.assignments.length };
  },
});

export const obtenerAsignacionParaServidor = query({
  args: {
    secret: v.string(),
    asignacionId: v.id("facturacionAsignaciones"),
  },
  returns: v.union(
    v.object({
      empresa: v.number(),
      estado: v.string(),
      fase: v.string(),
      asignadoAUserId: v.optional(v.string()),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    requireServerSecret(args.secret);
    const asignacion = await ctx.db.get("facturacionAsignaciones", args.asignacionId);
    if (!asignacion) return null;
    const tarea = asignacion.tareaId ? await ctx.db.get("facturacionTareas", asignacion.tareaId) : null;
    return {
      empresa: normalizeEmpresa(asignacion.empresa ?? tarea?.empresa),
      estado: tarea?.estado ?? asignacion.fase,
      fase: asignacion.fase,
      asignadoAUserId: asignacion.asignadoAUserId,
    };
  },
});

const anticipoOwnerSnapshotValidator = v.object({
  source: v.optional(v.union(v.literal("historial"), v.literal("directorio_empresa"))),
  liderUserId: v.optional(v.string()),
  liderNombre: v.string(),
  liderEmail: v.string(),
  procesoId: v.optional(v.number()),
  procesoNombre: v.optional(v.string()),
  bolsaId: v.optional(v.id("bolsasAnticipos")),
  liderAsignacionId: v.optional(v.id("facturacionAsignaciones")),
  elegible: v.optional(v.boolean()),
});

const anticipoOwnerCandidateValidator = v.object({
  liderAsignacionId: v.id("facturacionAsignaciones"),
  liderUserId: v.optional(v.string()),
  liderNombre: v.string(),
  liderEmail: v.string(),
  procesoId: v.optional(v.number()),
  procesoNombre: v.optional(v.string()),
  ultimaInteraccionEn: v.number(),
  estadoAsignacion: v.string(),
  esActual: v.boolean(),
});

const anticipoOwnerDirectoryValidator = v.object({
  liderUserId: v.string(),
  liderNombre: v.string(),
  liderEmail: v.string(),
  procesoId: v.optional(v.number()),
  procesoNombre: v.optional(v.string()),
});

const anticipoBagPreviewValidator = v.object({
  bolsaId: v.optional(v.id("bolsasAnticipos")),
  procesoId: v.optional(v.number()),
  procesoNombre: v.optional(v.string()),
  anticiposDisponibles: v.number(),
  pendienteTotal: v.number(),
});

const anticipoBolsaConflictoValidator = v.object({
  responsableGuardado: anticipoOwnerSnapshotValidator,
  liderActual: anticipoOwnerSnapshotValidator,
  bolsaGuardadaId: v.optional(v.id("bolsasAnticipos")),
  bolsaLiderId: v.optional(v.id("bolsasAnticipos")),
});

const anticipoManagementContextValidator = v.object({
  facturaId: v.id("facturacionFacturas"),
  fase: v.string(),
  asignacionActivaId: v.union(v.id("facturacionAsignaciones"), v.null()),
  puedeCruzar: v.boolean(),
  puedeCambiarResponsable: v.boolean(),
  requiereSeleccionResponsable: v.boolean(),
  motivoBloqueoCruce: v.union(v.string(), v.null()),
  origenBolsa: v.union(v.literal("lider_asignado"), v.literal("responsable_guardado")),
  conflictoBolsaLider: v.union(anticipoBolsaConflictoValidator, v.null()),
  puedeEditar: v.boolean(),
  motivoBloqueo: v.union(v.string(), v.null()),
  facturaMarcada: v.boolean(),
  duenoActual: v.union(anticipoOwnerSnapshotValidator, v.null()),
  candidatos: v.array(anticipoOwnerCandidateValidator),
  bolsaVista: v.union(anticipoBagPreviewValidator, v.null()),
  crucesActivos: v.object({
    ids: v.array(v.id("facturacionAnticipoLegalizaciones")),
    cantidad: v.number(),
    valorAplicado: v.number(),
    bolsaId: v.optional(v.id("bolsasAnticipos")),
  }),
  requiereConfirmarReversion: v.boolean(),
  anticipos: v.array(v.any()),
  legalizaciones: v.array(v.any()),
  totales: v.object({
    valorFactura: v.number(),
    valorBrutoFactura: v.number(),
    valorNotasCredito: v.number(),
    valorAplicadoFactura: v.number(),
    pendienteDisponible: v.number(),
    diferenciaNoCubierta: v.number(),
    valorSolicitado: v.number(),
    valorLegalizado: v.number(),
  }),
  resumenContable: v.object({
    valorContable: v.number(),
    valorDocumentosInternos: v.number(),
    pagosAplicados: v.number(),
    baseCruceAnticipos: v.number(),
    valorAnticiposAplicados: v.number(),
    valorAPagar: v.number(),
    moneda: v.string(),
  }),
});

type AnticipoEditableAccess = {
  factura: Doc<"facturacionFacturas">;
  tarea: Doc<"facturacionTareas">;
  asignacion: Doc<"facturacionAsignaciones"> | null;
  puedeCruzar: boolean;
  puedeCambiarResponsable: boolean;
  puedeEditar: boolean;
  motivoBloqueo: string | null;
  motivoBloqueoCruce: string | null;
  fase: string;
};

function motivoBloqueoPermisoAnticipo(permiso: PermisoAnticipo, fase: string) {
  if (permiso === "cambiar_responsable") {
    return "El dueño del anticipo sólo se gestiona en causación, contabilidad o eventos DIAN.";
  }
  if (permiso === "cruce") {
    return "El cruce de anticipos sólo se gestiona en líder, causación, contabilidad o eventos DIAN.";
  }
  return `El anticipo no se consulta en la fase ${fase}.`;
}

async function resolverAccesoAnticipoEditable(
  ctx: FacturacionCtx,
  args: {
    facturaId: Id<"facturacionFacturas">;
    asignacionId?: Id<"facturacionAsignaciones">;
    actorUserId?: string;
    actorEmail?: string;
    permisoRequerido?: PermisoAnticipo;
    requirePermiso?: boolean;
  }
): Promise<AnticipoEditableAccess> {
  const permisoRequerido = args.permisoRequerido ?? "consulta";
  const factura = await ctx.db.get("facturacionFacturas", args.facturaId);
  if (!factura) throw new Error("Factura no encontrada.");

  if (isFacturaPeajes(factura) || isNotaCreditoNoPeajes(factura)) {
    throw new Error("Este tipo de documento no admite legalización de anticipo.");
  }

  const tarea = await ctx.db
    .query("facturacionTareas")
    .withIndex("by_facturaId", (q) => q.eq("facturaId", args.facturaId))
    .unique();
  if (!tarea) throw new Error("Tarea de facturación no encontrada.");

  const fase = tarea.estado;
  const fasePermiteConsulta = fasePermitePermisoAnticipo(fase, "consulta");
  const fasePermiteCruce = fasePermitePermisoAnticipo(fase, "cruce");
  const fasePermiteCambiarResponsable = fasePermitePermisoAnticipo(fase, "cambiar_responsable");

  if (!fasePermiteConsulta) {
    if (args.requirePermiso) {
      throw new Error(motivoBloqueoPermisoAnticipo(permisoRequerido, fase));
    }
    return {
      factura,
      tarea,
      asignacion: null,
      puedeCruzar: false,
      puedeCambiarResponsable: false,
      puedeEditar: false,
      motivoBloqueo: motivoBloqueoPermisoAnticipo("consulta", fase),
      motivoBloqueoCruce: motivoBloqueoPermisoAnticipo("cruce", fase),
      fase,
    };
  }

  const asignacion = args.asignacionId
    ? await ctx.db.get("facturacionAsignaciones", args.asignacionId)
    : tarea.currentAsignacionId
      ? await ctx.db.get("facturacionAsignaciones", tarea.currentAsignacionId)
      : null;

  if (!asignacion) {
    const motivo = "No hay una asignación activa para esta factura.";
    if (args.requirePermiso) throw new Error(motivo);
    return {
      factura,
      tarea,
      asignacion: null,
      puedeCruzar: false,
      puedeCambiarResponsable: false,
      puedeEditar: false,
      motivoBloqueo: motivo,
      motivoBloqueoCruce: motivo,
      fase,
    };
  }

  const asignacionValida =
    asignacion.facturaId === args.facturaId &&
    asignacion.tareaId === tarea._id &&
    asignacion.estado === "pendiente" &&
    asignacion.fase === fase &&
    asignacion.fase === tarea.estado;

  if (!asignacionValida) {
    const motivo = "La asignación ya no está activa o no coincide con la fase actual.";
    if (args.requirePermiso) throw new Error(motivo);
    return {
      factura,
      tarea,
      asignacion,
      puedeCruzar: false,
      puedeCambiarResponsable: false,
      puedeEditar: false,
      motivoBloqueo: motivo,
      motivoBloqueoCruce: motivo,
      fase,
    };
  }

  const actorUserId = args.actorUserId?.trim() ?? "";
  const actorEmail = args.actorEmail?.trim() ?? "";
  const esAsignado =
    actorUserId || actorEmail
      ? sessionMatchesAsignacion({
          sessionUserId: actorUserId,
          sessionEmail: actorEmail,
          asignacion,
        })
      : false;

  if (!esAsignado) {
    const motivo =
      "Sólo el usuario asignado activo puede gestionar el dueño y cruce del anticipo.";
    if (args.requirePermiso) {
      throw new Error(motivo);
    }
    return {
      factura,
      tarea,
      asignacion,
      puedeCruzar: false,
      puedeCambiarResponsable: false,
      puedeEditar: false,
      motivoBloqueo: motivo,
      motivoBloqueoCruce: motivo,
      fase,
    };
  }

  const puedeCambiarResponsable = fasePermiteCambiarResponsable;
  let puedeCruzar = fasePermiteCruce;
  let motivoBloqueoCruce: string | null = null;
  let motivoBloqueo: string | null = null;

  if (!puedeCambiarResponsable) {
    motivoBloqueo = motivoBloqueoPermisoAnticipo("cambiar_responsable", fase);
  }

  if (fase === "revision_lider") {
    const liderSnapshot = buildLiderAsignadoSnapshot(asignacion);
    if (!liderSnapshot || !hasAnticipoProcesoSnapshot(liderSnapshot)) {
      puedeCruzar = false;
      motivoBloqueoCruce =
        "El líder asignado no tiene proceso configurado. Reasigna la factura a una persona con bolsa válida.";
    }
  }

  if (!fasePermitePermisoAnticipo(fase, permisoRequerido)) {
    if (args.requirePermiso) {
      throw new Error(motivoBloqueoPermisoAnticipo(permisoRequerido, fase));
    }
  }

  return {
    factura,
    tarea,
    asignacion,
    puedeCruzar,
    puedeCambiarResponsable,
    puedeEditar: puedeCambiarResponsable,
    motivoBloqueo,
    motivoBloqueoCruce,
    fase,
  };
}

async function construirVistaBolsaAnticipo(
  ctx: FacturacionCtx,
  factura: Doc<"facturacionFacturas">,
  owner: {
    liderUserId?: string;
    liderNombre: string;
    liderEmail: string;
    procesoId?: number;
    procesoNombre?: string;
  },
  bolsaId?: Id<"bolsasAnticipos">
) {
  const facturaPreview = {
    ...factura,
    anticipoLiderUserId: owner.liderUserId,
    anticipoLiderNombre: owner.liderNombre,
    anticipoLiderEmail: owner.liderEmail,
    anticipoProcesoId: owner.procesoId,
    anticipoProcesoNombre: owner.procesoNombre,
    anticipoBolsaId: bolsaId,
  };
  const anticipos = await obtenerAnticiposParaBolsaFactura(ctx, facturaPreview);
  const pendientes = anticipos.filter((anticipo) => isAnticipoPendienteLegalizacion(anticipo));
  const pendienteTotal = pendientes.reduce(
    (total, anticipo) => total + getSaldoPendienteAnticipo(anticipo),
    0
  );
  return {
    bolsaId,
    procesoId: owner.procesoId,
    procesoNombre: owner.procesoNombre,
    anticiposDisponibles: pendientes.length,
    pendienteTotal,
    facturaPreview,
  };
}

async function construirContextoAnticipoManagement(
  ctx: FacturacionCtx,
  args: {
    facturaId: Id<"facturacionFacturas">;
    asignacionId?: Id<"facturacionAsignaciones">;
    actorUserId?: string;
    actorEmail?: string;
    liderAsignacionId?: Id<"facturacionAsignaciones">;
    liderDirectorioPreview?: {
      liderUserId: string;
      liderNombre: string;
      liderEmail: string;
      procesoId?: number;
      procesoNombre?: string;
    };
  }
) {
  const acceso = await resolverAccesoAnticipoEditable(ctx, {
    ...args,
    permisoRequerido: "consulta",
  });

  const legalizacionesActivas = await listarLegalizacionesActivasFactura(ctx, args.facturaId);
  const valorAplicadoCruces = legalizacionesActivas.reduce(
    (total, row) => total + row.valorAplicado,
    0
  );
  const bolsaActualId = acceso.factura.anticipoBolsaId;

  let candidatos: ReturnType<typeof buildAnticipoOwnerCandidates>["candidatos"] = [];
  let duenoActual: AnticipoOwnerSnapshot | null = null;
  let ownerParaVista: {
    liderUserId?: string;
    liderNombre: string;
    liderEmail: string;
    procesoId?: number;
    procesoNombre?: string;
  } | null = null;
  let origenBolsa: "lider_asignado" | "responsable_guardado" = "responsable_guardado";
  let conflictoBolsaLider: {
    responsableGuardado: AnticipoOwnerSnapshot;
    liderActual: AnticipoOwnerSnapshot;
    bolsaGuardadaId?: Id<"bolsasAnticipos">;
    bolsaLiderId?: Id<"bolsasAnticipos">;
  } | null = null;
  let puedeCruzar = acceso.puedeCruzar;
  let motivoBloqueoCruce = acceso.motivoBloqueoCruce;
  let bolsaEnConflicto = false;
  let requiereSeleccionResponsable = false;
  let bolsaCambio = false;

  if (acceso.fase === "revision_lider" && acceso.asignacion) {
    const liderSnapshot = buildLiderAsignadoSnapshot(acceso.asignacion);
    duenoActual =
      acceso.factura.esLegalizacionAnticipo &&
      (acceso.factura.anticipoLiderNombre ||
        acceso.factura.anticipoLiderUserId ||
        hasAnticipoProcesoSnapshot({
          procesoId: acceso.factura.anticipoProcesoId,
          procesoNombre: acceso.factura.anticipoProcesoNombre,
        }))
        ? {
            liderUserId: acceso.factura.anticipoLiderUserId,
            liderNombre:
              acceso.factura.anticipoLiderNombre ??
              acceso.factura.anticipoLiderUserId ??
              acceso.factura.anticipoProcesoNombre ??
              "Sin líder",
            liderEmail: normalizeEmail(acceso.factura.anticipoLiderEmail ?? fallbackContactEmail()),
            procesoId: acceso.factura.anticipoProcesoId,
            procesoNombre: sanitizeProcesoNombre(acceso.factura.anticipoProcesoNombre),
            bolsaId: acceso.factura.anticipoBolsaId,
            elegible: true,
          }
        : null;

    if (!liderSnapshot || !hasAnticipoProcesoSnapshot(liderSnapshot)) {
      puedeCruzar = false;
      motivoBloqueoCruce =
        acceso.motivoBloqueoCruce ??
        "El líder asignado no tiene proceso configurado. Reasigna la factura a una persona con bolsa válida.";
      ownerParaVista = null;
    } else {
      const liderBolsaDoc = await getBolsaAnticipoBySnapshot(
        ctx,
        buildBolsaAnticipoSnapshot({
          empresa: acceso.factura.empresa,
          tipoBolsa: isFacturaPeajes(acceso.factura) ? "peajes" : "general",
          procesoId: liderSnapshot.procesoId,
          procesoNombre: liderSnapshot.procesoNombre,
        })
      );
      const bolsaGuardada = {
        bolsaId: acceso.factura.anticipoBolsaId,
        procesoId: acceso.factura.anticipoProcesoId,
        procesoNombre: acceso.factura.anticipoProcesoNombre,
      };
      const bolsaLider = {
        bolsaId: liderBolsaDoc?._id,
        procesoId: liderSnapshot.procesoId,
        procesoNombre: liderSnapshot.procesoNombre,
      };

      if (legalizacionesActivas.length > 0) {
        const mismaBolsa = sameAnticipoBolsaSnapshot(bolsaGuardada, bolsaLider);
        if (mismaBolsa) {
          ownerParaVista = duenoActual ?? liderSnapshot;
          origenBolsa = "responsable_guardado";
        } else {
          bolsaEnConflicto = true;
          puedeCruzar = false;
          motivoBloqueoCruce =
            "Esta factura tiene cruces activos de otra bolsa. Cierra este panel y usa Desmarcar para revertirlos antes de cruzar con tu bolsa.";
          ownerParaVista = duenoActual ?? {
            liderUserId: acceso.factura.anticipoLiderUserId,
            liderNombre:
              acceso.factura.anticipoLiderNombre ??
              acceso.factura.anticipoLiderUserId ??
              "Sin líder",
            liderEmail: normalizeEmail(acceso.factura.anticipoLiderEmail ?? fallbackContactEmail()),
            procesoId: acceso.factura.anticipoProcesoId,
            procesoNombre: sanitizeProcesoNombre(acceso.factura.anticipoProcesoNombre),
          };
          origenBolsa = "responsable_guardado";
          if (duenoActual) {
            conflictoBolsaLider = {
              responsableGuardado: duenoActual,
              liderActual: { ...liderSnapshot, bolsaId: liderBolsaDoc?._id, elegible: true },
              ...(bolsaGuardada.bolsaId ? { bolsaGuardadaId: bolsaGuardada.bolsaId } : {}),
              ...(bolsaLider.bolsaId ? { bolsaLiderId: bolsaLider.bolsaId } : {}),
            };
          }
        }
      } else {
        ownerParaVista = liderSnapshot;
        origenBolsa = "lider_asignado";
      }
    }
  } else if (acceso.puedeCambiarResponsable) {
    const asignaciones = await ctx.db
      .query("facturacionAsignaciones")
      .withIndex("by_facturaId", (q) => q.eq("facturaId", args.facturaId))
      .collect();
    const ownerData = buildAnticipoOwnerCandidates({
      asignaciones,
      factura: acceso.factura,
    });
    candidatos = ownerData.candidatos;
    duenoActual = ownerData.duenoActual;

    let previewCandidate = args.liderAsignacionId
      ? candidatos.find((row) => String(row.liderAsignacionId) === String(args.liderAsignacionId))
      : undefined;
    if (args.liderAsignacionId && !previewCandidate) {
      const asignacionPreview = await ctx.db.get("facturacionAsignaciones", args.liderAsignacionId);
      if (asignacionPreview) {
        previewCandidate = candidatos.find(
          (row) => String(row.liderAsignacionId) === String(asignacionPreview._id)
        );
      }
    }

    ownerParaVista =
      args.liderDirectorioPreview ??
      previewCandidate ??
      (duenoActual
        ? {
            liderUserId: duenoActual.liderUserId,
            liderNombre: duenoActual.liderNombre,
            liderEmail: duenoActual.liderEmail,
            procesoId: duenoActual.procesoId,
            procesoNombre: duenoActual.procesoNombre,
          }
        : null);

    bolsaCambio = Boolean(
      ownerParaVista &&
        acceso.factura.esLegalizacionAnticipo &&
        !sameAnticipoProcesoSnapshot(
          {
            procesoId: acceso.factura.anticipoProcesoId,
            procesoNombre: acceso.factura.anticipoProcesoNombre,
          },
          ownerParaVista
        )
    );
    requiereSeleccionResponsable =
      !acceso.factura.esLegalizacionAnticipo && candidatos.length > 0;
  } else if (
    acceso.factura.esLegalizacionAnticipo &&
    (acceso.factura.anticipoLiderNombre || acceso.factura.anticipoLiderUserId)
  ) {
    duenoActual = {
      liderUserId: acceso.factura.anticipoLiderUserId,
      liderNombre:
        acceso.factura.anticipoLiderNombre ??
        acceso.factura.anticipoLiderUserId ??
        acceso.factura.anticipoProcesoNombre ??
        "Sin líder",
      liderEmail: normalizeEmail(acceso.factura.anticipoLiderEmail ?? fallbackContactEmail()),
      procesoId: acceso.factura.anticipoProcesoId,
      procesoNombre: sanitizeProcesoNombre(acceso.factura.anticipoProcesoNombre),
      bolsaId: acceso.factura.anticipoBolsaId,
      elegible: true,
    };
    ownerParaVista = duenoActual;
    origenBolsa = "responsable_guardado";
  }

  const previewBolsaDoc = ownerParaVista
    ? await getBolsaAnticipoBySnapshot(
        ctx,
        buildBolsaAnticipoSnapshot({
          empresa: acceso.factura.empresa,
          tipoBolsa: isFacturaPeajes(acceso.factura) ? "peajes" : "general",
          procesoId: ownerParaVista.procesoId,
          procesoNombre: ownerParaVista.procesoNombre,
        })
      )
    : null;
  const previewBolsa = ownerParaVista
    ? await construirVistaBolsaAnticipo(ctx, acceso.factura, ownerParaVista, previewBolsaDoc?._id)
    : null;

  const consultarCrucesGuardados = bolsaEnConflicto;
  const omitirCrucesParaPreview =
    bolsaCambio && acceso.factura.esLegalizacionAnticipo && !consultarCrucesGuardados;

  const legalizacionData =
    previewBolsa && !omitirCrucesParaPreview
      ? await obtenerLegalizacionAnticiposFacturaHandler(ctx, {
          facturaId: args.facturaId,
          facturaOverride: consultarCrucesGuardados ? undefined : previewBolsa.facturaPreview,
          omitirCrucesActivos: omitirCrucesParaPreview,
        })
      : previewBolsa
        ? await obtenerLegalizacionAnticiposFacturaHandler(ctx, {
            facturaId: args.facturaId,
            facturaOverride: previewBolsa.facturaPreview,
            omitirCrucesActivos: true,
          })
        : acceso.factura.esLegalizacionAnticipo || consultarCrucesGuardados
          ? await obtenerLegalizacionAnticiposFacturaHandler(ctx, {
              facturaId: args.facturaId,
            })
          : null;

  const valorLegalizableBase =
    legalizacionData?.totales.valorFactura ?? getValorContable(acceso.factura);

  return {
    facturaId: args.facturaId,
    fase: acceso.fase,
    asignacionActivaId: acceso.asignacion?._id ?? null,
    puedeCruzar,
    puedeCambiarResponsable: acceso.puedeCambiarResponsable,
    requiereSeleccionResponsable,
    motivoBloqueoCruce,
    origenBolsa,
    conflictoBolsaLider,
    puedeEditar: acceso.puedeEditar,
    motivoBloqueo: acceso.motivoBloqueo,
    facturaMarcada: Boolean(acceso.factura.esLegalizacionAnticipo),
    duenoActual,
    candidatos,
    bolsaVista: previewBolsa
      ? {
          ...(previewBolsa.bolsaId ? { bolsaId: previewBolsa.bolsaId } : {}),
          procesoId: previewBolsa.procesoId,
          procesoNombre: previewBolsa.procesoNombre,
          anticiposDisponibles: previewBolsa.anticiposDisponibles,
          pendienteTotal: previewBolsa.pendienteTotal,
        }
      : null,
    crucesActivos: {
      ids: legalizacionesActivas.map((row) => row._id),
      cantidad: legalizacionesActivas.length,
      valorAplicado: valorAplicadoCruces,
      ...(bolsaActualId ? { bolsaId: bolsaActualId } : {}),
    },
    requiereConfirmarReversion: Boolean(bolsaCambio && legalizacionesActivas.length > 0),
    anticipos: legalizacionData?.anticipos ?? [],
    legalizaciones: bolsaEnConflicto
      ? (legalizacionData?.legalizacionesDetalle ?? [])
      : omitirCrucesParaPreview
        ? []
        : (legalizacionData?.legalizacionesDetalle ?? []),
    totales: legalizacionData?.totales ?? {
      valorFactura: valorLegalizableBase,
      valorBrutoFactura: acceso.factura.total,
      valorNotasCredito: 0,
      valorAplicadoFactura: bolsaEnConflicto
        ? valorAplicadoCruces
        : omitirCrucesParaPreview
          ? 0
          : valorAplicadoCruces,
      pendienteDisponible: previewBolsa?.pendienteTotal ?? 0,
      diferenciaNoCubierta: Math.max(
        valorLegalizableBase -
          (bolsaEnConflicto ? valorAplicadoCruces : omitirCrucesParaPreview ? 0 : valorAplicadoCruces),
        0
      ),
      valorSolicitado: 0,
      valorLegalizado: 0,
    },
    resumenContable: await buildResumenContableFactura(ctx, acceso.factura),
  };
}

async function obtenerLegalizacionAnticiposFacturaHandler(
  ctx: FacturacionCtx,
  args: {
    facturaId: Id<"facturacionFacturas">;
    facturaOverride?: Doc<"facturacionFacturas">;
    omitirCrucesActivos?: boolean;
  }
) {
  const factura = args.facturaOverride ?? (await ctx.db.get("facturacionFacturas", args.facturaId));
  if (!factura) return null;

  const tarea = await ctx.db
    .query("facturacionTareas")
    .withIndex("by_facturaId", (q) => q.eq("facturaId", args.facturaId))
    .unique();
  const legalizaciones = args.omitirCrucesActivos
    ? []
    : await listarLegalizacionesActivasFactura(ctx, args.facturaId);
  const legalizacionesDetalle = await Promise.all(
    legalizaciones.map(async (legalizacion) => ({
      ...legalizacion,
      anticipo: await ctx.db.get("anticipos", legalizacion.anticipoId),
    }))
  );
  const aplicadoPorAnticipo = new Map<string, number>(
    legalizaciones.map((row) => [String(row.anticipoId), row.valorAplicado])
  );
  const empresa = normalizeEmpresa(factura.empresa);
  const anticiposDeBolsa = await obtenerAnticiposParaBolsaFactura(ctx, factura);

  const faltantesActuales = await Promise.all(
    legalizaciones
      .filter(
        (row) =>
          !anticiposDeBolsa.some((anticipo) => String(anticipo._id) === String(row.anticipoId))
      )
      .map((row) => ctx.db.get("anticipos", row.anticipoId))
  );

  const anticiposMap = new Map<string, Doc<"anticipos">>();
  for (const anticipo of [...anticiposDeBolsa, ...faltantesActuales]) {
    if (anticipo) anticiposMap.set(String(anticipo._id), anticipo);
  }

  const anticipos = Array.from(anticiposMap.values())
    .filter((anticipo) => {
      const aplicadoEnFactura = aplicadoPorAnticipo.has(String(anticipo._id));
      return (
        normalizeEmpresa(anticipo.empresa_id ?? anticipo.empresa) === empresa &&
        (isAnticipoPendienteLegalizacion(anticipo) || aplicadoEnFactura)
      );
    })
    .map((anticipo) => {
      const aplicadoEnFactura = aplicadoPorAnticipo.get(String(anticipo._id)) ?? 0;
      const valorLegalizado = getSaldoLegalizadoAnticipo(anticipo);
      const pendiente = getSaldoPendienteAnticipo(anticipo);
      const disponibleParaFactura = pendiente + aplicadoEnFactura;
      return {
        ...anticipo,
        valorLegalizado,
        pendienteLegalizar: pendiente,
        aplicadoEnFactura,
        disponibleParaFactura,
      };
    })
    .filter((anticipo) => anticipo.disponibleParaFactura > 0 || anticipo.aplicadoEnFactura > 0)
    .sort((a, b) => a.consecutivo - b.consecutivo);

  const valorLegalizable = await obtenerValorLegalizableFactura(ctx, factura);
  const notasCreditoPeajes = await obtenerNotasCreditoPeajesFactura(ctx, factura);
  const valorAplicadoFactura = legalizaciones.reduce((total, row) => total + row.valorAplicado, 0);
  const totalPendienteDisponible = anticipos.reduce(
    (total, anticipo) => total + anticipo.disponibleParaFactura,
    0
  );

  return {
    factura,
    tarea,
    legalizaciones,
    legalizacionesDetalle,
    anticipos,
    notasCreditoPeajes,
    totales: {
      valorFactura: valorLegalizable,
      valorBrutoFactura: factura.total,
      valorNotasCredito: notasCreditoPeajes.reduce((total, nota) => total + nota.total, 0),
      valorAplicadoFactura,
      pendienteDisponible: totalPendienteDisponible,
      diferenciaNoCubierta: Math.max(valorLegalizable - valorAplicadoFactura, 0),
      valorSolicitado: anticipos.reduce(
        (total, anticipo) => total + getValorContableAnticipo(anticipo),
        0
      ),
      valorLegalizado: anticipos.reduce((total, anticipo) => total + anticipo.valorLegalizado, 0),
    },
  };
}

async function cambiarDuenoAnticipoInterno(
  ctx: MutationCtx,
  args: {
    facturaId: Id<"facturacionFacturas">;
    asignacionId: Id<"facturacionAsignaciones">;
    liderAsignacionId?: Id<"facturacionAsignaciones">;
    liderDirectorio?: {
      liderUserId: string;
      liderNombre: string;
      liderEmail: string;
      procesoId?: number;
      procesoNombre?: string;
    };
    actorUserId: string;
    actorNombre: string;
    actorEmail: string;
    comentario?: string;
    confirmarReversionCruces: boolean;
    expectedLegalizacionIds: Id<"facturacionAnticipoLegalizaciones">[];
  }
) {
  const acceso = await resolverAccesoAnticipoEditable(ctx, {
    facturaId: args.facturaId,
    asignacionId: args.asignacionId,
    actorUserId: args.actorUserId,
    actorEmail: args.actorEmail,
    permisoRequerido: "cambiar_responsable",
    requirePermiso: true,
  });

  const { factura, tarea } = acceso;
  if (factura.esLegalizacionCajaMenor) {
    throw new Error("Desmarca Caja Menor antes de gestionar el dueño del anticipo.");
  }

  if (Boolean(args.liderAsignacionId) === Boolean(args.liderDirectorio)) {
    throw new Error("Selecciona exactamente un líder para la bolsa del anticipo.");
  }

  let candidato: {
    liderAsignacionId?: Id<"facturacionAsignaciones">;
    liderUserId?: string;
    liderNombre: string;
    liderEmail: string;
    procesoId?: number;
    procesoNombre?: string;
  };

  if (args.liderAsignacionId) {
    const asignaciones = await ctx.db
      .query("facturacionAsignaciones")
      .withIndex("by_facturaId", (q) => q.eq("facturaId", args.facturaId))
      .collect();
    const { candidatos } = buildAnticipoOwnerCandidates({ asignaciones, factura });
    const candidatoHistorico = candidatos.find(
      (row) => String(row.liderAsignacionId) === String(args.liderAsignacionId)
    );
    if (!candidatoHistorico) {
      throw new Error("El líder histórico seleccionado no es válido para esta factura.");
    }

    const liderAsignacion = await ctx.db.get("facturacionAsignaciones", args.liderAsignacionId);
    if (
      !liderAsignacion ||
      liderAsignacion.facturaId !== args.facturaId ||
      liderAsignacion.fase !== "revision_lider" ||
      liderAsignacion.estado === "cancelada"
    ) {
      throw new Error("La asignación histórica del líder no es válida.");
    }
    candidato = candidatoHistorico;
  } else {
    const liderDirectorio = args.liderDirectorio;
    if (
      !liderDirectorio?.liderUserId.trim() ||
      !liderDirectorio.liderNombre.trim() ||
      !liderDirectorio.liderEmail.trim() ||
      !hasAnticipoProcesoSnapshot(liderDirectorio)
    ) {
      throw new Error("El líder activo seleccionado no tiene datos de proceso válidos.");
    }
    candidato = {
      liderUserId: liderDirectorio.liderUserId.trim(),
      liderNombre: liderDirectorio.liderNombre.trim(),
      liderEmail: normalizeEmail(liderDirectorio.liderEmail),
      procesoId: liderDirectorio.procesoId,
      procesoNombre: sanitizeProcesoNombre(liderDirectorio.procesoNombre),
    };
  }

  const now = Date.now();
  const bolsaNuevaId = await ensureBolsaAnticipo(
    ctx,
    {
      empresa: factura.empresa,
      tipoBolsa: isFacturaPeajes(factura) ? "peajes" : "general",
      procesoId: candidato.procesoId,
      procesoNombre: candidato.procesoNombre,
    },
    now
  );
  const bolsaAnteriorId = factura.anticipoBolsaId;
  const legalizacionesActivas = await listarLegalizacionesActivasFactura(ctx, args.facturaId);
  const valorCrucesActivos = legalizacionesActivas.reduce(
    (total, row) => total + row.valorAplicado,
    0
  );
  const cambiaBolsa = Boolean(
    factura.esLegalizacionAnticipo &&
      !sameAnticipoProcesoSnapshot(
        {
          procesoId: factura.anticipoProcesoId,
          procesoNombre: factura.anticipoProcesoNombre,
        },
        candidato
      )
  );

  if (cambiaBolsa && legalizacionesActivas.length > 0 && !args.confirmarReversionCruces) {
    throw new ConvexError({
      code: "CONFIRMAR_REVERSION_CRUCES",
      cantidad: legalizacionesActivas.length,
      valor: valorCrucesActivos,
      bolsaAnteriorId,
      bolsaNuevaId,
    });
  }

  if (cambiaBolsa && legalizacionesActivas.length > 0) {
    const expected = new Set(args.expectedLegalizacionIds.map(String));
    const actual = new Set(legalizacionesActivas.map((row) => String(row._id)));
    if (expected.size !== actual.size || [...expected].some((id) => !actual.has(id))) {
      throw new Error(
        "Los cruces activos cambiaron. Recarga el contexto antes de confirmar la reversión."
      );
    }
    await revertirLegalizacionesFactura(ctx, args.facturaId, args.actorUserId, now);
  }

  const duenoAnterior: AnticipoOwnerSnapshot | undefined = factura.esLegalizacionAnticipo
    ? {
        liderUserId: factura.anticipoLiderUserId,
        liderNombre: factura.anticipoLiderNombre ?? factura.anticipoLiderUserId ?? "Sin líder",
        liderEmail: normalizeEmail(factura.anticipoLiderEmail ?? fallbackContactEmail()),
        procesoId: factura.anticipoProcesoId,
        procesoNombre: sanitizeProcesoNombre(factura.anticipoProcesoNombre),
        bolsaId: factura.anticipoBolsaId,
        elegible: true,
      }
    : undefined;

  const duenoNuevo: AnticipoOwnerSnapshot = {
    source: args.liderAsignacionId ? "historial" : "directorio_empresa",
    liderUserId: candidato.liderUserId,
    liderNombre: candidato.liderNombre,
    liderEmail: normalizeEmail(candidato.liderEmail),
    procesoId: candidato.procesoId,
    procesoNombre: sanitizeProcesoNombre(candidato.procesoNombre),
    bolsaId: bolsaNuevaId,
    liderAsignacionId: candidato.liderAsignacionId,
    elegible: true,
  };

  await ctx.db.patch("facturacionFacturas", factura._id, {
    esLegalizacionAnticipo: true,
    esLegalizacionCajaMenor: false,
    cajaMenorId: undefined,
    cajaMenorNombre: undefined,
    cajaMenorMarcadorUserId: undefined,
    cajaMenorMarcadorNombre: undefined,
    cajaMenorMarcadorEmail: undefined,
    anticipoLiderUserId: duenoNuevo.liderUserId,
    anticipoLiderNombre: duenoNuevo.liderNombre,
    anticipoLiderEmail: duenoNuevo.liderEmail,
    anticipoProcesoId: duenoNuevo.procesoId,
    anticipoProcesoNombre: duenoNuevo.procesoNombre,
    anticipoBolsaId: bolsaNuevaId,
    actualizadoEn: now,
  });

  if (!cambiaBolsa && legalizacionesActivas.length > 0) {
    for (const row of legalizacionesActivas) {
      await ctx.db.patch("facturacionAnticipoLegalizaciones", row._id, {
        liderUserId: duenoNuevo.liderUserId,
        liderNombre: duenoNuevo.liderNombre,
        liderEmail: duenoNuevo.liderEmail,
        procesoId: duenoNuevo.procesoId,
        procesoNombre: duenoNuevo.procesoNombre,
        bolsaId: bolsaNuevaId,
        actualizadoEn: now,
      });
    }
  }

  const facturaActualizada = {
    ...factura,
    esLegalizacionAnticipo: true,
    anticipoLiderUserId: duenoNuevo.liderUserId,
    anticipoLiderNombre: duenoNuevo.liderNombre,
    anticipoLiderEmail: duenoNuevo.liderEmail,
    anticipoProcesoId: duenoNuevo.procesoId,
    anticipoProcesoNombre: duenoNuevo.procesoNombre,
    anticipoBolsaId: bolsaNuevaId,
  };

  await validarYRecalcularValorAPagarTrasCambioObligacion(ctx, facturaActualizada, now);
  await refrescarProyeccionFactura(ctx, args.facturaId, now);

  const comentarioUsuario = args.comentario?.trim();
  const comentarioAuditoria =
    comentarioUsuario ||
    buildAnticipoDuenoCambioComentario({
      anterior: duenoAnterior ?? null,
      nuevo: duenoNuevo,
      ...(cambiaBolsa && legalizacionesActivas.length > 0
        ? {
            crucesRevertidos: {
              cantidad: legalizacionesActivas.length,
              valor: valorCrucesActivos,
            },
          }
        : {}),
    });

  await registrarAprobacion(ctx, {
    tareaId: tarea._id,
    facturaId: args.facturaId,
    asignacionId: args.asignacionId,
    empresa: tarea.empresa,
    actorUserId: args.actorUserId,
    actorNombre: args.actorNombre,
    actorEmail: args.actorEmail,
    accion: "cambiar_dueno_anticipo",
    comentario: comentarioAuditoria,
    estadoAnterior: tarea.estado,
    estadoNuevo: tarea.estado,
    anticipoDuenoCambio: {
      ...(duenoAnterior ? { anterior: duenoAnterior } : {}),
      nuevo: duenoNuevo,
      ...(cambiaBolsa && legalizacionesActivas.length > 0
        ? {
            crucesRevertidos: {
              cantidad: legalizacionesActivas.length,
              valor: valorCrucesActivos,
              legalizacionIds: legalizacionesActivas.map((row) => row._id),
            },
          }
        : {}),
    },
  });

  return {
    bolsaId: bolsaNuevaId,
    crucesRevertidos: cambiaBolsa ? legalizacionesActivas.length : 0,
  };
}

export const obtenerContextoAnticipoDesdeServidor = query({
  args: {
    secret: v.string(),
    facturaId: v.id("facturacionFacturas"),
    asignacionId: v.optional(v.id("facturacionAsignaciones")),
    actorUserId: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    liderAsignacionId: v.optional(v.id("facturacionAsignaciones")),
    liderDirectorioPreview: v.optional(anticipoOwnerDirectoryValidator),
  },
  returns: v.object({
    empresa: v.number(),
    contexto: anticipoManagementContextValidator,
  }),
  handler: async (ctx, args) => {
    requireServerSecret(args.secret);
    const factura = await ctx.db.get("facturacionFacturas", args.facturaId);
    if (!factura) throw new Error("Factura no encontrada.");
    const contexto = await construirContextoAnticipoManagement(ctx, args);
    return {
      empresa: normalizeEmpresa(factura.empresa),
      contexto,
    };
  },
});

export const cambiarDuenoAnticipoDesdeServidor = mutation({
  args: {
    secret: v.string(),
    facturaId: v.id("facturacionFacturas"),
    asignacionId: v.id("facturacionAsignaciones"),
    liderAsignacionId: v.optional(v.id("facturacionAsignaciones")),
    liderDirectorio: v.optional(anticipoOwnerDirectoryValidator),
    actorUserId: v.string(),
    actorNombre: v.string(),
    actorEmail: v.string(),
    comentario: v.optional(v.string()),
    confirmarReversionCruces: v.boolean(),
    expectedLegalizacionIds: v.array(v.id("facturacionAnticipoLegalizaciones")),
  },
  returns: v.object({
    bolsaId: v.id("bolsasAnticipos"),
    crucesRevertidos: v.number(),
  }),
  handler: async (ctx, args) => {
    requireServerSecret(args.secret);
    return await cambiarDuenoAnticipoInterno(ctx, args);
  },
});

async function prepararFacturaAnticipoParaCruceLider(
  ctx: MutationCtx,
  args: {
    factura: Doc<"facturacionFacturas">;
    tarea: Doc<"facturacionTareas">;
    asignacion: Doc<"facturacionAsignaciones">;
    asignacionId: Id<"facturacionAsignaciones">;
    bolsaAutoritativaId: Id<"bolsasAnticipos">;
    liderSnapshot: AnticipoOwnerSnapshot;
    legalizacionesActivas: Doc<"facturacionAnticipoLegalizaciones">[];
    actorUserId: string;
    actorNombre: string;
    actorEmail: string;
  }
): Promise<Doc<"facturacionFacturas">> {
  if (args.legalizacionesActivas.length > 0) {
    return args.factura;
  }

  const now = Date.now();
  const bolsaGuardada = {
    bolsaId: args.factura.anticipoBolsaId,
    procesoId: args.factura.anticipoProcesoId,
    procesoNombre: args.factura.anticipoProcesoNombre,
  };
  const bolsaLider = {
    bolsaId: args.bolsaAutoritativaId,
    procesoId: args.liderSnapshot.procesoId,
    procesoNombre: args.liderSnapshot.procesoNombre,
  };
  const mismaBolsa = sameAnticipoBolsaSnapshot(bolsaGuardada, bolsaLider);
  const necesitaMarcar = !args.factura.esLegalizacionAnticipo;
  const cambiaResponsable =
    args.factura.esLegalizacionAnticipo && !mismaBolsa;

  if (!necesitaMarcar && !cambiaResponsable) {
    if (!args.factura.anticipoBolsaId) {
      await ctx.db.patch("facturacionFacturas", args.factura._id, {
        anticipoBolsaId: args.bolsaAutoritativaId,
        actualizadoEn: now,
      });
      return { ...args.factura, anticipoBolsaId: args.bolsaAutoritativaId };
    }
    return args.factura;
  }

  const duenoAnterior: AnticipoOwnerSnapshot | undefined = args.factura.esLegalizacionAnticipo
    ? {
        liderUserId: args.factura.anticipoLiderUserId,
        liderNombre:
          args.factura.anticipoLiderNombre ?? args.factura.anticipoLiderUserId ?? "Sin líder",
        liderEmail: normalizeEmail(args.factura.anticipoLiderEmail ?? fallbackContactEmail()),
        procesoId: args.factura.anticipoProcesoId,
        procesoNombre: sanitizeProcesoNombre(args.factura.anticipoProcesoNombre),
        bolsaId: args.factura.anticipoBolsaId,
        elegible: true,
      }
    : undefined;

  const duenoNuevo: AnticipoOwnerSnapshot = {
    ...args.liderSnapshot,
    bolsaId: args.bolsaAutoritativaId,
    elegible: true,
  };

  await ctx.db.patch("facturacionFacturas", args.factura._id, {
    esLegalizacionAnticipo: true,
    esLegalizacionCajaMenor: false,
    cajaMenorId: undefined,
    cajaMenorNombre: undefined,
    cajaMenorMarcadorUserId: undefined,
    cajaMenorMarcadorNombre: undefined,
    cajaMenorMarcadorEmail: undefined,
    anticipoLiderUserId: duenoNuevo.liderUserId,
    anticipoLiderNombre: duenoNuevo.liderNombre,
    anticipoLiderEmail: duenoNuevo.liderEmail,
    anticipoProcesoId: duenoNuevo.procesoId,
    anticipoProcesoNombre: duenoNuevo.procesoNombre,
    anticipoBolsaId: args.bolsaAutoritativaId,
    actualizadoEn: now,
  });

  const facturaActualizada = {
    ...args.factura,
    esLegalizacionAnticipo: true,
    esLegalizacionCajaMenor: false,
    anticipoLiderUserId: duenoNuevo.liderUserId,
    anticipoLiderNombre: duenoNuevo.liderNombre,
    anticipoLiderEmail: duenoNuevo.liderEmail,
    anticipoProcesoId: duenoNuevo.procesoId,
    anticipoProcesoNombre: duenoNuevo.procesoNombre,
    anticipoBolsaId: args.bolsaAutoritativaId,
  };

  if (necesitaMarcar) {
    await revertirLegalizacionesCajaMenorFactura(ctx, args.factura._id, now);
    await anularMovimientosCajaMenorFacturaInterno(
      ctx,
      args.factura._id,
      {
        actorUserId: args.actorUserId,
        actorNombre: args.actorNombre,
        actorEmail: args.actorEmail,
      },
      "Movimiento de Caja Menor anulado por marcación de anticipo."
    );
    await registrarAprobacion(ctx, {
      tareaId: args.tarea._id,
      facturaId: args.factura._id,
      asignacionId: args.asignacionId,
      empresa: args.tarea.empresa,
      actorUserId: args.actorUserId,
      actorNombre: args.actorNombre,
      actorEmail: args.actorEmail,
      accion: "marcar_anticipo",
      comentario: "Marcada como legalización de anticipo al guardar el primer cruce.",
      estadoAnterior: args.tarea.estado,
      estadoNuevo: args.tarea.estado,
    });
  } else if (cambiaResponsable) {
    await registrarAprobacion(ctx, {
      tareaId: args.tarea._id,
      facturaId: args.factura._id,
      asignacionId: args.asignacionId,
      empresa: args.tarea.empresa,
      actorUserId: args.actorUserId,
      actorNombre: args.actorNombre,
      actorEmail: args.actorEmail,
      accion: "cambiar_dueno_anticipo",
      comentario: buildAnticipoDuenoCambioComentario({
        anterior: duenoAnterior ?? null,
        nuevo: duenoNuevo,
      }),
      estadoAnterior: args.tarea.estado,
      estadoNuevo: args.tarea.estado,
      anticipoDuenoCambio: {
        ...(duenoAnterior ? { anterior: duenoAnterior } : {}),
        nuevo: duenoNuevo,
      },
    });
  }

  await validarYRecalcularValorAPagarTrasCambioObligacion(ctx, facturaActualizada, now);
  await refrescarProyeccionFactura(ctx, args.factura._id, now);
  return facturaActualizada;
}

export const guardarCruceAnticipoDesdeServidor = mutation({
  args: {
    secret: v.string(),
    facturaId: v.id("facturacionFacturas"),
    asignacionId: v.id("facturacionAsignaciones"),
    anticipoIds: v.array(v.id("anticipos")),
    expectedBolsaId: v.id("bolsasAnticipos"),
    ownerSelection: v.optional(
      v.union(
        v.object({
          source: v.literal("historial"),
          liderAsignacionId: v.id("facturacionAsignaciones"),
        }),
        v.object({
          source: v.literal("directorio_empresa"),
          liderUserId: v.string(),
        })
      )
    ),
    liderDirectorio: v.optional(anticipoOwnerDirectoryValidator),
    actorUserId: v.string(),
    actorNombre: v.string(),
    actorEmail: v.string(),
    comentario: v.optional(v.string()),
  },
  returns: v.object({
    valorAplicadoFactura: v.number(),
    diferenciaNoCubierta: v.number(),
  }),
  handler: async (ctx, args) => {
    requireServerSecret(args.secret);
    const acceso = await resolverAccesoAnticipoEditable(ctx, {
      facturaId: args.facturaId,
      asignacionId: args.asignacionId,
      actorUserId: args.actorUserId,
      actorEmail: args.actorEmail,
      permisoRequerido: "cruce",
      requirePermiso: true,
    });

    if (!acceso.asignacion) {
      throw new Error("No hay una asignación activa para esta factura.");
    }

    let factura = await ctx.db.get("facturacionFacturas", args.facturaId);
    if (!factura) throw new Error("Factura no encontrada.");

    const tarea = acceso.tarea;
    const now = Date.now();
    let bolsaAutoritativaId = args.expectedBolsaId;

    if (args.ownerSelection) {
      if (args.ownerSelection.source === "historial") {
        await cambiarDuenoAnticipoInterno(ctx, {
          facturaId: args.facturaId,
          asignacionId: args.asignacionId,
          liderAsignacionId: args.ownerSelection.liderAsignacionId,
          actorUserId: args.actorUserId,
          actorNombre: args.actorNombre,
          actorEmail: args.actorEmail,
          comentario: args.comentario ?? "Marcación inicial de anticipo.",
          confirmarReversionCruces: false,
          expectedLegalizacionIds: [],
        });
      } else {
        if (!args.liderDirectorio) {
          throw new Error("No se pudo verificar el líder activo seleccionado.");
        }
        await cambiarDuenoAnticipoInterno(ctx, {
          facturaId: args.facturaId,
          asignacionId: args.asignacionId,
          liderDirectorio: args.liderDirectorio,
          actorUserId: args.actorUserId,
          actorNombre: args.actorNombre,
          actorEmail: args.actorEmail,
          comentario: args.comentario ?? "Marcación inicial de anticipo.",
          confirmarReversionCruces: false,
          expectedLegalizacionIds: [],
        });
      }
      factura = await ctx.db.get("facturacionFacturas", args.facturaId);
      if (!factura) throw new Error("Factura no encontrada.");
      if (!factura.esLegalizacionAnticipo) {
        throw new Error("La factura no está marcada como legalización de anticipo.");
      }
      if (factura.anticipoBolsaId && factura.anticipoBolsaId !== args.expectedBolsaId) {
        throw new Error("La bolsa del anticipo cambió. Recarga el contexto e intenta de nuevo.");
      }
      bolsaAutoritativaId = factura.anticipoBolsaId ?? args.expectedBolsaId;
    } else if (acceso.fase === "revision_lider") {
      const liderSnapshot = buildLiderAsignadoSnapshot(acceso.asignacion);
      if (!liderSnapshot || !hasAnticipoProcesoSnapshot(liderSnapshot)) {
        throw new Error(
          "El líder asignado no tiene proceso configurado. Reasigna la factura a una persona con bolsa válida."
        );
      }

      bolsaAutoritativaId = await ensureBolsaAnticipo(
        ctx,
        {
          empresa: factura.empresa,
          tipoBolsa: isFacturaPeajes(factura) ? "peajes" : "general",
          procesoId: liderSnapshot.procesoId,
          procesoNombre: liderSnapshot.procesoNombre,
        },
        now
      );

      if (args.expectedBolsaId !== bolsaAutoritativaId) {
        throw new Error("La bolsa del anticipo cambió. Recarga el contexto e intenta de nuevo.");
      }

      const bolsaGuardada = {
        bolsaId: factura.anticipoBolsaId,
        procesoId: factura.anticipoProcesoId,
        procesoNombre: factura.anticipoProcesoNombre,
      };
      const bolsaLider = {
        bolsaId: bolsaAutoritativaId,
        procesoId: liderSnapshot.procesoId,
        procesoNombre: liderSnapshot.procesoNombre,
      };

      const legalizacionesActivas = await listarLegalizacionesActivasFactura(ctx, args.facturaId);
      if (
        legalizacionesActivas.length > 0 &&
        !sameAnticipoBolsaSnapshot(bolsaGuardada, bolsaLider)
      ) {
        throw new Error(
          "Esta factura tiene cruces activos de otra bolsa. Desmárcala para revertirlos antes de cruzar con tu bolsa."
        );
      }

      factura = await prepararFacturaAnticipoParaCruceLider(ctx, {
        factura,
        tarea,
        asignacion: acceso.asignacion,
        asignacionId: args.asignacionId,
        bolsaAutoritativaId,
        liderSnapshot,
        legalizacionesActivas,
        actorUserId: args.actorUserId,
        actorNombre: args.actorNombre,
        actorEmail: args.actorEmail,
      });
    } else {
      if (!factura.esLegalizacionAnticipo) {
        throw new Error("La factura no está marcada como legalización de anticipo.");
      }
      if (factura.anticipoBolsaId && factura.anticipoBolsaId !== args.expectedBolsaId) {
        throw new Error("La bolsa del anticipo cambió. Recarga el contexto e intenta de nuevo.");
      }
    }

    const result = await guardarLegalizacionAnticiposFacturaHandler(ctx, {
      facturaId: args.facturaId,
      asignacionId: args.asignacionId,
      anticipoIds: args.anticipoIds,
      expectedBolsaId: bolsaAutoritativaId,
      actorUserId: args.actorUserId,
      actorNombre: args.actorNombre,
      actorEmail: args.actorEmail,
      comentario: args.comentario ?? "Legalización de anticipos.",
    });
    return {
      valorAplicadoFactura: result.valorAplicadoFactura,
      diferenciaNoCubierta: result.diferenciaNoCubierta,
    };
  },
});

async function guardarLegalizacionAnticiposFacturaHandler(
  ctx: MutationCtx,
  args: {
    facturaId: Id<"facturacionFacturas">;
    asignacionId?: Id<"facturacionAsignaciones">;
    anticipoIds: Id<"anticipos">[];
    expectedBolsaId?: Id<"bolsasAnticipos">;
    actorUserId?: string;
    actorNombre: string;
    actorEmail: string;
    comentario: string;
  }
) {
  const factura = await ctx.db.get("facturacionFacturas", args.facturaId);
  if (!factura) throw new Error("Factura no encontrada.");
  if (isFacturaPeajes(factura)) {
    throw new Error(
      "Las facturas PEAJES se legalizan desde /facturacion/peajes con cruce por orden."
    );
  }
  if (!factura.esLegalizacionAnticipo) {
    throw new Error("La factura no está marcada como legalización de anticipo.");
  }
  if (!facturaTieneReferenciaBolsaAnticipo(factura)) {
    throw new Error("La factura no tiene proceso de bolsa de anticipo.");
  }
  const now = Date.now();
  const bolsaIdParaLegalizacion =
    factura.anticipoBolsaId ??
    (await ensureBolsaAnticipo(
      ctx,
      {
        empresa: factura.empresa,
        tipoBolsa: isFacturaPeajes(factura) ? "peajes" : "general",
        procesoId: factura.anticipoProcesoId,
        procesoNombre: factura.anticipoProcesoNombre,
      },
      now
    ));
  const facturaParaBolsa = {
    ...factura,
    anticipoBolsaId: bolsaIdParaLegalizacion,
  };
  const tarea = await ctx.db
    .query("facturacionTareas")
    .withIndex("by_facturaId", (q) => q.eq("facturaId", args.facturaId))
    .unique();
  if (!tarea) throw new Error("Tarea de facturación no encontrada.");

  const asignacion = args.asignacionId ? await ctx.db.get("facturacionAsignaciones", args.asignacionId) : null;
  const asignacionCoincide =
    asignacion &&
    asignacion.facturaId === args.facturaId &&
    asignacion.tareaId === tarea._id &&
    asignacion.estado === "pendiente";
  const puedeEditarDesdeCausacion =
    tarea.estado === "causacion" &&
    (!asignacion || (asignacionCoincide && asignacion.fase === "causacion"));
  const puedeEditarDesdeLider =
    tarea.estado === "revision_lider" &&
    Boolean(asignacionCoincide) &&
    asignacion?.fase === "revision_lider";
  const puedeEditarDesdeContabilidad =
    tarea.estado === "revision_impuestos" &&
    Boolean(asignacionCoincide) &&
    asignacion?.fase === "revision_impuestos";
  const puedeEditarDesdeEventosDian =
    tarea.estado === "eventos_dian" &&
    Boolean(asignacionCoincide) &&
    asignacion?.fase === "eventos_dian";
  if (
    !puedeEditarDesdeCausacion &&
    !puedeEditarDesdeLider &&
    !puedeEditarDesdeContabilidad &&
    !puedeEditarDesdeEventosDian
  ) {
    throw new Error(
      "El cruce de anticipos sólo se puede editar en una asignación activa de líder, causación, contabilidad o eventos DIAN."
    );
  }

  if (args.expectedBolsaId && args.expectedBolsaId !== bolsaIdParaLegalizacion) {
    throw new Error("La bolsa del anticipo cambió. Recarga el contexto e intenta de nuevo.");
  }

  const legalizacionesActuales = await listarLegalizacionesActivasFactura(ctx, args.facturaId);
  const anticipoIdsActuales = new Set(
    legalizacionesActuales.map((legalizacion) => String(legalizacion.anticipoId))
  );
  const bolsaIdPorAnticipoId = new Map<string, Id<"bolsasAnticipos"> | undefined>();
  const uniqueAnticipoIds: Id<"anticipos">[] = [];
  const seenSelected = new Set<string>();
  for (const anticipoId of args.anticipoIds) {
    if (seenSelected.has(String(anticipoId))) continue;
    seenSelected.add(String(anticipoId));

    const anticipo = await ctx.db.get("anticipos", anticipoId);
    if (!anticipo) throw new Error("Uno de los anticipos seleccionados no existe.");
    if (
      normalizeEmpresa(anticipo.empresa_id ?? anticipo.empresa) !==
      normalizeEmpresa(factura.empresa)
    ) {
      throw new Error("El anticipo pertenece a otra empresa.");
    }
    const anticipoBolsaId = await resolveBolsaIdForAnticipo(ctx, anticipo);
    bolsaIdPorAnticipoId.set(String(anticipoId), anticipoBolsaId);
    if (!anticipoBolsaId || anticipoBolsaId !== bolsaIdParaLegalizacion) {
      throw new Error("Sólo puedes cruzar anticipos de la bolsa del proceso de la factura.");
    }
    if (
      !anticipoPerteneceABolsaFactura({ ...anticipo, bolsaId: anticipoBolsaId }, facturaParaBolsa)
    ) {
      throw new Error("Sólo puedes cruzar anticipos de la bolsa del proceso de la factura.");
    }
    const esCruceActual = anticipoIdsActuales.has(String(anticipoId));
    if (!esCruceActual && !isAnticipoPendienteLegalizacion(anticipo)) {
      throw new Error("Sólo puedes cruzar anticipos pendientes de legalización.");
    }

    uniqueAnticipoIds.push(anticipoId);
  }

  const actorUserId = args.actorUserId ?? "sin-usuario";
  await revertirLegalizacionesFactura(ctx, args.facturaId, actorUserId, now);

  const valorLegalizable = await obtenerValorLegalizableFactura(ctx, factura);
  const notasCreditoPeajes = await obtenerNotasCreditoPeajesFactura(ctx, factura);
  let restante = Math.max(0, valorLegalizable);
  let valorAplicadoFactura = 0;
  const legalizacionesCreadas: Id<"facturacionAnticipoLegalizaciones">[] = [];

  for (const anticipoId of uniqueAnticipoIds) {
    if (restante <= 0) break;

    const anticipo = await ctx.db.get("anticipos", anticipoId);
    if (!anticipo) throw new Error("Uno de los anticipos seleccionados no existe.");

    const saldoAntes = getSaldoLegalizadoAnticipo(anticipo);
    const disponible = Math.max(0, getValorContableAnticipo(anticipo) - saldoAntes);
    const valorAplicado = Math.min(restante, disponible);
    if (valorAplicado <= 0) continue;

    const saldoDespues = saldoAntes + valorAplicado;
    const legalizacion = [
      ...limpiarLegalizacionesFacturaEnAnticipo(anticipo, args.facturaId),
      {
        legalizadoPorUserId: actorUserId,
        fechaLegalizacion: now,
        facturaId: args.facturaId,
        valorLegalizado: valorAplicado,
        observaciones: args.comentario,
      },
    ];

    await aplicarSaldoAnticipo(
      ctx,
      anticipo,
      saldoDespues,
      actorUserId,
      now,
      legalizacion,
      args.comentario
    );
    const bolsaIdResuelta = bolsaIdPorAnticipoId.get(String(anticipoId));
    if (!anticipo.bolsaId && bolsaIdResuelta) {
      await ctx.db.patch("anticipos", anticipo._id, {
        bolsaId: bolsaIdResuelta,
        updatedAt: now,
      });
    }

    legalizacionesCreadas.push(
      await ctx.db.insert("facturacionAnticipoLegalizaciones", {
        facturaId: args.facturaId,
        anticipoId,
        bolsaId: bolsaIdParaLegalizacion,
        tareaId: tarea._id,
        ...(args.asignacionId ? { asignacionId: args.asignacionId } : {}),
        empresa: normalizeEmpresa(factura.empresa),
        liderUserId: factura.anticipoLiderUserId,
        liderNombre:
          factura.anticipoLiderNombre ??
          factura.anticipoLiderUserId ??
          factura.anticipoProcesoNombre ??
          "Bolsa por proceso",
        liderEmail: normalizeEmail(factura.anticipoLiderEmail ?? fallbackContactEmail()),
        procesoId: factura.anticipoProcesoId,
        procesoNombre: sanitizeProcesoNombre(factura.anticipoProcesoNombre),
        valorAplicado,
        valorContableFactura: getValorContable(factura),
        valorContableAnticipo: getValorContableAnticipo(anticipo),
        ...(isFacturaPeajes(factura)
          ? {
              tipoBolsa: "peajes" as const,
              valorNetoFactura: valorLegalizable,
              notaCreditoIds: notasCreditoPeajes.map((nota) => nota._id),
            }
          : {}),
        saldoAntes,
        saldoDespues,
        estado: "activa",
        actorUserId: args.actorUserId ?? "sin-usuario",
        actorNombre: args.actorNombre,
        actorEmail: normalizeEmail(args.actorEmail),
        comentario: args.comentario,
        creadoEn: now,
        actualizadoEn: now,
      })
    );

    restante = Math.max(0, restante - valorAplicado);
    valorAplicadoFactura += valorAplicado;
  }

  if (valorAplicadoFactura <= 0) {
    throw new Error("Selecciona al menos un anticipo con saldo disponible para cruzar.");
  }

  await registrarAprobacion(ctx, {
    tareaId: tarea._id,
    facturaId: args.facturaId,
    asignacionId: args.asignacionId,
    empresa: tarea.empresa,
    actorUserId: args.actorUserId,
    actorNombre: args.actorNombre,
    actorEmail: args.actorEmail,
    accion: "legalizar_anticipo",
    comentario: args.comentario || `Legalización de anticipos por ${valorAplicadoFactura}.`,
    estadoAnterior: tarea.estado,
    estadoNuevo: tarea.estado,
  });

  await ctx.db.patch("facturacionFacturas", args.facturaId, {
    anticipoBolsaId: bolsaIdParaLegalizacion,
    actualizadoEn: now,
  });
  await validarYRecalcularValorAPagarTrasCambioObligacion(
    ctx,
    { ...factura, anticipoBolsaId: bolsaIdParaLegalizacion },
    now
  );
  await refrescarProyeccionFactura(ctx, args.facturaId, now);
  await patchTareaEstado(ctx, tarea, tarea.estado, {}, now);

  return {
    legalizacionesCreadas,
    valorAplicadoFactura,
    diferenciaNoCubierta: Math.max(valorLegalizable - valorAplicadoFactura, 0),
  };
}
