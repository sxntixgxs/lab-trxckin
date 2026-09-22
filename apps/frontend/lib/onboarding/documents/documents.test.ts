import { describe, expect, test } from "vitest";
import { CUSTOMER_DOC_SETS, getCustomerDocKeys } from "./customers";
import { getSupplierDocKeys, SUPPLIER_DOC_SETS, supplierDocRevisorRol } from "./suppliers";

describe("documentos requeridos — proveedores", () => {
  test("todas las variantes incluyen 'formulario' y se excluye por defecto", () => {
    for (const keys of Object.values(SUPPLIER_DOC_SETS)) {
      expect(keys).toContain("formulario");
    }
    expect(getSupplierDocKeys("SOLO LISTAS", "PERSONA_NATURAL", false)).not.toContain("formulario");
    expect(getSupplierDocKeys("SOLO LISTAS", "PERSONA_NATURAL", false, { includeFormulario: true })).toContain("formulario");
  });

  test("selecciona la variante por evaluación, persona y PEP", () => {
    expect(getSupplierDocKeys("INTENSIFICADA", "PERSONA_JURIDICA", true)).toEqual(
      SUPPLIER_DOC_SETS.intensificadaPEPJuridica.filter((k) => k !== "formulario"),
    );
    expect(getSupplierDocKeys("SUPERIOR", "PERSONA_NATURAL", false)).toEqual(
      SUPPLIER_DOC_SETS.intensificadaNatural.filter((k) => k !== "formulario"),
    );
    expect(getSupplierDocKeys("ALTO", "PERSONA_JURIDICA", false)).toContain("estadosFinancieros2UltimosAnios");
    expect(getSupplierDocKeys("MEDIO", "PERSONA_JURIDICA", false)).toContain("camaraComercioMax60Dias");
    expect(getSupplierDocKeys("INDEFINIDO", "PERSONA_JURIDICA", false)).toEqual([]);
  });

  test("clasifica documentos de Compras vs Cumplimiento", () => {
    expect(supplierDocRevisorRol("portfolio")).toBe("COMPRAS");
    expect(supplierDocRevisorRol("rutUltimoAnio")).toBe("CUMPLIMIENTO_LOW_RISK");
  });
});

describe("documentos requeridos — clientes", () => {
  test("acepta niveles de riesgo y tipos de evaluación", () => {
    expect(getCustomerDocKeys("BAJO", "PERSONA_NATURAL", false)).toEqual(
      CUSTOMER_DOC_SETS.soloListasNatural.filter((k) => k !== "formulario"),
    );
    expect(getCustomerDocKeys("COMPLETA", "PERSONA_JURIDICA", false)).toEqual(
      CUSTOMER_DOC_SETS.completaJuridica.filter((k) => k !== "formulario"),
    );
    expect(getCustomerDocKeys("SUPERIOR", "PERSONA_JURIDICA", true)).toContain("referenciasComercialesMin2");
    expect(getCustomerDocKeys("INDEFINIDO", "PERSONA_JURIDICA", false)).toEqual([]);
  });
});
