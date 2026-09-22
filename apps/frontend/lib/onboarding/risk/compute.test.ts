import { describe, expect, test } from "vitest";
import { computeRisk, rolCumplimientoPorRiesgo, toRiesgoNivel, toTipoEvaluacion } from "./compute";
import { computeCustomerRisk } from "./customer-matrix";
import { computeSupplierFactorRisks, computeSupplierRisk, SUPPLIER_RISK_MATRIX } from "./supplier-matrix";

describe("computeRisk (proveedores)", () => {
  test("toma el máximo de los seis factores", () => {
    expect(
      computeSupplierRisk({
        montoAnual: "Menor a 10 millones COP",
        sectorEconomico: "Proveedores materias primas e insumos",
        jurisdiccionNacional: "Chocó",
        isPep: false,
        listas: "NO",
      }),
    ).toEqual({ riesgo: "SUPERIOR", tipoEvaluacion: "INTENSIFICADA" });
  });

  test("PEP fuerza riesgo SUPERIOR", () => {
    expect(
      computeSupplierRisk({
        montoAnual: "Menor a 10 millones COP",
        sectorEconomico: "Proveedores materias primas e insumos",
        jurisdiccionNacional: "Boyacá",
        isPep: true,
        listas: "NO",
      }).riesgo,
    ).toBe("SUPERIOR");
  });

  test("sin información retorna INDEFINIDO", () => {
    expect(computeRisk(SUPPLIER_RISK_MATRIX, {})).toEqual({
      riesgo: "INDEFINIDO",
      tipoEvaluacion: "INDEFINIDO",
    });
  });

  test("los factores exponen puntaje y nivel", () => {
    const factors = computeSupplierFactorRisks({
      montoAnual: "Entre 10 y 300 millones COP",
      sectorEconomico: "Casos de validación especial",
      jurisdiccionInternacional: "Norway",
      isPep: false,
      listas: "sí",
    });
    expect(factors.montoAnual).toEqual({ score: 2, nivel: "MEDIO" });
    expect(factors.sectorEconomico).toEqual({ score: 4, nivel: "SUPERIOR" });
    expect(factors.jurisdiccionInternacional).toEqual({ score: 1, nivel: "BAJO" });
    expect(factors.jurisdiccionNacional).toEqual({ score: 0, nivel: "INDEFINIDO" });
    expect(factors.listas).toEqual({ score: 4, nivel: "SUPERIOR" });
  });

  test("mapea cada nivel a su tipo de evaluación", () => {
    const base = { jurisdiccionNacional: "Boyacá", isPep: false, listas: "NO" };
    const sector = "Proveedores materias primas e insumos";
    expect(computeSupplierRisk({ ...base, montoAnual: "Menor a 10 millones COP", sectorEconomico: sector })).toEqual({
      riesgo: "BAJO",
      tipoEvaluacion: "SOLO LISTAS",
    });
    expect(computeSupplierRisk({ ...base, montoAnual: "Entre 10 y 300 millones COP", sectorEconomico: sector })).toEqual({
      riesgo: "MEDIO",
      tipoEvaluacion: "SIMPLIFICADA",
    });
    expect(computeSupplierRisk({ ...base, montoAnual: "Superior a 300 millones COP", sectorEconomico: sector })).toEqual({
      riesgo: "ALTO",
      tipoEvaluacion: "COMPLETA",
    });
  });
});

describe("computeRisk (clientes)", () => {
  test("usa la matriz de clientes", () => {
    expect(
      computeCustomerRisk({
        montoAnual: "Ventas Comerciales Superior a 50 millones",
        sectorEconomico: "Privados: Otros",
        isPep: false,
        listas: "NO",
      }),
    ).toEqual({ riesgo: "ALTO", tipoEvaluacion: "COMPLETA" });
  });

  test("PEP y listas tienen base 1, por lo que nunca es INDEFINIDO", () => {
    expect(computeCustomerRisk({ montoAnual: "", sectorEconomico: "", isPep: false, listas: "" }).riesgo).toBe("BAJO");
  });
});

describe("helpers", () => {
  test("toTipoEvaluacion acepta niveles y evaluaciones", () => {
    expect(toTipoEvaluacion("SUPERIOR")).toBe("INTENSIFICADA");
    expect(toTipoEvaluacion("completa")).toBe("COMPLETA");
    expect(toTipoEvaluacion("MEDIO")).toBe("SIMPLIFICADA");
    expect(toTipoEvaluacion("SOLO LISTAS")).toBe("SOLO LISTAS");
    expect(toTipoEvaluacion(undefined)).toBe("INDEFINIDO");
  });

  test("toRiesgoNivel es la inversa", () => {
    expect(toRiesgoNivel("INTENSIFICADA")).toBe("SUPERIOR");
    expect(toRiesgoNivel("SOLO LISTAS")).toBe("BAJO");
    expect(toRiesgoNivel("")).toBe("INDEFINIDO");
  });

  test("rolCumplimientoPorRiesgo escala por nivel", () => {
    expect(rolCumplimientoPorRiesgo("BAJO")).toBe("CUMPLIMIENTO_LOW_RISK");
    expect(rolCumplimientoPorRiesgo("SIMPLIFICADA")).toBe("CUMPLIMIENTO_LOW_RISK");
    expect(rolCumplimientoPorRiesgo("ALTO")).toBe("CUMPLIMIENTO_MEDIUM_RISK");
    expect(rolCumplimientoPorRiesgo("INTENSIFICADA")).toBe("CUMPLIMIENTO_HIGH_RISK");
  });
});
