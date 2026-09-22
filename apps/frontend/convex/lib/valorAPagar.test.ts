import { describe, expect, test } from "vitest";

import {
  assertObligacionCubrePagos,
  computeValorAPagar,
} from "./valorAPagar";

describe("valorAPagar validations", () => {
  test("rechaza correccion por debajo de pagos acumulados", () => {
    expect(() =>
      assertObligacionCubrePagos({
        valorContable: 5,
        crucesActivos: 2,
        pagosAplicados: 4,
      })
    ).toThrow(/pagos acumulados/);
  });

  test("acepta saldo cero exacto", () => {
    expect(
      computeValorAPagar({
        valorContable: 10,
        crucesActivos: 7,
        pagosAplicados: 3,
      })
    ).toBe(0);
  });
});
