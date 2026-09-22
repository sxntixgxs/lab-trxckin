import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import type { MatrizRiesgoReporteRow } from "@/convex/lib/onboarding/suppliersMatrizRiesgoReporte";
import { EMPRESAS_MAP } from "@/lib/empresas";
import { buildMatrizRiesgoWorkbook, DICCIONARIO_SHEET_NAME, getEmpresaLabelForExport, MATRIZ_RIESGO_HEADERS, MATRIZ_RIESGO_SHEET_NAME } from "./matriz-riesgo-excel";

function sampleRow(overrides?: Partial<MatrizRiesgoReporteRow>): MatrizRiesgoReporteRow {
  return {
    inscripcionId: "ins_1" as MatrizRiesgoReporteRow["inscripcionId"],
    empresaId: 1,
    fechaInicioProceso: Date.UTC(2026, 0, 15, 17, 30, 0),
    tipoSolicitud: "INSCRIPCIÓN",
    estadoProceso: "COMPLETADO",
    proveedor: "Proveedor Demo",
    tipoPersona: "Jurídica",
    tipoDocumento: "NIT",
    nit: "900123456",
    productoServicio: "Servicios",
    ciiuPrincipal: "0111",
    actividadEconomicaPrincipal: "Cultivo",
    ciiuSecundario: "—",
    actividadEconomicaSecundaria: "—",
    montoAnual: { respuesta: "Menor a 10 millones COP", puntaje: 1, nivel: "BAJO" },
    sectorEconomico: { respuesta: "Sector", puntaje: null, nivel: "INDEFINIDO" },
    jurisdiccionNacional: { respuesta: "Boyacá", puntaje: 1, nivel: "BAJO" },
    jurisdiccionInternacional: { respuesta: "Colombia", puntaje: 2, nivel: "MEDIO" },
    pep: { respuesta: "NO", puntaje: 1, nivel: "BAJO" },
    listasRestrictivas: { respuesta: "NO", puntaje: 1, nivel: "BAJO" },
    riesgoGlobalPuntaje: 2,
    riesgoGlobalNivel: "MEDIO",
    tipoEvaluacion: "SIMPLIFICADA",
    ...overrides,
  };
}

describe("matriz-riesgo-excel", () => {
  it("genera hojas Matriz de riesgo y Diccionario", () => {
    const wb = buildMatrizRiesgoWorkbook(ExcelJS, [sampleRow()]);
    expect(wb.worksheets.map((ws) => ws.name)).toEqual([MATRIZ_RIESGO_SHEET_NAME, DICCIONARIO_SHEET_NAME]);
  });

  it("incluye encabezados completos en orden", () => {
    const wb = buildMatrizRiesgoWorkbook(ExcelJS, [sampleRow()]);
    const ws = wb.getWorksheet(MATRIZ_RIESGO_SHEET_NAME)!;
    const header = (ws.getRow(1).values as Array<string | undefined>).slice(1);
    expect(header).toEqual([...MATRIZ_RIESGO_HEADERS]);
  });

  it("escribe fechas y puntajes con tipos nativos y puntajes indefinidos vacíos", () => {
    const wb = buildMatrizRiesgoWorkbook(ExcelJS, [sampleRow()]);
    const ws = wb.getWorksheet(MATRIZ_RIESGO_SHEET_NAME)!;
    const dataRow = ws.getRow(2);
    expect(dataRow.getCell(4).value).toBeInstanceOf(Date);
    expect(dataRow.getCell(17).value).toBe(1);
    expect(dataRow.getCell(20).value).toBeNull();
    expect(dataRow.getCell(2).value).toBe(1);
    expect(dataRow.getCell(3).value).toBe(EMPRESAS_MAP[1].nombre);
  });

  it("exporta varias filas en una sola hoja", () => {
    const wb = buildMatrizRiesgoWorkbook(ExcelJS, [sampleRow({ nit: "1" }), sampleRow({ nit: "2" })]);
    expect(wb.getWorksheet(MATRIZ_RIESGO_SHEET_NAME)!.rowCount).toBe(3);
  });

  it("etiqueta la empresa desde el catálogo", () => {
    expect(getEmpresaLabelForExport(1)).toBe(EMPRESAS_MAP[1].nombre);
  });

  it("produce buffer xlsx descargable", async () => {
    const wb = buildMatrizRiesgoWorkbook(ExcelJS, [sampleRow()]);
    const buffer = await wb.xlsx.writeBuffer();
    expect(buffer.byteLength).toBeGreaterThan(0);
  });
});
