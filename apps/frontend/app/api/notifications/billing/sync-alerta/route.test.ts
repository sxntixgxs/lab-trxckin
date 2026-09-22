import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import { validateAlertaPayload, validateAlertaSignature } from "./route";

describe("sync-alerta route security", () => {
  it("rejects unsigned, stale, and invalidly signed requests", () => {
    const body = JSON.stringify({ ok: true });
    const nowMs = 1_700_000_000_000;
    expect(
      validateAlertaSignature({ body, timestamp: null, signature: null, secret: "secret", nowMs })
    ).toBe(false);
    expect(
      validateAlertaSignature({
        body,
        timestamp: String(nowMs - 300_001),
        signature: "00",
        secret: "secret",
        nowMs,
      })
    ).toBe(false);
    expect(
      validateAlertaSignature({
        body,
        timestamp: String(nowMs),
        signature: "00",
        secret: "secret",
        nowMs,
      })
    ).toBe(false);
  });

  it("accepts a fresh HMAC signature only for the exact raw body", () => {
    const body = '{"cuenta":"recepcion"}';
    const timestamp = "1700000000000";
    const secret = "alerta-secret";
    const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
    expect(
      validateAlertaSignature({ body, timestamp, signature, secret, nowMs: Number(timestamp) })
    ).toBe(true);
    expect(
      validateAlertaSignature({
        body: `${body} `,
        timestamp,
        signature,
        secret,
        nowMs: Number(timestamp),
      })
    ).toBe(false);
  });

  it("accepts only valid recipients and dashboard payloads", () => {
    const payload = {
      cuentaEmail: "recepcion.facturas@example.com",
      empresa: 1,
      destinatarios: ["supervision@example.com"],
      dashboardUrl: "https://app.example.com/facturacion/correos",
      pendientes: [
        {
          subject: "Factura FE-1",
          from: "proveedor@ejemplo.co",
          receivedDateTime: "2026-07-17T10:00:00Z",
          intentos: 2,
          ultimoError: "Graph API 503",
        },
      ],
      totalPendientes: 1,
    };
    expect(validateAlertaPayload(payload)).not.toBeNull();
    expect(validateAlertaPayload({ ...payload, destinatarios: ["invalido"] })).toBeNull();
    expect(validateAlertaPayload({ ...payload, destinatarios: [] })).toBeNull();
    expect(
      validateAlertaPayload({ ...payload, dashboardUrl: "javascript:alert(1)" })
    ).toBeNull();
    expect(validateAlertaPayload({ ...payload, pendientes: [] })).toBeNull();
  });
});
