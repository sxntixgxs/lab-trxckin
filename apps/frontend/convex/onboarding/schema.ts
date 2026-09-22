import { defineTable } from "convex/server";
import { v } from "convex/values";
import {
  ajusteRiesgoValidator,
  anulacionValidator,
  certificacionValidator,
  compoAccionariaItemValidator,
  conflictoInteresesValidator,
  contactoAdicionalValidator,
  correoEstadoValidator,
  correoResumenValidator,
  customerFaseActualValidator,
  customerFaseFilaValidator,
  devolucionFaseValidator,
  estadoDocumentoValidator,
  estadoFaseValidator,
  fasePayloadValidator,
  historialDocValidator,
  infoTributariaProveedorValidator,
  moduloValidator,
  origenCorreoValidator,
  permisoWhitelistValidator,
  plazoPagoValidator,
  rechazoValidator,
  referenciaComercialValidator,
  revisorRolValidator,
  riesgoNivelValidator,
  rolValidator,
  scopeValidator,
  supplierFaseActualValidator,
  supplierFaseFilaValidator,
  tipoDocumentoValidator,
  tipoEvaluacionValidator,
  tipoPersonaValidator,
  tipoSolicitudValidator,
} from "./validators";

// ═══════════════════════════════════════════════════════════════════════════
// PROVEEDORES
// ═══════════════════════════════════════════════════════════════════════════

export const onboardingProveedores = defineTable({
  empresa: v.number(),
  /** Dígitos del número de documento (búsqueda por NIT). */
  NIT: v.string(),
  tipoProveedor: v.optional(v.string()),
  faseActual: supplierFaseActualValidator,
  /** Instante en que la inscripción entró en `faseActual` (evita N+1 sobre las fases en el tablero). */
  faseActualDesde: v.optional(v.number()),

  matriz_00: v.object({
    responsableId: v.string(),
    rutStorageId: v.optional(v.id("_storage")),
    servicioSuministrado: v.string(),
    montoAnual: v.string(),
    actividadEconomicaPrincipal: v.string(),
    codigoCiiuSecundario: v.string(),
    actividadEconomicaSecundaria: v.string(),
    sectorEconomico: v.string(),
    jurisdiccionNacional: v.string(),
    jurisdiccionInternacional: v.string(),
    isPep: v.boolean(),
    listas: v.string(),
    riesgo: riesgoNivelValidator,
  }),
  datos_generales_01: v.object({
    tipoSolicitud: v.optional(tipoSolicitudValidator),
    tipoPersona: tipoPersonaValidator,
    tipoDocumento: tipoDocumentoValidator,
    numeroDocumento: v.string(),
    razonSocial: v.string(),
    contactoNombre: v.string(),
    contactoEmail: v.string(),
    contactoCelular: v.string(),
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
  }),
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
    v.object({
      formaPago: v.union(v.literal("Contado"), v.literal("Crédito")),
      plazo: plazoPagoValidator,
    }),
  ),
  adicionales_13: v.optional(
    v.object({
      aniosExperiencia: v.number(),
      certificaciones: v.array(certificacionValidator),
      serviciosXGarantias: v.string(),
    }),
  ),
  tipoEvaluacion_14: tipoEvaluacionValidator,
  /** Documentos cargados: docKey → storageId (el formulario no se carga, se diligencia). */
  documentos_15: v.optional(v.record(v.string(), v.id("_storage"))),
  /** PNG (data URL) de la firma dibujada por el representante legal. */
  firmaRepresentante_16: v.optional(v.string()),
  firmadoEn: v.optional(v.number()),
  /** Registro opcional al cerrar Fase VI (SIESA): discrepancias respecto al formulario inscrito. */
  notasContabilidadFaseVI: v.optional(
    v.object({
      justificacionCambios: v.string(),
      archivosSoporte: v.array(v.object({ storageId: v.id("_storage"), nombre: v.string() })),
      registradoEn: v.number(),
    }),
  ),
  rechazadoCumplimiento: v.optional(rechazoValidator),
  rechazadoCompras: v.optional(rechazoValidator),
  anulacion: v.optional(anulacionValidator),
  devolucionesFase: v.optional(v.array(devolucionFaseValidator)),
  ajustesRiesgoCumplimiento: v.optional(v.array(ajusteRiesgoValidator)),
  correoResumen: v.optional(correoResumenValidator),
})
  .index("by_empresa", ["empresa"])
  .index("by_empresa_faseActual", ["empresa", "faseActual"])
  .index("by_NIT", ["NIT"])
  .index("by_responsableId", ["matriz_00.responsableId"]);

