import { NextRequest, NextResponse } from "next/server";
import { requireApiSession, userHasAccessToAny } from "@/lib/api-route-auth";
import { RUTAS_SISTEMA } from "@/lib/rutas-sistema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

const PRIMARY_MODEL = "google/gemini-2.0-flash-001";
const FALLBACK_MODEL = "google/gemini-3.1-flash-lite-preview";
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_MEDIA_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);

// USD per 1M tokens (only used when the provider does not report a cost).
const PRICE: Record<string, { input: number; output: number }> = {
  [PRIMARY_MODEL]: { input: 0.1, output: 0.4 },
  [FALLBACK_MODEL]: { input: 0.25, output: 1.5 },
};

function calcCost(promptTokens: number, completionTokens: number, model: string): number {
  const p = PRICE[model] ?? PRICE[PRIMARY_MODEL];
  return (promptTokens / 1_000_000) * p.input + (completionTokens / 1_000_000) * p.output;
}

const PROMPT = `Extract the following fields from this DIAN RUT document and return ONLY a valid JSON object.
No markdown, no explanation, just raw JSON.

Rules:
- If a field is not present or empty, use null
- For "tipo_contribuyente": return either "natural" or "juridica"
- NIT should NOT include the DV digit
- Return codes as strings
- For "departamento": extract the department name (e.g. "CUNDINAMARCA", "ANTIOQUIA")
- For "municipio": extract the city/municipality name (e.g. "BOGOTÁ D.C.", "MEDELLÍN")
- For "direccion": extract the full address as written on the document
- For "nombre_representante_legal": extract the full name of the legal representative if present (persona jurídica); use null if not found or if natural person

{
  "nit": "",
  "dv": "",
  "tipo_contribuyente": "",
  "razon_social": null,
  "tipo_documento": null,
  "numero_identificacion": null,
  "primer_apellido": null,
  "segundo_apellido": null,
  "primer_nombre": null,
  "actividad_principal_codigo": "",
  "actividad_secundaria_codigo": null,
  "departamento": null,
  "municipio": null,
  "direccion": null,
  "nombre_representante_legal": null
}`;

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
  const dataUrl = `data:${contentType};base64,${Buffer.from(buffer).toString("base64")}`;
  const requestBody = {
    messages: [
      {
        role: "user" as const,
        content: [
          { type: "image_url" as const, image_url: { url: dataUrl } },
          { type: "text" as const, text: PROMPT },
        ],
      },
    ],
  };

  const tryModel = async (model: string) => {
    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ ...requestBody, model }),
    });
    if (!response.ok) throw new Error(await response.text());
    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: Record<string, unknown>;
    };
    const raw = data.choices?.[0]?.message?.content ?? "";
    const json = raw.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    const extracted = JSON.parse(json) as Record<string, unknown>;
    const usage = data.usage ?? {};
    const promptTokens = Number(usage.prompt_tokens ?? usage.input_tokens ?? 0);
    const completionTokens = Number(usage.completion_tokens ?? usage.output_tokens ?? 0);
    const costUsd = typeof usage.cost === "number" ? usage.cost : calcCost(promptTokens, completionTokens, model);
    return {
      ...extracted,
      _usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens,
        cost_usd: Math.round(costUsd * 1_000_000) / 1_000_000,
      },
    };
  };

  try {
    return NextResponse.json(await tryModel(PRIMARY_MODEL));
  } catch {
    try {
      return NextResponse.json(await tryModel(FALLBACK_MODEL));
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "Error en extracción" }, { status: 500 });
    }
  }
}
