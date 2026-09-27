/**
 * RUT extraction evals.
 *
 *   pnpm --filter frontend eval:rut                       # replay recorded responses (no key, no network)
 *   pnpm --filter frontend eval:rut:live                  # call OpenRouter, re-record cassettes
 *   tsx evals/rut/run.ts --models a,b --cases 'rut-0*' --budget-usd 1
 *
 * Writes report.md and summary.json next to this file and exits 1 when a gated threshold
 * (thresholds.json) is broken. Cassettes hold the provider response body, parsed usage,
 * latency and model, never the API key or request headers.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

import { extractRut, readRutResponse, readUsage, RutExtractionError } from "../../lib/rut/extract";
import { RETIRED_MODEL as PROBE_MODEL, rutModel, type RutModel } from "../../lib/rut/models";
import { RUT_PROMPT } from "../../lib/rut/prompt";
import { RUT_FIELDS } from "../../lib/rut/schema";
import { gateViolations, scoreCase, summarize, type CaseResult, type Golden, type ModelSummary, type Outcome, type Thresholds } from "./scoring";

const ROOT = __dirname;
const CASES_DIR = path.join(ROOT, "dataset", "cases");
const CASSETTES_DIR = path.join(ROOT, "cassettes");
const DEFAULT_MODELS = ["deepseek/deepseek-v4.1-flash", "google/gemini-3.1-flash-lite-preview"];
const CONCURRENCY = 4;
const MODELS_API = "https://openrouter.ai/api/v1/models";
/** Recordings are only valid for the prompt they were made with. */
const PROMPT_SHA256 = createHash("sha256").update(RUT_PROMPT).digest("hex");

type Mode = "live" | "replay";

type EvalCase = { id: string; golden: Golden; document: string };

type Cassette = {
  case: string;
  requested_model: string;
  model: string;
  recorded_at: string;
  input: { file: string; media_type: string; sha256: string };
  prompt_sha256: string;
  latency_ms: number | null;
  /** "ok", or the RutExtractionError kind. */
  outcome: "ok" | "http" | "timeout" | "parse" | "schema";
  error?: string;
  http_status?: number;
  usage: ReturnType<typeof readUsage> | null;
  /** Raw provider response body (JSON when it was JSON). */
  response: unknown;
};

type Probe = Omit<Cassette, "case"> & { listed_in_models_api: boolean | null };

// ------------------------------------------------------------------ inputs

function parseCli() {
  const { values } = parseArgs({
    options: {
      mode: { type: "string", default: "replay" },
      models: { type: "string" },
      cases: { type: "string" },
      "budget-usd": { type: "string", default: "2" },
      "no-probe": { type: "boolean", default: false },
    },
  });
  const mode = values.mode as Mode;
  if (mode !== "live" && mode !== "replay") throw new Error(`--mode debe ser live o replay (recibido: ${values.mode})`);
  const models = (values.models ?? DEFAULT_MODELS.join(",")).split(",").map((m) => m.trim()).filter(Boolean);
  const registry = models.map((id) => {
    const model = rutModel(id);
    if (!model) throw new Error(`Modelo desconocido ${id}: agréguelo a lib/rut/models.ts con su tipo de entrada y precio.`);
    return model;
  });
  return { mode, models: registry, cases: values.cases, budgetUsd: Number(values["budget-usd"]), probe: !values["no-probe"] };
}

/** `--cases` accepts ids and globs, comma-separated ("rut-01,rut-1*"). */
function loadCases(filter: string | undefined): EvalCase[] {
  const patterns = (filter ?? "*").split(",").map((p) => new RegExp(`^${p.trim().replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".")}$`));
  const ids = readdirSync(CASES_DIR).filter((id) => patterns.some((re) => re.test(id))).sort();
  if (ids.length === 0) throw new Error(`Ningún caso coincide con --cases ${filter}`);
  return ids.map((id) => {
    const dir = path.join(CASES_DIR, id);
    const document = readdirSync(dir).find((f) => f.startsWith("document."));
    if (!document) throw new Error(`${id}: falta document.*`);
    const golden = JSON.parse(readFileSync(path.join(dir, "expected.json"), "utf8")) as Golden;
    return { id, golden, document: path.join(dir, document) };
  });
}

/**
 * Every model gets the upload itself; extractRut renders page 1 of a PDF for image-only
 * models, exactly as the route does, so the eval measures the production path.
 */
function inputFor(_model: RutModel, c: EvalCase) {
  const file = c.document;
  const bytes = readFileSync(file);
  const ext = path.extname(file).slice(1).toLowerCase();
  const mediaType = ext === "pdf" ? "application/pdf" : ext === "png" ? "image/png" : "image/jpeg";
  return { file: path.basename(file), bytes: new Uint8Array(bytes), mediaType, sha256: createHash("sha256").update(bytes).digest("hex") };
}

