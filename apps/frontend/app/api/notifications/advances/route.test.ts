import { describe, expect, it } from "vitest";

import { validateAnticipoNotificationPayload } from "./route";

function validPayload() {
  return {
    destinatarios: [
      {
        usuarioId: "jefe-1",
        nombre: "Jaime Jefe",
        email: "jaime.jefe@example.com",
      },
    ],
    evento: "II_APROBACION_JEFE_DIRECTO",
    anticipoId: "anticipo-1",
    consecutivo: 12,
    empresa: 1,
    razonSocial: "Proveedor de prueba",
    nit: "900123456",
    valor: 1_000_000,
    valorLegalizable: 1_000_000,
    saldoPendiente: 1_000_000,
    maxLegalizacionDate: 1_900_000_000_000,
    faseActual: "II_APROBACION_JEFE_DIRECTO",
  };
}

describe("validateAnticipoNotificationPayload", () => {
  it("acepta un payload válido", () => {
    expect(validateAnticipoNotificationPayload(validPayload())).not.toBeNull();
  });

  it("rechaza un evento desconocido", () => {
    expect(
      validateAnticipoNotificationPayload({
        ...validPayload(),
        evento: "FASE_INVENTADA",
      })
    ).toBeNull();
  });

  it("rechaza un campo requerido ausente", () => {
    const payload: Record<string, unknown> = { ...validPayload() };
    delete payload.razonSocial;
    expect(validateAnticipoNotificationPayload(payload)).toBeNull();
  });

  it("rechaza un destinatario sin email", () => {
    expect(
      validateAnticipoNotificationPayload({
        ...validPayload(),
        destinatarios: [{ nombre: "Jaime Jefe" }],
      })
    ).toBeNull();
  });
});
