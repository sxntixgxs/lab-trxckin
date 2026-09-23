import { describe, expect, it } from "vitest";
import { ErrorConsulta } from "./errores";
import { parsearParametros } from "./parametros";

describe("parsearParametros", () => {
  it("returns no conditions for an empty filter", () => {
    expect(parsearParametros(undefined)).toEqual([]);
    expect(parsearParametros("   ")).toEqual([]);
  });

  it("parses numbers, single-quoted and doubled-quoted strings", () => {
    expect(parsearParametros("f200_id_cia = 7")).toEqual([{ campo: "f200_id_cia", operador: "=", valor: 7 }]);
    expect(parsearParametros("f200_nit = '900222333'")).toEqual([{ campo: "f200_nit", operador: "=", valor: "900222333" }]);
    expect(parsearParametros("f200_nit = ''900222333''")).toEqual([{ campo: "f200_nit", operador: "=", valor: "900222333" }]);
  });

  it("combines conditions with AND, case-insensitively", () => {
    expect(parsearParametros("F200_ID_CIA=1 and f200_fecha_actualizacion >= '2026-09-01'")).toEqual([
      { campo: "f200_id_cia", operador: "=", valor: 1 },
      { campo: "f200_fecha_actualizacion", operador: ">=", valor: "2026-09-01" },
    ]);
  });

  it("rejects anything outside the grammar", () => {
    for (const valor of [
      "f200_nit",
      "f200_nit = ",
      "f200_nit = 900 OR 1 = 1",
      "f200_nit = '900'; DROP TABLE x",
      "f200_nit LIKE '9%'",
      "f200_id_cia = 1 AND",
      "f200_id_cia = 1 f200_nit = '2'",
      "f200_nit = 'it''s'",
    ]) {
      expect(() => parsearParametros(valor), valor).toThrow(ErrorConsulta);
    }
  });
});
