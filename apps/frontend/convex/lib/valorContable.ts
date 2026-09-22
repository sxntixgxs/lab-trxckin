import type { Doc } from "../_generated/dataModel";
import { getPeajesDocumentoClase } from "./peajes";

export const FASES_EDICION_VALOR_CONTABLE = [
  "causacion",
  "revision_impuestos",
  "eventos_dian",
] as const;

export const FASES_EDICION_VALOR_CONTABLE_LEGALIZACION_ANTICIPO = [
  "causacion",
  "revision_impuestos",
] as const;

export type ValorContableCambio = {
  valorAnterior: number;
  valorNuevo: number;
  moneda: string;
};

export function getValorContable(
  factura: Pick<Doc<"facturacionFacturas">, "valorContable" | "total">
) {
  return factura.valorContable ?? factura.total;
}

export function getValorContableAnticipo(
  anticipo: Pick<Doc<"anticipos">, "valorContable" | "valorNumerico">
) {
  return anticipo.valorContable ?? anticipo.valorNumerico;
}

function getClaseFactura(factura: Doc<"facturacionFacturas">) {
  if (factura.documentoClase) return factura.documentoClase;
  return getPeajesDocumentoClase({
    tipoDocumento: factura.tipoDocumentoNormalizado ?? factura.tipoDocumento,
  });
}

export function isFacturaNormalParaValorContable(
  factura: Doc<"facturacionFacturas">
) {
  return (
    getClaseFactura(factura) === "factura" &&
    !factura.esLegalizacionAnticipo &&
    !factura.esLegalizacionCajaMenor &&
    !factura.esPeaje &&
    factura.rolOperacion !== "PEAJES"
  );
}

export function isFacturaLegalizacionAnticipoParaValorContable(
  factura: Doc<"facturacionFacturas">
) {
  return (
    factura.esLegalizacionAnticipo === true &&
    !factura.esLegalizacionCajaMenor &&
    !factura.esPeaje &&
    factura.rolOperacion !== "PEAJES"
  );
}

export function puedeEditarValorContable(
  fase: string,
  factura: Doc<"facturacionFacturas">
) {
  if (isFacturaLegalizacionAnticipoParaValorContable(factura)) {
    return (
      FASES_EDICION_VALOR_CONTABLE_LEGALIZACION_ANTICIPO as readonly string[]
    ).includes(fase);
  }
  return (
    (FASES_EDICION_VALOR_CONTABLE as readonly string[]).includes(fase) &&
    isFacturaNormalParaValorContable(factura)
  );
}

export function valorContableFueModificadoPorUsuario(
  factura: Doc<"facturacionFacturas">
) {
  if (factura.valorContableActualizadoEn !== undefined) return true;
  return (
    factura.valorContable !== undefined &&
    factura.valorContable !== factura.total
  );
}

export function resolverValorContableEnReimportacion(
  existing: Doc<"facturacionFacturas">,
  nuevoTotal: number
) {
  if (valorContableFueModificadoPorUsuario(existing)) {
    return existing.valorContable;
  }
  if (
    existing.valorContable === undefined ||
    existing.valorContable === existing.total
  ) {
    return nuevoTotal;
  }
  return existing.valorContable;
}

export function valorContableInicialParaInsert(
  factura: Pick<
    Doc<"facturacionFacturas">,
    | "total"
    | "documentoClase"
    | "tipoDocumento"
    | "tipoDocumentoNormalizado"
    | "esLegalizacionAnticipo"
    | "esLegalizacionCajaMenor"
    | "esPeaje"
    | "rolOperacion"
  >
) {
  if (
    isFacturaNormalParaValorContable(factura as Doc<"facturacionFacturas">) ||
    isFacturaLegalizacionAnticipoParaValorContable(
      factura as Doc<"facturacionFacturas">
    )
  ) {
    return factura.total;
  }
  return undefined;
}
