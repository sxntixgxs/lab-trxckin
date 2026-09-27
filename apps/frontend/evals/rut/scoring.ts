import { checkDv } from "../../lib/rut/extract";
import { RUT_FIELDS, type RutField, type RutFields } from "../../lib/rut/schema";

/** Golden answer of one case (expected.json). */
export type Golden = RutFields & { variant: string };

/** What one model produced for one case: validated fields, or why it failed. */
export type Outcome =
  | { ok: true; fields: RutFields }
  | { ok: false; errorKind: string; message: string };

export type FieldMiss = { field: RutField; expected: string | null; got: string | null };

export type CaseScore = {
  schemaValid: boolean;
  /** Output-only checks, no golden needed: what production could run on every extraction. */
  checks: { dvOk: boolean | null; ciiuOk: boolean; enumOk: boolean; missingRequired: RutField[] };
  correct: Record<RutField, boolean>;
  misses: FieldMiss[];
};

// ------------------------------------------------------------------ normalizers

/** Category the onboarding form stores. Mirrors `mapTipoDoc` in suppliers/onboarding/_components/modal-iniciar-proceso.tsx. */
export function categoriaTipoDoc(raw: string | null | undefined): "NIT" | "P.A." | "C.E" | "C.C." {
  const s = (raw ?? "").toUpperCase();
  if (s.includes("NIT") || s === "31") return "NIT";
  if (s.includes("PASAPORTE") || s === "41") return "P.A.";
  if (s.includes("EXTRANJERÍA") || s.includes("EXTRANJERIA") || s === "22") return "C.E";
  return "C.C.";
}

/** True when the value names a document type explicitly (the UI falls back to C.C. for anything else). */
export function tipoDocReconocido(raw: string): boolean {
  if (categoriaTipoDoc(raw) !== "C.C.") return true;
  const s = sinTildes(raw).toUpperCase().replace(/\./g, "").trim();
  return s === "13" || s === "CC" || s.includes("CIUDADANIA");
}

/** CIIU as printed on the RUT: 4 digits, left-padded ("111" → "0111"); null when not a code. */
export function ciiu4(raw: string | null): string | null {
  if (raw === null) return null;
  const digitos = raw.trim();
  if (!/^\d{3,4}$/.test(digitos)) return null;
  return digitos.padStart(4, "0");
}

