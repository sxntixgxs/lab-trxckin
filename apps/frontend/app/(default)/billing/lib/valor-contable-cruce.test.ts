import { describe, expect, test } from "vitest";

import type { Doc } from "@/convex/_generated/dataModel";

import {
  getValorContable,
  shouldPersistValorContableBeforeOpenCruce,
} from "./valor-contable";

function makeFactura(
  overrides: Partial<Doc<"facturacionFacturas">> = {}
): Doc<"facturacionFacturas"> {
  return {
    _id: "factura-1" as Doc<"facturacionFacturas">["_id"],
    _creationTime: 0,
    empresa: 1,
    numeroFactura: "FAC-1",
    documentoClase: "factura",
    tipoDocumento: "01",
    tipoDocumentoNormalizado: "01",
    subtotal: 100_000,
    impuestos: 0,
    total: 100_000,
    moneda: "COP",
    creadoEn: 0,
    actualizadoEn: 0,
    ...overrides,
  } as Doc<"facturacionFacturas">;
}

describe("shouldPersistValorContableBeforeOpenCruce", () => {
  test("persiste cuando el borrador difiere del valor guardado en fase editable", () => {
    const factura = makeFactura({ total: 2_382_901, valorContable: 300_000 });
    expect(
      shouldPersistValorContableBeforeOpenCruce({
        factura,
        fase: "causacion",
        draft: 250_000,
      })
    ).toBe(true);
    expect(getValorContable(factura)).toBe(300_000);
  });

  test("no persiste cuando el borrador coincide", () => {
    const factura = makeFactura({ total: 100_000, valorContable: 80_000 });
    expect(
      shouldPersistValorContableBeforeOpenCruce({
        factura,
        fase: "causacion",
        draft: 80_000,
      })
    ).toBe(false);
  });
});
