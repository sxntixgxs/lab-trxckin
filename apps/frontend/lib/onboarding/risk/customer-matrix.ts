// ============================================================
// Matriz de riesgo — CLIENTES (hoja "DIR_CUM-F002 MATRIZ DE EVALUACIÓN
// DE TERCEROS - CLIENTES - V1"). Replica Calificaciones!H = MAX(B..G)
// seguido de VLOOKUP; PEP y listas se fuerzan a 1 como base ("No").
// ============================================================
import { computeFactorRisks, computeRisk, type RiskInput, type RiskMatrix } from "./compute";

export const CUSTOMER_MONTO_OPTIONS = [
  "Compras en Cantera Menor o igual a 10 millones",
  "Compras en Cantera Superior a 10 millones",
  "Ventas Comerciales Menor a 10 millones",
  "Ventas Comerciales Entre 10 y 50 millones",
  "Ventas Comerciales Superior a 50 millones",
  "Venta de activos fijos Menor a 10 millones",
  "Venta de activos fijos entre 10 y 100 millones",
  "Venta de activos Igual o superior a 100 millones",
] as const;

export const CUSTOMER_MONTO_RISK_MATRIX: Record<string, number> = {
  "Compras en Cantera Menor o igual a 10 millones": 1,
  "Compras en Cantera Superior a 10 millones": 2,
  "Ventas Comerciales Menor a 10 millones": 1,
  "Ventas Comerciales Entre 10 y 50 millones": 2,
  "Ventas Comerciales Superior a 50 millones": 3,
  "Venta de activos fijos Menor a 10 millones": 1,
  "Venta de activos fijos entre 10 y 100 millones": 2,
  "Venta de activos Igual o superior a 100 millones": 3,
};

export const CUSTOMER_SECTOR_OPTIONS = [
  "Entidades gubernamentales, públicas, gobiernos centrales, regionales o locales, empresas controladas por el Estado y otras entidades públicas",
  "Empresas del Estado / economía mixta / Gobiernos",
  "Entidades Privadas: Comercializadoras de piedras preciosas, casinos, activos virtuales, criptomonedas",
  "Consorcios o uniones temporales",
  "Privados: Otros",
  "Ingenieria de Obras Civiles, Construcción de Edificios, Carreteras o Ferroviarios",
  "Organizaciones sin ánimo de lucro, fundaciones, cooperativas",
  "Publica (Negociación Directa): Empresas del Estado / Gobierno",
  "Licitaciones Públicas: Empresas del Estado / Gobiernos",
  "Casos Especiales",
] as const;

export const CUSTOMER_SECTOR_RISK_MATRIX: Record<string, number> = {
  "Entidades gubernamentales, públicas, gobiernos centrales, regionales o locales, empresas controladas por el Estado y otras entidades públicas": 3,
  "Empresas del Estado / economía mixta / Gobiernos": 2,
  "Entidades Privadas: Comercializadoras de piedras preciosas, casinos, activos virtuales, criptomonedas": 4,
  "Consorcios o uniones temporales": 3,
  "Privados: Otros": 1,
  "Ingenieria de Obras Civiles, Construcción de Edificios, Carreteras o Ferroviarios": 2,
  "Organizaciones sin ánimo de lucro, fundaciones, cooperativas": 3,
  "Publica (Negociación Directa): Empresas del Estado / Gobierno": 2,
  "Licitaciones Públicas: Empresas del Estado / Gobiernos": 2,
  "Casos Especiales": 4,
};

export const CUSTOMER_RISK_MATRIX: RiskMatrix = {
  montoOptions: CUSTOMER_MONTO_OPTIONS,
  montoRisk: CUSTOMER_MONTO_RISK_MATRIX,
  sectorOptions: CUSTOMER_SECTOR_OPTIONS,
  sectorRisk: CUSTOMER_SECTOR_RISK_MATRIX,
  pepListasBaseline: 1,
};

export const computeCustomerFactorRisks = (params: RiskInput) =>
  computeFactorRisks(CUSTOMER_RISK_MATRIX, params);
export const computeCustomerRisk = (params: RiskInput) => computeRisk(CUSTOMER_RISK_MATRIX, params);
