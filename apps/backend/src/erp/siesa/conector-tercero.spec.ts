import { describe, expect, it } from "vitest";
import { codigoCondicionPago, construirDocumentoTercero } from "./conector-tercero";

describe("codigoCondicionPago", () => {
  it("maps the onboarding payment conditions to ERP codes", () => {
    expect(codigoCondicionPago("Anticipado", "NA")).toBe("ANT");
    expect(codigoCondicionPago("Contado", "NA")).toBe("CON");
    expect(codigoCondicionPago("Crédito", "30 días")).toBe("C30");
    expect(codigoCondicionPago("Crédito", "120 días")).toBe("C120");
    expect(codigoCondicionPago("Crédito", "45 días")).toBe("C30");
    expect(codigoCondicionPago(undefined, undefined)).toBe("CON");
  });
});

describe("construirDocumentoTercero", () => {
  it("builds a supplier document with the DV recomputed", () => {
    const { nit, documento } = construirDocumentoTercero(
      {
        entidad: "PROVEEDOR",
        tipoDocumento: "NIT",
        numeroDocumento: "900.123.456-1",
        tipoPersona: "PERSONA_JURIDICA",
        razonSocial: "  ACME Colombia S.A.S. ",
        email: "delivered+acme-contacto@resend.dev",
        ciudad: "Bucaramanga",
        codigoCiiu: "2599",
        formaPago: "Crédito",
        plazo: "60 días",
      },
      7,
    );
    expect(nit).toBe("900123456");
    expect(documento).toEqual({
      Inicial: [{ F_CIA: 7 }],
      Tercero: [
        {
          F200_ID: "900123456",
          F200_NIT: "900123456",
          F200_DV_NIT: "8",
          F200_ID_TIPO_IDENT: "N",
          F200_IND_TIPO_TERCERO: 2,
          F200_RAZON_SOCIAL: "ACME Colombia S.A.S.",
          F200_IND_CLIENTE: 0,
          F200_IND_PROVEEDOR: 1,
          F200_IND_ESTADO: 1,
          F200_ID_CIIU: "2599",
          F015_EMAIL: "delivered+acme-contacto@resend.dev",
          F015_TELEFONO: null,
          F015_DIRECCION1: null,
          F015_CIUDAD: "Bucaramanga",
          F015_DEPARTAMENTO: null,
        },
      ],
      Proveedor: [
        {
          F202_ID_SUCURSAL: "001",
          F202_DESCRIPCION_SUCURSAL: "ACME Colombia S.A.S.",
          F202_ID_COND_PAGO: "C60",
          F202_IND_ESTADO: 1,
        },
      ],
      Final: [{ F_CIA: 7 }],
    });
  });

  it("builds a customer document for a natural person without DV", () => {
    const { nit, documento } = construirDocumentoTercero(
      {
        entidad: "CLIENTE",
        tipoDocumento: "C.C.",
        numeroDocumento: "52.123.456",
        tipoPersona: "PERSONA_NATURAL",
        razonSocial: "María Fernanda Ruiz Castaño",
        formaPago: "Anticipado",
        plazo: "NA",
      },
      1,
    );
    expect(nit).toBe("52123456");
    expect(documento).toMatchObject({
      Tercero: [{ F200_DV_NIT: null, F200_ID_TIPO_IDENT: "C", F200_IND_TIPO_TERCERO: 1, F200_IND_CLIENTE: 1, F200_IND_PROVEEDOR: 0 }],
      Cliente: [{ F201_ID_SUCURSAL: "001", F201_ID_COND_PAGO: "ANT", F201_IND_ESTADO_ACTIVO: 1 }],
    });
    expect(documento).not.toHaveProperty("Proveedor");
  });
});
