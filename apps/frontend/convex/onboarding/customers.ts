// Inscripción de CLIENTES — funciones internas (identidad WorkOS).
// El actor se deriva siempre de la identidad; ningún id de usuario viene del cliente.
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "../_generated/server";
import { CUSTOMER_FASES_POR_ROL } from "../../lib/onboarding/phases/customers";
import { rolCumplimientoPorRiesgo, toRiesgoNivel } from "../../lib/onboarding/risk/compute";
import { computeCustomerRisk } from "../../lib/onboarding/risk/customer-matrix";
import { RIESGO_SCORE } from "../../lib/onboarding/risk/shared";
import {
  actorTieneRol,
  puedeVerInscripcion,
  requireActorEnFase,
  requireGestionInscripcion,
  requirePuedeCrear,
  requireResponsable,
  resolveOnboardingAccess,
  type OnboardingAccess,
} from "../lib/onboarding/access";
import { buildOnboardingSearchText } from "../lib/onboarding/searchText";
import { programarCorreoRastreado, TIPOS_RASTREADOS } from "../lib/onboarding/correos";
import {
  assertCondicionesPagoCliente,
  getDocCliente,
  listDocsCliente,
  materializarDocumentosCliente,
  revisionDocumentalCompleta,
} from "../lib/onboarding/customersDocs";
import { programarNotificacion } from "../lib/onboarding/notificar";
import { obtenerRolConfig, resolverAsignado, type OnboardingRol } from "../lib/onboarding/phases";
import {
  inscripcionesPorDocumento,
  procesoEnCursoPorDocumento,
  resumirProcesos,
} from "../lib/onboarding/procesosPorDocumento";
import { contactoFirmaDe, contactoFormularioDe, contactoTerceroDe, normalizeNumeroDocumento } from "../lib/onboarding/refs";
import { revokeTokens } from "../lib/onboarding/tokens";
import {
  customerFaseFilaValidator,
  decisionValidator,
  formaPagoClienteValidator,
  listasValidator,
  plazoPagoValidator,
  riesgoNivelValidator,
  tipoDocumentoValidator,
  tipoEvaluacionValidator,
  tipoPersonaValidator,
  tipoSolicitudOrigenValidator,
  tipoSolicitudValidator,
} from "./validators";

type CustomerDoc = Doc<"onboardingClientes">;
type FaseRow = Doc<"onboardingClientesFases">;
type FaseFila = FaseRow["fase"];
type FaseActual = CustomerDoc["faseActual"];
type FasePayload = NonNullable<FaseRow["payload"]>;

const MODULO = "customer" as const;

// ─── Helpers de fase ─────────────────────────────────────────────────────────

async function requireIns(ctx: QueryCtx | MutationCtx, id: Id<"onboardingClientes">): Promise<CustomerDoc> {
  const ins = await ctx.db.get("onboardingClientes", id);
  if (!ins) throw new Error("Inscripción no encontrada.");
  return ins;
}

async function requireVer(ctx: QueryCtx | MutationCtx, ins: CustomerDoc): Promise<OnboardingAccess> {
  const { access } = await resolveOnboardingAccess(ctx, MODULO, ins.empresa);
  if (!puedeVerInscripcion(access, ins)) throw new Error("No autorizado para ver esta inscripción.");
  return access;
}

async function getFase(ctx: QueryCtx | MutationCtx, inscripcionId: Id<"onboardingClientes">, fase: FaseFila) {
  return await ctx.db
    .query("onboardingClientesFases")
    .withIndex("by_inscripcionId_fase", (q) => q.eq("inscripcionId", inscripcionId).eq("fase", fase))
    .order("desc")
    .first();
}

async function listFasesIns(ctx: QueryCtx | MutationCtx, inscripcionId: Id<"onboardingClientes">): Promise<FaseRow[]> {
  return await ctx.db
    .query("onboardingClientesFases")
    .withIndex("by_inscripcionId", (q) => q.eq("inscripcionId", inscripcionId))
    .take(100);
}

async function insertFase(
  ctx: MutationCtx,
  ins: CustomerDoc,
  data: {
    fase: FaseFila;
    estado: FaseRow["estado"];
    asignadoA?: string;
    fechaInicio?: number;
    fechaCompletado?: number;
    completadoPor?: string;
    observaciones?: string;
    payload?: FasePayload;
  },
) {
  return await ctx.db.insert("onboardingClientesFases", { inscripcionId: ins._id, empresa: ins.empresa, ...data });
}

async function setFaseActual(ctx: MutationCtx, ins: CustomerDoc, fase: FaseActual, now: number, extra: Partial<CustomerDoc> = {}) {
  await ctx.db.patch("onboardingClientes", ins._id, { faseActual: fase, faseActualDesde: now, ...extra });
}

async function abrirFaseConAsignado(
  ctx: MutationCtx,
  ins: CustomerDoc,
  fase: FaseFila,
  now: number,
): Promise<{ rol: OnboardingRol | null; userId?: string; nombre?: string; email?: string }> {
  const asignado = await resolverAsignado(ctx, MODULO, ins, fase);
  await insertFase(ctx, ins, { fase, estado: "EN_PROGRESO", asignadoA: asignado.userId, fechaInicio: now });
  return asignado;
}

async function notificarRol(ctx: MutationCtx, ins: CustomerDoc, rol: OnboardingRol, tipo: string, datos: Record<string, unknown> = {}) {
  const config = await obtenerRolConfig(ctx, MODULO, ins.empresa, rol);
  if (!config?.email) return;
  await programarNotificacion(ctx, {
    modulo: MODULO,
    tipo,
    ins,
    destinatarios: [{ nombre: config.nombre, email: config.email }],
    datos: { ...datos, destinatarioTipo: "interno" },
  });
}

async function notificarTercero(ctx: MutationCtx, ins: CustomerDoc, tipo: string, datos: Record<string, unknown> = {}) {
  const dest = contactoTerceroDe(ins);
  if (!dest) return;
  await programarNotificacion(ctx, {
    modulo: MODULO,
    tipo,
    ins,
    destinatarios: [dest],
    datos: { ...datos, destinatarioTipo: "tercero" },
    conEnlaceTercero: true,
  });
}

async function enviarEnlaceFormulario(ctx: MutationCtx, ins: CustomerDoc, origen: Doc<"onboardingCorreos">["origen"], solicitadoPorUserId?: string) {
  const dest = contactoFormularioDe(ins);
  if (!dest) return null;
  return await programarCorreoRastreado(ctx, {
    modulo: MODULO,
    inscripcionId: ins._id,
    handoff: "FORM",
    tipoNotificacion: TIPOS_RASTREADOS.FORM,
    origen,
    destinatarioNombre: dest.nombre,
    destinatarioEmail: dest.email,
    solicitadoPorUserId,
  });
}

