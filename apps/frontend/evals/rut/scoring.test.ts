import { describe, expect, it } from "vitest";

import type { RutFields } from "../../lib/rut/schema";
import {
  categoriaTipoDoc,
  ciiu4,
  fieldCorrect,
  gateViolations,
  normalizarTexto,
  outputChecks,
  percentile,
  scoreCase,
  summarize,
  type CaseResult,
  type Golden,
} from "./scoring";

const JURIDICA: RutFields = {
  nit: "901245781",
  dv: "4",
  tipo_contribuyente: "juridica",
  razon_social: "DROMINC S.A.S.",
  tipo_documento: null,
  numero_identificacion: null,
  primer_apellido: null,
  segundo_apellido: null,
  primer_nombre: null,
  actividad_principal_codigo: "0123",
  actividad_secundaria_codigo: "6202",
  departamento: "BOGOTÁ D.C.",
  municipio: "BOGOTÁ D.C.",
  direccion: "CR 43A 7 50 OF 1104",
  nombre_representante_legal: "ANA MARÍA RESTREPO GIL",
};
const GOLDEN: Golden = { ...JURIDICA, variant: "clean" };

describe("normalizers", () => {
  it("maps document types like the onboarding modal", () => {
    expect(categoriaTipoDoc("31")).toBe("NIT");
    expect(categoriaTipoDoc("Pasaporte")).toBe("P.A.");
    expect(categoriaTipoDoc("41")).toBe("P.A.");
    expect(categoriaTipoDoc("Cédula de Extranjería")).toBe("C.E");
    expect(categoriaTipoDoc("22")).toBe("C.E");
    expect(categoriaTipoDoc("13")).toBe("C.C.");
    expect(categoriaTipoDoc("Cédula de Ciudadanía")).toBe("C.C.");
  });

  it("pads 3-digit CIIU codes and rejects non-codes", () => {
    expect(ciiu4("111")).toBe("0111");
    expect(ciiu4("0111")).toBe("0111");
    expect(ciiu4("6201")).toBe("6201");
    expect(ciiu4("62011")).toBeNull();
    expect(ciiu4("Cultivo de café")).toBeNull();
  });

  it("normalizes case, accents, dots and punctuation", () => {
    expect(normalizarTexto("  Bogotá,  D.C. ")).toBe("bogota dc");
    expect(normalizarTexto("CL 10 # 43-20")).toBe("cl 10 43 20");
    expect(normalizarTexto("Drominc SAS")).toBe(normalizarTexto("DROMINC S.A.S."));
  });
});

describe("fieldCorrect", () => {
  it("applies null semantics", () => {
    expect(fieldCorrect("segundo_apellido", null, null)).toBe(true);
    expect(fieldCorrect("segundo_apellido", null, "GIL")).toBe(false);
    expect(fieldCorrect("segundo_apellido", "GIL", null)).toBe(false);
  });

  it("is exact for identifiers and lenient for text", () => {
    expect(fieldCorrect("nit", "901245781", "901.245.781")).toBe(false);
    expect(fieldCorrect("dv", "4", "4")).toBe(true);
    expect(fieldCorrect("actividad_principal_codigo", "0123", "123")).toBe(true);
    expect(fieldCorrect("tipo_documento", "13", "Cédula de Ciudadanía")).toBe(true);
    expect(fieldCorrect("tipo_documento", "22", "13")).toBe(false);
    expect(fieldCorrect("municipio", "BOGOTÁ D.C.", "Bogota, D.C.")).toBe(true);
    expect(fieldCorrect("nombre_representante_legal", "ANA MARÍA RESTREPO GIL", "RESTREPO GIL ANA MARIA")).toBe(true);
    expect(fieldCorrect("nombre_representante_legal", "ANA MARÍA RESTREPO GIL", "ANA RESTREPO")).toBe(false);
  });
});

describe("outputChecks", () => {
  it("passes a consistent extraction", () => {
    expect(outputChecks(JURIDICA)).toEqual({ dvOk: true, ciiuOk: true, enumOk: true, missingRequired: [] });
  });

  it("flags DV, CIIU format, unknown document types and missing required fields", () => {
    const natural: RutFields = {
      ...JURIDICA,
      dv: "5",
      tipo_contribuyente: "natural",
      razon_social: null,
      tipo_documento: "Tarjeta X",
      actividad_principal_codigo: "Comercio",
      primer_nombre: "ANA",
    };
    expect(outputChecks(natural)).toEqual({
      dvOk: false,
      ciiuOk: false,
      enumOk: false,
      missingRequired: ["numero_identificacion", "primer_apellido"],
    });
  });
});

describe("scoreCase", () => {
  it("scores field by field", () => {
    const score = scoreCase(GOLDEN, { ok: true, fields: { ...JURIDICA, dv: "9", segundo_apellido: "GIL" } });
    expect(score.schemaValid).toBe(true);
    expect(score.checks.dvOk).toBe(false);
    expect(score.misses.map((m) => m.field)).toEqual(["dv", "segundo_apellido"]);
  });

  it("counts a failed call as schema-invalid with every field wrong", () => {
    const score = scoreCase(GOLDEN, { ok: false, errorKind: "timeout", message: "sin respuesta" });
    expect(score.schemaValid).toBe(false);
    expect(Object.values(score.correct).every((ok) => !ok)).toBe(true);
  });
});

describe("summarize and gate", () => {
  const ok: CaseResult = { caseId: "a", variant: "clean", score: scoreCase(GOLDEN, { ok: true, fields: JURIDICA }), costUsd: 0.001, latencyMs: 1000 };
  const failed: CaseResult = {
    caseId: "b",
    variant: "scan",
    score: scoreCase(GOLDEN, { ok: false, errorKind: "http", message: "502" }),
    costUsd: 0,
    latencyMs: 3000,
    error: "http: 502",
  };

  it("aggregates rates, accuracy, cost and latency", () => {
    const s = summarize([ok, failed]);
    expect(s.schemaValidRate).toBe(0.5);
    expect(s.overallFieldAccuracy).toBe(0.5);
    expect(s.byVariant).toEqual({ clean: { cases: 1, accuracy: 1 }, scan: { cases: 1, accuracy: 0 } });
    expect(s.cost).toEqual({ totalUsd: 0.001, meanUsd: 0.0005 });
    expect(s.latency).toEqual({ p50Ms: 1000, p95Ms: 3000 });
    expect(s.failures).toEqual([{ caseId: "b", field: "*", expected: null, got: "http: 502" }]);
  });

  it("reports every broken threshold", () => {
    const s = summarize([ok, failed]);
    const t = { min_schema_valid_rate: 0.9, min_overall_field_accuracy: 0.9, max_dv_mismatches: 0, max_p95_latency_ms: 2000 };
    expect(gateViolations("m", s, t)).toHaveLength(3);
    expect(gateViolations("m", summarize([ok]), t)).toEqual([]);
  });

  it("uses nearest-rank percentiles", () => {
    expect(percentile([5, 1, 3, 2, 4], 50)).toBe(3);
    expect(percentile(Array.from({ length: 20 }, (_, i) => i + 1), 95)).toBe(19);
    expect(percentile([], 50)).toBeNull();
  });
});
