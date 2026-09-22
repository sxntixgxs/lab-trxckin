import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const verifyMock = vi.hoisted(() => vi.fn());
const convexMock = vi.hoisted(() => ({ mutation: vi.fn() }));

vi.mock("resend", () => ({
  Resend: class {
    webhooks = { verify: verifyMock };
  },
}));
vi.mock("@/lib/convexServerClient", () => ({
  convexServer: convexMock,
  getConvexServerSecret: () => "test-secret",
}));

import { parseProviderTimestamp, POST, tagsToRecord } from "./route";

const SVIX_HEADERS = { "svix-id": "msg_1", "svix-timestamp": "1700000000", "svix-signature": "v1,abc" };

function post(body: unknown, headers: Record<string, string> = SVIX_HEADERS): Request {
  return new Request("http://localhost/api/webhooks/resend/onboarding", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("helpers", () => {
  it("convierte tags en arreglo o en objeto a un registro", () => {
    expect(tagsToRecord(undefined)).toBeUndefined();
    expect(tagsToRecord({ workflow: "onboarding" })).toEqual({ workflow: "onboarding" });
    expect(tagsToRecord([{ name: "workflow", value: "onboarding" }, { name: "modulo", value: "customer" }])).toEqual({ workflow: "onboarding", modulo: "customer" });
  });

  it("toma la fecha del evento y cae al reloj local si falta o es inválida", () => {
    expect(parseProviderTimestamp({ created_at: "2026-09-22T10:00:00.000Z" }, 1)).toBe(Date.parse("2026-09-22T10:00:00.000Z"));
    expect(parseProviderTimestamp({ data: { created_at: "2026-09-22T10:00:00.000Z" } }, 1)).toBe(Date.parse("2026-09-22T10:00:00.000Z"));
    expect(parseProviderTimestamp({ created_at: "no-es-fecha" }, 42)).toBe(42);
    expect(parseProviderTimestamp({}, 42)).toBe(42);
  });
});

describe("POST /api/webhooks/resend/onboarding", () => {
  beforeEach(() => {
    verifyMock.mockReset();
    convexMock.mutation.mockReset();
    vi.stubEnv("RESEND_WEBHOOK_SECRET", "whsec_test");
    vi.stubEnv("RESEND_API_KEY", "re_test");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("responde 500 cuando el webhook no está configurado", async () => {
    vi.stubEnv("RESEND_WEBHOOK_SECRET", "");
    expect((await POST(post({}))).status).toBe(500);
  });

  it("exige los encabezados Svix", async () => {
    const res = await POST(post({ type: "email.delivered" }, {}));
    expect(res.status).toBe(400);
    expect(verifyMock).not.toHaveBeenCalled();
  });

  it("rechaza firmas inválidas", async () => {
    verifyMock.mockImplementation(() => {
      throw new Error("bad signature");
    });
    const res = await POST(post({ type: "email.delivered" }));
    expect(res.status).toBe(401);
    expect(convexMock.mutation).not.toHaveBeenCalled();
  });

  it("ignora eventos de otros flujos y eventos sin email_id", async () => {
    verifyMock.mockReturnValueOnce({ type: "email.delivered", data: { email_id: "re_1", tags: { workflow: "billing" } } });
    expect(await (await POST(post({}))).json()).toMatchObject({ ok: true, ignored: true, reason: "unrelated_event" });

    verifyMock.mockReturnValueOnce({ type: "email.delivered", data: { tags: { workflow: "onboarding" } } });
    expect(await (await POST(post({}))).json()).toMatchObject({ ok: true, ignored: true, reason: "missing_email_id" });
    expect(convexMock.mutation).not.toHaveBeenCalled();
  });

  it("aplica el evento verificado en Convex con el detalle de fallo", async () => {
    verifyMock.mockReturnValue({
      type: "email.bounced",
      created_at: "2026-09-22T10:00:00.000Z",
      data: { email_id: "re_1", tags: [{ name: "workflow", value: "onboarding" }], bounce: { message: "Mailbox full" } },
    });
    convexMock.mutation.mockResolvedValue({ ok: true, estado: "FALLIDO" });
    const res = await POST(post({ type: "email.bounced" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, estado: "FALLIDO" });
    expect(verifyMock).toHaveBeenCalledWith(expect.objectContaining({ webhookSecret: "whsec_test", headers: { id: "msg_1", timestamp: "1700000000", signature: "v1,abc" } }));
    expect(convexMock.mutation).toHaveBeenCalledTimes(1);
    const [, args] = convexMock.mutation.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(args).toEqual({
      secret: "test-secret",
      resendEmailId: "re_1",
      svixId: "msg_1",
      tipoEvento: "email.bounced",
      eventoProveedorEn: Date.parse("2026-09-22T10:00:00.000Z"),
      detalleFallo: "Mailbox full",
    });
  });
});
