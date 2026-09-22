// Fases del proceso de inscripción de PROVEEDORES.
// Compartido por Convex (máquina de estados), la UI interna y el formulario público.

/** Fase actual de la inscripción (denormalizada en el documento). */
export const SUPPLIER_FASES_ACTUALES = [
  "I_ANALISIS_RIESGO",
  "II_PENDIENTE_FORMULARIO",
  "IIA_PENDIENTE_FIRMA",
  "III_REVISION_DOCUMENTAL",
  "IV_APROBADO_CUMPLIMIENTO",
  "V_EVALUACION_COMPRAS",
  "VI_CREACION_CONTABILIDAD",
  "COMPLETADO",
  "RECHAZADO",
  "ANULADA",
] as const;
export type SupplierFaseActual = (typeof SUPPLIER_FASES_ACTUALES)[number];

/** Fases que generan una fila en la tabla de fases (Fase III se divide en dos carriles). */
export const SUPPLIER_FASES_FILA = [
  "I_ANALISIS_RIESGO",
  "II_PENDIENTE_FORMULARIO",
  "IIA_PENDIENTE_FIRMA",
  "III_REVISION_DOCUMENTAL_COMPRAS",
  "III_REVISION_DOCUMENTAL_CUMPLIMIENTO",
  "IV_APROBADO_CUMPLIMIENTO",
  "V_EVALUACION_COMPRAS",
  "VI_CREACION_CONTABILIDAD",
] as const;
export type SupplierFaseFila = (typeof SUPPLIER_FASES_FILA)[number];

export const SUPPLIER_FASES_TERMINALES: ReadonlySet<string> = new Set(["COMPLETADO", "RECHAZADO", "ANULADA"]);

/** Orden de las fases de trabajo para barras de progreso y stepper. */
export const SUPPLIER_FASES_PROGRESO: readonly SupplierFaseActual[] = [
  "I_ANALISIS_RIESGO",
  "II_PENDIENTE_FORMULARIO",
  "IIA_PENDIENTE_FIRMA",
  "III_REVISION_DOCUMENTAL",
  "IV_APROBADO_CUMPLIMIENTO",
  "V_EVALUACION_COMPRAS",
  "VI_CREACION_CONTABILIDAD",
];

export const SUPPLIER_FASE_LABELS: Record<string, string> = {
  I_ANALISIS_RIESGO: "I · Análisis de Riesgo",
  II_PENDIENTE_FORMULARIO: "II · Pendiente Formulario",
  IIA_PENDIENTE_FIRMA: "IIA · Pendiente Firma",
  III_REVISION_DOCUMENTAL: "III · Revisión Documental",
  III_REVISION_DOCUMENTAL_COMPRAS: "III · Revisión Documental — Compras",
  III_REVISION_DOCUMENTAL_CUMPLIMIENTO: "III · Revisión Documental — Cumplimiento",
  IV_APROBADO_CUMPLIMIENTO: "IV · Aprobación Cumplimiento",
  V_EVALUACION_COMPRAS: "V · Evaluación Compras",
  VI_CREACION_CONTABILIDAD: "VI · Creación Contabilidad",
  COMPLETADO: "Completado",
  RECHAZADO: "Rechazado",
  ANULADA: "Anulada",
};

export const SUPPLIER_FASE_LABELS_CORTOS: Record<string, string> = {
  I_ANALISIS_RIESGO: "Análisis",
  II_PENDIENTE_FORMULARIO: "Formulario",
  IIA_PENDIENTE_FIRMA: "Firma",
  III_REVISION_DOCUMENTAL: "Documentos",
  IV_APROBADO_CUMPLIMIENTO: "Cumplimiento",
  V_EVALUACION_COMPRAS: "Compras",
  VI_CREACION_CONTABILIDAD: "Contabilidad",
  COMPLETADO: "Completado",
  RECHAZADO: "Rechazado",
  ANULADA: "Anulada",
};

