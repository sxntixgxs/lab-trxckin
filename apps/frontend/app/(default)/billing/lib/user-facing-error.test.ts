import { describe, expect, it } from "vitest";

import { getFacturacionErrorMessage } from "./user-facing-error";

describe("getFacturacionErrorMessage", () => {
  const fallback = "No se pudo actualizar la factura. Intenta nuevamente.";

  it("preserva un mensaje de negocio que el usuario puede corregir", () => {
    expect(
      getFacturacionErrorMessage(
        new Error("Completa el cruce de anticipos disponible antes de avanzar."),
        fallback
      )
    ).toBe("Completa el cruce de anticipos disponible antes de avanzar.");
  });

  it("extrae el mensaje de negocio de un error envuelto por Convex", () => {
    const error = new Error(
      "[CONVEX M(facturacionTareas:completarCausacion)] [Request ID: abc123] Server Error\n" +
        "Uncaught Error: Completa el cruce de anticipos disponible antes de avanzar.\n" +
        "    at validarLegalizacionAnticipoParaAvanzar (../convex/facturacionTareas.ts:1645:0)"
    );

    expect(getFacturacionErrorMessage(error, fallback)).toBe(
      "Completa el cruce de anticipos disponible antes de avanzar."
    );
  });

  it("reemplaza errores de validación técnica por el mensaje de respaldo", () => {
    const error = new Error(
      "[CONVEX Q(facturacionCrucesDocumentosInternos:obtenerResumen)] ReturnsValidationError: " +
        "Object contains extra field `pageStatus` that is not in the validator. Path: .documentos"
    );

    expect(getFacturacionErrorMessage(error, fallback)).toBe(fallback);
  });

  it("reemplaza errores de red y excepciones técnicas", () => {
    expect(getFacturacionErrorMessage(new TypeError("Failed to fetch"), fallback)).toBe(fallback);
  });

  it("lee mensajes de negocio incluidos en data", () => {
    expect(
      getFacturacionErrorMessage(
        { data: { message: "Selecciona un contador configurado para esta empresa." } },
        fallback
      )
    ).toBe("Selecciona un contador configurado para esta empresa.");
  });
});