export const onboardingProveedoresFases = defineTable({
  inscripcionId: v.id("onboardingProveedores"),
  empresa: v.number(),
  fase: supplierFaseFilaValidator,
  estado: estadoFaseValidator,
  asignadoA: v.optional(v.string()),
  fechaInicio: v.optional(v.number()),
  fechaCompletado: v.optional(v.number()),
  completadoPor: v.optional(v.string()),
  observaciones: v.optional(v.string()),
  payload: v.optional(fasePayloadValidator),
})
  .index("by_inscripcionId", ["inscripcionId"])
  .index("by_inscripcionId_fase", ["inscripcionId", "fase"])
  .index("by_asignadoA_estado", ["asignadoA", "estado"])
  .index("by_fase_estado", ["fase", "estado"])
  .index("by_empresa_fase_estado", ["empresa", "fase", "estado"]);

export const onboardingProveedoresDocumentos = defineTable({
  inscripcionId: v.id("onboardingProveedores"),
  docKey: v.string(),
  docLabel: v.string(),
  estado: estadoDocumentoValidator,
  revisorRol: revisorRolValidator,
  storageId: v.optional(v.id("_storage")),
  revisadoPor: v.optional(v.string()),
  fechaRevision: v.optional(v.number()),
  observaciones: v.optional(v.string()),
  historial: v.optional(historialDocValidator),
})
  .index("by_inscripcionId", ["inscripcionId"])
  .index("by_inscripcionId_docKey", ["inscripcionId", "docKey"])
  .index("by_inscripcionId_estado", ["inscripcionId", "estado"]);

export const onboardingProveedoresTipos = defineTable({
  empresa: v.number(),
  key: v.string(),
  label: v.string(),
  activo: v.boolean(),
  extraDocs: v.array(
    v.object({
      docKey: v.string(),
      docLabel: v.string(),
      revisorRol: revisorRolValidator,
    }),
  ),
})
  .index("by_empresa", ["empresa"])
  .index("by_empresa_key", ["empresa", "key"])
  .index("by_empresa_activo", ["empresa", "activo"]);

export const onboardingProveedoresEvaluaciones = defineTable({
  inscripcionId: v.id("onboardingProveedores"),
  evaluadorUserId: v.string(),
  experiencia: v.union(v.number(), v.null()),
  referencias: v.union(v.number(), v.null()),
  portfolio: v.union(v.number(), v.null()),
  certificados: v.union(v.number(), v.null()),
  garantias: v.union(v.number(), v.null()),
  fichasTecnicas: v.union(v.number(), v.null()),
  formaPago: v.union(v.number(), v.null()),
  sstAmbiental: v.union(v.number(), v.null()),
  calificacionGeneral: v.number(),
  isAprobado: v.boolean(),
}).index("by_inscripcionId", ["inscripcionId"]);

// ═══════════════════════════════════════════════════════════════════════════
// CLIENTES
// ═══════════════════════════════════════════════════════════════════════════

