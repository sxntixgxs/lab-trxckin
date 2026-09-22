// ============================================================
// Matriz de riesgo — PROVEEDORES (hoja "MATRIZ DE EVALUACIÓN DE PROVEEDORES")
// ============================================================
import { computeFactorRisks, computeRisk, type RiskInput, type RiskMatrix } from "./compute";

export const SUPPLIER_MONTO_OPTIONS = [
  "Menor a 10 millones COP",
  "Entre 10 y 300 millones COP",
  "Superior a 300 millones COP",
  "Superior a 1 millón USD",
] as const;

export const SUPPLIER_MONTO_RISK_MATRIX: Record<string, number> = {
  "Menor a 10 millones COP": 1,
  "Entre 10 y 300 millones COP": 2,
  "Superior a 300 millones COP": 3,
  "Superior a 1 millón USD": 4,
};

export const SUPPLIER_SECTOR_OPTIONS = [
  "Entidades gubernamentales, públicas, gobiernos centrales, regionales o locales, empresas controladas por el Estado y otras entidades públicas (Ejemplo, notarías, municipios, alcaldías, etc)",
  "Arriendo Sector inmobiliario",
  "Ingenieria de Obras Civiles, Construcción de Edificios, Carreteras o Ferroviarios",
  "Transporte de Carga, Personas",
  "Proveedores de Repuestos para Maquinaria y Vehículos",
  "Comercializadoras de piedras preciosas, casinos, activos virtuales, criptomonedas",
  "Consultoría y/o asesoría (Técnica, impuestos, legales)",
  "Publicidad y Mercadeo, Capacitaciones, Auditorías",
  "Organizaciones sin ánimo de lucro, fundaciones, cooperativas",
  "Proveedores materias primas e insumos",
  "Alquiler o compra de equipos y maquinaria",
  "Proveedores de Suministros u Otros",
  "Proveedor de Combustibles o Explosivos",
  "Casos de validación especial",
] as const;

export const SUPPLIER_SECTOR_RISK_MATRIX: Record<string, number> = {
  "Entidades gubernamentales, públicas, gobiernos centrales, regionales o locales, empresas controladas por el Estado y otras entidades públicas (Ejemplo, notarías, municipios, alcaldías, etc)": 1,
  "Arriendo Sector inmobiliario": 3,
  "Ingenieria de Obras Civiles, Construcción de Edificios, Carreteras o Ferroviarios": 3,
  "Transporte de Carga, Personas": 2,
  "Proveedores de Repuestos para Maquinaria y Vehículos": 2,
  "Comercializadoras de piedras preciosas, casinos, activos virtuales, criptomonedas": 4,
  "Consultoría y/o asesoría (Técnica, impuestos, legales)": 3,
  "Publicidad y Mercadeo, Capacitaciones, Auditorías": 2,
  "Organizaciones sin ánimo de lucro, fundaciones, cooperativas": 3,
  "Proveedores materias primas e insumos": 1,
  "Alquiler o compra de equipos y maquinaria": 2,
  "Proveedores de Suministros u Otros": 2,
  "Proveedor de Combustibles o Explosivos": 3,
  "Casos de validación especial": 4,
};

export const SUPPLIER_RISK_MATRIX: RiskMatrix = {
  montoOptions: SUPPLIER_MONTO_OPTIONS,
  montoRisk: SUPPLIER_MONTO_RISK_MATRIX,
  sectorOptions: SUPPLIER_SECTOR_OPTIONS,
  sectorRisk: SUPPLIER_SECTOR_RISK_MATRIX,
  pepListasBaseline: 0,
};

export const computeSupplierFactorRisks = (params: RiskInput) =>
  computeFactorRisks(SUPPLIER_RISK_MATRIX, params);
export const computeSupplierRisk = (params: RiskInput) => computeRisk(SUPPLIER_RISK_MATRIX, params);
