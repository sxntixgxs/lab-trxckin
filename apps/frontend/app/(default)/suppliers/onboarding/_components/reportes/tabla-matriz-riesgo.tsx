"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useConvex, usePaginatedQuery } from "convex/react";
import { AlertCircle, Building2, FileSpreadsheet, Loader2, RotateCcw } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { MatrizRiesgoReporteRow } from "@/convex/lib/onboarding/suppliersMatrizRiesgoReporte";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEmpresaFilter } from "@/hooks/useEmpresaFilter";
import { getEmpresaNombre } from "@/lib/empresas";
import { cn } from "@/lib/utils";
import { getOnboardingErrorMessage, RIESGO_CONFIG } from "../ui-config";
import { buildMatrizRiesgoWorkbook } from "./matriz-riesgo-excel";
import { buildMatrizRiesgoFilename, rangoFechasBogotaToTimestamps, rangoMesActualBogota, validarRangoFechasInput, type FechaRangoInput } from "./matriz-riesgo-fechas";

const PAGE_SIZE = 50;
const EXPORT_PAGE_SIZE = 100;

function NivelBadge({ nivel }: { nivel: string }) {
  return (
    <span className={cn("inline-flex rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide", (RIESGO_CONFIG[nivel] ?? RIESGO_CONFIG.INDEFINIDO).badge)}>
      {nivel}
    </span>
  );
}

function FactorCells({ factor }: { factor: MatrizRiesgoReporteRow["montoAnual"] }) {
  return (
    <>
      <td className="min-w-[140px] max-w-[220px] truncate px-2 py-2 text-xs text-slate-700" title={factor.respuesta}>
        {factor.respuesta || "—"}
      </td>
      <td className="px-2 py-2 text-center text-xs tabular-nums text-slate-700">{factor.puntaje ?? "—"}</td>
      <td className="px-2 py-2 text-center">
        <NivelBadge nivel={factor.nivel} />
      </td>
    </>
  );
}

