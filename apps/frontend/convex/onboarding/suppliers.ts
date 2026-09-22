// Inscripción de PROVEEDORES — funciones internas (identidad WorkOS).
// El actor se deriva siempre de la identidad; ningún id de usuario viene del cliente.
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "../_generated/server";
import { supplierDocLabel, supplierDocRevisorRol } from "../../lib/onboarding/documents/suppliers";
import { SUPPLIER_FASES_POR_ROL } from "../../lib/onboarding/phases/suppliers";
import { rolCumplimientoPorRiesgo, toRiesgoNivel } from "../../lib/onboarding/risk/compute";
import { RIESGO_SCORE } from "../../lib/onboarding/risk/shared";
import { computeSupplierRisk } from "../../lib/onboarding/risk/supplier-matrix";
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
import { programarNotificacion } from "../lib/onboarding/notificar";
import { obtenerRolConfig, resolverAsignado, type OnboardingRol } from "../lib/onboarding/phases";
import { contactoFirmaDe, contactoFormularioDe, contactoTerceroDe, normalizeNumeroDocumento } from "../lib/onboarding/refs";
import {
  FASE_LANE_POR_GRUPO,
  getCompletadoDocumentalPorFase,
  getCompletadosRevisionDocumental,
  getDocProveedor,
  grupoDeDocumento,
  listDocsProveedor,
  materializarDocumentosProveedor,
  storageCargadoDe,
} from "../lib/onboarding/suppliersDocs";
import { revokeTokens } from "../lib/onboarding/tokens";
import {
  decisionValidator,
  listasValidator,
  riesgoNivelValidator,
  supplierFaseFilaValidator,
  tipoDocumentoValidator,
  tipoEvaluacionValidator,
  tipoPersonaValidator,
  tipoSolicitudValidator,
} from "./validators";

type SupplierDoc = Doc<"onboardingProveedores">;
type FaseRow = Doc<"onboardingProveedoresFases">;
type FaseFila = FaseRow["fase"];
type FaseActual = SupplierDoc["faseActual"];
type FasePayload = NonNullable<FaseRow["payload"]>;

const MODULO = "supplier" as const;
const FASES_III: ReadonlySet<string> = new Set(["III_REVISION_DOCUMENTAL"]);

// ─── Helpers de fase ─────────────────────────────────────────────────────────

async function requireIns(ctx: QueryCtx | MutationCtx, id: Id<"onboardingProveedores">): Promise<SupplierDoc> {
  const ins = await ctx.db.get("onboardingProveedores", id);
  if (!ins) throw new Error("Inscripción no encontrada.");
  return ins;
}

async function requireVer(ctx: QueryCtx | MutationCtx, ins: SupplierDoc): Promise<OnboardingAccess> {
  const { access } = await resolveOnboardingAccess(ctx, MODULO, ins.empresa);
  if (!puedeVerInscripcion(access, ins)) throw new Error("No autorizado para ver esta inscripción.");
  return access;
}

async function getFase(ctx: QueryCtx | MutationCtx, inscripcionId: Id<"onboardingProveedores">, fase: FaseFila) {
  return await ctx.db
    .query("onboardingProveedoresFases")
    .withIndex("by_inscripcionId_fase", (q) => q.eq("inscripcionId", inscripcionId).eq("fase", fase))
    .order("desc")
    .first();
}

async function listFasesIns(ctx: QueryCtx | MutationCtx, inscripcionId: Id<"onboardingProveedores">): Promise<FaseRow[]> {
  return await ctx.db
    .query("onboardingProveedoresFases")
    .withIndex("by_inscripcionId", (q) => q.eq("inscripcionId", inscripcionId))
    .take(100);
}

async function insertFase(
  ctx: MutationCtx,
  ins: SupplierDoc,
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
  return await ctx.db.insert("onboardingProveedoresFases", { inscripcionId: ins._id, empresa: ins.empresa, ...data });
}

async function setFaseActual(
  ctx: MutationCtx,
  ins: SupplierDoc,
  fase: FaseActual,
  now: number,
  extra: Partial<SupplierDoc> = {},
) {
  await ctx.db.patch("onboardingProveedores", ins._id, { faseActual: fase, faseActualDesde: now, ...extra });
}

/** Fases con el estado derivado de los carriles documentales (como en el sistema original). */
async function fasesConCarriles(ctx: QueryCtx | MutationCtx, inscripcionId: Id<"onboardingProveedores">, now: number) {
  const fases = await listFasesIns(ctx, inscripcionId);
  const docs = await listDocsProveedor(ctx, inscripcionId);
  const completados = getCompletadosRevisionDocumental(docs, now);
  return fases
    .slice()
    .sort((a, b) => (a.fechaInicio ?? a._creationTime) - (b.fechaInicio ?? b._creationTime))
    .map((fase) => {
      const completado = getCompletadoDocumentalPorFase(fase.fase, completados);
      if (!completado || fase.estado === "RECHAZADO" || fase.estado === "ANULADA") return fase;
      return {
        ...fase,
        estado: "COMPLETADO" as const,
        fechaCompletado: fase.fechaCompletado ?? completado.fecha,
        completadoPor: fase.completadoPor ?? completado.userId,
      };
    });
}

async function abrirFaseConAsignado(
  ctx: MutationCtx,
  ins: SupplierDoc,
  fase: FaseFila,
  now: number,
): Promise<{ rol: OnboardingRol | null; userId?: string; nombre?: string; email?: string }> {
  const asignado = await resolverAsignado(ctx, MODULO, ins, fase);
  await insertFase(ctx, ins, { fase, estado: "EN_PROGRESO", asignadoA: asignado.userId, fechaInicio: now });
  return asignado;
}

