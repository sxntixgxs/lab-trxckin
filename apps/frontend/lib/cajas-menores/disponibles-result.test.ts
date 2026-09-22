import { describe, expect, test } from "vitest";

import { normalizeCajasMenoresDisponibles } from "./disponibles-result";

type Caja = { _id: string; saldoDisponible: number };

const caja: Caja = { _id: "caja-1", saldoDisponible: 250_000 };

describe("normalizeCajasMenoresDisponibles", () => {
  test("normalizes the versioned response", () => {
    expect(
      normalizeCajasMenoresDisponibles<Caja>({
        cajas: [caja],
        permitirSaldoNegativo: true,
      })
    ).toEqual({
      cajas: [caja],
      permitirSaldoNegativo: true,
      contract: "v2",
    });
  });

  test("preserves cajas from the legacy array response", () => {
    expect(normalizeCajasMenoresDisponibles<Caja>([caja])).toEqual({
      cajas: [caja],
      permitirSaldoNegativo: false,
      contract: "legacy",
    });
  });

  test.each([
    null,
    undefined,
    {},
    { cajas: [] },
    { cajas: "invalid" },
  ])("marks an invalid response as incompatible: %j", (value) => {
    expect(normalizeCajasMenoresDisponibles<Caja>(value)).toEqual({
      cajas: [],
      permitirSaldoNegativo: false,
      contract: "invalid",
    });
  });
});