async function enviarEnlaceFirma(ctx: MutationCtx, ins: CustomerDoc, origen: Doc<"onboardingCorreos">["origen"], solicitadoPorUserId?: string) {
  const dest = contactoFirmaDe(ins);
  if (!dest) return null;
  return await programarCorreoRastreado(ctx, {
    modulo: MODULO,
    inscripcionId: ins._id,
    handoff: "SIGN",
    tipoNotificacion: TIPOS_RASTREADOS.SIGN,
    origen,
    destinatarioNombre: dest.nombre,
    destinatarioEmail: dest.email,
    solicitadoPorUserId,
  });
}

/** Fases con la Fase III derivada del estado de los documentos (como en el sistema original). */
async function fasesConDocumentos(ctx: QueryCtx | MutationCtx, inscripcionId: Id<"onboardingClientes">, now: number) {
  const fases = await listFasesIns(ctx, inscripcionId);
  const docs = await listDocsCliente(ctx, inscripcionId);
  const completada = revisionDocumentalCompleta(docs, now);
  return fases
    .slice()
    .sort((a, b) => (a.fechaInicio ?? a._creationTime) - (b.fechaInicio ?? b._creationTime))
    .map((fase) => {
      if (fase.fase !== "III_REVISION_DOCUMENTAL" || !completada.ok || fase.estado === "RECHAZADO" || fase.estado === "ANULADA") return fase;
      return {
        ...fase,
        estado: "COMPLETADO" as const,
        fechaCompletado: fase.fechaCompletado ?? completada.fecha,
        completadoPor: fase.completadoPor ?? completada.userId,
      };
    });
}

// ─── Inicio del proceso ──────────────────────────────────────────────────────

export const crearMatrizRiesgo = mutation({
  args: {
    empresa: v.number(),
    tipoSolicitud: v.optional(tipoSolicitudValidator),
    tipoSolicitudOrigen: v.optional(tipoSolicitudOrigenValidator),
    rutStorageId: v.optional(v.id("_storage")),
    cotizacionStorageId: v.optional(v.id("_storage")),
    tipoPersona: tipoPersonaValidator,
    tipoDocumento: tipoDocumentoValidator,
    numeroDocumento: v.string(),
    razonSocial: v.string(),
    direccion: v.string(),
    ciudad: v.string(),
    departamento: v.string(),
    celular: v.string(),
    email: v.string(),
    web: v.optional(v.string()),
    representanteLegalNombre: v.string(),
    representanteLegalTipoDocumento: tipoDocumentoValidator,
    representanteLegalNumeroDocumento: v.string(),
    representanteLegalEmail: v.string(),
    representanteLegalNacionalidad: v.string(),
    tesoreroNombre: v.optional(v.string()),
    tesoreroEmail: v.optional(v.string()),
    tesoreroTelefono: v.optional(v.string()),
    contadorNombre: v.optional(v.string()),
    contadorEmail: v.optional(v.string()),
    contadorTelefono: v.optional(v.string()),
    servicioSuministrado: v.string(),
    montoAnual: v.string(),
    sectorEconomico: v.string(),
    jurisdiccionNacional: v.string(),
    jurisdiccionInternacional: v.string(),
    isPep: v.boolean(),
    listas: v.string(),
    codigoCiiu: v.optional(v.string()),
    actividadEconomica: v.optional(v.string()),
    codigoCiiuSecundario: v.optional(v.string()),
    actividadEconomicaSecundaria: v.optional(v.string()),
    /** Documentos cargados por el comercial al iniciar (docKey → storageId). */
    documentosIniciales: v.optional(v.record(v.string(), v.id("_storage"))),
    formaPago: formaPagoClienteValidator,
    plazo: plazoPagoValidator,
  },
  returns: v.id("onboardingClientes"),
  handler: async (ctx, args) => {
    const actor = await requirePuedeCrear(ctx, MODULO, args.empresa);
    const email = args.email.trim().toLowerCase();
    if (!email.includes("@")) throw new Error("Indique un correo válido del cliente.");
    const rlEmail = args.representanteLegalEmail.trim().toLowerCase();
    if (!rlEmail.includes("@")) throw new Error("Indique un correo válido del representante legal.");
    const razonSocial = args.razonSocial.trim();
    if (!razonSocial) throw new Error("La razón social es requerida.");
    const numeroDocumento = args.numeroDocumento.trim();
    const NIT = normalizeNumeroDocumento(numeroDocumento);
    if (!NIT) throw new Error("El número de documento es requerido.");
    // Un solo proceso en curso por documento y empresa, aunque el actor no vea el otro.
    if (await procesoEnCursoPorDocumento(ctx, MODULO, args.empresa, numeroDocumento, args.tipoDocumento)) {
      throw new ConvexError({
        code: "PROCESO_EN_CURSO",
        message: "Ya hay un proceso en curso para este documento en esta empresa. Termínalo o anúlalo antes de iniciar otro.",
      });
    }
    assertCondicionesPagoCliente(args.formaPago, args.plazo);

    const { riesgo, tipoEvaluacion } = computeCustomerRisk({
      montoAnual: args.montoAnual,
      sectorEconomico: args.sectorEconomico,
      jurisdiccionNacional: args.jurisdiccionNacional,
      jurisdiccionInternacional: args.jurisdiccionInternacional,
      isPep: args.isPep,
      listas: args.listas,
    });
    if (riesgo === "INDEFINIDO" || tipoEvaluacion === "INDEFINIDO") {
      throw new Error("Debe completar los factores de riesgo antes de enviar el formulario al cliente.");
    }

    const documentos: Record<string, Id<"_storage">> = { ...(args.documentosIniciales ?? {}) };
    if (args.rutStorageId && !documentos.rutUltimoAnio) documentos.rutUltimoAnio = args.rutStorageId;

    const now = Date.now();
    const tipoSolicitud = args.tipoSolicitud ?? "INSCRIPCIÓN";
    const ciiuP = args.codigoCiiu?.trim();
    const ciiuS = args.codigoCiiuSecundario?.trim();
    const actS = args.actividadEconomicaSecundaria?.trim();

    const inscripcionId = await ctx.db.insert("onboardingClientes", {
      empresa: args.empresa,
      NIT,
      searchText: buildOnboardingSearchText({ NIT, razonSocial }),
      faseActual: "II_PENDIENTE_FORMULARIO",
      faseActualDesde: now,
      matriz_00: {
        responsableId: actor.usuarioId,
        rutStorageId: args.rutStorageId,
        cotizacionStorageId: args.cotizacionStorageId,
        servicioSuministrado: args.servicioSuministrado,
        montoAnual: args.montoAnual,
        sectorEconomico: args.sectorEconomico,
        jurisdiccionNacional: args.jurisdiccionNacional,
        jurisdiccionInternacional: args.jurisdiccionInternacional,
        isPep: args.isPep,
        listas: args.listas,
        riesgo,
      },
      datos_generales_01: {
        tipoSolicitud,
        ...(args.tipoSolicitudOrigen ? { tipoSolicitudOrigen: args.tipoSolicitudOrigen } : {}),
        tipoPersona: args.tipoPersona,
        tipoDocumento: args.tipoDocumento,
        numeroDocumento,
        razonSocial,
        direccion: args.direccion,
        ciudad: args.ciudad,
        departamento: args.departamento,
        celular: args.celular,
        email,
        web: args.web?.trim() || undefined,
        representanteLegalNombre: args.representanteLegalNombre.trim(),
        representanteLegalTipoDocumento: args.representanteLegalTipoDocumento,
        representanteLegalNumeroDocumento: args.representanteLegalNumeroDocumento.trim(),
        representanteLegalEmail: rlEmail,
        representanteLegalNacionalidad: args.representanteLegalNacionalidad,
        tesoreroNombre: args.tesoreroNombre,
        tesoreroEmail: args.tesoreroEmail,
        tesoreroTelefono: args.tesoreroTelefono,
        contadorNombre: args.contadorNombre,
        contadorEmail: args.contadorEmail,
        contadorTelefono: args.contadorTelefono,
      },
      ...(ciiuP || ciiuS || actS
        ? {
            actividadEconomica_02: {
              codigoCiiu: ciiuP ?? "",
              actividadEconomica: args.actividadEconomica?.trim() || undefined,
              codigoCiiuSecundario: ciiuS || undefined,
              actividadEconomicaSecundaria: actS || undefined,
            },
          }
        : {}),
      tipoEvaluacion,
      condicionesPago_12: { formaPago: args.formaPago, plazo: args.plazo },
      ...(Object.keys(documentos).length > 0 ? { documentos_09: documentos } : {}),
    });
    const ins = await requireIns(ctx, inscripcionId);

    await insertFase(ctx, ins, {
      fase: "I_ANALISIS_RIESGO",
      estado: "COMPLETADO",
      fechaInicio: now,
      fechaCompletado: now,
      completadoPor: actor.usuarioId,
      observaciones: "Riesgo calculado en el inicio comercial del proceso.",
      payload: { kind: "faseI", riesgo, tipoEvaluacion, tipoSolicitud, automatico: true, formaPago: args.formaPago, plazo: args.plazo, listas: args.listas },
    });
    await insertFase(ctx, ins, { fase: "II_PENDIENTE_FORMULARIO", estado: "PENDIENTE", fechaInicio: now });
    await enviarEnlaceFormulario(ctx, ins, "INICIAL", actor.usuarioId);
    return inscripcionId;
  },
});

