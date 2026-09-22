"use client";

import { useState } from "react";
import { useConvex } from "convex/react";
import { FileSpreadsheet, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { useEmpresaFilter } from "@/hooks/useEmpresaFilter";
import { getEmpresaNombre } from "@/lib/empresas";
import { calcularEvaluacionCompras, CRITERIOS_COMPRAS as CRITERIOS, etiquetaValorCriterioCompras, obtenerValoresEvaluacionCompras, type CriterioComprasKey } from "@/lib/onboarding/evaluacion-compras";
import { getOnboardingErrorMessage } from "./ui-config";

function toDateStr(ts: number) {
  return format(new Date(ts), "dd/MM/yyyy", { locale: es });
}

type EvaluacionRow = Record<CriterioComprasKey, number | null> & {
  _creationTime: number;
  empresa: number;
  tipoSolicitud: string;
  razonSocial: string;
  tipoDocumento: string;
  numeroDocumento: string;
  tipoPersona: string;
  ciudad: string;
  servicioSuministrado: string;
  tipoEvaluacion: string;
  riesgo: string;
  fechaInscripcion: number;
};

/** Excel with every Compras evaluation (one column pair per criterion + result block). */
export default function ExportarEvaluacionesExcel() {
  const convex = useConvex();
  const { empresaActiva } = useEmpresaFilter();
  const [loading, setLoading] = useState(false);

  async function handleExport() {
    setLoading(true);
    try {
      const rows = (await convex.query(api.onboarding.suppliersEvaluar.obtenerTodasEvaluacionesConProveedor, {
        empresa: empresaActiva ?? undefined,
      })) as unknown as EvaluacionRow[];

      if (!rows.length) {
        toast.warning("No hay evaluaciones registradas aún.");
        return;
      }

      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      wb.creator = empresaActiva !== null ? getEmpresaNombre(empresaActiva) : "Onboarding de proveedores";
      wb.created = new Date();

      const ws = wb.addWorksheet("Evaluaciones de Compras", { views: [{ state: "frozen", xSplit: 0, ySplit: 2 }] });

      const HEAD = "FF1E3A8A";
      const HEAD_D = "FF1E40AF";
      const WHITE = "FFFFFFFF";
      const SLATE = "FF64748B";
      const GRAY_LT = "FFF8FAFC";
      const GRAY_BG = "FFF1F5F9";
      const GREEN = "FF166534";
      const GREEN_B = "FFDCFCE7";
      const YELLOW = "FF854D0E";
      const YELLOW_B = "FFFEF9C3";
      const RED_B = "FFFEE2E2";

      const fixedCols = [
        { header: "Empresa", key: "empresa", width: 22 },
        { header: "Proveedor / Contratista", key: "razonSocial", width: 32 },
        { header: "Tipo solicitud", key: "tipoSolicitud", width: 18 },
        { header: "Tipo doc.", key: "tipoDocumento", width: 10 },
        { header: "Nro. documento", key: "numeroDocumento", width: 16 },
        { header: "Tipo persona", key: "tipoPersona", width: 16 },
        { header: "Ciudad", key: "ciudad", width: 14 },
        { header: "Servicio suministrado", key: "servicioSuministrado", width: 28 },
        { header: "Tipo evaluación", key: "tipoEvaluacion", width: 14 },
        { header: "Nivel de riesgo", key: "riesgo", width: 14 },
        { header: "Fecha inscripción", key: "fechaInscripcion", width: 16 },
        { header: "Fecha evaluación", key: "fechaEvaluacion", width: 16 },
      ];
      const criterioCols = CRITERIOS.flatMap((c) => [
        { header: `${c.label} — Opción`, key: `${c.key}_opcion`, width: 22 },
        { header: `${c.label} — Puntos`, key: `${c.key}_puntos`, width: 10 },
      ]);
      const totalCols = [
        { header: "Total puntos", key: "totalPuntos", width: 12 },
        { header: "Máximo posible", key: "maxPosible", width: 14 },
        { header: "Porcentaje (%)", key: "porcentaje", width: 13 },
        { header: "Calificación", key: "calificacion", width: 13 },
        { header: "Estado proveedor", key: "estadoProveedor", width: 22 },
      ];
      ws.columns = [...fixedCols, ...criterioCols, ...totalCols];

      // Row 1: group headers
      const totalCols1 = fixedCols.length;
      const headerRow1 = ws.getRow(1);
      headerRow1.getCell(1).value = "INFORMACIÓN DEL PROVEEDOR";
      ws.mergeCells(1, 1, 1, totalCols1);
      CRITERIOS.forEach((c, i) => {
        const startCol = totalCols1 + i * 2 + 1;
        headerRow1.getCell(startCol).value = c.label.toUpperCase();
        ws.mergeCells(1, startCol, 1, startCol + 1);
      });
      const resultStart = totalCols1 + CRITERIOS.length * 2 + 1;
      headerRow1.getCell(resultStart).value = "RESULTADO";
      ws.mergeCells(1, resultStart, 1, resultStart + totalCols.length - 1);
      headerRow1.eachCell({ includeEmpty: true }, (cell) => {
        if (!cell.value) return;
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEAD } };
        cell.font = { bold: true, color: { argb: WHITE }, size: 9, name: "Calibri" };
        cell.alignment = { horizontal: "center", vertical: "middle" };
      });
      headerRow1.height = 22;

      // Row 2: sub-headers
      const headerRow2 = ws.getRow(2);
      ws.columns.forEach((col, i) => {
        const cell = headerRow2.getCell(i + 1);
        cell.value = col.header as string;
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRAY_BG } };
        cell.font = { bold: true, size: 8, name: "Calibri", color: { argb: "FF0F172A" } };
        cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
        cell.border = { bottom: { style: "medium", color: { argb: HEAD } }, right: { style: "thin", color: { argb: "FFE2E8F0" } } };
      });
      headerRow2.height = 36;

      // Data rows
      rows
        .slice()
        .sort((a, b) => a.razonSocial.localeCompare(b.razonSocial))
        .forEach((ev, idx) => {
          const calculo = calcularEvaluacionCompras(obtenerValoresEvaluacionCompras(ev));
          if (!calculo.puedeCalcular || !calculo.proveedorStatus) {
            throw new Error(`La evaluación de ${ev.razonSocial} no tiene criterios aplicables.`);
          }
          const rowData: Record<string, string | number> = {
            empresa: getEmpresaNombre(ev.empresa),
            razonSocial: ev.razonSocial,
            tipoSolicitud: ev.tipoSolicitud ?? "INSCRIPCIÓN",
            tipoDocumento: ev.tipoDocumento,
            numeroDocumento: ev.numeroDocumento,
            tipoPersona: ev.tipoPersona === "PERSONA_JURIDICA" ? "Jurídica" : "Natural",
            ciudad: ev.ciudad,
            servicioSuministrado: ev.servicioSuministrado,
            tipoEvaluacion: ev.tipoEvaluacion,
            riesgo: ev.riesgo,
            fechaInscripcion: toDateStr(ev.fechaInscripcion),
            fechaEvaluacion: toDateStr(ev._creationTime),
          };
          CRITERIOS.forEach((c) => {
            const puntos = ev[c.key];
            rowData[`${c.key}_opcion`] = etiquetaValorCriterioCompras(c.key, puntos);
            rowData[`${c.key}_puntos`] = puntos ?? "—";
          });
          rowData.totalPuntos = calculo.sumaPuntos;
          rowData.maxPosible = calculo.maximoPosible;
          rowData.porcentaje = calculo.resultadoPorcentaje;
          rowData.calificacion = calculo.calificacionGeneral;
          rowData.estadoProveedor = calculo.proveedorStatus;

          const dataRow = ws.addRow(rowData);
          const isAlt = idx % 2 !== 0;
          dataRow.eachCell({ includeEmpty: true }, (cell) => {
            cell.font = { size: 8.5, name: "Calibri" };
            cell.alignment = { vertical: "middle", wrapText: false };
            cell.border = { right: { style: "hair", color: { argb: "FFE2E8F0" } } };
            if (isAlt) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRAY_LT } };
          });

          CRITERIOS.forEach((c, i) => {
            const puntosCell = dataRow.getCell(totalCols1 + i * 2 + 2);
            const puntos = ev[c.key];
            if (puntos === null) {
              puntosCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRAY_BG } };
              puntosCell.font = { bold: true, color: { argb: SLATE }, size: 8.5, name: "Calibri" };
            } else if (puntos === 0) {
              puntosCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: RED_B } };
              puntosCell.font = { bold: true, color: { argb: "FF991B1B" }, size: 8.5, name: "Calibri" };
            } else if (puntos === c.max) {
              puntosCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN_B } };
              puntosCell.font = { bold: true, color: { argb: GREEN }, size: 8.5, name: "Calibri" };
            } else {
              puntosCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: YELLOW_B } };
              puntosCell.font = { bold: true, color: { argb: YELLOW }, size: 8.5, name: "Calibri" };
            }
            puntosCell.alignment = { horizontal: "center", vertical: "middle" };
          });

          const totalCell = dataRow.getCell(resultStart);
          const pctCell = dataRow.getCell(resultStart + 2);
          const califCell = dataRow.getCell(resultStart + 3);
          const estadoCell = dataRow.getCell(resultStart + 4);
          totalCell.font = { bold: true, size: 8.5, name: "Calibri" };
          totalCell.alignment = { horizontal: "center", vertical: "middle" };
          pctCell.numFmt = '0"%"';
          pctCell.font = { bold: true, size: 8.5, name: "Calibri" };
          pctCell.alignment = { horizontal: "center", vertical: "middle" };
          califCell.numFmt = "0.00";
          califCell.alignment = { horizontal: "center", vertical: "middle" };

          const estadoColors: Record<string, { bg: string; text: string }> = {
            ACEPTABLE: { bg: GREEN_B, text: GREEN },
            "PROVEEDOR EN RESERVA": { bg: YELLOW_B, text: YELLOW },
            "NO ACEPTABLE": { bg: RED_B, text: "FF991B1B" },
          };
          const ec = estadoColors[calculo.proveedorStatus];
          if (ec) {
            estadoCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ec.bg } };
            estadoCell.font = { bold: true, color: { argb: ec.text }, size: 8.5, name: "Calibri" };
          }
          estadoCell.alignment = { horizontal: "center", vertical: "middle" };
          dataRow.height = 18;
        });

      // Summary row (averages)
      const summaryRow = ws.addRow({});
      summaryRow.height = 20;
      const lastDataRow = ws.rowCount;
      const firstDataRow = 3;
      CRITERIOS.forEach((_, i) => {
        const col = totalCols1 + i * 2 + 2;
        const cell = summaryRow.getCell(col);
        const letter = ws.getColumn(col).letter;
        cell.value = { formula: `AVERAGE(${letter}${firstDataRow}:${letter}${lastDataRow - 1})` };
        cell.numFmt = "0.0";
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E7FF" } };
        cell.font = { bold: true, size: 8, name: "Calibri", color: { argb: HEAD_D } };
        cell.alignment = { horizontal: "center", vertical: "middle" };
      });
      const avgTotalCell = summaryRow.getCell(resultStart);
      const totalLetter = ws.getColumn(resultStart).letter;
      avgTotalCell.value = { formula: `AVERAGE(${totalLetter}${firstDataRow}:${totalLetter}${lastDataRow - 1})` };
      avgTotalCell.numFmt = "0.0";
      avgTotalCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E7FF" } };
      avgTotalCell.font = { bold: true, size: 8.5, name: "Calibri", color: { argb: HEAD_D } };
      avgTotalCell.alignment = { horizontal: "center", vertical: "middle" };
      summaryRow.getCell(1).value = "PROMEDIO";
      summaryRow.getCell(1).font = { bold: true, size: 8.5, name: "Calibri", color: { argb: HEAD_D } };
      summaryRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E7FF" } };

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `reporte-evaluaciones-compras-${format(new Date(), "yyyy-MM-dd")}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(`Reporte exportado — ${rows.length} evaluación(es)`);
    } catch (e) {
      console.error(e);
      toast.error(getOnboardingErrorMessage(e, "Error al generar el reporte Excel"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button variant="outline" size="sm" className="h-9 rounded-lg" onClick={handleExport} disabled={loading}>
      {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-2 h-4 w-4 text-emerald-600" />}
      Exportar Evaluaciones Compras
    </Button>
  );
}
