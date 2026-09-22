"use client";

import {
  ChevronDown,
  ChevronRight,
  Download,
  ExternalLink,
  Loader2,
  RefreshCw,
  Search,
} from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MultiSelect } from "@/components/ui/multi-select";
import {
  deriveCausacionEstado,
  formatCausacionEstadoLabel,
  formatFpDisplay,
} from "@/lib/facturacion-causacion";
import { FACTURACION_STATUS_LABELS } from "../../components/status-badge";
import { getFacturacionErrorMessage } from "../../lib/user-facing-error";
import { formatDate } from "../../lib/utils";
import { mergeReportPeople, type ReportPerson } from "./report-people";

type CausacionEstadoFiltro = "causado" | "no_causado" | "sin_registro";

type ReportRow = {
  facturaId: string;
  empresa: number;
  numeroFactura: string;
  proveedorNombre: string;
  proveedorNit: string;
  fechaEmision: string;
  estadoProceso: string;
  faseActual: string;
  inicioEn: number;
  finEn: number;
  enCurso: boolean;
  sinWorkflow: boolean;
  tiempoCalendarioMs: number;
  diasLaborales: number;
  tiempoCalendarioSinAsignarMs: number;
  diasLaboralesSinAsignar: number;
  cantidadMovimientos: number;
  causado: boolean | null;
  numeroFp: string | null;
  responsablesActuales: Array<{
    userId: string | null;
    nombre: string;
    email: string;
    rol: string;
  }>;
};

type Movement = {
  id: string;
  tipoIntervalo: "asignacion" | "sin_asignar" | "caja_menor";
  fase: string | null;
  rol: string | null;
  estado: string;
  responsableNombre: string | null;
  responsableEmail: string | null;
  procesoNombre: string | null;
  inicioEn: number;
  finEn: number;
  duracionMs: number;
  diasLaborales: number;
  enCurso: boolean;
  comentario: string | null;
};

const FASE_FILTRO_OPCIONES = [
  "recepcion",
  "revision_lider",
  "jefe_directo",
  "causacion",
  "revision_impuestos",
  "eventos_dian",
  "rechazos_dian",
  "gerencia",
  "revision_tesoreria",
  "pagada",
  "legalizada",
  "cerrada",
  ...Object.keys(FACTURACION_STATUS_LABELS).filter((key) => key.startsWith("caja_menor_")),
] as const;

type Detail = { resumen: ReportRow; movimientos: Movement[] };
function formatDuration(ms: number) {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  const days = Math.floor(minutes / (24 * 60));
  const hours = Math.floor((minutes % (24 * 60)) / 60);
  const remainder = minutes % 60;
  if (days > 0) return `${days} d ${hours} h`;
  if (hours > 0) return `${hours} h ${remainder} min`;
  return `${remainder} min`;
}

function formatBusinessDays(days: number) {
  return `${new Intl.NumberFormat("es-CO", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(Math.max(0, days))} días laborales`;
}

function DurationPair({
  calendarMs,
  businessDays,
  emphasized = false,
}: {
  calendarMs: number;
  businessDays: number;
  emphasized?: boolean;
}) {
  return (
    <span className="block whitespace-nowrap">
      <span className={emphasized ? "block font-semibold text-slate-800" : "block"}>
        {formatDuration(calendarMs)}
      </span>
      <span className="mt-0.5 block text-xs font-normal text-slate-500">
        {formatBusinessDays(businessDays)}
      </span>
    </span>
  );
}

function formatTimestamp(value: number) {
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "short", timeStyle: "short" }).format(value);
}

function isInteractiveTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    Boolean(target.closest("button,a,input,select,textarea,[contenteditable='true'],[role='link']"))
  );
}

async function fetchFacturaTiemposDetail(facturaId: string, empresas: number[]): Promise<Detail> {
  const detailParams = new URLSearchParams({
    empresas: empresas.join(","),
    nowMs: String(Date.now()),
  });
  const response = await fetch(
    `/api/billing/facturas/tiempos/${facturaId}?${detailParams.toString()}`,
    { cache: "no-store" }
  );
  const payload = (await response.json()) as Detail & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "No se pudo cargar el detalle.");
  return payload;
}