// ─── Lecturas ────────────────────────────────────────────────────────────────

export const obtenerInscripcionesConUltimaFase = query({
  args: { empresa: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const { access } = await resolveOnboardingAccess(ctx, MODULO, args.empresa ?? null);
    let rows: CustomerDoc[];
    if (access.nivel === "responsable") {
      rows = await ctx.db
        .query("onboardingClientes")
        .withIndex("by_responsableId", (q) => q.eq("matriz_00.responsableId", access.usuarioId))
        .take(1000);
      rows = rows.filter((r) => (args.empresa === undefined ? true : r.empresa === args.empresa));
      if (access.empresasVisibles !== "todas") {
        const visibles = new Set(access.empresasVisibles);
        rows = rows.filter((r) => visibles.has(r.empresa));
      }
    } else if (args.empresa !== undefined) {
      rows = await ctx.db
        .query("onboardingClientes")
        .withIndex("by_empresa", (q) => q.eq("empresa", args.empresa!))
        .take(2000);
    } else if (access.empresasVisibles === "todas") {
      rows = await ctx.db.query("onboardingClientes").order("desc").take(2000);
    } else {
      rows = [];
      for (const empresa of access.empresasVisibles) {
        rows.push(
          ...(await ctx.db
            .query("onboardingClientes")
            .withIndex("by_empresa", (q) => q.eq("empresa", empresa))
            .take(1000)),
        );
      }
    }
    return {
      access: { nivel: access.nivel, isAdmin: access.isAdmin, usuarioId: access.usuarioId, roles: access.roles },
      puedeVerAdjuntos: access.nivel === "full" || access.nivel === "responsable",
      inscripciones: rows.map((ins) => ({
        ...ins,
        ultimaFaseInicio: ins.faseActualDesde ?? ins._creationTime,
        tipoSolicitud: ins.datos_generales_01.tipoSolicitud ?? "INSCRIPCIÓN",
      })),
    };
  },
});

export const obtenerInscripcionPorId = query({
  args: { inscripcionId: v.id("onboardingClientes") },
  handler: async (ctx, args) => {
    const ins = await ctx.db.get("onboardingClientes", args.inscripcionId);
    if (!ins) return null;
    await requireVer(ctx, ins);
    return ins;
  },
});

/**
 * Procesos de la empresa para un documento: alerta del modal "Iniciar proceso". Los procesos en
 * curso bloquean uno nuevo; los que el actor no puede ver llegan sin id ni razón social.
 */
export const obtenerProcesosPorDocumento = query({
  args: { empresa: v.number(), numeroDocumento: v.string(), tipoDocumento: v.optional(tipoDocumentoValidator) },
  handler: async (ctx, args) => {
    const { access } = await resolveOnboardingAccess(ctx, MODULO, args.empresa);
    const inscripciones = await inscripcionesPorDocumento(ctx, MODULO, args.empresa, args.numeroDocumento, args.tipoDocumento);
    return await resumirProcesos(ctx, access, inscripciones);
  },
});

/**
 * Detalle de una inscripción abierto sobre el modal "Iniciar proceso", con el mismo acceso que el
 * tablero. Devuelve null (en vez de lanzar) si no existe o el actor no puede verla.
 */
export const obtenerDetalleInscripcion = query({
  args: { inscripcionId: v.id("onboardingClientes") },
  handler: async (ctx, args) => {
    const ins = await ctx.db.get("onboardingClientes", args.inscripcionId);
    if (!ins) return null;
    let access: OnboardingAccess;
    try {
      ({ access } = await resolveOnboardingAccess(ctx, MODULO, ins.empresa));
    } catch {
      return null;
    }
    if (!puedeVerInscripcion(access, ins)) return null;
    return {
      access: { nivel: access.nivel, isAdmin: access.isAdmin, usuarioId: access.usuarioId, roles: access.roles },
      puedeVerAdjuntos: access.nivel === "full" || access.nivel === "responsable",
      inscripcion: {
        ...ins,
        ultimaFaseInicio: ins.faseActualDesde ?? ins._creationTime,
        tipoSolicitud: ins.datos_generales_01.tipoSolicitud ?? "INSCRIPCIÓN",
      },
    };
  },
});