function sinTildes(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Lowercase, no accents, no dots, other punctuation (, # - ...) as spaces, collapsed whitespace. */
export function normalizarTexto(s: string): string {
  return sinTildes(s)
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/[,#\-;:'"()/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Names may come as "NOMBRES APELLIDOS" or "APELLIDOS NOMBRES": compare the set of words. */
function normalizarNombre(s: string): string {
  return normalizarTexto(s).split(" ").sort().join(" ");
}

// ------------------------------------------------------------------ checks

const REQUERIDOS_SIEMPRE: RutField[] = ["nit", "dv", "tipo_contribuyente", "actividad_principal_codigo", "departamento", "municipio", "direccion"];
const REQUERIDOS: Record<"natural" | "juridica", RutField[]> = {
  juridica: [...REQUERIDOS_SIEMPRE, "razon_social"],
  natural: [...REQUERIDOS_SIEMPRE, "tipo_documento", "numero_identificacion", "primer_apellido", "primer_nombre"],
};

/** Deterministic checks on the output alone (no LLM, no golden). */
export function outputChecks(fields: RutFields): CaseScore["checks"] {
  const codigos = [fields.actividad_principal_codigo, fields.actividad_secundaria_codigo].filter((c): c is string => c !== null);
  const requeridos = fields.tipo_contribuyente ? REQUERIDOS[fields.tipo_contribuyente] : REQUERIDOS_SIEMPRE;
  return {
    dvOk: checkDv(fields).ok,
    ciiuOk: codigos.every((c) => ciiu4(c) !== null),
    enumOk: fields.tipo_contribuyente !== null && (fields.tipo_documento === null || tipoDocReconocido(fields.tipo_documento)),
    missingRequired: requeridos.filter((campo) => fields[campo] === null),
  };
}

// ------------------------------------------------------------------ accuracy

type Comparador = (esperado: string, obtenido: string) => boolean;

const exacto: Comparador = (a, b) => a === b;
const texto: Comparador = (a, b) => normalizarTexto(a) === normalizarTexto(b);

const COMPARADORES: Record<RutField, Comparador> = {
  nit: exacto,
  dv: exacto,
  tipo_contribuyente: exacto,
  numero_identificacion: exacto,
  actividad_principal_codigo: (a, b) => ciiu4(a) === ciiu4(b),
  actividad_secundaria_codigo: (a, b) => ciiu4(a) === ciiu4(b),
  tipo_documento: (a, b) => categoriaTipoDoc(a) === categoriaTipoDoc(b),
  razon_social: texto,
  primer_apellido: texto,
  segundo_apellido: texto,
  primer_nombre: texto,
  departamento: texto,
  municipio: texto,
  direccion: texto,
  nombre_representante_legal: (a, b) => normalizarNombre(a) === normalizarNombre(b),
};

/** Null semantics: null/null is correct; a hallucinated or a missed value is wrong. */
export function fieldCorrect(field: RutField, expected: string | null, got: string | null): boolean {
  if (expected === null || got === null) return expected === got;
  return COMPARADORES[field](expected, got);
}

/** Scores one outcome against its golden. A failed call is schema-invalid with every field wrong. */
export function scoreCase(golden: Golden, outcome: Outcome): CaseScore {
  if (!outcome.ok) {
    const correct = Object.fromEntries(RUT_FIELDS.map((f) => [f, false])) as Record<RutField, boolean>;
    return {
      schemaValid: false,
      checks: { dvOk: null, ciiuOk: false, enumOk: false, missingRequired: [...RUT_FIELDS] },
      correct,
      misses: RUT_FIELDS.map((field) => ({ field, expected: golden[field], got: null })),
    };
  }
  const { fields } = outcome;
  const correct = {} as Record<RutField, boolean>;
  const misses: FieldMiss[] = [];
  for (const field of RUT_FIELDS) {
    correct[field] = fieldCorrect(field, golden[field], fields[field]);
    if (!correct[field]) misses.push({ field, expected: golden[field], got: fields[field] });
  }
  return { schemaValid: true, checks: outputChecks(fields), correct, misses };
}

// ------------------------------------------------------------------ aggregation

export type CaseResult = {
  caseId: string;
  variant: string;
  score: CaseScore;
  costUsd: number;
  latencyMs: number | null;
  error?: string;
};

export type ModelSummary = {
  cases: number;
  schemaValidRate: number;
  dvMismatches: number;
  ciiuFormatErrors: number;
  missingRequired: number;
  overallFieldAccuracy: number;
  perField: Record<RutField, number>;
  byVariant: Record<string, { cases: number; accuracy: number }>;
  cost: { totalUsd: number; meanUsd: number };
  latency: { p50Ms: number | null; p95Ms: number | null };
  failures: Array<{ caseId: string; field: RutField | "*"; expected: string | null; got: string | null }>;
};

/** Nearest-rank percentile. */
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const orden = [...values].sort((a, b) => a - b);
  return orden[Math.min(orden.length - 1, Math.max(0, Math.ceil((p / 100) * orden.length) - 1))];
}

export function summarize(results: CaseResult[]): ModelSummary {
  const n = results.length || 1;
  const perField = {} as Record<RutField, number>;
  for (const field of RUT_FIELDS) {
    perField[field] = results.filter((r) => r.score.correct[field]).length / n;
  }
  const byVariant: ModelSummary["byVariant"] = {};
  for (const variant of [...new Set(results.map((r) => r.variant))].sort()) {
    const grupo = results.filter((r) => r.variant === variant);
    byVariant[variant] = { cases: grupo.length, accuracy: accuracy(grupo) };
  }
  const totalUsd = results.reduce((s, r) => s + r.costUsd, 0);
  const latencias = results.flatMap((r) => (r.latencyMs === null ? [] : [r.latencyMs]));
  const failures = results.flatMap<ModelSummary["failures"][number]>((r) =>
    r.error
      ? [{ caseId: r.caseId, field: "*", expected: null, got: r.error }]
      : r.score.misses.map((m) => ({ caseId: r.caseId, ...m })),
  );
  return {
    cases: results.length,
    schemaValidRate: results.filter((r) => r.score.schemaValid).length / n,
    dvMismatches: results.filter((r) => r.score.checks.dvOk === false).length,
    ciiuFormatErrors: results.filter((r) => r.score.schemaValid && !r.score.checks.ciiuOk).length,
    missingRequired: results.reduce((s, r) => s + (r.score.schemaValid ? r.score.checks.missingRequired.length : 0), 0),
    overallFieldAccuracy: accuracy(results),
    perField,
    byVariant,
    cost: { totalUsd, meanUsd: totalUsd / n },
    latency: { p50Ms: percentile(latencias, 50), p95Ms: percentile(latencias, 95) },
    failures,
  };
}

function accuracy(results: CaseResult[]): number {
  if (results.length === 0) return 0;
  const correctos = results.reduce((s, r) => s + Object.values(r.score.correct).filter(Boolean).length, 0);
  return correctos / (results.length * RUT_FIELDS.length);
}

// ------------------------------------------------------------------ gate

export type Thresholds = {
  min_schema_valid_rate: number;
  min_overall_field_accuracy: number;
  max_dv_mismatches: number;
  max_p95_latency_ms: number;
};

/** Human-readable list of broken thresholds (empty when the model passes). */
export function gateViolations(model: string, s: ModelSummary, t: Thresholds): string[] {
  const out: string[] = [];
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  if (s.schemaValidRate < t.min_schema_valid_rate) {
    out.push(`${model}: schema-valid ${pct(s.schemaValidRate)} < ${pct(t.min_schema_valid_rate)}`);
  }
  if (s.overallFieldAccuracy < t.min_overall_field_accuracy) {
    out.push(`${model}: field accuracy ${pct(s.overallFieldAccuracy)} < ${pct(t.min_overall_field_accuracy)}`);
  }
  if (s.dvMismatches > t.max_dv_mismatches) {
    out.push(`${model}: ${s.dvMismatches} DV mismatches > ${t.max_dv_mismatches}`);
  }
  if (s.latency.p95Ms === null || s.latency.p95Ms > t.max_p95_latency_ms) {
    out.push(`${model}: p95 latency ${s.latency.p95Ms ?? "n/a"} ms > ${t.max_p95_latency_ms} ms`);
  }
  return out;
}
