"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useConvex } from "convex/react";
import {
  ArrowLeft,
  FileDown,
  Loader2,
  ShieldCheck,
  UploadCloud,
} from "lucide-react";
import { toast } from "sonner";
import Loading from "../../../loading";
import NoAutorizado from "@/app/no-autorizado";
import { api } from "@/convex/_generated/api";
import { DashboardHero } from "@/components/dashboard-hero";
import { Button } from "@/components/ui/button";
import { useEmpresaFilter } from "@/hooks/useEmpresaFilter";
import { RUTAS_SISTEMA } from "@/lib/rutas-sistema";
import { cn } from "@/lib/utils";
import { useFacturacionPage } from "../../hooks/use-facturacion-page";
import { getFacturacionErrorMessage } from "../../lib/user-facing-error";
import { formatCurrency } from "../../lib/utils";
import { cleanDianRows, collectUniqueCufes } from "./lib/clean-dian-rows";
import {
  chunkCufes,
  compareDianRows,
  type ComparedDianRow,
  type DianMatch,
} from "./lib/compare-dian-rows";
import {
  MAX_DIAN_XLSX_BYTES,
  VALIDACION_DIAN_BATCH_SIZE,
  getCufeTrimmed,
} from "./lib/dian-headers";
import { exportValidacionDianXlsx } from "./lib/export-validacion-xlsx";
import {
  DianXlsxParseError,
  parseDianXlsxFile,
} from "./lib/parse-dian-xlsx";

type ProcessPhase =
  | "idle"
  | "lectura"
  | "limpieza"
  | "comparacion"
  | "listo"
  | "error";

type ValidationResult = {
  archivoNombre: string;
  originalCount: number;
  removedApplicationResponseCount: number;
  encontradas: ComparedDianRow[];
  noEncontradas: ComparedDianRow[];
  empresaScope: number | null;
};

const RESULTS_PAGE_SIZE = 50;

const PHASE_LABELS: Record<ProcessPhase, string> = {
  idle: "Selecciona un archivo .xlsx del reporte DIAN.",
  lectura: "Leyendo y validando encabezados…",
  limpieza: "Eliminando Application response…",
  comparacion: "Comparando CUFE/CUDE con el sistema…",
  listo: "Validación lista.",
  error: "No se pudo validar el archivo.",
};

