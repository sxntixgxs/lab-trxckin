/** How a model receives the RUT: the original PDF, or a PNG rendition of page 1. */
export type RutModelInput = "pdf" | "image";

export type RutModel = {
  id: string;
  input: RutModelInput;
  /** USD per 1M tokens; only used when OpenRouter does not report `usage.cost`. */
  price: { input: number; output: number };
};

/**
 * Route models, chosen from evals/rut (2026-09-27, after the NIT/DV prompt fix): Gemini 3.1
 * Flash Lite measured 98.3% field accuracy and 0 DV mismatches at $0.0006/doc; DeepSeek, a
 * different vendor, only answers when Gemini fails. The previous primary,
 * google/gemini-2.0-flash-001, is retired (HTTP 404) and kept only as the eval's probe.
 */
export const PRIMARY_MODEL = "google/gemini-3.1-flash-lite-preview";
export const FALLBACK_MODEL = "deepseek/deepseek-v4.1-flash";
export const RETIRED_MODEL = "google/gemini-2.0-flash-001";

// Prices from https://openrouter.ai/api/v1/models (2026-09-27). gemini-2.0-flash-001 is no
// longer listed there, so its entry keeps the last known price.
export const RUT_MODELS: Record<string, RutModel> = {
  [PRIMARY_MODEL]: { id: PRIMARY_MODEL, input: "pdf", price: { input: 0.25, output: 1.5 } },
  [FALLBACK_MODEL]: { id: FALLBACK_MODEL, input: "image", price: { input: 0.035, output: 0.29 } },
  [RETIRED_MODEL]: { id: RETIRED_MODEL, input: "pdf", price: { input: 0.1, output: 0.4 } },
};

/** Registry entry, or null for ids the registry does not know. */
export function rutModel(id: string): RutModel | null {
  return RUT_MODELS[id] ?? null;
}
