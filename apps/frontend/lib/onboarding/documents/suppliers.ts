// Documentos requeridos al PROVEEDOR según tipo de evaluación y tipo de persona.
// Única fuente de verdad para Convex (filas de revisión), el formulario público y la UI interna.
import { toTipoEvaluacion, type TipoEvaluacion, type TipoPersona } from "../risk/index";

export interface DocRequerido {
  key: string;
  label: string;
}

export const SUPPLIER_DOC_LABELS: Record<string, string> = {
  formulario: "Formulario de inscripción",
  rutUltimoAnio: "RUT últimos 30 días",
  documentoIdentidad: "Documento de identidad",
  documentoRlegal: "Documento representante legal",
  certificadoBancarioMax3Meses: "Certificado bancario (máx. 3 meses)",
  certificacionBancariaMax6Meses: "Certificación bancaria (máx. 6 meses)",
  certificacionBancariaMax60Dias: "Certificación bancaria (máx. 60 días)",
  certificacionBancariaMax3Meses: "Certificación bancaria (máx. 3 meses)",
  camaraComercioMax60Dias: "Cámara de comercio (máx. 60 días)",
  portfolio: "Portafolio",
  referenciasComercialesMin2: "Referencias comerciales (mín. 2)",
  certificadoEstandaresMinimosByARL: "Certificado estándares mínimos ARL",
  declaracionRenta2UltimosAnios: "Declaración de renta 2 últimos años",
  declaracionRenta3UltimosAnios: "Declaración de renta 3 últimos años",
  estadosFinancieros2UltimosAnios: "Estados financieros 2 últimos años",
  formatoDeclaracionFondos: "Formato declaración de fondos",
  composicionAccionaria: "Composición accionaria",
};

/** Documentos que revisa Compras (los demás los revisa Cumplimiento). */
export const SUPPLIER_DOCS_COMPRAS: ReadonlySet<string> = new Set([
  "portfolio",
  "referenciasComercialesMin2",
  "certificadoEstandaresMinimosByARL",
]);

export const SUPPLIER_DOC_SETS: Record<string, readonly string[]> = {
  soloListasNatural: ["formulario", "rutUltimoAnio", "documentoIdentidad", "composicionAccionaria", "certificadoBancarioMax3Meses", "portfolio", "referenciasComercialesMin2", "certificadoEstandaresMinimosByARL"],
  soloListasJuridica: ["formulario", "rutUltimoAnio", "documentoRlegal", "composicionAccionaria", "certificadoBancarioMax3Meses", "portfolio", "referenciasComercialesMin2", "certificadoEstandaresMinimosByARL"],
  simplificadaNatural: ["formulario", "rutUltimoAnio", "documentoIdentidad", "composicionAccionaria", "certificacionBancariaMax6Meses", "portfolio", "referenciasComercialesMin2", "certificadoEstandaresMinimosByARL"],
  simplificadaJuridica: ["formulario", "camaraComercioMax60Dias", "rutUltimoAnio", "documentoRlegal", "composicionAccionaria", "certificacionBancariaMax60Dias", "portfolio", "referenciasComercialesMin2", "certificadoEstandaresMinimosByARL"],
  completaNatural: ["formulario", "rutUltimoAnio", "documentoIdentidad", "composicionAccionaria", "certificacionBancariaMax3Meses", "declaracionRenta2UltimosAnios", "portfolio", "referenciasComercialesMin2", "certificadoEstandaresMinimosByARL"],
  completaJuridica: ["formulario", "camaraComercioMax60Dias", "rutUltimoAnio", "declaracionRenta2UltimosAnios", "documentoRlegal", "composicionAccionaria", "certificacionBancariaMax3Meses", "estadosFinancieros2UltimosAnios", "portfolio", "referenciasComercialesMin2", "certificadoEstandaresMinimosByARL"],
  intensificadaNatural: ["formulario", "rutUltimoAnio", "documentoIdentidad", "composicionAccionaria", "certificacionBancariaMax6Meses", "declaracionRenta3UltimosAnios", "formatoDeclaracionFondos", "portfolio", "referenciasComercialesMin2", "certificadoEstandaresMinimosByARL"],
  intensificadaJuridica: ["formulario", "camaraComercioMax60Dias", "rutUltimoAnio", "declaracionRenta2UltimosAnios", "documentoRlegal", "composicionAccionaria", "certificacionBancariaMax3Meses", "estadosFinancieros2UltimosAnios", "portfolio", "referenciasComercialesMin2", "certificadoEstandaresMinimosByARL"],
  intensificadaPEPNatural: ["formulario", "rutUltimoAnio", "documentoIdentidad", "composicionAccionaria", "certificacionBancariaMax6Meses", "declaracionRenta2UltimosAnios", "formatoDeclaracionFondos", "portfolio", "referenciasComercialesMin2", "certificadoEstandaresMinimosByARL"],
  // Nota: la variante PEP jurídica no incluye documentos de Compras (comportamiento heredado).
  intensificadaPEPJuridica: ["formulario", "camaraComercioMax60Dias", "rutUltimoAnio", "declaracionRenta2UltimosAnios", "documentoRlegal", "composicionAccionaria", "certificacionBancariaMax60Dias", "estadosFinancieros2UltimosAnios"],
};

