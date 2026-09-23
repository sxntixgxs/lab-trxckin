// Inscripción de PROVEEDORES — funciones PÚBLICAS (formulario y firma del tercero).
// Autenticación por token de enlace; verificación secundaria por tipo/número de documento.
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "../_generated/server";
import { buildOnboardingSearchText } from "../lib/onboarding/searchText";
import { programarCorreoRastreado, TIPOS_RASTREADOS } from "../lib/onboarding/correos";
import { programarNotificacion } from "../lib/onboarding/notificar";
import { resolverAsignado } from "../lib/onboarding/phases";
import { contactoFirmaDe, contactoTerceroDe } from "../lib/onboarding/refs";
import { urlsDeInscripcion } from "../lib/onboarding/storageScope";
import {
  assertDocumentosRequeridosCargados,
  assertInfoTributariaProveedorParaEnvio,
  documentosRequeridosProveedor,
  getDocProveedor,
  grupoDeDocumento,
  listDocsProveedor,
  materializarDocumentosProveedor,
  mergeInfoTributariaProveedor,
  storageCargadoDe,
  FASE_LANE_POR_GRUPO,
} from "../lib/onboarding/suppliersDocs";
import { assertDocumentoCoincide, requireOnboardingToken, revokeTokens, TokenInvalidoError } from "../lib/onboarding/tokens";
import {
  certificacionValidator,
  compoAccionariaItemValidator,
  conflictoInteresesValidator,
  contactoAdicionalValidator,
  infoTributariaProveedorValidator,
  plazoPagoValidator,
  referenciaComercialValidator,
  tipoDocumentoValidator,
  tipoPersonaValidator,
} from "./validators";

type SupplierDoc = Doc<"onboardingProveedores">;
const MODULO = "supplier" as const;
const FASES_CARGA: ReadonlySet<string> = new Set(["II_PENDIENTE_FORMULARIO", "III_REVISION_DOCUMENTAL"]);

async function guardForm(
  ctx: QueryCtx | MutationCtx,
  args: { inscripcionId: Id<"onboardingProveedores">; token: string },
  opts: { mutation?: boolean; scopes?: readonly ("FORM" | "SIGN")[]; allowViewOnly?: boolean } = {},
): Promise<SupplierDoc> {
  const { inscripcion } = await requireOnboardingToken(ctx, {
    modulo: MODULO,
    inscripcionId: args.inscripcionId,
    token: args.token,
    scopes: opts.scopes ?? ["FORM"],
    mutation: opts.mutation,
    allowViewOnly: opts.allowViewOnly,
  });
  return inscripcion as SupplierDoc;
}

/** Proyección segura de la inscripción para el tercero (sin puntajes internos ni notas). */
async function proyeccionPublica(ctx: QueryCtx | MutationCtx, ins: SupplierDoc) {
  const requeridos = await documentosRequeridosProveedor(ctx, ins);
  const revisiones = await listDocsProveedor(ctx, ins._id);
  const documentos: Record<string, Id<"_storage">> = { ...(ins.documentos_15 ?? {}) };
  if (ins.matriz_00.rutStorageId && !documentos.rutUltimoAnio) documentos.rutUltimoAnio = ins.matriz_00.rutStorageId;
  return {
    _id: ins._id,
    empresa: ins.empresa,
    faseActual: ins.faseActual,
    tipoProveedor: ins.tipoProveedor ?? "GENERAL",
    datos_generales_01: ins.datos_generales_01,
    actividadPrincipal_02: ins.actividadPrincipal_02,
    conflictoIntereses_03: ins.conflictoIntereses_03,
    infoTributaria_04: ins.infoTributaria_04,
    compoAccionaria_05: ins.compoAccionaria_05,
    contactos_09: ins.contactos_09,
    infoBancaria_10: ins.infoBancaria_10,
    referenciasComerciales_11: ins.referenciasComerciales_11,
    condicionesPago_12: ins.condicionesPago_12,
    adicionales_13: ins.adicionales_13,
    tipoEvaluacion_14: ins.tipoEvaluacion_14,
    isPep: ins.matriz_00.isPep,
    documentos,
    firmaRepresentante_16: ins.firmaRepresentante_16,
    firmadoEn: ins.firmadoEn,
    documentosRequeridos: requeridos,
    revisiones: revisiones.map((r) => ({
      docKey: r.docKey,
      docLabel: r.docLabel,
      estado: r.estado,
      observaciones: r.estado === "RECHAZADO" ? r.observaciones : undefined,
      storageId: r.storageId,
      fechaRevision: r.fechaRevision,
    })),
    motivoRechazo: ins.rechazadoCumplimiento?.motivoExterno ?? ins.rechazadoCompras?.motivoExterno,
    creadoEn: ins._creationTime,
  };
}

