import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import { validateDigestPayload, validateDigestSignature } from "./route";

describe("SLA digest route security", () => {
  it("rejects unsigned, stale, and invalidly signed requests", () => {
    const body = JSON.stringify({ ok: true });
    const nowMs = 1_700_000_000_000;
    expect(
      validateDigestSignature({ body, timestamp: null, signature: null, secret: "secret", nowMs })
    ).toBe(false);
    expect(
      validateDigestSignature({
        body,
        timestamp: String(nowMs - 300_001),
        signature: "00",
        secret: "secret",
        nowMs,
      })
    ).toBe(false);
    expect(
      validateDigestSignature({
        body,
        timestamp: String(nowMs),
        signature: "00",
        secret: "secret",
        nowMs,
      })
    ).toBe(false);
  });

  it("accepts a fresh HMAC signature only for the exact raw body", () => {
    const body = '{"factura":"F-1"}';
    const timestamp = "1700000000000";
    const secret = "digest-secret";
    const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
    expect(
      validateDigestSignature({ body, timestamp, signature, secret, nowMs: Number(timestamp) })
    ).toBe(true);
    expect(
      validateDigestSignature({
        body: `${body} `,
        timestamp,
        signature,
        secret,
        nowMs: Number(timestamp),
      })
    ).toBe(false);
  });

  it("accepts only valid recipient and dashboard payloads", () => {
    const payload = {
      destinatario: { email: "revisor@example.com" },
      empresa: 1,
      fechaLocal: "2026-07-14",
      items: [
        {
          facturaId: "invoice-1",
          numeroFactura: "F-1",
          proveedorNombre: "Proveedor",
          fase: "revision_lider",
          phaseAgeMs: 10,
          assignmentAgeMs: 5,
          slaOverageMs: 1,
          slaEstado: "breached",
          dashboardUrl: "https://app.example.com/facturacion?factura=invoice-1",
        },
      ],
    };
    expect(validateDigestPayload(payload)).not.toBeNull();
    expect(validateDigestPayload({ ...payload, destinatario: { email: "invalido" } })).toBeNull();
    expect(
      validateDigestPayload({
        ...payload,
        items: [{ ...payload.items[0], dashboardUrl: "javascript:alert(1)" }],
      })
    ).toBeNull();
  });
});