const slug = (model: string) => model.replace(/[/:]/g, "__");
const cassettePath = (model: string, caseId: string) => path.join(CASSETTES_DIR, slug(model), `${caseId}.json`);
const probePath = (model: string) => path.join(CASSETTES_DIR, "_probe", `${slug(model)}.json`);

function writeJson(file: string, data: unknown) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 2) + "\n", "utf8");
}

// ------------------------------------------------------------------ live

/** OpenRouter error bodies carry the account's `user_id`; recordings are public, so drop it. */
function scrub<T>(value: T): T {
  if (typeof value === "string") return value.replace(/,?\s*"user_id"\s*:\s*"[^"]*"/g, "") as T;
  if (Array.isArray(value)) return value.map(scrub) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).filter(([k]) => k !== "user_id").map(([k, v]) => [k, scrub(v)])) as T;
  }
  return value;
}

/** One call, recorded whatever happens. Failures carry the provider body when there was one. */
async function record(model: string, input: ReturnType<typeof inputFor>, apiKey: string): Promise<Omit<Cassette, "case">> {
  return scrub(await call(model, input, apiKey));
}

async function call(model: string, input: ReturnType<typeof inputFor>, apiKey: string): Promise<Omit<Cassette, "case">> {
  const base = {
    requested_model: model,
    recorded_at: new Date().toISOString(),
    input: { file: input.file, media_type: input.mediaType, sha256: input.sha256 },
    prompt_sha256: PROMPT_SHA256,
  };
  try {
    const r = await extractRut({ bytes: input.bytes, mediaType: input.mediaType, apiKey, model });
    return { ...base, model: r.model, latency_ms: r.latencyMs, outcome: "ok", usage: r.usage, response: r.body };
  } catch (err) {
    if (!(err instanceof RutExtractionError)) throw err;
    const body = err.details.body;
    const usage = body && typeof body === "object" ? readUsage((body as { usage?: Record<string, unknown> }).usage, model) : null;
    return {
      ...base,
      model: err.details.model || model,
      latency_ms: err.details.latencyMs ?? null,
      outcome: err.kind,
      error: err.message.slice(0, 500),
      http_status: err.details.status,
      usage,
      response: body ?? null,
    };
  }
}

async function runLive(models: RutModel[], cases: EvalCase[], budgetUsd: number, probe: boolean) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY no está definida (modo live).");
  let spent = 0;
  let overBudget = false;

  if (probe && !models.some((m) => m.id === PROBE_MODEL)) {
    const listed = await fetch(MODELS_API)
      .then((r) => r.json() as Promise<{ data?: Array<{ id: string }> }>)
      .then((d) => (d.data ?? []).some((m) => m.id === PROBE_MODEL))
      .catch(() => null);
    const rec = await record(PROBE_MODEL, inputFor(rutModel(PROBE_MODEL)!, cases[0]), apiKey);
    spent += rec.usage?.costUsd ?? 0;
    writeJson(probePath(PROBE_MODEL), { ...rec, listed_in_models_api: listed } satisfies Probe);
    console.log(`probe ${PROBE_MODEL}: listed=${listed} outcome=${rec.outcome}${rec.http_status ? ` (HTTP ${rec.http_status})` : ""}`);
  }

  const tasks = models.flatMap((m) => cases.map((c) => ({ m, c })));
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const { m, c } = tasks[next++];
      if (spent >= budgetUsd) {
        overBudget = true;
        return;
      }
      const rec = await record(m.id, inputFor(m, c), apiKey);
      spent += rec.usage?.costUsd ?? 0;
      writeJson(cassettePath(m.id, c.id), { case: c.id, ...rec } satisfies Cassette);
      console.log(`${m.id} ${c.id}: ${rec.outcome} ${rec.latency_ms ?? "-"} ms $${(rec.usage?.costUsd ?? 0).toFixed(6)}`);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log(`gasto live: US$${spent.toFixed(4)} (presupuesto US$${budgetUsd})`);
  if (overBudget) throw new Error(`Presupuesto de US$${budgetUsd} agotado: la corrida live se detuvo antes de terminar.`);
}

// ------------------------------------------------------------------ scoring from cassettes

function outcomeOf(cassette: Cassette): Outcome {
  if (cassette.outcome === "http" || cassette.outcome === "timeout") {
    return { ok: false, errorKind: cassette.outcome, message: cassette.error ?? cassette.outcome };
  }
  // Re-read the body with today's parser and schema, so replay follows code changes.
  try {
    return { ok: true, fields: readRutResponse(cassette.response, cassette.requested_model).fields };
  } catch (err) {
    if (err instanceof RutExtractionError) return { ok: false, errorKind: err.kind, message: err.message };
    throw err;
  }
}

