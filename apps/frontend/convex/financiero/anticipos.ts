import { defineTable } from "convex/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { query, } from "../_generated/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { requireIdentity, requireServerSecret } from "../lib/auth";
import { requireActor as requireBillingActor, requireAdmin } from "../lib/billingAuth";
import { mutationConActorIds } from "../lib/serverActor";
import { getValorContableAnticipo } from "../lib/valorContable";
import { refreshAnticipoDashboardProjection } from "../lib/anticiposDashboardProjection";
import {
  getAnticipoRequesterRecipient,
  getAnticipoStakeholderRecipients,
  scheduleAnticipoNotification,
  scheduleAnticipoPhaseNotification,
} from "../lib/anticiposNotifications";
import {
  ensureBolsaAnticipo,
  normalizeEmpresaBolsa,
  resolveBolsaIdForAnticipo,
} from "../lib/bolsasAnticipos";
import {
  assertProveedorNitValido,
  assertProveedorRazonSocialValida,
} from "../lib/proveedorNit";

/**
 * Public mutations of this module: every "acting user" arg is overwritten with the
 * authenticated caller's Nest user id, so clients can no longer act as someone else.
 * Functions with a `secret` arg (server-to-server) are left untouched.
 */
const mutation = mutationConActorIds([
  "createdById",
  "jefeDirectoUserId",
  "contadorUserId",
  "gerenteUserId",
  "tesoreroUserId",
  "actorUserId",
  "rechazadoPorUserId",
  "anuladoPorUserId",
]);

const formaPagoArg = v.union(
  v.literal("TRANSFERENCIA BANCARIA"),
  v.literal("TRANSFERENCIA PAGO ELECTRÓNICO")
);

const tipoBolsaArg = v.union(v.literal("general"), v.literal("peajes"));

const estadoFaseArg = v.union(
  v.literal("PENDIENTE"),
  v.literal("EN_PROGRESO"),
  v.literal("COMPLETADO"),
  v.literal("DEVUELTO"),
  v.literal("RECHAZADO"),
  v.literal("ANULADO")
);

const faseAnticipoArg = v.union(
  v.literal("I_SOLICITUD"),
  v.literal("II_APROBACION_JEFE_DIRECTO"),
  v.literal("III_REVISION_CONTABILIDAD"),
  v.literal("IV_APROBACION_GERENCIA"),
  v.literal("IV_DESEMBOLSO_TESORERIA"),
  v.literal("V_PENDIENTE_LEGALIZACION"),
  v.literal("VI_LEGALIZADO"),
  v.literal("COMPLETADO"),
  v.literal("RECHAZADO"),
  v.literal("ANULADO")
);

const faseActualAnticipoArg = v.union(
  v.literal("I_SOLICITUD"),
  v.literal("II_APROBACION_JEFE_DIRECTO"),
  v.literal("III_REVISION_CONTABILIDAD"),
  v.literal("IV_APROBACION_GERENCIA"),
  v.literal("IV_DESEMBOLSO_TESORERIA"),
  v.literal("V_PENDIENTE_LEGALIZACION"),
  v.literal("VI_LEGALIZADO"),
  v.literal("COMPLETADO"),
  v.literal("RECHAZADO"),
  v.literal("ANULADO")
);

const rolAnticipoArg = v.union(
  v.literal("GERENCIA"),
  v.literal("TESORERO"),
  v.literal("CONTABILIDAD")
);

const decisionArg = v.union(v.literal("APROBADO"), v.literal("RECHAZADO"));
const responsableOrigenArg = v.union(
  v.literal("jefe_directo"),
  v.literal("manual"),
  v.literal("solicitante")
);
const proveedorOrigenArg = v.union(
  v.literal("siesa"),
  v.literal("manual_solicitud")
);
const adjuntoArg = v.object({
  storageId: v.id("_storage"),
  nombre: v.string(),
});

const usuarioConfigRolArg = v.object({
  userId: v.string(),
  nombre: v.string(),
  email: v.string(),
});

type FaseAnticipo =
  | "I_SOLICITUD"
  | "II_APROBACION_JEFE_DIRECTO"
  | "III_REVISION_CONTABILIDAD"
  | "IV_APROBACION_GERENCIA"
  | "IV_DESEMBOLSO_TESORERIA"
  | "V_PENDIENTE_LEGALIZACION"
  | "VI_LEGALIZADO";
type FaseActualAnticipo = FaseAnticipo | "COMPLETADO" | "RECHAZADO" | "ANULADO";
type EstadoFase =
  | "PENDIENTE"
  | "EN_PROGRESO"
  | "COMPLETADO"
  | "DEVUELTO"
  | "RECHAZADO"
  | "ANULADO";
type RolAnticipo =
  | "GERENCIA"
  | "TESORERO"
  | "CONTABILIDAD";

const FASES_ANTICIPO: FaseAnticipo[] = [
  "I_SOLICITUD",
  "II_APROBACION_JEFE_DIRECTO",
  "III_REVISION_CONTABILIDAD",
  "IV_APROBACION_GERENCIA",
  "IV_DESEMBOLSO_TESORERIA",
  "V_PENDIENTE_LEGALIZACION",
  "VI_LEGALIZADO",
];

function obtenerEmpresaId(anticipo: { empresa?: number; empresa_id?: number }) {
  return normalizeEmpresaBolsa(anticipo.empresa_id ?? anticipo.empresa);
}

export const bolsasAnticipos = defineTable({
  empresa: v.number(),
  tipoBolsa: tipoBolsaArg,
  procesoKey: v.string(),
  procesoId: v.optional(v.number()),
  procesoNombre: v.optional(v.string()),
  estado: v.union(v.literal("activa"), v.literal("inactiva")),
  creadoEn: v.number(),
  actualizadoEn: v.number(),
})
  .index("by_empresa", ["empresa"])
  .index("by_empresa_tipoBolsa", ["empresa", "tipoBolsa"])
  .index("by_empresa_tipoBolsa_procesoKey", [
    "empresa",
    "tipoBolsa",
    "procesoKey",
  ]);

