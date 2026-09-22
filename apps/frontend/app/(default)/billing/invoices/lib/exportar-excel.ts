import * as ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import type { EmpresaInfo } from "@/lib/empresas";
import { getEmpresaNombre } from "@/lib/empresas";
import { FACTURACION_STATUS_LABELS } from "../../components/status-badge";
import { formatCausacionEstadoExport } from "@/lib/facturacion-causacion";

export type FacturaExportRow = {
  nit: string;
  proveedorNombre: string;
  cufe: string;
  numeroFactura: string;
  fechaEmision: string;
  estadoActual: string;
  empresa: number;
  facturaId: string;
  valorContable: number;
  cantidadCrucesDocumentosInternos: number;
  valorCrucesDocumentosInternos: number;
  baseCruceAnticipos: number;
  valorAPagar?: number;
  causado: boolean | null;
  numeroFp: string | null;
  responsablesActuales: Array<{
    userId: string | null;
    email: string;
    nombre: string;
    rol: string;
  }>;
  responsabilidadEstado: "con_responsable" | "sin_responsable" | "no_aplica";
};

export type CruceInternoExportRow = {
  empresa: number;
  facturaRecibida: string;
  proveedorNombre: string;
  numeroInterno: string;
  valorAplicado: number;
  moneda: string;
};

type ExportarFacturasExcelParams = {
  rows: FacturaExportRow[];
  crucesInternos?: CruceInternoExportRow[];
  empresaActiva: number | null;
  empresaActivaInfo?: EmpresaInfo;
  fechaEmisionDesde?: string;
  fechaEmisionHasta?: string;
};

const HEADER_FILL = "FF1E3A8A";
const HEADER_COLUMNS = [
  "NIT",
  "Nombre proveedor",
  "CUFE",
  "Numero de factura",
  "Fecha emision",
  "Estado actual",
  "Responsable actual",
  "Empresa",
  "Cantidad cruces internos",
  "Valor cruces internos",
  "Base para anticipos",
  "Valor a pagar",
  "Causado",
  "Numero FP",
] as const;

const CRUCES_HEADER_COLUMNS = [
  "Empresa",
  "Factura recibida",
  "Proveedor",
  "Numero interno",
  "Valor aplicado",
  "Moneda",
] as const;

function sanitizeFilenamePart(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._-]/g, "");
}

export function buildFacturasExportFilename({
  empresaActivaInfo,
  fechaEmisionDesde,
  fechaEmisionHasta,
}: Pick<
  ExportarFacturasExcelParams,
  "empresaActivaInfo" | "fechaEmisionDesde" | "fechaEmisionHasta"
>) {
  const empresaPart = empresaActivaInfo
    ? sanitizeFilenamePart(empresaActivaInfo.nombreCorto)
    : "todas-empresas";
  const desde = fechaEmisionDesde ? sanitizeFilenamePart(fechaEmisionDesde) : "inicio";
  const hasta = fechaEmisionHasta ? sanitizeFilenamePart(fechaEmisionHasta) : "fin";
  return `facturas-${empresaPart}-${desde}-${hasta}.xlsx`;
}

function styleHeaderRow(row: ExcelJS.Row) {
  row.height = 22;
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: HEADER_FILL },
    };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: "FFD1D5DB" } },
      left: { style: "thin", color: { argb: "FFD1D5DB" } },
      bottom: { style: "thin", color: { argb: "FFD1D5DB" } },
      right: { style: "thin", color: { argb: "FFD1D5DB" } },
    };
  });
}

function styleDataRow(row: ExcelJS.Row, index: number) {
  const fill = index % 2 === 0 ? "FFFFFFFF" : "FFF8FAFC";
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

export async function exportarFacturasExcel({
  rows,
  crucesInternos = [],
  empresaActivaInfo,
  fechaEmisionDesde,
  fechaEmisionHasta,
}: ExportarFacturasExcelParams): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Trxckin";
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet("Facturas");
  worksheet.columns = [
    { width: 16 },
    { width: 34 },
    { width: 44 },
    { width: 18 },
    { width: 14 },
    { width: 24 },
    { width: 36 },
    { width: 18 },
    { width: 18 },
    { width: 18 },
    { width: 18 },
    { width: 16 },
    { width: 16 },
    { width: 18 },
  ];

  const headerRow = worksheet.addRow([...HEADER_COLUMNS]);
  styleHeaderRow(headerRow);

  rows.forEach((row, index) => {
    const dataRow = worksheet.addRow([
      row.nit,
      row.proveedorNombre,
      row.cufe,
      row.numeroFactura,
      row.fechaEmision,
      row.estadoActual ? (FACTURACION_STATUS_LABELS[row.estadoActual] ?? row.estadoActual) : "",
      row.responsablesActuales.length > 0
        ? row.responsablesActuales.map((responsable) => responsable.nombre).join("; ")
        : row.responsabilidadEstado === "sin_responsable"
          ? "Sin responsable"
          : "",
      getEmpresaNombre(row.empresa),
      row.cantidadCrucesDocumentosInternos,
      row.valorCrucesDocumentosInternos,
      row.baseCruceAnticipos,
      row.valorAPagar ?? "",
      formatCausacionEstadoExport(row.causado),
      row.causado === true ? (row.numeroFp ?? "") : "",
    ]);
    styleDataRow(dataRow, index);
    dataRow.getCell(14).numFmt = "@";
  });

  worksheet.views = [{ state: "frozen", ySplit: 1 }];
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: HEADER_COLUMNS.length },
  };

  if (crucesInternos.length > 0) {
    const crucesSheet = workbook.addWorksheet("Cruces internos");
    crucesSheet.columns = [
      { width: 16 },
      { width: 20 },
      { width: 34 },
      { width: 22 },
      { width: 16 },
      { width: 10 },
    ];
    const crucesHeader = crucesSheet.addRow([...CRUCES_HEADER_COLUMNS]);
    styleHeaderRow(crucesHeader);
    crucesInternos.forEach((row, index) => {
      const dataRow = crucesSheet.addRow([
        getEmpresaNombre(row.empresa),
        row.facturaRecibida,
        row.proveedorNombre,
        row.numeroInterno,
        row.valorAplicado,
        row.moneda,
      ]);
      styleDataRow(dataRow, index);
    });
    crucesSheet.views = [{ state: "frozen", ySplit: 1 }];
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  saveAs(
    blob,
    buildFacturasExportFilename({
      empresaActivaInfo,
      fechaEmisionDesde,
      fechaEmisionHasta,
    })
  );
}
