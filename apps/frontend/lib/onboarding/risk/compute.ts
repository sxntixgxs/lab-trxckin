import {
  GENERAL_RISK_MATRIX,
  JURISDICCION_INTERNACIONAL_RISK_MATRIX,
  JURISDICCION_NACIONAL_RISK_MATRIX,
  LISTAS_RISK_MATRIX,
  scoreToNivel,
  TIPO_EVALUACION_MATRIX,
  type RiesgoNivel,
  type TipoEvaluacion,
} from "./shared";

/** Matriz específica de un módulo (proveedores o clientes). */
export interface RiskMatrix {
  montoOptions: readonly string[];
  montoRisk: Record<string, number>;
  sectorOptions: readonly string[];
  sectorRisk: Record<string, number>;
  /**
   * Puntaje que reciben PEP y listas cuando la respuesta es desconocida.
   * Proveedores: 0 (sin información → INDEFINIDO). Clientes: 1 (la hoja
   * Calificaciones asume "No" como base, por lo que el riesgo nunca es INDEFINIDO).
   */
  pepListasBaseline: 0 | 1;
}

export interface FactorRisk {
  /** Puntaje numérico 1–4; 0 cuando no hay información suficiente para puntuar. */
  score: number;
  nivel: RiesgoNivel;
}

export interface RiskInput {
  montoAnual?: string;
  sectorEconomico?: string;
  jurisdiccionNacional?: string;
  jurisdiccionInternacional?: string;
  isPep?: boolean;
  listas?: string;
}

export interface FactorRisks {
  montoAnual: FactorRisk;
  sectorEconomico: FactorRisk;
  jurisdiccionNacional: FactorRisk;
  jurisdiccionInternacional: FactorRisk;
  isPep: FactorRisk;
  listas: FactorRisk;
}

export type RiskResult = { riesgo: RiesgoNivel; tipoEvaluacion: TipoEvaluacion };

/** Evalúa el puntaje de riesgo de cada uno de los seis factores por separado. */
export function computeFactorRisks(matrix: RiskMatrix, params: RiskInput): FactorRisks {
  const montoScore = matrix.montoRisk[params.montoAnual ?? ""] ?? 0;
  const sectorScore = matrix.sectorRisk[params.sectorEconomico ?? ""] ?? 0;
  const jurNacScore = params.jurisdiccionNacional
    ? (JURISDICCION_NACIONAL_RISK_MATRIX[params.jurisdiccionNacional] ?? 0)
    : 0;
  const jurIntScore = params.jurisdiccionInternacional
    ? (JURISDICCION_INTERNACIONAL_RISK_MATRIX[params.jurisdiccionInternacional] ?? 0)
    : 0;
  const pepScore =
    params.isPep === true ? 4 : params.isPep === false ? 1 : matrix.pepListasBaseline;
  const listasScore =
    LISTAS_RISK_MATRIX[(params.listas ?? "").trim().toUpperCase()] ?? matrix.pepListasBaseline;

  return {
    montoAnual: { score: montoScore, nivel: scoreToNivel(montoScore) },
    sectorEconomico: { score: sectorScore, nivel: scoreToNivel(sectorScore) },
    jurisdiccionNacional: { score: jurNacScore, nivel: scoreToNivel(jurNacScore) },
    jurisdiccionInternacional: { score: jurIntScore, nivel: scoreToNivel(jurIntScore) },
    isPep: { score: pepScore, nivel: scoreToNivel(pepScore) },
    listas: { score: listasScore, nivel: scoreToNivel(listasScore) },
  };
}

/**
 * Riesgo general y tipo de evaluación = MAX de los seis factores
 * (monto, sector, jurisdicción nacional, jurisdicción internacional, PEP, listas).
 */
export function computeRisk(matrix: RiskMatrix, params: RiskInput): RiskResult {
  const factors = computeFactorRisks(matrix, params);
  const maxRisk = Math.max(
    factors.montoAnual.score,
    factors.sectorEconomico.score,
    factors.jurisdiccionNacional.score,
    factors.jurisdiccionInternacional.score,
    factors.isPep.score,
    factors.listas.score,
  );
  if (maxRisk === 0) {
    return { riesgo: "INDEFINIDO", tipoEvaluacion: "INDEFINIDO" };
  }
  const riesgo = GENERAL_RISK_MATRIX[maxRisk] ?? "INDEFINIDO";
  const tipoEvaluacion = TIPO_EVALUACION_MATRIX[riesgo] ?? "INDEFINIDO";
  return { riesgo, tipoEvaluacion };
}

/** Normaliza un valor de riesgo o de evaluación al tipo de evaluación canónico. */
export function toTipoEvaluacion(valor: string | undefined | null): TipoEvaluacion {
  const v = (valor ?? "").trim().toUpperCase();
  if (v === "SUPERIOR" || v === "INTENSIFICADA") return "INTENSIFICADA";
  if (v === "ALTO" || v === "COMPLETA") return "COMPLETA";
  if (v === "MEDIO" || v === "SIMPLIFICADA") return "SIMPLIFICADA";
  if (v === "BAJO" || v === "SOLO LISTAS") return "SOLO LISTAS";
  return "INDEFINIDO";
}

/** Normaliza un valor de riesgo o de evaluación al nivel de riesgo canónico. */
export function toRiesgoNivel(valor: string | undefined | null): RiesgoNivel {
  const v = (valor ?? "").trim().toUpperCase();
  if (v === "SUPERIOR" || v === "INTENSIFICADA") return "SUPERIOR";
  if (v === "ALTO" || v === "COMPLETA") return "ALTO";
  if (v === "MEDIO" || v === "SIMPLIFICADA") return "MEDIO";
  if (v === "BAJO" || v === "SOLO LISTAS") return "BAJO";
  return "INDEFINIDO";
}

export type RolCumplimiento = "CUMPLIMIENTO_LOW_RISK" | "CUMPLIMIENTO_MEDIUM_RISK" | "CUMPLIMIENTO_HIGH_RISK";

/** Rol de Cumplimiento que aprueba según el tipo de evaluación (o nivel de riesgo). */
export function rolCumplimientoPorRiesgo(valor: string | undefined | null): RolCumplimiento {
  const evaluacion = toTipoEvaluacion(valor);
  if (evaluacion === "COMPLETA") return "CUMPLIMIENTO_MEDIUM_RISK";
  if (evaluacion === "INTENSIFICADA") return "CUMPLIMIENTO_HIGH_RISK";
  return "CUMPLIMIENTO_LOW_RISK";
}
