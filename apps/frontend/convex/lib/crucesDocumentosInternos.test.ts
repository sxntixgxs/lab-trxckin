import { describe, expect, test } from "vitest";

import {
  assertDocumentosInternosYCruces,
  buildResumenContableCruce,
  computeBaseCruceAnticipos,
  computeValorAPagarConCruces,
  normalizeNumeroDocumentoInterno,
  validateNumeroDocumentoInterno,
  validateValorAplicadoDocumentoInterno,
} from "./crucesDocumentosInternos";

describe("crucesDocumentosInternos domain", () => {
  test("documentos 30 + 20 sobre valor contable 100 producen base de anticipos 50", () => {
    expect(
      computeBaseCruceAnticipos({
        valorContable: 100,
        valorDocumentosInternos: 50,
        pagosAplicados: 0,
      })
    ).toBe(50);
  });

  test("documentos 50 + anticipos 40 producen valor a pagar 10", () => {
    expect(
      computeValorAPagarConCruces({
        valorContable: 100,
        valorDocumentosInternos: 50,
        valorAnticiposAplicados: 40,
        pagosAplicados: 0,
      })
    ).toBe(10);
  });

  test("documentos 50 + anticipos 40 + pago 10 producen valor a pagar cero", () => {
    expect(
      computeValorAPagarConCruces({
        valorContable: 100,
        valorDocumentosInternos: 50,
        valorAnticiposAplicados: 40,
        pagosAplicados: 10,
      })
    ).toBe(0);
  });

  test("redondeo correcto de 0.1 + 0.2", () => {
    const resumen = buildResumenContableCruce({
      valorContable: 0.3,
      valorDocumentosInternos: 0.1,
      pagosAplicados: 0.2,
      valorAnticiposAplicados: 0,
      moneda: "COP",
    });
    expect(resumen.valorAPagar).toBe(0);
  });

  test("rechaza cero, negativos, NaN y más de dos decimales", () => {
    expect(() => validateValorAplicadoDocumentoInterno(0)).toThrow(/mayor que cero/);
    expect(() => validateValorAplicadoDocumentoInterno(-1)).toThrow(/mayor que cero/);
    expect(() => validateValorAplicadoDocumentoInterno(Number.NaN)).toThrow(/finito/);
    expect(() => validateValorAplicadoDocumentoInterno(1.234)).toThrow(/dos decimales/);
  });

  test("rechaza sumas superiores a la capacidad", () => {
    expect(() =>
      assertDocumentosInternosYCruces({
        valorContable: 100,
        valorDocumentosInternos: 70,
        pagosAplicados: 40,
      })
    ).toThrow(/superar el valor contable/);
  });

  test("normaliza números para detectar duplicados locales", () => {
    expect(normalizeNumeroDocumentoInterno(" FE-123 ")).toBe("fe-123");
    expect(normalizeNumeroDocumentoInterno("FÉ 123")).toBe("fe 123");
  });

  test("valida número obligatorio y recortado", () => {
    expect(validateNumeroDocumentoInterno("  ABC-1  ")).toEqual({
      numeroDocumento: "ABC-1",
      numeroDocumentoNormalizado: "abc-1",
    });
    expect(() => validateNumeroDocumentoInterno("   ")).toThrow(/obligatorio/);
  });
});
