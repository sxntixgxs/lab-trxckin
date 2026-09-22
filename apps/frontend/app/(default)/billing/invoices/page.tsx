"use client";

import { useConvex, useQuery } from "convex/react";
import {
  AlertTriangle,
  ChevronDown,
  FileDown,
  FilePlus2,
  Loader2,
  MoreHorizontal,
  Search,
  ShieldCheck,
  UploadCloud,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import NoAutorizado from "@/app/no-autorizado";
import { DashboardHero } from "@/components/dashboard-hero";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { useEmpresaFilter } from "@/hooks/useEmpresaFilter";
import {
  deriveCausacionEstado,
  formatCausacionEstadoLabel,
  formatFpDisplay,
} from "@/lib/facturacion-causacion";
import { RUTAS_SISTEMA } from "@/lib/rutas-sistema";
import { matchesSearchText } from "@/lib/search-text";
import { cn } from "@/lib/utils";
import Loading from "../../loading";
import {
  FACTURACION_STATUS_LABELS,
  FacturacionStatusBadge,
  resolveFacturaEstadoFromRow,
} from "../components/status-badge";
import { useFacturacionPage } from "../hooks/use-facturacion-page";
import { getEmpresaAccentStyle } from "../lib/empresa-ui";
import { getFacturacionErrorMessage } from "../lib/user-facing-error";
import { formatCurrency, formatDate, timeAgo } from "../lib/utils";
import { getValorAPagarDisplay, shouldShowValorAPagar } from "../lib/valor-a-pagar";
import { getDocumentoLabel, getValorContable } from "../lib/valor-contable";
import { TiemposFacturasReport } from "./components/tiempos-facturas-report";
import { exportarFacturasExcel } from "./lib/exportar-excel";

const PAGE_SIZE_OPTIONS = [20, 50, 100] as const;
const RESPONSABLE_SIN_KEY = "__sin_responsable__";

type DocumentoClaseFiltro = "factura" | "nota_credito" | "nota_debito";
type TipoFlujoFiltro = "peajes" | "legalizacion_anticipo" | "legalizacion_caja_menor" | "normal";
type CausacionEstadoFiltro = "causado" | "no_causado" | "sin_registro";
type OrigenFiltro = "correo" | "carga_manual" | "recibo_fisico" | "documento_fisico";

type ResponsableActual = {
  userId: string | null;
  email: string;
  nombre: string;
  rol: string;
};

type ResponsableSeleccionado =
  | (ResponsableActual & { key: string; kind: "actual" })
  | {
      key: typeof RESPONSABLE_SIN_KEY;
      kind: "sin_responsable";
      userId: null;
      email: "";
      nombre: "Sin responsable";
      rol: "";
    };

type FacturaListadoRow = Doc<"facturacionFacturas"> & {
  tarea: Doc<"facturacionTareas"> | null;
  estadoResuelto?: string | null;
  responsablesActuales: ResponsableActual[];
  responsabilidadEstado: "con_responsable" | "sin_responsable" | "no_aplica";
};

const TIPO_FLUJO_LABELS: Record<TipoFlujoFiltro, string> = {
  peajes: "Peajes",
  legalizacion_anticipo: "Legalización anticipo",
  legalizacion_caja_menor: "Legalización caja menor",
  normal: "Normal",
};

const CAUSACION_ESTADO_LABELS: Record<CausacionEstadoFiltro, string> = {
  causado: "Causado",
  no_causado: "No causado",
  sin_registro: "Sin registro",
};

const ORIGEN_LABELS: Record<OrigenFiltro, string> = {
  correo: "Correo",
  carga_manual: "Carga manual",
  recibo_fisico: "Recibo físico",
  documento_fisico: "Documento físico",
};

const ESTADO_OPCIONES = Object.entries(FACTURACION_STATUS_LABELS).map(([value, label]) => ({
  value,
  label,
}));

function parseMontoFiltro(value: string): number | undefined {
  const trimmed = value.trim().replace(/\s/g, "");
  if (!trimmed) return undefined;
  const parsed = Number(trimmed.replace(/\./g, "").replace(/,/g, "."));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeResponsableEmail(email: string) {
  return email.trim().toLowerCase();
}

function buildResponsableKey(responsable: Pick<ResponsableActual, "userId" | "email">) {
  if (responsable.userId?.trim()) {
    return `id:${responsable.userId.trim()}`;
  }
  return `email:${normalizeResponsableEmail(responsable.email)}`;
}

function buildResponsableSelection(responsable: ResponsableActual): ResponsableSeleccionado {
  return {
    kind: "actual",
    key: buildResponsableKey(responsable),
    userId: responsable.userId,
    email: responsable.email,
    nombre: responsable.nombre,
    rol: responsable.rol,
  };
}

function buildSinResponsableSelection(): ResponsableSeleccionado {
  return {
    kind: "sin_responsable",
    key: RESPONSABLE_SIN_KEY,
    userId: null,
    email: "",
    nombre: "Sin responsable",
    rol: "",
  };
}

function responsableSelectionLabel(responsable: ResponsableSeleccionado) {
  return responsable.kind === "sin_responsable" ? "Sin responsable" : responsable.nombre;
}

function matchesResponsableFilterSearch(responsable: ResponsableActual, query: string) {
  return matchesSearchText(`${responsable.nombre} ${responsable.email} ${responsable.rol}`, query);
}

function ResponsableActualCell({
  responsables,
  responsabilidadEstado,
}: {
  responsables: ResponsableActual[];
  responsabilidadEstado: FacturaListadoRow["responsabilidadEstado"];
}) {
  if (responsabilidadEstado === "no_aplica") {
    return (
      <span className="text-slate-400" aria-label="No aplica">
        —
      </span>
    );
  }

  if (responsabilidadEstado === "sin_responsable" || responsables.length === 0) {
    return (
      <Badge
        variant="outline"
        className="inline-flex items-center gap-1.5 border-amber-200 bg-amber-50 text-amber-800"
      >
        <AlertTriangle className="h-3 w-3" />
        Sin responsable
      </Badge>
    );
  }

  const visibles = responsables.slice(0, 2);
  const restantes = responsables.length - visibles.length;

  if (responsables.length <= 2) {
    return (
      <div className="max-w-[14rem] space-y-0.5">
        {visibles.map((responsable) => (
          <p
            key={buildResponsableKey(responsable)}
            className="truncate font-medium leading-5 text-slate-700"
            title={responsable.nombre}
          >
            {responsable.nombre}
          </p>
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-[14rem] space-y-0.5">
      {visibles.map((responsable) => (
        <p
          key={buildResponsableKey(responsable)}
          className="truncate font-medium leading-5 text-slate-700"
          title={responsable.nombre}
        >
          {responsable.nombre}
        </p>
      ))}
      <ResponsablesOverflowPopover responsables={responsables} restantes={restantes} />
    </div>
  );
}

function ResponsablesOverflowPopover({
  responsables,
  restantes,
}: {
  responsables: ResponsableActual[];
  restantes: number;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-fit px-2 text-xs font-medium text-sky-700 hover:bg-sky-50 hover:text-sky-800"
          aria-label={`Ver ${restantes} responsable${restantes === 1 ? "" : "s"} adicional${restantes === 1 ? "" : "es"}`}
        >
          <MoreHorizontal className="mr-1 h-3.5 w-3.5" />+{restantes} más
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[min(26rem,var(--radix-popover-content-available-width))] p-3"
        align="start"
      >
        <div className="space-y-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              Responsables actuales
            </p>
            <p className="mt-1 text-xs text-slate-500">
              La factura está en manos de {responsables.length} persona
              {responsables.length === 1 ? "" : "s"}.
            </p>
          </div>
          <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
            {responsables.map((responsable) => (
              <div
                key={buildResponsableKey(responsable)}
                className="rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-2"
              >
                <p className="text-sm font-medium text-slate-900">{responsable.nombre}</p>
                <p className="mt-0.5 text-xs text-slate-500">{responsable.email}</p>
              </div>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default function FacturacionFacturasPage() {
  const { status, hasAccess } = useFacturacionPage(RUTAS_SISTEMA.FACTURACION_FACTURAS);
  const { empresaActiva, empresaActivaInfo, empresasParaFiltro, empresasDisponibles } =
    useEmpresaFilter();
  const convex = useConvex();
  const [exporting, setExporting] = useState(false);
  const [query, setQuery] = useState("");
  const [documentoClase, setDocumentoClase] = useState<DocumentoClaseFiltro | "all">("all");
  const [tipoFlujo, setTipoFlujo] = useState<TipoFlujoFiltro | "all">("all");
  const [origen, setOrigen] = useState<OrigenFiltro | "all">("all");
  const [causacionEstado, setCausacionEstado] = useState<CausacionEstadoFiltro | "all">("all");
  const [estadosSeleccionados, setEstadosSeleccionados] = useState<string[]>([]);
  const [soloRechazos, setSoloRechazos] = useState(false);
  const [fechaEmisionDesde, setFechaEmisionDesde] = useState("");
  const [fechaEmisionHasta, setFechaEmisionHasta] = useState("");
  const [montoMinInput, setMontoMinInput] = useState("");
  const [montoMaxInput, setMontoMaxInput] = useState("");
  const [estadoPopoverOpen, setEstadoPopoverOpen] = useState(false);
  const [responsablePopoverOpen, setResponsablePopoverOpen] = useState(false);
  const [responsableSearch, setResponsableSearch] = useState("");
  const [responsablesSeleccionados, setResponsablesSeleccionados] = useState<
    ResponsableSeleccionado[]
  >([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(20);
  const [activeTab, setActiveTab] = useState<"listado" | "tiempos">("listado");
  const [cursor, setCursor] = useState<string | undefined>();
  const [cursorStack, setCursorStack] = useState<Array<string | undefined>>([]);
  const [listData, setListData] = useState<{
    page: FacturaListadoRow[];
    isDone: boolean;
    continueCursor: string;
  }>();
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const trimmedQuery = query.trim();
  const montoMin = parseMontoFiltro(montoMinInput);
  const montoMax = parseMontoFiltro(montoMaxInput);

  const hasActiveFilters =
    Boolean(trimmedQuery) ||
    documentoClase !== "all" ||
    tipoFlujo !== "all" ||
    origen !== "all" ||
    causacionEstado !== "all" ||
    estadosSeleccionados.length > 0 ||
    responsablesSeleccionados.length > 0 ||
    soloRechazos ||
    Boolean(fechaEmisionDesde) ||
    Boolean(fechaEmisionHasta) ||
    Boolean(montoMinInput.trim()) ||
    Boolean(montoMaxInput.trim());

  const resetPage = () => {
    setCurrentPage(1);
    setCursor(undefined);
    setCursorStack([]);
  };

  const clearFilters = () => {
    setQuery("");
    setDocumentoClase("all");
    setTipoFlujo("all");
    setOrigen("all");
    setCausacionEstado("all");
    setEstadosSeleccionados([]);
    setResponsablesSeleccionados([]);
    setSoloRechazos(false);
    setFechaEmisionDesde("");
    setFechaEmisionHasta("");
    setMontoMinInput("");
    setMontoMaxInput("");
    setResponsableSearch("");
    setResponsablePopoverOpen(false);
    setEstadoPopoverOpen(false);
    resetPage();
  };

  const toggleEstado = (estado: string) => {
    setEstadosSeleccionados((prev) => {
      const next = prev.includes(estado) ? prev.filter((e) => e !== estado) : [...prev, estado];
      return next;
    });
    resetPage();
  };

  const toggleResponsable = (responsable: ResponsableSeleccionado) => {
    setResponsablesSeleccionados((prev) => {
      const next = prev.some((item) => item.key === responsable.key)
        ? prev.filter((item) => item.key !== responsable.key)
        : [...prev, responsable];
      return next;
    });
    resetPage();
  };

  const responsablesScopeArgs = useMemo(() => {
    if (typeof empresaActiva === "number") {
      return { empresa: empresaActiva };
    }
    if (empresasParaFiltro.length > 0) {
      return { empresas: empresasParaFiltro };
    }
    return {};
  }, [empresaActiva, empresasParaFiltro]);

  const responsablesDisponibles = useQuery(
    api.facturacionFacturas.listarResponsablesActuales,
    responsablesScopeArgs
  ) as ResponsableActual[] | undefined;

  const responsablesDisponiblesFiltrados = useMemo(() => {
    const responsables = responsablesDisponibles ?? [];
    const normalizedSearch = responsableSearch.trim();
    if (!normalizedSearch) return responsables;
    return responsables.filter((responsable) =>
      matchesResponsableFilterSearch(responsable, normalizedSearch)
    );
  }, [responsablesDisponibles, responsableSearch]);

  const responsableUserIds = useMemo(() => {
    const ids: string[] = [];
    for (const responsable of responsablesSeleccionados) {
      if (responsable.kind !== "actual") continue;
      const userId = responsable.userId?.trim();
      if (userId) ids.push(userId);
    }
    return ids;
  }, [responsablesSeleccionados]);

  const responsableEmails = useMemo(() => {
    const emails: string[] = [];
    for (const responsable of responsablesSeleccionados) {
      if (responsable.kind !== "actual") continue;
      if (responsable.userId?.trim()) continue;
      const email = normalizeResponsableEmail(responsable.email);
      if (email) emails.push(email);
    }
    return emails;
  }, [responsablesSeleccionados]);

  const incluirSinResponsable = responsablesSeleccionados.some(
    (responsable) => responsable.kind === "sin_responsable"
  );

  const queryArgs = useMemo(() => {
    const base: {
      empresa?: number;
      empresas?: number[];
      busqueda?: string;
      documentoClase?: DocumentoClaseFiltro;
      estados?: string[];
      soloRechazos?: boolean;
      fechaEmisionDesde?: string;
      fechaEmisionHasta?: string;
      montoMin?: number;
      montoMax?: number;
      tipoFlujo?: TipoFlujoFiltro;
      origen?: OrigenFiltro;
      causacionEstado?: CausacionEstadoFiltro;
      responsableUserIds?: string[];
      responsableEmails?: string[];
      incluirSinResponsable?: boolean;
      page: number;
      pageSize: number;
    } = { page: currentPage, pageSize };
    if (typeof empresaActiva === "number") base.empresa = empresaActiva;
    else if (empresasParaFiltro.length > 0) base.empresas = empresasParaFiltro;
    if (trimmedQuery) base.busqueda = trimmedQuery;
    if (documentoClase !== "all") base.documentoClase = documentoClase;
    if (tipoFlujo !== "all") base.tipoFlujo = tipoFlujo;
    if (origen !== "all") base.origen = origen;
    if (causacionEstado !== "all") base.causacionEstado = causacionEstado;
    if (estadosSeleccionados.length > 0) base.estados = estadosSeleccionados;
    if (soloRechazos) base.soloRechazos = true;
    if (fechaEmisionDesde) base.fechaEmisionDesde = fechaEmisionDesde;
    if (fechaEmisionHasta) base.fechaEmisionHasta = fechaEmisionHasta;
    if (typeof montoMin === "number") base.montoMin = montoMin;
    if (typeof montoMax === "number") base.montoMax = montoMax;
    if (responsableUserIds.length > 0) base.responsableUserIds = responsableUserIds;
    if (responsableEmails.length > 0) base.responsableEmails = responsableEmails;
    if (incluirSinResponsable) base.incluirSinResponsable = true;
    return base;
  }, [
    empresaActiva,
    empresasParaFiltro,
    trimmedQuery,
    documentoClase,
    tipoFlujo,
    origen,
    causacionEstado,
    estadosSeleccionados,
    soloRechazos,
    fechaEmisionDesde,
    fechaEmisionHasta,
    montoMin,
    montoMax,
    responsableUserIds,
    responsableEmails,
    incluirSinResponsable,
    currentPage,
    pageSize,
  ]);

  const exportArgs = useMemo(() => {
    const { page: _page, pageSize: _pageSize, ...filters } = queryArgs;
    return filters;
  }, [queryArgs]);

  const listQuery = useMemo(() => {
    const params = new URLSearchParams();
    if (typeof empresaActiva === "number") params.set("empresas", String(empresaActiva));
    else if (empresasParaFiltro.length > 0) params.set("empresas", empresasParaFiltro.join(","));
    if (trimmedQuery) params.set("q", trimmedQuery);
    if (documentoClase !== "all") params.set("documentoClase", documentoClase);
    if (tipoFlujo !== "all") params.set("tipoFlujo", tipoFlujo);
    if (origen !== "all") params.set("origen", origen);
    if (causacionEstado !== "all") params.set("causacionEstado", causacionEstado);
    if (estadosSeleccionados.length > 0) params.set("estados", estadosSeleccionados.join(","));
    if (soloRechazos) params.set("soloRechazos", "true");
    if (fechaEmisionDesde) params.set("desde", fechaEmisionDesde);
    if (fechaEmisionHasta) params.set("hasta", fechaEmisionHasta);
    if (typeof montoMin === "number") params.set("montoMin", String(montoMin));
    if (typeof montoMax === "number") params.set("montoMax", String(montoMax));
    if (responsableUserIds.length > 0)
      params.set("responsableUserIds", responsableUserIds.join(","));
    if (responsableEmails.length > 0) params.set("responsableEmails", responsableEmails.join(","));
    if (incluirSinResponsable) params.set("sinResponsable", "true");
    params.set("pageSize", String(pageSize));
    if (cursor) params.set("cursor", cursor);
    return params.toString();
  }, [
    cursor,
    documentoClase,
    empresaActiva,
    empresasParaFiltro,
    estadosSeleccionados,
    causacionEstado,
    fechaEmisionDesde,
    fechaEmisionHasta,
    incluirSinResponsable,
    montoMax,
    montoMin,
    origen,
    pageSize,
    responsableEmails,
    responsableUserIds,
    soloRechazos,
    tipoFlujo,
    trimmedQuery,
  ]);

  useEffect(() => {
    let cancelled = false;
    setListLoading(true);
    setListError(null);
    fetch(`/api/billing/facturas/listado?${listQuery}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json()) as {
          page?: FacturaListadoRow[];
          isDone?: boolean;
          continueCursor?: string;
          error?: string;
        };
        if (!response.ok) throw new Error(payload.error ?? "No se pudo cargar el listado.");
        if (cancelled) return;
        setListData({
          page: payload.page ?? [],
          isDone: payload.isDone ?? true,
          continueCursor: payload.continueCursor ?? "",
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setListData(undefined);
        setListError(
          getFacturacionErrorMessage(error, "No se pudo cargar el listado de facturas.")
        );
      })
      .finally(() => {
        if (!cancelled) setListLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [listQuery]);

  const facturasData = listData?.page ?? [];
  const total = facturasData.length;
  const cargando = listLoading;
  const hasNextPage = listData?.isDone === false && Boolean(listData.continueCursor);

  const handleExportExcel = useCallback(async () => {
    if (facturasData.length === 0) {
      toast.warning("No hay facturas para exportar con los filtros actuales.");
      return;
    }

    setExporting(true);
    try {
      const rows = [];
      let cursor = 0;
      let isDone = false;

      while (!isDone) {
        const batch = await convex.query(api.facturacionFacturas.listarFilasParaExportar, {
          ...exportArgs,
          cursor,
          batchSize: 500,
        });
        rows.push(...batch.rows);
        cursor = batch.cursor;
        isDone = batch.isDone;
      }

      const facturaIdsWithCruces = rows
        .filter((row) => row.cantidadCrucesDocumentosInternos > 0)
        .map((row) => row.facturaId);
      const crucesInternos = [];
      const chunkSize = 25;
      for (let index = 0; index < facturaIdsWithCruces.length; index += chunkSize) {
        const chunk = facturaIdsWithCruces.slice(index, index + chunkSize);
        let crucesCursor = "0";
        let crucesDone = false;
        while (!crucesDone) {
          const page = await convex.query(
            api.facturacionCrucesDocumentosInternos.listarCrucesInternosActivosParaExportacion,
            {
              facturaIds: chunk,
              paginationOpts: { numItems: 50, cursor: crucesCursor },
            }
          );
          for (const item of page.page) {
            crucesInternos.push({
              empresa: item.factura.empresa,
              facturaRecibida: item.factura.numeroFactura,
              proveedorNombre: item.factura.proveedorNombre,
              numeroInterno: item.cruce.numeroDocumento,
              valorAplicado: item.cruce.valorAplicado,
              moneda: item.cruce.moneda,
            });
          }
          crucesDone = page.isDone;
          crucesCursor = page.continueCursor;
        }
      }

      await exportarFacturasExcel({
        rows,
        crucesInternos,
        empresaActiva,
        empresaActivaInfo,
        fechaEmisionDesde,
        fechaEmisionHasta,
      });
      toast.success(`Excel exportado con ${rows.length} factura${rows.length === 1 ? "" : "s"}.`);
    } catch (error) {
      console.error("Error exportando facturas a Excel:", error);
      toast.error(
        getFacturacionErrorMessage(error, "No se pudo exportar el Excel. Intenta nuevamente.")
      );
    } finally {
      setExporting(false);
    }
  }, [
    convex,
    exportArgs,
    facturasData.length,
    empresaActiva,
    empresaActivaInfo,
    fechaEmisionDesde,
    fechaEmisionHasta,
  ]);

  if (status === "loading") return <Loading />;
  if (!hasAccess) return <NoAutorizado />;

  return (
    <div className="space-y-6 px-4 py-5 sm:px-6 lg:px-8">
      <DashboardHero
        title="Facturas"
        description={
          empresaActivaInfo
            ? `Facturas de ${empresaActivaInfo.nombre}, responsable actual y estado del flujo.`
            : "Consulta la información extraída del XML DIAN, el responsable actual y el estado del flujo de pago."
        }
        icon={<UploadCloud className="h-8 w-8" />}
        gradientClassName="from-slate-950 via-sky-950 to-slate-900"
      />

      <div
        className="flex items-center gap-1 rounded-2xl border border-slate-200 bg-slate-50 p-1"
        role="tablist"
        aria-label="Reportes de facturas"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "listado"}
          onClick={() => setActiveTab("listado")}
          className={cn(
            "rounded-xl px-4 py-2 text-sm font-medium transition",
            activeTab === "listado"
              ? "bg-white text-slate-950 shadow-xs"
              : "text-slate-500 hover:text-slate-800"
          )}
        >
          Listado
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "tiempos"}
          onClick={() => setActiveTab("tiempos")}
          className={cn(
            "rounded-xl px-4 py-2 text-sm font-medium transition",
            activeTab === "tiempos"
              ? "bg-white text-slate-950 shadow-xs"
              : "text-slate-500 hover:text-slate-800"
          )}
        >
          Tiempos del proceso
        </button>
      </div>

      {activeTab === "tiempos" ? (
        <TiemposFacturasReport
          empresas={empresasParaFiltro.length > 0 ? empresasParaFiltro : empresasDisponibles}
        />
      ) : null}

      {activeTab === "listado" ? (
        <div className="space-y-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="relative w-full max-w-md">
              <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
              <input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  resetPage();
                }}
                placeholder="Buscar proveedor, NIT, factura, FP, descripción o responsable…"
                className="h-11 w-full rounded-2xl border border-slate-200 bg-white pl-10 pr-4 text-sm outline-hidden ring-0 transition focus:border-slate-300"
              />
            </div>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-600 sm:min-w-[250px]">
                <span>
                  {cargando
                    ? "Cargando…"
                    : `${total} factura${total === 1 ? "" : "s"} en esta página`}
                </span>
                <label className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-400">
                  <span>Ver</span>
                  <select
                    value={pageSize}
                    onChange={(event) => {
                      setPageSize(Number(event.target.value) as (typeof PAGE_SIZE_OPTIONS)[number]);
                      resetPage();
                    }}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1 pr-8 text-sm text-slate-700 outline-hidden"
                  >
                    {PAGE_SIZE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <Button
                variant="outline"
                onClick={() => void handleExportExcel()}
                disabled={cargando || exporting || total === 0}
              >
                {exporting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <FileDown className="mr-2 h-4 w-4" />
                )}
                {exporting ? "Exportando..." : "Descargar Excel"}
              </Button>
              <Button asChild variant="outline">
                <Link href="/billing/invoices/validate-dian">
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  VALIDAR FACTURAS DIAN
                </Link>
              </Button>
              <Button asChild>
                <Link href="/billing/upload">
                  <UploadCloud className="mr-2 h-4 w-4" />
                  Cargar XML
                </Link>
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3">
            <Select
              value={documentoClase}
              onValueChange={(value) => {
                setDocumentoClase(value as DocumentoClaseFiltro | "all");
                resetPage();
              }}
            >
              <SelectTrigger className="h-9 w-[150px] rounded-xl border-slate-200 text-sm">
                <SelectValue placeholder="Documento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los documentos</SelectItem>
                <SelectItem value="factura">Factura</SelectItem>
                <SelectItem value="nota_credito">Nota crédito</SelectItem>
                <SelectItem value="nota_debito">Nota débito</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={tipoFlujo}
              onValueChange={(value) => {
                setTipoFlujo(value as TipoFlujoFiltro | "all");
                resetPage();
              }}
            >
              <SelectTrigger className="h-9 w-[190px] rounded-xl border-slate-200 text-sm">
                <SelectValue placeholder="Tipo flujo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los flujos</SelectItem>
                <SelectItem value="peajes">Peajes</SelectItem>
                <SelectItem value="legalizacion_anticipo">Legalización anticipo</SelectItem>
                <SelectItem value="legalizacion_caja_menor">Legalización caja menor</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={origen}
              onValueChange={(value) => {
                setOrigen(value as OrigenFiltro | "all");
                resetPage();
              }}
            >
              <SelectTrigger className="h-9 w-[170px] rounded-xl border-slate-200 text-sm">
                <SelectValue placeholder="Origen" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los orígenes</SelectItem>
                <SelectItem value="correo">Correo</SelectItem>
                <SelectItem value="carga_manual">Carga manual</SelectItem>
                <SelectItem value="recibo_fisico">Recibo físico</SelectItem>
                <SelectItem value="documento_fisico">Documento físico</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={causacionEstado}
              onValueChange={(value) => {
                setCausacionEstado(value as CausacionEstadoFiltro | "all");
                resetPage();
              }}
            >
              <SelectTrigger className="h-9 w-[170px] rounded-xl border-slate-200 text-sm">
                <SelectValue placeholder="Causación" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toda causación</SelectItem>
                <SelectItem value="causado">Causado</SelectItem>
                <SelectItem value="no_causado">No causado</SelectItem>
                <SelectItem value="sin_registro">Sin registro</SelectItem>
              </SelectContent>
            </Select>

            <Popover
              open={responsablePopoverOpen}
              onOpenChange={(open) => {
                setResponsablePopoverOpen(open);
                if (!open) setResponsableSearch("");
              }}
            >
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="h-9 gap-1 rounded-xl border-slate-200 text-sm font-normal"
                >
                  {responsablesSeleccionados.length > 0
                    ? `Responsable actual (${responsablesSeleccionados.length})`
                    : "Responsable actual"}
                  <ChevronDown className="h-4 w-4 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="w-[min(34rem,var(--radix-popover-content-available-width))] p-0"
                align="start"
              >
                <div className="border-b border-slate-100 px-3 py-2.5">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
                    <input
                      value={responsableSearch}
                      onChange={(event) => setResponsableSearch(event.target.value)}
                      placeholder="Buscar por nombre o correo..."
                      className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-9 text-sm outline-hidden focus:border-slate-300"
                    />
                    {responsableSearch ? (
                      <button
                        type="button"
                        onClick={() => setResponsableSearch("")}
                        className="absolute right-2.5 top-2.5 rounded-md p-1 text-slate-400 hover:text-slate-600"
                        aria-label="Limpiar búsqueda de responsable"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="max-h-[min(24rem,var(--radix-popover-content-available-height))] overflow-y-auto p-2">
                  <label className="flex cursor-pointer items-start gap-3 rounded-xl px-3 py-2 hover:bg-slate-50">
                    <Checkbox
                      checked={responsablesSeleccionados.some(
                        (responsable) => responsable.key === RESPONSABLE_SIN_KEY
                      )}
                      onCheckedChange={() => toggleResponsable(buildSinResponsableSelection())}
                      className="mt-0.5 border-slate-300"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-slate-700">
                        Sin responsable
                      </span>
                      <span className="block text-xs text-slate-500">
                        Facturas activas sin asignación válida.
                      </span>
                    </span>
                  </label>

                  <div className="px-3 pb-2 pt-3 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Responsables activos
                  </div>

                  {responsablesDisponibles === undefined ? (
                    <div className="flex items-center gap-2 px-3 py-3 text-sm text-slate-500">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Cargando responsables...
                    </div>
                  ) : responsablesDisponiblesFiltrados.length > 0 ? (
                    responsablesDisponiblesFiltrados.map((responsable) => {
                      const selection = buildResponsableSelection(responsable);
                      const isSelected = responsablesSeleccionados.some(
                        (item) => item.key === selection.key
                      );
                      return (
                        <label
                          key={selection.key}
                          className={cn(
                            "flex cursor-pointer items-start gap-3 rounded-xl px-3 py-2 hover:bg-slate-50",
                            isSelected && "bg-sky-50/80 hover:bg-sky-50"
                          )}
                        >
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleResponsable(selection)}
                            className="mt-0.5 border-slate-300"
                          />
                          <span className="min-w-0 flex-1">
                            <span
                              className={cn(
                                "block text-sm text-slate-700",
                                isSelected && "font-medium text-sky-900"
                              )}
                            >
                              {responsable.nombre}
                            </span>
                            <span className="block text-xs text-slate-500">
                              {responsable.email}
                            </span>
                          </span>
                        </label>
                      );
                    })
                  ) : (
                    <div className="px-3 py-3 text-sm text-slate-500">
                      {responsableSearch.trim()
                        ? "No coincide ningún responsable."
                        : "No hay responsables activos para este alcance."}
                    </div>
                  )}
                </div>
                <div className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
                  {responsablesDisponibles === undefined
                    ? "Cargando opciones..."
                    : `${responsablesDisponiblesFiltrados.length} de ${responsablesDisponibles.length} responsables activos`}
                </div>
              </PopoverContent>
            </Popover>

            <Popover open={estadoPopoverOpen} onOpenChange={setEstadoPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="h-9 gap-1 rounded-xl border-slate-200 text-sm font-normal"
                >
                  {estadosSeleccionados.length > 0
                    ? `Estado (${estadosSeleccionados.length})`
                    : "Estado"}
                  <ChevronDown className="h-4 w-4 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-2" align="start">
                <div className="max-h-64 space-y-1 overflow-y-auto">
                  {ESTADO_OPCIONES.map(({ value, label }) => (
                    <label
                      key={value}
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50"
                    >
                      <Checkbox
                        checked={estadosSeleccionados.includes(value)}
                        onCheckedChange={() => toggleEstado(value)}
                        className="border-slate-300"
                      />
                      <span className="text-slate-700">{label}</span>
                    </label>
                  ))}
                </div>
              </PopoverContent>
            </Popover>

            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={fechaEmisionDesde}
                onChange={(event) => {
                  setFechaEmisionDesde(event.target.value);
                  resetPage();
                }}
                className="h-9 rounded-xl border border-slate-200 bg-white px-2 text-sm text-slate-700 outline-hidden focus:border-slate-300"
                title="Emisión desde"
              />
              <span className="text-xs text-slate-400">—</span>
              <input
                type="date"
                value={fechaEmisionHasta}
                onChange={(event) => {
                  setFechaEmisionHasta(event.target.value);
                  resetPage();
                }}
                className="h-9 rounded-xl border border-slate-200 bg-white px-2 text-sm text-slate-700 outline-hidden focus:border-slate-300"
                title="Emisión hasta"
              />
            </div>

            <div className="flex items-center gap-1.5">
              <input
                type="text"
                inputMode="numeric"
                value={montoMinInput}
                onChange={(event) => {
                  setMontoMinInput(event.target.value);
                  resetPage();
                }}
                placeholder="Monto mín."
                className="h-9 w-28 rounded-xl border border-slate-200 bg-white px-2 text-sm text-slate-700 outline-hidden focus:border-slate-300"
              />
              <span className="text-xs text-slate-400">—</span>
              <input
                type="text"
                inputMode="numeric"
                value={montoMaxInput}
                onChange={(event) => {
                  setMontoMaxInput(event.target.value);
                  resetPage();
                }}
                placeholder="Monto máx."
                className="h-9 w-28 rounded-xl border border-slate-200 bg-white px-2 text-sm text-slate-700 outline-hidden focus:border-slate-300"
              />
            </div>

            <Button
              type="button"
              variant={soloRechazos ? "default" : "outline"}
              className={cn(
                "h-9 rounded-xl",
                soloRechazos ? "bg-rose-600 hover:bg-rose-700" : "border-slate-200"
              )}
              onClick={() => {
                setSoloRechazos((prev) => !prev);
                resetPage();
              }}
            >
              Rechazos
              {soloRechazos ? <X className="ml-1.5 h-3.5 w-3.5" /> : null}
            </Button>

            {hasActiveFilters ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9 rounded-xl text-slate-600"
                onClick={clearFilters}
              >
                Limpiar filtros
              </Button>
            ) : null}
          </div>

          {hasActiveFilters ? (
            <div className="flex flex-wrap items-center gap-2">
              {trimmedQuery ? (
                <Badge variant="outline" className="rounded-full bg-slate-50">
                  Búsqueda: {trimmedQuery}
                </Badge>
              ) : null}
              {documentoClase !== "all" ? (
                <Badge variant="outline" className="rounded-full bg-slate-50">
                  Documento: {documentoClase.replace("_", " ")}
                </Badge>
              ) : null}
              {tipoFlujo !== "all" ? (
                <Badge variant="outline" className="rounded-full bg-slate-50">
                  Flujo: {TIPO_FLUJO_LABELS[tipoFlujo]}
                </Badge>
              ) : null}
              {origen !== "all" ? (
                <Badge variant="outline" className="rounded-full bg-slate-50">
                  Origen: {ORIGEN_LABELS[origen]}
                </Badge>
              ) : null}
              {causacionEstado !== "all" ? (
                <Badge variant="outline" className="rounded-full bg-slate-50">
                  Causación: {CAUSACION_ESTADO_LABELS[causacionEstado]}
                </Badge>
              ) : null}
              {responsablesSeleccionados.map((responsable) => (
                <Badge
                  key={responsable.key}
                  variant="outline"
                  className={cn(
                    "rounded-full bg-slate-50",
                    responsable.kind === "sin_responsable" &&
                      "border-amber-200 bg-amber-50 text-amber-800"
                  )}
                >
                  Responsable: {responsableSelectionLabel(responsable)}
                </Badge>
              ))}
              {estadosSeleccionados.map((estado) => (
                <Badge key={estado} variant="outline" className="rounded-full bg-slate-50">
                  {FACTURACION_STATUS_LABELS[estado] ?? estado}
                </Badge>
              ))}
              {soloRechazos ? (
                <Badge variant="outline" className="rounded-full bg-rose-50 text-rose-700">
                  Rechazos
                </Badge>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {activeTab === "listado" ? (
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xs">
          <div className="overflow-x-auto">
            <table className="min-w-[1640px] w-full table-fixed text-sm">
              <colgroup>
                <col className="w-[250px]" />
                <col className="w-[165px]" />
                <col className="w-[130px]" />
                <col className="w-[165px]" />
                <col className="w-[170px]" />
                <col className="w-[130px]" />
                <col className="w-[130px]" />
                <col className="w-[180px]" />
                <col className="w-[250px]" />
                <col className="w-[140px]" />
              </colgroup>
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.14em] text-slate-500">
                <tr>
                  <th className="px-5 py-3.5">Proveedor</th>
                  <th className="px-5 py-3.5">Factura</th>
                  <th className="px-5 py-3.5">Emisión</th>
                  <th className="px-5 py-3.5 text-right">Valor contable</th>
                  <th className="px-5 py-3.5 text-right">Valor a pagar</th>
                  <th className="px-5 py-3.5">Causado</th>
                  <th className="px-5 py-3.5">Número FP</th>
                  <th className="px-5 py-3.5">Estado</th>
                  <th className="px-5 py-3.5">Responsable actual</th>
                  <th className="px-5 py-3.5">Actualización</th>
                </tr>
              </thead>
              <tbody>
                {facturasData.map((factura) => {
                  const empresaAccent = getEmpresaAccentStyle(factura.empresa ?? 1);
                  const estado = resolveFacturaEstadoFromRow({
                    factura: { ...factura, estadoResuelto: factura.estadoResuelto },
                    tarea: factura.tarea,
                  });

                  return (
                    <tr
                      key={factura._id}
                      className="border-t border-slate-200/80 align-middle"
                      style={{
                        boxShadow: `inset 3px 0 0 ${empresaAccent.rowBorder}`,
                      }}
                    >
                      <td className="px-5 py-3.5 align-middle">
                        <Link
                          href={`/billing/invoices/${factura._id}`}
                          className="block truncate font-semibold leading-5 text-slate-900 hover:underline"
                          title={factura.proveedorNombre}
                        >
                          {factura.proveedorNombre}
                        </Link>
                        <p className="mt-0.5 truncate text-xs leading-5 text-slate-500">
                          NIT {factura.proveedorNit}
                        </p>
                      </td>
                      <td className="px-5 py-3.5 align-middle">
                        <Link
                          href={`/billing/invoices/${factura._id}`}
                          className="block truncate font-mono text-xs font-semibold leading-5 text-slate-800 hover:underline"
                          title={factura.numeroFactura}
                        >
                          {factura.numeroFactura}
                        </Link>
                        <div className="mt-0.5 flex items-center gap-1.5 whitespace-nowrap text-xs leading-5 text-slate-500">
                          <span>{getDocumentoLabel(factura)}</span>
                          {factura.isFisico ? (
                            <Badge
                              variant="outline"
                              className="h-5 border-violet-200 bg-violet-50 px-1.5 text-[10px] leading-none text-violet-700"
                            >
                              <FilePlus2 className="mr-1 h-2.5 w-2.5" />
                              Físico
                            </Badge>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 align-middle whitespace-nowrap text-slate-600">
                        {formatDate(factura.fechaEmision)}
                      </td>
                      <td className="px-5 py-3.5 align-middle whitespace-nowrap text-right font-semibold tabular-nums text-slate-900">
                        {formatCurrency(getValorContable(factura), factura.moneda)}
                      </td>
                      <td className="px-5 py-3.5 align-middle text-right">
                        {estado && shouldShowValorAPagar(estado, factura) ? (
                          <div className="space-y-0.5 text-right">
                            <p className="whitespace-nowrap font-semibold tabular-nums text-emerald-700">
                              {formatCurrency(
                                getValorAPagarDisplay({ factura, fase: estado }) ?? 0,
                                factura.moneda
                              )}
                            </p>
                            {(factura.cantidadCrucesDocumentosInternos ?? 0) > 0 ? (
                              <p className="whitespace-nowrap text-[11px] font-medium text-slate-500">
                                {factura.cantidadCrucesDocumentosInternos} cruce
                                {(factura.cantidadCrucesDocumentosInternos ?? 0) === 1 ? "" : "s"} ·{" "}
                                {formatCurrency(
                                  factura.valorCrucesDocumentosInternos ?? 0,
                                  factura.moneda
                                )}
                              </p>
                            ) : null}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-5 py-3.5 align-middle whitespace-nowrap text-slate-700">
                        {formatCausacionEstadoLabel(deriveCausacionEstado(factura.causado))}
                      </td>
                      <td className="px-5 py-3.5 align-middle whitespace-nowrap font-mono text-xs text-slate-700">
                        {formatFpDisplay(
                          factura.causado === undefined ? null : factura.causado,
                          factura.numeroFp
                        )}
                      </td>
                      <td className="px-5 py-3.5 align-middle whitespace-nowrap">
                        {estado ? <FacturacionStatusBadge estado={estado} /> : "-"}
                      </td>
                      <td className="px-5 py-3.5 align-middle text-slate-500">
                        <ResponsableActualCell
                          responsables={factura.responsablesActuales}
                          responsabilidadEstado={factura.responsabilidadEstado}
                        />
                      </td>
                      <td className="px-5 py-3.5 align-middle whitespace-nowrap text-slate-500">
                        {timeAgo(factura.actualizadoEn)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {listError ? (
            <div className="border-t border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-800">
              <div className="flex items-center justify-between gap-3">
                <span>{listError}</span>
                <Button type="button" variant="outline" size="sm" onClick={() => resetPage()}>
                  Reintentar
                </Button>
              </div>
            </div>
          ) : null}
          {!cargando && !listError && facturasData.length === 0 ? (
            <div className="border-t border-slate-200 px-5 py-10 text-center text-sm text-slate-500">
              No hay facturas para los filtros actuales.
            </div>
          ) : null}

          {total > 0 || currentPage > 1 || hasNextPage ? (
            <div className="flex flex-col gap-3 border-t border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-sm font-medium text-slate-600">
                Página {currentPage} · Mostrando {total} factura{total === 1 ? "" : "s"}
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const previousCursor = cursorStack[cursorStack.length - 1];
                    setCursorStack((stack) => stack.slice(0, -1));
                    setCursor(previousCursor);
                    setCurrentPage((page) => Math.max(page - 1, 1));
                  }}
                  disabled={currentPage === 1 || cargando}
                  className="border-slate-200 hover:bg-slate-100"
                >
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (!listData?.continueCursor) return;
                    setCursorStack((stack) => [...stack, cursor]);
                    setCursor(listData.continueCursor);
                    setCurrentPage((page) => page + 1);
                  }}
                  disabled={!hasNextPage || cargando}
                  className="border-slate-200 hover:bg-slate-100"
                >
                  Siguiente
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
