import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  cajasMenores,
  cajasMenoresConfig,
  cajasMenoresReembolsoAdjuntos,
  cajasMenoresReembolsoContadores,
  cajasMenoresReembolsoEventos,
  cajasMenoresReembolsos,
  cajasMenoresRefills,
  cajasMenoresRolesConfig,
  facturacionCajaMenorLegalizaciones,
  facturacionCajaMenorMovimientos,
} from "./cajasMenores";
import {
  anticipos,
  anticiposAjustes,
  anticiposDesembolsoAdjuntos,
  anticiposFases,
  anticiposRolesConfig,
  bolsasAnticipos,
} from "./financiero/anticipos";
import {
  onboardingAccessTokens,
  onboardingClientes,
  onboardingClientesDocumentos,
  onboardingClientesFases,
  onboardingCorreoEventos,
  onboardingCorreos,
  onboardingProveedores,
  onboardingProveedoresDocumentos,
  onboardingProveedoresEvaluaciones,
  onboardingProveedoresFases,
  onboardingProveedoresTipos,
  onboardingRoles,
  onboardingWhitelist,
} from "./onboarding/schema";
import { cajaMenorContextoValidator } from "./lib/cajaMenorAuditoria";
import { centrosCostoDistribucionValidator } from "./lib/centrosCostoDistribucion";
import {
  peajesCentroCostoAsignacionValidator,
  peajesCentroCostoRefValidator,
} from "./lib/peajesCentroCosto";