export function supplierDocVariantKey(
  tipoEvaluacion: TipoEvaluacion,
  tipoPersona: TipoPersona,
  isPep: boolean,
): string | null {
  if (tipoEvaluacion === "INDEFINIDO") return null;
  const natural = tipoPersona === "PERSONA_NATURAL";
  if (tipoEvaluacion === "INTENSIFICADA" && isPep) return natural ? "intensificadaPEPNatural" : "intensificadaPEPJuridica";
  if (tipoEvaluacion === "INTENSIFICADA") return natural ? "intensificadaNatural" : "intensificadaJuridica";
  if (tipoEvaluacion === "COMPLETA") return natural ? "completaNatural" : "completaJuridica";
  if (tipoEvaluacion === "SIMPLIFICADA") return natural ? "simplificadaNatural" : "simplificadaJuridica";
  return natural ? "soloListasNatural" : "soloListasJuridica";
}

/**
 * Claves de documentos requeridos. Acepta tanto el tipo de evaluación como el nivel
 * de riesgo (BAJO/MEDIO/ALTO/SUPERIOR). El "formulario" se excluye por defecto: es lo
 * que el proveedor completa en línea, no un adjunto.
 */
export function getSupplierDocKeys(
  tipoEvaluacion: string | undefined | null,
  tipoPersona: TipoPersona,
  isPep: boolean,
  options: { includeFormulario?: boolean } = {},
): string[] {
  const variant = supplierDocVariantKey(toTipoEvaluacion(tipoEvaluacion), tipoPersona, isPep);
  if (!variant) return [];
  const keys = SUPPLIER_DOC_SETS[variant] ?? [];
  return options.includeFormulario ? [...keys] : keys.filter((k) => k !== "formulario");
}

export function getSupplierDocumentosRequeridos(
  tipoEvaluacion: string | undefined | null,
  tipoPersona: TipoPersona,
  isPep: boolean,
  options: { includeFormulario?: boolean } = {},
): DocRequerido[] {
  return getSupplierDocKeys(tipoEvaluacion, tipoPersona, isPep, options).map((key) => ({
    key,
    label: SUPPLIER_DOC_LABELS[key] ?? key,
  }));
}

export function supplierDocLabel(key: string): string {
  return SUPPLIER_DOC_LABELS[key] ?? key;
}

/** Lane (grupo revisor) al que pertenece un documento del proveedor. */
export function supplierDocRevisorRol(docKey: string): "COMPRAS" | "CUMPLIMIENTO_LOW_RISK" {
  return SUPPLIER_DOCS_COMPRAS.has(docKey) ? "COMPRAS" : "CUMPLIMIENTO_LOW_RISK";
}