export const obtenerFasesDeInscripcion = query({
  args: { inscripcionId: v.id("onboardingClientes"), ahora: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const ins = await requireIns(ctx, args.inscripcionId);
    await requireVer(ctx, ins);
    return await fasesConDocumentos(ctx, args.inscripcionId, args.ahora ?? ins.faseActualDesde ?? ins._creationTime);
  },
});

export const obtenerRevisionDocumentos = query({
  args: { inscripcionId: v.id("onboardingClientes") },
  handler: async (ctx, args) => {
    const ins = await requireIns(ctx, args.inscripcionId);
    await requireVer(ctx, ins);
    return await listDocsCliente(ctx, args.inscripcionId);
  },
});

/** Bandeja "Mis tareas": fases abiertas que atiende el actor por asignación o por rol (escalado por riesgo). */
export const obtenerMisTareas = query({
  args: {},
  handler: async (ctx) => {
    const { access } = await resolveOnboardingAccess(ctx, MODULO, null);
    if (access.roles.length === 0) return [];
    const rolesPorEmpresa = new Map<number, Set<OnboardingRol>>();
    for (const r of access.roles) {
      if (!rolesPorEmpresa.has(r.empresa)) rolesPorEmpresa.set(r.empresa, new Set());
      rolesPorEmpresa.get(r.empresa)!.add(r.rol);
    }

    const RIESGO_LOW = new Set(["BAJO", "MEDIO", "SOLO LISTAS", "SIMPLIFICADA"]);
    const RIESGO_MED = new Set(["ALTO", "COMPLETA"]);
    const RIESGO_HIGH = new Set(["SUPERIOR", "INTENSIFICADA"]);

    function puedeGestionar(fase: string, ins: CustomerDoc, roles: Set<OnboardingRol>): boolean {
      const hasLow = roles.has("CUMPLIMIENTO_LOW_RISK");
      const hasMed = roles.has("CUMPLIMIENTO_MEDIUM_RISK");
      const hasHigh = roles.has("CUMPLIMIENTO_HIGH_RISK");
      const hasCumplimiento = hasLow || hasMed || hasHigh;
      if (fase === "I_ANALISIS_RIESGO") return hasCumplimiento;
      if (fase === "III_REVISION_DOCUMENTAL") return hasLow;
      if (fase === "IIIA_APROBACION_CUMPLIMIENTO" && hasCumplimiento) {
        const riesgo = ins.tipoEvaluacion ?? ins.matriz_00.riesgo ?? "INDEFINIDO";
        if (hasLow && RIESGO_LOW.has(riesgo)) return true;
        if (hasMed && RIESGO_MED.has(riesgo)) return true;
        if (hasHigh && RIESGO_HIGH.has(riesgo)) return true;
        return false;
      }
      if (fase === "IV_CREACION_CONTABILIDAD") return roles.has("CONTABILIDAD");
      return false;
    }

    const porAsignacion = await ctx.db
      .query("onboardingClientesFases")
      .withIndex("by_asignadoA_estado", (q) => q.eq("asignadoA", access.usuarioId).eq("estado", "EN_PROGRESO"))
      .take(200);
    const candidatas = new Map<string, FaseRow>();
    for (const row of porAsignacion) candidatas.set(row._id, row);
    for (const [empresa, roles] of rolesPorEmpresa) {
      for (const rol of roles) {
        for (const fase of CUSTOMER_FASES_POR_ROL[rol as keyof typeof CUSTOMER_FASES_POR_ROL] ?? []) {
          const rows = await ctx.db
            .query("onboardingClientesFases")
            .withIndex("by_empresa_fase_estado", (q) => q.eq("empresa", empresa).eq("fase", fase as FaseFila).eq("estado", "EN_PROGRESO"))
            .take(200);
          for (const row of rows) candidatas.set(row._id, row);
        }
      }
    }

    const tareas: Array<FaseRow & { inscripcion: CustomerDoc }> = [];
    for (const fase of candidatas.values()) {
      const ins = await ctx.db.get("onboardingClientes", fase.inscripcionId);
      if (!ins) continue;
      const roles = rolesPorEmpresa.get(ins.empresa);
      if (!roles || roles.size === 0) continue;
      if (!puedeGestionar(fase.fase, ins, roles)) continue;
      tareas.push({ ...fase, inscripcion: ins });
    }
    return tareas.sort((a, b) => (a.fechaInicio ?? 0) - (b.fechaInicio ?? 0));
  },
});

/** Procesos terminados (COMPLETADO / RECHAZADO / ANULADA) con el detalle de tiempos por fase. */
export const obtenerReporteProcesos = query({
  args: { empresa: v.optional(v.number()), ahora: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const { access } = await resolveOnboardingAccess(ctx, MODULO, args.empresa ?? null);
    if (access.nivel !== "full") throw new Error("No autorizado para generar reportes del módulo.");
    const empresas = args.empresa !== undefined ? [args.empresa] : access.empresasVisibles === "todas" ? [1, 2, 3, 4] : access.empresasVisibles;
    const finales: CustomerDoc[] = [];
    for (const empresa of empresas) {
      for (const estado of ["COMPLETADO", "RECHAZADO", "ANULADA"] as const) {
        finales.push(
          ...(await ctx.db
            .query("onboardingClientes")
            .withIndex("by_empresa_faseActual", (q) => q.eq("empresa", empresa).eq("faseActual", estado))
            .take(1000)),
        );
      }
    }
    return await Promise.all(
      finales.map(async (ins) => {
        const fases = await fasesConDocumentos(ctx, ins._id, args.ahora ?? ins.faseActualDesde ?? ins._creationTime);
        const fasesDetalle = fases.map((f) => ({
          fase: f.fase,
          estado: f.estado,
          fechaInicio: f.fechaInicio ?? null,
          fechaCompletado: f.fechaCompletado ?? null,
          asignadoA: f.asignadoA ?? null,
          completadoPor: f.completadoPor ?? null,
          observaciones: f.observaciones ?? null,
        }));
        const fechaCierre = fasesDetalle.reduce<number | null>((acc, f) => {
          if (f.fechaCompletado == null) return acc;
          return acc == null ? f.fechaCompletado : Math.max(acc, f.fechaCompletado);
        }, null);
        return {
          inscripcionId: ins._id,
          empresa: ins.empresa,
          tipoSolicitud: ins.datos_generales_01.tipoSolicitud ?? "INSCRIPCIÓN",
          tipoPersona: ins.datos_generales_01.tipoPersona,
          tipoDocumento: ins.datos_generales_01.tipoDocumento,
          numeroDocumento: ins.datos_generales_01.numeroDocumento,
          razonSocial: ins.datos_generales_01.razonSocial,
          riesgo: ins.matriz_00.riesgo,
          tipoEvaluacion: ins.tipoEvaluacion,
          estadoFinal: ins.faseActual as "COMPLETADO" | "RECHAZADO" | "ANULADA",
          fechaCreacion: ins._creationTime,
          fechaCierre: fechaCierre ?? ins.anulacion?.fecha ?? ins.rechazadoCumplimiento?.fechaRechazo ?? null,
          fases: fasesDetalle,
        };
      }),
    );
  },
});

