// Tipos de notificación por correo del módulo de onboarding. Puro (sin React).
import type { OnboardingModulo } from "./roles";

export type SupplierEmailTipo =
  | "FASE_I_COMPLETADA"
  | "PENDIENTE_FIRMA"
  | "FORMULARIO_FIRMADO"
  | "DOC_RECHAZADO"
  | "EVALUACION_CUMPLIMIENTO_CAMBIADA"
  | "DOCS_COMPLETADOS"
  | "FASE_IV_ASIGNADA"
  | "FASE_IV_APROBADA"
  | "FASE_IV_RECHAZADA"
  | "FASE_V_COMPLETADA"
  | "FASE_V_RECHAZADA"
  | "INSCRIPCION_COMPLETADA";

export type CustomerEmailTipo =
  | "FASE_I_COMPLETADA"
  | "PENDIENTE_FIRMA"
  | "DOC_RECHAZADO"
  | "EVALUACION_CUMPLIMIENTO_CAMBIADA"
  | "APROBACION_CUMPLIMIENTO_ASIGNADA"
  | "INSCRIPCION_COMPLETADA";

export type OnboardingEmailTipo = SupplierEmailTipo | CustomerEmailTipo;

export type EmailTipoConfig = { asunto: string; titulo: string };

export const SUPPLIER_EMAIL_CONFIG: Record<SupplierEmailTipo, EmailTipoConfig> = {
  FASE_I_COMPLETADA: { asunto: "Análisis de Riesgo Completado", titulo: "Análisis de Riesgo Completado" },
  PENDIENTE_FIRMA: { asunto: "Firma Requerida — Formulario de Inscripción", titulo: "Firma del Representante Legal Requerida" },
  FORMULARIO_FIRMADO: { asunto: "Formulario Firmado — Cargar Documentos", titulo: "Formulario Firmado" },
  DOC_RECHAZADO: { asunto: "Documento Rechazado — Acción Requerida", titulo: "Documento Rechazado" },
  EVALUACION_CUMPLIMIENTO_CAMBIADA: { asunto: "Evaluación de Cumplimiento Actualizada", titulo: "Nuevos Documentos Requeridos" },
  DOCS_COMPLETADOS: { asunto: "Revisión de Cumplimiento Completada", titulo: "Revisión de Cumplimiento Completada" },
  FASE_IV_ASIGNADA: { asunto: "Aprobación de Cumplimiento Asignada", titulo: "Aprobación de Cumplimiento Pendiente" },
  FASE_IV_APROBADA: { asunto: "Inscripción Aprobada por Cumplimiento", titulo: "Aprobada por Cumplimiento" },
  FASE_IV_RECHAZADA: { asunto: "Inscripción Rechazada por Cumplimiento", titulo: "Inscripción Rechazada" },
  FASE_V_COMPLETADA: { asunto: "Evaluación de Compras Completada", titulo: "Evaluación de Compras Completada" },
  FASE_V_RECHAZADA: { asunto: "Inscripción Rechazada por Compras", titulo: "Inscripción Rechazada" },
  INSCRIPCION_COMPLETADA: { asunto: "Proveedor Inscrito Exitosamente", titulo: "Proveedor Inscrito" },
};

export const CUSTOMER_EMAIL_CONFIG: Record<CustomerEmailTipo, EmailTipoConfig> = {
  FASE_I_COMPLETADA: { asunto: "Análisis de Riesgo Completado", titulo: "Análisis de Riesgo Completado" },
  PENDIENTE_FIRMA: { asunto: "Firma Requerida — Formulario de Inscripción", titulo: "Firma del Representante Legal Requerida" },
  DOC_RECHAZADO: { asunto: "Documento Rechazado — Acción Requerida", titulo: "Documento Rechazado" },
  EVALUACION_CUMPLIMIENTO_CAMBIADA: { asunto: "Evaluación de Cumplimiento Actualizada", titulo: "Evaluación de Cumplimiento Actualizada" },
  APROBACION_CUMPLIMIENTO_ASIGNADA: { asunto: "Aprobación de Cumplimiento Asignada", titulo: "Aprobación de Cumplimiento Asignada" },
  INSCRIPCION_COMPLETADA: { asunto: "Cliente Inscrito Exitosamente", titulo: "Cliente Inscrito" },
};

