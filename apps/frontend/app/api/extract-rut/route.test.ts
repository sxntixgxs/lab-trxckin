import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { requireApiSession, userHasAccessToAny } from "@/lib/api-route-auth";

import { POST } from "./route";

vi.mock("@/lib/api-route-auth", () => ({
  requireApiSession: vi.fn(),
  userHasAccessToAny: vi.fn(),
}));

function requestConArchivo(file: Blob | null, extra?: Record<string, string>) {
  const form = new FormData();
  if (file) form.append("file", file, "rut.pdf");
  for (const [key, value] of Object.entries(extra ?? {})) form.append(key, value);
  return new NextRequest("http://localhost/api/extract-rut", { method: "POST", body: form });
}

describe("POST /api/extract-rut", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.mocked(requireApiSession).mockResolvedValue({
      ok: true,
      session: { user: { id: "user-1" } },
      user: { id: "user-1", permisos: ["suppliers/onboarding"] },
    } as never);
    vi.mocked(userHasAccessToAny).mockReturnValue(true);
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ nit: "900123456", razonSocial: "ACME" }) } }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("requires onboarding access", async () => {
    vi.mocked(userHasAccessToAny).mockReturnValue(false);
    const response = await POST(requestConArchivo(new Blob(["%PDF"], { type: "application/pdf" })));
    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("no longer resolves storage ids: without an uploaded file it answers 400", async () => {
    const request = new NextRequest("http://localhost/api/extract-rut", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storageId: "kg2abc" }),
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();

    const sinArchivo = await POST(requestConArchivo(null, { storageId: "kg2abc" }));
    expect(sinArchivo.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects files that are not a PDF or an image", async () => {
    const response = await POST(requestConArchivo(new Blob(["<html>"], { type: "text/html" })));
    expect(response.status).toBe(415);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the uploaded file to the extraction model", async () => {
    const response = await POST(
      requestConArchivo(new Blob(["%PDF-1.4 rut"], { type: "application/pdf" })),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ nit: "900123456", razonSocial: "ACME" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    const body = JSON.parse(String(init.body)) as {
      messages: Array<{ content: Array<{ type: string; image_url?: { url: string } }> }>;
    };
    const imagen = body.messages[0].content.find((part) => part.type === "image_url");
    expect(imagen?.image_url?.url).toBe(
      `data:application/pdf;base64,${Buffer.from("%PDF-1.4 rut").toString("base64")}`,
    );
  });
});
