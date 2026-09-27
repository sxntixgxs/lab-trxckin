import { describe, expect, it, vi } from "vitest";

import { checkDv, extractRut, inputForModel, OPENROUTER_URL, RutExtractionError } from "./extract";
import { FALLBACK_MODEL, PRIMARY_MODEL } from "./models";
import { renderPdfFirstPage } from "./pdf-image";

vi.mock("./pdf-image", () => ({ renderPdfFirstPage: vi.fn(async () => new Uint8Array([0x89, 0x50, 0x4e, 0x47])) }));

const CAMPOS = {
  nit: "900123456",
  dv: "8",
  tipo_contribuyente: "juridica",
  razon_social: "DROMINC S.A.S.",
  tipo_documento: null,
  numero_identificacion: null,
  primer_apellido: null,
  segundo_apellido: null,
  primer_nombre: null,
  actividad_principal_codigo: "6201",
  actividad_secundaria_codigo: null,
  departamento: "ANTIOQUIA",
  municipio: "MEDELLÍN",
  direccion: "CL 10 # 43-20",
  nombre_representante_legal: "ANA MARÍA RESTREPO",
};

function respuesta(content: string, usage: Record<string, unknown> = { prompt_tokens: 1000, completion_tokens: 200 }, status = 200) {
  return new Response(JSON.stringify({ model: PRIMARY_MODEL, choices: [{ message: { content } }], usage }), { status });
}

function extraer(fetchImpl: typeof fetch, timeoutMs?: number) {
  return extractRut({
    bytes: new TextEncoder().encode("%PDF-1.4"),
    mediaType: "application/pdf",
    apiKey: "test-key",
    model: PRIMARY_MODEL,
    fetchImpl,
    timeoutMs,
  });
}

async function errorDe(promesa: Promise<unknown>): Promise<RutExtractionError> {
  const err = await promesa.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(RutExtractionError);
  return err as RutExtractionError;
}

describe("inputForModel", () => {
  const pdf = new TextEncoder().encode("%PDF-1.4");

  it("sends PDFs as-is to models that read them", async () => {
    await expect(inputForModel(PRIMARY_MODEL, pdf, "application/pdf")).resolves.toEqual({ bytes: pdf, mediaType: "application/pdf" });
    expect(renderPdfFirstPage).not.toHaveBeenCalled();
  });

  it("renders page 1 to PNG for image-only models, and leaves images alone", async () => {
    await expect(inputForModel(FALLBACK_MODEL, pdf, "application/pdf")).resolves.toMatchObject({ mediaType: "image/png" });
    expect(renderPdfFirstPage).toHaveBeenCalledWith(pdf);
    const jpeg = new Uint8Array([0xff, 0xd8]);
    await expect(inputForModel(FALLBACK_MODEL, jpeg, "image/jpeg")).resolves.toEqual({ bytes: jpeg, mediaType: "image/jpeg" });
  });
});

describe("extractRut", () => {
  it("returns validated fields, provider cost, model and latency", async () => {
    const fetchImpl = vi.fn(async () => respuesta(JSON.stringify(CAMPOS), { prompt_tokens: 1000, completion_tokens: 200, cost: 0.00123 }));
    const result = await extraer(fetchImpl as unknown as typeof fetch);

    expect(result.fields).toMatchObject(CAMPOS);
    expect(result.usage).toEqual({ promptTokens: 1000, completionTokens: 200, costUsd: 0.00123, costSource: "provider" });
    expect(result.model).toBe(PRIMARY_MODEL);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(OPENROUTER_URL);
    const body = JSON.parse(String(init.body)) as { model: string; usage: unknown };
    expect(body.model).toBe(PRIMARY_MODEL);
    expect(body.usage).toEqual({ include: true });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("falls back to the price table when the provider reports no cost", async () => {
    const result = await extraer((async () => respuesta(JSON.stringify(CAMPOS))) as unknown as typeof fetch);
    // 1000 × 0.25/1M + 200 × 1.5/1M
    expect(result.usage.costSource).toBe("price_table");
    expect(result.usage.costUsd).toBeCloseTo(0.00055, 10);
  });

  it("strips code fences and normalizes sloppy values", async () => {
    const content = "```json\n" + JSON.stringify({ ...CAMPOS, nit: 900123456, tipo_contribuyente: "Persona Jurídica", segundo_apellido: "  " }) + "\n```";
    const result = await extraer((async () => respuesta(content)) as unknown as typeof fetch);
    expect(result.fields.nit).toBe("900123456");
    expect(result.fields.tipo_contribuyente).toBe("juridica");
    expect(result.fields.segundo_apellido).toBeNull();
  });

  it("fails with kind=schema when a field has the wrong shape", async () => {
    const content = JSON.stringify({ ...CAMPOS, tipo_contribuyente: "empresa", nit: { valor: 1 } });
    const err = await errorDe(extraer((async () => respuesta(content)) as unknown as typeof fetch));
    expect(err.kind).toBe("schema");
    expect(err.details.body).toBeDefined();
  });

  it("fails with kind=parse when the content is not JSON", async () => {
    const err = await errorDe(extraer((async () => respuesta("No puedo leer el documento.")) as unknown as typeof fetch));
    expect(err.kind).toBe("parse");
  });

  it("fails with kind=http on a non-2xx answer", async () => {
    const fetchImpl = async () => new Response(JSON.stringify({ error: { message: "No endpoints found" } }), { status: 404 });
    const err = await errorDe(extraer(fetchImpl as unknown as typeof fetch));
    expect(err.kind).toBe("http");
    expect(err.details.status).toBe(404);
  });

  it("fails with kind=timeout when the provider does not answer in time", async () => {
    const fetchImpl = (_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      });
    const err = await errorDe(extraer(fetchImpl as unknown as typeof fetch, 20));
    expect(err.kind).toBe("timeout");
  });
});

describe("checkDv", () => {
  it("validates the DV against the NIT", () => {
    expect(checkDv({ nit: "900123456", dv: "8" })).toEqual({ ok: true });
    expect(checkDv({ nit: "900123456", dv: "3" })).toEqual({ ok: false });
    expect(checkDv({ nit: "900123456", dv: null })).toEqual({ ok: null });
    expect(checkDv({ nit: null, dv: "8" })).toEqual({ ok: null });
  });
});
