import { rutModel } from "./models";
import { calcularDvNit } from "./nit";
import { renderPdfFirstPage } from "./pdf-image";
import { RUT_PROMPT } from "./prompt";
import { rutFieldsSchema, type RutFields } from "./schema";

export const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_TIMEOUT_MS = 45_000;

export type RutUsage = {
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  costSource: "provider" | "price_table";
};

export type RutExtraction = {
  /** Validated fields; unknown keys the model added are kept as-is. */
  fields: RutFields & Record<string, unknown>;
  /** Message content as the model wrote it. */
  raw: string;
  usage: RutUsage;
  /** Model that answered (OpenRouter's `model`), or the requested id. */
  model: string;
  latencyMs: number;
  /** Provider response body, kept for eval recordings. */
  body: unknown;
};

export type RutExtractionErrorKind = "http" | "timeout" | "parse" | "schema";

type ErrorDetails = { model: string; status?: number; body?: unknown; latencyMs?: number };

/** Extraction failure; `details.body` and `details.latencyMs` are set when the provider answered. */
export class RutExtractionError extends Error {
  readonly kind: RutExtractionErrorKind;
  readonly details: ErrorDetails;

  constructor(kind: RutExtractionErrorKind, message: string, details: ErrorDetails) {
    super(message);
    this.name = "RutExtractionError";
    this.kind = kind;
    this.details = details;
  }
}

export type ExtractRutInput = {
  bytes: Uint8Array;
  /** application/pdf, image/png or image/jpeg. */
  mediaType: string;
  apiKey: string;
  model: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

/** OpenRouter chat body: the document travels as an image_url data URL (PDFs included). */
export function buildRutRequest(bytes: Uint8Array, mediaType: string, model: string) {
  const dataUrl = `data:${mediaType};base64,${Buffer.from(bytes).toString("base64")}`;
  return {
    model,
    usage: { include: true },
    messages: [
      {
        role: "user" as const,
        content: [
          { type: "image_url" as const, image_url: { url: dataUrl } },
          { type: "text" as const, text: RUT_PROMPT },
        ],
      },
    ],
  };
}

/**
 * What a model receives: the upload as-is, or page 1 rendered to PNG for models that read
 * images but not PDFs (see RUT_MODELS).
 */
export async function inputForModel(model: string, bytes: Uint8Array, mediaType: string) {
  if (mediaType === "application/pdf" && rutModel(model)?.input === "image") {
    return { bytes: await renderPdfFirstPage(bytes), mediaType: "image/png" };
  }
  return { bytes, mediaType };
}

/** Sends one RUT to one model and returns validated fields, usage and latency (rendering included). */
export async function extractRut(input: ExtractRutInput): Promise<RutExtraction> {
  const { model, fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = input;
  const started = performance.now();
  const elapsed = () => Math.round(performance.now() - started);
  const document = await inputForModel(model, input.bytes, input.mediaType);

  let response: Response;
  let text: string;
  try {
    response = await fetchImpl(OPENROUTER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${input.apiKey}` },
      body: JSON.stringify(buildRutRequest(document.bytes, document.mediaType, model)),
      signal: AbortSignal.timeout(timeoutMs),
    });
    text = await response.text();
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      throw new RutExtractionError("timeout", `${model}: sin respuesta en ${timeoutMs} ms`, { model, latencyMs: elapsed() });
    }
    const message = err instanceof Error ? err.message : String(err);
    throw new RutExtractionError("http", `${model}: ${message}`, { model, latencyMs: elapsed() });
  }
  const latencyMs = elapsed();

  const body = parseJson(text);
  if (!response.ok) {
    throw new RutExtractionError("http", `${model}: HTTP ${response.status} ${text.slice(0, 300)}`, {
      model,
      status: response.status,
      body: body ?? text,
      latencyMs,
    });
  }
  if (body === undefined) {
    throw new RutExtractionError("parse", `${model}: la respuesta del proveedor no es JSON`, { model, body: text, latencyMs });
  }
  return { ...readRutResponse(body, model, latencyMs), latencyMs };
}

/**
 * Turns an OpenRouter response body into validated fields. Shared by `extractRut` and the
 * eval replay, so a recorded body is scored exactly like a live one.
 */
export function readRutResponse(
  body: unknown,
  requestedModel: string,
  latencyMs?: number,
): Omit<RutExtraction, "latencyMs"> {
  const data = (body ?? {}) as {
    model?: unknown;
    choices?: Array<{ message?: { content?: unknown } }>;
    usage?: Record<string, unknown>;
    error?: { message?: string };
  };
  const model = typeof data.model === "string" && data.model ? data.model : requestedModel;
  const fail = (kind: RutExtractionErrorKind, message: string) =>
    new RutExtractionError(kind, `${requestedModel}: ${message}`, { model, body, latencyMs });

  // OpenRouter can answer 200 with an error object (e.g. an upstream provider failure).
  if (data.error) throw fail("http", data.error.message ?? "error del proveedor");

  const raw = messageText(data.choices?.[0]?.message?.content);
  const parsed = parseJson(stripFences(raw)) ?? parseJson(outerBraces(raw));
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw fail("parse", "el modelo no devolvió un objeto JSON");
  }
  const result = rutFieldsSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw fail("schema", `campos inválidos (${issues})`);
  }
  return {
    fields: result.data as RutExtraction["fields"],
    raw,
    usage: readUsage(data.usage, requestedModel),
    model,
    body,
  };
}

/** DV check with no LLM: null when the NIT or DV is missing, false when the NIT is unusable. */
export function checkDv(fields: Pick<RutFields, "nit" | "dv">): { ok: boolean | null } {
  if (!fields.nit || !fields.dv) return { ok: null };
  try {
    return { ok: calcularDvNit(fields.nit) === fields.dv.replace(/\D/g, "") };
  } catch {
    return { ok: false };
  }
}

/** Token usage and cost; the price table (by requested model) only fills in when OpenRouter reports no cost. */
export function readUsage(usage: Record<string, unknown> | undefined, model: string): RutUsage {
  const promptTokens = Number(usage?.prompt_tokens ?? usage?.input_tokens ?? 0) || 0;
  const completionTokens = Number(usage?.completion_tokens ?? usage?.output_tokens ?? 0) || 0;
  if (typeof usage?.cost === "number") {
    return { promptTokens, completionTokens, costUsd: usage.cost, costSource: "provider" };
  }
  const price = rutModel(model)?.price ?? { input: 0, output: 0 };
  const costUsd = (promptTokens / 1_000_000) * price.input + (completionTokens / 1_000_000) * price.output;
  return { promptTokens, completionTokens, costUsd, costSource: "price_table" };
}

function messageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((part: { text?: unknown }) => (typeof part?.text === "string" ? part.text : "")).join("");
}

function stripFences(raw: string): string {
  return raw.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
}

/** Last resort for models that wrap the JSON in prose. */
function outerBraces(raw: string): string {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  return start >= 0 && end > start ? raw.slice(start, end + 1) : "";
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