function score(model: RutModel, cases: EvalCase[]): CaseResult[] {
  return cases.map((c) => {
    const file = cassettePath(model.id, c.id);
    if (!existsSync(file)) throw new Error(`Falta la grabación ${path.relative(ROOT, file)}: corra el modo live para ${model.id}.`);
    const cassette = JSON.parse(readFileSync(file, "utf8")) as Cassette;
    if (cassette.input.sha256 !== inputFor(model, c).sha256) {
      throw new Error(`${path.relative(ROOT, file)} se grabó con otro documento: el dataset cambió, vuelva a correr el modo live.`);
    }
    if (cassette.prompt_sha256 !== PROMPT_SHA256) {
      throw new Error(`${path.relative(ROOT, file)} se grabó con otro prompt: vuelva a correr el modo live (eval:rut:live).`);
    }
    const outcome = outcomeOf(cassette);
    return {
      caseId: c.id,
      variant: c.golden.variant,
      score: scoreCase(c.golden, outcome),
      costUsd: cassette.usage?.costUsd ?? 0,
      latencyMs: cassette.latency_ms,
      error: outcome.ok ? undefined : `${outcome.errorKind}: ${outcome.message}`,
    };
  });
}

// ------------------------------------------------------------------ report

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const usd = (x: number) => `$${x.toFixed(6)}`;
const ms = (x: number | null) => (x === null ? "n/a" : `${(x / 1000).toFixed(1)} s`);
const cell = (s: string | null) => (s === null ? "_null_" : `\`${s.replace(/\|/g, "\\|").replace(/`/g, "'")}\``);

function readProbe(): Probe | null {
  const file = probePath(PROBE_MODEL);
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Probe) : null;
}

function renderReport(models: RutModel[], cases: EvalCase[], summaries: Record<string, ModelSummary>, gates: Record<string, string[] | null>) {
  const variantes = [...new Set(cases.map((c) => c.golden.variant))].sort();
  const cuenta = variantes.map((v) => `${cases.filter((c) => c.golden.variant === v).length} ${v}`).join(", ");
  const recorded = models.flatMap((m) => cases.map((c) => (JSON.parse(readFileSync(cassettePath(m.id, c.id), "utf8")) as Cassette).recorded_at)).sort();
  const L: string[] = [];

  L.push("# RUT extraction evals", "");
  L.push(`${cases.length} synthetic RUTs (${cuenta}). Recorded ${recorded[0]?.slice(0, 10)} to ${recorded.at(-1)?.slice(0, 10)}.`, "");
  L.push("<!-- summary:start -->");
  L.push("| Model | Input | Schema-valid | DV mismatches | Field accuracy | Mean cost/doc | Total cost | p50 latency | p95 latency | Gate |");
  L.push("| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |");
  for (const m of models) {
    const s = summaries[m.id];
    const gate = gates[m.id] === null ? "not gated" : gates[m.id]!.length ? "**FAIL**" : "pass";
    L.push(`| \`${m.id}\` | ${m.input === "pdf" ? "document as uploaded" : "PDF page 1 → PNG (pdf.js); images as uploaded"} | ${pct(s.schemaValidRate)} | ${s.dvMismatches} | ${pct(s.overallFieldAccuracy)} | ${usd(s.cost.meanUsd)} | ${usd(s.cost.totalUsd)} | ${ms(s.latency.p50Ms)} | ${ms(s.latency.p95Ms)} | ${gate} |`);
  }
  L.push("<!-- summary:end -->", "");

  L.push("## Per-field accuracy", "");
  L.push(`| Field | ${models.map((m) => `\`${m.id}\``).join(" | ")} |`, `| --- | ${models.map(() => "---:").join(" | ")} |`);
  for (const f of RUT_FIELDS) L.push(`| \`${f}\` | ${models.map((m) => pct(summaries[m.id].perField[f])).join(" | ")} |`);
  L.push("");

  L.push("## Accuracy by variant", "");
  L.push(`| Variant | Cases | ${models.map((m) => `\`${m.id}\``).join(" | ")} |`, `| --- | ---: | ${models.map(() => "---:").join(" | ")} |`);
  for (const v of variantes) {
    L.push(`| ${v} | ${summaries[models[0].id].byVariant[v]?.cases ?? 0} | ${models.map((m) => pct(summaries[m.id].byVariant[v]?.accuracy ?? 0)).join(" | ")} |`);
  }
  L.push("");

  L.push("## Output-only checks", "", "Checks that need no golden (production could run them on every extraction).", "");
  L.push("| Model | DV mismatches | Non-CIIU activity codes | Missing required fields |", "| --- | ---: | ---: | ---: |");
  for (const m of models) {
    const s = summaries[m.id];
    L.push(`| \`${m.id}\` | ${s.dvMismatches} | ${s.ciiuFormatErrors} | ${s.missingRequired} |`);
  }
  L.push("");

  L.push("## Model availability", "");
  const probe = readProbe();
  if (!probe) {
    L.push(`No probe recorded for \`${PROBE_MODEL}\` (the route's former primary model).`);
  } else {
    const listed = probe.listed_in_models_api === null ? "could not be checked" : probe.listed_in_models_api ? "listed" : "**not listed**";
    const result = probe.outcome === "ok" ? `answered in ${ms(probe.latency_ms)}` : `failed (${probe.outcome}${probe.http_status ? `, HTTP ${probe.http_status}` : ""}): ${cell(probe.error ?? "")}`;
    L.push(`- \`${PROBE_MODEL}\` (the route's former primary), probed once on ${probe.recorded_at.slice(0, 10)}: ${listed} in \`/api/v1/models\`; the request ${result}.`);
    if (probe.outcome !== "ok") L.push("- Until 2026-09-27 it was the route's primary, so every production extraction failed once and was served by the fallback; the route now starts with the gated model.");
  }
  L.push("");

  L.push("## Failing case/field pairs", "");
  for (const m of models) {
    const fails = summaries[m.id].failures;
    L.push(`### \`${m.id}\` (${fails.length})`, "");
    if (fails.length === 0) {
      L.push("None.", "");
      continue;
    }
    L.push("| Case | Field | Expected | Got |", "| --- | --- | --- | --- |");
    for (const f of fails) L.push(`| ${f.caseId} | ${f.field === "*" ? "all (call failed)" : `\`${f.field}\``} | ${cell(f.expected)} | ${cell(f.got)} |`);
    L.push("");
  }

  L.push("## How to reproduce", "");
  L.push("```sh");
  L.push("pnpm eval:rut                                   # replay the recorded cassettes (no key needed)");
  L.push("OPENROUTER_API_KEY=... pnpm --filter frontend eval:rut:live   # re-record (budget US$2 by default)");
  L.push("python apps/frontend/evals/rut/dataset/build.py # regenerate the synthetic dataset (Typst + Pillow)");
  L.push("```", "");
  L.push("Scoring rules and thresholds: [docs/rut-evals.md](../../../../docs/rut-evals.md).", "");
  return L.join("\n");
}

