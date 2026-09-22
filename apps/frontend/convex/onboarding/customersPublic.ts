// Inscripción de CLIENTES — funciones PÚBLICAS (formulario y firma del tercero).
// Autenticación por token de enlace; verificación secundaria por tipo/número de documento.
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "../_generated/server";
import { buildOnboardingSearchText } from "../lib/onboarding/searchText";
import { programarCorreoRastreado, TIPOS_RASTREADOS } from "../lib/onboarding/correos";
import {
  assertInfoTributariaClienteParaEnvio,
  documentosRequeridosCliente,
  getDocCliente,
  listDocsCliente,
  materializarDocumentosCliente,
  mergeInfoTributariaCliente,
} from "../lib/onboarding/customersDocs";
import { resolverAsignado } from "../lib/onboarding/phases";
import { contactoFirmaDe } from "../lib/onboarding/refs";
import { urlsDeInscripcion } from "../lib/onboarding/storageScope";
import { assertDocumentoCoincide, requireOnboardingToken, revokeTokens, TokenInvalidoError } from "../lib/onboarding/tokens";
import {
  actividadEconomicaClienteValidator,
  certificacionValidator,
  compoAccionariaItemValidator,
  conflictoInteresesValidator,
  contactoAdicionalValidator,
  cuentaPagoClienteValidator,
  infoTributariaClienteValidator,
  radicacionFacturaValidator,
  referenciaComercialValidator,
  tipoDocumentoValidator,
  tipoPersonaValidator,
} from "./validators";

type CustomerDoc = Doc<"onboardingClientes">;
const MODULO = "customer" as const;
const FASES_CARGA: ReadonlySet<string> = new Set(["II_PENDIENTE_FORMULARIO", "III_REVISION_DOCUMENTAL"]);

async function guardForm(
  ctx: QueryCtx | MutationCtx,
  args: { inscripcionId: Id<"onboardingClientes">; token: string },
  opts: { mutation?: boolean; scopes?: readonly ("FORM" | "SIGN")[]; allowViewOnly?: boolean } = {},
): Promise<CustomerDoc> {
  const { inscripcion } = await requireOnboardingToken(ctx, {
    modulo: MODULO,
    inscripcionId: args.inscripcionId,
    token: args.token,
    scopes: opts.scopes ?? ["FORM"],
    mutation: opts.mutation,
    allowViewOnly: opts.allowViewOnly,
  });
  return inscripcion as CustomerDoc;
}

/** Proyección segura de la inscripción para el cliente (sin puntajes internos ni notas). */
async function proyeccionPublica(ctx: QueryCtx | MutationCtx, ins: CustomerDoc) {
  const revisiones = await listDocsCliente(ctx, ins._id);
  const documentos: Record<string, Id<"_storage">> = { ...(ins.documentos_09 ?? {}) };
  if (ins.matriz_00.rutStorageId && !documentos.rutUltimoAnio) documentos.rutUltimoAnio = ins.matriz_00.rutStorageId;
  return {
    _id: ins._id,
    empresa: ins.empresa,
    faseActual: ins.faseActual,
    datos_generales_01: ins.datos_generales_01,
    actividadEconomica_02: ins.actividadEconomica_02,
    conflictoIntereses_03: ins.conflictoIntereses_03,
    infoTributaria_04: ins.infoTributaria_04,
    compoAccionaria_05: ins.compoAccionaria_05,
    contactos_06: ins.contactos_06,
    radicacionFactura_07: ins.radicacionFactura_07,
    datosCuentasPagos_08: ins.datosCuentasPagos_08,
    referenciasComerciales_11: ins.referenciasComerciales_11,
    condicionesPago_12: ins.condicionesPago_12,
    adicionales_13: ins.adicionales_13,
    tipoEvaluacion: ins.tipoEvaluacion,
    isPep: ins.matriz_00.isPep,
    documentos,
    firmaRepresentante_10: ins.firmaRepresentante_10,
    firmadoEn: ins.firmadoEn,
    documentosRequeridos: documentosRequeridosCliente(ins),
    revisiones: revisiones.map((r) => ({
      docKey: r.docKey,
      docLabel: r.docLabel,
      estado: r.estado,
      observaciones: r.estado === "RECHAZADO" ? r.observaciones : undefined,
      storageId: r.storageId,
      fechaRevision: r.fechaRevision,
    })),
    motivoRechazo: ins.rechazadoCumplimiento?.motivoExterno,
    creadoEn: ins._creationTime,
  };
}

// ─── Lectura ─────────────────────────────────────────────────────────────────