async function notificarRol(
  ctx: MutationCtx,
  ins: SupplierDoc,
  rol: OnboardingRol,
  tipo: string,
  datos: Record<string, unknown> = {},
) {
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

async function notificarTercero(ctx: MutationCtx, ins: SupplierDoc, tipo: string, datos: Record<string, unknown> = {}) {
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

/** Envía el enlace al formulario (rastreado). */
async function enviarEnlaceFormulario(
  ctx: MutationCtx,
  ins: SupplierDoc,
  origen: Doc<"onboardingCorreos">["origen"],
  solicitadoPorUserId?: string,
) {
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

/** Envía el enlace de firma al representante legal (rastreado). */
async function enviarEnlaceFirma(
  ctx: MutationCtx,
  ins: SupplierDoc,
  origen: Doc<"onboardingCorreos">["origen"],
  solicitadoPorUserId?: string,
) {
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

// ─── Inicio del proceso ──────────────────────────────────────────────────────

export const crearMatrizRiesgo = mutation({
  args: {
    tipoSolicitud: v.optional(tipoSolicitudValidator),
    empresa: v.number(),
    tipoPersona: tipoPersonaValidator,
    tipoDocumento: tipoDocumentoValidator,
    numeroDocumento: v.string(),
    razonSocial: v.string(),
    contactoNombre: v.string(),
    contactoEmail: v.string(),
    contactoCelular: v.string(),
    servicioSuministrado: v.string(),
    montoAnual: v.string(),
    codigoCiiu: v.string(),
    actividadEconomicaPrincipal: v.string(),
    codigoCiiuSecundario: v.string(),
    actividadEconomicaSecundaria: v.string(),
    sectorEconomico: v.string(),
    jurisdiccionNacional: v.string(),
    jurisdiccionInternacional: v.string(),
    isPep: v.boolean(),
    listas: v.string(),
    rutStorageId: v.optional(v.id("_storage")),
    direccion: v.optional(v.string()),
    ciudad: v.optional(v.string()),
    departamento: v.optional(v.string()),
    representanteLegalNombre: v.optional(v.string()),
    representanteLegalEmail: v.optional(v.string()),
    tipoProveedor: v.optional(v.string()),
  },
  returns: v.id("onboardingProveedores"),
  handler: async (ctx, args) => {
    const actor = await requirePuedeCrear(ctx, MODULO, args.empresa);
    const contactoEmail = args.contactoEmail.trim().toLowerCase();
    if (!contactoEmail.includes("@")) throw new Error("Indique un correo de contacto válido.");
    const razonSocial = args.razonSocial.trim();
    if (!razonSocial) throw new Error("La razón social es requerida.");
    const numeroDocumento = args.numeroDocumento.trim();
    const NIT = normalizeNumeroDocumento(numeroDocumento);
    if (!NIT) throw new Error("El número de documento es requerido.");

    const { riesgo, tipoEvaluacion } = computeSupplierRisk({
      montoAnual: args.montoAnual,
      sectorEconomico: args.sectorEconomico,
      jurisdiccionNacional: args.jurisdiccionNacional,
      jurisdiccionInternacional: args.jurisdiccionInternacional,
      isPep: args.isPep,
      listas: args.listas,
    });
    if (riesgo === "INDEFINIDO" || tipoEvaluacion === "INDEFINIDO") {
      throw new Error("Debe completar los factores de riesgo antes de iniciar el proceso.");
    }

    const now = Date.now();
    const tipoSolicitud = args.tipoSolicitud ?? "INSCRIPCIÓN";
    const inscripcionId = await ctx.db.insert("onboardingProveedores", {
      empresa: args.empresa,
      NIT,
      searchText: buildOnboardingSearchText({ NIT, razonSocial }),
      tipoProveedor: args.tipoProveedor?.trim() || "GENERAL",
      faseActual: "II_PENDIENTE_FORMULARIO",
      faseActualDesde: now,
      matriz_00: {
        responsableId: actor.usuarioId,
        rutStorageId: args.rutStorageId,
        servicioSuministrado: args.servicioSuministrado,
        montoAnual: args.montoAnual,
        actividadEconomicaPrincipal: args.actividadEconomicaPrincipal,
        codigoCiiuSecundario: args.codigoCiiuSecundario,
        actividadEconomicaSecundaria: args.actividadEconomicaSecundaria,
        sectorEconomico: args.sectorEconomico,
        jurisdiccionNacional: args.jurisdiccionNacional,
        jurisdiccionInternacional: args.jurisdiccionInternacional,
        isPep: args.isPep,
        listas: args.listas,
        riesgo,
      },
      datos_generales_01: {
        tipoSolicitud,
        tipoPersona: args.tipoPersona,
        tipoDocumento: args.tipoDocumento,
        numeroDocumento,
        razonSocial,
        contactoNombre: args.contactoNombre.trim(),
        contactoEmail,
        contactoCelular: args.contactoCelular.trim(),
        direccion: args.direccion,
        ciudad: args.ciudad,
        departamento: args.departamento,
        representanteLegalNombre: args.representanteLegalNombre,
        representanteLegalEmail: args.representanteLegalEmail?.trim().toLowerCase() || undefined,
      },
      actividadPrincipal_02: { codigoCiiu: args.codigoCiiu },
      tipoEvaluacion_14: tipoEvaluacion,
    });
    const ins = await requireIns(ctx, inscripcionId);

    await insertFase(ctx, ins, {
      fase: "I_ANALISIS_RIESGO",
      estado: "COMPLETADO",
      fechaInicio: now,
      fechaCompletado: now,
      completadoPor: actor.usuarioId,
      observaciones: "Riesgo calculado automáticamente al iniciar el proceso por el responsable.",
      payload: { kind: "faseI", riesgo, tipoEvaluacion, tipoSolicitud, automatico: true, listas: args.listas },
    });
    await insertFase(ctx, ins, { fase: "II_PENDIENTE_FORMULARIO", estado: "PENDIENTE", fechaInicio: now });
    await enviarEnlaceFormulario(ctx, ins, "INICIAL", actor.usuarioId);
    return inscripcionId;
  },
});

// ─── Lecturas ────────────────────────────────────────────────────────────────

export const miAcceso = query({
  args: { empresa: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const { access } = await resolveOnboardingAccess(ctx, MODULO, args.empresa ?? null);
    return access;
  },
});

/** Tablero de seguimiento: visibilidad según nivel de acceso y empresa. */
export const obtenerInscripcionesConUltimaFase = query({
  args: { empresa: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const { access } = await resolveOnboardingAccess(ctx, MODULO, args.empresa ?? null);
    let rows: SupplierDoc[];
    if (access.nivel === "responsable") {
      rows = await ctx.db
        .query("onboardingProveedores")
        .withIndex("by_responsableId", (q) => q.eq("matriz_00.responsableId", access.usuarioId))
        .take(1000);
      rows = rows.filter((r) => (args.empresa === undefined ? true : r.empresa === args.empresa));
      if (access.empresasVisibles !== "todas") {
        const visibles = new Set(access.empresasVisibles);
        rows = rows.filter((r) => visibles.has(r.empresa));
      }
    } else if (args.empresa !== undefined) {
      rows = await ctx.db
        .query("onboardingProveedores")
        .withIndex("by_empresa", (q) => q.eq("empresa", args.empresa!))
        .take(2000);
    } else if (access.empresasVisibles === "todas") {
      rows = await ctx.db.query("onboardingProveedores").order("desc").take(2000);
    } else {
      rows = [];
      for (const empresa of access.empresasVisibles) {
        rows.push(
          ...(await ctx.db
            .query("onboardingProveedores")
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
  args: { inscripcionId: v.id("onboardingProveedores") },
  handler: async (ctx, args) => {
    const ins = await ctx.db.get("onboardingProveedores", args.inscripcionId);
    if (!ins) return null;
    await requireVer(ctx, ins);
    return ins;
  },
});

export const obtenerFasesDeInscripcion = query({
  args: { inscripcionId: v.id("onboardingProveedores"), ahora: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const ins = await requireIns(ctx, args.inscripcionId);
    await requireVer(ctx, ins);
    return await fasesConCarriles(ctx, args.inscripcionId, args.ahora ?? ins.faseActualDesde ?? ins._creationTime);
  },
});

export const obtenerRevisionDocumentos = query({
  args: { inscripcionId: v.id("onboardingProveedores") },
  handler: async (ctx, args) => {
    const ins = await requireIns(ctx, args.inscripcionId);
    await requireVer(ctx, ins);
    return await listDocsProveedor(ctx, args.inscripcionId);
  },
});

export const obtenerInscripcionConFase = query({
  args: { inscripcionId: v.id("onboardingProveedores") },
  handler: async (ctx, args) => {
    const ins = await ctx.db.get("onboardingProveedores", args.inscripcionId);
    if (!ins) return null;
    await requireVer(ctx, ins);
    const fases = await listFasesIns(ctx, args.inscripcionId);
    return { ...ins, fases };
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

    function puedeGestionar(fase: string, ins: SupplierDoc, roles: Set<OnboardingRol>): boolean {
      const hasLow = roles.has("CUMPLIMIENTO_LOW_RISK");
      const hasMed = roles.has("CUMPLIMIENTO_MEDIUM_RISK");
      const hasHigh = roles.has("CUMPLIMIENTO_HIGH_RISK");
      const hasCumplimiento = hasLow || hasMed || hasHigh;
      if (fase === "I_ANALISIS_RIESGO") return hasCumplimiento;
      if (fase === "III_REVISION_DOCUMENTAL_CUMPLIMIENTO") return hasLow;
      if (fase === "III_REVISION_DOCUMENTAL_COMPRAS") return roles.has("COMPRAS");
      if (fase === "IV_APROBADO_CUMPLIMIENTO" && hasCumplimiento) {
        const riesgo = ins.tipoEvaluacion_14 ?? ins.matriz_00.riesgo ?? "INDEFINIDO";
        if (hasLow && RIESGO_LOW.has(riesgo)) return true;
        if (hasMed && RIESGO_MED.has(riesgo)) return true;
        if (hasHigh && RIESGO_HIGH.has(riesgo)) return true;
        return false;
      }
      if (fase === "V_EVALUACION_COMPRAS") return roles.has("COMPRAS");
      if (fase === "VI_CREACION_CONTABILIDAD") return roles.has("CONTABILIDAD");
      return false;
    }

    const porAsignacion = await ctx.db
      .query("onboardingProveedoresFases")
      .withIndex("by_asignadoA_estado", (q) => q.eq("asignadoA", access.usuarioId).eq("estado", "EN_PROGRESO"))
      .take(200);
    const candidatas = new Map<string, FaseRow>();
    for (const row of porAsignacion) candidatas.set(row._id, row);
    for (const [empresa, roles] of rolesPorEmpresa) {
      for (const rol of roles) {
        for (const fase of SUPPLIER_FASES_POR_ROL[rol as keyof typeof SUPPLIER_FASES_POR_ROL] ?? []) {
          const rows = await ctx.db
            .query("onboardingProveedoresFases")
            .withIndex("by_empresa_fase_estado", (q) =>
              q.eq("empresa", empresa).eq("fase", fase as FaseFila).eq("estado", "EN_PROGRESO"),
            )
            .take(200);
          for (const row of rows) candidatas.set(row._id, row);
        }
      }
    }

    const tareas: Array<FaseRow & { inscripcion: SupplierDoc }> = [];
    for (const fase of candidatas.values()) {
      const ins = await ctx.db.get("onboardingProveedores", fase.inscripcionId);
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
    const empresas =
      args.empresa !== undefined ? [args.empresa] : access.empresasVisibles === "todas" ? [1, 2, 3, 4] : access.empresasVisibles;
    const finales: SupplierDoc[] = [];
    for (const empresa of empresas) {
      for (const estado of ["COMPLETADO", "RECHAZADO", "ANULADA"] as const) {
        finales.push(
          ...(await ctx.db
            .query("onboardingProveedores")
            .withIndex("by_empresa_faseActual", (q) => q.eq("empresa", empresa).eq("faseActual", estado))
            .take(1000)),
        );
      }
    }
    return await Promise.all(
      finales.map(async (ins) => {
        const fases = await fasesConCarriles(ctx, ins._id, args.ahora ?? ins.faseActualDesde ?? ins._creationTime);
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
          tipoEvaluacion: ins.tipoEvaluacion_14,
          estadoFinal: ins.faseActual as "COMPLETADO" | "RECHAZADO" | "ANULADA",
          fechaCreacion: ins._creationTime,
          fechaCierre: fechaCierre ?? ins.anulacion?.fecha ?? ins.rechazadoCumplimiento?.fechaRechazo ?? ins.rechazadoCompras?.fechaRechazo ?? null,
          fases: fasesDetalle,
        };
      }),
    );
  },
});

// ─── Fase I (solo alcanzable tras una devolución) ────────────────────────────

export const actualizarCamposFaseI = mutation({
  args: {
    inscripcionId: v.id("onboardingProveedores"),
    contactoNombre: v.optional(v.string()),
    contactoEmail: v.optional(v.string()),
    contactoCelular: v.optional(v.string()),
    codigoCiiuSecundario: v.optional(v.string()),
    actividadEconomicaPrincipal: v.optional(v.string()),
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
      throw new Error("La matriz solo puede editarse antes de que el proveedor envíe el formulario.");
    }
    await requireGestionInscripcion(ctx, MODULO, ins);

    const datos = { ...ins.datos_generales_01 };
    if (args.contactoNombre !== undefined) datos.contactoNombre = args.contactoNombre.trim();
    if (args.contactoEmail !== undefined) datos.contactoEmail = args.contactoEmail.trim().toLowerCase();
    if (args.contactoCelular !== undefined) datos.contactoCelular = args.contactoCelular.trim();

    const matriz = { ...ins.matriz_00 };
    for (const key of [
      "codigoCiiuSecundario",
      "actividadEconomicaPrincipal",
      "actividadEconomicaSecundaria",
      "sectorEconomico",
      "servicioSuministrado",
      "montoAnual",
      "jurisdiccionNacional",
      "jurisdiccionInternacional",
      "listas",
    ] as const) {
      const value = args[key];
      if (value !== undefined) matriz[key] = value;
    }
    if (args.isPep !== undefined) matriz.isPep = args.isPep;
    const { riesgo, tipoEvaluacion } = computeSupplierRisk(matriz);
    matriz.riesgo = riesgo;
    await ctx.db.patch("onboardingProveedores", ins._id, {
      datos_generales_01: datos,
      matriz_00: matriz,
      tipoEvaluacion_14: tipoEvaluacion,
    });
    return { riesgo, tipoEvaluacion };
  },
});

export const completarFaseI = mutation({
  args: {
    inscripcionId: v.id("onboardingProveedores"),
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
    const tipoEvaluacion =
      args.tipoEvaluacion && args.tipoEvaluacion !== "INDEFINIDO" ? args.tipoEvaluacion : ins.tipoEvaluacion_14;
    if (tipoEvaluacion === "INDEFINIDO" || matriz.riesgo === "INDEFINIDO") {
      throw new Error("Defina el riesgo y el tipo de evaluación antes de continuar.");
    }
    const now = Date.now();
    await setFaseActual(ctx, ins, "II_PENDIENTE_FORMULARIO", now, { matriz_00: matriz, tipoEvaluacion_14: tipoEvaluacion });
    const faseI = await getFase(ctx, ins._id, "I_ANALISIS_RIESGO");
    if (faseI) {
      await ctx.db.patch("onboardingProveedoresFases", faseI._id, {
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

// ─── Fase III: revisión documental ───────────────────────────────────────────

/** Aprueba o rechaza un documento; cierra el carril y abre la Fase IV cuando ambos carriles terminan. */
export const revisarDocumento = mutation({
  args: {
    inscripcionId: v.id("onboardingProveedores"),
    docKey: v.string(),
    decision: decisionValidator,
    observaciones: v.optional(v.string()),
  },
  returns: v.object({ faseActual: v.string(), faseIVAbierta: v.boolean() }),
  handler: async (ctx, args) => {
    const ins = await requireIns(ctx, args.inscripcionId);
    if (!FASES_III.has(ins.faseActual)) throw new Error("La inscripción no está en Fase III.");
    const revDoc = await getDocProveedor(ctx, ins._id, args.docKey);
    if (!revDoc) throw new Error(`Documento '${args.docKey}' no encontrado.`);
    if (revDoc.estado !== "EN_REVISION" && revDoc.estado !== "APROBADO" && revDoc.estado !== "RECHAZADO") {
      throw new Error("El documento aún no ha sido cargado por el proveedor.");
    }
    const lane = FASE_LANE_POR_GRUPO[grupoDeDocumento(revDoc)];
    const actor = await requireActorEnFase(ctx, MODULO, ins, lane);
    const observaciones = args.observaciones?.trim() || undefined;
    if (args.decision === "RECHAZADO" && !observaciones) {
      throw new Error("Indique el motivo del rechazo del documento.");
    }

    const now = Date.now();
    await ctx.db.patch("onboardingProveedoresDocumentos", revDoc._id, {
      estado: args.decision,
      revisadoPor: actor.usuarioId,
      fechaRevision: now,
      observaciones,
      historial: [...(revDoc.historial ?? []), { accion: args.decision, fecha: now, userId: actor.usuarioId, nota: observaciones }],
    });

    if (args.decision === "RECHAZADO") {
      await notificarTercero(ctx, ins, "DOC_RECHAZADO", { docLabel: revDoc.docLabel, observaciones });
    }

    const docs = await listDocsProveedor(ctx, ins._id);
    const completados = getCompletadosRevisionDocumental(docs, now);
    for (const grupo of ["COMPRAS", "CUMPLIMIENTO"] as const) {
      const completado = completados[grupo === "COMPRAS" ? "compras" : "cumplimiento"];
      if (!completado.ok) continue;
      const faseRow = await getFase(ctx, ins._id, FASE_LANE_POR_GRUPO[grupo]);
      if (faseRow && faseRow.estado !== "COMPLETADO") {
        await ctx.db.patch("onboardingProveedoresFases", faseRow._id, {
          estado: "COMPLETADO",
          fechaCompletado: completado.fecha,
          completadoPor: completado.userId,
        });
      }
    }

    let faseIVAbierta = false;
    if (completados.compras.ok && completados.cumplimiento.ok && docs.length > 0) {
      const faseIV = await getFase(ctx, ins._id, "IV_APROBADO_CUMPLIMIENTO");
      if (!faseIV || faseIV.estado === "COMPLETADO" || faseIV.estado === "RECHAZADO" || faseIV.estado === "ANULADA") {
        await setFaseActual(ctx, ins, "IV_APROBADO_CUMPLIMIENTO", now);
        const actualizado = await requireIns(ctx, ins._id);
        const asignado = await abrirFaseConAsignado(ctx, actualizado, "IV_APROBADO_CUMPLIMIENTO", now);
        faseIVAbierta = true;
        await notificarTercero(ctx, actualizado, "DOCS_COMPLETADOS");
        if (asignado.rol) await notificarRol(ctx, actualizado, asignado.rol, "FASE_IV_ASIGNADA");
      }
    }
    const final = await requireIns(ctx, ins._id);
    return { faseActual: final.faseActual, faseIVAbierta };
  },
});

/** Cumplimiento ajusta PEP/listas durante la revisión documental (solo puede subir el riesgo). */
export const ajustarRiesgoCumplimientoDocumental = mutation({
  args: {
    inscripcionId: v.id("onboardingProveedores"),
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
    if (!FASES_III.has(ins.faseActual)) throw new Error("La inscripción no está en Fase III.");
    const { actor } = await resolveOnboardingAccess(ctx, MODULO, ins.empresa);
    const esCumplimiento = await actorTieneRol(ctx, MODULO, actor, ins.empresa, [
      "CUMPLIMIENTO_LOW_RISK",
      "CUMPLIMIENTO_MEDIUM_RISK",
      "CUMPLIMIENTO_HIGH_RISK",
    ]);
    if (!esCumplimiento) throw new Error("Solo Cumplimiento puede ajustar PEP y listas.");

    const observacion = args.observacion.trim();
    if (!observacion) throw new Error("Debes registrar una observación para ajustar PEP o listas.");
    const matriz = ins.matriz_00;
    const pepAnterior = matriz.isPep;
    const listasAnterior = matriz.listas;
    const riesgoAnterior = matriz.riesgo;
    const tipoEvaluacionAnterior = ins.tipoEvaluacion_14;
    if (pepAnterior === args.isPep && listasAnterior === args.listas) {
      throw new Error("No hay cambios en PEP o listas para registrar.");
    }
    const recalculado = computeSupplierRisk({ ...matriz, isPep: args.isPep, listas: args.listas });
    if (RIESGO_SCORE[recalculado.riesgo] < RIESGO_SCORE[toRiesgoNivel(riesgoAnterior)]) {
      throw new Error("Este ajuste solo está permitido cuando aumenta o mantiene el riesgo.");
    }

    const now = Date.now();
    await ctx.db.patch("onboardingProveedores", ins._id, {
      matriz_00: { ...matriz, isPep: args.isPep, listas: args.listas, riesgo: recalculado.riesgo },
      tipoEvaluacion_14: recalculado.tipoEvaluacion,
    });
    const actualizado = await requireIns(ctx, ins._id);
    const docsAgregados = await materializarDocumentosProveedor(ctx, actualizado, {
      accion: "AGREGADO_POR_AJUSTE_RIESGO",
      userId: actor.usuarioId,
      nota: observacion,
      now,
      soloNuevos: true,
    });
    await ctx.db.patch("onboardingProveedores", ins._id, {
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
      for (const lane of ["III_REVISION_DOCUMENTAL_CUMPLIMIENTO", "III_REVISION_DOCUMENTAL_COMPRAS"] as const) {
        const row = await getFase(ctx, ins._id, lane);
        if (row?.estado === "COMPLETADO") {
          await ctx.db.patch("onboardingProveedoresFases", row._id, {
            estado: "EN_PROGRESO",
            fechaCompletado: undefined,
            completadoPor: undefined,
            observaciones: undefined,
          });
        }
      }
      await notificarTercero(ctx, actualizado, "EVALUACION_CUMPLIMIENTO_CAMBIADA", {
        observaciones: docsAgregados.map((d) => d.docLabel).join(", "),
      });
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

/** El responsable reemplaza un documento rechazado en nombre del proveedor. */
export const cargarDocumentoRevisionInterno = mutation({
  args: { inscripcionId: v.id("onboardingProveedores"), docKey: v.string(), storageId: v.id("_storage") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ins = await requireIns(ctx, args.inscripcionId);
    if (!FASES_III.has(ins.faseActual)) throw new Error("Solo se pueden cargar documentos durante la revisión documental.");
    const actor = await requireResponsable(ctx, MODULO, ins);
    const existente = await getDocProveedor(ctx, ins._id, args.docKey);
    if (!existente) throw new Error("Documento no encontrado.");
    if (existente.estado !== "RECHAZADO") throw new Error("Solo se pueden reemplazar documentos rechazados.");
    const now = Date.now();
    await ctx.db.patch("onboardingProveedoresDocumentos", existente._id, {
      storageId: args.storageId,
      estado: "EN_REVISION",
      revisadoPor: undefined,
      fechaRevision: undefined,
      observaciones: undefined,
      historial: [...(existente.historial ?? []), { accion: "CARGADO_POR_RESPONSABLE", fecha: now, userId: actor.usuarioId }],
    });
    await ctx.db.patch("onboardingProveedores", ins._id, {
      documentos_15: { ...(ins.documentos_15 ?? {}), [args.docKey]: args.storageId },
    });
    return null;
  },
});

// ─── Fases IV, V y VI ────────────────────────────────────────────────────────

export const completarFaseIV = mutation({
  args: {
    inscripcionId: v.id("onboardingProveedores"),
    decision: decisionValidator,
    observaciones: v.optional(v.string()),
    motivoRechazo: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ins = await requireIns(ctx, args.inscripcionId);
    if (ins.faseActual !== "IV_APROBADO_CUMPLIMIENTO") throw new Error("La inscripción no está en Fase IV.");
    const actor = await requireActorEnFase(ctx, MODULO, ins, "IV_APROBADO_CUMPLIMIENTO");
    const now = Date.now();
    const observaciones = (args.decision === "APROBADO" ? args.observaciones : args.motivoRechazo)?.trim() || undefined;
    if (args.decision === "RECHAZADO" && !observaciones) throw new Error("Debe registrar un motivo de rechazo.");

    const faseIV = await getFase(ctx, ins._id, "IV_APROBADO_CUMPLIMIENTO");
    if (faseIV) {
      await ctx.db.patch("onboardingProveedoresFases", faseIV._id, {
        estado: args.decision === "APROBADO" ? "COMPLETADO" : "RECHAZADO",
        fechaCompletado: now,
        completadoPor: actor.usuarioId,
        observaciones,
        payload: {
          kind: "decision",
          decision: args.decision,
          motivoRechazo: args.motivoRechazo?.trim() || undefined,
          observaciones,
          completadoPorNombre: actor.nombre,
        },
      });
    }
    if (args.decision === "APROBADO") {
      await setFaseActual(ctx, ins, "V_EVALUACION_COMPRAS", now);
      const actualizado = await requireIns(ctx, ins._id);
      await abrirFaseConAsignado(ctx, actualizado, "V_EVALUACION_COMPRAS", now);
      await notificarRol(ctx, actualizado, "COMPRAS", "FASE_IV_APROBADA");
    } else {
      await setFaseActual(ctx, ins, "RECHAZADO", now, {
        rechazadoCumplimiento: {
          motivoExterno: observaciones ?? "",
          motivoInterno: observaciones ?? "",
          fechaRechazo: now,
          rechazadoPorUserId: actor.usuarioId,
        },
      });
      await notificarTercero(ctx, await requireIns(ctx, ins._id), "FASE_IV_RECHAZADA", { motivoRechazo: observaciones });
    }
    return null;
  },
});

/** Rechazo de Cumplimiento con motivo visible al proveedor y motivo interno. */
export const rechazarCumplimiento = mutation({
  args: { inscripcionId: v.id("onboardingProveedores"), motivoProveedor: v.string(), motivoInterno: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ins = await requireIns(ctx, args.inscripcionId);
    if (ins.faseActual !== "IV_APROBADO_CUMPLIMIENTO") throw new Error("La inscripción no está en Fase IV.");
    const actor = await requireActorEnFase(ctx, MODULO, ins, "IV_APROBADO_CUMPLIMIENTO");
    const motivoExterno = args.motivoProveedor.trim();
    const motivoInterno = args.motivoInterno.trim();
    if (!motivoExterno || !motivoInterno) throw new Error("Indique el motivo para el proveedor y el motivo interno.");
    const now = Date.now();
    await setFaseActual(ctx, ins, "RECHAZADO", now, {
      rechazadoCumplimiento: { motivoExterno, motivoInterno, fechaRechazo: now, rechazadoPorUserId: actor.usuarioId },
    });
    const faseIV = await getFase(ctx, ins._id, "IV_APROBADO_CUMPLIMIENTO");
    if (faseIV) {
      await ctx.db.patch("onboardingProveedoresFases", faseIV._id, {
        estado: "RECHAZADO",
        fechaCompletado: now,
        completadoPor: actor.usuarioId,
        observaciones: motivoInterno,
        payload: { kind: "rechazo", motivoExterno, motivoInterno },
      });
    }
    await notificarTercero(ctx, await requireIns(ctx, ins._id), "FASE_IV_RECHAZADA", { motivoRechazo: motivoExterno });
    return null;
  },
});

export const completarFaseV = mutation({
  args: { inscripcionId: v.id("onboardingProveedores"), observaciones: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ins = await requireIns(ctx, args.inscripcionId);
    if (ins.faseActual !== "V_EVALUACION_COMPRAS") throw new Error("La inscripción no está en Fase V.");
    const actor = await requireActorEnFase(ctx, MODULO, ins, "V_EVALUACION_COMPRAS");
    const evaluacion = await ctx.db
      .query("onboardingProveedoresEvaluaciones")
      .withIndex("by_inscripcionId", (q) => q.eq("inscripcionId", ins._id))
      .first();
    if (!evaluacion) throw new Error("Registre la evaluación de Compras antes de completar la fase.");
    const now = Date.now();
    const faseV = await getFase(ctx, ins._id, "V_EVALUACION_COMPRAS");
    if (faseV) {
      await ctx.db.patch("onboardingProveedoresFases", faseV._id, {
        estado: "COMPLETADO",
        fechaCompletado: now,
        completadoPor: actor.usuarioId,
        observaciones: args.observaciones?.trim() || undefined,
        payload: {
          kind: "evaluacion",
          evaluacionId: evaluacion._id,
          calificacionGeneral: evaluacion.calificacionGeneral,
          isAprobado: evaluacion.isAprobado,
        },
      });
    }
    await setFaseActual(ctx, ins, "VI_CREACION_CONTABILIDAD", now);
    const actualizado = await requireIns(ctx, ins._id);
    await abrirFaseConAsignado(ctx, actualizado, "VI_CREACION_CONTABILIDAD", now);
    await notificarRol(ctx, actualizado, "CONTABILIDAD", "FASE_V_COMPLETADA");
    return null;
  },
});

export const rechazarCompras = mutation({
  args: { inscripcionId: v.id("onboardingProveedores"), motivoProveedor: v.string(), motivoInterno: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ins = await requireIns(ctx, args.inscripcionId);
    if (ins.faseActual !== "V_EVALUACION_COMPRAS") throw new Error("La inscripción no está en Fase V.");
    const actor = await requireActorEnFase(ctx, MODULO, ins, "V_EVALUACION_COMPRAS");
    const motivoExterno = args.motivoProveedor.trim();
    const motivoInterno = args.motivoInterno.trim();
    if (!motivoExterno || !motivoInterno) throw new Error("Indique el motivo para el proveedor y el motivo interno.");
    const now = Date.now();
    await setFaseActual(ctx, ins, "RECHAZADO", now, {
      rechazadoCompras: { motivoExterno, motivoInterno, fechaRechazo: now, rechazadoPorUserId: actor.usuarioId },
    });
    const faseV = await getFase(ctx, ins._id, "V_EVALUACION_COMPRAS");
    if (faseV) {
      await ctx.db.patch("onboardingProveedoresFases", faseV._id, {
        estado: "RECHAZADO",
        fechaCompletado: now,
        completadoPor: actor.usuarioId,
        observaciones: motivoInterno,
        payload: { kind: "rechazo", motivoExterno, motivoInterno },
      });
    }
    await notificarTercero(ctx, await requireIns(ctx, ins._id), "FASE_V_RECHAZADA", { motivoRechazo: motivoExterno });
    return null;
  },
});

export const completarFaseVI = mutation({
  args: {
    inscripcionId: v.id("onboardingProveedores"),
    notasContabilidad: v.optional(
      v.object({
        justificacionCambios: v.optional(v.string()),
        archivosSoporte: v.optional(v.array(v.object({ storageId: v.id("_storage"), nombre: v.string() }))),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ins = await requireIns(ctx, args.inscripcionId);
    if (ins.faseActual !== "VI_CREACION_CONTABILIDAD") throw new Error("La inscripción no está en Fase VI.");
    const actor = await requireActorEnFase(ctx, MODULO, ins, "VI_CREACION_CONTABILIDAD");
    const now = Date.now();
    const justificacionCambios = (args.notasContabilidad?.justificacionCambios ?? "").trim().slice(0, 8000);
    const archivosSoporte = (args.notasContabilidad?.archivosSoporte ?? []).slice(0, 8);
    const notas =
      justificacionCambios.length > 0 || archivosSoporte.length > 0
        ? { justificacionCambios, archivosSoporte, registradoEn: now }
        : undefined;
    const faseVI = await getFase(ctx, ins._id, "VI_CREACION_CONTABILIDAD");
    if (faseVI) {
      await ctx.db.patch("onboardingProveedoresFases", faseVI._id, {
        estado: "COMPLETADO",
        fechaCompletado: now,
        completadoPor: actor.usuarioId,
        observaciones: justificacionCambios || undefined,
      });
    }
    await setFaseActual(ctx, ins, "COMPLETADO", now, notas ? { notasContabilidadFaseVI: notas } : {});
    return null;
  },
});

// ─── Anulación y devolución ──────────────────────────────────────────────────

export const anularProceso = mutation({
  args: { inscripcionId: v.id("onboardingProveedores"), motivo: v.string() },
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
        await ctx.db.patch("onboardingProveedoresFases", fase._id, {
          estado: "ANULADA",
          fechaCompletado: now,
          completadoPor: actor.usuarioId,
          observaciones: `Proceso anulado: ${motivo}`,
        });
      }
    }
    await revokeTokens(ctx, { modulo: MODULO, inscripcionId: ins._id, reason: "MANUAL" });
    return null;
  },
});

const FASE_ACTUAL_DE_FILA: Record<FaseFila, FaseActual> = {
  I_ANALISIS_RIESGO: "I_ANALISIS_RIESGO",
  II_PENDIENTE_FORMULARIO: "II_PENDIENTE_FORMULARIO",
  IIA_PENDIENTE_FIRMA: "IIA_PENDIENTE_FIRMA",
  III_REVISION_DOCUMENTAL_COMPRAS: "III_REVISION_DOCUMENTAL",
  III_REVISION_DOCUMENTAL_CUMPLIMIENTO: "III_REVISION_DOCUMENTAL",
  IV_APROBADO_CUMPLIMIENTO: "IV_APROBADO_CUMPLIMIENTO",
  V_EVALUACION_COMPRAS: "V_EVALUACION_COMPRAS",
  VI_CREACION_CONTABILIDAD: "VI_CREACION_CONTABILIDAD",
};

/**
 * Devuelve el proceso a una fase anterior: borra las filas posteriores, reabre la fase,
 * deshace los efectos colaterales (firma, revisiones, rechazos), revoca los enlaces y
 * reenvía la invitación que corresponda.
 */
export const devolverFase = mutation({
  args: { faseId: v.id("onboardingProveedoresFases"), motivo: v.string() },
  returns: v.object({ inscripcionId: v.id("onboardingProveedores"), faseDestino: supplierFaseFilaValidator }),
  handler: async (ctx, args) => {
    const fase = await ctx.db.get("onboardingProveedoresFases", args.faseId);
    if (!fase) throw new Error("Fase no encontrada.");
    if (fase.estado === "EN_PROGRESO") throw new Error("La fase ya está en progreso.");
    const ins = await requireIns(ctx, fase.inscripcionId);
    if (ins.faseActual === "ANULADA") throw new Error("No se puede devolver una inscripción anulada.");
    const actor = await requireGestionInscripcion(ctx, MODULO, ins);
    const motivo = args.motivo.trim();
    if (!motivo) throw new Error("Debes registrar una razón para devolver el proceso a esta fase.");

    const todas = (await listFasesIns(ctx, ins._id)).sort((a, b) => (a.fechaInicio ?? 0) - (b.fechaInicio ?? 0));
    const idx = todas.findIndex((f) => f._id === args.faseId);
    if (idx === -1) throw new Error("No se encontró la fase en el historial del proceso.");
    const now = Date.now();
    const esLaneIII = fase.fase === "III_REVISION_DOCUMENTAL_COMPRAS" || fase.fase === "III_REVISION_DOCUMENTAL_CUMPLIMIENTO";
    for (let i = idx + 1; i < todas.length; i++) {
      // Las dos filas de Fase III son hermanas: al devolver a un carril se conserva el otro.
      if (esLaneIII && todas[i].fase.startsWith("III_REVISION_DOCUMENTAL")) continue;
      await ctx.db.delete("onboardingProveedoresFases", todas[i]._id);
    }
    await ctx.db.patch("onboardingProveedoresFases", args.faseId, {
      estado: "EN_PROGRESO",
      fechaCompletado: undefined,
      completadoPor: undefined,
      observaciones: undefined,
      payload: undefined,
    });

    const faseDestinoActual = FASE_ACTUAL_DE_FILA[fase.fase];
    const patch: Partial<SupplierDoc> = {
      devolucionesFase: [
        ...(ins.devolucionesFase ?? []),
        { faseOrigen: ins.faseActual, faseDestino: fase.fase, motivo, devueltoPorUserId: actor.usuarioId, fecha: now },
      ],
      rechazadoCumplimiento: undefined,
      rechazadoCompras: undefined,
    };
    if (fase.fase === "II_PENDIENTE_FORMULARIO" || fase.fase === "IIA_PENDIENTE_FIRMA" || fase.fase === "I_ANALISIS_RIESGO") {
      patch.firmaRepresentante_16 = undefined;
      patch.firmadoEn = undefined;
    }
    if (fase.fase === "II_PENDIENTE_FORMULARIO") {
      await ctx.db.patch("onboardingProveedoresFases", args.faseId, { estado: "PENDIENTE" });
    }
    await setFaseActual(ctx, ins, faseDestinoActual, now, patch);

    if (esLaneIII) {
      const grupo = fase.fase === "III_REVISION_DOCUMENTAL_COMPRAS" ? "COMPRAS" : "CUMPLIMIENTO";
      for (const doc of await listDocsProveedor(ctx, ins._id)) {
        if (grupoDeDocumento(doc) !== grupo) continue;
        if (doc.estado === "PENDIENTE") continue;
        await ctx.db.patch("onboardingProveedoresDocumentos", doc._id, {
          estado: "EN_REVISION",
          revisadoPor: undefined,
          fechaRevision: undefined,
          observaciones: undefined,
          historial: [...(doc.historial ?? []), { accion: "DEVUELTO_A_REVISION", fecha: now, userId: actor.usuarioId, nota: motivo }],
        });
      }
    }

    await revokeTokens(ctx, { modulo: MODULO, inscripcionId: ins._id, scope: "SIGN", reason: "PHASE_RESTORED" });
    const actualizado = await requireIns(ctx, ins._id);
    if (fase.fase === "II_PENDIENTE_FORMULARIO" || fase.fase === "I_ANALISIS_RIESGO") {
      await revokeTokens(ctx, { modulo: MODULO, inscripcionId: ins._id, scope: "FORM", reason: "PHASE_RESTORED" });
      if (fase.fase === "II_PENDIENTE_FORMULARIO") await enviarEnlaceFormulario(ctx, actualizado, "RESTAURACION_FASE", actor.usuarioId);
    } else if (fase.fase === "IIA_PENDIENTE_FIRMA") {
      await enviarEnlaceFirma(ctx, actualizado, "RESTAURACION_FASE", actor.usuarioId);
    } else if (fase.fase === "IV_APROBADO_CUMPLIMIENTO") {
      const asignado = await resolverAsignado(ctx, MODULO, actualizado, fase.fase);
      if (asignado.userId && fase.asignadoA !== asignado.userId) {
        await ctx.db.patch("onboardingProveedoresFases", args.faseId, { asignadoA: asignado.userId });
      }
      if (asignado.rol) await notificarRol(ctx, actualizado, asignado.rol, "FASE_IV_ASIGNADA");
    } else if (fase.fase === "V_EVALUACION_COMPRAS") {
      await notificarRol(ctx, actualizado, "COMPRAS", "FASE_IV_APROBADA");
    } else if (fase.fase === "VI_CREACION_CONTABILIDAD") {
      await notificarRol(ctx, actualizado, "CONTABILIDAD", "FASE_V_COMPLETADA");
    }
    return { inscripcionId: ins._id, faseDestino: fase.fase };
  },
});

// ─── Utilidades para la UI ───────────────────────────────────────────────────

/** Rol de Cumplimiento que aprueba la Fase IV de una inscripción. */
export function rolAprobacionFaseIV(ins: Pick<SupplierDoc, "tipoEvaluacion_14">): OnboardingRol {
  return rolCumplimientoPorRiesgo(ins.tipoEvaluacion_14);
}

export { supplierDocLabel, supplierDocRevisorRol, storageCargadoDe };