/** Tipos cuyo destinatario es el tercero (proveedor/cliente) y llevan enlace al formulario. */
export const SUPPLIER_TIPOS_TERCERO: ReadonlySet<SupplierEmailTipo> = new Set([
  "FASE_I_COMPLETADA",
  "PENDIENTE_FIRMA",
  "FORMULARIO_FIRMADO",
  "DOC_RECHAZADO",
  "EVALUACION_CUMPLIMIENTO_CAMBIADA",
  "DOCS_COMPLETADOS",
  "FASE_IV_RECHAZADA",
  "FASE_V_RECHAZADA",
]);

export const CUSTOMER_TIPOS_TERCERO: ReadonlySet<CustomerEmailTipo> = new Set([
  "FASE_I_COMPLETADA",
  "PENDIENTE_FIRMA",
  "DOC_RECHAZADO",
  "EVALUACION_CUMPLIMIENTO_CAMBIADA",
]);

/** Tipos dirigidos al equipo interno (CTA al tablero). */
export const SUPPLIER_TIPOS_INTERNO: ReadonlySet<SupplierEmailTipo> = new Set([
  "FASE_IV_ASIGNADA",
  "FASE_IV_APROBADA",
  "FASE_V_COMPLETADA",
]);

export const CUSTOMER_TIPOS_INTERNO: ReadonlySet<CustomerEmailTipo> = new Set(["APROBACION_CUMPLIMIENTO_ASIGNADA"]);

export function isSupplierEmailTipo(value: string): value is SupplierEmailTipo {
  return value in SUPPLIER_EMAIL_CONFIG;
}

export function isCustomerEmailTipo(value: string): value is CustomerEmailTipo {
  return value in CUSTOMER_EMAIL_CONFIG;
}

export function isEmailTipoDeModulo(modulo: OnboardingModulo, value: string): boolean {
  return modulo === "supplier" ? isSupplierEmailTipo(value) : isCustomerEmailTipo(value);
}

export function emailTipoConfig(modulo: OnboardingModulo, tipo: string): EmailTipoConfig {
  const table: Record<string, EmailTipoConfig> = modulo === "supplier" ? SUPPLIER_EMAIL_CONFIG : CUSTOMER_EMAIL_CONFIG;
  return table[tipo] ?? { asunto: tipo, titulo: tipo };
}

export function esTipoTercero(modulo: OnboardingModulo, tipo: string): boolean {
  return modulo === "supplier"
    ? SUPPLIER_TIPOS_TERCERO.has(tipo as SupplierEmailTipo)
    : CUSTOMER_TIPOS_TERCERO.has(tipo as CustomerEmailTipo);
}

export function esTipoInterno(modulo: OnboardingModulo, tipo: string): boolean {
  return modulo === "supplier"
    ? SUPPLIER_TIPOS_INTERNO.has(tipo as SupplierEmailTipo)
    : CUSTOMER_TIPOS_INTERNO.has(tipo as CustomerEmailTipo);
}

export type DestinatarioTipo = "tercero" | "interno";

export type OnboardingEmailProps = {
  modulo: OnboardingModulo;
  tipo: string;
  destinatarioNombre: string;
  razonSocial: string;
  tipoDocumento: string;
  numeroDocumento: string;
  tipoTramite?: "INSCRIPCIÓN" | "ACTUALIZACIÓN";
  ctaUrl?: string;
  destinatarioTipo?: DestinatarioTipo;
  docLabel?: string;
  observaciones?: string;
  motivoRechazo?: string;
  tieneFormularioPdf?: boolean;
  tieneReporteTiemposPdf?: boolean;
  empresa: number;
};

export function tramiteEtiqueta(modulo: OnboardingModulo, t?: "INSCRIPCIÓN" | "ACTUALIZACIÓN"): string {
  const tercero = modulo === "supplier" ? "proveedor" : "cliente";
  if (t === "ACTUALIZACIÓN") return `Trámite: actualización de datos del ${tercero}. `;
  if (t === "INSCRIPCIÓN") return "Trámite: inscripción nueva. ";
  return "";
}

