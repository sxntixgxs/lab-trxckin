"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useConvex, useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { useSession } from "@/hooks/useCurrentUser";
import {
  AlertCircle,
  ArrowDownUp,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Inbox,
  Receipt,
  Search,
  WalletCards,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { getFacturacionErrorMessage } from "../lib/user-facing-error";

import Loading from "../../loading";
import NoAutorizado from "@/app/no-autorizado";
import {
  ReembolsoReviewDialog,
  type ReembolsoModalTarget,
} from "@/components/cajas-menores";
import { downloadReembolsoFormatoPdf } from "@/components/cajas-menores/reembolso-formato-pdf";
import {
  ReembolsoReasignarDialog,
} from "@/components/cajas-menores/reembolso-reasignar-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useEmpresaFilter } from "@/hooks/useEmpresaFilter";
import { useUserPermissions } from "@/hooks/useHasAccess";
import { useSidebarState } from "@/hooks/useSidebarState";
import { formatCOP } from "@/lib/format";
import { getEmpresaNombre } from "@/lib/empresas";
import { RUTAS_SISTEMA } from "@/lib/rutas-sistema";
import { cn } from "@/lib/utils";
import {
  mergeFacturacionUsuarios,
  useFacturacionUsersByEmpresa,
} from "../hooks/use-facturacion-users";
import { KpiCard } from "../inbox/_components/kpi-card";

import {
  BANDEJA_LIST_LOAD_SIZE,
  dedupeSolicitudes,
  FASE_OPCIONES,
  filterSolicitudesLoaded,
  getPaginationItems,
  mergePageSelections,
  PAGE_SIZE_OPTIONS,
  paginateLoadedRows,
  pickInitialExpandedCaja,
  resolveInitialView,
  sortCajasForFacturas,
  type BandejaPageSize,
  type BandejaView,
  type SolicitudesAlcance,
} from "./_components/bandeja-helpers";
import { BandejaEmptyState, BandejaSkeletonRows } from "./_components/bandeja-ui";
import { MovimientoBandejaRow } from "./_components/movimiento-bandeja-row";
import {
  ReembolsoGenerationDialog,
  type ReembolsoGenerationSubmit,
} from "./_components/reembolso-generation-dialog";
import { intersectSelectedWithAvailable } from "./_components/reembolso-selection";
import { SolicitudBandejaCard } from "./_components/solicitud-bandeja-card";
import type {
  BandejaCaja,
  MovimientoBandejaRow as MovimientoRow,
  SolicitudBandejaRow as SolicitudRow,
} from "./_components/types";

function BandejaPaginationFooter({
  label,
  filteredCount,
  pageStart,
  pageEnd,
  safeCurrentPage,
  totalPages,
  pageItems,
  canLoadMore,
  isLoadingMore,
  onPrevious,
  onNext,
  onPage,
  onLoadMore,
}: {
  label: string;
  filteredCount: number;
  pageStart: number;
  pageEnd: number;
  safeCurrentPage: number;
  totalPages: number;
  pageItems: Array<number | string>;
  canLoadMore: boolean;
  isLoadingMore: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onPage: (page: number) => void;
  onLoadMore: () => void;
}) {
  if (filteredCount === 0) return null;

  return (
    <div className="flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-sm font-medium text-slate-600">
        Página {safeCurrentPage} de {totalPages}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-xl border-slate-200 bg-white"
          disabled={safeCurrentPage === 1}
          onClick={onPrevious}
        >
          Anterior
        </Button>
        {pageItems.map((item) =>
          typeof item === "number" ? (
            <Button
              key={item}
              type="button"
              variant={item === safeCurrentPage ? "default" : "outline"}
              size="sm"
              className={
                item === safeCurrentPage
                  ? "min-w-9 rounded-xl bg-slate-900"
                  : "min-w-9 rounded-xl border-slate-200 bg-white"
              }
              onClick={() => onPage(item)}
            >
              {item}
            </Button>
          ) : (
            <span key={item} className="px-1 text-sm text-slate-400">
              ...
            </span>
          ),
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-xl border-slate-200 bg-white"
          disabled={safeCurrentPage === totalPages}
          onClick={onNext}
        >
          Siguiente
        </Button>
        {canLoadMore || isLoadingMore ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-xl border-slate-200 bg-white"
            disabled={!canLoadMore}
            onClick={onLoadMore}
          >
            {isLoadingMore ? "Cargando..." : "Cargar más"}
          </Button>
        ) : null}
      </div>
      <span className="text-xs text-slate-500 sm:hidden">
        Mostrando {pageStart}-{pageEnd} de {filteredCount} {label}
      </span>
    </div>
  );
}

export default function ReembolsoCajaMenorPage() {
  const convex = useConvex();
  const { data: session, status } = useSession();
  const {
    empresaActiva,
    empresaActivaInfo,
    empresasParaFiltro,
    empresasDisponibles,
    opcionesSelector,
    setEmpresaActiva,
  } = useEmpresaFilter();
  const actorUserId = session?.user?.id;
  const actorRol = session?.user?.id_rol;
  const actorNombre = session?.user?.nombre || session?.user?.email || "Usuario";
  const actorEmail = session?.user?.email || "sin-correo@example.com";
  const { permisos, hasFullAccess, isLoading: permisosLoading } = useUserPermissions();
  const { isExpanded: sidebarExpanded, isLoaded: sidebarLoaded } = useSidebarState();

  const hasRouteAccess =
    hasFullAccess ||
    (permisos?.includes(RUTAS_SISTEMA.FACTURACION_REEMBOLSO_CAJA_MENOR) ?? false);

  const resumen = useQuery(
    api.cajaMenorBandejaQueries.obtenerResumenBandejaReembolsos,
    actorUserId
      ? {
          ...(empresasParaFiltro.length > 0 ? { empresas: empresasParaFiltro } : {}),
          actorUserId,
          actorRol,
        }
      : "skip",
  );

  const [view, setView] = useState<BandejaView>("solicitudes");
  const [alcance, setAlcance] = useState<SolicitudesAlcance>("todas");
  const [expandedCajaId, setExpandedCajaId] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [fasesSeleccionadas, setFasesSeleccionadas] = useState<string[]>([]);
  const [fasePopoverOpen, setFasePopoverOpen] = useState(false);
  const [cajaFiltro, setCajaFiltro] = useState<string>("all");
  const [actualizadoDesde, setActualizadoDesde] = useState("");
  const [actualizadoHasta, setActualizadoHasta] = useState("");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [solicitudesPage, setSolicitudesPage] = useState(1);
  const [facturasPage, setFacturasPage] = useState(1);
  const [solicitudesRowsPerPage, setSolicitudesRowsPerPage] = useState<BandejaPageSize>(20);
  const [facturasRowsPerPage, setFacturasRowsPerPage] = useState<BandejaPageSize>(20);
  const [selectedByCaja, setSelectedByCaja] = useState<Record<string, string[]>>({});
  const [detailsTarget, setDetailsTarget] = useState<ReembolsoModalTarget | null>(null);
  const [actionTarget, setActionTarget] = useState<ReembolsoModalTarget | null>(null);
  const [reasignarTarget, setReasignarTarget] = useState<SolicitudRow | null>(null);
  const [generationCaja, setGenerationCaja] = useState<BandejaCaja | null>(null);
  const [devolverLoadingId, setDevolverLoadingId] = useState<string | null>(null);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [downloadLoadingId, setDownloadLoadingId] = useState<string | null>(null);
  const initialViewApplied = useRef(false);

  const cajas = useMemo((): BandejaCaja[] => {
    const rows = resumen?.cajas ?? [];
    if (typeof empresaActiva === "number") {
      return rows.filter((caja: BandejaCaja) => caja.empresaId === empresaActiva);
    }
    return rows;
  }, [resumen?.cajas, empresaActiva]);

  useEffect(() => {
    if (!resumen || initialViewApplied.current) return;
    const initial = resolveInitialView({
      accionesAsignadas: resumen.kpis.accionesAsignadas,
      facturasPendientes: resumen.kpis.facturasPendientes,
      solicitudesActivas: resumen.kpis.solicitudesActivas,
      canGenerate: resumen.canGenerate,
    });
    setView(initial.view);
    setAlcance(initial.alcance);
    setExpandedCajaId(pickInitialExpandedCaja(initial.view, cajas));
    initialViewApplied.current = true;
  }, [cajas, resumen]);

  useEffect(() => {
    initialViewApplied.current = false;
  }, [empresaActiva]);

  useEffect(() => {
    if (view === "facturas" && !expandedCajaId) {
      setExpandedCajaId(pickInitialExpandedCaja("facturas", cajas));
    }
  }, [cajas, expandedCajaId, view]);

  const solicitudesQueryArgs = useMemo(() => {
    if (!actorUserId || view !== "solicitudes") return "skip" as const;
    return {
      ...(empresasParaFiltro.length > 0 ? { empresas: empresasParaFiltro } : {}),
      actorUserId,
      actorRol,
    };
  }, [actorRol, actorUserId, empresasParaFiltro, view]);

  const expandedCaja = cajas.find((caja) => String(caja.cajaMenorId) === expandedCajaId) ?? null;

  const movimientosQueryArgs =
    view === "facturas" && expandedCaja && actorUserId
      ? {
          cajaMenorId: expandedCaja.cajaMenorId,
          actorUserId,
          actorRol,
        }
      : "skip";

  const solicitudesQuery = usePaginatedQuery(
    api.cajaMenorBandejaQueries.listarSolicitudesReembolsoBandejaPaginadas,
    solicitudesQueryArgs,
    { initialNumItems: BANDEJA_LIST_LOAD_SIZE },
  );

  const movimientosQuery = usePaginatedQuery(
    api.cajaMenorBandejaQueries.listarMovimientosPendientesCajaPaginados,
    movimientosQueryArgs,
    { initialNumItems: BANDEJA_LIST_LOAD_SIZE },
  );

  const approverEmpresasScope = useMemo(
    () => (typeof empresaActiva === "number" ? [empresaActiva] : empresasDisponibles),
    [empresaActiva, empresasDisponibles],
  );
  const { usuariosPorEmpresa, isLoading: usuariosLoading } = useFacturacionUsersByEmpresa(
    approverEmpresasScope,
    { includeGlobalAccess: true, enabled: approverEmpresasScope.length > 0 },
  );
  const usuariosAprobadores = useMemo(
    () => mergeFacturacionUsuarios(...Object.values(usuariosPorEmpresa)),
    [usuariosPorEmpresa],
  );

  const generarReembolso = useMutation(api.cajasMenores.generarReembolsoCajaMenor);
  const devolverABuzon = useMutation(api.cajasMenores.devolverMovimientoABuzon);

  const solicitudesLoaded = useMemo(
    () => dedupeSolicitudes((solicitudesQuery.results ?? []) as SolicitudRow[]),
    [solicitudesQuery.results],
  );

  const movimientosLoaded = useMemo(
    () => (movimientosQuery.results ?? []) as MovimientoRow[],
    [movimientosQuery.results],
  );

  const filteredSolicitudes = useMemo(
    () =>
      filterSolicitudesLoaded(solicitudesLoaded, {
        alcance,
        fases: fasesSeleccionadas,
        cajaFiltro,
        actualizadoDesde,
        actualizadoHasta,
        busqueda,
        sortDirection,
      }),
    [
      alcance,
      actualizadoDesde,
      actualizadoHasta,
      busqueda,
      cajaFiltro,
      fasesSeleccionadas,
      solicitudesLoaded,
      sortDirection,
    ],
  );

  const solicitudesPagination = useMemo(
    () => paginateLoadedRows(filteredSolicitudes, solicitudesPage, solicitudesRowsPerPage),
    [filteredSolicitudes, solicitudesPage, solicitudesRowsPerPage],
  );

  const filteredMovimientos = movimientosLoaded;

  const facturasPagination = useMemo(
    () => paginateLoadedRows(filteredMovimientos, facturasPage, facturasRowsPerPage),
    [filteredMovimientos, facturasPage, facturasRowsPerPage],
  );

  useEffect(() => {
    setSolicitudesPage((page) =>
      Math.min(page, paginateLoadedRows(filteredSolicitudes, page, solicitudesRowsPerPage).totalPages),
    );
  }, [filteredSolicitudes, solicitudesRowsPerPage]);

  useEffect(() => {
    setFacturasPage((page) =>
      Math.min(page, paginateLoadedRows(filteredMovimientos, page, facturasRowsPerPage).totalPages),
    );
  }, [filteredMovimientos, facturasRowsPerPage]);

  const visibleMovimientoIds = facturasPagination.visibleRows.map((row) =>
    String(row.movimientoId),
  );

  const loadedMovimientoIds = useMemo(
    () => movimientosLoaded.map((row) => String(row.movimientoId)),
    [movimientosLoaded],
  );

  useEffect(() => {
    if (!expandedCajaId || view !== "facturas") return;
    setSelectedByCaja((current) => {
      const filtered = intersectSelectedWithAvailable(
        current[expandedCajaId] ?? [],
        loadedMovimientoIds,
      );
      if (filtered.length === (current[expandedCajaId] ?? []).length) return current;
      const next = { ...current, [expandedCajaId]: filtered };
      if (filtered.length === 0 && generationCaja) {
        setGenerationCaja(null);
        toast.info("Los movimientos seleccionados ya no están disponibles.");
      }
      return next;
    });
  }, [expandedCajaId, generationCaja, loadedMovimientoIds, view]);

  const selectedIds = expandedCajaId ? selectedByCaja[expandedCajaId] ?? [] : [];
  const selectedMovimientos = movimientosLoaded.filter((row) =>
    selectedIds.includes(String(row.movimientoId)),
  );
  const selectedValor = selectedMovimientos.reduce((sum, row) => sum + row.valor, 0);

  const seguimientoCount = Math.max(
    0,
    (resumen?.kpis.solicitudesActivas ?? 0) - (resumen?.kpis.accionesAsignadas ?? 0),
  );

  const hasActiveSolicitudFilters =
    fasesSeleccionadas.length > 0 ||
    cajaFiltro !== "all" ||
    Boolean(actualizadoDesde) ||
    Boolean(actualizadoHasta) ||
    Boolean(busqueda.trim()) ||
    sortDirection !== "desc";

  const resetSolicitudesPage = () => setSolicitudesPage(1);
  const resetFacturasPage = () => setFacturasPage(1);

  const clearSolicitudFilters = () => {
    setFasesSeleccionadas([]);
    setCajaFiltro("all");
    setActualizadoDesde("");
    setActualizadoHasta("");
    setBusqueda("");
    setSortDirection("desc");
    resetSolicitudesPage();
  };

  const toggleFase = (value: string) => {
    setFasesSeleccionadas((prev) =>
      prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value],
    );
    resetSolicitudesPage();
  };

  const toggleSortDirection = () => {
    setSortDirection((prev) => (prev === "desc" ? "asc" : "desc"));
    resetSolicitudesPage();
  };

  const handleDownloadFormato = useCallback(
    async (row: SolicitudRow) => {
      if (!actorUserId) return;
      setDownloadLoadingId(String(row.reembolsoId));
      try {
        const snapshot = await convex.query(api.cajasMenores.obtenerFormatoReembolsoCajaMenor, {
          reembolsoId: row.reembolsoId,
          actorUserId,
          actorRol,
        });
        if (!snapshot) {
          toast.error("No se pudo descargar el formato. La solicitud ya no está disponible.");
          return;
        }
        await downloadReembolsoFormatoPdf(snapshot, `${row.numeroReembolso}.pdf`);
      } catch (error) {
        toast.error(
          getFacturacionErrorMessage(
            error,
            "No se pudo generar el PDF. Intenta nuevamente.",
          ),
        );
      } finally {
        setDownloadLoadingId(null);
      }
    },
    [actorRol, actorUserId, convex],
  );

  async function handleGenerate(payload: ReembolsoGenerationSubmit) {
    if (!generationCaja || !actorUserId) return;
    setLoadingKey(`generate:${generationCaja.cajaMenorId}`);
    try {
      await generarReembolso({
        cajaMenorId: generationCaja.cajaMenorId,
        movimientoIds: payload.movimientoIds,
        centroCostoOverrides: payload.centroCostoOverrides,
        ...(payload.aprobacionLider ? { aprobacionLider: payload.aprobacionLider } : {}),
        custodioUserId: actorUserId,
        custodioNombre: actorNombre,
        custodioEmail: actorEmail,
        actorUserId,
        actorNombre,
        actorEmail,
        actorRol,
      });
      setSelectedByCaja((current) => ({
        ...current,
        [String(generationCaja.cajaMenorId)]: [],
      }));
      setGenerationCaja(null);
      toast.success("Solicitud de reembolso generada.");
    } catch (error) {
      toast.error(
        getFacturacionErrorMessage(
          error,
          "No se pudo generar el reembolso. Revisa la información e intenta nuevamente.",
        ),
      );
    } finally {
      setLoadingKey(null);
    }
  }

  async function handleDevolver(movimientoId: Id<"facturacionCajaMenorMovimientos">) {
    if (!actorUserId || !expandedCajaId) return;
    setDevolverLoadingId(String(movimientoId));
    try {
      await devolverABuzon({
        movimientoId,
        actorUserId,
        actorNombre,
        actorEmail,
        actorRol,
      });
      setSelectedByCaja((current) => ({
        ...current,
        [expandedCajaId]: (current[expandedCajaId] ?? []).filter(
          (id) => id !== String(movimientoId),
        ),
      }));
      toast.success("Documento devuelto a tu buzón.");
    } catch (error) {
      toast.error(
        getFacturacionErrorMessage(
          error,
          "No se pudo devolver el reembolso. Intenta nuevamente.",
        ),
      );
    } finally {
      setDevolverLoadingId(null);
    }
  }

  if (status === "loading" || permisosLoading || resumen === undefined) {
    return <Loading />;
  }
  if (!actorUserId || (!hasRouteAccess && !resumen.canAccess)) {
    return <NoAutorizado />;
  }

  const solicitudesCanLoadMore = solicitudesQuery.status === "CanLoadMore";
  const solicitudesLoadingMore = solicitudesQuery.status === "LoadingMore";
  const facturasCanLoadMore = movimientosQuery.status === "CanLoadMore";
  const facturasLoadingMore = movimientosQuery.status === "LoadingMore";
  const solicitudesLoadingFirst = solicitudesQuery.status === "LoadingFirstPage";
  const facturasLoadingFirst = movimientosQuery.status === "LoadingFirstPage";
  const showEmpresaLabel = typeof empresaActiva !== "number";
  const solicitudesPageItems = getPaginationItems(
    solicitudesPagination.safeCurrentPage,
    solicitudesPagination.totalPages,
  );
  const facturasPageItems = getPaginationItems(
    facturasPagination.safeCurrentPage,
    facturasPagination.totalPages,
  );

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-5 pb-24 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 md:flex-row md:items-center">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white">
              <WalletCards className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">Facturación</p>
              <h1 className="text-2xl font-semibold tracking-normal text-slate-950">
                Reembolso Caja Menor
              </h1>
              <p className="text-sm text-slate-500">
                {empresaActivaInfo?.nombre ?? "Todas las empresas"} · bandeja operativa compacta
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 md:ml-auto">
            <Badge variant="outline" className="rounded-full bg-white">
              {resumen.roleLabel}
            </Badge>
            <Button asChild variant="outline" className="rounded-xl bg-white">
              <Link href="/finance/petty-cash">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Dashboard Cajas Menores
              </Link>
            </Button>
          </div>
        </header>

        <section className="flex flex-wrap items-center gap-2">
          {opcionesSelector.map((opcion) => (
            <Button
              key={opcion.id ?? "all"}
              type="button"
              variant={empresaActiva === opcion.id ? "default" : "outline"}
              className="rounded-xl"
              onClick={() => setEmpresaActiva(opcion.id)}
            >
              {opcion.nombre}
            </Button>
          ))}
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            icon={<Receipt className="h-5 w-5" />}
            label="Facturas pendientes"
            value={`${resumen.kpis.facturasPendientes}`}
            helper="Movimientos disponibles para generar"
            tone="primary"
          />
          <KpiCard
            icon={<WalletCards className="h-5 w-5" />}
            label="Valor por reembolsar"
            value={formatCOP(resumen.kpis.valorPendiente)}
            helper="Total pendiente en cajas visibles"
            tone="accent"
          />
          <KpiCard
            icon={<AlertCircle className="h-5 w-5" />}
            label="Acciones asignadas"
            value={`${resumen.kpis.accionesAsignadas}`}
            helper="Solicitudes que requieren tu acción"
            tone="warning"
          />
          <KpiCard
            icon={<CheckCircle2 className="h-5 w-5" />}
            label="Solicitudes activas"
            value={`${resumen.kpis.solicitudesActivas}`}
            helper="En seguimiento en el alcance actual"
            tone="primary"
          />
        </section>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={view === "solicitudes" ? "default" : "outline"}
            className={cn(
              "rounded-xl",
              view === "solicitudes" ? "bg-slate-900 hover:bg-slate-800" : "bg-white",
            )}
            onClick={() => setView("solicitudes")}
          >
            Solicitudes
          </Button>
          <Button
            type="button"
            variant={view === "facturas" ? "default" : "outline"}
            className={cn(
              "rounded-xl",
              view === "facturas" ? "bg-slate-900 hover:bg-slate-800" : "bg-white",
            )}
            onClick={() => setView("facturas")}
          >
            Facturas por reembolsar
          </Button>
        </div>

        {view === "solicitudes" ? (
          <>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["todas", "Todas", resumen.kpis.solicitudesActivas],
                  ["accion", "Requieren mi acción", resumen.kpis.accionesAsignadas],
                  ["seguimiento", "Seguimiento", seguimientoCount],
                ] as const
              ).map(([key, label, count]) => (
                <Button
                  key={key}
                  type="button"
                  variant={alcance === key ? "default" : "outline"}
                  className={cn(
                    "rounded-full",
                    alcance === key ? "bg-slate-900 hover:bg-slate-800" : "bg-white",
                  )}
                  onClick={() => {
                    setAlcance(key);
                    resetSolicitudesPage();
                  }}
                >
                  {label}
                  <span
                    className={cn(
                      "ml-2 rounded-full px-2 py-0.5 text-xs tabular-nums",
                      alcance === key ? "bg-white/15 text-white" : "bg-slate-100 text-slate-600",
                    )}
                  >
                    {count}
                  </span>
                </Button>
              ))}
            </div>

            <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex min-w-[180px] flex-col gap-1.5 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Fase
                </span>
                <Popover open={fasePopoverOpen} onOpenChange={setFasePopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="outline" className="h-8 justify-between rounded-lg bg-white text-sm">
                      {fasesSeleccionadas.length === 0
                        ? "Seleccionar"
                        : `${fasesSeleccionadas.length} seleccionada${fasesSeleccionadas.length !== 1 ? "s" : ""}`}
                      <ChevronDown className="h-4 w-4 opacity-60" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-64 p-2">
                    {FASE_OPCIONES.map((opcion) => (
                      <label
                        key={opcion.value}
                        className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 hover:bg-slate-50"
                      >
                        <Checkbox
                          checked={fasesSeleccionadas.includes(opcion.value)}
                          onCheckedChange={() => toggleFase(opcion.value)}
                        />
                        <span className="text-sm text-slate-700">{opcion.label}</span>
                      </label>
                    ))}
                  </PopoverContent>
                </Popover>
              </div>

              <div className="flex min-w-[180px] flex-col gap-1.5 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Caja
                </span>
                <Select
                  value={cajaFiltro}
                  onValueChange={(value) => {
                    setCajaFiltro(value);
                    resetSolicitudesPage();
                  }}
                >
                  <SelectTrigger className="h-8 rounded-lg bg-white text-sm">
                    <SelectValue placeholder="Todas las cajas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las cajas</SelectItem>
                    {cajas.map((caja) => (
                      <SelectItem key={String(caja.cajaMenorId)} value={String(caja.cajaMenorId)}>
                        {showEmpresaLabel
                          ? `${getEmpresaNombre(caja.empresaId)} · ${caja.nombre}`
                          : caja.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex min-w-[240px] flex-col gap-1.5 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Fecha de actualización
                  </span>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 rounded-lg"
                    aria-label={
                      sortDirection === "desc"
                        ? "Orden: más recientes primero"
                        : "Orden: más antiguas primero"
                    }
                    onClick={toggleSortDirection}
                  >
                    <ArrowDownUp className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <input
                    type="date"
                    value={actualizadoDesde}
                    onChange={(event) => {
                      setActualizadoDesde(event.target.value);
                      resetSolicitudesPage();
                    }}
                    aria-label="Actualización desde"
                    className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700 outline-hidden focus:border-slate-300"
                  />
                  <input
                    type="date"
                    value={actualizadoHasta}
                    onChange={(event) => {
                      setActualizadoHasta(event.target.value);
                      resetSolicitudesPage();
                    }}
                    aria-label="Actualización hasta"
                    className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700 outline-hidden focus:border-slate-300"
                  />
                </div>
              </div>

              <div className="flex min-w-[220px] flex-1 flex-col gap-1.5 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 sm:max-w-sm">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Buscar
                </span>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={busqueda}
                    onChange={(event) => {
                      setBusqueda(event.target.value);
                      resetSolicitudesPage();
                    }}
                    placeholder="Número, proveedor, NIT, caja o custodio..."
                    className="h-8 rounded-lg border-slate-200 bg-white pl-8 text-sm"
                  />
                </div>
              </div>

              {hasActiveSolicitudFilters ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="h-9 self-center rounded-xl text-slate-600"
                  onClick={clearSolicitudFilters}
                >
                  <X className="mr-1 h-4 w-4" />
                  Limpiar filtros
                </Button>
              ) : null}
            </div>

            <div className="flex flex-col gap-3 border-y border-slate-200 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-medium text-slate-600">
                Mostrando {solicitudesPagination.pageStart}-{solicitudesPagination.pageEnd} de{" "}
                {filteredSolicitudes.length} solicitud
                {filteredSolicitudes.length !== 1 ? "es" : ""} cargada
                {filteredSolicitudes.length !== 1 ? "s" : ""}
              </p>
              <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <span>Ver</span>
                <select
                  value={solicitudesRowsPerPage}
                  onChange={(event) => {
                    setSolicitudesRowsPerPage(Number(event.target.value) as BandejaPageSize);
                    resetSolicitudesPage();
                  }}
                  className="h-9 rounded-xl border border-slate-200 bg-white px-3 pr-8 text-sm font-medium normal-case text-slate-700 outline-hidden"
                >
                  {PAGE_SIZE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <section className="flex flex-col gap-3">
              {solicitudesLoadingFirst ? (
                <BandejaSkeletonRows />
              ) : solicitudesPagination.visibleRows.length === 0 ? (
                <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
                  <Inbox className="h-10 w-10 text-slate-300" />
                  <div>
                    <p className="text-sm font-semibold text-slate-700">
                      {filteredSolicitudes.length === 0 && solicitudesLoaded.length > 0
                        ? "Sin coincidencias"
                        : "Sin solicitudes visibles"}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      {filteredSolicitudes.length === 0 && solicitudesLoaded.length > 0
                        ? "Prueba ajustar los filtros o cargar más resultados."
                        : "No hay solicitudes activas en el alcance actual."}
                    </p>
                  </div>
                  {solicitudesCanLoadMore || solicitudesLoadingMore ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-xl bg-white"
                      disabled={!solicitudesCanLoadMore}
                      onClick={() => solicitudesQuery.loadMore(solicitudesRowsPerPage)}
                    >
                      {solicitudesLoadingMore ? "Cargando..." : "Cargar más"}
                    </Button>
                  ) : null}
                </div>
              ) : (
                solicitudesPagination.visibleRows.map((row) => (
                  <SolicitudBandejaCard
                    key={String(row.reembolsoId)}
                    row={row}
                    showEmpresaLabel={showEmpresaLabel}
                    downloadLoading={downloadLoadingId === String(row.reembolsoId)}
                    onOpen={() => {
                      const target = { _id: row.reembolsoId, estado: row.estado };
                      if (row.apertura === "action") setActionTarget(target);
                      else setDetailsTarget(target);
                    }}
                    onReasignar={() => setReasignarTarget(row)}
                    onDownload={() => void handleDownloadFormato(row)}
                  />
                ))
              )}
            </section>

            <BandejaPaginationFooter
              label="solicitudes cargadas"
              filteredCount={filteredSolicitudes.length}
              pageStart={solicitudesPagination.pageStart}
              pageEnd={solicitudesPagination.pageEnd}
              safeCurrentPage={solicitudesPagination.safeCurrentPage}
              totalPages={solicitudesPagination.totalPages}
              pageItems={solicitudesPageItems}
              canLoadMore={solicitudesCanLoadMore}
              isLoadingMore={solicitudesLoadingMore}
              onPrevious={() => setSolicitudesPage((page) => Math.max(page - 1, 1))}
              onNext={() =>
                setSolicitudesPage((page) =>
                  Math.min(page + 1, solicitudesPagination.totalPages),
                )
              }
              onPage={setSolicitudesPage}
              onLoadMore={() => solicitudesQuery.loadMore(solicitudesRowsPerPage)}
            />
          </>
        ) : cajas.length === 0 ? (
          <BandejaEmptyState
            title="Sin cajas visibles"
            description="No hay cajas menores disponibles para tu rol en el alcance actual."
          />
        ) : (
          <>
            <div className="flex flex-col gap-3 border-y border-slate-200 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-medium text-slate-600">
                Mostrando {facturasPagination.pageStart}-{facturasPagination.pageEnd} de{" "}
                {filteredMovimientos.length} movimiento
                {filteredMovimientos.length !== 1 ? "s" : ""} cargado
                {filteredMovimientos.length !== 1 ? "s" : ""}
              </p>
              <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <span>Ver</span>
                <select
                  value={facturasRowsPerPage}
                  onChange={(event) => {
                    setFacturasRowsPerPage(Number(event.target.value) as BandejaPageSize);
                    resetFacturasPage();
                  }}
                  className="h-9 rounded-xl border border-slate-200 bg-white px-3 pr-8 text-sm font-medium normal-case text-slate-700 outline-hidden"
                >
                  {PAGE_SIZE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <section className="space-y-3">
              {sortCajasForFacturas(cajas).map((caja) => {
                const cajaId = String(caja.cajaMenorId);
                const expanded = expandedCajaId === cajaId;
                return (
                  <div
                    key={cajaId}
                    className="overflow-hidden rounded-xl border border-slate-200 bg-white"
                  >
                    <button
                      type="button"
                      aria-expanded={expanded}
                      className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left transition-colors hover:bg-slate-50"
                      onClick={() => setExpandedCajaId(expanded ? null : cajaId)}
                    >
                      <div>
                        <p className="font-semibold text-slate-950">
                          {showEmpresaLabel ? `${getEmpresaNombre(caja.empresaId)} · ` : ""}
                          {caja.nombre}
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          {caja.estado} · {caja.facturasPendientesCount} pendientes ·{" "}
                          {formatCOP(caja.facturasPendientesValor)} · Saldo{" "}
                          {formatCOP(caja.saldoDisponible)}
                        </p>
                      </div>
                      <ChevronDown
                        className={cn(
                          "h-5 w-5 text-slate-400 transition",
                          expanded && "rotate-180",
                        )}
                      />
                    </button>
                    {expanded ? (
                      <div>
                        {caja.canGenerate ? (
                          <div className="border-t border-slate-100 px-4 py-3">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                setSelectedByCaja((current) =>
                                  mergePageSelections(current, cajaId, visibleMovimientoIds),
                                )
                              }
                            >
                              Seleccionar visibles
                            </Button>
                          </div>
                        ) : null}
                        {facturasLoadingFirst ? (
                          <BandejaSkeletonRows />
                        ) : facturasPagination.visibleRows.length === 0 ? (
                          <BandejaEmptyState
                            title="Sin facturas pendientes"
                            description="Esta caja no tiene movimientos disponibles para reembolso."
                          />
                        ) : (
                          facturasPagination.visibleRows.map((row) => (
                            <MovimientoBandejaRow
                              key={String(row.movimientoId)}
                              row={row}
                              checked={selectedIds.includes(String(row.movimientoId))}
                              onCheckedChange={(checked) => {
                                setSelectedByCaja((current) => {
                                  const currentIds = current[cajaId] ?? [];
                                  const nextIds = checked
                                    ? [...new Set([...currentIds, String(row.movimientoId)])]
                                    : currentIds.filter((id) => id !== String(row.movimientoId));
                                  return { ...current, [cajaId]: nextIds };
                                });
                              }}
                              onDevolver={() => void handleDevolver(row.movimientoId)}
                              devolverLoading={devolverLoadingId === String(row.movimientoId)}
                            />
                          ))
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </section>

            <BandejaPaginationFooter
              label="movimientos cargados"
              filteredCount={filteredMovimientos.length}
              pageStart={facturasPagination.pageStart}
              pageEnd={facturasPagination.pageEnd}
              safeCurrentPage={facturasPagination.safeCurrentPage}
              totalPages={facturasPagination.totalPages}
              pageItems={facturasPageItems}
              canLoadMore={facturasCanLoadMore}
              isLoadingMore={facturasLoadingMore}
              onPrevious={() => setFacturasPage((page) => Math.max(page - 1, 1))}
              onNext={() =>
                setFacturasPage((page) => Math.min(page + 1, facturasPagination.totalPages))
              }
              onPage={setFacturasPage}
              onLoadMore={() => movimientosQuery.loadMore(facturasRowsPerPage)}
            />
          </>
        )}
      </div>

      {view === "facturas" && selectedIds.length > 0 && expandedCaja ? (
        <div
          className={cn(
            "fixed bottom-0 z-20 border-t border-slate-200 bg-white/95 shadow-[0_-4px_16px_rgba(15,23,42,0.06)] backdrop-blur-xs transition-[left] duration-[280ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
            "inset-x-0 lg:inset-x-auto lg:right-0",
            !sidebarLoaded || sidebarExpanded ? "lg:left-64" : "lg:left-20",
          )}
        >
          <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
            <div className="text-sm font-medium text-slate-700 tabular-nums">
              {selectedIds.length} seleccionados · {formatCOP(selectedValor)}
            </div>
            <div className="flex shrink-0 gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setSelectedByCaja((current) => ({
                    ...current,
                    [String(expandedCaja.cajaMenorId)]: [],
                  }))
                }
              >
                Limpiar
              </Button>
              <Button type="button" onClick={() => setGenerationCaja(expandedCaja)}>
                Generar reembolso
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <ReembolsoGenerationDialog
        open={Boolean(generationCaja)}
        caja={
          generationCaja
            ? {
                _id: generationCaja.cajaMenorId,
                nombre: generationCaja.nombre,
                empresa_id: generationCaja.empresaId,
                assignedValue: 0,
                saldoDisponible: generationCaja.saldoDisponible,
                pendientes: selectedMovimientos.map((row) => ({
                  _id: row.movimientoId,
                  facturaId: row.facturaId,
                  valor: row.valor,
                  nombreEmpresa: row.proveedor,
                  concepto: row.concepto,
                  fechaPago: row.fechaPago,
                  centroCostoCodigo: row.centroCostoCodigo,
                  centroCostoNombre: row.centroCostoNombre,
                  origen: row.origen,
                  factura: { numeroFactura: row.numeroFactura },
                })),
              }
            : null
        }
        selectedIds={selectedIds}
        actorUserId={actorUserId}
        usuarios={usuariosAprobadores}
        usuariosLoading={usuariosLoading}
        loading={
          generationCaja ? loadingKey === `generate:${generationCaja.cajaMenorId}` : false
        }
        onOpenChange={(open) => {
          if (!open) setGenerationCaja(null);
        }}
        onSubmit={(payload) => void handleGenerate(payload)}
      />

      <ReembolsoReviewDialog
        mode="readonly"
        reembolso={detailsTarget}
        actor={{
          actorUserId: actorUserId ?? "",
          actorNombre,
          actorEmail,
          actorRol,
        }}
        onOpenChange={(open) => {
          if (!open) setDetailsTarget(null);
        }}
      />
      <ReembolsoReviewDialog
        mode="action"
        reembolso={actionTarget}
        actor={{
          actorUserId: actorUserId ?? "",
          actorNombre,
          actorEmail,
          actorRol,
        }}
        onOpenChange={(open) => {
          if (!open) setActionTarget(null);
        }}
      />
      <ReembolsoReasignarDialog
        mode={
          reasignarTarget?.estado === "pendiente_revision_impuestos"
            ? "contabilidad"
            : reasignarTarget?.estado === "pendiente_eventos_dian"
              ? "eventos_dian"
              : "revision"
        }
        open={Boolean(reasignarTarget)}
        reembolso={
          reasignarTarget
            ? {
                _id: reasignarTarget.reembolsoId,
                numeroReembolso: reasignarTarget.numeroReembolso,
                valorTotal: reasignarTarget.valorTotal,
                movimientoIds: Array.from({ length: reasignarTarget.movimientosCount }, () => ""),
                reviewAssignedUserId: reasignarTarget.reviewAssignedUserId,
                reviewAssignedNombre: reasignarTarget.reviewAssignedNombre,
                contadorAsignadoUserId: reasignarTarget.contadorAsignadoUserId,
                contadorAsignadoNombre: reasignarTarget.contadorAsignadoNombre,
                eventosDianAsignadoUserId: reasignarTarget.eventosDianAsignadoUserId,
                eventosDianAsignadoNombre: reasignarTarget.eventosDianAsignadoNombre,
              }
            : null
        }
        empresaId={reasignarTarget?.empresaId}
        actor={{
          actorUserId: actorUserId ?? "",
          actorNombre,
          actorEmail,
          actorRol,
        }}
        onOpenChange={(open) => {
          if (!open) setReasignarTarget(null);
        }}
      />
    </div>
  );
}
