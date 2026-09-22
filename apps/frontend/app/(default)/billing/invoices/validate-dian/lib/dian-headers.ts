/** Encabezados canónicos del reporte DIAN (orden y nombre exactos). */
export const DIAN_HEADERS = [
  "Tipo de documento",
  "CUFE/CUDE",
  "Folio",
  "Prefijo",
  "Divisa",
  "Forma de Pago",
  "Medio de Pago",
  "Fecha Emisión",
  "Fecha Recepción",
  "NIT Emisor",
  "Nombre Emisor",
  "NIT Receptor",
  "Nombre Receptor",
  "IVA",
  "ICA",
  "IC",
  "INC",
  "Timbre",
  "INC Bolsas",
  "IN Carbono",
  "IN Combustibles",
  "IC Datos",
  "ICL",
  "INPP",
  "IBUA",
  "ICUI",
  "Rete IVA",
  "Rete Renta",
  "Rete ICA",
  "Total",
  "Estado",
  "Grupo",
] as const;

export type DianHeader = (typeof DIAN_HEADERS)[number];

/** Columnas numéricas (IVA–Total inclusive). */
export const DIAN_NUMERIC_HEADERS = [
  "IVA",
  "ICA",
  "IC",
  "INC",
  "Timbre",
  "INC Bolsas",
  "IN Carbono",
  "IN Combustibles",
  "IC Datos",
  "ICL",
  "INPP",
  "IBUA",
  "ICUI",
  "Rete IVA",
  "Rete Renta",
  "Rete ICA",
  "Total",
] as const satisfies readonly DianHeader[];

export type DianNumericHeader = (typeof DIAN_NUMERIC_HEADERS)[number];

export const DIAN_NUMERIC_HEADER_SET = new Set<string>(DIAN_NUMERIC_HEADERS);

export const DIAN_HEADER_FACTURA_SISTEMA = "Factura en sistema";

export const MAX_DIAN_XLSX_BYTES = 25 * 1024 * 1024;
export const VALIDACION_DIAN_BATCH_SIZE = 250;
export const APPLICATION_RESPONSE_TIPO = "application response";

export type DianCellValue = string | number | null;

export type DianRow = Record<DianHeader, DianCellValue>;

export function normalizeHeaderKey(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

export const DIAN_HEADER_LOOKUP = new Map(
  DIAN_HEADERS.map((header) => [normalizeHeaderKey(header), header] as const)
);

export function isApplicationResponseTipo(value: DianCellValue): boolean {
  return (
    String(value ?? "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ") === APPLICATION_RESPONSE_TIPO
  );
}

export function getCufeTrimmed(row: DianRow): string {
  return String(row["CUFE/CUDE"] ?? "").trim();
}
