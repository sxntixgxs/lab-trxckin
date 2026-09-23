import { describe, expect, it } from "vitest";
import { mapearFila, valorFila } from "./siesa-filas";

const filaProveedor = {
  f200_rowid: 12,
  f200_id_cia: 1,
  f200_id: "900222333",
  F200_NIT: " 0900222333 ",
  f200_dv_nit: "5",
  f200_id_tipo_ident: "n",
  f200_ind_tipo_tercero: 2,
  f200_razon_social: "Distribuidora Andina del Norte S.A.S.",
  f200_ind_estado: 1,
  f202_id_sucursal: "002",
  f202_descripcion_sucursal: "Distribuidora Andina del Norte S.A.S. - Medellín",
  f202_ind_estado: 0,
  f202_id_cond_pago: "C60",
  f015_email: "medellin@distribuidora-andina.example.com",
  f015_telefono: null,
  f015_ciudad: "Medellín",
};

describe("valorFila", () => {
  it("reads columns case-insensitively and skips empty values", () => {
    expect(valorFila({ F200_NIT: " 123 " }, "f200_nit")).toBe("123");
    expect(valorFila({ a: "", b: "x" }, "a", "b")).toBe("x");
    expect(valorFila({ a: null }, "a")).toBe("");
  });
});

describe("mapearFila", () => {
  it("maps a supplier branch row", () => {
    expect(mapearFila("PROVEEDORES", filaProveedor, 1)).toEqual({
      id_empresa: 1,
      erp_tercero_id: "900222333",
      nit: "900222333",
      dv: "5",
      tipo_documento: "NIT",
      tipo_persona: "PERSONA_JURIDICA",
      razon_social: "Distribuidora Andina del Norte S.A.S.",
      sucursal_id: "002",
      descripcion_sucursal: "Distribuidora Andina del Norte S.A.S. - Medellín",
      tercero_activo: true,
      activo: false,
      condicion_pago: "C60",
      email: "medellin@distribuidora-andina.example.com",
      telefono: null,
      direccion: null,
      ciudad: "Medellín",
      departamento: null,
    });
  });

  it("maps a customer row of a natural person", () => {
    const registro = mapearFila(
      "CLIENTES",
      {
        f200_id: "52123456",
        f200_nit: "52123456",
        f200_id_tipo_ident: "C",
        f200_ind_tipo_tercero: "1",
        f200_razon_social: "María Fernanda Ruiz Castaño",
        f200_ind_estado: "0",
        f201_id_sucursal: "001",
        f201_descripcion_sucursal: "María Fernanda Ruiz Castaño",
        f201_ind_estado_activo: 1,
      },
      2,
    );
    expect(registro).toMatchObject({
      id_empresa: 2,
      tipo_documento: "C.C.",
      tipo_persona: "PERSONA_NATURAL",
      dv: null,
      tercero_activo: false,
      activo: true,
      condicion_pago: null,
    });
  });

  it("skips rows it cannot key", () => {
    expect(mapearFila("PROVEEDORES", { f200_nit: "900222333" }, 1)).toBeNull();
    expect(mapearFila("CLIENTES", { f201_id_sucursal: "001" }, 1)).toBeNull();
  });
});
