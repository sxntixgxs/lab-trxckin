import type { Doc, Id } from "../../_generated/dataModel";
import { TIPO_PERSONA_LABELS, type RiesgoNivel, type TipoEvaluacion } from "../../../lib/onboarding/risk/shared";
import { computeSupplierFactorRisks, computeSupplierRisk } from "../../../lib/onboarding/risk/supplier-matrix";

export type FactorReporte = {
  respuesta: string;
  puntaje: number | null;
  nivel: RiesgoNivel;
};

export type MatrizRiesgoReporteRow = {
  inscripcionId: Id<"onboardingProveedores">;
  empresaId: number;
  fechaInicioProceso: number;
  tipoSolicitud: "INSCRIPCIÓN" | "ACTUALIZACIÓN";
  estadoProceso: string;

  proveedor: string;
  tipoPersona: string;
  tipoDocumento: string;
  nit: string;

  productoServicio: string;
  ciiuPrincipal: string;
  actividadEconomicaPrincipal: string;
  ciiuSecundario: string;
  actividadEconomicaSecundaria: string;

  montoAnual: FactorReporte;
  sectorEconomico: FactorReporte;
  jurisdiccionNacional: FactorReporte;
  jurisdiccionInternacional: FactorReporte;
  pep: FactorReporte;
  listasRestrictivas: FactorReporte;

  riesgoGlobalPuntaje: number | null;
  riesgoGlobalNivel: RiesgoNivel;
  tipoEvaluacion: TipoEvaluacion;
};

const NIVELES: Record<number, RiesgoNivel> = { 1: "BAJO", 2: "MEDIO", 3: "ALTO", 4: "SUPERIOR" };

export function factorFromScore(respuesta: string, score: number): FactorReporte {
  if (score <= 0) return { respuesta, puntaje: null, nivel: "INDEFINIDO" };
  return { respuesta, puntaje: score, nivel: NIVELES[score] ?? "INDEFINIDO" };
}

export function normalizePepRespuesta(isPep: boolean | undefined): string {
  if (isPep === true) return "SÍ";
  if (isPep === false) return "NO";
  return "";
}

/** Recalcula los seis factores y el riesgo global al momento de exportar. */
export function inscripcionToMatrizRiesgoReporteRow(ins: Doc<"onboardingProveedores">): MatrizRiesgoReporteRow {
  const matriz = ins.matriz_00;
  const dg = ins.datos_generales_01;
  const nit = ins.NIT?.trim() || dg.numeroDocumento?.trim() || "";
  const pepRespuesta = normalizePepRespuesta(matriz.isPep);
  const listasRespuesta = (matriz.listas ?? "").trim();
  const input = {
    montoAnual: matriz.montoAnual,
    sectorEconomico: matriz.sectorEconomico,
    jurisdiccionNacional: matriz.jurisdiccionNacional,
    jurisdiccionInternacional: matriz.jurisdiccionInternacional,
    isPep: matriz.isPep,
    listas: listasRespuesta,
  };
  const factors = computeSupplierFactorRisks(input);
  const recalculado = computeSupplierRisk(input);
  const maxScore = Math.max(
    factors.montoAnual.score,
    factors.sectorEconomico.score,
    factors.jurisdiccionNacional.score,
    factors.jurisdiccionInternacional.score,
    factors.isPep.score,
    factors.listas.score,
  );
  const tipoPersonaRaw = dg.tipoPersona ?? "";
  return {
    inscripcionId: ins._id,
    empresaId: ins.empresa,
    fechaInicioProceso: ins._creationTime,
    tipoSolicitud: dg.tipoSolicitud ?? "INSCRIPCIÓN",
    estadoProceso: ins.faseActual,
    proveedor: dg.razonSocial?.trim() || "—",
    tipoPersona: TIPO_PERSONA_LABELS[tipoPersonaRaw] ?? tipoPersonaRaw.replace(/_/g, " "),
    tipoDocumento: dg.tipoDocumento ?? "—",
    nit,
    productoServicio: matriz.servicioSuministrado?.trim() || "—",
    ciiuPrincipal: ins.actividadPrincipal_02?.codigoCiiu?.trim() || "—",
    actividadEconomicaPrincipal:
      matriz.actividadEconomicaPrincipal?.trim() || ins.actividadPrincipal_02?.actividadEconomica?.trim() || "—",
    ciiuSecundario: matriz.codigoCiiuSecundario?.trim() || "—",
    actividadEconomicaSecundaria: matriz.actividadEconomicaSecundaria?.trim() || "—",
    montoAnual: factorFromScore(matriz.montoAnual ?? "", factors.montoAnual.score),
    sectorEconomico: factorFromScore(matriz.sectorEconomico ?? "", factors.sectorEconomico.score),
    jurisdiccionNacional: factorFromScore(matriz.jurisdiccionNacional ?? "", factors.jurisdiccionNacional.score),
    jurisdiccionInternacional: factorFromScore(matriz.jurisdiccionInternacional ?? "", factors.jurisdiccionInternacional.score),
    pep: factorFromScore(pepRespuesta, factors.isPep.score),
    listasRestrictivas: factorFromScore(listasRespuesta, factors.listas.score),
    riesgoGlobalPuntaje: maxScore > 0 ? maxScore : null,
    riesgoGlobalNivel: recalculado.riesgo,
    tipoEvaluacion: recalculado.tipoEvaluacion,
  };
}
