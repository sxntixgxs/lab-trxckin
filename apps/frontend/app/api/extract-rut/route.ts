import { NextRequest, NextResponse } from "next/server";
import { requireApiSession, userHasAccessToAny } from "@/lib/api-route-auth";
import { RUTAS_SISTEMA } from "@/lib/rutas-sistema";
import { checkDv, extractRut, type RutExtraction } from "@/lib/rut/extract";
import { FALLBACK_MODEL, PRIMARY_MODEL } from "@/lib/rut/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_MEDIA_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);

/**
 * Extracts RUT fields with OpenRouter (Gemini). Optional feature: without
 * `OPENROUTER_API_KEY` the route answers 503 and the UI falls back to manual entry.
 */
export async function POST(req: NextRequest) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;
  if (!userHasAccessToAny(auth.user, [RUTAS_SISTEMA.PROVEEDORES_ONBOARDING, RUTAS_SISTEMA.CLIENTES_ONBOARDING])) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "La extracción automática del RUT no está configurada (OPENROUTER_API_KEY).", code: "not_configured" },
      { status: 503 },
    );
  }

  // The RUT the user just picked travels in the request (multipart `file`). The route used
  // to take a Convex storage id and resolve it with the server secret, which let any
  // onboarding user send any stored file (invoices, supports...) to the extraction model.
  const declaredLength = Number(req.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_FILE_BYTES + 64 * 1024) {
    return NextResponse.json({ error: "El archivo excede 10 MB" }, { status: 413 });
  }
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "Archivo requerido" }, { status: 400 });
  }

  const contentType = (file.type ?? "").split(";", 1)[0].trim().toLowerCase();
  if (!ALLOWED_MEDIA_TYPES.has(contentType)) {
    return NextResponse.json({ error: "Tipo de archivo no permitido" }, { status: 415 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "El archivo excede 10 MB" }, { status: 413 });
  }

  const buffer = await file.arrayBuffer();
  if (buffer.byteLength === 0) {
    return NextResponse.json({ error: "El archivo está vacío" }, { status: 400 });
  }
  if (buffer.byteLength > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "El archivo excede 10 MB" }, { status: 413 });
  }

  // OpenRouter/Gemini: PDFs and images both travel as image_url data URLs (mapped to inline_data).
  // Any failure of the primary (HTTP, timeout, unparseable or schema-invalid JSON) tries the fallback.
  const bytes = new Uint8Array(buffer);
  const tryModel = (model: string) => extractRut({ bytes, mediaType: contentType, apiKey, model });

  try {
    return NextResponse.json(toResponseBody(await tryModel(PRIMARY_MODEL)));
  } catch {
    try {
      return NextResponse.json(toResponseBody(await tryModel(FALLBACK_MODEL)));
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "Error en extracción" }, { status: 500 });
    }
  }
}

/** Backward-compatible body: the fields plus `_usage`; adds the answering model, latency and the DV check. */
function toResponseBody(result: RutExtraction) {
  const { promptTokens, completionTokens, costUsd } = result.usage;
  return {
    ...result.fields,
    _usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
      cost_usd: Math.round(costUsd * 1_000_000) / 1_000_000,
      model: result.model,
      latency_ms: result.latencyMs,
    },
    _validation: { dv_ok: checkDv(result.fields).ok },
  };
}