// ------------------------------------------------------------------ main

async function main() {
  const { mode, models, cases: filter, budgetUsd, probe } = parseCli();
  const cases = loadCases(filter);
  console.log(`${mode}: ${models.length} modelos × ${cases.length} casos`);
  if (mode === "live") await runLive(models, cases, budgetUsd, probe);

  const summaries: Record<string, ModelSummary> = {};
  for (const m of models) summaries[m.id] = summarize(score(m, cases));

  const thresholds = JSON.parse(readFileSync(path.join(ROOT, "thresholds.json"), "utf8")) as { gated_models: Record<string, Thresholds> };
  const gates: Record<string, string[] | null> = {};
  for (const m of models) {
    const t = thresholds.gated_models[m.id];
    gates[m.id] = t ? gateViolations(m.id, summaries[m.id], t) : null;
  }

  writeFileSync(path.join(ROOT, "report.md"), renderReport(models, cases, summaries, gates), "utf8");
  writeJson(path.join(ROOT, "summary.json"), {
    cases: cases.map((c) => ({ id: c.id, variant: c.golden.variant })),
    models: Object.fromEntries(models.map((m) => [m.id, { input: m.input, ...summaries[m.id], gate: gates[m.id] === null ? "not gated" : gates[m.id]!.length ? "fail" : "pass" }])),
    probe: readProbe() && { ...readProbe()!, response: undefined },
    thresholds: thresholds.gated_models,
  });

  for (const m of models) {
    const s = summaries[m.id];
    console.log(`${m.id}: schema ${pct(s.schemaValidRate)}, accuracy ${pct(s.overallFieldAccuracy)}, DV mismatches ${s.dvMismatches}, p95 ${ms(s.latency.p95Ms)}, ${usd(s.cost.meanUsd)}/doc`);
  }
  const violations = Object.values(gates).flatMap((v) => v ?? []);
  if (violations.length) {
    console.error(`\nUmbrales incumplidos (evals/rut/thresholds.json):\n- ${violations.join("\n- ")}`);
    process.exitCode = 1;
  } else {
    console.log("Umbrales OK. Reporte: evals/rut/report.md");
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
