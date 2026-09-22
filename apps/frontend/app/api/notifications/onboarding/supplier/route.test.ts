import { NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => ({
  requireSessionOrInternalSecret: vi.fn(),
  userHasAccess: vi.fn(),
}));
const serviceMock = vi.hoisted(() => ({
  deliverTrackedEmail: vi.fn(),
  sendUntrackedEmails: vi.fn(),
}));

vi.mock("@/lib/api-route-auth", () => authMock);
vi.mock("@/lib/convexServerClient", () => ({
  convexServer: { query: vi.fn(), mutation: vi.fn() },
  getConvexServerSecret: () => "test-secret",
}));
vi.mock("@/lib/onboarding/email-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/onboarding/email-service")>();
  return { ...actual, ...serviceMock };
});
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: vi.fn() };
  },
}));

type RouteModule = typeof import("./route");

async function loadRoute(withResend: boolean): Promise<RouteModule> {
  vi.resetModules();
  if (withResend) vi.stubEnv("RESEND_API_KEY", "re_test");
  else vi.stubEnv("RESEND_API_KEY", "");
  return await import("./route");
}

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/notifications/onboarding/supplier", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function untracked(overrides: Record<string, unknown> = {}) {
  return {
    kind: "untracked",
    tipo: "INSCRIPCION_COMPLETADA",
    inscripcionId: "ins_1",
    empresa: 1,
    tercero: { razonSocial: "Proveedor", tipoDocumento: "NIT", numeroDocumento: "900123456" },
    destinatarios: [{ nombre: "Ana", email: "ana@demo.test" }],
    ...overrides,
  };
}

const internal = { ok: true as const, session: null, user: null };
const session = { ok: true as const, session: {}, user: { id: "u1" } };

describe("POST /api/notifications/onboarding/supplier", () => {
  beforeEach(() => {
    authMock.requireSessionOrInternalSecret.mockReset();
    authMock.userHasAccess.mockReset();
    serviceMock.deliverTrackedEmail.mockReset();
    serviceMock.sendUntrackedEmails.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("devuelve la respuesta de autenticación cuando no hay sesión ni clave interna", async () => {
    authMock.requireSessionOrInternalSecret.mockResolvedValue({ ok: false, response: NextResponse.json({ error: "No autorizado" }, { status: 401 }) });
    const { POST } = await loadRoute(true);
    const res = await POST(post(untracked()));
    expect(res.status).toBe(401);
  });

  it("rechaza sesiones sin permiso del módulo", async () => {
    authMock.requireSessionOrInternalSecret.mockResolvedValue(session);
    authMock.userHasAccess.mockReturnValue(false);
    const { POST } = await loadRoute(true);
    const res = await POST(post(untracked()));
    expect(res.status).toBe(403);
    expect(authMock.userHasAccess).toHaveBeenCalledWith(session.user, "suppliers/onboarding");
  });

  it("rechaza JSON inválido y payloads inválidos", async () => {
    authMock.requireSessionOrInternalSecret.mockResolvedValue(internal);
    const { POST } = await loadRoute(true);
    expect((await POST(post("{not json"))).status).toBe(400);
    const res = await POST(post(untracked({ tipo: "APROBACION_CUMPLIMIENTO_ASIGNADA" })));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, sent: false });
  });

  it("solo el servidor (clave interna) puede disparar envíos rastreados", async () => {
    const { POST } = await loadRoute(true);
    authMock.requireSessionOrInternalSecret.mockResolvedValue(session);
    authMock.userHasAccess.mockReturnValue(true);
    expect((await POST(post({ kind: "tracked", correoId: "c1", token: "t1" }))).status).toBe(403);
    expect(serviceMock.deliverTrackedEmail).not.toHaveBeenCalled();

    authMock.requireSessionOrInternalSecret.mockResolvedValue(internal);
    serviceMock.deliverTrackedEmail.mockResolvedValue({ ok: true, sent: true, correoId: "c1", estado: "ENVIADO", resendEmailId: "re_1" });
    const res = await POST(post({ kind: "tracked", correoId: "c1", token: "t1" }));
    expect(res.status).toBe(200);
    expect(serviceMock.deliverTrackedEmail).toHaveBeenCalledWith(expect.objectContaining({ modulo: "supplier", correoId: "c1", token: "t1" }));
    expect(await res.json()).toMatchObject({ ok: true, sent: true, resendEmailId: "re_1" });
  });

  it("responde 502 cuando el envío rastreado falla en Resend", async () => {
    authMock.requireSessionOrInternalSecret.mockResolvedValue(internal);
    serviceMock.deliverTrackedEmail.mockResolvedValue({ ok: false, sent: false, correoId: "c1", error: "boom" });
    const { POST } = await loadRoute(true);
    const res = await POST(post({ kind: "tracked", correoId: "c1", token: "t1" }));
    expect(res.status).toBe(502);
  });

  it("los adjuntos solo se aceptan con sesión de usuario", async () => {
    authMock.requireSessionOrInternalSecret.mockResolvedValue(internal);
    const { POST } = await loadRoute(true);
    const res = await POST(post(untracked({ attachments: [{ filename: "f.pdf", contentBase64: "JVBERi0=" }] })));
    expect(res.status).toBe(400);
    expect(serviceMock.sendUntrackedEmails).not.toHaveBeenCalled();
  });

  it("omite el envío no rastreado sin RESEND_API_KEY", async () => {
    authMock.requireSessionOrInternalSecret.mockResolvedValue(internal);
    const { POST } = await loadRoute(false);
    const res = await POST(post(untracked()));
    expect(await res.json()).toMatchObject({ ok: true, sent: false, skipped: true, reason: "resend_not_configured" });
    expect(serviceMock.sendUntrackedEmails).not.toHaveBeenCalled();
  });

  it("envía correos no rastreados con adjuntos desde una sesión autorizada", async () => {
    authMock.requireSessionOrInternalSecret.mockResolvedValue(session);
    authMock.userHasAccess.mockReturnValue(true);
    serviceMock.sendUntrackedEmails.mockResolvedValue({ errors: [] });
    const { POST } = await loadRoute(true);
    const res = await POST(post(untracked({ attachments: [{ filename: "formulario.pdf", contentBase64: "JVBERi0=" }], datos: { destinatarioTipo: "tercero" } })));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, sent: true });
    const call = serviceMock.sendUntrackedEmails.mock.calls[0][0] as { attachments?: Array<{ filename: string }>; destinatarios: unknown[]; datos?: unknown };
    expect(call.attachments?.[0].filename).toBe("formulario.pdf");
    expect(call.destinatarios).toHaveLength(1);
    expect(call.datos).toEqual({ destinatarioTipo: "tercero" });
  });

  it("responde 207 cuando algún destinatario falla", async () => {
    authMock.requireSessionOrInternalSecret.mockResolvedValue(internal);
    serviceMock.sendUntrackedEmails.mockResolvedValue({ errors: ["ana@demo.test"] });
    const { POST } = await loadRoute(true);
    const res = await POST(post(untracked()));
    expect(res.status).toBe(207);
    expect(await res.json()).toEqual({ ok: false, sent: false, errors: ["ana@demo.test"] });
  });

  it("no envía nada cuando no quedan destinatarios válidos", async () => {
    authMock.requireSessionOrInternalSecret.mockResolvedValue(internal);
    const { POST } = await loadRoute(true);
    const res = await POST(post(untracked({ destinatarios: [{ nombre: "Sin correo" }] })));
    expect(await res.json()).toEqual({ ok: true, sent: false, reason: "no_destinatarios" });
  });
});