// ─── Lectura ─────────────────────────────────────────────────────────────────

/**
 * Proyección pública de la inscripción. Devuelve `null` (en vez de lanzar) cuando el enlace
 * es inválido, vencido o revocado, para que la página muestre la pantalla de enlace inválido.
 */
export const obtenerInscripcionPublica = query({
  args: { inscripcionId: v.id("onboardingProveedores"), token: v.string() },
  handler: async (ctx, args) => {
    let tokenRow;
    let ins: SupplierDoc;
    try {
      const result = await requireOnboardingToken(ctx, {
        modulo: MODULO,
        inscripcionId: args.inscripcionId,
        token: args.token,
        scopes: ["FORM", "SIGN"],
        allowViewOnly: true,
      });
      tokenRow = result.tokenRow;
      ins = result.inscripcion as SupplierDoc;
    } catch (error) {
      if (error instanceof TokenInvalidoError) return null;
      throw error;
    }
    const proyeccion = await proyeccionPublica(ctx, ins);
    return { ...proyeccion, acceso: { scope: tokenRow.scope, viewOnly: tokenRow.viewOnly === true, expiresAt: tokenRow.expiresAt } };
  },
});

export const obtenerUrlsArchivosPublico = query({
  args: { inscripcionId: v.id("onboardingProveedores"), token: v.string(), storageIds: v.array(v.id("_storage")) },
  returns: v.array(v.object({ storageId: v.id("_storage"), url: v.union(v.string(), v.null()) })),
  handler: async (ctx, args) => {
    const ins = await guardForm(ctx, args, { scopes: ["FORM", "SIGN"], allowViewOnly: true });
    if (args.storageIds.length > 50) throw new Error("Demasiados archivos.");
    return await urlsDeInscripcion(ctx, { modulo: MODULO, inscripcionId: ins._id }, ins, args.storageIds);
  },
});

// ─── Carga de archivos ───────────────────────────────────────────────────────

export const generateUploadUrlPublico = mutation({
  args: {
    inscripcionId: v.id("onboardingProveedores"),
    token: v.string(),
    tipoDocumento: tipoDocumentoValidator,
    numeroDocumento: v.string(),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const ins = await guardForm(ctx, args, { mutation: true });
    assertDocumentoCoincide(ins, args.tipoDocumento, args.numeroDocumento);
    if (!FASES_CARGA.has(ins.faseActual)) throw new Error("La inscripción no admite cargas en su fase actual.");
    return await ctx.storage.generateUploadUrl();
  },
});

// ─── Auto-guardado del formulario (Fase II) ──────────────────────────────────

