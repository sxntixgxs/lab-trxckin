import { describe, expect, test } from "vitest";

import {
  buildSnapshotMonetario,
  getValorBaseFactura,
  getValorNotaCredito,
  normalizeNumeroFacturaBusqueda,
  NOTA_CREDITO_RELACION_VALUE_TOLERANCE,
} from "./notaCreditoRelacion";

describe("notaCreditoRelacion monetary helpers", () => {
  test("invoice base prefers valorContable and falls back to XML total", () => {
    expect(
      getValorBaseFactura({ valorContable: 90_000, total: 100_000 })
    ).toBe(90_000);
    expect(getValorBaseFactura({ total: 100_000 })).toBe(100_000);
  });

  test("NC value always uses XML total", () => {
    expect(
      getValorNotaCredito({
        total: 12_500,
        valorContable: 1,
      } as never)
    ).toBe(12_500);
  });

  test("snapshot net and XML fallback flag", () => {
    const withContable = buildSnapshotMonetario({
      factura: { valorContable: 100_000, total: 120_000 } as never,
      notasCredito: [{ total: 40_000 } as never, { total: 10_000 } as never],
    });
    expect(withContable).toEqual({
      valorBase: 100_000,
      totalNotasCredito: 50_000,
      neto: 50_000,
      usaValorXmlComoBase: false,
    });

    const xmlFallback = buildSnapshotMonetario({
      factura: { total: 80_000 } as never,
      notasCredito: [{ total: 85_800 } as never],
    });
    expect(xmlFallback.neto).toBe(-5_800);
    expect(xmlFallback.usaValorXmlComoBase).toBe(true);
    expect(xmlFallback.neto < -NOTA_CREDITO_RELACION_VALUE_TOLERANCE).toBe(true);
  });

  test("search normalization matches invoice number style", () => {
    expect(normalizeNumeroFacturaBusqueda(" fe-001 ")).toBe("FE001");
    expect(normalizeNumeroFacturaBusqueda("Ñº-12")).toBe("N12");
  });
});
