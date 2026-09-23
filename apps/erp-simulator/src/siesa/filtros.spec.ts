import { describe, expect, it } from "vitest";
import { ErrorConsulta } from "./errores";
import { construirFiltros, ESQUEMA_CLIENTES, ESQUEMA_COMPANIAS, ESQUEMA_PROVEEDORES } from "./filtros";
import { parsearParametros } from "./parametros";

describe("construirFiltros", () => {
  it("splits conditions into tercero and row predicates with typed values", () => {
    const filtros = construirFiltros(
      parsearParametros("f200_id_cia = '7' AND f200_nit = 900222333 AND f202_ind_estado = 1"),
      ESQUEMA_PROVEEDORES,
    );
    expect(filtros).toEqual({
      tercero: [{ f200_id_cia: 7 }, { f200_nit: "900222333" }],
      fila: [{ f202_ind_estado: 1 }],
    });
  });

  it("turns >= into gte and parses dates", () => {
    const filtros = construirFiltros(parsearParametros("f200_fecha_actualizacion >= '2026-09-01'"), ESQUEMA_CLIENTES);
    expect(filtros.tercero).toEqual([{ f200_fecha_actualizacion: { gte: new Date("2026-09-01") } }]);
  });

  it("only allows the fields of each query", () => {
    expect(() => construirFiltros(parsearParametros("f201_ind_estado_activo = 1"), ESQUEMA_PROVEEDORES)).toThrow(ErrorConsulta);
    expect(() => construirFiltros(parsearParametros("f200_razon_social = 'x'"), ESQUEMA_CLIENTES)).toThrow(ErrorConsulta);
    expect(() => construirFiltros(parsearParametros("f200_nit = '1'"), ESQUEMA_COMPANIAS)).toThrow(ErrorConsulta);
  });

  it("rejects wrong types and >= on text", () => {
    expect(() => construirFiltros(parsearParametros("f200_id_cia = 'uno'"), ESQUEMA_PROVEEDORES)).toThrow(ErrorConsulta);
    expect(() => construirFiltros(parsearParametros("f200_nit >= '1'"), ESQUEMA_PROVEEDORES)).toThrow(ErrorConsulta);
    expect(() => construirFiltros(parsearParametros("f200_fecha_actualizacion >= 'ayer'"), ESQUEMA_PROVEEDORES)).toThrow(
      ErrorConsulta,
    );
  });
});
