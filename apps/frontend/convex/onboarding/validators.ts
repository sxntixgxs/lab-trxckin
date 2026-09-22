import { v } from "convex/values";

// ─── Módulo / alcance ────────────────────────────────────────────────────────
export const moduloValidator = v.union(v.literal("supplier"), v.literal("customer"));
export const scopeValidator = v.union(v.literal("FORM"), v.literal("SIGN"));

// ─── Identidad ───────────────────────────────────────────────────────────────
export const tipoDocumentoValidator = v.union(
  v.literal("C.C."),
  v.literal("NIT"),
  v.literal("P.A."),
  v.literal("C.E"),
);
export const tipoPersonaValidator = v.union(v.literal("PERSONA_NATURAL"), v.literal("PERSONA_JURIDICA"));
export const tipoSolicitudValidator = v.union(v.literal("INSCRIPCIÓN"), v.literal("ACTUALIZACIÓN"));

// ─── Riesgo ──────────────────────────────────────────────────────────────────
export const riesgoNivelValidator = v.union(
  v.literal("BAJO"),
  v.literal("MEDIO"),
  v.literal("ALTO"),
  v.literal("SUPERIOR"),
  v.literal("INDEFINIDO"),
);
export const tipoEvaluacionValidator = v.union(
  v.literal("INTENSIFICADA"),
  v.literal("COMPLETA"),
  v.literal("SIMPLIFICADA"),
  v.literal("SOLO LISTAS"),
  v.literal("INDEFINIDO"),
);
export const listasValidator = v.union(v.literal("SÍ"), v.literal("NO"));

// ─── Fases y documentos ──────────────────────────────────────────────────────
export const estadoFaseValidator = v.union(
  v.literal("PENDIENTE"),
  v.literal("EN_PROGRESO"),
  v.literal("COMPLETADO"),
  v.literal("RECHAZADO"),
  v.literal("ANULADA"),
);
export const estadoDocumentoValidator = v.union(
  v.literal("PENDIENTE"),
  v.literal("EN_REVISION"),
  v.literal("APROBADO"),
  v.literal("RECHAZADO"),
);
export const decisionValidator = v.union(v.literal("APROBADO"), v.literal("RECHAZADO"));

export const supplierFaseActualValidator = v.union(
  v.literal("I_ANALISIS_RIESGO"),
  v.literal("II_PENDIENTE_FORMULARIO"),
  v.literal("IIA_PENDIENTE_FIRMA"),
  v.literal("III_REVISION_DOCUMENTAL"),
  v.literal("IV_APROBADO_CUMPLIMIENTO"),
  v.literal("V_EVALUACION_COMPRAS"),
  v.literal("VI_CREACION_CONTABILIDAD"),
  v.literal("COMPLETADO"),
  v.literal("RECHAZADO"),
  v.literal("ANULADA"),
);
export const supplierFaseFilaValidator = v.union(
  v.literal("I_ANALISIS_RIESGO"),
  v.literal("II_PENDIENTE_FORMULARIO"),
  v.literal("IIA_PENDIENTE_FIRMA"),
  v.literal("III_REVISION_DOCUMENTAL_COMPRAS"),
  v.literal("III_REVISION_DOCUMENTAL_CUMPLIMIENTO"),
  v.literal("IV_APROBADO_CUMPLIMIENTO"),
  v.literal("V_EVALUACION_COMPRAS"),
  v.literal("VI_CREACION_CONTABILIDAD"),
);
export const customerFaseActualValidator = v.union(
  v.literal("I_ANALISIS_RIESGO"),
  v.literal("II_PENDIENTE_FORMULARIO"),
  v.literal("IIA_PENDIENTE_FIRMA"),
  v.literal("III_REVISION_DOCUMENTAL"),
  v.literal("IIIA_APROBACION_CUMPLIMIENTO"),
  v.literal("IV_CREACION_CONTABILIDAD"),
  v.literal("COMPLETADO"),
  v.literal("RECHAZADO"),
  v.literal("ANULADA"),
);
export const customerFaseFilaValidator = v.union(
  v.literal("I_ANALISIS_RIESGO"),
  v.literal("II_PENDIENTE_FORMULARIO"),
  v.literal("IIA_PENDIENTE_FIRMA"),
  v.literal("III_REVISION_DOCUMENTAL"),
  v.literal("IIIA_APROBACION_CUMPLIMIENTO"),
  v.literal("IV_CREACION_CONTABILIDAD"),
);

