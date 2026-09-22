import * as ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { getAppUrl } from "../../../../../../lib/app-env";
import type { EmpresaInfo } from "@/lib/empresas";
import {
  DIAN_HEADER_FACTURA_SISTEMA,
  DIAN_HEADERS,
  DIAN_NUMERIC_HEADER_SET,
  type DianHeader,
} from "./dian-headers";
import type { ComparedDianRow } from "./compare-dian-rows";

const HEADER_FILL = "FF348441";

export type ExportValidacionDianParams = {
  encontradas: ComparedDianRow[];
  noEncontradas: ComparedDianRow[];
  empresaActiva: number | null;
  empresaActivaInfo?: EmpresaInfo;
};

function sanitizeFilenamePart(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._-]/g, "");
}

function formatDateForFilename(date = new Date()) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function buildValidacionDianFilename({
  empresaActivaInfo,
  date = new Date(),
}: {
  empresaActivaInfo?: EmpresaInfo;
  date?: Date;
}) {
  const empresaPart = empresaActivaInfo
    ? sanitizeFilenamePart(empresaActivaInfo.nombreCorto)
    : "todas";
  return `validacion-facturas-dian-${empresaPart}-${formatDateForFilename(date)}.xlsx`;
}

function styleHeaderRow(row: ExcelJS.Row) {
  row.height = 22;
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: HEADER_FILL },
    };
    cell.alignment = {
      vertical: "middle",
      horizontal: "center",
      wrapText: true,
    };
    cell.border = {
      top: { style: "thin", color: { argb: "FFD1D5DB" } },
      left: { style: "thin", color: { argb: "FFD1D5DB" } },
      bottom: { style: "thin", color: { argb: "FFD1D5DB" } },
      right: { style: "thin", color: { argb: "FFD1D5DB" } },
    };
  });
}

function styleDataRow(row: ExcelJS.Row, index: number) {
  const fill = index % 2 === 0 ? "FFFFFFFF" : "FFF3F4F6";
  row.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: fill },
    };
    cell.border = {
      top: { style: "thin", color: { argb: "FFE2E8F0" } },
      left: { style: "thin", color: { argb: "FFE2E8F0" } },
      bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
      right: { style: "thin", color: { argb: "FFE2E8F0" } },
    };
    cell.alignment = { vertical: "top", wrapText: true };
  });
}

function columnWidths(columnCount: number): Array<{ width: number }> {
  return Array.from({ length: columnCount }, (_, index) => {
    if (index === 0) return { width: 28 };
    if (index === 1) return { width: 44 };
    if (index === columnCount - 1 && columnCount > DIAN_HEADERS.length) {
      return { width: 36 };
    }
    return { width: 16 };
  });
}

function cellValueForHeader(
  row: ComparedDianRow["row"],
  header: DianHeader
): string | number {
  const value = row[header];
  if (DIAN_NUMERIC_HEADER_SET.has(header)) {
    return typeof value === "number" && Number.isFinite(value) ? value : "";
  }
  return value === null || value === undefined ? "" : String(value);
}

function addSheet(
  workbook: ExcelJS.Workbook,
  name: string,
  headers: string[],
  rows: ComparedDianRow[],
  options?: { includeFacturaLink?: boolean }
) {
  const worksheet = workbook.addWorksheet(name);
  worksheet.columns = columnWidths(headers.length);

  const headerRow = worksheet.addRow(headers);
  styleHeaderRow(headerRow);

  rows.forEach((item, index) => {
    const values = DIAN_HEADERS.map((header) =>
      cellValueForHeader(item.row, header)
    );
    if (options?.includeFacturaLink) {
      values.push(item.facturaId ?? "");
    }
    const dataRow = worksheet.addRow(values);
    styleDataRow(dataRow, index);

    if (options?.includeFacturaLink && item.facturaId) {
      const linkCell = dataRow.getCell(headers.length);
      const url = `${getAppUrl()}/billing/invoices/${item.facturaId}`;
      linkCell.value = {
        text: item.facturaId,
        hyperlink: url,
      };
      linkCell.font = { color: { argb: "FF0563C1" }, underline: true };
    }
  });

  worksheet.views = [{ state: "frozen", ySplit: 1 }];
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: headers.length },
  };
}

export async function buildValidacionDianWorkbook({
  encontradas,
  noEncontradas,
}: Pick<
  ExportValidacionDianParams,
  "encontradas" | "noEncontradas"
>): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Trxckin";
  workbook.created = new Date();

  addSheet(
    workbook,
    "Encontradas",
    [...DIAN_HEADERS, DIAN_HEADER_FACTURA_SISTEMA],
    encontradas,
    { includeFacturaLink: true }
  );
  addSheet(workbook, "No encontradas", [...DIAN_HEADERS], noEncontradas);

  return workbook;
}

export async function exportValidacionDianXlsx(
  params: ExportValidacionDianParams
): Promise<void> {
  const workbook = await buildValidacionDianWorkbook(params);
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  saveAs(
    blob,
    buildValidacionDianFilename({
      empresaActivaInfo: params.empresaActivaInfo,
    })
  );
}