// ─── Fase I (solo alcanzable tras una devolución) ────────────────────────────

export const actualizarCamposFaseI = mutation({
  args: {
    inscripcionId: v.id("onboardingClientes"),
    representanteLegalNombre: v.optional(v.string()),
    email: v.optional(v.string()),
    celular: v.optional(v.string()),
    codigoCiiu: v.optional(v.string()),
    actividadEconomica: v.optional(v.string()),
    codigoCiiuSecundario: v.optional(v.string()),
    actividadEconomicaSecundaria: v.optional(v.string()),
    sectorEconomico: v.optional(v.string()),
    servicioSuministrado: v.optional(v.string()),
    montoAnual: v.optional(v.string()),
    jurisdiccionNacional: v.optional(v.string()),
    jurisdiccionInternacional: v.optional(v.string()),
    listas: v.optional(v.string()),
    isPep: v.optional(v.boolean()),
  },
  returns: v.object({ riesgo: riesgoNivelValidator, tipoEvaluacion: tipoEvaluacionValidator }),
  handler: async (ctx, args) => {
    const ins = await requireIns(ctx, args.inscripcionId);
    if (ins.faseActual !== "I_ANALISIS_RIESGO" && ins.faseActual !== "II_PENDIENTE_FORMULARIO") {
      throw new Error("La matriz solo puede editarse antes de que el cliente envíe el formulario.");
    }
    await requireGestionInscripcion(ctx, MODULO, ins);

    const datos = { ...ins.datos_generales_01 };
    if (args.representanteLegalNombre !== undefined) datos.representanteLegalNombre = args.representanteLegalNombre.trim();
    if (args.email !== undefined) datos.email = args.email.trim().toLowerCase();
    if (args.celular !== undefined) datos.celular = args.celular.trim();

    const prevA2 = ins.actividadEconomica_02;
    const actividad = {
      codigoCiiu: args.codigoCiiu !== undefined ? args.codigoCiiu.trim() : (prevA2?.codigoCiiu ?? ""),
      actividadEconomica: args.actividadEconomica !== undefined ? args.actividadEconomica.trim() || undefined : prevA2?.actividadEconomica,
      descripcionServicio: prevA2?.descripcionServicio,
      cuentasExtranjero: prevA2?.cuentasExtranjero,
      transaccionesVirtuales: prevA2?.transaccionesVirtuales,
      codigoCiiuSecundario: args.codigoCiiuSecundario !== undefined ? args.codigoCiiuSecundario.trim() || undefined : prevA2?.codigoCiiuSecundario,
      actividadEconomicaSecundaria:
        args.actividadEconomicaSecundaria !== undefined ? args.actividadEconomicaSecundaria.trim() || undefined : prevA2?.actividadEconomicaSecundaria,
    };

    const matriz = { ...ins.matriz_00 };
    for (const key of ["sectorEconomico", "servicioSuministrado", "montoAnual", "jurisdiccionNacional", "jurisdiccionInternacional", "listas"] as const) {
      const value = args[key];
      if (value !== undefined) matriz[key] = value;
    }
    if (args.isPep !== undefined) matriz.isPep = args.isPep;
    const { riesgo, tipoEvaluacion } = computeCustomerRisk(matriz);
    matriz.riesgo = riesgo;
    await ctx.db.patch("onboardingClientes", ins._id, {
      datos_generales_01: datos,
      actividadEconomica_02: actividad,
      matriz_00: matriz,
      tipoEvaluacion,
    });
    return { riesgo, tipoEvaluacion };
  },
});

