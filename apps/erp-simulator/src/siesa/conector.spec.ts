import { describe, expect, it } from "vitest";
import { calcularDvNit } from "../datos/nit";
import { validarImportacion } from "./conector";

function documento(overrides: Record<string, unknown> = {}) {
  return {
    Inicial: [{ F_CIA: 1 }],
    Tercero: [
      {
        F200_ID: "900123456",
        F200_NIT: "900123456",
        F200_DV_NIT: calcularDvNit("900123456"),
        F200_ID_TIPO_IDENT: "N",
        F200_IND_TIPO_TERCERO: 2,
        F200_RAZON_SOCIAL: "ACME Colombia S.A.S.",
        F200_IND_CLIENTE: 0,
        F200_IND_PROVEEDOR: 1,
        F200_ID_CIIU: "2599",
        F015_EMAIL: "delivered+acme-contacto@resend.dev",
        F015_CIUDAD: "Bucaramanga",
      },
    ],
    Proveedor: [{ F202_ID_SUCURSAL: "001", F202_DESCRIPCION_SUCURSAL: "ACME Colombia S.A.S.", F202_ID_COND_PAGO: "C30" }],
    Final: [{ F_CIA: 1 }],
    ...overrides,
  };
}

describe("validarImportacion", () => {
  it("accepts a tercero with a supplier branch", () => {
    const resultado = validarImportacion(documento());
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.datos.cia).toBe(1);
    expect(resultado.datos.tercero).toMatchObject({
      nit: "900123456",
      dv: "8",
      tipoIdentificacion: "N",
      esProveedor: true,
      esCliente: false,
      activo: true,
      contacto: { email: "delivered+acme-contacto@resend.dev", ciudad: "Bucaramanga", telefono: null },
    });
    expect(resultado.datos.proveedor).toEqual([
      { id: "001", descripcion: "ACME Colombia S.A.S.", activa: true, condicionPago: "C30", tipoProveedor: null },
    ]);
    expect(resultado.datos.cliente).toEqual([]);
  });

  it("accepts string indicators and a natural person without DV", () => {
    const resultado = validarImportacion(
      documento({
        Tercero: [
          {
            F200_ID: "52123456",
            F200_NIT: "52123456",
            F200_ID_TIPO_IDENT: "C",
            F200_IND_TIPO_TERCERO: "1",
            F200_RAZON_SOCIAL: "María Fernanda Ruiz Castaño",
            F200_IND_CLIENTE: "1",
            F200_IND_PROVEEDOR: "0",
          },
        ],
        Proveedor: undefined,
        Cliente: [{ F201_ID_SUCURSAL: "001", F201_DESCRIPCION_SUCURSAL: "María Fernanda Ruiz Castaño" }],
      }),
    );
    expect(resultado.ok).toBe(true);
    if (resultado.ok) expect(resultado.datos.tercero).toMatchObject({ dv: null, tipoTercero: 1, esCliente: true });
  });

  it("reports a wrong DV and mismatching indicators", () => {
    const resultado = validarImportacion(
      documento({
        Tercero: [{ ...documento().Tercero[0], F200_DV_NIT: "1", F200_IND_PROVEEDOR: 0 }],
      }),
    );
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.errores.map((e) => e.campo)).toEqual(expect.arrayContaining(["F200_DV_NIT", "F200_IND_PROVEEDOR"]));
  });

  it("collects structural errors", () => {
    const resultado = validarImportacion({
      Inicial: [{ F_CIA: 1 }],
      Tercero: [
        {
          F200_ID: "",
          F200_NIT: "12",
          F200_ID_TIPO_IDENT: "X",
          F200_IND_TIPO_TERCERO: 3,
          F200_RAZON_SOCIAL: "",
          F200_IND_CLIENTE: 2,
          F200_IND_PROVEEDOR: 1,
        },
      ],
      Proveedor: [
        { F202_ID_SUCURSAL: "1", F202_DESCRIPCION_SUCURSAL: "x", F202_ID_COND_PAGO: "C45" },
        { F202_ID_SUCURSAL: "1", F202_DESCRIPCION_SUCURSAL: "" },
      ],
      Final: [{ F_CIA: 2 }],
    });
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    const campos = resultado.errores.map((e) => `${e.nivel}.${e.campo}`);
    expect(campos).toEqual(
      expect.arrayContaining([
        "Final.F_CIA",
        "Tercero.F200_ID_TIPO_IDENT",
        "Tercero.F200_NIT",
        "Tercero.F200_ID",
        "Tercero.F200_IND_TIPO_TERCERO",
        "Tercero.F200_RAZON_SOCIAL",
        "Tercero.F200_IND_CLIENTE",
        "Proveedor.F202_ID_SUCURSAL",
        "Proveedor.F202_ID_COND_PAGO",
        "Proveedor.F202_DESCRIPCION_SUCURSAL",
      ]),
    );
  });

  it("requires at least one branch and a single tercero", () => {
    expect(validarImportacion(documento({ Proveedor: undefined })).ok).toBe(false);
    expect(validarImportacion(documento({ Tercero: [] })).ok).toBe(false);
    expect(validarImportacion("texto").ok).toBe(false);
  });
});