/** Orden completo de filas de fase para reportes de tiempos. */
export const SUPPLIER_FASES_ORDEN_REPORTE: readonly string[] = [
  "I_ANALISIS_RIESGO",
  "II_PENDIENTE_FORMULARIO",
  "IIA_PENDIENTE_FIRMA",
  "III_REVISION_DOCUMENTAL",
  "III_REVISION_DOCUMENTAL_COMPRAS",
  "III_REVISION_DOCUMENTAL_CUMPLIMIENTO",
  "IV_APROBADO_CUMPLIMIENTO",
  "V_EVALUACION_COMPRAS",
  "VI_CREACION_CONTABILIDAD",
];

export type SupplierRol =
  | "CUMPLIMIENTO_LOW_RISK"
  | "CUMPLIMIENTO_MEDIUM_RISK"
  | "CUMPLIMIENTO_HIGH_RISK"
  | "COMPRAS"
  | "FINANCIERO"
  | "CONTABILIDAD";

export const SUPPLIER_ROLES: readonly SupplierRol[] = [
  "CUMPLIMIENTO_LOW_RISK",
  "CUMPLIMIENTO_MEDIUM_RISK",
  "CUMPLIMIENTO_HIGH_RISK",
  "COMPRAS",
  "FINANCIERO",
  "CONTABILIDAD",
];

/**
 * Rol responsable de cada fase. Para IV_APROBADO_CUMPLIMIENTO el rol depende del
 * nivel de riesgo (ver `rolCumplimientoPorRiesgo`); aquí se indica el rol base.
 */
export const SUPPLIER_FASE_ROL: Record<string, SupplierRol> = {
  I_ANALISIS_RIESGO: "CUMPLIMIENTO_LOW_RISK",
  III_REVISION_DOCUMENTAL: "CUMPLIMIENTO_LOW_RISK",
  III_REVISION_DOCUMENTAL_CUMPLIMIENTO: "CUMPLIMIENTO_LOW_RISK",
  III_REVISION_DOCUMENTAL_COMPRAS: "COMPRAS",
  IV_APROBADO_CUMPLIMIENTO: "CUMPLIMIENTO_LOW_RISK",
  V_EVALUACION_COMPRAS: "COMPRAS",
  VI_CREACION_CONTABILIDAD: "CONTABILIDAD",
};

/** Fases que aparecen en "Mis tareas" para cada rol. */
export const SUPPLIER_FASES_POR_ROL: Record<SupplierRol, readonly SupplierFaseFila[]> = {
  CUMPLIMIENTO_LOW_RISK: ["I_ANALISIS_RIESGO", "III_REVISION_DOCUMENTAL_CUMPLIMIENTO", "IV_APROBADO_CUMPLIMIENTO"],
  CUMPLIMIENTO_MEDIUM_RISK: ["I_ANALISIS_RIESGO", "IV_APROBADO_CUMPLIMIENTO"],
  CUMPLIMIENTO_HIGH_RISK: ["I_ANALISIS_RIESGO", "IV_APROBADO_CUMPLIMIENTO"],
  COMPRAS: ["III_REVISION_DOCUMENTAL_COMPRAS", "V_EVALUACION_COMPRAS"],
  FINANCIERO: [],
  CONTABILIDAD: ["VI_CREACION_CONTABILIDAD"],
};

export function supplierFaseIndex(fase: string | undefined | null): number {
  if (!fase) return -1;
  if (fase.startsWith("III_REVISION_DOCUMENTAL")) return SUPPLIER_FASES_PROGRESO.indexOf("III_REVISION_DOCUMENTAL");
  return SUPPLIER_FASES_PROGRESO.indexOf(fase as SupplierFaseActual);
}

export function supplierFaseLabel(fase: string | undefined | null): string {
  if (!fase) return "—";
  return SUPPLIER_FASE_LABELS[fase] ?? fase;
}