export const completarFaseI = mutation({
  args: {
    inscripcionId: v.id("onboardingClientes"),
    observaciones: v.optional(v.string()),
    listas: v.optional(v.string()),
    riesgoFinal: v.optional(riesgoNivelValidator),
    tipoEvaluacion: v.optional(tipoEvaluacionValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ins = await requireIns(ctx, args.inscripcionId);
    if (ins.faseActual !== "I_ANALISIS_RIESGO") throw new Error(`La inscripción no está en Fase I (está en ${ins.faseActual}).`);
    const actor = await requireActorEnFase(ctx, MODULO, ins, "I_ANALISIS_RIESGO");

    const matriz = { ...ins.matriz_00 };
    if (args.listas !== undefined) matriz.listas = args.listas;
    if (args.riesgoFinal !== undefined && args.riesgoFinal !== "INDEFINIDO") matriz.riesgo = args.riesgoFinal;
    const tipoEvaluacion = args.tipoEvaluacion && args.tipoEvaluacion !== "INDEFINIDO" ? args.tipoEvaluacion : ins.tipoEvaluacion;
    if (tipoEvaluacion === "INDEFINIDO" || matriz.riesgo === "INDEFINIDO") {
      throw new Error("Defina el riesgo y el tipo de evaluación antes de continuar.");
    }
    const now = Date.now();
    await setFaseActual(ctx, ins, "II_PENDIENTE_FORMULARIO", now, { matriz_00: matriz, tipoEvaluacion });
    const faseI = await getFase(ctx, ins._id, "I_ANALISIS_RIESGO");
    if (faseI) {
      await ctx.db.patch("onboardingClientesFases", faseI._id, {
        estado: "COMPLETADO",
        fechaCompletado: now,
        completadoPor: actor.usuarioId,
        observaciones: args.observaciones?.trim() || undefined,
        payload: {
          kind: "faseI",
          riesgo: matriz.riesgo,
          tipoEvaluacion,
          tipoSolicitud: ins.datos_generales_01.tipoSolicitud,
          automatico: false,
          formaPago: ins.condicionesPago_12?.formaPago,
          plazo: ins.condicionesPago_12?.plazo,
          listas: matriz.listas,
        },
      });
    }
    await insertFase(ctx, ins, { fase: "II_PENDIENTE_FORMULARIO", estado: "PENDIENTE", fechaInicio: now });
    const actualizado = await requireIns(ctx, ins._id);
    await enviarEnlaceFormulario(ctx, actualizado, "AUTOMATICO", actor.usuarioId);
    return null;
  },
});

// ─── Fase III: revisión documental (un carril: Cumplimiento) ─────────────────

/** Aprueba o rechaza un documento; con todos aprobados abre la Fase IIIA asignada por nivel de riesgo. */
export const revisarDocumento = mutation({
  args: {
    inscripcionId: v.id("onboardingClientes"),
    docKey: v.string(),
    decision: decisionValidator,
    observaciones: v.optional(v.string()),
  },
  returns: v.object({ faseActual: v.string(), faseIIIAAbierta: v.boolean() }),
  handler: async (ctx, args) => {
    const ins = await requireIns(ctx, args.inscripcionId);
    if (ins.faseActual !== "III_REVISION_DOCUMENTAL") throw new Error("La inscripción no está en Fase III.");
    const revDoc = await getDocCliente(ctx, ins._id, args.docKey);
    if (!revDoc) throw new Error(`Documento '${args.docKey}' no encontrado.`);
    if (revDoc.estado !== "EN_REVISION" && revDoc.estado !== "APROBADO" && revDoc.estado !== "RECHAZADO") {
      throw new Error("El documento aún no ha sido cargado por el cliente.");
    }
    const actor = await requireActorEnFase(ctx, MODULO, ins, "III_REVISION_DOCUMENTAL");
    const observaciones = args.observaciones?.trim() || undefined;
    if (args.decision === "RECHAZADO" && !observaciones) throw new Error("Indique el motivo del rechazo del documento.");

    const now = Date.now();
    await ctx.db.patch("onboardingClientesDocumentos", revDoc._id, {
      estado: args.decision,
      revisadoPor: actor.usuarioId,
      fechaRevision: now,
      observaciones,
      historial: [...(revDoc.historial ?? []), { accion: args.decision, fecha: now, userId: actor.usuarioId, nota: observaciones }],
    });
    if (args.decision === "RECHAZADO") {
      await notificarTercero(ctx, ins, "DOC_RECHAZADO", { docLabel: revDoc.docLabel, observaciones });
    }

    const docs = await listDocsCliente(ctx, ins._id);
    const completada = revisionDocumentalCompleta(docs, now);
    let faseIIIAAbierta = false;
    if (completada.ok) {
      const faseIII = await getFase(ctx, ins._id, "III_REVISION_DOCUMENTAL");
      if (faseIII && faseIII.estado !== "COMPLETADO") {
        await ctx.db.patch("onboardingClientesFases", faseIII._id, { estado: "COMPLETADO", fechaCompletado: completada.fecha, completadoPor: completada.userId });
      }
      const faseIIIA = await getFase(ctx, ins._id, "IIIA_APROBACION_CUMPLIMIENTO");
      if (!faseIIIA || faseIIIA.estado === "COMPLETADO" || faseIIIA.estado === "RECHAZADO" || faseIIIA.estado === "ANULADA") {
        await setFaseActual(ctx, ins, "IIIA_APROBACION_CUMPLIMIENTO", now);
        const actualizado = await requireIns(ctx, ins._id);
        const asignado = await abrirFaseConAsignado(ctx, actualizado, "IIIA_APROBACION_CUMPLIMIENTO", now);
        faseIIIAAbierta = true;
        if (asignado.rol) await notificarRol(ctx, actualizado, asignado.rol, "APROBACION_CUMPLIMIENTO_ASIGNADA");
      }
    }
    const final = await requireIns(ctx, ins._id);
    return { faseActual: final.faseActual, faseIIIAAbierta };
  },
});

/** Cumplimiento ajusta PEP/listas durante la revisión documental (solo puede subir el riesgo). */
export const ajustarRiesgoCumplimientoDocumental = mutation({
  args: {
    inscripcionId: v.id("onboardingClientes"),
    isPep: v.boolean(),
    listas: listasValidator,
    observacion: v.string(),
  },
  returns: v.object({
    riesgoAnterior: v.string(),
    riesgoNuevo: v.string(),
    tipoEvaluacionAnterior: v.string(),
    tipoEvaluacionNuevo: v.string(),
    docsAgregados: v.array(v.object({ docKey: v.string(), docLabel: v.string() })),
  }),
  handler: async (ctx, args) => {
    const ins = await requireIns(ctx, args.inscripcionId);
    if (ins.faseActual !== "III_REVISION_DOCUMENTAL") throw new Error("La inscripción no está en Fase III.");
    const { actor } = await resolveOnboardingAccess(ctx, MODULO, ins.empresa);
    const esCumplimiento = await actorTieneRol(ctx, MODULO, actor, ins.empresa, ["CUMPLIMIENTO_LOW_RISK", "CUMPLIMIENTO_MEDIUM_RISK", "CUMPLIMIENTO_HIGH_RISK"]);
    if (!esCumplimiento) throw new Error("Solo Cumplimiento puede ajustar PEP y listas.");

    const observacion = args.observacion.trim();
    if (!observacion) throw new Error("Debes registrar una observación para ajustar PEP o listas.");
    const matriz = ins.matriz_00;
    const pepAnterior = matriz.isPep;
    const listasAnterior = matriz.listas;
    const riesgoAnterior = matriz.riesgo;
    const tipoEvaluacionAnterior = ins.tipoEvaluacion;
    if (pepAnterior === args.isPep && listasAnterior === args.listas) throw new Error("No hay cambios en PEP o listas para registrar.");
    const recalculado = computeCustomerRisk({ ...matriz, isPep: args.isPep, listas: args.listas });
    if (RIESGO_SCORE[recalculado.riesgo] < RIESGO_SCORE[toRiesgoNivel(riesgoAnterior)]) {
      throw new Error("Este ajuste solo está permitido cuando aumenta o mantiene el riesgo.");
    }

    const now = Date.now();
    await ctx.db.patch("onboardingClientes", ins._id, {
      matriz_00: { ...matriz, isPep: args.isPep, listas: args.listas, riesgo: recalculado.riesgo },
      tipoEvaluacion: recalculado.tipoEvaluacion,
    });
    const actualizado = await requireIns(ctx, ins._id);
    const docsAgregados = await materializarDocumentosCliente(ctx, actualizado, {
      accion: "AGREGADO_POR_AJUSTE_RIESGO",
      userId: actor.usuarioId,
      nota: observacion,
      now,
      soloNuevos: true,
    });
    await ctx.db.patch("onboardingClientes", ins._id, {
      ajustesRiesgoCumplimiento: [
        ...(ins.ajustesRiesgoCumplimiento ?? []),
        {
          fecha: now,
          ajustadoPorUserId: actor.usuarioId,
          observacion,
          pepAnterior,
          pepNuevo: args.isPep,
          listasAnterior,
          listasNuevo: args.listas,
          riesgoAnterior,
          riesgoNuevo: recalculado.riesgo,
          tipoEvaluacionAnterior,
          tipoEvaluacionNuevo: recalculado.tipoEvaluacion,
          docsAgregados,
        },
      ],
    });
    if (docsAgregados.length > 0) {
      const faseIII = await getFase(ctx, ins._id, "III_REVISION_DOCUMENTAL");
      if (faseIII?.estado === "COMPLETADO") {
        await ctx.db.patch("onboardingClientesFases", faseIII._id, { estado: "EN_PROGRESO", fechaCompletado: undefined, completadoPor: undefined, observaciones: undefined });
      }
      await notificarTercero(ctx, actualizado, "EVALUACION_CUMPLIMIENTO_CAMBIADA", { observaciones: docsAgregados.map((d) => d.docLabel).join(", ") });
    }
    return {
      riesgoAnterior,
      riesgoNuevo: recalculado.riesgo,
      tipoEvaluacionAnterior,
      tipoEvaluacionNuevo: recalculado.tipoEvaluacion,
      docsAgregados,
    };
  },
});

/** El responsable reemplaza un documento rechazado en nombre del cliente. */
export const cargarDocumentoRevisionInterno = mutation({
  args: { inscripcionId: v.id("onboardingClientes"), docKey: v.string(), storageId: v.id("_storage") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ins = await requireIns(ctx, args.inscripcionId);
    if (ins.faseActual !== "III_REVISION_DOCUMENTAL") throw new Error("Solo se pueden cargar documentos durante la revisión documental.");
    const actor = await requireResponsable(ctx, MODULO, ins);
    const existente = await getDocCliente(ctx, ins._id, args.docKey);
    if (!existente) throw new Error("Documento no encontrado.");
    if (existente.estado !== "RECHAZADO") throw new Error("Solo se pueden reemplazar documentos rechazados.");
    const now = Date.now();
    await ctx.db.patch("onboardingClientesDocumentos", existente._id, {
      storageId: args.storageId,
      estado: "EN_REVISION",
      revisadoPor: undefined,
      fechaRevision: undefined,
      observaciones: undefined,
      historial: [...(existente.historial ?? []), { accion: "CARGADO_POR_RESPONSABLE", fecha: now, userId: actor.usuarioId }],
    });
    await ctx.db.patch("onboardingClientes", ins._id, { documentos_09: { ...(ins.documentos_09 ?? {}), [args.docKey]: args.storageId } });
    return null;
  },
});

// ─── Fases IIIA y IV ─────────────────────────────────────────────────────────

export const completarFaseIIIA = mutation({
  args: {
    inscripcionId: v.id("onboardingClientes"),
    decision: decisionValidator,
    observaciones: v.optional(v.string()),
    motivoRechazo: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ins = await requireIns(ctx, args.inscripcionId);
    if (ins.faseActual !== "IIIA_APROBACION_CUMPLIMIENTO") throw new Error("La inscripción no está en Fase IIIA.");
    const actor = await requireActorEnFase(ctx, MODULO, ins, "IIIA_APROBACION_CUMPLIMIENTO");
    const now = Date.now();
    const observaciones = (args.decision === "APROBADO" ? args.observaciones : args.motivoRechazo)?.trim() || undefined;
    if (args.decision === "RECHAZADO" && !observaciones) throw new Error("Debe registrar un motivo de rechazo.");

    const faseIIIA = await getFase(ctx, ins._id, "IIIA_APROBACION_CUMPLIMIENTO");
    if (faseIIIA) {
      await ctx.db.patch("onboardingClientesFases", faseIIIA._id, {
        estado: args.decision === "APROBADO" ? "COMPLETADO" : "RECHAZADO",
        fechaCompletado: now,
        completadoPor: actor.usuarioId,
        observaciones,
        payload: { kind: "decision", decision: args.decision, motivoRechazo: args.motivoRechazo?.trim() || undefined, observaciones, completadoPorNombre: actor.nombre },
      });
    }
    if (args.decision === "APROBADO") {
      await setFaseActual(ctx, ins, "IV_CREACION_CONTABILIDAD", now);
      const actualizado = await requireIns(ctx, ins._id);
      await abrirFaseConAsignado(ctx, actualizado, "IV_CREACION_CONTABILIDAD", now);
    } else {
      await setFaseActual(ctx, ins, "RECHAZADO", now, {
        rechazadoCumplimiento: { motivoExterno: observaciones ?? "", motivoInterno: observaciones ?? "", fechaRechazo: now, rechazadoPorUserId: actor.usuarioId },
      });
    }
    return null;
  },
});

/** Rechazo de Cumplimiento con motivo visible al cliente y motivo interno. */
export const rechazarCumplimiento = mutation({
  args: { inscripcionId: v.id("onboardingClientes"), motivoCliente: v.string(), motivoInterno: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ins = await requireIns(ctx, args.inscripcionId);
    if (ins.faseActual !== "IIIA_APROBACION_CUMPLIMIENTO") throw new Error("La inscripción no está en Fase IIIA.");
    const actor = await requireActorEnFase(ctx, MODULO, ins, "IIIA_APROBACION_CUMPLIMIENTO");
    const motivoExterno = args.motivoCliente.trim();
    const motivoInterno = args.motivoInterno.trim();
    if (!motivoExterno || !motivoInterno) throw new Error("Indique el motivo para el cliente y el motivo interno.");
    const now = Date.now();
    await setFaseActual(ctx, ins, "RECHAZADO", now, {
      rechazadoCumplimiento: { motivoExterno, motivoInterno, fechaRechazo: now, rechazadoPorUserId: actor.usuarioId },
    });
    const faseIIIA = await getFase(ctx, ins._id, "IIIA_APROBACION_CUMPLIMIENTO");
    if (faseIIIA) {
      await ctx.db.patch("onboardingClientesFases", faseIIIA._id, {
        estado: "RECHAZADO",
        fechaCompletado: now,
        completadoPor: actor.usuarioId,
        observaciones: motivoInterno,
        payload: { kind: "rechazo", motivoExterno, motivoInterno },
      });
    }
    return null;
  },
});

export const completarFaseIV = mutation({
  args: { inscripcionId: v.id("onboardingClientes"), notasContabilidad: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ins = await requireIns(ctx, args.inscripcionId);
    if (ins.faseActual !== "IV_CREACION_CONTABILIDAD") throw new Error("La inscripción no está en Fase IV.");
    const actor = await requireActorEnFase(ctx, MODULO, ins, "IV_CREACION_CONTABILIDAD");
    const now = Date.now();
    const notas = args.notasContabilidad?.trim().slice(0, 8000) || undefined;
    const faseIV = await getFase(ctx, ins._id, "IV_CREACION_CONTABILIDAD");
    if (faseIV) {
      await ctx.db.patch("onboardingClientesFases", faseIV._id, { estado: "COMPLETADO", fechaCompletado: now, completadoPor: actor.usuarioId, observaciones: notas });
    }
    await setFaseActual(ctx, ins, "COMPLETADO", now, { notasContabilidadFaseIV: notas });
    return null;
  },
});

// ─── Anulación y devolución ──────────────────────────────────────────────────

export const anularProceso = mutation({
  args: { inscripcionId: v.id("onboardingClientes"), motivo: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ins = await requireIns(ctx, args.inscripcionId);
    if (ins.faseActual === "ANULADA") throw new Error("Esta inscripción ya está anulada.");
    const actor = await requireGestionInscripcion(ctx, MODULO, ins);
    const motivo = args.motivo.trim();
    if (!motivo) throw new Error("Indique la razón de la anulación.");
    const now = Date.now();
    await setFaseActual(ctx, ins, "ANULADA", now, { anulacion: { porUserId: actor.usuarioId, fecha: now, motivo } });
    for (const fase of await listFasesIns(ctx, ins._id)) {
      if (fase.estado === "EN_PROGRESO" || fase.estado === "PENDIENTE") {
        await ctx.db.patch("onboardingClientesFases", fase._id, { estado: "ANULADA", fechaCompletado: now, completadoPor: actor.usuarioId, observaciones: `Proceso anulado: ${motivo}` });
      }
    }
    await revokeTokens(ctx, { modulo: MODULO, inscripcionId: ins._id, reason: "MANUAL" });
    return null;
  },
});

/**
 * Devuelve el proceso a una fase anterior: borra las filas posteriores, reabre la fase,
 * deshace efectos colaterales (firma, revisiones, rechazo, notas), revoca enlaces y
 * reenvía la invitación que corresponda.
 */
export const devolverFase = mutation({
  args: { faseId: v.id("onboardingClientesFases"), motivo: v.string() },
  returns: v.object({ inscripcionId: v.id("onboardingClientes"), faseDestino: customerFaseFilaValidator }),
  handler: async (ctx, args) => {
    const fase = await ctx.db.get("onboardingClientesFases", args.faseId);
    if (!fase) throw new Error("Fase no encontrada.");
    if (fase.estado === "EN_PROGRESO") throw new Error("La fase ya está en progreso.");
    const ins = await requireIns(ctx, fase.inscripcionId);
    if (ins.faseActual === "ANULADA") throw new Error("No se puede devolver una inscripción anulada.");
    const actor = await requireGestionInscripcion(ctx, MODULO, ins);
    const motivo = args.motivo.trim();
    if (!motivo) throw new Error("Debes registrar una razón para devolver el proceso a esta fase.");
    if (ins.faseActual === "COMPLETADO" || ins.faseActual === "RECHAZADO") {
      const d = ins.datos_generales_01;
      if (await procesoEnCursoPorDocumento(ctx, MODULO, ins.empresa, d.numeroDocumento, d.tipoDocumento, ins._id)) {
        throw new ConvexError({
          code: "PROCESO_EN_CURSO",
          message: "No se puede reabrir: ya hay otro proceso en curso para este documento en esta empresa.",
        });
      }
    }

    const todas = (await listFasesIns(ctx, ins._id)).sort((a, b) => (a.fechaInicio ?? 0) - (b.fechaInicio ?? 0));
    const idx = todas.findIndex((f) => f._id === args.faseId);
    if (idx === -1) throw new Error("No se encontró la fase en el historial del proceso.");
    const now = Date.now();
    const posteriores = todas.slice(idx + 1).map((f) => f.fase);
    for (let i = idx + 1; i < todas.length; i++) await ctx.db.delete("onboardingClientesFases", todas[i]._id);
    await ctx.db.patch("onboardingClientesFases", args.faseId, {
      estado: fase.fase === "II_PENDIENTE_FORMULARIO" ? "PENDIENTE" : "EN_PROGRESO",
      fechaCompletado: undefined,
      completadoPor: undefined,
      observaciones: undefined,
      payload: undefined,
    });

    const seAnulaFirma = fase.fase === "IIA_PENDIENTE_FIRMA" || posteriores.includes("IIA_PENDIENTE_FIRMA");
    const seAnulaRevision = fase.fase === "III_REVISION_DOCUMENTAL" || posteriores.includes("III_REVISION_DOCUMENTAL");
    const seTocaFaseIV = fase.fase === "IV_CREACION_CONTABILIDAD" || posteriores.includes("IV_CREACION_CONTABILIDAD");
    const patch: Partial<CustomerDoc> = {
      devolucionesFase: [...(ins.devolucionesFase ?? []), { faseOrigen: ins.faseActual, faseDestino: fase.fase, motivo, devueltoPorUserId: actor.usuarioId, fecha: now }],
      rechazadoCumplimiento: undefined,
    };
    if (seAnulaFirma || fase.fase === "I_ANALISIS_RIESGO" || fase.fase === "II_PENDIENTE_FORMULARIO") {
      patch.firmaRepresentante_10 = undefined;
      patch.firmadoEn = undefined;
    }
    if (seTocaFaseIV) patch.notasContabilidadFaseIV = undefined;
    await setFaseActual(ctx, ins, fase.fase, now, patch);

    if (seAnulaRevision) {
      for (const doc of await listDocsCliente(ctx, ins._id)) {
        const nuevoEstado = doc.storageId ? "EN_REVISION" : "PENDIENTE";
        if (doc.estado !== nuevoEstado || doc.revisadoPor || doc.fechaRevision || doc.observaciones) {
          await ctx.db.patch("onboardingClientesDocumentos", doc._id, {
            estado: nuevoEstado,
            revisadoPor: undefined,
            fechaRevision: undefined,
            observaciones: undefined,
            historial: [...(doc.historial ?? []), { accion: "DEVUELTO_A_REVISION", fecha: now, userId: actor.usuarioId, nota: motivo }],
          });
        }
      }
    }

    await revokeTokens(ctx, { modulo: MODULO, inscripcionId: ins._id, scope: "SIGN", reason: "PHASE_RESTORED" });
    const actualizado = await requireIns(ctx, ins._id);
    if (fase.fase === "II_PENDIENTE_FORMULARIO" || fase.fase === "I_ANALISIS_RIESGO") {
      await revokeTokens(ctx, { modulo: MODULO, inscripcionId: ins._id, scope: "FORM", reason: "PHASE_RESTORED" });
      if (fase.fase === "II_PENDIENTE_FORMULARIO") await enviarEnlaceFormulario(ctx, actualizado, "RESTAURACION_FASE", actor.usuarioId);
    } else if (fase.fase === "IIA_PENDIENTE_FIRMA") {
      await enviarEnlaceFirma(ctx, actualizado, "RESTAURACION_FASE", actor.usuarioId);
    } else if (fase.fase === "IIIA_APROBACION_CUMPLIMIENTO") {
      const asignado = await resolverAsignado(ctx, MODULO, actualizado, fase.fase);
      if (asignado.userId && fase.asignadoA !== asignado.userId) await ctx.db.patch("onboardingClientesFases", args.faseId, { asignadoA: asignado.userId });
      if (asignado.rol) await notificarRol(ctx, actualizado, asignado.rol, "APROBACION_CUMPLIMIENTO_ASIGNADA");
    }
    return { inscripcionId: ins._id, faseDestino: fase.fase };
  },
});

/** Rol de Cumplimiento que aprueba la Fase IIIA de una inscripción. */
export function rolAprobacionFaseIIIA(ins: Pick<CustomerDoc, "tipoEvaluacion">): OnboardingRol {
  return rolCumplimientoPorRiesgo(ins.tipoEvaluacion);
}
