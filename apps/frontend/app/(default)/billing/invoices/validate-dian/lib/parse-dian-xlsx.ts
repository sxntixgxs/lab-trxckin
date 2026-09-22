import * as ExcelJS from "exceljs";
import {
  DIAN_HEADER_LOOKUP,
  DIAN_HEADERS,
  DIAN_NUMERIC_HEADER_SET,
  MAX_DIAN_XLSX_BYTES,
  type DianCellValue,
  type DianHeader,
  type DianRow,
  normalizeHeaderKey,
} from "./dian-headers";

export type ParseDianXlsxResult = {
  sheetName: string;
  rows: DianRow[];
};

export class DianXlsxParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DianXlsxParseError";
  }
}

function cellToText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "";
    // Evitar notación científica en identificadores numéricos leídos como number.
    if (Number.isInteger(value) && Math.abs(value) >= 1e15) {
      return value.toLocaleString("fullwide", { useGrouping: false });
    }
    return String(value);
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value).trim();
}

function cellToNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "boolean") return value ? 1 : 0;

  const raw = String(value).trim();
  if (!raw) return null;

  // Formatos locales: "1.234.567,89" o "1,234,567.89"
  const normalized = raw.includes(",") && raw.includes(".")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw.includes(",")
      ? raw.replace(",", ".")
      : raw;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function isRowEmpty(cells: unknown[]): boolean {
  return cells.every((cell) => {
    if (cell === null || cell === undefined) return true;
    if (typeof cell === "string") return cell.trim() === "";
    return false;
  });
}

function mapHeaderRow(headerRow: unknown[]): Map<DianHeader, number> | null {
  const mapping = new Map<DianHeader, number>();
  headerRow.forEach((cell, index) => {
    const canonical = DIAN_HEADER_LOOKUP.get(normalizeHeaderKey(cell));
    if (canonical && !mapping.has(canonical)) {
      mapping.set(canonical, index);
    }
  });
  if (mapping.size !== DIAN_HEADERS.length) return null;
  return mapping;
}

function buildRow(
  cells: unknown[],
  mapping: Map<DianHeader, number>
): DianRow {
  const row = {} as DianRow;
  for (const header of DIAN_HEADERS) {
    const index = mapping.get(header);
    const raw = typeof index === "number" ? cells[index] : null;
    const value: DianCellValue = DIAN_NUMERIC_HEADER_SET.has(header)
      ? cellToNumber(raw)
      : cellToText(raw);
    row[header] = value;
  }
  return row;
}

/** Flattens ExcelJS cell values (formulas, rich text, hyperlinks, errors) to plain values. */
function normalizeExcelCell(value: ExcelJS.CellValue | undefined): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  if (typeof value !== "object") return value;
  if ("richText" in value) return value.richText.map((part) => part.text).join("");
  if ("error" in value) return null;
  if ("formula" in value || "sharedFormula" in value) {
    return normalizeExcelCell((value as ExcelJS.CellFormulaValue).result as ExcelJS.CellValue);
  }
  if ("text" in value) return value.text;
  return null;
}

function worksheetToMatrix(worksheet: ExcelJS.Worksheet): unknown[][] {
  const matrix: unknown[][] = [];
  worksheet.eachRow({ includeEmpty: false }, (row) => {
    const cells: unknown[] = [];
    for (let column = 1; column <= row.cellCount; column += 1) {
      cells.push(normalizeExcelCell(row.getCell(column).value));
    }
    if (!isRowEmpty(cells)) matrix.push(cells);
  });
  return matrix;
}

export async function parseDianXlsxBuffer(buffer: ArrayBuffer): Promise<ParseDianXlsxResult> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch {
    throw new DianXlsxParseError(
      "No se pudo leer el archivo. Verifica que sea un .xlsx válido."
    );
  }

  for (const worksheet of workbook.worksheets) {
    const matrix = worksheetToMatrix(worksheet);
    if (matrix.length === 0) continue;

    const headerRow = matrix[0] ?? [];
    const mapping = mapHeaderRow(headerRow);
    if (!mapping) continue;

    const rows: DianRow[] = [];
    for (const cells of matrix.slice(1)) {
      rows.push(buildRow(cells, mapping));
    }

    return { sheetName: worksheet.name, rows };
  }

  throw new DianXlsxParseError(
    "Ninguna hoja contiene los 32 encabezados DIAN requeridos."
  );
}

export async function parseDianXlsxFile(file: File): Promise<ParseDianXlsxResult> {
  const name = file.name.trim().toLowerCase();
  if (!name.endsWith(".xlsx")) {
    throw new DianXlsxParseError("Solo se aceptan archivos .xlsx.");
  }
  if (file.size <= 0) {
    throw new DianXlsxParseError("El archivo está vacío.");
  }
  if (file.size > MAX_DIAN_XLSX_BYTES) {
    throw new DianXlsxParseError("El archivo supera el límite de 25 MB.");
  }

  const buffer = await file.arrayBuffer();
  return parseDianXlsxBuffer(buffer);
}