export const onboardingClientes = defineTable({
  empresa: v.number(),
  NIT: v.string(),
  faseActual: customerFaseActualValidator,
  faseActualDesde: v.optional(v.number()),

  matriz_00: v.object({
    responsableId: v.string(),
    rutStorageId: v.optional(v.id("_storage")),
    cotizacionStorageId: v.optional(v.id("_storage")),
    servicioSuministrado: v.string(),
    montoAnual: v.string(),
    sectorEconomico: v.string(),
    jurisdiccionNacional: v.string(),
    jurisdiccionInternacional: v.string(),
    isPep: v.boolean(),
    listas: v.string(),
    riesgo: riesgoNivelValidator,
  }),
  datos_generales_01: v.object({
    tipoSolicitud: v.optional(tipoSolicitudValidator),
    tipoPersona: tipoPersonaValidator,
    tipoDocumento: tipoDocumentoValidator,
    numeroDocumento: v.string(),
    razonSocial: v.string(),
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
  }),
  actividadEconomica_02: v.optional(
    v.object({
      codigoCiiu: v.string(),
      actividadEconomica: v.optional(v.string()),
      descripcionServicio: v.optional(v.string()),
      cuentasExtranjero: v.optional(v.string()),
      transaccionesVirtuales: v.optional(v.string()),
      codigoCiiuSecundario: v.optional(v.string()),
      actividadEconomicaSecundaria: v.optional(v.string()),
    }),
  ),
  conflictoIntereses_03: v.optional(conflictoInteresesValidator),
  /** Campos en su mayoría opcionales; las reglas condicionales se validan al enviar el formulario. */
  infoTributaria_04: v.optional(
    v.object({
      impuestoRenta: v.optional(
        v.object({
          contribuyente: v.optional(v.boolean()),
          calidadContribuyente: v.optional(
            v.union(
              v.literal("ORDINARIO"),
              v.literal("ESPECIAL_SIN_ANIMO_LUCRO"),
              v.literal("RST"),
              v.literal("NO_CONTRIBUYENTE"),
            ),
          ),
          regimenOrdinario: v.optional(v.boolean()),
          regimenEspecial: v.optional(v.boolean()),
          regimenSimple: v.optional(v.boolean()),
          granContribuyente: v.optional(v.boolean()),
          autorretenedorRenta: v.optional(v.boolean()),
          resolucion: v.optional(v.string()),
          fechaResolucion: v.optional(v.number()),
          resolucionAutorretenedor: v.optional(v.string()),
          tarifaRetencionFuente: v.optional(v.string()),
          baseRetencionFuente: v.optional(v.string()),
        }),
      ),
      impuestoVentas: v.optional(
        v.object({
          responsableIva: v.optional(v.boolean()),
          retencionIva: v.optional(v.boolean()),
          tarifaRetencionIva: v.optional(v.string()),
        }),
      ),
      impuestoIndustriaYComercio: v.optional(
        v.object({
          responsableImpuesto: v.optional(v.boolean()),
          municipios: v.optional(v.array(v.string())),
          esGranContribuyenteIcaBogota: v.optional(v.boolean()),
          resolucionGranContribuyenteIca: v.optional(v.string()),
        }),
      ),
      basesReteFuente: v.optional(
        v.object({
          practicaReteFuente: v.optional(v.boolean()),
          cualBase: v.optional(v.string()),
          practicaReteIca: v.optional(v.boolean()),
          whichBase: v.optional(v.string()),
          municipiosRetIca: v.optional(v.array(v.string())),
          tarifaRetencionIca: v.optional(v.string()),
        }),
      ),
      correoFacturacionElectronica: v.optional(v.string()),
      contactoCertificadosRetencion: v.optional(
        v.object({
          nombre: v.optional(v.string()),
          correo: v.optional(v.string()),
          telefono: v.optional(v.string()),
        }),
      ),
    }),
  ),
  compoAccionaria_05: v.optional(v.array(compoAccionariaItemValidator)),
  contactos_06: v.optional(v.array(contactoAdicionalValidator)),
  radicacionFactura_07: v.optional(
    v.object({
      direccion: v.string(),
      correoFacturacion: v.string(),
      fechaMaximaRadicacion: v.number(),
    }),
  ),
  datosCuentasPagos_08: v.optional(
    v.array(
      v.object({
        tipoCuenta: v.union(v.literal("Ahorros"), v.literal("Corriente")),
        entidad: v.string(),
        numeroCuenta: v.string(),
        titular: v.string(),
        tipoDocumento: v.optional(tipoDocumentoValidator),
        numeroDocumento: v.optional(v.string()),
        email: v.optional(v.string()),
        ciudad: v.optional(v.string()),
        departamento: v.optional(v.string()),
      }),
    ),
  ),
  tipoEvaluacion: tipoEvaluacionValidator,
  documentos_09: v.optional(v.record(v.string(), v.id("_storage"))),
  firmaRepresentante_10: v.optional(v.string()),
  firmadoEn: v.optional(v.number()),
  referenciasComerciales_11: v.optional(v.array(referenciaComercialValidator)),
  condicionesPago_12: v.optional(
    v.object({
      formaPago: v.union(v.literal("Anticipado"), v.literal("Contado"), v.literal("Crédito")),
      plazo: plazoPagoValidator,
    }),
  ),
  adicionales_13: v.optional(
    v.object({
      aniosExperiencia: v.number(),
      certificaciones: v.optional(v.array(certificacionValidator)),
      serviciosXGarantias: v.optional(v.string()),
    }),
  ),
  /** Texto libre al cerrar Fase IV (Contabilidad); se incluye al final del PDF del formulario. */
  notasContabilidadFaseIV: v.optional(v.string()),
  rechazadoCumplimiento: v.optional(rechazoValidator),
  anulacion: v.optional(anulacionValidator),
  devolucionesFase: v.optional(v.array(devolucionFaseValidator)),
  ajustesRiesgoCumplimiento: v.optional(v.array(ajusteRiesgoValidator)),
  correoResumen: v.optional(correoResumenValidator),
})
  .index("by_empresa", ["empresa"])
  .index("by_empresa_faseActual", ["empresa", "faseActual"])
  .index("by_NIT", ["NIT"])
  .index("by_responsableId", ["matriz_00.responsableId"]);

