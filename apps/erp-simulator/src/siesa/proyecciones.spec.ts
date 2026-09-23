import { describe, expect, it } from "vitest";
import { filaCliente, filaProveedor, type TerceroBD } from "./proyecciones";

const tercero: TerceroBD = {
  f200_rowid: 12,
  f200_id_cia: 1,
  f200_id: "900222333",
  f200_nit: "900222333",
  f200_dv_nit: "5",
  f200_id_tipo_ident: "N",
  f200_ind_tipo_tercero: 2,
  f200_razon_social: "Distribuidora Andina del Norte S.A.S.",
  f200_nombres: null,
  f200_apellido1: null,
  f200_apellido2: null,
  f200_ind_cliente: 0,
  f200_ind_proveedor: 1,
  f200_ind_estado: 1,
  f200_id_ciiu: "4663",
  f200_fecha_creacion: new Date("2026-09-01T10:00:00.000Z"),
  f200_fecha_actualizacion: new Date("2026-09-02T11:30:00.000Z"),
};

const contacto = {
  f015_email: "compras@distribuidora-andina.example.com",
  f015_telefono: null,
  f015_direccion1: "Calle 13 # 68-45",
  f015_ciudad: "Bogotá D.C.",
  f015_departamento: "Bogotá D.C.",
};

describe("proyecciones", () => {
  it("flattens a supplier branch with its tercero like API_v2_Proveedores", () => {
    const fila = filaProveedor({
      tercero,
      f202_id_sucursal: "002",
      f202_descripcion_sucursal: "Distribuidora Andina del Norte S.A.S. - Medellín",
      f202_ind_estado: 1,
      f202_id_cond_pago: "C60",
      f202_id_tipo_prov: "001",
      ...contacto,
    });
    expect(fila).toMatchObject({
      f200_rowid: 12,
      f200_nit: "900222333",
      f200_dv_nit: "5",
      f202_id_sucursal: "002",
      f202_descripcion_sucursal: "Distribuidora Andina del Norte S.A.S. - Medellín",
      f015_telefono: null,
      f200_fecha_actualizacion: "2026-09-02T11:30:00.000Z",
    });
    expect(Object.keys(fila).some((k) => k.startsWith("f201_"))).toBe(false);
  });

  it("flattens a customer branch like API_v2_Clientes", () => {
    const fila = filaCliente({
      tercero: { ...tercero, f200_ind_cliente: 1 },
      f201_id_sucursal: "001",
      f201_descripcion_sucursal: "Distribuidora Andina del Norte S.A.S.",
      f201_ind_estado_activo: 0,
      f201_id_cond_pago: "C30",
      ...contacto,
    });
    expect(fila).toMatchObject({ f200_ind_cliente: 1, f201_id_sucursal: "001", f201_ind_estado_activo: 0 });
    expect(Object.keys(fila).some((k) => k.startsWith("f202_"))).toBe(false);
  });
});
