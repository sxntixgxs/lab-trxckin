import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/convexServerClient", () => ({
  convexServer: { query: vi.fn(), mutation: vi.fn() },
  getConvexServerSecret: () => "test-secret",
}));

import { buildEmailProps, buildSubject, validateOnboardingNotificationPayload } from "./email-service";

function untracked(overrides: Record<string, unknown> = {}) {
  return {
    kind: "untracked",
    tipo: "DOC_RECHAZADO",
    inscripcionId: "ins_1",
    empresa: 1,
    tercero: { razonSocial: "Cliente Demo", tipoDocumento: "NIT", numeroDocumento: "900123456" },
    destinatarios: [{ nombre: "Ana", email: "Ana@demo.test" }],
    ...overrides,
  };
}

describe("validateOnboardingNotificationPayload", () => {
  it("acepta un envío rastreado con correoId y token", () => {
    const r = validateOnboardingNotificationPayload("supplier", { kind: "tracked", correoId: "c1", token: "t1" }, { allowAttachments: false });
    expect(r).toEqual({ ok: true, payload: { kind: "tracked", correoId: "c1", token: "t1" } });
  });

  it("rechaza un envío rastreado sin token", () => {
    const r = validateOnboardingNotificationPayload("supplier", { kind: "tracked", correoId: "c1" }, { allowAttachments: false });
    expect(r.ok).toBe(false);
  });

  it("rechaza tipos que no pertenecen al módulo", () => {
    expect(validateOnboardingNotificationPayload("customer", untracked({ tipo: "FASE_V_COMPLETADA" }), { allowAttachments: false }).ok).toBe(false);
    expect(validateOnboardingNotificationPayload("supplier", untracked({ tipo: "FASE_V_COMPLETADA" }), { allowAttachments: false }).ok).toBe(true);
    expect(validateOnboardingNotificationPayload("customer", untracked({ tipo: "APROBACION_CUMPLIMIENTO_ASIGNADA" }), { allowAttachments: false }).ok).toBe(true);
  });

  it("normaliza y deduplica destinatarios, descartando correos inválidos", () => {
    const r = validateOnboardingNotificationPayload(
      "customer",
      untracked({
        destinatarios: [
          { nombre: "Ana", email: "Ana@demo.test" },
          { nombre: "Ana otra vez", email: "ana@demo.test" },
          { nombre: "Sin correo" },
          { email: "sin-arroba" },
          { email: "solo@correo.test" },
        ],
      }),
      { allowAttachments: false },
    );
    expect(r.ok).toBe(true);
    if (!r.ok || r.payload.kind !== "untracked") throw new Error("payload inesperado");
    expect(r.payload.destinatarios).toEqual([
      { nombre: "Ana", email: "ana@demo.test" },
      { nombre: "solo@correo.test", email: "solo@correo.test" },
    ]);
  });

  it("rechaza tercero incompleto y empresa no entera", () => {
    expect(validateOnboardingNotificationPayload("customer", untracked({ tercero: { razonSocial: "X" } }), { allowAttachments: false }).ok).toBe(false);
    expect(validateOnboardingNotificationPayload("customer", untracked({ empresa: "1" }), { allowAttachments: false }).ok).toBe(false);
  });

  it("solo acepta adjuntos PDF con sesión y hasta 4 MB", () => {
    const pdf = { filename: "formulario.pdf", contentBase64: Buffer.from("%PDF-1.4").toString("base64") };
    const sinSesion = validateOnboardingNotificationPayload("customer", untracked({ attachments: [pdf] }), { allowAttachments: false });
    expect(sinSesion.ok).toBe(false);

    const conSesion = validateOnboardingNotificationPayload("customer", untracked({ attachments: [pdf] }), { allowAttachments: true });
    expect(conSesion.ok).toBe(true);
    if (!conSesion.ok || conSesion.payload.kind !== "untracked") throw new Error("payload inesperado");
    expect(conSesion.payload.attachments?.[0].filename).toBe("formulario.pdf");
    expect(conSesion.payload.attachments?.[0].content.toString()).toBe("%PDF-1.4");

    const noPdf = validateOnboardingNotificationPayload("customer", untracked({ attachments: [{ filename: "virus.exe", contentBase64: "AAAA" }] }), { allowAttachments: true });
    expect(noPdf.ok).toBe(false);

    const grande = { filename: "grande.pdf", contentBase64: Buffer.alloc(4 * 1024 * 1024 + 1).toString("base64") };
    expect(validateOnboardingNotificationPayload("customer", untracked({ attachments: [grande] }), { allowAttachments: true }).ok).toBe(false);
  });
});

describe("buildSubject / buildEmailProps", () => {
  it("prefija el asunto con la empresa, el módulo y el tipo de trámite", () => {
    const subject = buildSubject("customer", "PENDIENTE_FIRMA", 1, "ACTUALIZACIÓN");
    expect(subject).toContain("Inscripción clientes");
    expect(subject).toContain("[Actualización]");
  });

  it("construye el enlace público para el tercero y el interno para el equipo", () => {
    const base = { modulo: "customer" as const, tercero: { razonSocial: "Cliente", tipoDocumento: "NIT", numeroDocumento: "1" }, empresa: 1, inscripcionId: "ins_1" };
    const firma = buildEmailProps({ ...base, tipo: "PENDIENTE_FIRMA", destinatarioNombre: "RL", destinatarioTipo: "tercero", token: "tok" });
    expect(firma.ctaUrl).toContain("/onboarding/customer/sign?");
    expect(firma.ctaUrl).toContain("t=tok");

    const formulario = buildEmailProps({ ...base, tipo: "FASE_I_COMPLETADA", destinatarioNombre: "RL", destinatarioTipo: "tercero", token: "tok" });
    expect(formulario.ctaUrl).toContain("/onboarding/customer?");

    const interno = buildEmailProps({ ...base, tipo: "APROBACION_CUMPLIMIENTO_ASIGNADA", destinatarioNombre: "Cumplimiento", destinatarioTipo: "interno" });
    expect(interno.ctaUrl).toMatch(/\/customers\/onboarding$/);

    const terceroSinToken = buildEmailProps({ ...base, tipo: "DOC_RECHAZADO", destinatarioNombre: "RL", destinatarioTipo: "tercero" });
    expect(terceroSinToken.ctaUrl).toBeUndefined();
  });
});