// Sin tipoSolicitud: lo decide la consulta al ERP al iniciar el proceso y el tercero no puede cambiarlo.
const datosGeneralesPatch = v.object({
  tipoPersona: v.optional(tipoPersonaValidator),
  razonSocial: v.optional(v.string()),
  contactoNombre: v.optional(v.string()),
  contactoEmail: v.optional(v.string()),
  contactoCelular: v.optional(v.string()),
  direccion: v.optional(v.string()),
  ciudad: v.optional(v.string()),
  departamento: v.optional(v.string()),
  telefono: v.optional(v.string()),
  celular: v.optional(v.string()),
  email: v.optional(v.string()),
  website: v.optional(v.string()),
  representanteLegalNombre: v.optional(v.string()),
  representanteLegalTipoDocumento: v.optional(tipoDocumentoValidator),
  representanteLegalNumeroDocumento: v.optional(v.string()),
  representanteLegalEmail: v.optional(v.string()),
  representanteLegalTelefono: v.optional(v.string()),
  representanteLegalCelular: v.optional(v.string()),
  representanteLegalNombreContacto: v.optional(v.string()),
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
    inscripcionId: v.id("onboardingProveedores"),
    token: v.string(),
    tipoDocumento: tipoDocumentoValidator,
    numeroDocumento: v.string(),
    datos_generales_01: v.optional(datosGeneralesPatch),
    actividadPrincipal_02: v.optional(
      v.object({
        codigoCiiu: v.string(),
        checklist: v.optional(v.array(v.string())),
        actividadEconomica: v.optional(v.string()),
        descripcionServicio: v.optional(v.string()),
        cuentasExtranjero: v.optional(v.string()),
        transaccionesVirtuales: v.optional(v.string()),
      }),
    ),
    conflictoIntereses_03: v.optional(conflictoInteresesValidator),
    infoTributaria_04: v.optional(infoTributariaProveedorValidator),
    compoAccionaria_05: v.optional(v.array(compoAccionariaItemValidator)),
    contactos_09: v.optional(v.array(contactoAdicionalValidator)),
    infoBancaria_10: v.optional(
      v.object({
        tipoCuenta: v.union(v.literal("Ahorros"), v.literal("Corriente")),
        entidad: v.string(),
        numeroCuenta: v.string(),
        titular: v.string(),
        tipoDocumento: tipoDocumentoValidator,
        numeroDocumento: v.string(),
        email: v.string(),
      }),
    ),
    referenciasComerciales_11: v.optional(v.array(referenciaComercialValidator)),
    condicionesPago_12: v.optional(
      v.object({ formaPago: v.union(v.literal("Contado"), v.literal("Crédito")), plazo: plazoPagoValidator }),
    ),
    adicionales_13: v.optional(
      v.object({
        aniosExperiencia: v.number(),
        certificaciones: v.array(certificacionValidator),
        serviciosXGarantias: v.string(),
      }),
    ),
    documentos_15: v.optional(v.record(v.string(), v.id("_storage"))),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ins = await guardForm(ctx, args, { mutation: true });
    assertDocumentoCoincide(ins, args.tipoDocumento, args.numeroDocumento);
    if (ins.faseActual !== "II_PENDIENTE_FORMULARIO") {
      throw new Error("El formulario ya fue enviado; solo se admiten cargas de documentos.");
    }
    const updates: Partial<SupplierDoc> = {};
    if (args.datos_generales_01) {
      const patch = { ...args.datos_generales_01 };
      if (patch.contactoEmail !== undefined) patch.contactoEmail = patch.contactoEmail.trim().toLowerCase();
      if (patch.representanteLegalEmail !== undefined) patch.representanteLegalEmail = patch.representanteLegalEmail.trim().toLowerCase();
      updates.datos_generales_01 = { ...ins.datos_generales_01, ...patch };
      updates.searchText = buildOnboardingSearchText({
        NIT: ins.NIT,
        razonSocial: updates.datos_generales_01.razonSocial,
      });
    }
    if (args.actividadPrincipal_02) updates.actividadPrincipal_02 = { ...(ins.actividadPrincipal_02 ?? {}), ...args.actividadPrincipal_02 };
    if (args.conflictoIntereses_03) updates.conflictoIntereses_03 = args.conflictoIntereses_03;
    if (args.infoTributaria_04) {
      updates.infoTributaria_04 = mergeInfoTributariaProveedor(
        ins.infoTributaria_04 as Record<string, unknown> | undefined,
        args.infoTributaria_04 as Record<string, unknown>,
      ) as SupplierDoc["infoTributaria_04"];
    }
    if (args.compoAccionaria_05 !== undefined) updates.compoAccionaria_05 = args.compoAccionaria_05;
    if (args.contactos_09 !== undefined) updates.contactos_09 = args.contactos_09;
    if (args.infoBancaria_10) updates.infoBancaria_10 = args.infoBancaria_10;
    if (args.referenciasComerciales_11 !== undefined) updates.referenciasComerciales_11 = args.referenciasComerciales_11;
    if (args.condicionesPago_12) updates.condicionesPago_12 = args.condicionesPago_12;
    if (args.adicionales_13) updates.adicionales_13 = args.adicionales_13;
    if (args.documentos_15 !== undefined) updates.documentos_15 = { ...(ins.documentos_15 ?? {}), ...args.documentos_15 };
    if (Object.keys(updates).length > 0) await ctx.db.patch("onboardingProveedores", ins._id, updates);
    return null;
  },
});

