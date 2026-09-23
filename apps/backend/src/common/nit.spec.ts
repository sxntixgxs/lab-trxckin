import { describe, expect, it } from "vitest";
import { calcularDvNit, candidatosNit, normalizarNit, separarNitYDv } from "./nit";

// Same vectors as the Convex helper (apps/frontend/convex/lib/onboarding/nit.test.ts) and the
// ERP simulator (apps/erp-simulator/src/datos/nit.spec.ts).
describe("calcularDvNit", () => {
  it("computes the DIAN check digit", () => {
    expect(calcularDvNit("900123456")).toBe("8");
    expect(calcularDvNit("890903938")).toBe("8");
    expect(calcularDvNit("0890123456")).toBe(calcularDvNit("890123456"));
  });

  it("rejects empty input", () => {
    expect(() => calcularDvNit("-")).toThrow();
  });
});

describe("normalizarNit", () => {
  it("keeps digits and drops leading zeros", () => {
    expect(normalizarNit("900.123.456-8")).toBe("9001234568");
    expect(normalizarNit("0890123456")).toBe("890123456");
  });
});

describe("candidatosNit", () => {
  it("adds the value without a valid DV only for NIT", () => {
    expect(candidatosNit("900.123.456-8", "NIT")).toEqual(["9001234568", "900123456"]);
    expect(candidatosNit("9001234568", "NIT")).toEqual(["9001234568", "900123456"]);
    expect(candidatosNit("9001234567", "NIT")).toEqual(["9001234567"]);
    expect(candidatosNit("900123456", "NIT")).toEqual(["900123456"]);
  });

  it("never strips digits from other document types", () => {
    expect(candidatosNit("9001234568", "C.C.")).toEqual(["9001234568"]);
    expect(candidatosNit("9001234568")).toEqual(["9001234568"]);
  });

  it("returns nothing for input without digits", () => {
    expect(candidatosNit("abc", "NIT")).toEqual([]);
  });
});

describe("separarNitYDv", () => {
  it("splits an explicit -DV suffix and recomputes the DV", () => {
    expect(separarNitYDv("900.123.456-8", "NIT")).toEqual({ nit: "900123456", dv: "8" });
    expect(separarNitYDv("900123456-1", "NIT")).toEqual({ nit: "900123456", dv: "8" });
  });

  it("strips a trailing DV only from 10+ digit NITs", () => {
    expect(separarNitYDv("9001234568", "NIT")).toEqual({ nit: "900123456", dv: "8" });
    expect(separarNitYDv("900123456", "NIT")).toEqual({ nit: "900123456", dv: "8" });
  });

  it("leaves other document types whole and without DV", () => {
    expect(separarNitYDv("52.123.456", "C.C.")).toEqual({ nit: "52123456", dv: null });
  });
});
