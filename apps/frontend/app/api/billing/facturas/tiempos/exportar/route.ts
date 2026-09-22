import * as ExcelJS from "exceljs";
import { NextRequest, NextResponse } from "next/server";
import {
  api,
  convexServer,
  getConvexServerSecret,
  parseEmpresasParam,
  RUTAS_SISTEMA,
  requireFacturacionSession,
  resolveEmpresasPermitidas,
} from "../../../_lib";
import { fillTimingPage, parseTimingQueryFilters } from "../tiempos-route-lib";

function datePart(value: string | null, fallback: string) {
  return (value ?? fallback).replace(/[^0-9-]/g, "");
}

export async function GET(request: NextRequest) {
  const auth = await requireFacturacionSession(RUTAS_SISTEMA.FACTURACION_FACTURAS);
  if ("error" in auth) return auth.error;
  const params = request.nextUrl.searchParams;
  const empresas = resolveEmpresasPermitidas(
    auth.session,
    parseEmpresasParam(params.get("empresas"))
  );
  if ("error" in empresas) return empresas.error;
  try {
    const filters = parseTimingQueryFilters(params, Date.now());
    const common = {
      secret: getConvexServerSecret(),
      empresas,
      ...filters,
    } as const;
    const summaries: Array<Record<string, unknown>> = [];
    const movements: Array<Record<string, unknown>> = [];
    let cursor: string | undefined;
    let done = false;
    while (!done) {
      const page = await fillTimingPage({
        pageSize: 20,
        cursor,
        fetchPage: ({ cursor: sourceCursor, pageSize }) =>
          convexServer.query(api.facturacionReportes.listarTiempos, {
            ...common,
            cursor: sourceCursor,
            pageSize,
          }),
      });
      for (const row of page.page) {
        summaries.push({
          Empresa: row.empresa,
          "Número de factura": row.numeroFactura,
          Proveedor: row.proveedorNombre,
          NIT: row.proveedorNit,
          "Fecha de emisión": row.fechaEmision,
          "Tipo de flujo": row.tipoFlujo,
          "Estado del proceso": row.estadoProceso,
          "Fase actual": row.faseActual,
          "Responsable(s) actuales":
            row.responsablesActuales.map((owner: { nombre: string }) => owner.nombre).join(", ") ||
            "Sin responsable",
          Inicio: new Date(row.inicioEn),
          Fin: row.enCurso ? "En curso" : new Date(row.finEn),
          "Tiempo calendario (ms)": row.tiempoCalendarioMs,
          "Días laborales": row.diasLaborales,
          "Tiempo calendario sin asignar (ms)": row.tiempoCalendarioSinAsignarMs,
          "Días laborales sin asignar": row.diasLaboralesSinAsignar,
          "Cantidad de movimientos": row.cantidadMovimientos,
          "Sin workflow": row.sinWorkflow,
          Causado:
            row.causado === true ? "Sí" : row.causado === false ? "No" : "Sin registro",
          "Número FP": row.causado === true ? (row.numeroFp ?? "") : "",
        });
        const detail = await convexServer.query(api.facturacionReportes.obtenerDetalleTiempo, {
          secret: common.secret,
          facturaId: row.facturaId as never,
          empresas,
          nowMs: filters.nowMs,
        });
        for (const movement of detail.movimientos) {
          movements.push({
            Empresa: row.empresa,
            Factura: row.numeroFactura,
            Proveedor: row.proveedorNombre,
            Secuencia: movements.length + 1,
            "Tipo de intervalo": movement.tipoIntervalo,
            Fase: movement.fase ?? "Sin asignar",
            Rol: movement.rol ?? "",
            Estado: movement.estado,
            Responsable: movement.responsableNombre ?? "Sin asignar",
            Correo: movement.responsableEmail ?? "",
            Proceso: movement.procesoNombre ?? "",
            Inicio: new Date(movement.inicioEn),
            Fin: movement.enCurso ? "En curso" : new Date(movement.finEn),
            "Tiempo calendario (ms)": movement.duracionMs,
            "Días laborales": movement.diasLaborales,
            "Comentario/observación": movement.comentario ?? "",
          });
        }
      }
      done = page.isDone;
      cursor = page.continueCursor || undefined;
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Trxckin";
    const summarySheet = workbook.addWorksheet("Resumen facturas");
    const movementSheet = workbook.addWorksheet("Movimientos");
    const addRows = (sheet: ExcelJS.Worksheet, rows: Array<Record<string, unknown>>) => {
      if (!rows.length) return;
      const headers = Object.keys(rows[0]!);
      sheet.addRow(headers);
      for (const row of rows) sheet.addRow(headers.map((header) => row[header]));
      sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
      sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A8A" } };
      sheet.views = [{ state: "frozen", ySplit: 1 }];
      sheet.columns.forEach((column) => {
        column.width = 20;
      });
    };
    addRows(summarySheet, summaries);
    addRows(movementSheet, movements);
    const fpColumn = summarySheet.getRow(1).values
      ? (summarySheet.getRow(1).values as Array<string | undefined>).findIndex(
          (value) => value === "Número FP"
        )
      : -1;
    if (fpColumn > 0) {
      summarySheet.getColumn(fpColumn).numFmt = "@";
    }
    const buffer = await workbook.xlsx.writeBuffer();
    const empresaPart = empresas.length === 1 ? String(empresas[0]) : "todas";
    const filename = `tiempos-facturas-${empresaPart}-${datePart(params.get("from"), "inicio")}-${datePart(params.get("to"), "fin")}.xlsx`;
    return new NextResponse(buffer as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("facturacion tiempos exportar", error);
    return NextResponse.json({ error: "No se pudo generar el Excel de tiempos." }, { status: 500 });
  }
}
