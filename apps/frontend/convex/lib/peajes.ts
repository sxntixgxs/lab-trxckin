export const PEAJES_NIT = "900000099";

export type PeajesDocumentoClase =
  | "factura"
  | "nota_credito"
  | "nota_debito"
  | "otro";

type PeajesDocumentoLike = {
  esPeaje?: boolean;
  proveedorNit?: string;
  documentoClase?: string;
  tipoDocumento?: string;
};

export function normalizePeajesProviderNit(value?: string) {
  const digits = (value ?? "").replace(/\D/g, "").replace(/^0+/, "");
  if (
    digits.length === PEAJES_NIT.length + 1 &&
    digits.startsWith(PEAJES_NIT)
  ) {
    return PEAJES_NIT;
  }
  return digits;
}

export function normalizePeajesDocumentNumber(value?: string) {
  return (value ?? "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]/g, "");
}

export function isPeajesProviderNit(_value?: string) {
  return false;
}

export function getPeajesDocumentoClase(
  documento: PeajesDocumentoLike
): PeajesDocumentoClase {
  if (documento.documentoClase) {
    return documento.documentoClase as PeajesDocumentoClase;
  }
  const tipo =
    documento.tipoDocumento === "1" ? "01" : (documento.tipoDocumento ?? "");
  if (tipo === "01") return "factura";
  if (tipo === "91") return "nota_credito";
  if (tipo === "92") return "nota_debito";
  return "otro";
}

export function isPeajesDocument(documento: PeajesDocumentoLike) {
  return (
    documento.esPeaje === true || isPeajesProviderNit(documento.proveedorNit)
  );
}

export function isPeajesFactura(documento: PeajesDocumentoLike) {
  return (
    isPeajesDocument(documento) &&
    getPeajesDocumentoClase(documento) === "factura"
  );
}

export function isPeajesNotaCredito(documento: PeajesDocumentoLike) {
  return (
    isPeajesDocument(documento) &&
    getPeajesDocumentoClase(documento) === "nota_credito"
  );
}