export const anticipos = defineTable({
  empresa: v.optional(v.number()),
  empresa_id: v.optional(v.number()),
  consecutivo: v.number(),
  razonSocial: v.string(),
  nit: v.string(),
  proveedorOrigen: v.optional(proveedorOrigenArg),
  proveedorSiesaId: v.optional(v.string()),
  proveedorSiesaSucursalId: v.optional(v.string()),
  formaPago: formaPagoArg,
  numeroCuenta: v.optional(v.string()),
  banco: v.optional(v.string()),
  tipoBolsa: v.optional(tipoBolsaArg),
  bolsaId: v.optional(v.id("bolsasAnticipos")),
  valorNumerico: v.number(),
  valorContable: v.optional(v.number()),
  valorContableActualizadoEn: v.optional(v.number()),
  valorContableActualizadoPorUserId: v.optional(v.string()),
  valorLegalizableActual: v.optional(v.number()),
  valorLetra: v.string(),
  saldoLegalizado: v.optional(v.number()),
  maxLegalizacionDate: v.number(),
  soportesSolicitud: v.optional(v.array(adjuntoArg)),
  observaciones: v.optional(v.string()),
  createdById: v.string(),
  solicitanteNombre: v.optional(v.string()),
  solicitanteEmail: v.optional(v.string()),
  procesoId: v.optional(v.number()),
  procesoNombre: v.optional(v.string()),
  responsableUserId: v.optional(v.string()),
  responsableNombre: v.optional(v.string()),
  responsableEmail: v.optional(v.string()),
  responsableOrigen: v.optional(responsableOrigenArg),
  cubreFacturaCompleta: v.optional(v.boolean()),
  faseActual: faseActualAnticipoArg,
  rechazo: v.optional(
    v.object({
      motivo: v.string(),
      rechazadoPorUserId: v.string(),
      fechaRechazo: v.number(),
    })
  ),
  anulacion: v.optional(
    v.object({
      motivo: v.string(),
      anuladoPorUserId: v.string(),
      fechaAnulacion: v.number(),
    })
  ),
  desembolso: v.optional(
    v.object({
      realizadoPorUserId: v.string(),
      fechaDesembolso: v.number(),
      soporte: v.optional(adjuntoArg),
      observaciones: v.optional(v.string()),
    })
  ),
  legalizacion: v.array(
    v.object({
      legalizadoPorUserId: v.string(),
      fechaLegalizacion: v.number(),
      facturaId: v.id("facturacionFacturas"),
      valorLegalizado: v.number(),
      observaciones: v.optional(v.string()),
    })
  ),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_empresa", ["empresa"])
  .index("by_empresa_id", ["empresa_id"])
  .index("by_consecutivo", ["consecutivo"])
  .index("by_createdById", ["createdById"])
  .index("by_empresa_id_procesoId", ["empresa_id", "procesoId"])
  .index("by_empresa_id_tipoBolsa", ["empresa_id", "tipoBolsa"])
  .index("by_bolsaId", ["bolsaId"])
  .index("by_bolsaId_faseActual", ["bolsaId", "faseActual"])
  .index("by_responsableUserId", ["responsableUserId"])
  .index("by_faseActual", ["faseActual"]);

export const anticiposFases = defineTable({
  anticipoId: v.id("anticipos"),
  fase: faseAnticipoArg,
  estado: estadoFaseArg,
  asignadoA: v.optional(v.string()),
  fechaInicio: v.optional(v.number()),
  fechaCompletado: v.optional(v.number()),
  completadoPor: v.optional(v.string()),
  observaciones: v.optional(v.string()),
  adjuntos: v.optional(v.array(adjuntoArg)),
  payload: v.optional(v.any()),
})
  .index("by_anticipoId", ["anticipoId"])
  .index("by_anticipoId_fase", ["anticipoId", "fase"])
  .index("by_asignadoA_estado", ["asignadoA", "estado"])
  .index("by_fase_estado", ["fase", "estado"]);

export const anticiposRolesConfig = defineTable({
  empresa: v.optional(v.number()),
  rol: rolAnticipoArg,
  userId: v.optional(v.string()),
  nombre: v.optional(v.string()),
  email: v.optional(v.string()),
  usuarios: v.optional(v.array(usuarioConfigRolArg)),
})
  .index("by_rol", ["rol"])
  .index("by_empresa", ["empresa"])
  .index("by_empresa_rol", ["empresa", "rol"]);

const tipoAjusteAnticipoArg = v.union(
  v.literal("CORRECCION_DESEMBOLSO"),
  v.literal("REINTEGRO"),
  v.literal("CUADRE_OTROS_SISTEMAS"),
  v.literal("REVERSO")
);

export const anticiposAjustes = defineTable({
  anticipoId: v.id("anticipos"),
  empresa: v.number(),
  operacionId: v.string(),
  tipo: tipoAjusteAnticipoArg,
  ajusteOrigenId: v.optional(v.id("anticiposAjustes")),
  valorAnterior: v.number(),
  valorObjetivo: v.number(),
  valorAjuste: v.number(),
  saldoLegalizadoAlAplicar: v.number(),
  faseAnterior: faseActualAnticipoArg,
  fasePosterior: faseActualAnticipoArg,
  motivo: v.string(),
  soporte: v.optional(adjuntoArg),
  actorUserId: v.string(),
  actorNombre: v.string(),
  actorEmail: v.string(),
  actorRol: v.union(v.literal("GERENCIA"), v.literal("TESORERO")),
  aplicadoEn: v.number(),
  reversadoEn: v.optional(v.number()),
  reversadoPorAjusteId: v.optional(v.id("anticiposAjustes")),
})
  .index("by_anticipoId", ["anticipoId"])
  .index("by_anticipoId_aplicadoEn", ["anticipoId", "aplicadoEn"])
  .index("by_operacionId", ["operacionId"])
  .index("by_ajusteOrigenId", ["ajusteOrigenId"]);

export const anticiposDesembolsoAdjuntos = defineTable({
  anticipoId: v.id("anticipos"),
  faseId: v.id("anticiposFases"),
  storageId: v.id("_storage"),
  nombre: v.string(),
  tamanio: v.number(),
  subidoPorUserId: v.string(),
  subidoEn: v.number(),
})
  .index("by_anticipoId", ["anticipoId"])
  .index("by_faseId", ["faseId"])
  .index("by_anticipoId_storageId", ["anticipoId", "storageId"]);

async function obtenerSiguienteConsecutivo(ctx: QueryCtx | MutationCtx) {
  const ultimo = await ctx.db
    .query("anticipos")
    .withIndex("by_consecutivo")
    .order("desc")
    .first();

  return (ultimo?.consecutivo ?? 0) + 1;
}

async function obtenerRolConfig(
  ctx: QueryCtx | MutationCtx,
  empresa: number | undefined,
  rol: RolAnticipo
) {
  if (empresa !== undefined) {
    const configEmpresa = await ctx.db
      .query("anticiposRolesConfig")
      .withIndex("by_empresa_rol", (q) =>
        q.eq("empresa", empresa).eq("rol", rol)
      )
      .first();
    if (configEmpresa) return configEmpresa;
  }

  const configsGlobales = await ctx.db
    .query("anticiposRolesConfig")
    .withIndex("by_rol", (q) => q.eq("rol", rol))
    .collect();

  return configsGlobales.find((config) => config.empresa === undefined) ?? null;
}

async function obtenerAsignadoPorRol(
  ctx: QueryCtx | MutationCtx,
  empresa: number | undefined,
  rol: RolAnticipo
) {
  const config = await obtenerRolConfig(ctx, empresa, rol);
  return config?.userId;
}

function deduplicarUsuariosConfig(
  usuarios: Array<{ userId: string; nombre: string; email: string }>
) {
  const vistos = new Set<string>();
  return usuarios.filter((usuario) => {
    if (!usuario.userId || vistos.has(usuario.userId)) return false;
    vistos.add(usuario.userId);
    return true;
  });
}

function rolConfigIncluyeUsuario(
  config: {
    userId?: string;
    usuarios?: Array<{ userId: string }>;
  },
  userId: string
) {
  const userIds =
    config.usuarios?.map((usuario) => usuario.userId) ??
    (config.userId ? [config.userId] : []);
  return userIds.includes(userId);
}

const ROL_POR_FASE: Partial<Record<FaseAnticipo, RolAnticipo>> = {
  III_REVISION_CONTABILIDAD: "CONTABILIDAD",
  IV_APROBACION_GERENCIA: "GERENCIA",
  IV_DESEMBOLSO_TESORERIA: "TESORERO",
};

/**
 * Authorizes the authenticated caller to act on the current phase of an anticipo: the
 * phase assignee (e.g. the jefe directo), a user configured for the phase role, or a
 * full-access user. Returns the caller's Nest user id.
 */
async function requireActorEnFaseAnticipo(
  ctx: MutationCtx,
  anticipo: Doc<"anticipos">,
  fase: FaseAnticipo
): Promise<string> {
  const actor = await requireBillingActor(ctx);
  const userId = actor.usuarioId;
  if (actor.hasFullAccess) return userId;

  const faseRow = await ctx.db
    .query("anticiposFases")
    .withIndex("by_anticipoId_fase", (q) =>
      q.eq("anticipoId", anticipo._id).eq("fase", fase)
    )
    .order("desc")
    .first();
  if (faseRow?.asignadoA && faseRow.asignadoA === userId) return userId;

  const rol = ROL_POR_FASE[fase];
  if (rol) {
    const config = await obtenerRolConfig(ctx, obtenerEmpresaId(anticipo), rol);
    if (config && rolConfigIncluyeUsuario(config, userId)) return userId;
  }
  throw new Error("No tienes asignada esta fase del anticipo.");
}

function assertFaseActual(actual: FaseActualAnticipo, esperada: FaseAnticipo) {
  if (actual !== esperada) {
    throw new Error(`El anticipo no está en la fase esperada: ${esperada}.`);
  }
}

function assertMotivoRechazo(
  decision: "APROBADO" | "RECHAZADO",
  motivo?: string
) {
  if (decision === "RECHAZADO" && !motivo?.trim()) {
    throw new Error("Debe registrar un motivo de rechazo.");
  }
}

function obtenerResponsableLegalizacion(anticipo: {
  responsableUserId?: string;
  createdById: string;
}) {
  return anticipo.responsableUserId || anticipo.createdById;
}

function anticipoCubreFacturaCompleta(anticipo: {
  cubreFacturaCompleta?: boolean;
  tipoBolsa?: "general" | "peajes";
}) {
  if (anticipo.tipoBolsa === "peajes") return true;
  return anticipo.cubreFacturaCompleta !== false;
}

function anticipoRequiereAprobacionJefe(anticipo: {
  responsableOrigen?: "jefe_directo" | "manual" | "solicitante";
}) {
  return (
    anticipo.responsableOrigen === "jefe_directo" ||
    anticipo.responsableOrigen === "manual"
  );
}

function obtenerFasePostAprobacionJefe(anticipo: {
  cubreFacturaCompleta?: boolean;
  tipoBolsa?: "general" | "peajes";
}): Extract<FaseAnticipo, "III_REVISION_CONTABILIDAD" | "IV_APROBACION_GERENCIA"> {
  return anticipoCubreFacturaCompleta(anticipo)
    ? "III_REVISION_CONTABILIDAD"
    : "IV_APROBACION_GERENCIA";
}

function obtenerFaseInicialPostSolicitud(cubreFacturaCompleta: boolean): FaseAnticipo {
  return cubreFacturaCompleta
    ? "III_REVISION_CONTABILIDAD"
    : "IV_APROBACION_GERENCIA";
}

function obtenerDestinosDevolucionGerencia(anticipo: {
  cubreFacturaCompleta?: boolean;
  tipoBolsa?: "general" | "peajes";
  responsableOrigen?: "jefe_directo" | "manual" | "solicitante";
}): FaseAnticipo[] {
  if (anticipoCubreFacturaCompleta(anticipo)) {
    return ["III_REVISION_CONTABILIDAD"];
  }
  if (anticipoRequiereAprobacionJefe(anticipo)) {
    return ["II_APROBACION_JEFE_DIRECTO"];
  }
  return [];
}

async function cerrarFase(
  ctx: MutationCtx,
  anticipoId: Id<"anticipos">,
  fase: FaseAnticipo,
  estado: EstadoFase,
  completadoPor: string,
  now: number,
  observaciones?: string,
  adjuntos?: Array<{ storageId: Id<"_storage">; nombre: string }>,
  payload?: unknown
) {
  const fases = await ctx.db
    .query("anticiposFases")
    .withIndex("by_anticipoId_fase", (q) =>
      q.eq("anticipoId", anticipoId).eq("fase", fase)
    )
    .collect();
  const faseDoc =
    fases
      .filter((row) => row.estado === "EN_PROGRESO" || row.estado === "PENDIENTE")
      .sort((a, b) => (b.fechaInicio ?? 0) - (a.fechaInicio ?? 0))[0] ??
    fases.sort((a, b) => (b.fechaInicio ?? 0) - (a.fechaInicio ?? 0))[0];

  const patch = {
    estado,
    fechaCompletado: now,
    completadoPor,
    observaciones: observaciones?.trim() || undefined,
    adjuntos: adjuntos && adjuntos.length > 0 ? adjuntos : undefined,
    payload,
  };

  if (faseDoc) {
    await ctx.db.patch("anticiposFases", faseDoc._id, patch);
    return faseDoc._id;
  }

  return await ctx.db.insert("anticiposFases", {
    anticipoId,
    fase,
    asignadoA: completadoPor,
    fechaInicio: now,
    ...patch,
  });
}

async function iniciarFase(
  ctx: MutationCtx,
  anticipoId: Id<"anticipos">,
  fase: FaseAnticipo,
  now: number,
  asignadoA?: string,
  estado: Extract<EstadoFase, "PENDIENTE" | "EN_PROGRESO"> = "EN_PROGRESO"
) {
  return await ctx.db.insert("anticiposFases", {
    anticipoId,
    fase,
    estado,
    asignadoA,
    fechaInicio: now,
  });
}

async function obtenerAsignadoParaFase(
  ctx: MutationCtx,
  anticipo: {
    empresa?: number;
    empresa_id?: number;
    createdById: string;
    responsableUserId?: string;
  },
  fase: FaseAnticipo
) {
  if (fase === "I_SOLICITUD") return anticipo.createdById;
  if (fase === "II_APROBACION_JEFE_DIRECTO")
    return anticipo.responsableUserId;
  if (fase === "III_REVISION_CONTABILIDAD") return undefined;
  if (fase === "IV_APROBACION_GERENCIA")
    return await obtenerAsignadoPorRol(
      ctx,
      obtenerEmpresaId(anticipo),
      "GERENCIA"
    );
  if (fase === "IV_DESEMBOLSO_TESORERIA")
    return await obtenerAsignadoPorRol(
      ctx,
      obtenerEmpresaId(anticipo),
      "TESORERO"
    );
  if (fase === "V_PENDIENTE_LEGALIZACION")
    return obtenerResponsableLegalizacion(anticipo);
  return undefined;
}

async function obtenerFaseTesoreriaActiva(
  ctx: QueryCtx | MutationCtx,
  anticipoId: Id<"anticipos">
) {
  const fases = await ctx.db
    .query("anticiposFases")
    .withIndex("by_anticipoId_fase", (q) =>
      q.eq("anticipoId", anticipoId).eq("fase", "IV_DESEMBOLSO_TESORERIA")
    )
    .collect();

  return (
    fases
      .filter(
        (fase) => fase.estado === "EN_PROGRESO" || fase.estado === "PENDIENTE"
      )
      .sort((a, b) => (b.fechaInicio ?? 0) - (a.fechaInicio ?? 0))[0] ?? null
  );
}

async function listarAdjuntosDesembolsoPorAnticipo(
  ctx: QueryCtx | MutationCtx,
  anticipoId: Id<"anticipos">
) {
  return await ctx.db
    .query("anticiposDesembolsoAdjuntos")
    .withIndex("by_anticipoId", (q) => q.eq("anticipoId", anticipoId))
    .collect();
}

async function listarAdjuntosDesembolsoPorFase(
  ctx: QueryCtx | MutationCtx,
  faseId: Id<"anticiposFases">
) {
  const adjuntos = await ctx.db
    .query("anticiposDesembolsoAdjuntos")
    .withIndex("by_faseId", (q) => q.eq("faseId", faseId))
    .collect();
  return adjuntos.sort((a, b) => a.subidoEn - b.subidoEn);
}

function deduplicarAdjuntosPorStorageId<
  T extends { storageId: Id<"_storage">; nombre: string },
>(adjuntos: T[]) {
  const vistos = new Set<string>();
  const resultado: T[] = [];
  for (const adjunto of adjuntos) {
    const key = String(adjunto.storageId);
    if (vistos.has(key)) continue;
    vistos.add(key);
    resultado.push(adjunto);
  }
  return resultado;
}

async function heredarAdjuntosDesembolsoANuevaFase(
  ctx: MutationCtx,
  anticipoId: Id<"anticipos">,
  nuevaFaseId: Id<"anticiposFases">
) {
  const existentes = await listarAdjuntosDesembolsoPorAnticipo(ctx, anticipoId);
  if (existentes.length === 0) return;

  const yaEnNuevaFase = new Set(
    existentes
      .filter((adjunto) => adjunto.faseId === nuevaFaseId)
      .map((adjunto) => String(adjunto.storageId))
  );

  const reutilizables = new Map<
    string,
    (typeof existentes)[number]
  >();
  for (const adjunto of existentes.sort((a, b) => a.subidoEn - b.subidoEn)) {
    const key = String(adjunto.storageId);
    if (!reutilizables.has(key)) {
      reutilizables.set(key, adjunto);
    }
  }

  for (const adjunto of reutilizables.values()) {
    const key = String(adjunto.storageId);
    if (yaEnNuevaFase.has(key)) continue;
    await ctx.db.insert("anticiposDesembolsoAdjuntos", {
      anticipoId,
      faseId: nuevaFaseId,
      storageId: adjunto.storageId,
      nombre: adjunto.nombre,
      tamanio: adjunto.tamanio,
      subidoPorUserId: adjunto.subidoPorUserId,
      subidoEn: adjunto.subidoEn,
    });
  }
}

async function eliminarAdjuntoDesembolsoDeAnticipo(
  ctx: MutationCtx,
  anticipoId: Id<"anticipos">,
  storageId: Id<"_storage">
) {
  const referencias = await ctx.db
    .query("anticiposDesembolsoAdjuntos")
    .withIndex("by_anticipoId_storageId", (q) =>
      q.eq("anticipoId", anticipoId).eq("storageId", storageId)
    )
    .collect();

  for (const referencia of referencias) {
    await ctx.db.delete("anticiposDesembolsoAdjuntos", referencia._id);
  }

  const fases = await ctx.db
    .query("anticiposFases")
    .withIndex("by_anticipoId", (q) => q.eq("anticipoId", anticipoId))
    .collect();

  for (const fase of fases) {
    if (!fase.adjuntos?.some((adjunto) => adjunto.storageId === storageId)) {
      continue;
    }
    const adjuntosRestantes = fase.adjuntos.filter(
      (adjunto) => adjunto.storageId !== storageId
    );
    await ctx.db.patch("anticiposFases", fase._id, {
      adjuntos: adjuntosRestantes.length > 0 ? adjuntosRestantes : undefined,
    });
  }

  try {
    await ctx.storage.delete(storageId);
  } catch {
    // El objeto puede haberse eliminado en una carrera concurrente.
  }
}

async function avanzarAFase(
  ctx: MutationCtx,
  anticipoId: Id<"anticipos">,
  anticipo: Doc<"anticipos">,
  fase: FaseAnticipo,
  now: number,
  comentario?: string
) {
  await ctx.db.patch("anticipos", anticipoId, {
    faseActual: fase,
    updatedAt: now,
  });
  const faseId = await iniciarFase(
    ctx,
    anticipoId,
    fase,
    now,
    await obtenerAsignadoParaFase(ctx, anticipo, fase)
  );
  if (fase === "IV_DESEMBOLSO_TESORERIA") {
    await heredarAdjuntosDesembolsoANuevaFase(ctx, anticipoId, faseId);
  }

  const actualizado = await ctx.db.get("anticipos", anticipoId);
  if (actualizado) {
    await scheduleAnticipoPhaseNotification(ctx, actualizado, fase, comentario);
  }
}

async function rechazarDesdeFase(
  ctx: MutationCtx,
  anticipoId: Id<"anticipos">,
  fase: FaseAnticipo,
  rechazadoPorUserId: string,
  motivo: string,
  now: number,
  adjuntos?: Array<{ storageId: Id<"_storage">; nombre: string }>
) {
  await cerrarFase(
    ctx,
    anticipoId,
    fase,
    "RECHAZADO",
    rechazadoPorUserId,
    now,
    motivo,
    adjuntos,
    {
      decision: "RECHAZADO",
      motivoRechazo: motivo,
    }
  );

  await ctx.db.patch("anticipos", anticipoId, {
    faseActual: "RECHAZADO",
    rechazo: {
      motivo,
      rechazadoPorUserId,
      fechaRechazo: now,
    },
    updatedAt: now,
  });

  const rechazado = await ctx.db.get("anticipos", anticipoId);
  if (rechazado) {
    await scheduleAnticipoNotification(ctx, {
      anticipo: rechazado,
      evento: "RECHAZADO",
      destinatarios: getAnticipoStakeholderRecipients(rechazado),
      comentario: motivo,
    });
  }
}

export const configurarRol = mutation({
  args: {
    secret: v.string(),
    empresa: v.optional(v.number()),
    rol: rolAnticipoArg,
    userId: v.optional(v.string()),
    nombre: v.optional(v.string()),
    email: v.optional(v.string()),
    usuarios: v.optional(v.array(usuarioConfigRolArg)),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.secret);

    const usuarios =
      args.rol === "CONTABILIDAD"
        ? deduplicarUsuariosConfig(
            args.usuarios ??
              (args.userId
                ? [
                    {
                      userId: args.userId,
                      nombre: args.nombre ?? args.userId,
                      email: args.email ?? "",
                    },
                  ]
                : [])
          )
        : [];
    const usuarioPrincipal = usuarios[0];
    const userId =
      args.rol === "CONTABILIDAD" ? usuarioPrincipal?.userId : args.userId;
    const nombre =
      args.rol === "CONTABILIDAD" ? usuarioPrincipal?.nombre : args.nombre;
    const email =
      args.rol === "CONTABILIDAD" ? usuarioPrincipal?.email : args.email;

    if (args.rol !== "CONTABILIDAD" && !userId) {
      throw new Error("Debe seleccionar un responsable para el rol.");
    }

    const existente =
      args.empresa !== undefined
        ? await ctx.db
            .query("anticiposRolesConfig")
            .withIndex("by_empresa_rol", (q) =>
              q.eq("empresa", args.empresa!).eq("rol", args.rol)
            )
            .first()
        : (
            await ctx.db
              .query("anticiposRolesConfig")
              .withIndex("by_rol", (q) => q.eq("rol", args.rol))
              .collect()
          ).find((config) => config.empresa === undefined);

    if (existente) {
      await ctx.db.patch("anticiposRolesConfig", existente._id, {
        userId: userId ?? "",
        nombre: nombre ?? "",
        email: email ?? "",
        ...(args.rol === "CONTABILIDAD" ? { usuarios } : {}),
      });
      await ctx.scheduler.runAfter(
        0,
        internal.anticiposDashboard.reconciliarProyecciones,
        {}
      );
      return existente._id;
    }

    const configId = await ctx.db.insert("anticiposRolesConfig", {
      empresa: args.empresa,
      rol: args.rol,
      userId: userId ?? "",
      nombre: nombre ?? "",
      email: email ?? "",
      ...(args.rol === "CONTABILIDAD" ? { usuarios } : {}),
    });
    await ctx.scheduler.runAfter(
      0,
      internal.anticiposDashboard.reconciliarProyecciones,
      {}
    );
    return configId;
  },
});

export const obtenerRolesConfig = query({
  args: { empresa: v.optional(v.number()) },
  handler: async (ctx, args) => {
    if (args.empresa !== undefined) {
      return await ctx.db
        .query("anticiposRolesConfig")
        .withIndex("by_empresa", (q) => q.eq("empresa", args.empresa!))
        .collect();
    }

    return await ctx.db.query("anticiposRolesConfig").collect();
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireIdentity(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const limpiarDatosAnticipos = mutation({
  args: {
    confirmacion: v.literal("LIMPIAR_ANTICIPOS"),
  },
  handler: async (ctx) => {
    // Destructive: wipes every advance. Admin only.
    await requireAdmin(ctx);
    const now = Date.now();
    const [
      fases,
      anticiposRows,
      roles,
      desembolsoAdjuntos,
      legalizaciones,
      facturas,
      peajesOperaciones,
      peajesItems,
      dashboardItems,
      dashboardResponsables,
      dashboardContadores,
      dashboardBackfills,
      ajustes,
    ] = await Promise.all([
      ctx.db.query("anticiposFases").collect(),
      ctx.db.query("anticipos").collect(),
      ctx.db.query("anticiposRolesConfig").collect(),
      ctx.db.query("anticiposDesembolsoAdjuntos").collect(),
      ctx.db.query("facturacionAnticipoLegalizaciones").collect(),
      ctx.db.query("facturacionFacturas").collect(),
      ctx.db.query("facturacionPeajesOperaciones").collect(),
      ctx.db.query("facturacionPeajesOperacionItems").collect(),
      ctx.db.query("anticiposDashboardItems").collect(),
      ctx.db.query("anticiposDashboardResponsables").collect(),
      ctx.db.query("anticiposDashboardContadoresDia").collect(),
      ctx.db.query("anticiposDashboardBackfills").collect(),
      ctx.db.query("anticiposAjustes").collect(),
    ]);

    for (const row of ajustes) await ctx.db.delete("anticiposAjustes", row._id);
    for (const row of legalizaciones) await ctx.db.delete("facturacionAnticipoLegalizaciones", row._id);
    for (const row of desembolsoAdjuntos) await ctx.db.delete("anticiposDesembolsoAdjuntos", row._id);
    for (const row of fases) await ctx.db.delete("anticiposFases", row._id);
    for (const row of dashboardResponsables) await ctx.db.delete("anticiposDashboardResponsables", row._id);
    for (const row of dashboardItems) await ctx.db.delete("anticiposDashboardItems", row._id);
    for (const row of dashboardContadores) await ctx.db.delete("anticiposDashboardContadoresDia", row._id);
    for (const row of dashboardBackfills) await ctx.db.delete("anticiposDashboardBackfills", row._id);
    for (const row of anticiposRows) await ctx.db.delete("anticipos", row._id);
    for (const row of roles) await ctx.db.delete("anticiposRolesConfig", row._id);

    let facturasReseteadas = 0;
    for (const factura of facturas) {
      const tieneMarcador =
        factura.esLegalizacionAnticipo ||
        factura.anticipoLiderUserId !== undefined ||
        factura.anticipoLiderNombre !== undefined ||
        factura.anticipoLiderEmail !== undefined ||
        factura.anticipoProcesoId !== undefined ||
        factura.anticipoProcesoNombre !== undefined;
      if (!tieneMarcador) continue;
      await ctx.db.patch("facturacionFacturas", factura._id, {
        esLegalizacionAnticipo: undefined,
        anticipoLiderUserId: undefined,
        anticipoLiderNombre: undefined,
        anticipoLiderEmail: undefined,
        anticipoProcesoId: undefined,
        anticipoProcesoNombre: undefined,
        actualizadoEn: now,
      });
      facturasReseteadas += 1;
    }

    let peajesItemsEliminados = 0;
    for (const item of peajesItems) {
      if (item.tipo !== "anticipo") continue;
      await ctx.db.delete("facturacionPeajesOperacionItems", item._id);
      peajesItemsEliminados += 1;
    }

    let peajesOperacionesReseteadas = 0;
    for (const operacion of peajesOperaciones) {
      const tieneAnticipos =
        operacion.anticiposAplicados.length > 0 ||
        operacion.legalizacionIds.length > 0;
      if (!tieneAnticipos) continue;
      await ctx.db.patch("facturacionPeajesOperaciones", operacion._id, {
        anticiposAplicados: [],
        legalizacionIds: [],
        actualizadoEn: now,
      });
      peajesOperacionesReseteadas += 1;
    }

    return {
      anticipos: anticiposRows.length,
      fases: fases.length,
      roles: roles.length,
      legalizaciones: legalizaciones.length,
      facturasReseteadas,
      peajesItemsEliminados,
      peajesOperacionesReseteadas,
    };
  },
});

export const crearAnticipo = mutation({
  args: {
    empresa: v.optional(v.number()),
    empresa_id: v.optional(v.number()),
    razonSocial: v.string(),
    nit: v.string(),
    formaPago: formaPagoArg,
    numeroCuenta: v.optional(v.string()),
    banco: v.optional(v.string()),
    tipoBolsa: v.optional(tipoBolsaArg),
    valorNumerico: v.number(),
    valorLetra: v.string(),
    maxLegalizacionDate: v.number(),
    soportesSolicitud: v.optional(v.array(adjuntoArg)),
    observaciones: v.optional(v.string()),
    createdById: v.string(),
    solicitanteNombre: v.optional(v.string()),
    solicitanteEmail: v.optional(v.string()),
    procesoId: v.optional(v.number()),
    procesoNombre: v.optional(v.string()),
    responsableUserId: v.optional(v.string()),
    responsableNombre: v.optional(v.string()),
    responsableEmail: v.optional(v.string()),
    responsableOrigen: v.optional(responsableOrigenArg),
    cubreFacturaCompleta: v.optional(v.boolean()),
    proveedorOrigen: v.optional(proveedorOrigenArg),
    proveedorSiesaId: v.optional(v.string()),
    proveedorSiesaSucursalId: v.optional(v.string()),
    proveedorManualConfirmado: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    if (!args.createdById.trim())
      throw new Error("Debe iniciar sesión para crear un anticipo.");
    if (args.valorNumerico <= 0)
      throw new Error("El valor del anticipo debe ser mayor a cero.");
    if (args.formaPago === "TRANSFERENCIA BANCARIA") {
      if (!args.numeroCuenta?.trim())
        throw new Error("Debe indicar el número de cuenta.");
      if (!args.banco?.trim()) throw new Error("Debe indicar el banco.");
    }

    const nit = assertProveedorNitValido(args.nit);
    const razonSocial = assertProveedorRazonSocialValida(args.razonSocial);

    let proveedorOrigen = args.proveedorOrigen;
    let proveedorSiesaId = args.proveedorSiesaId?.trim() || undefined;
    let proveedorSiesaSucursalId =
      args.proveedorSiesaSucursalId?.trim() || undefined;

    if (proveedorOrigen === "siesa") {
      if (!proveedorSiesaId) {
        throw new Error(
          "El identificador SIESA del proveedor es obligatorio."
        );
      }
    } else if (proveedorOrigen === "manual_solicitud") {
      if (args.proveedorManualConfirmado !== true) {
        throw new Error(
          "Debes confirmar que el proveedor manual solo aplica a esta solicitud."
        );
      }
      if (proveedorSiesaId || proveedorSiesaSucursalId) {
        throw new Error(
          "Un proveedor manual no puede incluir identificadores SIESA."
        );
      }
      proveedorSiesaId = undefined;
      proveedorSiesaSucursalId = undefined;
    } else {
      // Legacy clients: keep optional origen unset during rollout.
      proveedorOrigen = undefined;
      proveedorSiesaId = undefined;
      proveedorSiesaSucursalId = undefined;
    }

    const now = Date.now();
    const consecutivo = await obtenerSiguienteConsecutivo(ctx);
    const empresaId = args.empresa_id ?? args.empresa;
    const tipoBolsa = args.tipoBolsa ?? "general";
    const procesoNombre =
      tipoBolsa === "peajes" ? "PEAJES" : args.procesoNombre?.trim() || undefined;
    const procesoId = tipoBolsa === "peajes" ? undefined : args.procesoId;
    const bolsaId = await ensureBolsaAnticipo(ctx, {
      empresa: empresaId,
      tipoBolsa,
      procesoId,
      procesoNombre,
    }, now);
    const responsableUserId = args.responsableUserId?.trim() || args.createdById;
    const responsableOrigen = args.responsableOrigen ?? "solicitante";
    const cubreFacturaCompleta =
      tipoBolsa === "peajes" ? true : args.cubreFacturaCompleta !== false;
    const requiereRevisionResponsable = anticipoRequiereAprobacionJefe({
      responsableOrigen,
    });
    const siguienteFase: FaseAnticipo = requiereRevisionResponsable
      ? "II_APROBACION_JEFE_DIRECTO"
      : obtenerFaseInicialPostSolicitud(cubreFacturaCompleta);

    const anticipoId = await ctx.db.insert("anticipos", {
      empresa: empresaId,
      empresa_id: empresaId,
      consecutivo,
      razonSocial,
      nit,
      proveedorOrigen,
      proveedorSiesaId,
      proveedorSiesaSucursalId,
      formaPago: args.formaPago,
      numeroCuenta: args.numeroCuenta,
      banco: args.banco,
      tipoBolsa,
      bolsaId,
      valorNumerico: args.valorNumerico,
      valorContable: args.valorNumerico,
      valorLetra: args.valorLetra,
      saldoLegalizado: 0,
      maxLegalizacionDate: args.maxLegalizacionDate,
      soportesSolicitud: args.soportesSolicitud ?? [],
      observaciones: args.observaciones,
      createdById: args.createdById,
      solicitanteNombre: args.solicitanteNombre?.trim() || undefined,
      solicitanteEmail: args.solicitanteEmail?.trim().toLowerCase() || undefined,
      procesoId,
      procesoNombre,
      responsableUserId,
      responsableNombre:
        args.responsableNombre?.trim() ||
        (responsableUserId === args.createdById ? args.createdById : undefined),
      responsableEmail: args.responsableEmail?.trim() || undefined,
      responsableOrigen,
      cubreFacturaCompleta,
      faseActual: siguienteFase,
      legalizacion: [],
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("anticiposFases", {
      anticipoId,
      fase: "I_SOLICITUD",
      estado: "COMPLETADO",
      asignadoA: args.createdById,
      fechaInicio: now,
      fechaCompletado: now,
      completadoPor: args.createdById,
      observaciones: args.observaciones,
      adjuntos: args.soportesSolicitud,
      payload: {
        responsableUserId,
        solicitanteNombre: args.solicitanteNombre,
        solicitanteEmail: args.solicitanteEmail,
        responsableNombre: args.responsableNombre,
        responsableEmail: args.responsableEmail,
        responsableOrigen,
        cubreFacturaCompleta,
        procesoId,
        procesoNombre,
        tipoBolsa,
        bolsaId,
        proveedorOrigen,
        proveedorSiesaId,
        proveedorSiesaSucursalId,
        proveedorManualConfirmado:
          proveedorOrigen === "manual_solicitud"
            ? true
            : undefined,
      },
    });

    await iniciarFase(
      ctx,
      anticipoId,
      siguienteFase,
      now,
      siguienteFase === "II_APROBACION_JEFE_DIRECTO"
        ? responsableUserId
        : undefined
    );

    await refreshAnticipoDashboardProjection(ctx, anticipoId, now);

    const creado = await ctx.db.get("anticipos", anticipoId);
    if (creado) {
      await scheduleAnticipoPhaseNotification(ctx, creado, "I_SOLICITUD");
      await scheduleAnticipoPhaseNotification(ctx, creado, siguienteFase);
    }

    return { anticipoId, consecutivo };
  },
});

export const aprobarJefeDirecto = mutation({
  args: {
    anticipoId: v.id("anticipos"),
    jefeDirectoUserId: v.string(),
    decision: decisionArg,
    motivoRechazo: v.optional(v.string()),
    observaciones: v.optional(v.string()),
    adjuntos: v.optional(v.array(adjuntoArg)),
  },
  handler: async (ctx, args) => {
    const anticipo = await ctx.db.get("anticipos", args.anticipoId);
    if (!anticipo) throw new Error("Anticipo no encontrado.");
    assertFaseActual(anticipo.faseActual, "II_APROBACION_JEFE_DIRECTO");
    await requireActorEnFaseAnticipo(ctx, anticipo, "II_APROBACION_JEFE_DIRECTO");
    assertMotivoRechazo(args.decision, args.motivoRechazo);

    const now = Date.now();

    if (args.decision === "RECHAZADO") {
      await rechazarDesdeFase(
        ctx,
        args.anticipoId,
        "II_APROBACION_JEFE_DIRECTO",
        args.jefeDirectoUserId,
        args.motivoRechazo!,
        now,
        args.adjuntos
      );
      await refreshAnticipoDashboardProjection(ctx, args.anticipoId, now);
      return args.anticipoId;
    }

    await cerrarFase(
      ctx,
      args.anticipoId,
      "II_APROBACION_JEFE_DIRECTO",
      "COMPLETADO",
      args.jefeDirectoUserId,
      now,
      args.observaciones,
      args.adjuntos,
      { decision: args.decision }
    );
    await avanzarAFase(
      ctx,
      args.anticipoId,
      anticipo,
      obtenerFasePostAprobacionJefe(anticipo),
      now,
      args.observaciones
    );

    await refreshAnticipoDashboardProjection(ctx, args.anticipoId, now);

    return args.anticipoId;
  },
});

export const aprobarContabilidad = mutation({
  args: {
    anticipoId: v.id("anticipos"),
    contadorUserId: v.string(),
    decision: decisionArg,
    motivoRechazo: v.optional(v.string()),
    observaciones: v.optional(v.string()),
    adjuntos: v.optional(v.array(adjuntoArg)),
    valorContableNuevo: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const anticipo = await ctx.db.get("anticipos", args.anticipoId);
    if (!anticipo) throw new Error("Anticipo no encontrado.");
    assertFaseActual(anticipo.faseActual, "III_REVISION_CONTABILIDAD");
    await requireActorEnFaseAnticipo(ctx, anticipo, "III_REVISION_CONTABILIDAD");
    assertMotivoRechazo(args.decision, args.motivoRechazo);

    const now = Date.now();

    if (args.decision === "RECHAZADO") {
      if (args.valorContableNuevo !== undefined) {
        throw new Error(
          "No puedes modificar el valor contable al rechazar el anticipo."
        );
      }
      await rechazarDesdeFase(
        ctx,
        args.anticipoId,
        "III_REVISION_CONTABILIDAD",
        args.contadorUserId,
        args.motivoRechazo!,
        now,
        args.adjuntos
      );
      await refreshAnticipoDashboardProjection(ctx, args.anticipoId, now);
      return args.anticipoId;
    }

    let valorContableCambio:
      | { valorAnterior: number; valorNuevo: number }
      | undefined;
    if (args.valorContableNuevo !== undefined) {
      const valorAnterior = getValorContableAnticipo(anticipo);
      const valorNuevo = args.valorContableNuevo;
      if (!Number.isFinite(valorNuevo) || valorNuevo < 0) {
        throw new Error(
          "El valor contable debe ser un número finito mayor o igual a cero."
        );
      }
      if (valorNuevo !== valorAnterior && !args.observaciones?.trim()) {
        throw new Error(
          "Debes registrar una observación cuando cambias el valor contable."
        );
      }
      if (valorNuevo !== valorAnterior) {
        await ctx.db.patch("anticipos", args.anticipoId, {
          valorContable: valorNuevo,
          valorContableActualizadoEn: now,
          valorContableActualizadoPorUserId: args.contadorUserId,
          updatedAt: now,
        });
        valorContableCambio = { valorAnterior, valorNuevo };
      }
    }

    await cerrarFase(
      ctx,
      args.anticipoId,
      "III_REVISION_CONTABILIDAD",
      "COMPLETADO",
      args.contadorUserId,
      now,
      args.observaciones,
      args.adjuntos,
      {
        decision: args.decision,
        ...(valorContableCambio ? { valorContableCambio } : {}),
      }
    );
    await avanzarAFase(
      ctx,
      args.anticipoId,
      anticipo,
      "IV_APROBACION_GERENCIA",
      now,
      args.observaciones
    );

    await refreshAnticipoDashboardProjection(ctx, args.anticipoId, now);

    return args.anticipoId;
  },
});

export const aprobarGerencia = mutation({
  args: {
    anticipoId: v.id("anticipos"),
    gerenteUserId: v.string(),
    decision: decisionArg,
    motivoRechazo: v.optional(v.string()),
    observaciones: v.optional(v.string()),
    adjuntos: v.optional(v.array(adjuntoArg)),
  },
  handler: async (ctx, args) => {
    const anticipo = await ctx.db.get("anticipos", args.anticipoId);
    if (!anticipo) throw new Error("Anticipo no encontrado.");
    assertFaseActual(anticipo.faseActual, "IV_APROBACION_GERENCIA");
    await requireActorEnFaseAnticipo(ctx, anticipo, "IV_APROBACION_GERENCIA");
    assertMotivoRechazo(args.decision, args.motivoRechazo);

    const now = Date.now();

    if (args.decision === "RECHAZADO") {
      await rechazarDesdeFase(
        ctx,
        args.anticipoId,
        "IV_APROBACION_GERENCIA",
        args.gerenteUserId,
        args.motivoRechazo!,
        now,
        args.adjuntos
      );
      await refreshAnticipoDashboardProjection(ctx, args.anticipoId, now);
      return args.anticipoId;
    }

    await cerrarFase(
      ctx,
      args.anticipoId,
      "IV_APROBACION_GERENCIA",
      "COMPLETADO",
      args.gerenteUserId,
      now,
      args.observaciones,
      args.adjuntos,
      { decision: args.decision }
    );

    await avanzarAFase(
      ctx,
      args.anticipoId,
      anticipo,
      "IV_DESEMBOLSO_TESORERIA",
      now,
      args.observaciones
    );

    await refreshAnticipoDashboardProjection(ctx, args.anticipoId, now);

    return args.anticipoId;
  },
});

export const registrarDesembolsoTesoreria = mutation({
  args: {
    anticipoId: v.id("anticipos"),
    tesoreroUserId: v.string(),
    observaciones: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const anticipo = await ctx.db.get("anticipos", args.anticipoId);
    if (!anticipo) throw new Error("Anticipo no encontrado.");
    assertFaseActual(anticipo.faseActual, "IV_DESEMBOLSO_TESORERIA");
    await requireActorEnFaseAnticipo(ctx, anticipo, "IV_DESEMBOLSO_TESORERIA");

    const faseActiva = await obtenerFaseTesoreriaActiva(ctx, args.anticipoId);
    if (!faseActiva) {
      throw new Error("No hay una fase activa de desembolso en Tesorería.");
    }

    const adjuntosPersistidos = await listarAdjuntosDesembolsoPorFase(
      ctx,
      faseActiva._id
    );
    const adjuntos = adjuntosPersistidos.map((adjunto) => ({
      storageId: adjunto.storageId,
      nombre: adjunto.nombre,
    }));

    const now = Date.now();
    const desembolso = {
      realizadoPorUserId: args.tesoreroUserId,
      fechaDesembolso: now,
      soporte: adjuntos[0],
      observaciones: args.observaciones?.trim() || undefined,
    };

    await cerrarFase(
      ctx,
      args.anticipoId,
      "IV_DESEMBOLSO_TESORERIA",
      "COMPLETADO",
      args.tesoreroUserId,
      now,
      args.observaciones,
      adjuntos.length > 0 ? adjuntos : undefined,
      desembolso
    );

    await ctx.db.patch("anticipos", args.anticipoId, {
      faseActual: "V_PENDIENTE_LEGALIZACION",
      desembolso,
      updatedAt: now,
    });
    await iniciarFase(
      ctx,
      args.anticipoId,
      "V_PENDIENTE_LEGALIZACION",
      now,
      obtenerResponsableLegalizacion(anticipo)
    );

    await refreshAnticipoDashboardProjection(ctx, args.anticipoId, now);

    const desembolsado = await ctx.db.get("anticipos", args.anticipoId);
    if (desembolsado) {
      await scheduleAnticipoPhaseNotification(
        ctx,
        desembolsado,
        "V_PENDIENTE_LEGALIZACION",
        args.observaciones
      );
    }

    return args.anticipoId;
  },
});

export const obtenerAdjuntosBorradorDesembolso = query({
  args: { anticipoId: v.id("anticipos") },
  handler: async (ctx, args) => {
    const anticipo = await ctx.db.get("anticipos", args.anticipoId);
    if (!anticipo) return [];
    if (anticipo.faseActual !== "IV_DESEMBOLSO_TESORERIA") return [];

    const faseActiva = await obtenerFaseTesoreriaActiva(ctx, args.anticipoId);
    if (!faseActiva) return [];

    const adjuntos = await listarAdjuntosDesembolsoPorFase(ctx, faseActiva._id);
    return adjuntos.map((adjunto) => ({
      storageId: adjunto.storageId,
      nombre: adjunto.nombre,
      tamanio: adjunto.tamanio,
      subidoEn: adjunto.subidoEn,
    }));
  },
});

export const guardarAdjuntoBorradorDesembolso = mutation({
  args: {
    anticipoId: v.id("anticipos"),
    tesoreroUserId: v.string(),
    storageId: v.id("_storage"),
    nombre: v.string(),
  },
  handler: async (ctx, args) => {
    const nombre = args.nombre.trim();
    if (!nombre) {
      throw new Error("El nombre del archivo es obligatorio.");
    }

    const metadata = await ctx.db.system.get("_storage", args.storageId);
    if (!metadata) {
      throw new Error("El archivo no existe en Storage.");
    }

    const anticipo = await ctx.db.get("anticipos", args.anticipoId);
    if (!anticipo) {
      await ctx.storage.delete(args.storageId);
      return {
        discarded: true as const,
        reason: "Anticipo no encontrado; el archivo subido se descartó.",
      };
    }

    if (anticipo.faseActual !== "IV_DESEMBOLSO_TESORERIA") {
      await ctx.storage.delete(args.storageId);
      return {
        discarded: true as const,
        reason:
          "El anticipo ya no está en Tesorería; el archivo subido se descartó.",
      };
    }

    const faseActiva = await obtenerFaseTesoreriaActiva(ctx, args.anticipoId);
    if (!faseActiva) {
      await ctx.storage.delete(args.storageId);
      return {
        discarded: true as const,
        reason:
          "No hay una fase activa de Tesorería; el archivo subido se descartó.",
      };
    }

    const existentesEnFase = await listarAdjuntosDesembolsoPorFase(
      ctx,
      faseActiva._id
    );
    const duplicado = existentesEnFase.find(
      (adjunto) => adjunto.storageId === args.storageId
    );
    if (duplicado) {
      return {
        discarded: false as const,
        storageId: duplicado.storageId,
        nombre: duplicado.nombre,
        tamanio: duplicado.tamanio,
        subidoEn: duplicado.subidoEn,
      };
    }

    const subidoEn = Date.now();
    await ctx.db.insert("anticiposDesembolsoAdjuntos", {
      anticipoId: args.anticipoId,
      faseId: faseActiva._id,
      storageId: args.storageId,
      nombre,
      tamanio: metadata.size,
      subidoPorUserId: args.tesoreroUserId,
      subidoEn,
    });

    return {
      discarded: false as const,
      storageId: args.storageId,
      nombre,
      tamanio: metadata.size,
      subidoEn,
    };
  },
});

export const eliminarAdjuntoBorradorDesembolso = mutation({
  args: {
    anticipoId: v.id("anticipos"),
    tesoreroUserId: v.string(),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const anticipo = await ctx.db.get("anticipos", args.anticipoId);
    if (!anticipo) throw new Error("Anticipo no encontrado.");
    if (anticipo.faseActual !== "IV_DESEMBOLSO_TESORERIA") {
      throw new Error(
        "Sólo se pueden eliminar soportes mientras el anticipo esté en Tesorería."
      );
    }

    const faseActiva = await obtenerFaseTesoreriaActiva(ctx, args.anticipoId);
    if (!faseActiva) {
      throw new Error(
        "Sólo se pueden eliminar soportes mientras el anticipo esté en Tesorería."
      );
    }

    await eliminarAdjuntoDesembolsoDeAnticipo(
      ctx,
      args.anticipoId,
      args.storageId
    );

    return null;
  },
});

export const devolverAnticipo = mutation({
  args: {
    anticipoId: v.id("anticipos"),
    actorUserId: v.string(),
    faseDestino: faseAnticipoArg,
    motivo: v.string(),
    adjuntos: v.optional(v.array(adjuntoArg)),
  },
  handler: async (ctx, args) => {
    const anticipo = await ctx.db.get("anticipos", args.anticipoId);
    if (!anticipo) throw new Error("Anticipo no encontrado.");
    if (!args.motivo.trim()) {
      throw new Error("Debe registrar un motivo de devolución.");
    }
    if (!FASES_ANTICIPO.includes(anticipo.faseActual as FaseAnticipo)) {
      throw new Error("El anticipo ya no se encuentra en una fase retornable.");
    }

    const faseActual = anticipo.faseActual as FaseAnticipo;
    const allowedTargets: Partial<Record<FaseAnticipo, FaseAnticipo[]>> = {
      III_REVISION_CONTABILIDAD:
        anticipo.responsableOrigen === "jefe_directo" ||
        anticipo.responsableOrigen === "manual"
          ? ["II_APROBACION_JEFE_DIRECTO"]
          : [],
      IV_APROBACION_GERENCIA: obtenerDestinosDevolucionGerencia(anticipo),
      IV_DESEMBOLSO_TESORERIA: ["IV_APROBACION_GERENCIA"],
    };
    const faseDestino = args.faseDestino as FaseAnticipo;
    const targets = allowedTargets[faseActual] ?? [];
    if (!targets.includes(faseDestino)) {
      throw new Error("La devolución seleccionada no aplica para esta fase.");
    }

    const now = Date.now();
    const motivo = args.motivo.trim();
    await cerrarFase(
      ctx,
      args.anticipoId,
      faseActual,
      "DEVUELTO",
      args.actorUserId,
      now,
      motivo,
      args.adjuntos,
      {
        devueltaDesde: faseActual,
        devueltaHacia: faseDestino,
        motivo,
      }
    );
    await avanzarAFase(ctx, args.anticipoId, anticipo, faseDestino, now, motivo);
    await refreshAnticipoDashboardProjection(ctx, args.anticipoId, now);

    const devuelto = await ctx.db.get("anticipos", args.anticipoId);
    const solicitante = devuelto ? getAnticipoRequesterRecipient(devuelto) : null;
    if (devuelto && solicitante) {
      await scheduleAnticipoNotification(ctx, {
        anticipo: devuelto,
        evento: "DEVUELTO",
        destinatarios: [solicitante],
        comentario: motivo,
        faseDestino,
      });
    }

    return args.anticipoId;
  },
});

export const rechazarAnticipo = mutation({
  args: {
    anticipoId: v.id("anticipos"),
    rechazadoPorUserId: v.string(),
    motivo: v.string(),
    adjuntos: v.optional(v.array(adjuntoArg)),
  },
  handler: async (ctx, args) => {
    const anticipo = await ctx.db.get("anticipos", args.anticipoId);
    if (!anticipo) throw new Error("Anticipo no encontrado.");
    if (!args.motivo.trim())
      throw new Error("Debe registrar un motivo de rechazo.");

    const faseActual = anticipo.faseActual;
    if (!FASES_ANTICIPO.includes(faseActual as FaseAnticipo)) {
      throw new Error("El anticipo ya no se encuentra en una fase rechazable.");
    }

    const now = Date.now();
    await rechazarDesdeFase(
      ctx,
      args.anticipoId,
      faseActual as FaseAnticipo,
      args.rechazadoPorUserId,
      args.motivo,
      now,
      args.adjuntos
    );
    await refreshAnticipoDashboardProjection(ctx, args.anticipoId, now);

    return args.anticipoId;
  },
});

export const anularAnticipo = mutation({
  args: {
    anticipoId: v.id("anticipos"),
    anuladoPorUserId: v.string(),
    motivo: v.string(),
    adjuntos: v.optional(v.array(adjuntoArg)),
  },
  handler: async (ctx, args) => {
    const anticipo = await ctx.db.get("anticipos", args.anticipoId);
    if (!anticipo) throw new Error("Anticipo no encontrado.");
    if (!args.motivo.trim())
      throw new Error("Debe registrar un motivo de anulación.");
    if (anticipo.faseActual === "ANULADO") return args.anticipoId;

    const now = Date.now();
    if (FASES_ANTICIPO.includes(anticipo.faseActual as FaseAnticipo)) {
      await cerrarFase(
        ctx,
        args.anticipoId,
        anticipo.faseActual as FaseAnticipo,
        "ANULADO",
        args.anuladoPorUserId,
        now,
        args.motivo,
        args.adjuntos,
        { motivoAnulacion: args.motivo }
      );
    }

    await ctx.db.patch("anticipos", args.anticipoId, {
      faseActual: "ANULADO",
      anulacion: {
        motivo: args.motivo,
        anuladoPorUserId: args.anuladoPorUserId,
        fechaAnulacion: now,
      },
      updatedAt: now,
    });

    await refreshAnticipoDashboardProjection(ctx, args.anticipoId, now);

    const anulado = await ctx.db.get("anticipos", args.anticipoId);
    if (anulado) {
      await scheduleAnticipoNotification(ctx, {
        anticipo: anulado,
        evento: "ANULADO",
        destinatarios: getAnticipoStakeholderRecipients(anulado),
        comentario: args.motivo,
      });
    }

    return args.anticipoId;
  },
});

export const obtenerAnticipoPorId = query({
  args: { id: v.id("anticipos") },
  handler: async (ctx, args) => {
    const anticipo = await ctx.db.get("anticipos", args.id);
    if (!anticipo) return null;

    const fases = await ctx.db
      .query("anticiposFases")
      .withIndex("by_anticipoId", (q) => q.eq("anticipoId", anticipo._id))
      .collect();
    const ultimaFaseInicio =
      fases.reduce((max, fase) => Math.max(max, fase.fechaInicio ?? 0), 0) || null;
    const faseEnCurso =
      fases.find(
        (fase) => fase.estado === "EN_PROGRESO" || fase.estado === "PENDIENTE"
      ) ?? null;
    const legalizacionesFacturacion = await ctx.db
      .query("facturacionAnticipoLegalizaciones")
      .withIndex("by_anticipoId_estado", (q) =>
        q.eq("anticipoId", anticipo._id).eq("estado", "activa")
      )
      .collect();
    const facturasLegalizacion = await Promise.all(
      legalizacionesFacturacion.map(async (legalizacion) => {
        const factura = await ctx.db.get("facturacionFacturas", legalizacion.facturaId);
        return { ...legalizacion, factura };
      })
    );
    const bolsaId = await resolveBolsaIdForAnticipo(ctx, anticipo);
    const bolsa = bolsaId ? await ctx.db.get("bolsasAnticipos", bolsaId) : null;

    return {
      ...anticipo,
      bolsaIdResolved: bolsaId,
      bolsa,
      ultimaFaseInicio,
      faseEnCurso,
      legalizacionesFacturacion: facturasLegalizacion,
    };
  },
});

export const obtenerFasesDeAnticipo = query({
  args: { anticipoId: v.id("anticipos") },
  handler: async (ctx, args) => {
    const fases = await ctx.db
      .query("anticiposFases")
      .withIndex("by_anticipoId", (q) => q.eq("anticipoId", args.anticipoId))
      .collect();

    const adjuntosPersistidos = await listarAdjuntosDesembolsoPorAnticipo(
      ctx,
      args.anticipoId
    );
    const adjuntosPorFase = new Map<
      string,
      Array<{ storageId: Id<"_storage">; nombre: string }>
    >();
    for (const adjunto of adjuntosPersistidos.sort(
      (a, b) => a.subidoEn - b.subidoEn
    )) {
      const key = String(adjunto.faseId);
      const lista = adjuntosPorFase.get(key) ?? [];
      lista.push({
        storageId: adjunto.storageId,
        nombre: adjunto.nombre,
      });
      adjuntosPorFase.set(key, lista);
    }

    return fases
      .sort((a, b) => (a.fechaInicio ?? 0) - (b.fechaInicio ?? 0))
      .map((fase) => {
        const persistidos = adjuntosPorFase.get(String(fase._id)) ?? [];
        const legacy = fase.adjuntos ?? [];
        const adjuntos = deduplicarAdjuntosPorStorageId([
          ...persistidos,
          ...legacy,
        ]);
        return {
          ...fase,
          adjuntos: adjuntos.length > 0 ? adjuntos : undefined,
        };
      });
  },
});