/** Payload tipado de una fila de fase (una variante por tipo de cierre). */
export const fasePayloadValidator = v.union(
  v.object({
    kind: v.literal("faseI"),
    riesgo: v.string(),
    tipoEvaluacion: v.string(),
    tipoSolicitud: v.optional(tipoSolicitudValidator),
    automatico: v.boolean(),
    formaPago: v.optional(v.string()),
    plazo: v.optional(v.string()),
    listas: v.optional(v.string()),
  }),
  v.object({
    kind: v.literal("formulario"),
    formularioEnviadoAt: v.number(),
  }),
  v.object({
    kind: v.literal("decision"),
    decision: decisionValidator,
    motivoRechazo: v.optional(v.string()),
    observaciones: v.optional(v.string()),
    completadoPorNombre: v.optional(v.string()),
  }),
  v.object({
    kind: v.literal("rechazo"),
    motivoExterno: v.string(),
    motivoInterno: v.string(),
  }),
  v.object({
    kind: v.literal("evaluacion"),
    evaluacionId: v.string(),
    calificacionGeneral: v.number(),
    isAprobado: v.boolean(),
  }),
);

export const historialDocValidator = v.array(
  v.object({
    accion: v.string(),
    fecha: v.number(),
    userId: v.optional(v.string()),
    nota: v.optional(v.string()),
  }),
);

// ─── Roles ───────────────────────────────────────────────────────────────────
export const rolCumplimientoValidator = v.union(
  v.literal("CUMPLIMIENTO_LOW_RISK"),
  v.literal("CUMPLIMIENTO_MEDIUM_RISK"),
  v.literal("CUMPLIMIENTO_HIGH_RISK"),
);
export const rolValidator = v.union(
  v.literal("CUMPLIMIENTO_LOW_RISK"),
  v.literal("CUMPLIMIENTO_MEDIUM_RISK"),
  v.literal("CUMPLIMIENTO_HIGH_RISK"),
  v.literal("COMPRAS"),
  v.literal("FINANCIERO"),
  v.literal("CONTABILIDAD"),
);
/** Carril revisor de un documento en Fase III. */
export const revisorRolValidator = v.union(v.literal("CUMPLIMIENTO_LOW_RISK"), v.literal("COMPRAS"));
export const permisoWhitelistValidator = v.union(v.literal("CONSULTA"), v.literal("CONSULTA_CREACION"));

// ─── Correos ─────────────────────────────────────────────────────────────────
export const correoEstadoValidator = v.union(
  v.literal("PENDIENTE"),
  v.literal("ENVIADO"),
  v.literal("ENTREGADO"),
  v.literal("DEMORADO"),
  v.literal("FALLIDO"),
);
export const origenCorreoValidator = v.union(
  v.literal("INICIAL"),
  v.literal("AUTOMATICO"),
  v.literal("REENVIO"),
  v.literal("RESTAURACION_FASE"),
);
export const correoResumenItemValidator = v.object({
  correoId: v.id("onboardingCorreos"),
  estado: correoEstadoValidator,
  email: v.string(),
  numeroIntento: v.number(),
  actualizadoEn: v.number(),
  falloResumen: v.optional(v.string()),
});
export const correoResumenValidator = v.object({
  form: v.optional(correoResumenItemValidator),
  sign: v.optional(correoResumenItemValidator),
});

// ─── Bloques compartidos por ambos módulos ───────────────────────────────────
export const compoAccionariaItemValidator = v.object({
  nombre: v.string(),
  tipoDocumento: tipoDocumentoValidator,
  numeroDocumento: v.string(),
  porcentajeParticipacion: v.number(),
  nacionalidad: v.string(),
  isPep: v.object({
    ejerceActualmente: v.boolean(),
    cargo: v.string(),
    fechaInicio: v.number(),
    fechaFin: v.optional(v.number()),
    dataCercanos: v.string(),
    cuentasExtranjero: v.boolean(),
    fideicomisos: v.array(
      v.object({
        nombre: v.string(),
        tipoDocumento: tipoDocumentoValidator,
        numeroDocumento: v.string(),
      }),
    ),
  }),
  ifNatural: v.object({
    isAccionista: v.boolean(),
    nombreEmpresa: v.string(),
    nitEmpresa: v.string(),
  }),
});