export default defineSchema({
  users: defineTable({
    tokenIdentifier: v.string(),
    workosUserId: v.string(),
    email: v.string(),
    name: v.string(),
    nestUserId: v.optional(v.string()),
    role: v.union(v.literal("admin"), v.literal("member")),
    permisos: v.optional(v.array(v.string())),
    hasFullAccess: v.optional(v.boolean()),
    procesoId: v.optional(v.number()),
    procesoNombre: v.optional(v.string()),
    cargo: v.optional(v.string()),
    jefeDirectoUserId: v.optional(v.string()),
    liderProceso: v.optional(v.boolean()),
    empresas: v.optional(v.array(v.number())),
    accesoTodasEmpresas: v.optional(v.boolean()),
  })
    .index("by_tokenIdentifier", ["tokenIdentifier"])
    .index("by_workosUserId", ["workosUserId"])
    .index("by_nestUserId", ["nestUserId"])
    .index("by_email", ["email"]),

  // ========== FACTURACION ELECTRONICA ==========
  facturacionCorreos: defineTable({
    empresa: v.optional(v.number()),
    cuentaRecepcionEmail: v.optional(v.string()),
    graphMessageId: v.string(),
    conversationId: v.optional(v.string()),
    subject: v.string(),
    from: v.string(),
    toRecipients: v.array(v.string()),
    bodyPreview: v.string(),
    bodyContent: v.optional(v.string()),
    receivedDateTime: v.string(),
    isRead: v.boolean(),
    hasAttachments: v.boolean(),
    importance: v.string(),
    attachments: v.optional(
      v.array(
        v.object({
          graphAttachmentId: v.string(),
          storageId: v.id("_storage"),
          name: v.string(),
          contentType: v.optional(v.union(v.string(), v.null())),
          size: v.optional(v.union(v.number(), v.null())),
          isInline: v.boolean(),
        })
      )
    ),
    attachmentImportStatus: v.optional(
      v.union(
        v.literal("none"),
        v.literal("pending"),
        v.literal("complete"),
        v.literal("partial"),
        v.literal("failed"),
        v.literal("skipped")
      )
    ),
    facturaId: v.optional(v.id("facturacionFacturas")),
    // Un correo puede traer varios XML => varias facturas.
    facturaIds: v.optional(v.array(v.id("facturacionFacturas"))),
    procesado: v.boolean(),
    omitidoMotivo: v.optional(v.string()),
    intentosProcesamiento: v.optional(v.number()),
    ultimoIntentoEn: v.optional(v.number()),
    ultimoError: v.optional(v.string()),
  })
    .index("by_graphMessageId", ["graphMessageId"])
    .index("by_procesado", ["procesado"])
    .index("by_facturaId", ["facturaId"])
    .index("by_empresa", ["empresa"])
    .index("by_empresa_procesado", ["empresa", "procesado"]),

  // Estado de sincronización Graph por cuenta de recepción (watermark + lease).
  facturacionSyncCuentas: defineTable({
    empresa: v.number(),
    email: v.string(),
    // receivedDateTime (ISO) del último correo procesado sin errores de captura.
    watermarkReceivedDateTime: v.optional(v.string()),
    leaseHasta: v.optional(v.number()),
    ultimaCorridaEn: v.optional(v.number()),
    ultimaAlertaEn: v.optional(v.number()),
    ultimoResultado: v.optional(
      v.object({
        synced: v.number(),
        processed: v.number(),
        failed: v.number(),
        total: v.number(),
        error: v.optional(v.string()),
      })
    ),
  }).index("by_email", ["email"]),

  // Bitácora de corridas de sincronización/reproceso de la bandeja.
  facturacionSyncRuns: defineTable({
    origen: v.union(
      v.literal("cron"),
      v.literal("manual"),
      v.literal("continuacion"),
      v.literal("reproceso"),
      v.literal("backfill")
    ),
    inicioEn: v.number(),
    finEn: v.number(),
    synced: v.number(),
    processed: v.number(),
    failed: v.number(),
    total: v.number(),
    cuentas: v.array(
      v.object({
        email: v.string(),
        empresa: v.number(),
        synced: v.number(),
        processed: v.number(),
        failed: v.number(),
        total: v.number(),
        error: v.optional(v.string()),
        hayMasTrabajo: v.optional(v.boolean()),
        leaseOcupado: v.optional(v.boolean()),
      })
    ),
  }).index("by_inicioEn", ["inicioEn"]),

  facturacionFacturas: defineTable({
    empresa: v.optional(v.number()),
    numeroFactura: v.string(),
    cufe: v.optional(v.string()),
    tipoDocumento: v.string(),
    tipoDocumentoNormalizado: v.optional(v.string()),
    documentoClase: v.optional(
      v.union(
        v.literal("factura"),
        v.literal("nota_credito"),
        v.literal("nota_debito"),
        v.literal("otro")
      )
    ),
    proveedorNit: v.string(),
    proveedorNitNormalizado: v.optional(v.string()),
    numeroFacturaNormalizado: v.optional(v.string()),
    esPeaje: v.optional(v.boolean()),
    rolOperacion: v.optional(v.union(v.literal("PEAJES"))),
    peajesCruce: v.optional(
      v.object({
        fuente: v.literal("peajes_excel"),
        operacionId: v.id("facturacionPeajesOperaciones"),
        legalizacionIds: v.array(v.id("facturacionAnticipoLegalizaciones")),
        aplicadoEn: v.number(),
        valorBruto: v.number(),
        valorNotasCredito: v.number(),
        valorNeto: v.number(),
        notasCredito: v.array(
          v.object({
            notaCreditoId: v.id("facturacionFacturas"),
            numeroFactura: v.string(),
            valor: v.number(),
            referenciaDocumento: v.optional(v.string()),
          })
        ),
      })
    ),
    referenciaDocumento: v.optional(v.string()),
    referenciaDocumentoNormalizado: v.optional(v.string()),
    referenciaCufe: v.optional(v.string()),
    facturaRelacionadaId: v.optional(v.id("facturacionFacturas")),
    relacionDocumentoOrigen: v.optional(v.union(v.literal("dian"), v.literal("manual"))),
    relacionDocumentoAuditadaPorUserId: v.optional(v.string()),
    relacionDocumentoAuditadaPorNombre: v.optional(v.string()),
    relacionDocumentoAuditadaPorEmail: v.optional(v.string()),
    relacionDocumentoAuditadaEn: v.optional(v.number()),
    relacionDocumentoComentario: v.optional(v.string()),
    peajePlaca: v.optional(v.string()),
    peajeCentroCosto: v.optional(v.string()),
    peajeOperador: v.optional(v.string()),
    proveedorNombre: v.string(),
    proveedorDireccion: v.optional(v.string()),
    proveedorTelefono: v.optional(v.string()),
    proveedorEmail: v.optional(v.string()),
    fechaEmision: v.string(),
    fechaVencimiento: v.optional(v.string()),
    subtotal: v.number(),
    impuestos: v.number(),
    total: v.number(),
    valorContable: v.optional(v.number()),
    valorAPagar: v.optional(v.number()),
    valorCrucesDocumentosInternos: v.optional(v.number()),
    cantidadCrucesDocumentosInternos: v.optional(v.number()),
    valorContableActualizadoEn: v.optional(v.number()),
    valorContableActualizadoPorUserId: v.optional(v.string()),
    valorContableActualizadoPorNombre: v.optional(v.string()),
    valorContableActualizadoPorEmail: v.optional(v.string()),
    moneda: v.string(),
    descripcion: v.string(),
    lineas: v.optional(
      v.array(
        v.object({
          descripcion: v.string(),
          cantidad: v.number(),
          precioUnitario: v.number(),
          total: v.number(),
        })
      )
    ),
    formaPago: v.optional(v.string()),
    esLegalizacionAnticipo: v.optional(v.boolean()),
    anticipoBolsaId: v.optional(v.id("bolsasAnticipos")),
    anticipoLiderUserId: v.optional(v.string()),
    anticipoLiderNombre: v.optional(v.string()),
    anticipoLiderEmail: v.optional(v.string()),
    anticipoProcesoId: v.optional(v.number()),
    anticipoProcesoNombre: v.optional(v.string()),
    esLegalizacionCajaMenor: v.optional(v.boolean()),
    cajaMenorId: v.optional(v.id("cajasMenores")),
    cajaMenorNombre: v.optional(v.string()),
    cajaMenorMarcadorUserId: v.optional(v.string()),
    cajaMenorMarcadorNombre: v.optional(v.string()),
    cajaMenorMarcadorEmail: v.optional(v.string()),
    centroCostoCodigo: v.optional(v.string()),
    centroCostoNombre: v.optional(v.string()),
    centrosCostoDistribucion: v.optional(centrosCostoDistribucionValidator),
    peajesCentroCostoAsignacion: v.optional(peajesCentroCostoAsignacionValidator),
    fechaPagoCajaMenor: v.optional(v.string()),
    conceptoCajaMenor: v.optional(v.string()),
    esReciboFisicoCajaMenor: v.optional(v.boolean()),
    isFisico: v.optional(v.boolean()),
    xmlStorageId: v.optional(v.id("_storage")),
    pdfStorageId: v.optional(v.id("_storage")),
    soportesStorageId: v.optional(v.id("_storage")),
    soportesNombre: v.optional(v.string()),
    emailId: v.optional(v.id("facturacionCorreos")),
    graphMessageId: v.optional(v.string()),
    origen: v.union(
      v.literal("correo"),
      v.literal("carga_manual"),
      v.literal("recibo_fisico"),
      v.literal("documento_fisico")
    ),
    peajesBackfillFlujoLimpiadoEn: v.optional(v.number()),
    /** Snapshot de causación auditable; independiente del avance contable. */
    causado: v.optional(v.boolean()),
    numeroFp: v.optional(v.string()),
    causacionVersion: v.optional(v.number()),
    causacionActualizadaEn: v.optional(v.number()),
    causacionActualizadaPorUserId: v.optional(v.string()),
    causacionActualizadaPorNombre: v.optional(v.string()),
    causacionActualizadaPorEmail: v.optional(v.string()),
    creadoEn: v.number(),
    actualizadoEn: v.number(),
  })
    .index("by_numeroFactura", ["numeroFactura"])
    .index("by_numeroFacturaNormalizado", ["numeroFacturaNormalizado"])
    .index("by_cufe", ["cufe"])
    .index("by_empresa", ["empresa"])
    .index("by_empresa_numeroFactura", ["empresa", "numeroFactura"])
    .index("by_empresa_numeroFacturaNormalizado", ["empresa", "numeroFacturaNormalizado"])
    .index("by_empresa_referenciaDocumentoNormalizado", [
      "empresa",
      "referenciaDocumentoNormalizado",
    ])
    .index("by_empresa_esPeaje", ["empresa", "esPeaje"])
    .index("by_empresa_esPeaje_documentoClase", ["empresa", "esPeaje", "documentoClase"])
    .index("by_empresa_esPeaje_documentoClase_fechaEmision", [
      "empresa",
      "esPeaje",
      "documentoClase",
      "fechaEmision",
    ])
    .index("by_empresa_proveedorNitNormalizado_documentoClase_fechaEmision", [
      "empresa",
      "proveedorNitNormalizado",
      "documentoClase",
      "fechaEmision",
    ])
    .index("by_empresa_facturaRelacionadaId", ["empresa", "facturaRelacionadaId"])
    .index("by_proveedorNit_peajesBackfill", ["proveedorNit", "peajesBackfillFlujoLimpiadoEn"])
    .index("by_empresa_proveedorNit_peajesBackfill", [
      "empresa",
      "proveedorNit",
      "peajesBackfillFlujoLimpiadoEn",
    ])
    .index("by_empresa_esPeaje_peajesBackfill", [
      "empresa",
      "esPeaje",
      "peajesBackfillFlujoLimpiadoEn",
    ])
    .index("by_proveedorNit", ["proveedorNit"])
    .index("by_emailId", ["emailId"])
    .index("by_graphMessageId", ["graphMessageId"])
    .searchIndex("search_numeroFacturaRelacion", {
      searchField: "numeroFacturaNormalizado",
      filterFields: ["empresa", "proveedorNitNormalizado", "documentoClase"],
    }),

  facturacionTareas: defineTable({
    facturaId: v.id("facturacionFacturas"),
    empresa: v.optional(v.number()),
    estado: v.union(
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
    ),
    categoria: v.union(v.literal("tecnologia"), v.literal("administracion"), v.literal("otro")),
    asignadoAUserId: v.optional(v.string()),
    asignadoANombre: v.string(),
    asignadoAEmail: v.string(),
    liderProcesoUserId: v.optional(v.string()),
    liderProcesoNombre: v.string(),
    liderProcesoEmail: v.string(),
    liderProcesoProcesoId: v.optional(v.number()),
    liderProcesoProcesoNombre: v.optional(v.string()),
    comprobantePagoStorageId: v.optional(v.id("_storage")),
    comprobantePagoNombre: v.optional(v.string()),
    /** @deprecated Usar facturacionFacturas.causado/numeroFp. Conservado sólo en documentos históricos. */
    causada: v.optional(v.boolean()),
    jefeDirectoAsignadoAUserId: v.optional(v.string()),
    jefeDirectoAsignadoANombre: v.optional(v.string()),
    jefeDirectoAsignadoAEmail: v.optional(v.string()),
    causacionAsignadoAUserId: v.optional(v.string()),
    causacionAsignadoANombre: v.optional(v.string()),
    causacionAsignadoAEmail: v.optional(v.string()),
    contadorAsignadoAUserId: v.optional(v.string()),
    contadorAsignadoANombre: v.optional(v.string()),
    contadorAsignadoAEmail: v.optional(v.string()),
    eventosDianAsignadoAUserId: v.optional(v.string()),
    eventosDianAsignadoANombre: v.optional(v.string()),
    eventosDianAsignadoAEmail: v.optional(v.string()),
    gerenciaAsignadoAUserId: v.optional(v.string()),
    gerenciaAsignadoANombre: v.optional(v.string()),
    gerenciaAsignadoAEmail: v.optional(v.string()),
    tesoreroAsignadoAUserId: v.optional(v.string()),
    tesoreroAsignadoANombre: v.optional(v.string()),
    tesoreroAsignadoAEmail: v.optional(v.string()),
    grupoAsignacionActualId: v.optional(v.string()),
    currentAsignacionId: v.optional(v.id("facturacionAsignaciones")),
    lideresTotal: v.optional(v.number()),
    lideresCompletados: v.optional(v.number()),
    fechaAsignacionCausacion: v.optional(v.number()),
    /** Wall-clock when the task entered its current phase. Reset only on phase change. */
    faseIniciadaEn: v.optional(v.number()),
    /** True when faseIniciadaEn was inferred (assignment group / audit / actualizadoEn). */
    faseIniciadaEnEstimado: v.optional(v.boolean()),
    /** Set when the task reaches a terminal estado. */
    finalizadoEn: v.optional(v.number()),
    creadoEn: v.number(),
    actualizadoEn: v.number(),
  })
    .index("by_facturaId", ["facturaId"])
    .index("by_estado", ["estado"])
    .index("by_empresa", ["empresa"])
    .index("by_empresa_estado", ["empresa", "estado"])
    .index("by_asignadoAUserId", ["asignadoAUserId"])
    .index("by_asignadoAEmail", ["asignadoAEmail"])
    .index("by_liderProcesoEmail", ["liderProcesoEmail"]),

  facturacionAsignaciones: defineTable({
    facturaId: v.id("facturacionFacturas"),
    tareaId: v.optional(v.id("facturacionTareas")),
    empresa: v.optional(v.number()),
    fase: v.union(
      v.literal("recepcion"),
      v.literal("revision_lider"),
      v.literal("jefe_directo"),
      v.literal("causacion"),
      v.literal("revision_impuestos"),
      v.literal("eventos_dian"),
      v.literal("pendiente_rechazar_dian"),
      v.literal("gerencia"),
      v.literal("revision_tesoreria")
    ),
    estado: v.union(
      v.literal("pendiente"),
      v.literal("completada"),
      v.literal("devuelta"),
      v.literal("rechazada"),
      v.literal("cancelada"),
      v.literal("reasignada")
    ),
    rol: v.union(
      v.literal("recepcion"),
      v.literal("lider"),
      v.literal("jefe_directo"),
      v.literal("analista_causacion"),
      v.literal("contador_impuestos"),
      v.literal("eventos_dian"),
      v.literal("rechazos_dian"),
      v.literal("gerencia"),
      v.literal("gerente_financiero"),
      v.literal("gerente_general"),
      v.literal("tesorero")
    ),
    grupoId: v.string(),
    asignadoAUserId: v.optional(v.string()),
    asignadoANombre: v.string(),
    asignadoAEmail: v.string(),
    asignadoAProcesoId: v.optional(v.number()),
    asignadoAProcesoNombre: v.optional(v.string()),
    fechaAsignacion: v.number(),
    fechaCompletado: v.optional(v.number()),
    duracionMs: v.optional(v.number()),
    comentario: v.optional(v.string()),
    metadata: v.optional(v.any()),
    creadoEn: v.number(),
    actualizadoEn: v.number(),
  })
    .index("by_facturaId", ["facturaId"])
    .index("by_tareaId", ["tareaId"])
    .index("by_tareaId_estado", ["tareaId", "estado"])
    .index("by_facturaId_fase", ["facturaId", "fase"])
    .index("by_grupoId", ["grupoId"])
    .index("by_estado", ["estado"])
    .index("by_asignadoAEmail_estado", ["asignadoAEmail", "estado"])
    .index("by_asignadoAUserId_estado", ["asignadoAUserId", "estado"])
    .index("by_asignadoAUserId_estado_empresa", ["asignadoAUserId", "estado", "empresa"])
    .index("by_empresa", ["empresa"])
    .index("by_empresa_estado", ["empresa", "estado"])
    .index("by_empresa_fase_estado", ["empresa", "fase", "estado"]),

  facturacionAprobaciones: defineTable({
    tareaId: v.id("facturacionTareas"),
    facturaId: v.id("facturacionFacturas"),
    asignacionId: v.optional(v.id("facturacionAsignaciones")),
    empresa: v.optional(v.number()),
    actorUserId: v.optional(v.string()),
    actorNombre: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    accion: v.union(
      v.literal("asignar_recepcion"),
      v.literal("asignar_lider"),
      v.literal("aceptar"),
      v.literal("rechazar"),
      v.literal("rechazar_dian"),
      v.literal("solicitar_rechazo_dian"),
      v.literal("confirmar_rechazo_dian"),
      v.literal("cruzar_nota_credito_rechazo_dian"),
      v.literal("relacionar_nota_credito"),
      v.literal("reasignar_nota_credito"),
      v.literal("cerrar_nota_credito"),
      v.literal("cerrar_factura"),
      v.literal("migrar_rechazo_dian"),
      v.literal("causar"),
      v.literal("enviar_impuestos"),
      v.literal("aprobar_impuestos"),
      v.literal("devolver_causacion"),
      v.literal("devolver_fase"),
      v.literal("reenviar_impuestos"),
      v.literal("asignar_jefe_directo"),
      v.literal("asignar_eventos_dian"),
      v.literal("asignar_gerencia"),
      v.literal("legalizar_factura"),
      v.literal("aprobar_gerencia"),
      v.literal("cancelar"),
      v.literal("aprobar_pago"),
      v.literal("registrar_pago"),
      v.literal("pago_parcial"),
      v.literal("reasignar"),
      v.literal("asignar_lider_horizontal"),
      v.literal("asignar_par"),
      v.literal("asignar_fase_usuario"),
      v.literal("comentar"),
      v.literal("adjuntar"),
      v.literal("marcar_causada"),
      v.literal("actualizar_causacion"),
      v.literal("marcar_anticipo"),
      v.literal("cambiar_dueno_anticipo"),
      v.literal("legalizar_anticipo"),
      v.literal("agregar_cruce_documento_interno"),
      v.literal("editar_cruce_documento_interno"),
      v.literal("retirar_cruce_documento_interno"),
      v.literal("marcar_caja_menor"),
      v.literal("legalizar_caja_menor"),
      v.literal("crear_documento_fisico"),
      v.literal("crear_movimiento_caja_menor"),
      v.literal("generar_reembolso_caja_menor"),
      v.literal("actualizar_centro_costo_caja_menor"),
      v.literal("aprobar_lider_reembolso_caja_menor"),
      v.literal("rechazar_lider_reembolso_caja_menor"),
      v.literal("aprobar_reembolso_caja_menor"),
      v.literal("rechazar_reembolso_caja_menor"),
      v.literal("confirmar_reembolso_caja_menor"),
      v.literal("anular_movimiento_caja_menor"),
      v.literal("devolver_buzon"),
      v.literal("reasignar_revisor_caja_menor"),
      v.literal("enviar_impuestos_reembolso_caja_menor"),
      v.literal("aprobar_impuestos_reembolso_caja_menor"),
      v.literal("rechazar_impuestos_reembolso_caja_menor"),
      v.literal("devolver_impuestos_reembolso_caja_menor"),
      v.literal("reasignar_contador_reembolso_caja_menor"),
      v.literal("devolver_gerencia_contabilidad_reembolso_caja_menor"),
      v.literal("devolver_gerencia_revision_reembolso_caja_menor"),
      v.literal("reenviar_gerencia_reembolso_caja_menor"),
      v.literal("reasignar_eventos_dian_reembolso_caja_menor"),
      v.literal("reenviar_gerencia_impuestos_reembolso_caja_menor"),
      v.literal("enviar_eventos_dian_reembolso_caja_menor"),
      v.literal("rechazar_eventos_dian_reembolso_caja_menor"),
      v.literal("devolver_eventos_dian_reembolso_caja_menor"),
      v.literal("aprobar_eventos_dian_reembolso_caja_menor"),
      v.literal("devolver_gerencia_eventos_dian_reembolso_caja_menor")
    ),
    comentario: v.string(),
    firmaStorageId: v.optional(v.id("_storage")),
    valorContableCambio: v.optional(
      v.object({
        valorAnterior: v.number(),
        valorNuevo: v.number(),
        moneda: v.string(),
      })
    ),
    anticipoDuenoCambio: v.optional(
      v.object({
        anterior: v.optional(
          v.object({
            source: v.optional(v.union(v.literal("historial"), v.literal("directorio_empresa"))),
            liderUserId: v.optional(v.string()),
            liderNombre: v.string(),
            liderEmail: v.string(),
            procesoId: v.optional(v.number()),
            procesoNombre: v.optional(v.string()),
            bolsaId: v.optional(v.id("bolsasAnticipos")),
            liderAsignacionId: v.optional(v.id("facturacionAsignaciones")),
          })
        ),
        nuevo: v.object({
          source: v.optional(v.union(v.literal("historial"), v.literal("directorio_empresa"))),
          liderUserId: v.optional(v.string()),
          liderNombre: v.string(),
          liderEmail: v.string(),
          procesoId: v.optional(v.number()),
          procesoNombre: v.optional(v.string()),
          bolsaId: v.optional(v.id("bolsasAnticipos")),
          liderAsignacionId: v.optional(v.id("facturacionAsignaciones")),
        }),
        crucesRevertidos: v.optional(
          v.object({
            cantidad: v.number(),
            valor: v.number(),
            legalizacionIds: v.array(v.id("facturacionAnticipoLegalizaciones")),
          })
        ),
      })
    ),
    cruceDocumentoInternoCambio: v.optional(
      v.object({
        operacion: v.union(v.literal("agregar"), v.literal("editar"), v.literal("retirar")),
        cruceId: v.id("facturacionCrucesDocumentosInternos"),
        anterior: v.optional(
          v.object({
            numeroDocumento: v.string(),
            valorAplicado: v.number(),
          })
        ),
        nuevo: v.optional(
          v.object({
            numeroDocumento: v.string(),
            valorAplicado: v.number(),
          })
        ),
        resumenContable: v.object({
          valorContable: v.number(),
          valorDocumentosInternos: v.number(),
          pagosAplicados: v.number(),
          baseCruceAnticipos: v.number(),
          valorAnticiposAplicados: v.number(),
          valorAPagar: v.number(),
          moneda: v.string(),
        }),
      })
    ),
    pagoParcial: v.optional(
      v.object({
        monto: v.number(),
        comprobanteStorageId: v.id("_storage"),
        comprobanteNombre: v.string(),
      })
    ),
    pagoFinal: v.optional(
      v.object({
        monto: v.number(),
        moneda: v.string(),
        sinDesembolso: v.boolean(),
      })
    ),
    notaCreditoRelacionCambio: v.optional(
      v.object({
        historialId: v.id("facturacionNotaCreditoRelacionHistorial"),
        notaCreditoId: v.id("facturacionFacturas"),
        notaCreditoNumero: v.string(),
        notaCreditoTotal: v.number(),
        facturaAnteriorId: v.optional(v.id("facturacionFacturas")),
        facturaAnteriorNumero: v.optional(v.string()),
        facturaNuevaId: v.id("facturacionFacturas"),
        facturaNuevaNumero: v.string(),
        contexto: v.union(v.literal("detalle_factura"), v.literal("conciliacion_peajes")),
        origenRelacionAnterior: v.union(
          v.literal("dian"),
          v.literal("manual"),
          v.literal("sin_relacion")
        ),
      })
    ),
    causacionCambio: v.optional(
      v.object({
        causadoAnterior: v.union(v.boolean(), v.null()),
        causadoNuevo: v.boolean(),
        numeroFpAnterior: v.union(v.string(), v.null()),
        numeroFpNuevo: v.union(v.string(), v.null()),
        motivoCambio: v.union(v.string(), v.null()),
        versionAnterior: v.number(),
        versionNueva: v.number(),
        contexto: v.union(v.literal("flujo_factura"), v.literal("reembolso_caja_menor")),
        faseOperativa: v.string(),
        reembolsoId: v.optional(v.id("cajasMenoresReembolsos")),
        movimientoId: v.optional(v.id("facturacionCajaMenorMovimientos")),
      })
    ),
    estadoAnterior: v.string(),
    estadoNuevo: v.string(),
    cajaMenorContexto: v.optional(cajaMenorContextoValidator),
    creadoEn: v.number(),
  })
    .index("by_tareaId", ["tareaId"])
    .index("by_facturaId", ["facturaId"])
    .index("by_asignacionId", ["asignacionId"])
    .index("by_empresa", ["empresa"])
    .index("by_facturaId_accion_creadoEn", ["facturaId", "accion", "creadoEn"]),

  facturacionAdjuntos: defineTable({
    facturaId: v.id("facturacionFacturas"),
    asignacionId: v.optional(v.id("facturacionAsignaciones")),
    empresa: v.optional(v.number()),
    storageId: v.id("_storage"),
    nombre: v.string(),
    mimeType: v.optional(v.string()),
    size: v.optional(v.number()),
    subidoPorUserId: v.optional(v.string()),
    subidoPorNombre: v.string(),
    subidoPorEmail: v.string(),
    creadoEn: v.number(),
  })
    .index("by_facturaId", ["facturaId"])
    .index("by_asignacionId", ["asignacionId"])
    .index("by_empresa", ["empresa"]),

  facturacionConfiguracion: defineTable({
    empresa: v.optional(v.number()),
    clave: v.union(
      v.literal("lider_administracion"),
      v.literal("lider_tecnologia"),
      v.literal("recepcion"),
      v.literal("analista_causacion"),
      v.literal("rechazos_dian"),
      v.literal("contadores_impuestos"),
      v.literal("contadores_peajes"),
      v.literal("eventos_dian"),
      v.literal("gerencia"),
      v.literal("gerente_financiero"),
      v.literal("gerente_general"),
      v.literal("tesorero"),
      v.literal("tesoreria_default"),
      v.literal("cuenta_recepcion"),
      v.literal("revisor_caja_menor"),
      v.literal("notificacion_pagadas"),
      v.literal("notificacion_legalizadas"),
      v.literal("notificacion_rechazado_dian")
    ),
    tipo: v.union(
      v.literal("usuario"),
      v.literal("texto"),
      v.literal("usuarios_lista"),
      v.literal("usuarios_ponderados")
    ),
    usuarioId: v.optional(v.string()),
    nombre: v.optional(v.string()),
    email: v.optional(v.string()),
    usuarios: v.optional(
      v.array(
        v.object({
          usuarioId: v.string(),
          nombre: v.string(),
          email: v.string(),
        })
      )
    ),
    usuariosPonderados: v.optional(
      v.array(
        v.object({
          usuarioId: v.string(),
          nombre: v.string(),
          email: v.string(),
          peso: v.number(),
        })
      )
    ),
    distribucionCursor: v.optional(v.number()),
    valor: v.optional(v.string()),
    sincronizacionGraphDeshabilitada: v.optional(v.boolean()),
    actualizadoEn: v.number(),
    actualizadoPorUserId: v.optional(v.string()),
    actualizadoPorNombre: v.optional(v.string()),
  })
    .index("by_clave", ["clave"])
    .index("by_empresa", ["empresa"])
    .index("by_empresa_clave", ["empresa", "clave"]),

  facturacionConfiguracionUsuarios: defineTable({
    empresa: v.number(),
    clave: v.union(
      v.literal("lider_administracion"),
      v.literal("lider_tecnologia"),
      v.literal("recepcion"),
      v.literal("analista_causacion"),
      v.literal("rechazos_dian"),
      v.literal("contadores_impuestos"),
      v.literal("contadores_peajes"),
      v.literal("eventos_dian"),
      v.literal("gerencia"),
      v.literal("gerente_financiero"),
      v.literal("gerente_general"),
      v.literal("tesorero"),
      v.literal("tesoreria_default"),
      v.literal("revisor_caja_menor"),
      v.literal("notificacion_pagadas"),
      v.literal("notificacion_legalizadas"),
      v.literal("notificacion_rechazado_dian")
    ),
    tipo: v.union(
      v.literal("usuario"),
      v.literal("usuarios_lista"),
      v.literal("usuarios_ponderados")
    ),
    usuarioId: v.string(),
    nombre: v.string(),
    email: v.string(),
    peso: v.optional(v.number()),
    orden: v.optional(v.number()),
    actualizadoEn: v.number(),
    actualizadoPorUserId: v.optional(v.string()),
    actualizadoPorNombre: v.optional(v.string()),
  })
    .index("by_clave", ["clave"])
    .index("by_usuarioId", ["usuarioId"])
    .index("by_usuarioId_clave", ["usuarioId", "clave"])
    .index("by_empresa_usuarioId", ["empresa", "usuarioId"])
    .index("by_empresa_clave", ["empresa", "clave"])
    .index("by_empresa_clave_usuarioId", ["empresa", "clave", "usuarioId"]),

  facturacionCausacionProveedorAnalistas: defineTable({
    empresa: v.number(),
    proveedorNit: v.string(),
    proveedorNitNormalizado: v.string(),
    proveedorNombre: v.string(),
    analistaUsuarioId: v.string(),
    analistaNombre: v.string(),
    analistaEmail: v.string(),
    creadoEn: v.number(),
    actualizadoEn: v.number(),
    actualizadoPorUserId: v.optional(v.string()),
    actualizadoPorNombre: v.optional(v.string()),
  })
    .index("by_empresa", ["empresa"])
    .index("by_empresa_proveedorNitNormalizado", ["empresa", "proveedorNitNormalizado"])
    .index("by_empresa_analistaUsuarioId", ["empresa", "analistaUsuarioId"]),

  facturacionAnticipoLegalizaciones: defineTable({
    facturaId: v.id("facturacionFacturas"),
    anticipoId: v.id("anticipos"),
    bolsaId: v.optional(v.id("bolsasAnticipos")),
    tareaId: v.optional(v.id("facturacionTareas")),
    asignacionId: v.optional(v.id("facturacionAsignaciones")),
    empresa: v.optional(v.number()),
    liderUserId: v.optional(v.string()),
    liderNombre: v.string(),
    liderEmail: v.string(),
    procesoId: v.optional(v.number()),
    procesoNombre: v.optional(v.string()),
    valorAplicado: v.number(),
    valorContableFactura: v.optional(v.number()),
    valorContableAnticipo: v.optional(v.number()),
    tipoBolsa: v.optional(v.union(v.literal("general"), v.literal("peajes"))),
    valorNetoFactura: v.optional(v.number()),
    notaCreditoIds: v.optional(v.array(v.id("facturacionFacturas"))),
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
    .index("by_anticipoId", ["anticipoId"])
    .index("by_facturaId_estado", ["facturaId", "estado"])
    .index("by_anticipoId_estado", ["anticipoId", "estado"])
    .index("by_bolsaId", ["bolsaId"])
    .index("by_bolsaId_estado", ["bolsaId", "estado"])
    .index("by_liderUserId_estado", ["liderUserId", "estado"])
    .index("by_estado", ["estado"])
    .index("by_empresa_estado", ["empresa", "estado"])
    .index("by_empresa", ["empresa"]),

  facturacionCrucesDocumentosInternos: defineTable({
    facturaId: v.id("facturacionFacturas"),
    empresa: v.number(),
    numeroDocumento: v.string(),
    numeroDocumentoNormalizado: v.string(),
    valorAplicado: v.number(),
    moneda: v.string(),
    estado: v.union(v.literal("activo"), v.literal("retirado")),
    actorUserId: v.optional(v.string()),
    actorNombre: v.string(),
    actorEmail: v.string(),
    comentario: v.optional(v.string()),
    actualizadoPorUserId: v.optional(v.string()),
    actualizadoPorNombre: v.optional(v.string()),
    actualizadoPorEmail: v.optional(v.string()),
    actualizadoComentario: v.optional(v.string()),
    creadoEn: v.number(),
    actualizadoEn: v.number(),
  })
    .index("by_facturaId_estado", ["facturaId", "estado"])
    .index("by_facturaId_numeroDocumentoNormalizado", ["facturaId", "numeroDocumentoNormalizado"])
    .index("by_empresa_estado", ["empresa", "estado"]),

  facturacionPeajesOperaciones: defineTable({
    empresa: v.optional(v.number()),
    periodoInicio: v.optional(v.string()),
    periodoFin: v.optional(v.string()),
    archivoNombre: v.optional(v.string()),
    estado: v.union(
      v.literal("procesando"),
      v.literal("aplicada"),
      v.literal("parcial"),
      v.literal("sin_aplicacion"),
      v.literal("fallida")
    ),
    resumen: v.any(),
    facturasCruzadas: v.array(v.any()),
    notasCreditoAplicadas: v.array(v.any()),
    documentosSkippeados: v.array(v.any()),
    documentosYaProcesados: v.array(v.any()),
    diferencias: v.array(v.any()),
    anticiposAplicados: v.array(v.any()),
    legalizacionIds: v.array(v.id("facturacionAnticipoLegalizaciones")),
    creadoPorUserId: v.optional(v.string()),
    creadoPorNombre: v.string(),
    creadoPorEmail: v.string(),
    comentario: v.optional(v.string()),
    creadoEn: v.number(),
    actualizadoEn: v.number(),
    notificacionContableEstado: v.optional(
      v.union(
        v.literal("pendiente"),
        v.literal("enviada"),
        v.literal("parcial"),
        v.literal("fallida"),
        v.literal("sin_destinatarios")
      )
    ),
    notificacionContableIntentos: v.optional(v.number()),
    notificacionContableDestinatarios: v.optional(
      v.array(
        v.object({
          usuarioId: v.optional(v.string()),
          nombre: v.string(),
          email: v.string(),
        })
      )
    ),
    notificacionContableEnviados: v.optional(v.number()),
    notificacionContableFallidos: v.optional(v.number()),
    notificacionContableEn: v.optional(v.number()),
    notificacionContableUltimoError: v.optional(v.string()),
  })
    .index("by_empresa", ["empresa"])
    .index("by_empresa_creadoEn", ["empresa", "creadoEn"]),

  facturacionPeajesContabilidad: defineTable({
    facturaId: v.id("facturacionFacturas"),
    empresa: v.number(),
    operacionId: v.id("facturacionPeajesOperaciones"),
    estado: v.union(v.literal("pendiente_contabilidad"), v.literal("contabilizada")),
    numeroFactura: v.string(),
    numeroFacturaNormalizado: v.string(),
    proveedorNombre: v.string(),
    proveedorNit: v.optional(v.string()),
    fechaEmision: v.string(),
    moneda: v.string(),
    valorBruto: v.number(),
    valorNotasCredito: v.number(),
    valorNeto: v.number(),
    cruceAplicadoEn: v.number(),
    ordenCola: v.string(),
    searchText: v.string(),
    origen: v.union(v.literal("cruce"), v.literal("backfill")),
    ultimaContabilizacion: v.optional(
      v.object({
        actorUserId: v.optional(v.string()),
        actorNombre: v.string(),
        actorEmail: v.string(),
        fecha: v.number(),
        comentario: v.optional(v.string()),
      })
    ),
    anticiposCruzados: v.optional(
      v.array(
        v.object({
          anticipoId: v.id("anticipos"),
          consecutivo: v.number(),
          valorAplicado: v.number(),
        })
      )
    ),
    peajesCentroCostoAsignacion: v.optional(peajesCentroCostoAsignacionValidator),
    version: v.number(),
    creadoEn: v.number(),
    actualizadoEn: v.number(),
  })
    .index("by_facturaId", ["facturaId"])
    .index("by_operacionId", ["operacionId"])
    .index("by_operacionId_estado", ["operacionId", "estado"])
    .index("by_empresa_estado_ordenCola", ["empresa", "estado", "ordenCola"])
    .index("by_estado_ordenCola", ["estado", "ordenCola"])
    .index("by_empresa_ordenCola", ["empresa", "ordenCola"])
    .searchIndex("search_text", {
      searchField: "searchText",
      filterFields: ["empresa", "estado", "operacionId"],
    }),

  facturacionPeajesContabilidadLotes: defineTable({
    empresa: v.number(),
    accion: v.union(
      v.literal("contabilizar"),
      v.literal("reabrir"),
      v.literal("backfill"),
      v.literal("actualizar_centro_costo")
    ),
    estado: v.union(
      v.literal("pendiente"),
      v.literal("procesando"),
      v.literal("completado"),
      v.literal("completado_con_errores"),
      v.literal("fallido")
    ),
    modoSeleccion: v.union(
      v.literal("ids"),
      v.literal("todos_filtrados"),
      v.literal("individual"),
      v.literal("backfill")
    ),
    filtrosSnapshot: v.optional(v.any()),
    excluidos: v.optional(v.array(v.id("facturacionFacturas"))),
    facturaIds: v.optional(v.array(v.id("facturacionFacturas"))),
    centroCostoObjetivo: v.optional(v.union(peajesCentroCostoRefValidator, v.null())),
    idempotencyKey: v.string(),
    totalObjetivo: v.number(),
    totalProcesados: v.number(),
    totalAplicados: v.number(),
    totalOmitidos: v.number(),
    totalFallidos: v.number(),
    comentario: v.optional(v.string()),
    actorUserId: v.optional(v.string()),
    actorNombre: v.string(),
    actorEmail: v.string(),
    actorRol: v.optional(v.number()),
    cursorInterno: v.optional(v.string()),
    errorGeneral: v.optional(v.string()),
    creadoEn: v.number(),
    actualizadoEn: v.number(),
    finalizadoEn: v.optional(v.number()),
  })
    .index("by_idempotencyKey", ["idempotencyKey"])
    .index("by_empresa_creadoEn", ["empresa", "creadoEn"])
    .index("by_actorUserId_creadoEn", ["actorUserId", "creadoEn"])
    .index("by_empresa_estado", ["empresa", "estado"]),

  facturacionPeajesContabilidadMovimientos: defineTable({
    loteId: v.id("facturacionPeajesContabilidadLotes"),
    facturaId: v.id("facturacionFacturas"),
    empresa: v.number(),
    operacionId: v.id("facturacionPeajesOperaciones"),
    accion: v.union(
      v.literal("contabilizar"),
      v.literal("reabrir"),
      v.literal("backfill"),
      v.literal("actualizar_centro_costo")
    ),
    resultado: v.union(v.literal("aplicado"), v.literal("omitido"), v.literal("fallido")),
    estadoAnterior: v.optional(
      v.union(v.literal("pendiente_contabilidad"), v.literal("contabilizada"))
    ),
    estadoNuevo: v.optional(
      v.union(v.literal("pendiente_contabilidad"), v.literal("contabilizada"))
    ),
    comentarioFase: v.optional(v.string()),
    exportacionContabilizacion: v.optional(
      v.object({
        numeroFactura: v.string(),
        centroCostoCodigo: v.string(),
        anticiposCruzados: v.array(v.string()),
        anticiposCruzadosCapturados: v.optional(v.boolean()),
        valorFactura: v.number(),
        valorDescuentos: v.number(),
        numerosNotasCredito: v.array(v.string()),
        valorNeto: v.number(),
        moneda: v.string(),
      })
    ),
    actorUserId: v.optional(v.string()),
    actorNombre: v.string(),
    actorEmail: v.string(),
    numeroIntento: v.number(),
    error: v.optional(v.string()),
    creadoEn: v.number(),
    actualizadoEn: v.number(),
  })
    .index("by_loteId", ["loteId"])
    .index("by_facturaId_creadoEn", ["facturaId", "creadoEn"])
    .index("by_operacionId_creadoEn", ["operacionId", "creadoEn"])
    .index("by_loteId_facturaId", ["loteId", "facturaId"]),

  facturacionPeajesCentroCostoMovimientos: defineTable({
    facturaId: v.id("facturacionFacturas"),
    empresa: v.number(),
    operacionId: v.id("facturacionPeajesOperaciones"),
    loteId: v.optional(v.id("facturacionPeajesContabilidadLotes")),
    accion: v.union(
      v.literal("asignar"),
      v.literal("cambiar"),
      v.literal("limpiar"),
      v.literal("confirmar_sin_cambio")
    ),
    centroAnterior: v.optional(v.union(peajesCentroCostoRefValidator, v.null())),
    centroNuevo: v.optional(v.union(peajesCentroCostoRefValidator, v.null())),
    canal: v.union(v.literal("conciliacion"), v.literal("contabilidad")),
    entrada: v.union(
      v.literal("excel_validado"),
      v.literal("manual"),
      v.literal("conservado"),
      v.literal("sin_centro"),
      v.literal("correccion_contable")
    ),
    actorUserId: v.optional(v.string()),
    actorNombre: v.string(),
    actorEmail: v.string(),
    idempotencyKey: v.string(),
    creadoEn: v.number(),
  })
    .index("by_facturaId_creadoEn", ["facturaId", "creadoEn"])
    .index("by_operacionId_creadoEn", ["operacionId", "creadoEn"])
    .index("by_loteId", ["loteId"])
    .index("by_idempotencyKey", ["idempotencyKey"]),

  facturacionPeajesContabilidadContadores: defineTable({
    scope: v.union(v.literal("empresa"), v.literal("operacion")),
    scopeKey: v.string(),
    empresa: v.number(),
    operacionId: v.optional(v.id("facturacionPeajesOperaciones")),
    estado: v.union(v.literal("pendiente_contabilidad"), v.literal("contabilizada")),
    moneda: v.string(),
    cantidad: v.number(),
    valorNeto: v.number(),
    actualizadoEn: v.number(),
  })
    .index("by_scopeKey_estado_moneda", ["scopeKey", "estado", "moneda"])
    .index("by_empresa_estado", ["empresa", "estado"])
    .index("by_operacionId_estado", ["operacionId", "estado"]),

  facturacionPeajesOperacionItems: defineTable({
    operacionId: v.id("facturacionPeajesOperaciones"),
    empresa: v.optional(v.number()),
    tipo: v.union(
      v.literal("factura"),
      v.literal("nota_credito"),
      v.literal("skip"),
      v.literal("diferencia"),
      v.literal("anticipo")
    ),
    key: v.optional(v.string()),
    version: v.optional(v.number()),
    payload: v.any(),
    creadoEn: v.number(),
  })
    .index("by_operacionId", ["operacionId"])
    .index("by_operacionId_tipo", ["operacionId", "tipo"])
    .index("by_empresa_tipo", ["empresa", "tipo"]),

  facturacionPeajesConciliaciones: defineTable({
    empresa: v.optional(v.number()),
    periodoInicio: v.optional(v.string()),
    periodoFin: v.optional(v.string()),
    archivoNombre: v.optional(v.string()),
    estado: v.union(v.literal("pendiente"), v.literal("aplicada")),
    resumen: v.any(),
    diferencias: v.array(v.any()),
    diferenciasCriticas: v.number(),
    creadoPorUserId: v.optional(v.string()),
    creadoPorNombre: v.string(),
    creadoPorEmail: v.string(),
    creadoEn: v.number(),
    actualizadoEn: v.number(),
  })
    .index("by_empresa", ["empresa"])
    .index("by_empresa_estado", ["empresa", "estado"]),

  facturacionNotaCreditoRelacionHistorial: defineTable({
    empresa: v.number(),
    notaCreditoId: v.id("facturacionFacturas"),
    notaCreditoNumero: v.string(),
    notaCreditoTotal: v.number(),
    notaCreditoMoneda: v.string(),
    notaCreditoFechaEmision: v.string(),
    notaCreditoProveedorNit: v.string(),
    notaCreditoProveedorNombre: v.string(),
    referenciaXml: v.optional(v.string()),
    referenciaXmlNormalizada: v.optional(v.string()),
    facturaAnteriorId: v.optional(v.id("facturacionFacturas")),
    facturaAnteriorNumero: v.optional(v.string()),
    facturaNuevaId: v.id("facturacionFacturas"),
    facturaNuevaNumero: v.string(),
    origenRelacionAnterior: v.union(
      v.literal("dian"),
      v.literal("manual"),
      v.literal("sin_relacion")
    ),
    origenRelacionNueva: v.literal("manual"),
    contexto: v.union(v.literal("detalle_factura"), v.literal("conciliacion_peajes")),
    archivoNombrePeajes: v.optional(v.string()),
    motivo: v.string(),
    actorUserId: v.optional(v.string()),
    actorNombre: v.string(),
    actorEmail: v.string(),
    creadoEn: v.number(),
    snapshotFacturaAnterior: v.optional(
      v.object({
        valorBase: v.number(),
        totalNotasCreditoAntes: v.number(),
        netoAntes: v.number(),
        totalNotasCreditoDespues: v.number(),
        netoDespues: v.number(),
        usaValorXmlComoBase: v.boolean(),
      })
    ),
    snapshotFacturaNueva: v.object({
      valorBase: v.number(),
      totalNotasCreditoAntes: v.number(),
      netoAntes: v.number(),
      totalNotasCreditoDespues: v.number(),
      netoDespues: v.number(),
      usaValorXmlComoBase: v.boolean(),
    }),
  })
    .index("by_notaCreditoId_creadoEn", ["notaCreditoId", "creadoEn"])
    .index("by_facturaAnteriorId_creadoEn", ["facturaAnteriorId", "creadoEn"])
    .index("by_facturaNuevaId_creadoEn", ["facturaNuevaId", "creadoEn"])
    .index("by_empresa_creadoEn", ["empresa", "creadoEn"]),

  facturacionEliminacionesAuditoria: defineTable({
    facturaId: v.string(),
    empresa: v.number(),
    numeroFactura: v.string(),
    proveedorNit: v.string(),
    proveedorNombre: v.string(),
    actorUserId: v.string(),
    actorNombre: v.string(),
    actorEmail: v.string(),
    actorRole: v.number(),
    eliminadoEn: v.number(),
    resumen: v.object({
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
    }),
  })
    .index("by_facturaId", ["facturaId"])
    .index("by_empresa_eliminadoEn", ["empresa", "eliminadoEn"])
    .index("by_actor_eliminadoEn", ["actorUserId", "eliminadoEn"]),

  /**
   * Materialized Anticipos workspace row. The operational views read this
   * table instead of loading and enriching every source request in-client.
   */
  anticiposDashboardItems: defineTable({
    anticipoId: v.id("anticipos"),
    empresa: v.number(),
    consecutivo: v.number(),
    razonSocial: v.string(),
    nit: v.string(),
    searchText: v.string(),
    valorNumerico: v.number(),
    valorContable: v.number(),
    valorLegalizable: v.number(),
    saldoLegalizado: v.number(),
    saldoPendiente: v.number(),
    tipoBolsa: v.union(v.literal("general"), v.literal("peajes")),
    bolsaId: v.optional(v.id("bolsasAnticipos")),
    procesoId: v.optional(v.number()),
    procesoNombre: v.optional(v.string()),
    cubreFacturaCompleta: v.boolean(),
    faseActual: v.string(),
    esActiva: v.boolean(),
    createdById: v.string(),
    responsableUserId: v.optional(v.string()),
    responsableNombre: v.optional(v.string()),
    asignadoA: v.optional(v.string()),
    ownerUserIds: v.optional(v.array(v.string())),
    faseIniciadaEn: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
    maxLegalizacionDate: v.number(),
    gerenciaAprobadoEn: v.optional(v.number()),
    desembolsadoEn: v.optional(v.number()),
    legalizadoEn: v.optional(v.number()),
    fueDevuelto: v.boolean(),
    buzonPrioridad: v.optional(v.number()),
    buzonOrden: v.optional(v.number()),
    integrityIssues: v.array(
      v.union(
        v.literal("sin_responsable"),
        v.literal("asignacion_inconsistente"),
        v.literal("rol_sin_configurar")
      )
    ),
    actualizadoEn: v.number(),
  })
    .index("by_anticipoId", ["anticipoId"])
    .index("by_empresa_createdAt", ["empresa", "createdAt"])
    .index("by_empresa_faseActual_createdAt", ["empresa", "faseActual", "createdAt"])
    .index("by_empresa_esActiva_createdAt", ["empresa", "esActiva", "createdAt"])
    .index("by_empresa_buzonPrioridad_buzonOrden", ["empresa", "buzonPrioridad", "buzonOrden"])
    .index("by_empresa_maxLegalizacionDate", ["empresa", "maxLegalizacionDate"])
    .index("by_asignadoA_esActiva_faseIniciadaEn", ["asignadoA", "esActiva", "faseIniciadaEn"])
    .index("by_createdById_createdAt", ["createdById", "createdAt"])
    .index("by_responsableUserId_createdAt", ["responsableUserId", "createdAt"])
    .index("by_bolsaId_createdAt", ["bolsaId", "createdAt"])
    .index("by_bolsaId_saldoPendiente", ["bolsaId", "saldoPendiente"])
    .index("by_bolsaId_maxLegalizacionDate", ["bolsaId", "maxLegalizacionDate"])
    .searchIndex("search_identity", {
      searchField: "searchText",
      filterFields: ["empresa", "esActiva", "bolsaId"],
    }),

  /** One row per current owner used by the workload dashboard. */
  anticiposDashboardResponsables: defineTable({
    anticipoId: v.id("anticipos"),
    itemId: v.id("anticiposDashboardItems"),
    empresa: v.number(),
    userId: v.optional(v.string()),
    email: v.optional(v.string()),
    nombre: v.string(),
    rol: v.string(),
    fase: v.string(),
    fechaAsignacion: v.number(),
    valorContable: v.number(),
    buzonPrioridad: v.optional(v.number()),
    buzonOrden: v.optional(v.number()),
    esActivo: v.boolean(),
    actualizadoEn: v.number(),
  })
    .index("by_anticipoId", ["anticipoId"])
    .index("by_itemId", ["itemId"])
    .index("by_empresa_esActivo_fechaAsignacion", ["empresa", "esActivo", "fechaAsignacion"])
    .index("by_empresa_userId_esActivo", ["empresa", "userId", "esActivo"])
    .index("by_empresa_userId_esActivo_buzonPrioridad_buzonOrden", [
      "empresa",
      "userId",
      "esActivo",
      "buzonPrioridad",
      "buzonOrden",
    ]),

  /** Flow counters partitioned by lifecycle event date. */
  anticiposDashboardContadoresDia: defineTable({
    empresa: v.number(),
    fecha: v.string(),
    clave: v.union(
      v.literal("solicitado"),
      v.literal("aprobado_gerencia"),
      v.literal("desembolsado"),
      v.literal("legalizado")
    ),
    count: v.number(),
    monto: v.number(),
    actualizadoEn: v.number(),
  })
    .index("by_empresa_fecha", ["empresa", "fecha"])
    .index("by_empresa_fecha_clave", ["empresa", "fecha", "clave"]),

  /** Durable state for the resumable Anticipos projection backfill. */
  anticiposDashboardBackfills: defineTable({
    clave: v.string(),
    estado: v.union(
      v.literal("idle"),
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed")
    ),
    cursor: v.union(v.string(), v.null()),
    procesadas: v.number(),
    lotes: v.number(),
    iniciadoEn: v.optional(v.number()),
    completadoEn: v.optional(v.number()),
    actualizadoEn: v.number(),
    error: v.optional(v.string()),
  }).index("by_clave", ["clave"]),

  /**
   * Materialized operational dashboard row — one per invoice/document.
   * Refreshed transactionally on invoice/task/assignment mutations.
   */
  facturacionDashboardItems: defineTable({
    facturaId: v.id("facturacionFacturas"),
    empresa: v.number(),
    numeroFactura: v.string(),
    cufe: v.optional(v.string()),
    proveedorNombre: v.string(),
    proveedorNit: v.string(),
    searchText: v.string(),
    /** Source timestamp and descriptive metadata used by operational reports. */
    ingresadaEn: v.optional(v.number()),
    origen: v.optional(
      v.union(
        v.literal("correo"),
        v.literal("carga_manual"),
        v.literal("recibo_fisico"),
        v.literal("documento_fisico")
      )
    ),
    descripcion: v.optional(v.string()),
    totalFactura: v.optional(v.number()),
    esFisico: v.optional(v.boolean()),
    /** Resolved list state, including Peajes-specific states. */
    estadoListado: v.optional(v.string()),
    tieneTarea: v.optional(v.boolean()),
    cierreReporteEn: v.optional(v.number()),
    cierreReporteEstimado: v.optional(v.boolean()),
    tieneDatosEstimados: v.optional(v.boolean()),
    fechaEmision: v.string(),
    fechaEmisionMs: v.number(),
    tipoFlujo: v.union(
      v.literal("normal"),
      v.literal("anticipo"),
      v.literal("caja_menor"),
      v.literal("peaje"),
      v.literal("nota_credito"),
      v.literal("nota_debito"),
      v.literal("otro")
    ),
    documentoClase: v.union(
      v.literal("factura"),
      v.literal("nota_credito"),
      v.literal("nota_debito"),
      v.literal("otro")
    ),
    /** Headline KPIs exclude notes, debit notes and peajes. */
    incluyeEnTotales: v.boolean(),
    faseActual: v.string(),
    grupoFase: v.union(
      v.literal("lideres"),
      v.literal("fases_contables"),
      v.literal("tesoreria"),
      v.literal("recepcion"),
      v.literal("gerencia"),
      v.literal("rechazos_dian"),
      v.literal("reembolso_caja_menor"),
      v.literal("otros_activos"),
      v.literal("terminal"),
      v.literal("peajes")
    ),
    grupoAsignacionActualId: v.optional(v.string()),
    valorContable: v.number(),
    valorAPagar: v.optional(v.number()),
    moneda: v.string(),
    faseIniciadaEn: v.optional(v.number()),
    faseIniciadaEnEstimado: v.optional(v.boolean()),
    finalizadoEn: v.optional(v.number()),
    slaEstado: v.union(
      v.literal("healthy"),
      v.literal("warning"),
      v.literal("breached"),
      v.literal("sin_sla"),
      v.literal("n_a")
    ),
    slaUmbralDias: v.optional(v.number()),
    slaAlertaEn: v.optional(v.number()),
    slaVenceEn: v.optional(v.number()),
    integrityIssues: v.array(
      v.union(
        v.literal("sin_responsable"),
        v.literal("asignacion_inconsistente"),
        v.literal("fase_sin_sla"),
        v.literal("tarea_faltante")
      )
    ),
    esActiva: v.boolean(),
    esLegacyJefeDirecto: v.boolean(),
    sortBreached: v.number(),
    sortWarning: v.number(),
    sortFaseAgeMs: v.number(),
    sortFechaEmisionMs: v.number(),
    causado: v.optional(v.boolean()),
    numeroFp: v.optional(v.string()),
    actualizadoEn: v.number(),
  })
    .index("by_facturaId", ["facturaId"])
    .index("by_empresa_fechaEmisionMs", ["empresa", "fechaEmisionMs"])
    .index("by_empresa_esActiva_grupoFase", ["empresa", "esActiva", "grupoFase"])
    .index("by_empresa_esActiva_faseActual", ["empresa", "esActiva", "faseActual"])
    .index("by_empresa_esActiva_slaEstado", ["empresa", "esActiva", "slaEstado"])
    .index("by_empresa_esActiva_incluyeEnTotales", ["empresa", "esActiva", "incluyeEnTotales"])
    .index("by_empresa_esActiva_sortBreached", ["empresa", "esActiva", "sortBreached"])
    .searchIndex("search_identity", {
      searchField: "searchText",
      filterFields: ["empresa", "esActiva"],
    }),

  /**
   * Historical participant projection — one row per invoice/person identity.
   * Assignment rows remain the source of truth; this table only accelerates
   * report filters and historical participation summaries.
   */
  facturacionReporteParticipantes: defineTable({
    facturaId: v.id("facturacionFacturas"),
    itemId: v.id("facturacionDashboardItems"),
    empresa: v.number(),
    identityKey: v.string(),
    userId: v.optional(v.string()),
    email: v.string(),
    nombre: v.string(),
    primeraParticipacionEn: v.number(),
    ultimaParticipacionEn: v.number(),
    cantidadMovimientos: v.number(),
    fechaEmisionMs: v.number(),
    actualizadoEn: v.number(),
  })
    .index("by_facturaId", ["facturaId"])
    .index("by_facturaId_identityKey", ["facturaId", "identityKey"])
    .index("by_empresa_identityKey_fechaEmisionMs", ["empresa", "identityKey", "fechaEmisionMs"])
    .index("by_empresa_identityKey_ultimaParticipacionEn", [
      "empresa",
      "identityKey",
      "ultimaParticipacionEn",
    ])
    .index("by_empresa_fechaEmisionMs", ["empresa", "fechaEmisionMs"]),

  /** Compact person directory used by current/historical report filters. */
  facturacionReportePersonas: defineTable({
    empresa: v.number(),
    identityKey: v.string(),
    userId: v.optional(v.string()),
    email: v.string(),
    nombre: v.string(),
    searchText: v.string(),
    cantidadFacturasActuales: v.number(),
    cantidadFacturasHistoricamenteParticipadas: v.number(),
    ultimaParticipacionEn: v.number(),
    actualizadoEn: v.number(),
  })
    .index("by_empresa_identityKey", ["empresa", "identityKey"])
    .index("by_empresa", ["empresa"])
    .searchIndex("search_identity", {
      searchField: "searchText",
      filterFields: ["empresa"],
    }),

  /** One row per valid current assignment owner. */
  facturacionDashboardResponsables: defineTable({
    facturaId: v.id("facturacionFacturas"),
    itemId: v.id("facturacionDashboardItems"),
    empresa: v.number(),
    userId: v.optional(v.string()),
    email: v.string(),
    nombre: v.string(),
    rol: v.string(),
    fase: v.string(),
    fechaAsignacion: v.number(),
    fechaEmisionMs: v.number(),
    valorContable: v.number(),
    valorAPagar: v.optional(v.number()),
    moneda: v.string(),
    slaEstado: v.string(),
    faseAgeMs: v.number(),
    esActiva: v.boolean(),
    esLider: v.boolean(),
    actualizadoEn: v.number(),
  })
    .index("by_facturaId", ["facturaId"])
    .index("by_itemId", ["itemId"])
    .index("by_empresa_userId_esActiva", ["empresa", "userId", "esActiva"])
    .index("by_empresa_email_esActiva", ["empresa", "email", "esActiva"])
    .index("by_empresa_esLider_esActiva", ["empresa", "esLider", "esActiva"])
    .index("by_empresa_esLider_fechaEmisionMs", ["empresa", "esLider", "fechaEmisionMs"]),

  /** Exact stage/owner/SLA counters with currency breakdowns. */
  facturacionDashboardContadores: defineTable({
    empresa: v.number(),
    clave: v.string(),
    count: v.number(),
    montosPorMoneda: v.record(v.string(), v.number()),
    montosAPagarPorMoneda: v.optional(v.record(v.string(), v.number())),
    actualizadoEn: v.number(),
  }).index("by_empresa_clave", ["empresa", "clave"]),

  /** Same operational counters, partitioned by invoice issue date. */
  facturacionDashboardContadoresDia: defineTable({
    empresa: v.number(),
    fechaEmision: v.string(),
    clave: v.string(),
    count: v.number(),
    montosPorMoneda: v.record(v.string(), v.number()),
    montosAPagarPorMoneda: v.optional(v.record(v.string(), v.number())),
    actualizadoEn: v.number(),
  })
    .index("by_empresa_fechaEmision", ["empresa", "fechaEmision"])
    .index("by_empresa_fechaEmision_clave", ["empresa", "fechaEmision", "clave"]),

  /** Durable state for the resumable, idempotent projection backfill. */
  facturacionDashboardBackfills: defineTable({
    clave: v.string(),
    estado: v.union(
      v.literal("idle"),
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed")
    ),
    cursor: v.union(v.string(), v.null()),
    procesadas: v.number(),
    lotes: v.number(),
    iniciadoEn: v.optional(v.number()),
    completadoEn: v.optional(v.number()),
    actualizadoEn: v.number(),
    error: v.optional(v.string()),
  }).index("by_clave", ["clave"]),

  /** Per-company, per-phase SLA thresholds (Colombian business days). */
  facturacionSlaConfiguracion: defineTable({
    empresa: v.number(),
    fase: v.union(
      v.literal("recepcion"),
      v.literal("revision_lider"),
      v.literal("causacion"),
      v.literal("revision_impuestos"),
      v.literal("eventos_dian"),
      v.literal("pendiente_rechazar_dian"),
      v.literal("gerencia"),
      v.literal("revision_tesoreria")
    ),
    umbralDiasLaborales: v.optional(v.number()),
    habilitado: v.boolean(),
    actualizadoEn: v.number(),
    actualizadoPorUserId: v.optional(v.string()),
    actualizadoPorNombre: v.optional(v.string()),
    actualizadoPorEmail: v.optional(v.string()),
  }).index("by_empresa_fase", ["empresa", "fase"]),

  /** Company-level SLA oversight recipients and email rollout flag. */
  facturacionSlaEmpresaConfig: defineTable({
    empresa: v.number(),
    oversightEmails: v.array(
      v.object({
        email: v.string(),
        nombre: v.optional(v.string()),
      })
    ),
    emailsHabilitados: v.boolean(),
    actualizadoEn: v.number(),
    actualizadoPorUserId: v.optional(v.string()),
    actualizadoPorNombre: v.optional(v.string()),
    actualizadoPorEmail: v.optional(v.string()),
  }).index("by_empresa", ["empresa"]),

  /** Idempotent daily SLA digest attempts. */
  facturacionSlaDigestLog: defineTable({
    fechaLocal: v.string(),
    empresa: v.number(),
    recipientEmail: v.string(),
    recipientUserId: v.optional(v.string()),
    recipientNombre: v.optional(v.string()),
    /** Zero-based batch of max 250 invoices for a recipient/day. */
    lote: v.optional(v.number()),
    estado: v.union(
      v.literal("pending"),
      v.literal("sent"),
      v.literal("failed"),
      v.literal("dry_run"),
      v.literal("skipped")
    ),
    intento: v.number(),
    facturaIds: v.array(v.id("facturacionFacturas")),
    error: v.optional(v.string()),
    dryRun: v.boolean(),
    enviadoEn: v.optional(v.number()),
    creadoEn: v.number(),
    actualizadoEn: v.number(),
  })
    .index("by_fecha_empresa_recipient", ["fechaLocal", "empresa", "recipientEmail"])
    .index("by_fecha_empresa_recipient_lote", ["fechaLocal", "empresa", "recipientEmail", "lote"])
    .index("by_fecha_estado", ["fechaLocal", "estado"]),

  centrosCosto: defineTable({
    appEmpresa: v.union(v.literal(1), v.literal(2), v.literal(3), v.literal(4)),
    empresa: v.union(v.literal(1), v.literal(2)),
    companiaId: v.string(),
    codigo: v.string(),
    descripcion: v.string(),
    centroOperacion: v.optional(v.string()),
    responsable: v.optional(v.string()),
    activo: v.boolean(),
    siesaId: v.string(),
    searchText: v.string(),
  })
    .index("by_siesaId", ["siesaId"])
    .index("by_appEmpresa_codigo", ["appEmpresa", "codigo"])
    .index("by_appEmpresa_activo", ["appEmpresa", "activo"])
    .searchIndex("search_text", {
      searchField: "searchText",
      filterFields: ["appEmpresa", "activo"],
    }),

  bolsasAnticipos,
  anticipos,
  anticiposAjustes,
  anticiposFases,
  anticiposRolesConfig,
  anticiposDesembolsoAdjuntos,
  cajasMenores,
  cajasMenoresRefills,
  cajasMenoresRolesConfig,
  cajasMenoresConfig,
  cajasMenoresReembolsos,
  cajasMenoresReembolsoContadores,
  cajasMenoresReembolsoAdjuntos,
  cajasMenoresReembolsoEventos,
  facturacionCajaMenorMovimientos,
  facturacionCajaMenorLegalizaciones,
  onboardingProveedores,
  onboardingProveedoresFases,
  onboardingProveedoresDocumentos,
  onboardingProveedoresTipos,
  onboardingProveedoresEvaluaciones,
  onboardingClientes,
  onboardingClientesFases,
  onboardingClientesDocumentos,
  onboardingRoles,
  onboardingWhitelist,
  onboardingAccessTokens,
  onboardingCorreos,
  onboardingCorreoEventos,
});