// ─── Envío del formulario (II → IIA) ─────────────────────────────────────────

export const enviarFormulario = mutation({
  args: {
    inscripcionId: v.id("onboardingProveedores"),
    token: v.string(),
    tipoDocumento: tipoDocumentoValidator,
    numeroDocumento: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ins = await guardForm(ctx, args, { mutation: true });
    assertDocumentoCoincide(ins, args.tipoDocumento, args.numeroDocumento);
    if (ins.faseActual !== "II_PENDIENTE_FORMULARIO") {
      throw new Error(`La inscripción no está en Fase II (está en ${ins.faseActual}).`);
    }
    assertInfoTributariaProveedorParaEnvio(ins.infoTributaria_04, ins.datos_generales_01.tipoPersona);
    await assertDocumentosRequeridosCargados(ctx, ins);
    const representante = contactoFirmaDe(ins);
    if (!representante) throw new Error("Indique el correo del representante legal para continuar con la firma.");

    const now = Date.now();
    const faseII = await ctx.db
      .query("onboardingProveedoresFases")
      .withIndex("by_inscripcionId_fase", (q) => q.eq("inscripcionId", ins._id).eq("fase", "II_PENDIENTE_FORMULARIO"))
      .order("desc")
      .first();
    if (faseII) {
      await ctx.db.patch("onboardingProveedoresFases", faseII._id, {
        estado: "COMPLETADO",
        fechaCompletado: now,
        payload: { kind: "formulario", formularioEnviadoAt: now },
      });
    }
    await ctx.db.patch("onboardingProveedores", ins._id, { faseActual: "IIA_PENDIENTE_FIRMA", faseActualDesde: now });
    await ctx.db.insert("onboardingProveedoresFases", {
      inscripcionId: ins._id,
      empresa: ins.empresa,
      fase: "IIA_PENDIENTE_FIRMA",
      estado: "EN_PROGRESO",
      fechaInicio: now,
    });
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
  args: {
    inscripcionId: v.id("onboardingProveedores"),
    token: v.string(),
    tipoDocumento: tipoDocumentoValidator,
    numeroDocumento: v.string(),
    firmaDataUrl: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ins = await guardForm(ctx, args, { mutation: true, scopes: ["SIGN"] });
    assertDocumentoCoincide(ins, args.tipoDocumento, args.numeroDocumento);
    if (ins.faseActual !== "IIA_PENDIENTE_FIRMA") {
      throw new Error(`La inscripción no está pendiente de firma (está en ${ins.faseActual}).`);
    }
    const firma = args.firmaDataUrl.trim();
    if (!firma.startsWith("data:image/png;base64,") || firma.length < 100 || firma.length > 900_000) {
      throw new Error("La firma no es válida.");
    }
    const now = Date.now();
    await ctx.db.patch("onboardingProveedores", ins._id, { firmaRepresentante_16: firma, firmadoEn: now });

    const faseIIA = await ctx.db
      .query("onboardingProveedoresFases")
      .withIndex("by_inscripcionId_fase", (q) => q.eq("inscripcionId", ins._id).eq("fase", "IIA_PENDIENTE_FIRMA"))
      .order("desc")
      .first();
    if (faseIIA) {
      await ctx.db.patch("onboardingProveedoresFases", faseIIA._id, { estado: "COMPLETADO", fechaCompletado: now });
    }

    const firmado = { ...ins, firmaRepresentante_16: firma, firmadoEn: now };
    await materializarDocumentosProveedor(ctx, firmado, { accion: "FORMULARIO_FIRMADO", now });
    await ctx.db.patch("onboardingProveedores", ins._id, { faseActual: "III_REVISION_DOCUMENTAL", faseActualDesde: now });

    for (const lane of ["III_REVISION_DOCUMENTAL_CUMPLIMIENTO", "III_REVISION_DOCUMENTAL_COMPRAS"] as const) {
      const asignado = await resolverAsignado(ctx, MODULO, firmado, lane);
      await ctx.db.insert("onboardingProveedoresFases", {
        inscripcionId: ins._id,
        empresa: ins.empresa,
        fase: lane,
        estado: "EN_PROGRESO",
        asignadoA: asignado.userId,
        fechaInicio: now,
      });
    }

    await revokeTokens(ctx, { modulo: MODULO, inscripcionId: ins._id, scope: "SIGN", reason: "CONSUMED" });
    const dest = contactoTerceroDe(firmado);
    if (dest) {
      await programarNotificacion(ctx, {
        modulo: MODULO,
        tipo: "FORMULARIO_FIRMADO",
        ins: firmado,
        destinatarios: [dest],
        datos: { destinatarioTipo: "tercero" },
        conEnlaceTercero: true,
      });
    }
    return null;
  },
});

// ─── Carga o recarga de documentos (Fase III) ────────────────────────────────

export const cargarDocumentoRevision = mutation({
  args: {
    inscripcionId: v.id("onboardingProveedores"),
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
    if (ins.faseActual !== "III_REVISION_DOCUMENTAL") {
      throw new Error("Solo se pueden cargar documentos durante la revisión documental.");
    }
    const requeridos = await documentosRequeridosProveedor(ctx, ins);
    const requerido = requeridos.find((r) => r.docKey === args.docKey);
    const existente = await getDocProveedor(ctx, ins._id, args.docKey);
    if (!requerido && !existente) throw new Error("Documento no requerido para esta inscripción.");

    const now = Date.now();
    if (existente) {
      await ctx.db.patch("onboardingProveedoresDocumentos", existente._id, {
        storageId: args.storageId,
        estado: "EN_REVISION",
        revisadoPor: undefined,
        fechaRevision: undefined,
        observaciones: undefined,
        historial: [...(existente.historial ?? []), { accion: "CARGADO", fecha: now }],
      });
      const lane = FASE_LANE_POR_GRUPO[grupoDeDocumento(existente)];
      const faseRow = await ctx.db
        .query("onboardingProveedoresFases")
        .withIndex("by_inscripcionId_fase", (q) => q.eq("inscripcionId", ins._id).eq("fase", lane))
        .order("desc")
        .first();
      if (faseRow?.estado === "COMPLETADO") {
        await ctx.db.patch("onboardingProveedoresFases", faseRow._id, {
          estado: "EN_PROGRESO",
          fechaCompletado: undefined,
          completadoPor: undefined,
        });
      }
    } else if (requerido) {
      await ctx.db.insert("onboardingProveedoresDocumentos", {
        inscripcionId: ins._id,
        docKey: requerido.docKey,
        docLabel: requerido.docLabel,
        revisorRol: requerido.revisorRol,
        estado: "EN_REVISION",
        storageId: args.storageId,
        historial: [{ accion: "CARGADO", fecha: now }],
      });
    }
    await ctx.db.patch("onboardingProveedores", ins._id, {
      documentos_15: { ...(ins.documentos_15 ?? {}), [args.docKey]: args.storageId },
    });
    return null;
  },
});

export { storageCargadoDe };
