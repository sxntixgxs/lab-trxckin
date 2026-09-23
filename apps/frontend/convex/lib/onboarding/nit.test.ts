import { describe, expect, test } from "vitest";
import { calcularDvNit, candidatosNumeroDocumento } from "./nit";

// Mismos vectores que el backend (apps/backend/src/common/nit.spec.ts) y el simulador del ERP.
describe("calcularDvNit", () => {
  test("calcula el dígito de verificación de la DIAN", () => {
    expect(calcularDvNit("900123456")).toBe("8");
    expect(calcularDvNit("890903938")).toBe("8");
    expect(calcularDvNit("0890123456")).toBe(calcularDvNit("890123456"));
  });
});

describe("candidatosNumeroDocumento", () => {
  test("un NIT sin DV también se busca con su DV calculado", () => {
    expect(candidatosNumeroDocumento("900.123.456", "NIT").sort()).toEqual(["900123456", "9001234568"].sort());
  });

  test("un NIT con DV válido también se busca sin él", () => {
    expect(candidatosNumeroDocumento("900.123.456-8", "NIT").sort()).toEqual(["900123456", "9001234568"].sort());
  });

  test("los ceros a la izquierda cuentan como el mismo documento", () => {
    expect(candidatosNumeroDocumento("0890123456", "NIT")).toEqual(
      expect.arrayContaining(["0890123456", "890123456", `890123456${calcularDvNit("890123456")}`]),
    );
  });

  test("a una cédula nunca se le quita ni agrega un dígito", () => {
    expect(candidatosNumeroDocumento("9001234568", "C.C.")).toEqual(["9001234568"]);
    expect(candidatosNumeroDocumento("52.123.456")).toEqual(["52123456"]);
  });

  test("sin dígitos no hay candidatos", () => {
    expect(candidatosNumeroDocumento("---", "NIT")).toEqual([]);
  });
});