export const onboardingClientesFases = defineTable({
  inscripcionId: v.id("onboardingClientes"),
  empresa: v.number(),
  fase: customerFaseFilaValidator,
  estado: estadoFaseValidator,
  asignadoA: v.optional(v.string()),
  fechaInicio: v.optional(v.number()),
  fechaCompletado: v.optional(v.number()),
  completadoPor: v.optional(v.string()),
  observaciones: v.optional(v.string()),
  payload: v.optional(fasePayloadValidator),
})
  .index("by_inscripcionId", ["inscripcionId"])
  .index("by_inscripcionId_fase", ["inscripcionId", "fase"])
  .index("by_asignadoA_estado", ["asignadoA", "estado"])
  .index("by_fase_estado", ["fase", "estado"])
  .index("by_empresa_fase_estado", ["empresa", "fase", "estado"]);

export const onboardingClientesDocumentos = defineTable({
  inscripcionId: v.id("onboardingClientes"),
  docKey: v.string(),
  docLabel: v.string(),
  estado: estadoDocumentoValidator,
  revisorRol: revisorRolValidator,
  storageId: v.optional(v.id("_storage")),
  revisadoPor: v.optional(v.string()),
  fechaRevision: v.optional(v.number()),
  observaciones: v.optional(v.string()),
  historial: v.optional(historialDocValidator),
})
  .index("by_inscripcionId", ["inscripcionId"])
  .index("by_inscripcionId_docKey", ["inscripcionId", "docKey"])
  .index("by_inscripcionId_estado", ["inscripcionId", "estado"]);

// ═══════════════════════════════════════════════════════════════════════════
// COMPARTIDO: roles, whitelist, tokens, correos
// ═══════════════════════════════════════════════════════════════════════════

export const onboardingRoles = defineTable({
  modulo: moduloValidator,
  empresa: v.number(),
  rol: rolValidator,
  userId: v.string(),
  nombre: v.string(),
  email: v.string(),
})
  .index("by_modulo_empresa", ["modulo", "empresa"])
  .index("by_modulo_empresa_rol", ["modulo", "empresa", "rol"])
  .index("by_modulo_userId", ["modulo", "userId"]);