/** Paginated risk-matrix report by process start date (Bogotá range) with full Excel export. */
export default function TablaMatrizRiesgo() {
  const { empresaActiva } = useEmpresaFilter();
  const convex = useConvex();

  const [draftFechas, setDraftFechas] = useState<FechaRangoInput>(() => rangoMesActualBogota());
  const [appliedFechas, setAppliedFechas] = useState<FechaRangoInput>(() => rangoMesActualBogota());
  const [validationError, setValidationError] = useState<string | null>(null);
  const [exportProgress, setExportProgress] = useState<number | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const timestamps = useMemo(() => {
    try {
      return rangoFechasBogotaToTimestamps(appliedFechas);
    } catch {
      return null;
    }
  }, [appliedFechas]);

  const queryArgs =
    empresaActiva !== null && timestamps
      ? { empresa: empresaActiva, fechaDesde: timestamps.fechaDesde, fechaHastaExclusiva: timestamps.fechaHastaExclusiva }
      : "skip";

  const { results, status, loadMore, isLoading } = usePaginatedQuery(api.onboarding.suppliersReportes.listarMatricesRiesgoParaReporte, queryArgs, {
    initialNumItems: PAGE_SIZE,
  });

  useEffect(() => {
    setAppliedFechas(rangoMesActualBogota());
    setDraftFechas(rangoMesActualBogota());
  }, [empresaActiva]);

  const handleApplyFilters = () => {
    const error = validarRangoFechasInput(draftFechas);
    setValidationError(error);
    if (error) return;
    setAppliedFechas({ ...draftFechas });
    setExportError(null);
  };

  const handleResetMonth = () => {
    const rango = rangoMesActualBogota();
    setDraftFechas(rango);
    setAppliedFechas(rango);
    setValidationError(null);
    setExportError(null);
  };

  const loadedCount = results?.length ?? 0;
  const isInitialLoading = isLoading && loadedCount === 0;
  const isLoadingMore = status === "LoadingMore";
  const canLoadMore = status === "CanLoadMore";
  const isDone = status === "Exhausted";
  const isExporting = exportProgress !== null;

  const handleExport = useCallback(async () => {
    if (empresaActiva === null || !timestamps) return;
    const error = validarRangoFechasInput(appliedFechas);
    if (error) {
      setValidationError(error);
      return;
    }
    setExportError(null);
    setExportProgress(0);
    try {
      const allRows: MatrizRiesgoReporteRow[] = [];
      let cursor: string | null = null;
      let done = false;
      while (!done) {
        const page: { page: MatrizRiesgoReporteRow[]; isDone: boolean; continueCursor: string } = await convex.query(api.onboarding.suppliersReportes.listarMatricesRiesgoParaReporte, {
          empresa: empresaActiva,
          fechaDesde: timestamps.fechaDesde,
          fechaHastaExclusiva: timestamps.fechaHastaExclusiva,
          paginationOpts: { numItems: EXPORT_PAGE_SIZE, cursor },
        });
        allRows.push(...page.page);
        setExportProgress(allRows.length);
        done = page.isDone;
        cursor = page.continueCursor;
      }
      if (allRows.length === 0) {
        setExportError("No hay registros en el rango seleccionado.");
        return;
      }
      const ExcelJS = (await import("exceljs")).default;
      const wb = buildMatrizRiesgoWorkbook(ExcelJS, allRows, getEmpresaNombre(empresaActiva));
      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = buildMatrizRiesgoFilename(appliedFechas.desde, appliedFechas.hasta);
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(getOnboardingErrorMessage(err, "No fue posible generar el archivo Excel."));
    } finally {
      setExportProgress(null);
    }
  }, [appliedFechas, convex, empresaActiva, timestamps]);

  if (empresaActiva === null) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 py-16 text-center">
        <Building2 className="h-8 w-8 text-slate-300" />
        <p className="text-sm font-medium text-slate-500">Selecciona una empresa para consultar la matriz de riesgo.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="matriz-desde" className="mb-1 block text-xs font-medium text-slate-600">
                Desde
              </label>
              <Input id="matriz-desde" type="date" value={draftFechas.desde} disabled={isExporting} onChange={(e) => setDraftFechas((prev) => ({ ...prev, desde: e.target.value }))} className="h-9 w-[160px]" />
            </div>
            <div>
              <label htmlFor="matriz-hasta" className="mb-1 block text-xs font-medium text-slate-600">
                Hasta
              </label>
              <Input id="matriz-hasta" type="date" value={draftFechas.hasta} disabled={isExporting} onChange={(e) => setDraftFechas((prev) => ({ ...prev, hasta: e.target.value }))} className="h-9 w-[160px]" />
            </div>
            <Button type="button" size="sm" className="h-9" disabled={isExporting} onClick={handleApplyFilters}>
              Aplicar filtros
            </Button>
            <Button type="button" variant="outline" size="sm" className="h-9" disabled={isExporting} onClick={handleResetMonth}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Mes actual
            </Button>
          </div>

          <Button type="button" variant="outline" size="sm" className="h-9 shrink-0" disabled={isExporting || isInitialLoading} onClick={() => void handleExport()}>
            {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-2 h-4 w-4 text-green-600" />}
            {isExporting ? `Preparando Excel · ${exportProgress} registros` : "Descargar XLSX"}
          </Button>
        </div>

        {validationError && (
          <p className="mt-3 flex items-center gap-2 text-sm text-red-600">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {validationError}
          </p>
        )}
        {exportError && (
          <p className="mt-3 flex items-center gap-2 text-sm text-red-600">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {exportError}
          </p>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
        {isInitialLoading || (status === "LoadingFirstPage" && loadedCount === 0) ? (
          <div className="flex items-center justify-center gap-2 py-20 text-sm text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            Cargando matriz de riesgo…
          </div>
        ) : results && results.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-500">No hay procesos en el rango seleccionado.</div>
        ) : (
          <div className="relative max-h-[70vh] overflow-auto">
            <table className="min-w-max border-collapse text-left text-sm">
              <thead className="sticky top-0 z-20 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-600 shadow-[0_1px_0_0_rgb(226_232_240)]">
                <tr>
                  <th colSpan={2} className="sticky left-0 z-30 border-b border-r border-slate-200 bg-slate-50 px-2 py-2" />
                  <th colSpan={11} className="border-b border-slate-200 px-2 py-2 text-center">
                    Identificación
                  </th>
                  {["Monto anual", "Sector económico", "Jurisdicción nacional", "Jurisdicción internacional", "PEP", "Listas restrictivas"].map((label) => (
                    <th key={label} colSpan={3} className="border-b border-l border-slate-200 px-2 py-2 text-center">
                      {label}
                    </th>
                  ))}
                  <th colSpan={3} className="border-b border-l border-slate-200 px-2 py-2 text-center">
                    Riesgo global
                  </th>
                </tr>
                <tr>
                  {[
                    ["Proveedor", "left-0"],
                    ["NIT", "left-[180px]"],
                    ["Fecha inicio", ""],
                    ["Tipo", ""],
                    ["Estado", ""],
                    ["Producto/servicio", ""],
                    ["CIIU princ.", ""],
                    ["Act. econ. princ.", ""],
                    ["CIIU sec.", ""],
                    ["Act. econ. sec.", ""],
                    ["Tipo persona", ""],
                    ["Tipo doc.", ""],
                    ["Empresa", ""],
                  ].map(([label, sticky]) => (
                    <th key={label} className={cn("border-b border-slate-200 px-2 py-2 font-semibold", sticky && `sticky z-30 border-r bg-slate-50 ${sticky} min-w-[180px] max-w-[180px]`)}>
                      {label}
                    </th>
                  ))}
                  {Array.from({ length: 6 }).flatMap((_, i) =>
                    ["Respuesta", "Puntaje", "Nivel"].map((sub) => (
                      <th key={`${i}-${sub}`} className="border-b border-l border-slate-200 px-2 py-2 font-semibold">
                        {sub}
                      </th>
                    )),
                  )}
                  {["Puntaje", "Nivel", "Tipo eval."].map((sub) => (
                    <th key={sub} className="border-b border-l border-slate-200 px-2 py-2 font-semibold">
                      {sub}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results?.map((row) => (
                  <tr key={row.inscripcionId} className="border-b border-slate-100 hover:bg-slate-50/80">
                    <td className="sticky left-0 z-10 min-w-[180px] max-w-[180px] truncate border-r border-slate-200 bg-white px-2 py-2 font-medium text-slate-900">{row.proveedor}</td>
                    <td className="sticky left-[180px] z-10 min-w-[120px] border-r border-slate-200 bg-white px-2 py-2 tabular-nums text-slate-700">{row.nit}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-xs text-slate-600">
                      {new Date(row.fechaInicioProceso).toLocaleString("es-CO", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="px-2 py-2 text-xs">{row.tipoSolicitud}</td>
                    <td className="px-2 py-2 text-xs">{row.estadoProceso ?? "—"}</td>
                    <td className="max-w-[180px] truncate px-2 py-2 text-xs" title={row.productoServicio}>
                      {row.productoServicio}
                    </td>
                    <td className="px-2 py-2 text-xs">{row.ciiuPrincipal}</td>
                    <td className="max-w-[160px] truncate px-2 py-2 text-xs" title={row.actividadEconomicaPrincipal}>
                      {row.actividadEconomicaPrincipal}
                    </td>
                    <td className="px-2 py-2 text-xs">{row.ciiuSecundario}</td>
                    <td className="max-w-[160px] truncate px-2 py-2 text-xs" title={row.actividadEconomicaSecundaria}>
                      {row.actividadEconomicaSecundaria}
                    </td>
                    <td className="px-2 py-2 text-xs">{row.tipoPersona}</td>
                    <td className="px-2 py-2 text-xs">{row.tipoDocumento}</td>
                    <td className="px-2 py-2 text-xs">{getEmpresaNombre(row.empresaId)}</td>
                    <FactorCells factor={row.montoAnual} />
                    <FactorCells factor={row.sectorEconomico} />
                    <FactorCells factor={row.jurisdiccionNacional} />
                    <FactorCells factor={row.jurisdiccionInternacional} />
                    <FactorCells factor={row.pep} />
                    <FactorCells factor={row.listasRestrictivas} />
                    <td className="border-l border-slate-100 px-2 py-2 text-center text-xs tabular-nums">{row.riesgoGlobalPuntaje ?? "—"}</td>
                    <td className="px-2 py-2 text-center">
                      <NivelBadge nivel={row.riesgoGlobalNivel} />
                    </td>
                    <td className="px-2 py-2 text-xs">{row.tipoEvaluacion}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-600">
            {loadedCount > 0 && (
              <>
                <span className="font-medium tabular-nums">{loadedCount}</span> {isDone ? "registros en total" : "registros cargados"}
              </>
            )}
          </p>
          {canLoadMore && (
            <Button type="button" variant="outline" size="sm" disabled={isLoadingMore || isExporting} onClick={() => loadMore(PAGE_SIZE)}>
              {isLoadingMore ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Cargando…
                </>
              ) : (
                `Cargar ${PAGE_SIZE} más`
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