export default function ValidarFacturasDianPage() {
  const { status, hasAccess } = useFacturacionPage(
    RUTAS_SISTEMA.FACTURACION_FACTURAS
  );
  const { empresaActiva, empresaActivaInfo } = useEmpresaFilter();
  const convex = useConvex();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const [phase, setPhase] = useState<ProcessPhase>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [progressLabel, setProgressLabel] = useState<string | null>(null);
  const [batchProgress, setBatchProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [resultsPage, setResultsPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const runIdRef = useRef(0);

  // Si cambia la empresa activa, invalidar resultado para no descargar con alcance viejo.
  useEffect(() => {
    runIdRef.current += 1;
    setResult(null);
    setPhase("idle");
    setErrorMessage(null);
    setProgressLabel(null);
    setBatchProgress(null);
    setResultsPage(1);
    if (inputRef.current) inputRef.current.value = "";
  }, [empresaActiva]);

  const processFile = useCallback(
    async (file: File | null | undefined) => {
      if (!file) return;

      const runId = runIdRef.current + 1;
      runIdRef.current = runId;
      const isStale = () => runIdRef.current !== runId;

      setResult(null);
      setErrorMessage(null);
      setBatchProgress(null);
      setResultsPage(1);
      setPhase("lectura");
      setProgressLabel(`Leyendo ${file.name}…`);

      try {
        if (!file.name.trim().toLowerCase().endsWith(".xlsx")) {
          throw new DianXlsxParseError("Solo se aceptan archivos .xlsx.");
        }
        if (file.size > MAX_DIAN_XLSX_BYTES) {
          throw new DianXlsxParseError("El archivo supera el límite de 25 MB.");
        }

        const parsed = await parseDianXlsxFile(file);
        if (isStale()) return;

        setPhase("limpieza");
        setProgressLabel("Eliminando Application response…");
        const cleaned = cleanDianRows(parsed.rows);
        const uniqueCufes = collectUniqueCufes(cleaned.rows);

        setPhase("comparacion");
        const batches = chunkCufes(uniqueCufes, VALIDACION_DIAN_BATCH_SIZE);
        const matches: DianMatch[] = [];

        for (let index = 0; index < batches.length; index += 1) {
          if (isStale()) return;
          const batch = batches[index] ?? [];
          setBatchProgress({ current: index + 1, total: batches.length });
          setProgressLabel(
            batches.length === 0
              ? "Sin CUFE/CUDE para consultar…"
              : `Consultando lote ${index + 1} de ${batches.length}…`
          );

          if (batch.length === 0) continue;

          const response = await convex.query(
            api.facturacionFacturas.buscarPorCufesParaValidacionDian,
            {
              cufes: batch,
              ...(typeof empresaActiva === "number"
                ? { empresa: empresaActiva }
                : {}),
            }
          );
          matches.push(...response.coincidencias);
        }

        if (isStale()) return;

        const compared = compareDianRows(cleaned.rows, matches);
        setResult({
          archivoNombre: file.name,
          originalCount: cleaned.originalCount,
          removedApplicationResponseCount:
            cleaned.removedApplicationResponseCount,
          encontradas: compared.encontradas,
          noEncontradas: compared.noEncontradas,
          empresaScope: empresaActiva,
        });
        setPhase("listo");
        setProgressLabel(null);
        setBatchProgress(null);
        toast.success(
          `Validación lista: ${compared.noEncontradas.length} no encontrada${compared.noEncontradas.length === 1 ? "" : "s"}.`
        );
      } catch (error) {
        if (isStale()) return;
        console.error("Error validando facturas DIAN:", error);
        const message = getFacturacionErrorMessage(
          error,
          "No se pudo validar el archivo. Revisa el formato e intenta nuevamente.",
        );
        setPhase("error");
        setErrorMessage(message);
        setProgressLabel(null);
        setBatchProgress(null);
        toast.error(message);
      }
    },
    [convex, empresaActiva]
  );

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      void processFile(file);
    },
    [processFile]
  );

  const isProcessing =
    phase === "lectura" || phase === "limpieza" || phase === "comparacion";

  const noEncontradasPage = useMemo(() => {
    const rows = result?.noEncontradas ?? [];
    const totalPages = Math.max(1, Math.ceil(rows.length / RESULTS_PAGE_SIZE));
    const page = Math.min(resultsPage, totalPages);
    const start = (page - 1) * RESULTS_PAGE_SIZE;
    return {
      rows: rows.slice(start, start + RESULTS_PAGE_SIZE),
      totalPages,
      page,
      total: rows.length,
    };
  }, [result, resultsPage]);

  const canDownload =
    phase === "listo" &&
    result !== null &&
    result.empresaScope === empresaActiva;

  const handleDownload = useCallback(async () => {
    if (!result || !canDownload) return;
    setExporting(true);
    try {
      await exportValidacionDianXlsx({
        encontradas: result.encontradas,
        noEncontradas: result.noEncontradas,
        empresaActiva,
        empresaActivaInfo,
      });
      toast.success("Resultado XLSX descargado.");
    } catch (error) {
      console.error("Error exportando validación DIAN:", error);
      toast.error(
        getFacturacionErrorMessage(
          error,
          "No se pudo descargar el resultado. Intenta nuevamente.",
        ),
      );
    } finally {
      setExporting(false);
    }
  }, [result, canDownload, empresaActiva, empresaActivaInfo]);

  if (status === "loading") return <Loading />;
  if (!hasAccess) return <NoAutorizado />;

  return (
    <div className="space-y-6 px-4 py-5 sm:px-6 lg:px-8">
      <Link
        href="/billing/invoices"
        className="inline-flex items-center gap-2 text-sm text-slate-600 transition hover:text-slate-900 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Volver a Facturas
      </Link>

      <DashboardHero
        title="Validar facturas DIAN"
        description={
          empresaActivaInfo
            ? `Compara el reporte DIAN contra facturas de ${empresaActivaInfo.nombre} por CUFE/CUDE. El archivo se procesa solo en tu navegador.`
            : "Compara el reporte DIAN contra todas las empresas por CUFE/CUDE. El archivo se procesa solo en tu navegador."
        }
        icon={<ShieldCheck className="h-8 w-8" />}
        gradientClassName="from-slate-950 via-emerald-950 to-slate-900"
      />

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-950">
              Archivo DIAN (.xlsx)
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              Hasta 25 MB. Debe incluir los 32 encabezados del reporte DIAN.
              Solo se envían CUFE/CUDE al servidor para la comparación.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={!canDownload || exporting}
            onClick={() => void handleDownload()}
          >
            {exporting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <FileDown className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            {exporting ? "Generando…" : "Descargar resultado XLSX"}
          </Button>
        </div>

        <label
          htmlFor={inputId}
          onDragEnter={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            setIsDragging(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setIsDragging(false);
            if (isProcessing) return;
            handleFiles(event.dataTransfer.files);
          }}
          className={cn(
            "mt-5 flex min-h-[180px] cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-10 text-center transition focus-within:ring-2 focus-within:ring-emerald-500 focus-within:ring-offset-2",
            isDragging
              ? "border-emerald-500 bg-emerald-50"
              : "border-slate-300 bg-slate-50 hover:border-slate-400 hover:bg-slate-100",
            isProcessing && "pointer-events-none opacity-70"
          )}
        >
          {isProcessing ? (
            <Loader2
              className="h-8 w-8 animate-spin text-emerald-700"
              aria-hidden="true"
            />
          ) : (
            <UploadCloud
              className="h-8 w-8 text-slate-500"
              aria-hidden="true"
            />
          )}
          <span className="mt-3 text-sm font-medium text-slate-800">
            {isProcessing
              ? PHASE_LABELS[phase]
              : "Arrastra el .xlsx aquí o haz clic para seleccionarlo"}
          </span>
          <span className="mt-1 text-xs text-slate-500">
            Procesamiento automático al elegir el archivo
          </span>
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            disabled={isProcessing}
            onChange={(event) => {
              handleFiles(event.target.files);
              event.target.value = "";
            }}
          />
        </label>

        <div
          className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600"
          role="status"
          aria-live="polite"
        >
          {errorMessage ? (
            <p className="font-medium text-rose-700">{errorMessage}</p>
          ) : (
            <p>
              {progressLabel ?? PHASE_LABELS[phase]}
              {batchProgress
                ? ` (${batchProgress.current}/${batchProgress.total})`
                : null}
            </p>
          )}
          {result ? (
            <p className="mt-1 text-xs text-slate-500">
              Archivo: {result.archivoNombre}
            </p>
          ) : null}
        </div>
      </section>

      {result ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Registros originales"
              value={String(result.originalCount)}
            />
            <MetricCard
              label="Application response eliminados"
              value={String(result.removedApplicationResponseCount)}
            />
            <MetricCard
              label="Encontradas"
              value={String(result.encontradas.length)}
              tone="emerald"
            />
            <MetricCard
              label="No encontradas"
              value={String(result.noEncontradas.length)}
              tone={result.noEncontradas.length > 0 ? "amber" : "slate"}
            />
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-950">
                  Documentos no encontrados
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {noEncontradasPage.total === 0
                    ? "Todos los documentos limpios existen en el alcance seleccionado."
                    : `${noEncontradasPage.total} documento${noEncontradasPage.total === 1 ? "" : "s"} ausente${noEncontradasPage.total === 1 ? "" : "s"} en ${empresaActivaInfo?.nombre ?? "todas las empresas"}.`}
                </p>
              </div>
              {noEncontradasPage.total > 0 ? (
                <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
                  Página {noEncontradasPage.page} de{" "}
                  {noEncontradasPage.totalPages}
                </p>
              ) : null}
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-[0.14em] text-slate-400">
                    <th className="border-b border-slate-200 px-3 py-2 font-semibold">
                      Tipo
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2 font-semibold">
                      CUFE/CUDE
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2 font-semibold">
                      Prefijo/Folio
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2 font-semibold">
                      Emisor
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2 font-semibold">
                      Fecha
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2 font-semibold">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {noEncontradasPage.rows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-3 py-8 text-center text-slate-500"
                      >
                        No hay documentos no encontrados.
                      </td>
                    </tr>
                  ) : (
                    noEncontradasPage.rows.map((item, index) => {
                      const cufe = getCufeTrimmed(item.row);
                      const prefijo = String(item.row.Prefijo ?? "").trim();
                      const folio = String(item.row.Folio ?? "").trim();
                      const prefijoFolio = [prefijo, folio]
                        .filter(Boolean)
                        .join("-");
                      const total =
                        typeof item.row.Total === "number"
                          ? item.row.Total
                          : null;
                      return (
                        <tr
                          key={`${cufe || "sin-cufe"}-${index}-${(noEncontradasPage.page - 1) * RESULTS_PAGE_SIZE}`}
                          className="align-top text-slate-700"
                        >
                          <td className="border-b border-slate-100 px-3 py-3">
                            {String(item.row["Tipo de documento"] ?? "") || "—"}
                          </td>
                          <td className="border-b border-slate-100 px-3 py-3 font-mono text-xs break-all">
                            {cufe || "—"}
                          </td>
                          <td className="border-b border-slate-100 px-3 py-3">
                            {prefijoFolio || "—"}
                          </td>
                          <td className="border-b border-slate-100 px-3 py-3">
                            <div className="font-medium text-slate-900">
                              {String(item.row["Nombre Emisor"] ?? "") || "—"}
                            </div>
                            <div className="text-xs text-slate-500">
                              {String(item.row["NIT Emisor"] ?? "") || "—"}
                            </div>
                          </td>
                          <td className="border-b border-slate-100 px-3 py-3 whitespace-nowrap">
                            {String(item.row["Fecha Emisión"] ?? "") || "—"}
                          </td>
                          <td className="border-b border-slate-100 px-3 py-3 whitespace-nowrap">
                            {total === null ? "—" : formatCurrency(total)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {noEncontradasPage.totalPages > 1 ? (
              <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={noEncontradasPage.page <= 1}
                  onClick={() => setResultsPage((page) => Math.max(1, page - 1))}
                >
                  Anterior
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={
                    noEncontradasPage.page >= noEncontradasPage.totalPages
                  }
                  onClick={() =>
                    setResultsPage((page) =>
                      Math.min(noEncontradasPage.totalPages, page + 1)
                    )
                  }
                >
                  Siguiente
                </Button>
              </div>
            ) : null}
          </section>
        </>
      ) : null}
    </div>
  );
}

function MetricCard({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: string;
  tone?: "slate" | "emerald" | "amber";
}) {
  const toneClass =
    tone === "emerald"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50 text-amber-950"
        : "border-slate-200 bg-white text-slate-950";

  return (
    <div className={cn("rounded-3xl border px-4 py-4 shadow-xs", toneClass)}>
      <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