export const onboardingWhitelist = defineTable({
  modulo: moduloValidator,
  empresa: v.number(),
  userId: v.string(),
  nombre: v.string(),
  email: v.string(),
  permiso: permisoWhitelistValidator,
})
  .index("by_modulo_empresa", ["modulo", "empresa"])
  .index("by_modulo_empresa_userId", ["modulo", "empresa", "userId"])
  .index("by_modulo_userId", ["modulo", "userId"]);

const tokenCommon = {
  scope: scopeValidator,
  /** SHA-256 (hex) del token en claro; el token nunca se almacena. */
  tokenHash: v.string(),
  createdAt: v.number(),
  expiresAt: v.number(),
  revokedAt: v.optional(v.number()),
  revokedReason: v.optional(
    v.union(
      v.literal("ROTATED"),
      v.literal("EXPIRED"),
      v.literal("PHASE_ADVANCED"),
      v.literal("PHASE_RESTORED"),
      v.literal("MANUAL"),
      v.literal("CONSUMED"),
    ),
  ),
  lastUsedAt: v.optional(v.number()),
  issuedByUserId: v.optional(v.string()),
  correoId: v.optional(v.id("onboardingCorreos")),
  /** Enlace de solo lectura (visor interno del formato); no permite firmar ni editar. */
  viewOnly: v.optional(v.boolean()),
};

export const onboardingAccessTokens = defineTable(
  v.union(
    v.object({ modulo: v.literal("supplier"), inscripcionId: v.id("onboardingProveedores"), ...tokenCommon }),
    v.object({ modulo: v.literal("customer"), inscripcionId: v.id("onboardingClientes"), ...tokenCommon }),
  ),
)
  .index("by_tokenHash", ["tokenHash"])
  .index("by_modulo_inscripcionId_scope", ["modulo", "inscripcionId", "scope"]);

const correoCommon = {
  /** Enlace que transporta el correo: formulario (FORM) o firma (SIGN). */
  handoff: scopeValidator,
  tipoNotificacion: v.string(),
  origen: origenCorreoValidator,
  destinatarioNombre: v.string(),
  destinatarioEmail: v.string(),
  numeroIntento: v.number(),
  estado: correoEstadoValidator,
  solicitadoPorUserId: v.optional(v.string()),
  resendEmailId: v.optional(v.string()),
  codigoFallo: v.optional(v.string()),
  detalleFallo: v.optional(v.string()),
  tokenId: v.optional(v.id("onboardingAccessTokens")),
  creadoEn: v.number(),
  enviadoEn: v.optional(v.number()),
  entregadoEn: v.optional(v.number()),
  fallidoEn: v.optional(v.number()),
  actualizadoEn: v.number(),
  ultimoEventoProveedorEn: v.optional(v.number()),
};

export const onboardingCorreos = defineTable(
  v.union(
    v.object({ modulo: v.literal("supplier"), inscripcionId: v.id("onboardingProveedores"), ...correoCommon }),
    v.object({ modulo: v.literal("customer"), inscripcionId: v.id("onboardingClientes"), ...correoCommon }),
  ),
)
  .index("by_modulo_inscripcionId_creadoEn", ["modulo", "inscripcionId", "creadoEn"])
  .index("by_resendEmailId", ["resendEmailId"]);

export const onboardingCorreoEventos = defineTable({
  correoId: v.id("onboardingCorreos"),
  resendEmailId: v.string(),
  svixId: v.string(),
  tipoEvento: v.string(),
  eventoProveedorEn: v.number(),
  recibidoEn: v.number(),
  detalleFallo: v.optional(v.string()),
})
  .index("by_svixId", ["svixId"])
  .index("by_correoId_eventoProveedorEn", ["correoId", "eventoProveedorEn"]);
