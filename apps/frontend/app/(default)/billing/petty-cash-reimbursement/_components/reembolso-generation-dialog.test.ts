import { describe, expect, test } from "vitest";

import type { Id } from "@/convex/_generated/dataModel";

import {
  buildDirtyCentroCostoOverride,
  type CentroCostoDraft,
} from "./reembolso-generation-dialog";

const movimientoId =
  "movimiento-1" as Id<"facturacionCajaMenorMovimientos">;

const baseline: CentroCostoDraft = {
  centroCostoId: "1:1:E070325",
  centroCostoCodigo: "E070325",
  centroCostoNombre: "VOLQUETA",
  centrosCostoDistribucion: [
    {
      centroCostoId: "1:1:E070325",
      centroCostoCodigo: "E070325",
      centroCostoNombre: "VOLQUETA",
      valor: 1_000,
    },
  ],
};

describe("buildDirtyCentroCostoOverride", () => {
  test("omits an unchanged stored movement", () => {
    expect(
      buildDirtyCentroCostoOverride(movimientoId, baseline, baseline),
    ).toBeNull();
  });

  test("keeps the stored identity when only the amount changes", () => {
    const edited: CentroCostoDraft = {
      ...baseline,
      centrosCostoDistribucion: [
        { ...baseline.centrosCostoDistribucion[0]!, valor: 1_500 },
      ],
    };

    expect(
      buildDirtyCentroCostoOverride(movimientoId, edited, baseline),
    ).toMatchObject({
      movimientoId,
      centroCostoId: "1:1:E070325",
      centroCostoCodigo: "E070325",
      centrosCostoDistribucion: [
        { centroCostoId: "1:1:E070325", valor: 1_500 },
      ],
    });
  });

  test("uses the newly selected identity when the cost center changes", () => {
    const edited: CentroCostoDraft = {
      centroCostoId: "1:7:E070325",
      centroCostoCodigo: "E070325",
      centroCostoNombre: "VOLQUETA PACIFICO",
      centrosCostoDistribucion: [
        {
          centroCostoId: "1:7:E070325",
          centroCostoCodigo: "E070325",
          centroCostoNombre: "VOLQUETA PACIFICO",
          valor: 1_000,
        },
      ],
    };

    expect(
      buildDirtyCentroCostoOverride(movimientoId, edited, baseline),
    ).toMatchObject({
      movimientoId,
      centroCostoId: "1:7:E070325",
      centroCostoNombre: "VOLQUETA PACIFICO",
      centrosCostoDistribucion: [
        { centroCostoId: "1:7:E070325" },
      ],
    });
  });
});