/** `null` cuando el enlace es inválido, vencido o revocado (la página muestra "enlace inválido"). */
export const obtenerInscripcionPublica = query({
  args: { inscripcionId: v.id("onboardingClientes"), token: v.string() },
  handler: async (ctx, args) => {
    let tokenRow;
    let ins: CustomerDoc;
    try {
      const result = await requireOnboardingToken(ctx, {
        modulo: MODULO,
        inscripcionId: args.inscripcionId,
        token: args.token,
        scopes: ["FORM", "SIGN"],
        allowViewOnly: true,
      });
      tokenRow = result.tokenRow;
      ins = result.inscripcion as CustomerDoc;
    } catch (error) {
      if (error instanceof TokenInvalidoError) return null;
      throw error;
    }
    const proyeccion = await proyeccionPublica(ctx, ins);
    return { ...proyeccion, acceso: { scope: tokenRow.scope, viewOnly: tokenRow.viewOnly === true, expiresAt: tokenRow.expiresAt } };
  },
});

export const obtenerUrlsArchivosPublico = query({
  args: { inscripcionId: v.id("onboardingClientes"), token: v.string(), storageIds: v.array(v.id("_storage")) },
  returns: v.array(v.object({ storageId: v.id("_storage"), url: v.union(v.string(), v.null()) })),
  handler: async (ctx, args) => {
    const ins = await guardForm(ctx, args, { scopes: ["FORM", "SIGN"], allowViewOnly: true });
    if (args.storageIds.length > 50) throw new Error("Demasiados archivos.");
    return await urlsDeInscripcion(ctx, { modulo: MODULO, inscripcionId: ins._id }, ins, args.storageIds);
  },
});

// ─── Carga de archivos ───────────────────────────────────────────────────────

export const generateUploadUrlPublico = mutation({
  args: { inscripcionId: v.id("onboardingClientes"), token: v.string() },
  returns: v.string(),
  handler: async (ctx, args) => {
    const ins = await guardForm(ctx, args, { mutation: true });
    if (!FASES_CARGA.has(ins.faseActual)) throw new Error("La inscripción no admite cargas en su fase actual.");
    return await ctx.storage.generateUploadUrl();
  },
});

// ─── Auto-guardado del formulario (Fase II) ──────────────────────────────────

const datosGeneralesPatch = v.object({
  tipoPersona: v.optional(tipoPersonaValidator),
  razonSocial: v.optional(v.string()),
  contactoNombre: v.optional(v.string()),
  contactoEmail: v.optional(v.string()),
  contactoCelular: v.optional(v.string()),
  direccion: v.optional(v.string()),
  ciudad: v.optional(v.string()),
  departamento: v.optional(v.string()),
  celular: v.optional(v.string()),
  telefono: v.optional(v.string()),
  email: v.optional(v.string()),
  web: v.optional(v.string()),
  representanteLegalNombre: v.optional(v.string()),
  representanteLegalTipoDocumento: v.optional(tipoDocumentoValidator),
  representanteLegalNumeroDocumento: v.optional(v.string()),
  representanteLegalEmail: v.optional(v.string()),
  representanteLegalNacionalidad: v.optional(v.string()),
  tesoreroNombre: v.optional(v.string()),
  tesoreroEmail: v.optional(v.string()),
  tesoreroTelefono: v.optional(v.string()),
  contadorNombre: v.optional(v.string()),
  contadorEmail: v.optional(v.string()),
  contadorTelefono: v.optional(v.string()),
});