export function TiemposFacturasReport({ empresas }: { empresas: number[] }) {
  const [preset, setPreset] = useState("mes_anterior");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("todos");
  const [phase, setPhase] = useState("");
  const [documentClass, setDocumentClass] = useState("");
  const [flowType, setFlowType] = useState("");
  const [causacionEstado, setCausacionEstado] = useState<CausacionEstadoFiltro | "all">("all");
  const [refreshKey, setRefreshKey] = useState(0);
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const [previousCursors, setPreviousCursors] = useState<Array<string | undefined>>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [isDone, setIsDone] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, Detail>>({});
  const [detailLoading, setDetailLoading] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [people, setPeople] = useState<ReportPerson[]>([]);
  const [selectedActual, setSelectedActual] = useState<string[]>([]);
  const [includeNoOwner, setIncludeNoOwner] = useState(false);

  useEffect(() => {
    if (empresas.length === 0) return;
    let cancelled = false;
    const loadPeople = async () => {
      const all: ReportPerson[] = [];
      let cursor: string | undefined;
      do {
        const params = new URLSearchParams({ empresas: empresas.join(","), tipo: "actual" });
        if (cursor) params.set("cursor", cursor);
        const response = await fetch(`/api/billing/facturas/personas?${params.toString()}`, {
          cache: "no-store",
        });
        const payload = (await response.json()) as {
          page?: ReportPerson[];
          error?: string;
          isDone?: boolean;
          continueCursor?: string;
        };
        if (!response.ok)
          throw new Error(payload.error ?? "No se pudo cargar el directorio de responsables.");
        all.push(...(payload.page ?? []));
        cursor = payload.isDone ? undefined : payload.continueCursor || undefined;
      } while (cursor);
      return mergeReportPeople(all);
    };
    loadPeople()
      .then((actual) => {
        if (!cancelled) setPeople(actual);
      })
      .catch(() => {
        if (!cancelled) setPeople([]);
      });
    return () => {
      cancelled = true;
    };
  }, [empresas]);

  const responsableOptions = useMemo(
    () =>
      people.map((person) => ({
        value: person.identityKey,
        label: `${person.nombre} · ${person.email}`,
      })),
    [people]
  );

  const loadRows = useCallback(async () => {
    if (empresas.length === 0) {
      setRows([]);
      setCursor(undefined);
      setNextCursor(undefined);
      setPreviousCursors([]);
      setIsDone(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        empresas: empresas.join(","),
        preset,
        estado: status,
        ...(phase ? { fase: phase } : {}),
        ...(documentClass ? { documentoClase: documentClass } : {}),
        ...(flowType ? { tipoFlujo: flowType } : {}),
        pageSize: "20",
        nowMs: String(Date.now()),
        refresh: String(refreshKey),
      });
      if (cursor) params.set("cursor", cursor);
      if (search.trim()) params.set("q", search.trim());
      const actualIds = selectedActual
        .filter((key) => key.startsWith("id:"))
        .map((key) => key.slice(3));
      const actualEmails = selectedActual
        .filter((key) => key.startsWith("email:"))
        .map((key) => key.slice(6));
      if (actualIds.length) params.set("responsableUserIds", actualIds.join(","));
      if (actualEmails.length) params.set("responsableEmails", actualEmails.join(","));
      if (includeNoOwner) params.set("sinResponsable", "true");
      if (causacionEstado !== "all") params.set("causacionEstado", causacionEstado);
      if (preset === "personalizado") {
        params.set("from", from);
        params.set("to", to);
      }
      const response = await fetch(`/api/billing/facturas/tiempos?${params.toString()}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as {
        page?: ReportRow[];
        error?: string;
        isDone?: boolean;
        continueCursor?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? "No se pudo cargar el reporte.");
      setRows(payload.page ?? []);
      setNextCursor(payload.isDone ? undefined : payload.continueCursor || undefined);
      setIsDone(payload.isDone ?? true);
    } catch (caught) {
      const message = getFacturacionErrorMessage(
        caught,
        "No se pudo cargar el reporte de tiempos."
      );
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [
    causacionEstado,
    documentClass,
    empresas,
    flowType,
    from,
    includeNoOwner,
    phase,
    preset,
    search,
    selectedActual,
    status,
    to,
    refreshKey,
    cursor,
  ]);

  const filterSignature = useMemo(
    () =>
      JSON.stringify({
        causacionEstado,
        documentClass,
        empresas,
        flowType,
        from,
        includeNoOwner,
        phase,
        preset,
        search,
        selectedActual,
        status,
        to,
        refreshKey,
      }),
    [
      causacionEstado,
      documentClass,
      empresas,
      flowType,
      from,
      includeNoOwner,
      phase,
      preset,
      search,
      selectedActual,
      status,
      to,
      refreshKey,
    ]
  );

  useEffect(() => {
    if (!filterSignature) return;
    setCursor(undefined);
    setPreviousCursors([]);
    setNextCursor(undefined);
    setExpanded(null);
  }, [filterSignature]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadRows(), 250);
    return () => window.clearTimeout(timer);
  }, [loadRows]);

  const toggleDetail = async (facturaId: string) => {
    if (expanded === facturaId) {
      setExpanded(null);
      return;
    }
    setExpanded(facturaId);
    if (details[facturaId]) return;
    setDetailLoading(facturaId);
    try {
      const payload = await fetchFacturaTiemposDetail(facturaId, empresas);
      setDetails((current) => ({ ...current, [facturaId]: payload }));
    } catch (caught) {
      toast.error(
        getFacturacionErrorMessage(caught, "No se pudo cargar el detalle de la factura.")
      );
      setExpanded(null);
    } finally {
      setDetailLoading(null);
    }
  };

  const exportReport = async () => {
    if (exporting || empresas.length === 0) return;
    setExporting(true);
    try {
      const params = new URLSearchParams({ empresas: empresas.join(","), preset, estado: status });
      if (phase) params.set("fase", phase);
      if (documentClass) params.set("documentoClase", documentClass);
      if (flowType) params.set("tipoFlujo", flowType);
      if (search.trim()) params.set("q", search.trim());
      const actualIds = selectedActual
        .filter((key) => key.startsWith("id:"))
        .map((key) => key.slice(3));
      const actualEmails = selectedActual
        .filter((key) => key.startsWith("email:"))
        .map((key) => key.slice(6));
      if (actualIds.length) params.set("responsableUserIds", actualIds.join(","));
      if (actualEmails.length) params.set("responsableEmails", actualEmails.join(","));
      if (includeNoOwner) params.set("sinResponsable", "true");
      if (causacionEstado !== "all") params.set("causacionEstado", causacionEstado);
      if (preset === "personalizado") {
        params.set("from", from);
        params.set("to", to);
      }
      const response = await fetch(
        `/api/billing/facturas/tiempos/exportar?${params.toString()}`,
        { cache: "no-store" }
      );
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? "No se pudo generar el Excel.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      const disposition = response.headers.get("content-disposition");
      const filename = disposition?.match(/filename="([^"]+)"/)?.[1] ?? "tiempos-facturas.xlsx";
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success("Excel generado correctamente.");
    } catch (caught) {
      toast.error(getFacturacionErrorMessage(caught, "No se pudo generar el Excel de tiempos."));
    } finally {
      setExporting(false);
    }
  };

  const totals = useMemo(
    () => ({
      count: rows.length,
      calendar: rows.reduce((sum, row) => sum + row.tiempoCalendarioMs, 0),
      business: rows.reduce((sum, row) => sum + row.diasLaborales, 0),
    }),
    [rows]
  );

  return (
    <section
      className="space-y-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-xs sm:p-6"
      aria-label="Tiempos del proceso"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
            Reporte operativo
          </p>
          <h2 className="mt-1 text-2xl font-semibold text-slate-950">Tiempos del proceso</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Mide el tiempo total desde el ingreso hasta el cierre y separa las esperas sin
            asignación.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setRefreshKey((value) => value + 1)}
            disabled={loading}
          >
            <RefreshCw className={loading ? "mr-2 h-4 w-4 animate-spin" : "mr-2 h-4 w-4"} />
            Actualizar
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void exportReport()}
            disabled={exporting || loading}
          >
            {exporting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}{" "}
            {exporting ? "Generando…" : "Exportar Excel"}
          </Button>
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1fr]">
        <label className="relative block md:col-span-2">
          <span className="sr-only">Buscar factura o responsable</span>
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar proveedor, NIT, factura, FP, descripción o responsable…"
            className="h-10 w-full rounded-xl border border-slate-200 pl-9 pr-3 text-sm outline-hidden focus:border-sky-400"
          />
        </label>
        <select
          value={preset}
          onChange={(event) => setPreset(event.target.value)}
          className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm"
        >
          <option value="mes_anterior">Mes anterior</option>
          <option value="mes_actual">Mes actual</option>
          <option value="personalizado">Personalizado</option>
          <option value="todas">Todas las fechas</option>
        </select>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm"
        >
          <option value="todos">Todos los estados</option>
          <option value="activos">Activos</option>
          <option value="finalizados">Finalizados</option>
          <option value="sin_workflow">Sin workflow</option>
        </select>
        <select
          value={phase}
          onChange={(event) => setPhase(event.target.value)}
          className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm"
          aria-label="Filtrar por fase actual"
        >
          <option value="">Todas las fases</option>
          {FASE_FILTRO_OPCIONES.map((value) => (
            <option key={value} value={value}>
              {FACTURACION_STATUS_LABELS[value] ?? value}
            </option>
          ))}
        </select>
        <select
          value={documentClass}
          onChange={(event) => setDocumentClass(event.target.value)}
          className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm"
          aria-label="Filtrar por clase documental"
        >
          <option value="">Todas las clases</option>
          <option value="factura">Factura</option>
          <option value="nota_credito">Nota crédito</option>
          <option value="nota_debito">Nota débito</option>
          <option value="otro">Otro</option>
        </select>
        <select
          value={flowType}
          onChange={(event) => setFlowType(event.target.value)}
          className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm"
          aria-label="Filtrar por tipo de flujo"
        >
          <option value="">Todos los flujos</option>
          <option value="normal">Normal</option>
          <option value="anticipo">Anticipo</option>
          <option value="caja_menor">Caja menor</option>
        </select>
        <select
          value={causacionEstado}
          onChange={(event) =>
            setCausacionEstado(event.target.value as CausacionEstadoFiltro | "all")
          }
          className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm"
          aria-label="Filtrar por causación"
        >
          <option value="all">Todas las causaciones</option>
          <option value="causado">Causado</option>
          <option value="no_causado">No causado</option>
          <option value="sin_registro">Sin registro</option>
        </select>
      </div>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_auto] lg:items-start">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            Responsable actual
          </p>
          <MultiSelect
            options={responsableOptions}
            selected={selectedActual}
            onChange={setSelectedActual}
            placeholder="Todos los responsables"
            className="max-w-xl"
          />
        </div>
        <label className="flex items-center gap-2 self-end pb-1 text-sm text-slate-600 lg:whitespace-nowrap">
          <input
            type="checkbox"
            checked={includeNoOwner}
            onChange={(event) => setIncludeNoOwner(event.target.checked)}
            className="rounded border-slate-300"
          />
          Incluir facturas activas sin responsable
        </label>
      </div>
      {preset === "personalizado" ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            className="h-10 rounded-xl border border-slate-200 px-3 text-sm"
            aria-label="Desde"
          />
          <span className="text-slate-400">—</span>
          <input
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            className="h-10 rounded-xl border border-slate-200 px-3 text-sm"
            aria-label="Hasta"
          />
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2 text-sm text-slate-600">
        <Badge variant="outline">{totals.count} facturas en esta página</Badge>
        <Badge variant="outline">Calendario: {formatDuration(totals.calendar)} acumulados</Badge>
        <Badge variant="outline">{formatBusinessDays(totals.business)} acumulados</Badge>
        <span className="self-center text-xs text-slate-400">
          La suma de movimientos puede superar el total cuando hubo trabajo paralelo.
        </span>
      </div>

      {loading ? (
        <div className="space-y-2" aria-live="polite">
          {[1, 2, 3, 4].map((item) => (
            <div key={item} className="h-14 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      ) : null}
      {error ? (
        <div className="flex items-center justify-between rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <span>{error}</span>
          <Button variant="outline" size="sm" onClick={() => setRefreshKey((value) => value + 1)}>
            Reintentar
          </Button>
        </div>
      ) : null}
      {!loading && !error && rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
          No hay facturas que coincidan con los filtros activos.
        </div>
      ) : null}
      {!loading && !error && rows.length > 0 ? (
        <>
          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="min-w-[1240px] w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.14em] text-slate-500">
                <tr>
                  <th className="w-10 px-3 py-3" />
                  <th className="px-3 py-3">Factura / proveedor</th>
                  <th className="px-3 py-3">Estado</th>
                  <th className="px-3 py-3">Causado</th>
                  <th className="px-3 py-3">Número FP</th>
                  <th className="px-3 py-3">Responsable actual</th>
                  <th className="px-3 py-3">Inicio</th>
                  <th className="px-3 py-3">Fin</th>
                  <th className="px-3 py-3">
                    Tiempo total
                    <span className="mt-0.5 block text-[10px] font-normal normal-case tracking-normal">
                      Calendario / laboral
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const isOpen = expanded === row.facturaId;
                  const detail = details[row.facturaId];
                  return (
                    <Fragment key={row.facturaId}>
                      <tr
                        key={row.facturaId}
                        id={`factura-${row.facturaId}-row`}
                        role="button"
                        tabIndex={0}
                        aria-expanded={isOpen}
                        aria-controls={`factura-${row.facturaId}-detail`}
                        aria-label={`${isOpen ? "Ocultar" : "Mostrar"} movimientos de ${row.numeroFactura}`}
                        onClick={(event) => {
                          if (isInteractiveTarget(event.target)) return;
                          void toggleDetail(row.facturaId);
                        }}
                        onKeyDown={(event) => {
                          if (isInteractiveTarget(event.target)) return;
                          if (event.key !== "Enter" && event.key !== " ") return;
                          event.preventDefault();
                          void toggleDetail(row.facturaId);
                        }}
                        className="cursor-pointer border-t border-slate-200 align-top transition-colors hover:bg-sky-50/30 focus-visible:bg-sky-50/60 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500"
                      >
                        <td className="px-3 py-3">
                          <button
                            type="button"
                            onClick={() => void toggleDetail(row.facturaId)}
                            aria-expanded={isOpen}
                            aria-label={`${isOpen ? "Ocultar" : "Mostrar"} movimientos de ${row.numeroFactura}`}
                            className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
                          >
                            {detailLoading === row.facturaId ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : isOpen ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </button>
                        </td>
                        <td className="px-3 py-3">
                          <a
                            href={`/billing/invoices/${row.facturaId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Abrir detalle de la factura en una pestaña nueva"
                            className="group inline-flex items-center gap-1 rounded-sm font-semibold text-slate-900 underline decoration-slate-300 decoration-1 underline-offset-4 transition-colors hover:text-sky-700 hover:decoration-sky-500 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
                          >
                            {row.numeroFactura}
                            <ExternalLink
                              className="h-3.5 w-3.5 shrink-0 text-slate-400 transition-colors group-hover:text-sky-600"
                              aria-hidden="true"
                            />
                            <span className="sr-only">: abrir detalle en una pestaña nueva</span>
                          </a>
                          <p className="mt-1 text-xs text-slate-500">
                            {row.proveedorNombre} · NIT {row.proveedorNit}
                          </p>
                          <p className="mt-1 text-xs text-slate-400">
                            Emisión {formatDate(row.fechaEmision)}
                          </p>
                        </td>
                        <td className="px-3 py-3">
                          <Badge variant="outline">
                            {row.sinWorkflow ? "Sin workflow" : row.estadoProceso}
                          </Badge>
                          {row.sinWorkflow ? (
                            <p className="mt-1 max-w-40 text-xs text-amber-700">
                              Ingresó al sistema, pero no tiene workflow asociado.
                            </p>
                          ) : null}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          {formatCausacionEstadoLabel(
                            deriveCausacionEstado(row.causado ?? undefined)
                          )}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap font-mono text-xs text-slate-700">
                          {formatFpDisplay(row.causado, row.numeroFp)}
                        </td>
                        <td className="px-3 py-3">
                          {row.responsablesActuales.length > 0 ? (
                            <div className="space-y-0.5">
                              {row.responsablesActuales.map((owner) => (
                                <p
                                  key={`${owner.userId ?? owner.email}-${owner.rol}`}
                                  className="text-slate-700"
                                >
                                  <span className="font-medium">{owner.nombre}</span>
                                  <span className="block text-xs text-slate-400">
                                    {owner.email}
                                  </span>
                                </p>
                              ))}
                            </div>
                          ) : (
                            <span className="text-slate-400">Sin responsable</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-slate-600">
                          {formatTimestamp(row.inicioEn)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-slate-600">
                          {row.sinWorkflow || row.enCurso ? "En curso" : formatTimestamp(row.finEn)}
                        </td>
                        <td className="px-3 py-3">
                          <DurationPair
                            calendarMs={row.tiempoCalendarioMs}
                            businessDays={row.diasLaborales}
                            emphasized
                          />
                        </td>
                      </tr>
                      {isOpen ? (
                        <tr id={`factura-${row.facturaId}-detail`} key={`${row.facturaId}-detail`}>
                          <td colSpan={9} className="bg-slate-50 px-5 py-4">
                            {detail ? (
                              <div className="space-y-2">
                                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                                  Movimientos del proceso
                                </p>
                                <div className="overflow-x-auto">
                                  <table className="min-w-[900px] w-full text-xs">
                                    <thead className="text-left text-slate-500">
                                      <tr>
                                        <th className="py-2">Fase</th>
                                        <th className="py-2">Responsable</th>
                                        <th className="py-2">Estado</th>
                                        <th className="py-2">Inicio</th>
                                        <th className="py-2">Fin</th>
                                        <th className="py-2">
                                          Duración
                                          <span className="mt-0.5 block text-[10px] font-normal text-slate-400">
                                            Calendario / laboral
                                          </span>
                                        </th>
                                        <th className="py-2">Observación</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {detail.movimientos.map((movement) => (
                                        <tr key={movement.id} className="border-t border-slate-200">
                                          <td className="py-2">
                                            {movement.fase
                                              ? (FACTURACION_STATUS_LABELS[movement.fase] ??
                                                movement.fase)
                                              : "—"}
                                          </td>
                                          <td className="py-2">
                                            {movement.responsableNombre ?? "Espera administrativa"}
                                            {movement.responsableEmail ? (
                                              <span className="block text-slate-400">
                                                {movement.responsableEmail}
                                              </span>
                                            ) : null}
                                          </td>
                                          <td className="py-2">
                                            {FACTURACION_STATUS_LABELS[movement.estado] ??
                                              movement.estado}
                                          </td>
                                          <td className="py-2">
                                            {formatTimestamp(movement.inicioEn)}
                                          </td>
                                          <td className="py-2">
                                            {movement.enCurso
                                              ? "En curso"
                                              : formatTimestamp(movement.finEn)}
                                          </td>
                                          <td className="py-2">
                                            <DurationPair
                                              calendarMs={movement.duracionMs}
                                              businessDays={movement.diasLaborales}
                                            />
                                          </td>
                                          <td className="py-2 text-slate-600">
                                            {movement.comentario?.trim() || "—"}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            ) : (
                              <div className="h-20 animate-pulse rounded-xl bg-white" />
                            )}
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-sm text-slate-600">
            <span>
              Página {previousCursors.length + 1} · Mostrando {rows.length} facturas
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={loading || previousCursors.length === 0}
                onClick={() => {
                  const previous = previousCursors[previousCursors.length - 1];
                  setPreviousCursors(previousCursors.slice(0, -1));
                  setCursor(previous);
                }}
              >
                Anterior
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={loading || isDone || !nextCursor}
                onClick={() => {
                  setPreviousCursors((stack) => [...stack, cursor]);
                  setCursor(nextCursor);
                }}
              >
                Siguiente
              </Button>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
