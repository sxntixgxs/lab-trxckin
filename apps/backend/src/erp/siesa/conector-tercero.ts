import { esTipoNit, separarNitYDv } from "../../common/nit";

/** App data needed to register a tercero in the ERP (built by the BFF from the Convex inscription). */
export type DatosTerceroErp = {
  entidad: "PROVEEDOR" | "CLIENTE";
  tipoDocumento: string;
  numeroDocumento: string;
  tipoPersona: "PERSONA_JURIDICA" | "PERSONA_NATURAL";
  razonSocial: string;
  email?: string | null;
  telefono?: string | null;
  direccion?: string | null;
  ciudad?: string | null;
  departamento?: string | null;
  codigoCiiu?: string | null;
  formaPago?: string | null;
  plazo?: string | null;
};

const CODIGO_IDENTIFICACION: Readonly<Record<string, "N" | "C" | "E" | "P">> = {
  NIT: "N",
  "C.C.": "C",
  "C.E": "E",
  "P.A.": "P",
};

const PLAZOS_CREDITO = ["15", "30", "60", "90", "120"];

/**
 * ERP payment-term code from the onboarding payment conditions: Anticipado → ANT,
 * Contado → CON, Crédito + "30 días" → C30. Unknown or missing → CON; credit without a known
 * term → C30.
 */
export function codigoCondicionPago(formaPago?: string | null, plazo?: string | null): string {
  const forma = (formaPago ?? "").trim().toLowerCase();
  if (forma.startsWith("anticip")) return "ANT";
  if (!forma.startsWith("cr")) return "CON";
  const dias = /(\d+)/.exec(plazo ?? "")?.[1];
  return dias && PLAZOS_CREDITO.includes(dias) ? `C${dias}` : "C30";
}

/** Branch every newly registered tercero gets, as SIESA's defaults do. */
export const SUCURSAL_PRINCIPAL = "001";

function recortar(valor: string | null | undefined, maximo: number): string | null {
  const limpio = valor?.trim();
  return limpio ? limpio.slice(0, maximo) : null;
}

/**
 * `conectoresimportar` document for "tercero + proveedor/cliente": the tercero (with its DV
 * recomputed for NIT) and branch 001 as supplier or customer. Returns the document number sent,
 * without DV.
 */
export function construirDocumentoTercero(datos: DatosTerceroErp, cia: number): { nit: string; documento: unknown } {
  const { nit, dv } = separarNitYDv(datos.numeroDocumento, datos.tipoDocumento);
  const razonSocial = datos.razonSocial.trim().slice(0, 120);
  const esProveedor = datos.entidad === "PROVEEDOR";
  const sucursal = {
    [esProveedor ? "F202_ID_SUCURSAL" : "F201_ID_SUCURSAL"]: SUCURSAL_PRINCIPAL,
    [esProveedor ? "F202_DESCRIPCION_SUCURSAL" : "F201_DESCRIPCION_SUCURSAL"]: razonSocial,
    [esProveedor ? "F202_ID_COND_PAGO" : "F201_ID_COND_PAGO"]: codigoCondicionPago(datos.formaPago, datos.plazo),
    [esProveedor ? "F202_IND_ESTADO" : "F201_IND_ESTADO_ACTIVO"]: 1,
  };

  return {
    nit,
    documento: {
      Inicial: [{ F_CIA: cia }],
      Tercero: [
        {
          F200_ID: nit,
          F200_NIT: nit,
          F200_DV_NIT: esTipoNit(datos.tipoDocumento) ? dv : null,
          F200_ID_TIPO_IDENT: CODIGO_IDENTIFICACION[datos.tipoDocumento] ?? "N",
          F200_IND_TIPO_TERCERO: datos.tipoPersona === "PERSONA_NATURAL" ? 1 : 2,
          F200_RAZON_SOCIAL: razonSocial,
          // Registering one role never removes the other: the ERP keeps the flags it already has.
          F200_IND_CLIENTE: esProveedor ? 0 : 1,
          F200_IND_PROVEEDOR: esProveedor ? 1 : 0,
          F200_IND_ESTADO: 1,
          F200_ID_CIIU: recortar(datos.codigoCiiu, 10),
          F015_EMAIL: recortar(datos.email, 120),
          F015_TELEFONO: recortar(datos.telefono, 40),
          F015_DIRECCION1: recortar(datos.direccion, 160),
          F015_CIUDAD: recortar(datos.ciudad, 80),
          F015_DEPARTAMENTO: recortar(datos.departamento, 80),
        },
      ],
      [esProveedor ? "Proveedor" : "Cliente"]: [sucursal],
      Final: [{ F_CIA: cia }],
    },
  };
}
