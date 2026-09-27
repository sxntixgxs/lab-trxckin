import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { CIIU_ACTIVIDAD } from "../../lib/catalogs/ciiu";
import { calcularDvNit } from "../../lib/rut/nit";
import { RUT_FIELDS, rutFieldsSchema } from "../../lib/rut/schema";

const CASES = path.join(__dirname, "dataset", "cases");
const ids = readdirSync(CASES).sort();

/** Guards the checked-in goldens: a wrong golden would silently skew every eval. */
describe("RUT eval dataset", () => {
  it("has the planned mix of variants", () => {
    const variants = ids.map((id) => JSON.parse(readFileSync(path.join(CASES, id, "expected.json"), "utf8")).variant as string);
    expect(ids.length).toBeGreaterThanOrEqual(18);
    for (const v of ["clean", "scan", "rotated", "lowres", "missing"]) {
      expect(variants.filter((x) => x === v).length, v).toBeGreaterThanOrEqual(2);
    }
  });

  it.each(ids)("%s: golden is schema-valid, DV and CIIU are consistent, files exist", (id) => {
    const dir = path.join(CASES, id);
    const golden = JSON.parse(readFileSync(path.join(dir, "expected.json"), "utf8")) as Record<string, string | null>;
    expect(Object.keys(golden).sort()).toEqual([...RUT_FIELDS, "variant"].sort());
    expect(rutFieldsSchema.parse(golden)).toMatchObject(Object.fromEntries(RUT_FIELDS.map((f) => [f, golden[f]])));
    expect(calcularDvNit(golden.nit!)).toBe(golden.dv);
    for (const codigo of [golden.actividad_principal_codigo, golden.actividad_secundaria_codigo]) {
      if (codigo === null) continue;
      expect(codigo).toMatch(/^\d{4}$/);
      // The catalog keys drop leading zeros ("0111" → "111").
      expect(CIIU_ACTIVIDAD[String(Number(codigo))], codigo).toBeDefined();
    }
    expect(readdirSync(dir).filter((f) => f.startsWith("document."))).toHaveLength(1);
  });
});
