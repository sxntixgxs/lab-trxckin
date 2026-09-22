import { describe, expect, test } from "vitest";

import { resolveAjusteErrorStatus } from "./_ajustes-lib";

describe("resolveAjusteErrorStatus", () => {
  test("maps decimal precision validation to HTTP 400", () => {
    expect(
      resolveAjusteErrorStatus(
        "El monto del ajuste debe ser mayor a cero y tener máximo dos decimales"
      )
    ).toBe(400);
    expect(
      resolveAjusteErrorStatus("montoAjuste debe ser mayor a cero y tener máximo dos decimales")
    ).toBe(400);
  });

  test("maps operation restrictions to HTTP 400", () => {
    expect(
      resolveAjusteErrorStatus(
        "Los ajustes por cuadre con otros sistemas únicamente aumentan el valor legalizable"
      )
    ).toBe(400);
    expect(
      resolveAjusteErrorStatus("Los reintegros únicamente disminuyen el valor legalizable")
    ).toBe(400);
  });
});