export const contactoAdicionalValidator = v.object({
  nombre: v.string(),
  area: v.string(),
  cargo: v.string(),
  email: v.string(),
  celular: v.string(),
});

export const referenciaComercialValidator = v.object({
  nombre: v.string(),
  ciudad: v.string(),
  telefono: v.string(),
  personaContacto: v.string(),
  tiempoProveedor: v.string(),
});

export const certificacionValidator = v.object({
  nombre: v.string(),
  alcance: v.string(),
});

export const conflictoInteresesValidator = v.object({
  representanteLegalXColaborador: v.boolean(),
  funcionariosExEmpresa: v.boolean(),
  gerentesXEmpresa: v.boolean(),
  sociosXProveedorEmpresa: v.boolean(),
  profesionalesVinculadosXEmpresa: v.boolean(),
  accionistasRelacionadosXEmpresa: v.boolean(),
});

export const plazoPagoValidator = v.union(
  v.literal("NA"),
  v.literal("15 días"),
  v.literal("30 días"),
  v.literal("60 días"),
  v.literal("90 días"),
  v.literal("120 días"),
);

export const devolucionFaseValidator = v.object({
  faseOrigen: v.string(),
  faseDestino: v.string(),
  motivo: v.string(),
  devueltoPorUserId: v.string(),
  fecha: v.number(),
});

export const ajusteRiesgoValidator = v.object({
  fecha: v.number(),
  ajustadoPorUserId: v.string(),
  observacion: v.string(),
  pepAnterior: v.boolean(),
  pepNuevo: v.boolean(),
  listasAnterior: v.string(),
  listasNuevo: v.string(),
  riesgoAnterior: v.string(),
  riesgoNuevo: v.string(),
  tipoEvaluacionAnterior: v.string(),
  tipoEvaluacionNuevo: v.string(),
  docsAgregados: v.array(v.object({ docKey: v.string(), docLabel: v.string() })),
});

export const anulacionValidator = v.object({
  porUserId: v.string(),
  fecha: v.number(),
  motivo: v.string(),
});

/** Rechazo con motivo visible al tercero y motivo interno. */
export const rechazoValidator = v.object({
  motivoExterno: v.string(),
  motivoInterno: v.string(),
  fechaRechazo: v.number(),
  rechazadoPorUserId: v.string(),
});

/**
 * Información tributaria del PROVEEDOR. Todos los subcampos son opcionales para que el
 * auto-guardado del formulario acepte datos parciales; las reglas condicionales se
 * validan al enviar (`assertInfoTributariaProveedorParaEnvio`).
 */
export const infoTributariaProveedorValidator = v.object({
  aiu: v.optional(v.number()),
  aiuA: v.optional(v.number()),
  aiuI: v.optional(v.number()),
  aiuU: v.optional(v.number()),
  actividadesEconomicasExtranjeras: v.optional(v.string()),
  tipoReteFuenteIfPersonaNatural: v.optional(v.string()),
  tarifaReteFuente: v.optional(v.number()),
  tarifaReteIvaRST: v.optional(v.number()),
  origenFondos: v.optional(v.string()),
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
    }),
  ),
  impuestoVentas: v.optional(
    v.object({
      responsableIva: v.optional(v.boolean()),
      retencionIva: v.optional(v.boolean()),
    }),
  ),
  impuestoIndustriaYComercio: v.optional(
    v.object({
      responsableImpuesto: v.optional(v.boolean()),
      municipiosIcaResponsable: v.optional(v.array(v.string())),
      granContribuyenteBogota: v.optional(
        v.object({
          es: v.optional(v.boolean()),
          resolucion: v.optional(v.string()),
          fechaResolucion: v.optional(v.number()),
        }),
      ),
    }),
  ),
  sujetoReteIca: v.optional(
    v.object({
      es: v.optional(v.boolean()),
      municipios: v.optional(v.array(v.string())),
      tarifa: v.optional(v.number()),
    }),
  ),
  autorretenedorIca: v.optional(
    v.object({
      es: v.optional(v.boolean()),
      municipios: v.optional(v.array(v.string())),
    }),
  ),
});
