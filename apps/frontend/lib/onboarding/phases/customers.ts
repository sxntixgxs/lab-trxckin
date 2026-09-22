// Fases del proceso de inscripción de CLIENTES.
// Compartido por Convex (máquina de estados), la UI interna y el formulario público.

export const CUSTOMER_FASES_ACTUALES = [
  "I_ANALISIS_RIESGO",
  "II_PENDIENTE_FORMULARIO",
  "IIA_PENDIENTE_FIRMA",
  "III_REVISION_DOCUMENTAL",
  "IIIA_APROBACION_CUMPLIMIENTO",
  "IV_CREACION_CONTABILIDAD",
  "COMPLETADO",
  "RECHAZADO",
  "ANULADA",
] as const;
export type CustomerFaseActual = (typeof CUSTOMER_FASES_ACTUALES)[number];

export const CUSTOMER_FASES_FILA = [
  "I_ANALISIS_RIESGO",
  "II_PENDIENTE_FORMULARIO",
  "IIA_PENDIENTE_FIRMA",
  "III_REVISION_DOCUMENTAL",
  "IIIA_APROBACION_CUMPLIMIENTO",
  "IV_CREACION_CONTABILIDAD",
] as const;
export type CustomerFaseFila = (typeof CUSTOMER_FASES_FILA)[number];

export const CUSTOMER_FASES_TERMINALES: ReadonlySet<string> = new Set(["COMPLETADO", "RECHAZADO", "ANULADA"]);

export const CUSTOMER_FASES_PROGRESO: readonly CustomerFaseActual[] = [
  "I_ANALISIS_RIESGO",
  "II_PENDIENTE_FORMULARIO",
  "IIA_PENDIENTE_FIRMA",
  "III_REVISION_DOCUMENTAL",
  "IIIA_APROBACION_CUMPLIMIENTO",
  "IV_CREACION_CONTABILIDAD",
];

export const CUSTOMER_FASE_LABELS: Record<string, string> = {
  I_ANALISIS_RIESGO: "I · Análisis de Riesgo",
  II_PENDIENTE_FORMULARIO: "II · Pendiente Formulario",
  IIA_PENDIENTE_FIRMA: "IIA · Pendiente Firma",
  III_REVISION_DOCUMENTAL: "III · Revisión Documental",
  IIIA_APROBACION_CUMPLIMIENTO: "IIIA · Aprobación Cumplimiento",
  IV_CREACION_CONTABILIDAD: "IV · Creación Contabilidad",
  COMPLETADO: "Completado",
  RECHAZADO: "Rechazado",
  ANULADA: "Anulada",
};

export const CUSTOMER_FASE_LABELS_CORTOS: Record<string, string> = {
  I_ANALISIS_RIESGO: "Análisis",
  II_PENDIENTE_FORMULARIO: "Formulario",
  IIA_PENDIENTE_FIRMA: "Firma",
  III_REVISION_DOCUMENTAL: "Documentos",
  IIIA_APROBACION_CUMPLIMIENTO: "Cumplimiento",
  IV_CREACION_CONTABILIDAD: "Contabilidad",
  COMPLETADO: "Completado",
  RECHAZADO: "Rechazado",
  ANULADA: "Anulada",
};

export const CUSTOMER_FASES_ORDEN_REPORTE: readonly string[] = [...CUSTOMER_FASES_FILA];

export type CustomerRol =
  | "CUMPLIMIENTO_LOW_RISK"
  | "CUMPLIMIENTO_MEDIUM_RISK"
  | "CUMPLIMIENTO_HIGH_RISK"
  | "FINANCIERO"
  | "CONTABILIDAD";

export const CUSTOMER_ROLES: readonly CustomerRol[] = [
  "CUMPLIMIENTO_LOW_RISK",
  "CUMPLIMIENTO_MEDIUM_RISK",
  "CUMPLIMIENTO_HIGH_RISK",
  "FINANCIERO",
  "CONTABILIDAD",
];

/** Rol base por fase (IIIA depende del nivel de riesgo, ver `rolCumplimientoPorRiesgo`). */
export const CUSTOMER_FASE_ROL: Record<string, CustomerRol> = {
  I_ANALISIS_RIESGO: "CUMPLIMIENTO_LOW_RISK",
  III_REVISION_DOCUMENTAL: "CUMPLIMIENTO_LOW_RISK",
  IIIA_APROBACION_CUMPLIMIENTO: "CUMPLIMIENTO_LOW_RISK",
  IV_CREACION_CONTABILIDAD: "CONTABILIDAD",
};

export const CUSTOMER_FASES_POR_ROL: Record<CustomerRol, readonly CustomerFaseFila[]> = {
  CUMPLIMIENTO_LOW_RISK: ["I_ANALISIS_RIESGO", "III_REVISION_DOCUMENTAL", "IIIA_APROBACION_CUMPLIMIENTO"],
  CUMPLIMIENTO_MEDIUM_RISK: ["I_ANALISIS_RIESGO", "IIIA_APROBACION_CUMPLIMIENTO"],
  CUMPLIMIENTO_HIGH_RISK: ["I_ANALISIS_RIESGO", "IIIA_APROBACION_CUMPLIMIENTO"],
  FINANCIERO: [],
  CONTABILIDAD: ["IV_CREACION_CONTABILIDAD"],
};

export function customerFaseIndex(fase: string | undefined | null): number {
  if (!fase) return -1;
  return CUSTOMER_FASES_PROGRESO.indexOf(fase as CustomerFaseActual);
}

export function customerFaseLabel(fase: string | undefined | null): string {
  if (!fase) return "—";
  return CUSTOMER_FASE_LABELS[fase] ?? fase;
}
