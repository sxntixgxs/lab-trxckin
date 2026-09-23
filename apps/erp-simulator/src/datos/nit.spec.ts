import { describe, expect, it } from "vitest";
import { calcularDvNit, normalizarNit } from "./nit";

describe("calcularDvNit", () => {
  it("computes the DIAN check digit", () => {
    expect(calcularDvNit("900123456")).toBe("8");
    // Well-known public NIT, used as an independent vector.
    expect(calcularDvNit("890903938")).toBe("8");
    expect(calcularDvNit("800666777")).toBe(calcularDvNit("800.666.777"));
  });

  it("ignores zero padding", () => {
    expect(calcularDvNit("0890123456")).toBe(calcularDvNit("890123456"));
  });

  it("returns 0 or 1 when the remainder is 0 or 1", () => {
    for (const nit of ["900222333", "900444555", "901777888", "52123456"]) {
      expect(calcularDvNit(nit)).toMatch(/^\d$/);
    }
  });

  it("rejects empty or too long input", () => {
    expect(() => calcularDvNit("")).toThrow();
    expect(() => calcularDvNit("0000")).toThrow();
    expect(() => calcularDvNit("1234567890123456")).toThrow();
  });
});

describe("normalizarNit", () => {
  it("keeps digits and drops leading zeros", () => {
    expect(normalizarNit("900.123.456-7")).toBe("9001234567");
    expect(normalizarNit("0890123456")).toBe("890123456");
    expect(normalizarNit(" 52 123 456 ")).toBe("52123456");
  });
});