export const actualizarInscripcion = mutation({
  args: {
    inscripcionId: v.id("onboardingClientes"),
    token: v.string(),
    tipoDocumento: tipoDocumentoValidator,
    numeroDocumento: v.string(),
    datos_generales_01: v.optional(datosGeneralesPatch),
    actividadEconomica_02: v.optional(actividadEconomicaClienteValidator),
    conflictoIntereses_03: v.optional(conflictoInteresesValidator),
    infoTributaria_04: v.optional(infoTributariaClienteValidator),
    compoAccionaria_05: v.optional(v.array(compoAccionariaItemValidator)),
    contactos_06: v.optional(v.array(contactoAdicionalValidator)),
    radicacionFactura_07: v.optional(radicacionFacturaValidator),
    datosCuentasPagos_08: v.optional(v.array(cuentaPagoClienteValidator)),
    documentos_09: v.optional(v.record(v.string(), v.id("_storage"))),
    referenciasComerciales_11: v.optional(v.array(referenciaComercialValidator)),
    adicionales_13: v.optional(
      v.object({
        aniosExperiencia: v.number(),
        certificaciones: v.optional(v.array(certificacionValidator)),
        serviciosXGarantias: v.optional(v.string()),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ins = await guardForm(ctx, args, { mutation: true });
    assertDocumentoCoincide(ins, args.tipoDocumento, args.numeroDocumento);
    if (ins.faseActual !== "II_PENDIENTE_FORMULARIO") {
      throw new Error("El formulario ya fue enviado; solo se admiten cargas de documentos.");
    }
    const updates: Partial<CustomerDoc> = {};
    if (args.datos_generales_01) {
      const patch = { ...args.datos_generales_01 };
      for (const key of ["contactoEmail", "representanteLegalEmail", "email"] as const) {
        const value = patch[key];
        if (value !== undefined) patch[key] = value.trim().toLowerCase();
      }
      updates.datos_generales_01 = { ...ins.datos_generales_01, ...patch };
      updates.searchText = buildOnboardingSearchText({
        NIT: ins.NIT,
        razonSocial: updates.datos_generales_01.razonSocial,
      });
    }
    if (args.actividadEconomica_02) updates.actividadEconomica_02 = { ...(ins.actividadEconomica_02 ?? {}), ...args.actividadEconomica_02 };
    if (args.conflictoIntereses_03) updates.conflictoIntereses_03 = args.conflictoIntereses_03;
    if (args.infoTributaria_04) {
      updates.infoTributaria_04 = mergeInfoTributariaCliente(
        ins.infoTributaria_04 as Record<string, unknown> | undefined,
        args.infoTributaria_04 as Record<string, unknown>,
      ) as CustomerDoc["infoTributaria_04"];
    }
    if (args.compoAccionaria_05 !== undefined) updates.compoAccionaria_05 = args.compoAccionaria_05;
    if (args.contactos_06 !== undefined) updates.contactos_06 = args.contactos_06;
    if (args.radicacionFactura_07) updates.radicacionFactura_07 = args.radicacionFactura_07;
    if (args.datosCuentasPagos_08 !== undefined) updates.datosCuentasPagos_08 = args.datosCuentasPagos_08;
    if (args.documentos_09 !== undefined) updates.documentos_09 = { ...(ins.documentos_09 ?? {}), ...args.documentos_09 };
    if (args.referenciasComerciales_11 !== undefined) updates.referenciasComerciales_11 = args.referenciasComerciales_11;
    if (args.adicionales_13) updates.adicionales_13 = args.adicionales_13;
    if (Object.keys(updates).length > 0) await ctx.db.patch("onboardingClientes", ins._id, updates);
    return null;
  },
});

// ─── Envío del formulario (II → IIA) ─────────────────────────────────────────

export const enviarFormulario = mutation({
  args: {
    inscripcionId: v.id("onboardingClientes"),
    token: v.string(),
    tipoDocumento: tipoDocumentoValidator,
    numeroDocumento: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ins = await guardForm(ctx, args, { mutation: true });
    assertDocumentoCoincide(ins, args.tipoDocumento, args.numeroDocumento);
    if (ins.faseActual !== "II_PENDIENTE_FORMULARIO") throw new Error(`La inscripción no está en Fase II (está en ${ins.faseActual}).`);
    assertInfoTributariaClienteParaEnvio(ins.infoTributaria_04);
    const representante = contactoFirmaDe(ins);
    if (!representante) throw new Error("Indique el correo del representante legal para continuar con la firma.");

    const now = Date.now();
    const faseII = await ctx.db
      .query("onboardingClientesFases")
      .withIndex("by_inscripcionId_fase", (q) => q.eq("inscripcionId", ins._id).eq("fase", "II_PENDIENTE_FORMULARIO"))
      .order("desc")
      .first();
    if (faseII) {
      await ctx.db.patch("onboardingClientesFases", faseII._id, { estado: "COMPLETADO", fechaCompletado: now, payload: { kind: "formulario", formularioEnviadoAt: now } });
    }
    await ctx.db.patch("onboardingClientes", ins._id, { faseActual: "IIA_PENDIENTE_FIRMA", faseActualDesde: now });
    await ctx.db.insert("onboardingClientesFases", { inscripcionId: ins._id, empresa: ins.empresa, fase: "IIA_PENDIENTE_FIRMA", estado: "EN_PROGRESO", fechaInicio: now });
    await programarCorreoRastreado(ctx, {
      modulo: MODULO,
      inscripcionId: ins._id,
      handoff: "SIGN",
      tipoNotificacion: TIPOS_RASTREADOS.SIGN,
      origen: "AUTOMATICO",
      destinatarioNombre: representante.nombre,
      destinatarioEmail: representante.email,
    });
    return null;
  },
});

// ─── Firma del representante legal (IIA → III) ───────────────────────────────

export const firmarFormularioRepresentante = mutation({
  args: { inscripcionId: v.id("onboardingClientes"), token: v.string(), firmaDataUrl: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ins = await guardForm(ctx, args, { mutation: true, scopes: ["SIGN"] });
    if (ins.faseActual !== "IIA_PENDIENTE_FIRMA") throw new Error(`La inscripción no está pendiente de firma (está en ${ins.faseActual}).`);
    const firma = args.firmaDataUrl.trim();
    if (!firma.startsWith("data:image/png;base64,") || firma.length < 100 || firma.length > 900_000) throw new Error("La firma no es válida.");
    const now = Date.now();
    await ctx.db.patch("onboardingClientes", ins._id, { firmaRepresentante_10: firma, firmadoEn: now });

    const faseIIA = await ctx.db
      .query("onboardingClientesFases")
      .withIndex("by_inscripcionId_fase", (q) => q.eq("inscripcionId", ins._id).eq("fase", "IIA_PENDIENTE_FIRMA"))
      .order("desc")
      .first();
    if (faseIIA) await ctx.db.patch("onboardingClientesFases", faseIIA._id, { estado: "COMPLETADO", fechaCompletado: now });

    const firmado = { ...ins, firmaRepresentante_10: firma, firmadoEn: now };
    await materializarDocumentosCliente(ctx, firmado, { accion: "FORMULARIO_FIRMADO", now });
    await ctx.db.patch("onboardingClientes", ins._id, { faseActual: "III_REVISION_DOCUMENTAL", faseActualDesde: now });
    const asignado = await resolverAsignado(ctx, MODULO, firmado, "III_REVISION_DOCUMENTAL");
    await ctx.db.insert("onboardingClientesFases", {
      inscripcionId: ins._id,
      empresa: ins.empresa,
      fase: "III_REVISION_DOCUMENTAL",
      estado: "EN_PROGRESO",
      asignadoA: asignado.userId,
      fechaInicio: now,
    });
    await revokeTokens(ctx, { modulo: MODULO, inscripcionId: ins._id, scope: "SIGN", reason: "CONSUMED" });
    return null;
  },
});

// ─── Carga o recarga de documentos (Fase III) ────────────────────────────────

export const cargarDocumentoRevision = mutation({
  args: {
    inscripcionId: v.id("onboardingClientes"),
    token: v.string(),
    tipoDocumento: tipoDocumentoValidator,
    numeroDocumento: v.string(),
    docKey: v.string(),
    storageId: v.id("_storage"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ins = await guardForm(ctx, args, { mutation: true });
    assertDocumentoCoincide(ins, args.tipoDocumento, args.numeroDocumento);
    if (ins.faseActual !== "III_REVISION_DOCUMENTAL") throw new Error("Solo se pueden cargar documentos durante la revisión documental.");
    const requerido = documentosRequeridosCliente(ins).find((r) => r.docKey === args.docKey);
    const existente = await getDocCliente(ctx, ins._id, args.docKey);
    if (!requerido && !existente) throw new Error("Documento no requerido para esta inscripción.");

    const now = Date.now();
    if (existente) {
      await ctx.db.patch("onboardingClientesDocumentos", existente._id, {
        storageId: args.storageId,
        estado: "EN_REVISION",
        revisadoPor: undefined,
        fechaRevision: undefined,
        observaciones: undefined,
        historial: [...(existente.historial ?? []), { accion: "CARGADO", fecha: now }],
      });
      const faseIII = await ctx.db
        .query("onboardingClientesFases")
        .withIndex("by_inscripcionId_fase", (q) => q.eq("inscripcionId", ins._id).eq("fase", "III_REVISION_DOCUMENTAL"))
        .order("desc")
        .first();
      if (faseIII?.estado === "COMPLETADO") {
        await ctx.db.patch("onboardingClientesFases", faseIII._id, { estado: "EN_PROGRESO", fechaCompletado: undefined, completadoPor: undefined });
      }
    } else if (requerido) {
      await ctx.db.insert("onboardingClientesDocumentos", {
        inscripcionId: ins._id,
        docKey: requerido.docKey,
        docLabel: requerido.docLabel,
        revisorRol: requerido.revisorRol,
        estado: "EN_REVISION",
        storageId: args.storageId,
        historial: [{ accion: "CARGADO", fecha: now }],
      });
    }
    await ctx.db.patch("onboardingClientes", ins._id, { documentos_09: { ...(ins.documentos_09 ?? {}), [args.docKey]: args.storageId } });
    return null;
  },
});
