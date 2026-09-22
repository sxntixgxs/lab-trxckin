// Documentos requeridos al CLIENTE según tipo de evaluación y tipo de persona.
// Única fuente de verdad (la copia de Convex del sistema original es la canónica).
import { toTipoEvaluacion, type TipoEvaluacion, type TipoPersona } from "../risk/index";
import type { DocRequerido } from "./suppliers";

export const CUSTOMER_DOC_LABELS: Record<string, string> = {
  formulario: "Formulario de inscripción",
  rutUltimoAnio: "RUT últimos 30 días",
  documentoIdentidad: "Documento de identidad",
  documentoRlegal: "Documento representante legal",
  certificadoBancarioMax3Meses: "Certificado bancario (máx. 3 meses)",
  certificadoEstandaresMinimosByARL: "Certificado estándares mínimos ARL",
  declaracionRenta2UltimosAnios: "Declaración de renta 2 últimos años",
  declaracionRenta3UltimosAnios: "Declaración de renta 3 últimos años",
  estadosFinancieros2UltimosAnios: "Estados financieros 2 últimos años",
  formatoDeclaracionFondos: "Formato declaración de fondos",
  certificacionBancariaMax6Meses: "Certificación bancaria (máx. 6 meses)",
  composicionAccionaria: "Composición accionaria",
  referenciasComercialesMin2: "Referencias comerciales (mín. 2)",
  camaraComercioMax60Dias: "Cámara de comercio (máx. 60 días)",
  certificacionBancariaMax60Dias: "Certificación bancaria (máx. 60 días)",
  certificacionBancariaMax3Meses: "Certificación bancaria (máx. 3 meses)",
};

export const CUSTOMER_DOC_SETS: Record<string, readonly string[]> = {
  soloListasNatural: ["formulario", "rutUltimoAnio", "documentoIdentidad", "composicionAccionaria", "certificadoBancarioMax3Meses", "referenciasComercialesMin2", "certificadoEstandaresMinimosByARL"],
  soloListasJuridica: ["formulario", "rutUltimoAnio", "documentoRlegal", "composicionAccionaria", "certificadoBancarioMax3Meses", "referenciasComercialesMin2", "certificadoEstandaresMinimosByARL"],
  simplificadaNatural: ["formulario", "rutUltimoAnio", "documentoIdentidad", "composicionAccionaria", "certificacionBancariaMax6Meses", "referenciasComercialesMin2", "certificadoEstandaresMinimosByARL"],
  simplificadaJuridica: ["formulario", "camaraComercioMax60Dias", "rutUltimoAnio", "documentoRlegal", "composicionAccionaria", "certificacionBancariaMax60Dias", "referenciasComercialesMin2", "certificadoEstandaresMinimosByARL"],
  completaNatural: ["formulario", "rutUltimoAnio", "documentoIdentidad", "composicionAccionaria", "certificacionBancariaMax3Meses", "declaracionRenta2UltimosAnios", "referenciasComercialesMin2", "certificadoEstandaresMinimosByARL"],
  completaJuridica: ["formulario", "camaraComercioMax60Dias", "rutUltimoAnio", "declaracionRenta2UltimosAnios", "documentoRlegal", "composicionAccionaria", "certificacionBancariaMax3Meses", "estadosFinancieros2UltimosAnios", "referenciasComercialesMin2", "certificadoEstandaresMinimosByARL"],
  intensificadaNatural: ["formulario", "rutUltimoAnio", "documentoIdentidad", "composicionAccionaria", "certificacionBancariaMax6Meses", "declaracionRenta3UltimosAnios", "formatoDeclaracionFondos", "referenciasComercialesMin2", "certificadoEstandaresMinimosByARL"],
  intensificadaJuridica: ["formulario", "camaraComercioMax60Dias", "rutUltimoAnio", "declaracionRenta2UltimosAnios", "documentoRlegal", "composicionAccionaria", "certificacionBancariaMax3Meses", "estadosFinancieros2UltimosAnios", "referenciasComercialesMin2", "certificadoEstandaresMinimosByARL"],
  intensificadaPEPNatural: ["formulario", "rutUltimoAnio", "documentoIdentidad", "composicionAccionaria", "certificacionBancariaMax6Meses", "declaracionRenta2UltimosAnios", "formatoDeclaracionFondos", "referenciasComercialesMin2", "certificadoEstandaresMinimosByARL"],
  intensificadaPEPJuridica: ["formulario", "camaraComercioMax60Dias", "rutUltimoAnio", "declaracionRenta2UltimosAnios", "documentoRlegal", "composicionAccionaria", "certificacionBancariaMax60Dias", "estadosFinancieros2UltimosAnios", "referenciasComercialesMin2", "certificadoEstandaresMinimosByARL"],
};

export function customerDocVariantKey(
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

export function getCustomerDocKeys(
  tipoEvaluacion: string | undefined | null,
  tipoPersona: TipoPersona,
  isPep: boolean,
  options: { includeFormulario?: boolean } = {},
): string[] {
  const variant = customerDocVariantKey(toTipoEvaluacion(tipoEvaluacion), tipoPersona, isPep);
  if (!variant) return [];
  const keys = CUSTOMER_DOC_SETS[variant] ?? [];
  return options.includeFormulario ? [...keys] : keys.filter((k) => k !== "formulario");
}

export function getCustomerDocumentosRequeridos(
  tipoEvaluacion: string | undefined | null,
  tipoPersona: TipoPersona,
  isPep: boolean,
  options: { includeFormulario?: boolean } = {},
): DocRequerido[] {
  return getCustomerDocKeys(tipoEvaluacion, tipoPersona, isPep, options).map((key) => ({
    key,
    label: CUSTOMER_DOC_LABELS[key] ?? key,
  }));
}

export function customerDocLabel(key: string): string {
  return CUSTOMER_DOC_LABELS[key] ?? key;
}