export function buildMensaje(props: OnboardingEmailProps): string {
  const { modulo, tipo, razonSocial, tipoDocumento, numeroDocumento, docLabel, observaciones, motivoRechazo, tipoTramite } = props;
  const quien = `${razonSocial} (${tipoDocumento} ${numeroDocumento})`;
  const T = tramiteEtiqueta(modulo, tipoTramite);
  const tercero = modulo === "supplier" ? "proveedor" : "cliente";
  switch (tipo) {
    case "FASE_I_COMPLETADA":
      return `${T}Se ha completado el análisis de riesgo de ${quien}. Ya puede acceder al formulario y cargar los documentos requeridos.`;
    case "PENDIENTE_FIRMA":
      return `${T}El formulario de ${quien} ha sido diligenciado y requiere su firma como representante legal para continuar con el proceso. Haga clic en el botón para revisar el formulario y firmarlo.`;
    case "FORMULARIO_FIRMADO":
      return `${T}El formulario de ${quien} ha sido firmado correctamente. Ya puede cargar los documentos requeridos.`;
    case "DOC_RECHAZADO":
      return `${T}El documento "${docLabel ?? ""}" de ${quien} fue rechazado.${observaciones ? ` Motivo: ${observaciones}` : ""} Por favor cargue nuevamente el documento corregido.`;
    case "EVALUACION_CUMPLIMIENTO_CAMBIADA": {
      const extra = observaciones?.trim();
      const sobreDocumentos = extra
        ? `Se solicitan documentos adicionales: ${extra}.`
        : "Revise en el formulario si aún hay documentos por cargar.";
      return `${T}La evaluación de Cumplimiento de ${quien} se actualizó durante la revisión documental.\n\n${sobreDocumentos}\n\nLo que ya envió se conserva. Ingrese al formulario para cargar lo pendiente. Si fuera necesaria otra documentación, el equipo de Cumplimiento le contactará por correo electrónico.`;
    }
    case "DOCS_COMPLETADOS":
      return `${T}Todos los documentos de ${quien} han sido aprobados. El expediente continúa a la aprobación de Cumplimiento.`;
    case "FASE_IV_ASIGNADA":
      return `${T}El expediente de ${quien} ya completó la revisión documental y requiere tu aprobación de Cumplimiento.`;
    case "APROBACION_CUMPLIMIENTO_ASIGNADA":
      return `${T}El proceso de ${quien} requiere tu aprobación de Cumplimiento. Ingresa al módulo de inscripción de clientes para gestionarlo.`;
    case "FASE_IV_APROBADA":
      return `${T}El equipo de Cumplimiento ha aprobado el expediente de ${quien}. Pasa a la Fase V — Evaluación de Compras.`;
    case "FASE_IV_RECHAZADA":
      return `${T}El equipo de Cumplimiento ha rechazado el expediente de ${quien}.${motivoRechazo ? ` Motivo: ${motivoRechazo}` : ""} Para más información contacte al equipo de Cumplimiento.`;
    case "FASE_V_RECHAZADA":
      return `${T}El equipo de Compras ha rechazado el expediente de ${quien}.${motivoRechazo ? ` Motivo: ${motivoRechazo}` : ""} Para más información contacte al equipo de Compras.`;
    case "FASE_V_COMPLETADA":
      return `${T}La evaluación de Compras para ${quien} ha sido completada exitosamente. El expediente pasa a Contabilidad para su creación en el sistema.`;
    case "INSCRIPCION_COMPLETADA":
      return `${T}El proceso de ${quien} ha sido completado exitosamente. El ${tercero} ya se encuentra creado y activo en el sistema contable.`;
    default:
      return `${T}Hay una novedad en el proceso de ${quien}.`;
  }
}

export function ctaLabel(modulo: OnboardingModulo, tipo: string, destinatarioTipo?: DestinatarioTipo): string {
  if (tipo === "PENDIENTE_FIRMA") return "Revisar y firmar formulario →";
  if (tipo === "FORMULARIO_FIRMADO") return "Cargar documentos requeridos →";
  if (tipo === "EVALUACION_CUMPLIMIENTO_CAMBIADA") return "Cargar documentos faltantes →";
  if (tipo === "FASE_IV_ASIGNADA" || tipo === "APROBACION_CUMPLIMIENTO_ASIGNADA") return "Ir a Aprobación Cumplimiento →";
  if (tipo === "FASE_IV_APROBADA") return "Ir a Evaluación de Compras →";
  if (destinatarioTipo === "interno" || esTipoInterno(modulo, tipo)) return "Ir al módulo →";
  return "Ver mi inscripción →";
}
