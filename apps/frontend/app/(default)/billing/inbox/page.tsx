"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { FunctionArgs } from "convex/server";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import {
  AlertTriangle,
  ArrowDownUp,
  Building2,
  CheckCircle2,
  ChevronDown,
  Coins,
  FilePlus2,
  Inbox,
  Loader2,
  ReceiptText,
  RotateCcw,
  Search,
  Upload,
  WalletCards,
  X,
} from "lucide-react";
import { toast } from "sonner";

import Loading from "../../loading";
import NoAutorizado from "@/app/no-autorizado";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { EmpresaInfo } from "@/lib/empresas";
import { cn } from "@/lib/utils";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useEmpresaFilter } from "@/hooks/useEmpresaFilter";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { RUTAS_SISTEMA } from "@/lib/rutas-sistema";
import { CentroCostoDistribucionEditor } from "@/components/cajas-menores/centro-costo-distribucion-editor";
import {
  createDefaultDistribucion,
  isDistribucionValid,
  toLegacyCentroCosto,
  type CentroCostoDistribucionRow,
} from "@/lib/cajas-menores/centros-costo-distribucion";
import { normalizeCajasMenoresDisponibles } from "@/lib/cajas-menores/disponibles-result";
import { BuzonAnticipoLegalizacionDialog } from "../components/buzon-anticipo-legalizacion-dialog";
import type { BuzonTarea } from "../components/buzon-row";
import { useFacturacionPage } from "../hooks/use-facturacion-page";
import {
  mergeFacturacionUsuarios,
  type FacturacionUsuario,
  useFacturacionUsers,
  useFacturacionUsersByEmpresa,
} from "../hooks/use-facturacion-users";
import { formatCurrency } from "../lib/utils";
import { getFacturacionErrorMessage } from "../lib/user-facing-error";
import {
  addMoneyAmounts,
  formatMoneyInput,
  normalizeMoneyInput,
  parseMoneyInput,
} from "../lib/money";
import { EmpresaBadge } from "../lib/empresa-ui";
import { getReturnMetadata } from "../lib/workflow-config";
import { BatchFacturasModal } from "./_components/batch-facturas-modal";
import {
  FILTER_LABELS,
  BUZON_ESTADO_OPCIONES,
  getTaskKey,
  isDateInRange,
  isDueSoon,
  toDateKey,
  useConfiguredUsers,
} from "./_components/helpers";
import { InvoiceCard } from "./_components/invoice-card";
import { KpiCard } from "./_components/kpi-card";
import type { FilterKey } from "./_components/types";

const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

type BuzonSortKey = "emision" | "asignacion";
type BuzonSortDirection = "asc" | "desc";

const EMPTY_BUZON_COUNTS: Record<FilterKey, number> = {
  todas: 0,
  por_vencer: 0,
  anticipos: 0,
  cajas_menores: 0,
  devueltas: 0,
};

const BUZON_LIST_LOAD_SIZE = 200;
const MAX_SUPPORT_FILE_BYTES = 25 * 1024 * 1024;

export default function FacturacionBuzonPage() {
  const { status, hasAccess, session } = useFacturacionPage(
    RUTAS_SISTEMA.FACTURACION_BUZON,
  );
  const { empresaActiva, opcionesSelector } = useEmpresaFilter();
  const myUserId = session?.user?.id ?? "";

  const buzonQueryArgs = useMemo(() => {
    if (!myUserId) return "skip" as const;
    return {
      asignadoAUserId: myUserId,
      ...(typeof empresaActiva === "number" && Number.isFinite(empresaActiva)
        ? { empresa: empresaActiva }
        : {}),
    };
  }, [myUserId, empresaActiva]);

  const [filter, setFilter] = useState<FilterKey>("todas");
  const [searchQuery, setSearchQuery] = useState("");
  const [estadosSeleccionados, setEstadosSeleccionados] = useState<string[]>([]);
  const [fechaEmisionDesde, setFechaEmisionDesde] = useState("");
  const [fechaEmisionHasta, setFechaEmisionHasta] = useState("");
  const [fechaAsignacionDesde, setFechaAsignacionDesde] = useState("");
  const [fechaAsignacionHasta, setFechaAsignacionHasta] = useState("");
  const [estadoPopoverOpen, setEstadoPopoverOpen] = useState(false);
  const [sortKey, setSortKey] = useState<BuzonSortKey>("asignacion");
  const [sortDirection, setSortDirection] = useState<BuzonSortDirection>("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(20);
  const [selected, setSelected] = useState<BuzonTarea | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedBatchIds, setSelectedBatchIds] = useState<string[]>([]);
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [anticipoFor, setAnticipoFor] = useState<BuzonTarea | null>(null);
  const [physicalDocumentOpen, setPhysicalDocumentOpen] = useState(false);
  const [physicalReceiptOpen, setPhysicalReceiptOpen] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      setCurrentPage(1);
      setSelected(null);
      setSelectedBatchIds([]);
      setBatchModalOpen(false);
      setSelectionMode(false);
    });
  }, [empresaActiva]);

  const {
    results: tareas,
    status: buzonStatus,
    loadMore,
  } = usePaginatedQuery(
    api.facturacionTareas.listarParaBuzon,
    buzonQueryArgs,
    { initialNumItems: BUZON_LIST_LOAD_SIZE },
  );
  const resumenBuzon = useQuery(
    api.facturacionTareas.resumenParaBuzon,
    buzonQueryArgs,
  );
  const {
    usuarios,
    lideres,
    isLoading: usuariosLoading,
  } = useFacturacionUsers();
  const tareasData = useMemo(() => tareas as BuzonTarea[], [tareas]);
  const empresasTareas = useMemo(
    () =>
      Array.from(
        new Set(
          tareasData.map((tarea) => tarea.empresa ?? tarea.factura?.empresa ?? 1),
        ),
      ),
    [tareasData],
  );
  const empresaBuzon = useMemo(() => {
    if (typeof empresaActiva === "number" && Number.isFinite(empresaActiva)) {
      return empresaActiva;
    }
    const sessionEmpresa = Number(session?.user?.id_empresa ?? NaN);
    if (Number.isFinite(sessionEmpresa) && sessionEmpresa > 0) {
      return sessionEmpresa;
    }
    return empresasTareas[0] ?? 1;
  }, [empresaActiva, empresasTareas, session?.user?.id_empresa]);
  const empresaOptionsForDialog = useMemo(
    () =>
      opcionesSelector.filter(
        (opcion): opcion is { id: number; nombre: string; info?: EmpresaInfo } =>
          opcion.id !== null,
      ),
    [opcionesSelector],
  );
  const {
    usuariosPorEmpresa: usuariosAsignablesPorEmpresa,
    isLoading: usuariosAsignablesLoading,
  } = useFacturacionUsersByEmpresa(empresasTareas, {
    includeGlobalAccess: true,
    enabled: empresasTareas.length > 0,
  });
  const usuariosCombinados = useMemo(
    () =>
      mergeFacturacionUsuarios(
        usuarios,
        ...Object.values(usuariosAsignablesPorEmpresa),
      ),
    [usuarios, usuariosAsignablesPorEmpresa],
  );
  const lideresPorEmpresa = useMemo(() => {
    const out: Record<number, FacturacionUsuario[]> = {};
    for (const [empresa, usuariosEmpresa] of Object.entries(
      usuariosAsignablesPorEmpresa,
    )) {
      out[Number(empresa)] = usuariosEmpresa.filter(
        (usuario) => usuario.activo && usuario.lider_proceso,
      );
    }
    return out;
  }, [usuariosAsignablesPorEmpresa]);

  const contadoresConfig = useQuery(
    api.facturacionConfiguracion.listarUsuariosPorClave,
    empresasTareas.length > 0
      ? { clave: "contadores_impuestos", empresas: empresasTareas }
      : "skip",
  );
  const eventosDianConfig = useQuery(
    api.facturacionConfiguracion.listarUsuariosPorClave,
    empresasTareas.length > 0
      ? { clave: "eventos_dian", empresas: empresasTareas }
      : "skip",
  );
  const analistasCausacionConfig = useQuery(
    api.facturacionConfiguracion.listarUsuariosPorClave,
    empresasTareas.length > 0
      ? { clave: "analista_causacion", empresas: empresasTareas }
      : "skip",
  );
  const rechazosDianConfig = useQuery(
    api.facturacionConfiguracion.listarUsuariosPorClave,
    empresasTareas.length > 0
      ? { clave: "rechazos_dian", empresas: empresasTareas }
      : "skip",
  );
  const gerenciasConfig = useQuery(
    api.facturacionConfiguracion.listarUsuariosPorClave,
    empresasTareas.length > 0
      ? { clave: "gerencia", empresas: empresasTareas }
      : "skip",
  );
  const recepcionConfig = useQuery(
    api.facturacionConfiguracion.listarUsuariosPorClave,
    empresasTareas.length > 0
      ? { clave: "recepcion", empresas: empresasTareas }
      : "skip",
  );
  const tesoreroConfig = useQuery(
    api.facturacionConfiguracion.listarUsuariosPorClave,
    empresasTareas.length > 0
      ? { clave: "tesorero", empresas: empresasTareas }
      : "skip",
  );
  const tesoreriaDefaultConfig = useQuery(
    api.facturacionConfiguracion.listarUsuariosPorClave,
    empresasTareas.length > 0
      ? { clave: "tesoreria_default", empresas: empresasTareas }
      : "skip",
  );
  const generateUploadUrl = useMutation(api.facturacionStorage.generateUploadUrl);
  const crearReciboFisicoCajaMenor = useMutation(
    api.cajasMenores.crearReciboFisicoCajaMenor,
  );

  const usuariosById = useMemo<Map<string, FacturacionUsuario>>(
    () =>
      new Map<string, FacturacionUsuario>(
        usuariosCombinados.map((usuario) => [usuario.id, usuario]),
      ),
    [usuariosCombinados],
  );
  const contadoresPorEmpresa = useConfiguredUsers(
    contadoresConfig,
    usuariosById,
  );
  const eventosDianPorEmpresa = useConfiguredUsers(
    eventosDianConfig,
    usuariosById,
  );
  const analistasCausacionPorEmpresa = useConfiguredUsers(
    analistasCausacionConfig,
    usuariosById,
  );
  const rechazosDianPorEmpresa = useConfiguredUsers(
    rechazosDianConfig,
    usuariosById,
  );
  const gerenciasPorEmpresa = useConfiguredUsers(
    gerenciasConfig,
    usuariosById,
  );
  const recepcionPorEmpresa = useConfiguredUsers(
    recepcionConfig,
    usuariosById,
  );
  const tesoreroPorEmpresa = useConfiguredUsers(tesoreroConfig, usuariosById);
  const tesoreriaDefaultPorEmpresa = useConfiguredUsers(
    tesoreriaDefaultConfig,
    usuariosById,
  );
  const tesoreriaPorEmpresa = useMemo(() => {
    const out: Record<number, FacturacionUsuario[]> = {};
    const empresas = new Set([
      ...Object.keys(tesoreroPorEmpresa).map(Number),
      ...Object.keys(tesoreriaDefaultPorEmpresa).map(Number),
    ]);
    for (const empresa of empresas) {
      const merged = [...(tesoreroPorEmpresa[empresa] ?? [])];
      for (const usuario of tesoreriaDefaultPorEmpresa[empresa] ?? []) {
        if (!merged.some((item) => item.id === usuario.id)) {
          merged.push(usuario);
        }
      }
      out[empresa] = merged;
    }
    return out;
  }, [tesoreroPorEmpresa, tesoreriaDefaultPorEmpresa]);
  const canCreatePhysicalDocument = session?.user?.lider_proceso === true;
  const defaultPhysicalDocumentEmpresaId = useMemo(() => {
    if (empresaOptionsForDialog.some((opcion) => opcion.id === empresaBuzon)) {
      return empresaBuzon;
    }
    return empresaOptionsForDialog[0]?.id ?? null;
  }, [empresaBuzon, empresaOptionsForDialog]);

  const actor = useMemo(
    () => ({
      actorUserId: (session?.user as { id?: string } | undefined)?.id,
      actorNombre: session?.user?.nombre || session?.user?.email || "Usuario",
      actorEmail: session?.user?.email || "sin-correo@example.com",
    }),
    [session?.user],
  );
  const adjuntosActor = useMemo(
    () => ({
      userId: actor.actorUserId,
      nombre: actor.actorNombre,
      email: actor.actorEmail,
    }),
    [actor],
  );
  // Mirrors the server check in facturacionTareas.eliminarFacturaCompleta (full-access users).
  const { backendUser } = useCurrentUser();
  const canDeleteFactura = backendUser?.hasFullAccess === true;

  const counts = useMemo(
    () => ({ ...EMPTY_BUZON_COUNTS, ...(resumenBuzon ?? {}) }),
    [resumenBuzon],
  );

  const hasActiveFilters =
    estadosSeleccionados.length > 0 ||
    Boolean(fechaEmisionDesde) ||
    Boolean(fechaEmisionHasta) ||
    Boolean(fechaAsignacionDesde) ||
    Boolean(fechaAsignacionHasta);

  const resetPage = () => setCurrentPage(1);

  const clearFilters = () => {
    setEstadosSeleccionados([]);
    setFechaEmisionDesde("");
    setFechaEmisionHasta("");
    setFechaAsignacionDesde("");
    setFechaAsignacionHasta("");
    resetPage();
  };

  function toggleEstado(value: string) {
    setEstadosSeleccionados((prev) =>
      prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value],
    );
    resetPage();
  }

  function toggleSort(key: BuzonSortKey) {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDirection("desc");
    }
    resetPage();
  }

  const filtered = useMemo(() => {
    let items = tareasData;
    if (filter === "por_vencer") {
      items = items.filter((tarea) => isDueSoon(tarea.factura?.fechaVencimiento));
    } else if (filter === "anticipos") {
      items = items.filter((tarea) => tarea.factura?.esLegalizacionAnticipo);
    } else if (filter === "cajas_menores") {
      items = items.filter((tarea) => tarea.factura?.esLegalizacionCajaMenor);
    } else if (filter === "devueltas") {
      items = items.filter((tarea) => getReturnMetadata(tarea.asignacion));
    }

    if (estadosSeleccionados.length > 0) {
      items = items.filter((tarea) => estadosSeleccionados.includes(tarea.estado));
    }

    if (fechaEmisionDesde || fechaEmisionHasta) {
      items = items.filter((tarea) =>
        isDateInRange(
          tarea.factura?.fechaEmision,
          fechaEmisionDesde || undefined,
          fechaEmisionHasta || undefined,
        ),
      );
    }

    if (fechaAsignacionDesde || fechaAsignacionHasta) {
      items = items.filter((tarea) =>
        isDateInRange(
          toDateKey(tarea.creadoEn),
          fechaAsignacionDesde || undefined,
          fechaAsignacionHasta || undefined,
        ),
      );
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      items = items.filter((tarea) => {
        const factura = tarea.factura;
        if (!factura) return false;
        return (
          factura.proveedorNombre.toLowerCase().includes(q) ||
          factura.proveedorNit.toLowerCase().includes(q) ||
          factura.numeroFactura.toLowerCase().includes(q)
        );
      });
    }

    const direction = sortDirection === "asc" ? 1 : -1;
    return [...items].sort((a, b) => {
      if (sortKey === "emision") {
        const aEmision = a.factura?.fechaEmision ?? "";
        const bEmision = b.factura?.fechaEmision ?? "";
        if (aEmision !== bEmision) {
          return aEmision < bEmision ? -direction : direction;
        }
      }
      return (a.creadoEn - b.creadoEn) * direction;
    });
  }, [
    filter,
    searchQuery,
    tareasData,
    estadosSeleccionados,
    fechaEmisionDesde,
    fechaEmisionHasta,
    fechaAsignacionDesde,
    fechaAsignacionHasta,
    sortKey,
    sortDirection,
  ]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginated = useMemo(() => {
    const startIndex = (safeCurrentPage - 1) * rowsPerPage;
    return filtered.slice(startIndex, startIndex + rowsPerPage);
  }, [filtered, rowsPerPage, safeCurrentPage]);
  const pageItems = useMemo(
    () => getPaginationItems(safeCurrentPage, totalPages),
    [safeCurrentPage, totalPages],
  );
  const visiblePageKeys = useMemo(
    () => paginated.map((tarea) => getTaskKey(tarea)),
    [paginated],
  );
  const allVisiblePageSelected =
    visiblePageKeys.length > 0 &&
    visiblePageKeys.every((key) => selectedBatchIds.includes(key));
  const pageStart = filtered.length === 0 ? 0 : (safeCurrentPage - 1) * rowsPerPage + 1;
  const pageEnd = Math.min(safeCurrentPage * rowsPerPage, filtered.length);
  const canLoadMore = buzonStatus === "CanLoadMore";
  const isLoadingMore = buzonStatus === "LoadingMore";

  const selectedBatchTasks = useMemo(() => {
    const byKey = new Map(tareasData.map((tarea) => [getTaskKey(tarea), tarea]));
    return selectedBatchIds.flatMap((id) => {
      const tarea = byKey.get(id);
      return tarea ? [tarea] : [];
    });
  }, [selectedBatchIds, tareasData]);

  function toggleBatchSelection(tarea: BuzonTarea) {
    const key = getTaskKey(tarea);
    setSelectedBatchIds((prev) =>
      prev.includes(key) ? prev.filter((id) => id !== key) : [...prev, key],
    );
  }

  function toggleVisiblePageSelection() {
    setSelectedBatchIds((prev) => {
      if (allVisiblePageSelected) {
        return prev.filter((id) => !visiblePageKeys.includes(id));
      }
      return Array.from(new Set([...prev, ...visiblePageKeys]));
    });
  }

  function closeSelectionMode() {
    setSelectionMode(false);
    setBatchModalOpen(false);
    setSelectedBatchIds([]);
  }

  if (
    status === "loading" ||
    usuariosLoading ||
    usuariosAsignablesLoading ||
    (myUserId && buzonStatus === "LoadingFirstPage")
  ) {
    return <Loading />;
  }
  if (!hasAccess) return <NoAutorizado />;

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-5 pb-12 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 md:flex-row md:items-center">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white">
              <Inbox className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">Facturación</p>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-normal text-slate-950">
                  Mi Buzón
                </h1>
                {typeof empresaActiva === "number" && Number.isFinite(empresaActiva) ? (
                  <EmpresaBadge empresaId={empresaActiva} />
                ) : null}
              </div>
              <p className="text-sm text-slate-500">
                Tienes {counts.todas} tarea(s) asignada(s) a tu correo.
              </p>
            </div>
          </div>
        </header>

        <section className="grid gap-3 md:grid-cols-5">
          <KpiCard
            icon={<Inbox className="h-4 w-4" />}
            label="En mi buzón"
            value={String(counts.todas)}
            helper="facturas cargadas"
            tone="primary"
          />
          <KpiCard
            icon={<AlertTriangle className="h-4 w-4" />}
            label="Por vencer"
            value={String(counts.por_vencer)}
            helper="vencen en <= 7 días"
            tone="warning"
          />
          <KpiCard
            icon={<Coins className="h-4 w-4" />}
            label="Anticipos"
            value={String(counts.anticipos)}
            helper="cargadas por legalizar"
            tone="accent"
          />
          <KpiCard
            icon={<WalletCards className="h-4 w-4" />}
            label="Cajas Menores"
            value={String(counts.cajas_menores)}
            helper="legalización activa"
            tone="primary"
          />
          <KpiCard
            icon={<RotateCcw className="h-4 w-4" />}
            label="Devueltas"
            value={String(counts.devueltas)}
            helper="cargadas con revisión"
            tone="danger"
          />
        </section>

        <nav className="flex flex-wrap items-center gap-2">
          {(Object.keys(FILTER_LABELS) as FilterKey[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setFilter(key);
                setCurrentPage(1);
              }}
              className={`inline-flex h-9 items-center gap-2 rounded-full border px-3 text-sm font-medium transition ${
                filter === key
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
              }`}
            >
              {FILTER_LABELS[key]}
              <span
                className={`min-w-5 rounded-full px-1.5 text-center text-xs tabular-nums ${
                  filter === key ? "bg-white/15 text-white" : "bg-slate-100 text-slate-500"
                }`}
              >
                {counts[key]}
              </span>
            </button>
          ))}
          {canCreatePhysicalDocument ? (
            <Button
              type="button"
              variant="outline"
              className="h-9 rounded-xl bg-white"
              onClick={() => setPhysicalDocumentOpen(true)}
            >
              <FilePlus2 className="mr-2 h-4 w-4" />
              Crear documento físico
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            className="h-9 rounded-xl bg-white"
            onClick={() => setPhysicalReceiptOpen(true)}
          >
            <ReceiptText className="mr-2 h-4 w-4" />
            Recibo Caja Menor
          </Button>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            {selectionMode ? (
              <>
                <Badge variant="outline" className="h-9 rounded-xl bg-white px-3">
                  {selectedBatchTasks.length} seleccionada(s)
                </Badge>
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 rounded-xl bg-white"
                  disabled={visiblePageKeys.length === 0}
                  onClick={toggleVisiblePageSelection}
                >
                  {allVisiblePageSelected ? "Deseleccionar página" : "Seleccionar página"}
                </Button>
                <Button
                  type="button"
                  className="h-9 rounded-xl bg-slate-900"
                  disabled={selectedBatchTasks.length === 0}
                  onClick={() => setBatchModalOpen(true)}
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Revisar selección
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 rounded-xl bg-white"
                  onClick={closeSelectionMode}
                >
                  Cancelar
                </Button>
              </>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="h-9 rounded-xl bg-white"
                onClick={() => {
                  setSelected(null);
                  setSelectionMode(true);
                }}
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Seleccionar facturas
              </Button>
            )}
          </div>
        </nav>

        <div className="flex flex-wrap items-stretch gap-2 rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex flex-col gap-1.5 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Estado
            </span>
            <Popover open={estadoPopoverOpen} onOpenChange={setEstadoPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="h-8 gap-1 rounded-lg border-slate-200 bg-white text-sm font-normal"
                >
                  {estadosSeleccionados.length > 0
                    ? `${estadosSeleccionados.length} seleccionado${estadosSeleccionados.length !== 1 ? "s" : ""}`
                    : "Seleccionar"}
                  <ChevronDown className="h-4 w-4 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-2" align="start">
                <div className="max-h-64 space-y-1 overflow-y-auto">
                  {BUZON_ESTADO_OPCIONES.map(({ value, label }) => (
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
          </div>

          <div
            className="hidden h-auto w-px self-stretch bg-slate-200 sm:block"
            aria-hidden
          />

          <div className="flex min-w-0 flex-col gap-1.5 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Fecha de emisión
              </span>
              <button
                type="button"
                onClick={() => toggleSort("emision")}
                aria-label={
                  sortKey === "emision"
                    ? `Ordenar por emisión ${sortDirection === "desc" ? "ascendente" : "descendente"}`
                    : "Ordenar por fecha de emisión"
                }
                title={
                  sortKey === "emision"
                    ? sortDirection === "desc"
                      ? "Más recientes primero"
                      : "Más antiguas primero"
                    : "Ordenar por fecha de emisión"
                }
                className={`inline-flex h-5 w-5 items-center justify-center rounded-md transition ${
                  sortKey === "emision"
                    ? "bg-slate-900 text-white"
                    : "text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                }`}
              >
                <ArrowDownUp className="h-3 w-3" />
              </button>
            </div>
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={fechaEmisionDesde}
                onChange={(event) => {
                  setFechaEmisionDesde(event.target.value);
                  resetPage();
                }}
                aria-label="Emisión desde"
                className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700 outline-hidden focus:border-slate-300"
              />
              <span className="text-xs text-slate-400" aria-hidden>
                —
              </span>
              <input
                type="date"
                value={fechaEmisionHasta}
                onChange={(event) => {
                  setFechaEmisionHasta(event.target.value);
                  resetPage();
                }}
                aria-label="Emisión hasta"
                className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700 outline-hidden focus:border-slate-300"
              />
            </div>
          </div>

          <div
            className="hidden h-auto w-px self-stretch bg-slate-200 sm:block"
            aria-hidden
          />

          <div className="flex min-w-0 flex-col gap-1.5 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Fecha de asignación
              </span>
              <button
                type="button"
                onClick={() => toggleSort("asignacion")}
                aria-label={
                  sortKey === "asignacion"
                    ? `Ordenar por asignación ${sortDirection === "desc" ? "ascendente" : "descendente"}`
                    : "Ordenar por fecha de asignación"
                }
                title={
                  sortKey === "asignacion"
                    ? sortDirection === "desc"
                      ? "Más recientes primero"
                      : "Más antiguas primero"
                    : "Ordenar por fecha de asignación"
                }
                className={`inline-flex h-5 w-5 items-center justify-center rounded-md transition ${
                  sortKey === "asignacion"
                    ? "bg-slate-900 text-white"
                    : "text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                }`}
              >
                <ArrowDownUp className="h-3 w-3" />
              </button>
            </div>
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={fechaAsignacionDesde}
                onChange={(event) => {
                  setFechaAsignacionDesde(event.target.value);
                  resetPage();
                }}
                aria-label="Asignación desde"
                className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700 outline-hidden focus:border-slate-300"
              />
              <span className="text-xs text-slate-400" aria-hidden>
                —
              </span>
              <input
                type="date"
                value={fechaAsignacionHasta}
                onChange={(event) => {
                  setFechaAsignacionHasta(event.target.value);
                  resetPage();
                }}
                aria-label="Asignación hasta"
                className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700 outline-hidden focus:border-slate-300"
              />
            </div>
          </div>

          <div
            className="hidden h-auto w-px self-stretch bg-slate-200 sm:block"
            aria-hidden
          />

          <div className="flex min-w-[220px] flex-1 flex-col gap-1.5 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 sm:ml-auto sm:max-w-sm">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Buscar
            </span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <Input
                value={searchQuery}
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Proveedor, NIT, factura..."
                className="h-8 rounded-lg border-slate-200 bg-white pl-8 text-sm"
              />
            </div>
          </div>

          {hasActiveFilters ? (
            <Button
              type="button"
              variant="ghost"
              className="h-9 self-center rounded-xl text-slate-600"
              onClick={clearFilters}
            >
              <X className="mr-1 h-4 w-4" />
              Limpiar filtros
            </Button>
          ) : null}
        </div>

        <div className="flex flex-col gap-3 border-y border-slate-200 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-medium text-slate-600">
            Mostrando {pageStart}-{pageEnd} de {filtered.length} factura{filtered.length !== 1 ? "s" : ""} cargada{filtered.length !== 1 ? "s" : ""}
          </p>
          <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <span>Ver</span>
            <select
              value={rowsPerPage}
              onChange={(event) => {
                setRowsPerPage(Number(event.target.value) as (typeof PAGE_SIZE_OPTIONS)[number]);
                setCurrentPage(1);
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
          {paginated.map((tarea) => (
            <InvoiceCard
              key={String(tarea.asignacionId ?? tarea._id)}
              tarea={tarea}
              selected={
                selectionMode
                  ? selectedBatchIds.includes(getTaskKey(tarea))
                  : selected?.asignacionId === tarea.asignacionId
              }
              selectionMode={selectionMode}
              checked={selectedBatchIds.includes(getTaskKey(tarea))}
              onToggleChecked={() => toggleBatchSelection(tarea)}
              onSelect={() => {
                if (selectionMode) {
                  toggleBatchSelection(tarea);
                  return;
                }
                setSelected(tarea);
              }}
            />
          ))}
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
              <Inbox className="h-10 w-10 text-slate-300" />
              <div>
                <p className="text-sm font-semibold text-slate-700">Buzón vacío</p>
                <p className="mt-1 text-sm text-slate-500">
                  No hay facturas para los filtros seleccionados.
                </p>
              </div>
              {canLoadMore || isLoadingMore ? (
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl bg-white"
                  disabled={!canLoadMore}
                  onClick={() => loadMore(rowsPerPage)}
                >
                  {isLoadingMore ? "Cargando..." : "Cargar más"}
                </Button>
              ) : null}
            </div>
          ) : null}
        </section>

        {filtered.length > 0 ? (
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
                onClick={() => setCurrentPage((page) => Math.max(page - 1, 1))}
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
                    onClick={() => setCurrentPage(item)}
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
                onClick={() => setCurrentPage((page) => Math.min(page + 1, totalPages))}
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
                  onClick={() => loadMore(rowsPerPage)}
                >
                  {isLoadingMore ? "Cargando..." : "Cargar más"}
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      <BatchFacturasModal
        variant="single"
        open={Boolean(selected)}
        tareas={selected ? [selected] : []}
        actor={actor}
        adjuntosActor={adjuntosActor}
        usuarios={usuariosCombinados}
        usuariosById={usuariosById}
        lideres={lideres}
        lideresPorEmpresa={lideresPorEmpresa}
        contadoresPorEmpresa={contadoresPorEmpresa}
        eventosDianPorEmpresa={eventosDianPorEmpresa}
        analistasCausacionPorEmpresa={analistasCausacionPorEmpresa}
        rechazosDianPorEmpresa={rechazosDianPorEmpresa}
        gerenciasPorEmpresa={gerenciasPorEmpresa}
        recepcionPorEmpresa={recepcionPorEmpresa}
        tesoreriaPorEmpresa={tesoreriaPorEmpresa}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        onRemove={() => setSelected(null)}
        onOpenLegalizacionAnticipo={setAnticipoFor}
        onDone={() => setSelected(null)}
        canDeleteFactura={canDeleteFactura}
      />

      <BatchFacturasModal
        open={batchModalOpen}
        tareas={selectedBatchTasks}
        actor={actor}
        adjuntosActor={adjuntosActor}
        usuarios={usuariosCombinados}
        usuariosById={usuariosById}
        lideres={lideres}
        lideresPorEmpresa={lideresPorEmpresa}
        contadoresPorEmpresa={contadoresPorEmpresa}
        eventosDianPorEmpresa={eventosDianPorEmpresa}
        analistasCausacionPorEmpresa={analistasCausacionPorEmpresa}
        rechazosDianPorEmpresa={rechazosDianPorEmpresa}
        gerenciasPorEmpresa={gerenciasPorEmpresa}
        recepcionPorEmpresa={recepcionPorEmpresa}
        tesoreriaPorEmpresa={tesoreriaPorEmpresa}
        onOpenChange={(open) => setBatchModalOpen(open)}
        onRemove={(tarea) => {
          setSelectedBatchIds((prev) => prev.filter((id) => id !== getTaskKey(tarea)));
        }}
        onOpenLegalizacionAnticipo={setAnticipoFor}
        onDone={closeSelectionMode}
        canDeleteFactura={canDeleteFactura}
      />

      <PhysicalDocumentDialog
        open={physicalDocumentOpen}
        empresaOptions={empresaOptionsForDialog}
        defaultEmpresaId={defaultPhysicalDocumentEmpresaId}
        esLiderProceso={canCreatePhysicalDocument}
        generateUploadUrl={generateUploadUrl}
        onOpenChange={setPhysicalDocumentOpen}
      />

      <PhysicalCajaMenorReceiptDialog
        open={physicalReceiptOpen}
        empresa={empresaBuzon}
        actor={actor}
        generateUploadUrl={generateUploadUrl}
        crearReciboFisicoCajaMenor={crearReciboFisicoCajaMenor}
        onOpenChange={setPhysicalReceiptOpen}
      />

      <BuzonAnticipoLegalizacionDialog
        tarea={anticipoFor}
        onClose={() => setAnticipoFor(null)}
      />
    </div>
  );
}

type PhysicalDocumentForm = {
  empresaId: number | null;
  numeroFactura: string;
  proveedorNit: string;
  proveedorNombre: string;
  fechaEmision: string;
  fechaVencimiento: string;
  subtotal: string;
  impuestos: string;
  total: string;
  moneda: string;
  descripcion: string;
  categoria: "administracion" | "tecnologia" | "otro";
  file: File | null;
};

type PhysicalDocumentEmpresaOption = {
  id: number;
  nombre: string;
  info?: EmpresaInfo;
};

function PhysicalDocumentDialog({
  open,
  empresaOptions,
  defaultEmpresaId,
  esLiderProceso,
  generateUploadUrl,
  onOpenChange,
}: {
  open: boolean;
  empresaOptions: PhysicalDocumentEmpresaOption[];
  defaultEmpresaId: number | null;
  esLiderProceso: boolean;
  generateUploadUrl: (args: Record<string, never>) => Promise<string>;
  onOpenChange: (open: boolean) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<PhysicalDocumentForm>(() =>
    getDefaultPhysicalDocumentForm(defaultEmpresaId),
  );
  const [loading, setLoading] = useState(false);
  const subtotal = parseMoneyInput(form.subtotal);
  const impuestos = parseMoneyInput(form.impuestos);
  const hasComponentValue = Boolean(form.subtotal || form.impuestos);
  const calculatedTotal =
    hasComponentValue && subtotal !== null && impuestos !== null
      ? addMoneyAmounts(subtotal, impuestos)
      : null;
  const enteredTotal = parseMoneyInput(form.total);
  const total = hasComponentValue ? calculatedTotal : enteredTotal;
  const fechaEmisionDate = form.fechaEmision
    ? parseLocalDate(form.fechaEmision)
    : undefined;
  const fechaVencimientoDate = form.fechaVencimiento
    ? parseLocalDate(form.fechaVencimiento)
    : undefined;
  const selectedEmpresa =
    empresaOptions.find((opcion) => opcion.id === form.empresaId) ?? null;
  const isFormReady =
    form.empresaId !== null &&
    form.numeroFactura.trim().length > 0 &&
    form.proveedorNit.trim().length > 0 &&
    form.proveedorNombre.trim().length > 0 &&
    form.fechaEmision.length > 0 &&
    (hasComponentValue
      ? subtotal !== null && impuestos !== null
      : enteredTotal !== null) &&
    (subtotal === null || subtotal >= 0) &&
    (impuestos === null || impuestos >= 0) &&
    total !== null &&
    total > 0 &&
    form.descripcion.trim().length > 0 &&
    form.file !== null &&
    form.file.size <= MAX_SUPPORT_FILE_BYTES;

  useEffect(() => {
    if (open) {
      setForm(getDefaultPhysicalDocumentForm(defaultEmpresaId));
    }
  }, [defaultEmpresaId, open]);

  function patch(next: Partial<PhysicalDocumentForm>) {
    setForm((current) => ({ ...current, ...next }));
  }

  function reset() {
    setForm(getDefaultPhysicalDocumentForm(defaultEmpresaId));
  }

  async function submit() {
    if (!form.empresaId) {
      toast.error("Selecciona una empresa.");
      return;
    }
    if (!esLiderProceso) {
      toast.error("Solo líderes de proceso pueden crear documentos físicos.");
      return;
    }
    if (
      !form.numeroFactura.trim() ||
      !form.proveedorNit.trim() ||
      !form.proveedorNombre.trim()
    ) {
      toast.error("Completa número de factura, NIT y proveedor.");
      return;
    }
    if (!form.fechaEmision) {
      toast.error("Selecciona la fecha de emisión.");
      return;
    }
    if (
      (hasComponentValue &&
        (subtotal === null || impuestos === null || subtotal < 0 || impuestos < 0)) ||
      (!hasComponentValue && (enteredTotal === null || enteredTotal < 0)) ||
      total === null ||
      total <= 0
    ) {
      toast.error("Ingresa valores válidos para subtotal, impuestos y total.");
      return;
    }
    if (!form.descripcion.trim()) {
      toast.error("Completa la descripción.");
      return;
    }
    if (!form.file) {
      toast.error("Adjunta el soporte del documento físico.");
      return;
    }
    if (form.file.size > MAX_SUPPORT_FILE_BYTES) {
      toast.error("El soporte no puede superar 25MB.");
      return;
    }

    setLoading(true);
    try {
      const uploadUrl = await generateUploadUrl({});
      const uploadResult = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": form.file.type || "application/octet-stream" },
        body: form.file,
      });
      if (!uploadResult.ok) throw new Error("No se pudo subir el soporte.");
      const { storageId } = (await uploadResult.json()) as { storageId: string };
      const createResponse = await fetch("/api/billing/documentos-fisicos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          empresa: form.empresaId,
          numeroFactura: form.numeroFactura.trim(),
          proveedorNit: form.proveedorNit.trim(),
          proveedorNombre: form.proveedorNombre.trim(),
          fechaEmision: form.fechaEmision,
          ...(form.fechaVencimiento ? { fechaVencimiento: form.fechaVencimiento } : {}),
          subtotal: subtotal ?? 0,
          impuestos: impuestos ?? 0,
          total: hasComponentValue ? undefined : total,
          totalManual: !hasComponentValue,
          moneda: form.moneda.trim().toUpperCase() || "COP",
          descripcion: form.descripcion.trim(),
          categoria: form.categoria,
          soporteStorageId: storageId,
          soporteNombre: form.file.name,
          soporteMimeType: form.file.type || undefined,
          soporteSize: form.file.size,
        }),
      });
      const payload = (await createResponse.json()) as { error?: string };
      if (!createResponse.ok) {
        throw new Error(payload.error || "No se pudo crear el documento físico.");
      }
      toast.success("Documento físico creado y asignado a ti para revisión como líder.");
      reset();
      onOpenChange(false);
    } catch (error) {
      toast.error(
        getFacturacionErrorMessage(
          error,
          "No se pudo crear el documento físico. Revisa la información e intenta nuevamente.",
        ),
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="flex max-h-[92dvh] max-w-4xl flex-col overflow-hidden p-0">
        <div className="border-b border-slate-200 px-6 py-5">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700">
              <Building2 className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <DialogHeader className="space-y-1.5 text-left">
                <DialogTitle className="text-lg font-semibold text-slate-900">
                  Crear documento físico
                </DialogTitle>
                <DialogDescription className="text-sm text-slate-500">
                  Registra una factura manual. Al crearla quedarás asignado como
                  responsable en la fase de revisión de líder.
                </DialogDescription>
              </DialogHeader>
              {selectedEmpresa ? (
                <Badge
                  variant="outline"
                  className="mt-3 inline-flex max-w-full items-center gap-2 rounded-lg border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700"
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{
                      backgroundColor: selectedEmpresa.info?.color ?? "#64748b",
                    }}
                  />
                  <span className="truncate">{selectedEmpresa.nombre}</span>
                </Badge>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="space-y-8">
            <FormSection
              title="Empresa"
              description="El documento quedará asociado a la empresa que elijas."
            >
              <RadioGroup
                value={form.empresaId?.toString() ?? ""}
                onValueChange={(value) => patch({ empresaId: Number(value) })}
                className="grid gap-2 sm:grid-cols-2"
              >
                {empresaOptions.map((opcion) => {
                  const selected = form.empresaId === opcion.id;
                  return (
                    <div
                      key={opcion.id}
                      className={cn(
                        "flex items-start gap-3 rounded-xl border p-3 transition-colors",
                        selected
                          ? "border-slate-900 bg-slate-50"
                          : "border-slate-200 bg-white",
                      )}
                    >
                      <RadioGroupItem
                        value={String(opcion.id)}
                        id={`physical-doc-empresa-${opcion.id}`}
                        className="mt-0.5"
                      />
                      <label
                        htmlFor={`physical-doc-empresa-${opcion.id}`}
                        className="min-w-0 flex-1 cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="h-3 w-3 shrink-0 rounded-full"
                            style={{
                              backgroundColor: opcion.info?.color ?? "#64748b",
                            }}
                          />
                          <span className="truncate font-medium text-slate-900">
                            {opcion.nombre}
                          </span>
                        </div>
                        {opcion.info?.nit ? (
                          <p className="mt-0.5 text-xs text-slate-500">
                            NIT {opcion.info.nit}
                          </p>
                        ) : null}
                      </label>
                    </div>
                  );
                })}
              </RadioGroup>
            </FormSection>

            <FormSection
              title="Proveedor y documento"
              description="Datos básicos de la factura física."
            >
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Número factura">
                  <Input
                    value={form.numeroFactura}
                    onChange={(event) =>
                      patch({ numeroFactura: event.target.value })
                    }
                  />
                </Field>
                <Field label="NIT proveedor">
                  <Input
                    value={form.proveedorNit}
                    onChange={(event) =>
                      patch({ proveedorNit: event.target.value })
                    }
                  />
                </Field>
                <div className="md:col-span-2">
                  <Field label="Proveedor">
                    <Input
                      value={form.proveedorNombre}
                      onChange={(event) =>
                        patch({ proveedorNombre: event.target.value })
                      }
                    />
                  </Field>
                </div>
                <Field label="Fecha emisión">
                  <DatePicker
                    value={fechaEmisionDate}
                    onChange={(date) =>
                      patch({ fechaEmision: date ? dateToInputValue(date) : "" })
                    }
                    placeholder="Selecciona fecha de emisión"
                  />
                </Field>
                <Field label="Fecha vencimiento">
                  <DatePicker
                    value={fechaVencimientoDate}
                    onChange={(date) =>
                      patch({
                        fechaVencimiento: date ? dateToInputValue(date) : "",
                      })
                    }
                    placeholder="Opcional"
                  />
                </Field>
              </div>
            </FormSection>

            <FormSection
              title="Valores"
              description="Montos del documento y categoría contable."
            >
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Subtotal">
                  <Input
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={formatMoneyInput(form.subtotal)}
                    onChange={(event) => {
                      const normalized = normalizeMoneyInput(
                        event.target.value,
                        form.subtotal,
                      );
                      if (normalized !== null) patch({ subtotal: normalized });
                    }}
                    placeholder="$ 0,00"
                  />
                </Field>
                <Field label="Impuestos">
                  <Input
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={formatMoneyInput(form.impuestos)}
                    onChange={(event) => {
                      const normalized = normalizeMoneyInput(
                        event.target.value,
                        form.impuestos,
                      );
                      if (normalized !== null) patch({ impuestos: normalized });
                    }}
                    placeholder="$ 0,00"
                  />
                </Field>
                <Field label={hasComponentValue ? "Total calculado" : "Total"}>
                  <Input
                    type="text"
                    inputMode={hasComponentValue ? undefined : "decimal"}
                    autoComplete="off"
                    value={
                      hasComponentValue
                        ? calculatedTotal === null
                          ? ""
                          : formatCurrency(
                              calculatedTotal,
                              form.moneda.trim().toUpperCase() || "COP",
                            )
                        : formatMoneyInput(form.total)
                    }
                    readOnly={hasComponentValue}
                    aria-readonly={hasComponentValue ? "true" : undefined}
                    onChange={(event) => {
                      if (hasComponentValue) return;
                      const normalized = normalizeMoneyInput(
                        event.target.value,
                        form.total,
                      );
                      if (normalized !== null) patch({ total: normalized });
                    }}
                    className={cn(
                      "font-semibold tabular-nums",
                      hasComponentValue && "bg-slate-50",
                    )}
                    placeholder="$ 0,00"
                  />
                  <p className="mt-1 text-xs font-normal text-slate-500">
                    {hasComponentValue
                      ? "Subtotal + impuestos"
                      : "Ingresa el total del documento"}
                  </p>
                </Field>
                <Field label="Moneda">
                  <Select
                    value={form.moneda}
                    onValueChange={(value) => patch({ moneda: value })}
                  >
                    <SelectTrigger className="h-10 rounded-md border-slate-200 bg-white">
                      <SelectValue placeholder="Selecciona moneda" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="COP">COP</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="GYD">GYD</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Categoría">
                  <Select
                    value={form.categoria}
                    onValueChange={(value) =>
                      patch({
                        categoria: value as PhysicalDocumentForm["categoria"],
                      })
                    }
                  >
                    <SelectTrigger className="h-10 rounded-md border-slate-200 bg-white">
                      <SelectValue placeholder="Selecciona categoría" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="administracion">Administración</SelectItem>
                      <SelectItem value="tecnologia">Tecnología</SelectItem>
                      <SelectItem value="otro">Otro</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              {total !== null && total > 0 ? (
                <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <span className="text-sm text-slate-600">Total a registrar</span>
                  <span className="text-base font-semibold tabular-nums text-slate-900">
                    {formatCurrency(total, form.moneda.trim().toUpperCase() || "COP")}
                  </span>
                </div>
              ) : null}
            </FormSection>

            <FormSection
              title="Soporte y descripción"
              description="Adjunta el archivo del documento y describe brevemente su contenido."
            >
              <Field label="Soporte">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    "flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-6 text-center transition-colors",
                    form.file
                      ? "border-slate-300 bg-slate-50"
                      : "border-slate-300 bg-white hover:border-slate-400 hover:bg-slate-50",
                  )}
                >
                  <Upload className="h-5 w-5 text-slate-500" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">
                      {form.file?.name ?? "Seleccionar imagen o PDF"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {form.file
                        ? formatFileSize(form.file.size)
                        : "Formatos: imagen o PDF · Máximo 25MB"}
                    </p>
                  </div>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept="image/*,application/pdf"
                  onChange={(event) =>
                    patch({ file: event.target.files?.[0] ?? null })
                  }
                />
              </Field>

              <Field label="Descripción">
                <Textarea
                  className="min-h-24 resize-none"
                  value={form.descripcion}
                  onChange={(event) => patch({ descripcion: event.target.value })}
                />
              </Field>
            </FormSection>
          </div>
        </div>

        <div className="sticky bottom-0 border-t border-slate-200 bg-white px-6 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-500">
              {isFormReady
                ? "Todos los campos requeridos están completos."
                : "Completa los campos requeridos para habilitar la creación."}
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                className="rounded-xl"
                onClick={() => {
                  reset();
                  onOpenChange(false);
                }}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                className="rounded-xl"
                disabled={loading || !isFormReady}
                onClick={() => void submit()}
              >
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <FilePlus2 className="mr-2 h-4 w-4" />
                )}
                Crear documento
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type PhysicalReceiptForm = {
  nit: string;
  nombreEmpresa: string;
  concepto: string;
  fechaPago: string;
  valor: string;
  centroCostoCodigo: string;
  centroCostoNombre: string;
  centrosCostoDistribucion: CentroCostoDistribucionRow[];
  observaciones: string;
  cajaMenorId: string;
  file: File | null;
};

function PhysicalCajaMenorReceiptDialog({
  open,
  empresa,
  actor,
  generateUploadUrl,
  crearReciboFisicoCajaMenor,
  onOpenChange,
}: {
  open: boolean;
  empresa: number;
  actor: {
    actorUserId?: string;
    actorNombre: string;
    actorEmail: string;
  };
  generateUploadUrl: (args: Record<string, never>) => Promise<string>;
  crearReciboFisicoCajaMenor: (
    args: FunctionArgs<typeof api.cajasMenores.crearReciboFisicoCajaMenor>,
  ) => Promise<unknown>;
  onOpenChange: (open: boolean) => void;
}) {
  const [form, setForm] = useState<PhysicalReceiptForm>(() => ({
    nit: "",
    nombreEmpresa: "",
    concepto: "",
    fechaPago: new Date().toISOString().slice(0, 10),
    valor: "",
    centroCostoCodigo: "",
    centroCostoNombre: "",
    centrosCostoDistribucion: createDefaultDistribucion(0),
    observaciones: "",
    cajaMenorId: "",
    file: null,
  }));
  const [loading, setLoading] = useState(false);
  const valor = Number(form.valor);
  const cajasResult = useQuery(
    api.cajasMenores.obtenerCajasAsignadasDisponiblesV2,
    open && actor.actorUserId && Number.isFinite(valor) && valor > 0
      ? {
          empresa,
          userId: actor.actorUserId,
          valorMinimo: valor,
        }
      : "skip",
  );
  type CajaDisponible = Doc<"cajasMenores"> & { saldoDisponible: number };
  const cajasNormalized = useMemo(
    () => normalizeCajasMenoresDisponibles<CajaDisponible>(cajasResult),
    [cajasResult],
  );
  const cajasData = cajasNormalized.cajas;
  const permitirSaldoNegativo = cajasNormalized.permitirSaldoNegativo;
  const contratoIncompatible = cajasNormalized.contract !== "v2";
  const valorNumerico = Number(form.valor);
  const selectedCaja = cajasData.find((caja) => String(caja._id) === form.cajaMenorId);
  const saldoDespuesSeleccion =
    selectedCaja && Number.isFinite(valorNumerico)
      ? selectedCaja.saldoDisponible - valorNumerico
      : null;
  const fechaPagoDate = form.fechaPago
    ? parseLocalDate(form.fechaPago)
    : undefined;
  const cajaMenorOptions = useMemo(
    () =>
      cajasData.map((caja) => ({
        label: `${caja.nombre} · ${formatCurrency(caja.saldoDisponible, "COP")}`,
        value: String(caja._id),
      })),
    [cajasData],
  );

  useEffect(() => {
    if (cajasResult === undefined || !contratoIncompatible) return;
    console.error("[CajaMenor] Contrato de cajas disponibles incompatible", {
      empresa,
      contract: cajasNormalized.contract,
    });
  }, [cajasNormalized.contract, cajasResult, contratoIncompatible, empresa]);

  function patch(next: Partial<PhysicalReceiptForm>) {
    setForm((current) => ({ ...current, ...next }));
  }

  function reset() {
    setForm({
      nit: "",
      nombreEmpresa: "",
      concepto: "",
      fechaPago: new Date().toISOString().slice(0, 10),
      valor: "",
      centroCostoCodigo: "",
      centroCostoNombre: "",
      centrosCostoDistribucion: createDefaultDistribucion(0),
      observaciones: "",
      cajaMenorId: "",
      file: null,
    });
  }

  async function submit() {
    if (!actor.actorUserId) {
      toast.error("No se pudo identificar tu usuario.");
      return;
    }
    if (!form.nombreEmpresa.trim() || !form.concepto.trim()) {
      toast.error("Completa nombre de empresa y concepto.");
      return;
    }
    if (!form.fechaPago || !Number.isFinite(valor) || valor <= 0) {
      toast.error("Ingresa fecha de pago y valor válido.");
      return;
    }
    if (!isDistribucionValid(valor, form.centrosCostoDistribucion)) {
      toast.error("Completa la distribución de centros de costo.");
      return;
    }
    if (!form.cajaMenorId) {
      toast.error("Selecciona la Caja Menor.");
      return;
    }
    if (!form.file) {
      toast.error("Adjunta el soporte del recibo físico.");
      return;
    }

    setLoading(true);
    try {
      const uploadUrl = await generateUploadUrl({});
      const uploadResult = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": form.file.type || "application/octet-stream" },
        body: form.file,
      });
      if (!uploadResult.ok) throw new Error("No se pudo subir el soporte.");
      const { storageId } = (await uploadResult.json()) as { storageId: string };
      const legacy = toLegacyCentroCosto(form.centrosCostoDistribucion);
      await crearReciboFisicoCajaMenor({
        empresa,
        cajaMenorId: form.cajaMenorId as Id<"cajasMenores">,
        nit: form.nit.trim() || undefined,
        nombreEmpresa: form.nombreEmpresa.trim(),
        concepto: form.concepto.trim(),
        fechaPago: form.fechaPago,
        valor,
        centroCostoCodigo: legacy.centroCostoCodigo,
        centroCostoNombre: legacy.centroCostoNombre,
        centrosCostoDistribucion: form.centrosCostoDistribucion,
        observaciones: form.observaciones.trim() || undefined,
        soporteStorageId: storageId as Id<"_storage">,
        soporteNombre: form.file.name,
        soporteMimeType: form.file.type || undefined,
        soporteSize: form.file.size,
        actorUserId: actor.actorUserId,
        actorNombre: actor.actorNombre,
        actorEmail: actor.actorEmail,
      });
      toast.success("Recibo físico creado para reembolso.");
      reset();
      onOpenChange(false);
    } catch (error) {
      toast.error(
        getFacturacionErrorMessage(
          error,
          "No se pudo crear el recibo de caja menor. Revisa la información e intenta nuevamente.",
        ),
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle>Recibo físico Caja Menor</DialogTitle>
          <DialogDescription>
            Crea un recibo para el flujo de reembolso de Caja Menor.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="NIT">
            <Input
              value={form.nit}
              onChange={(event) => patch({ nit: event.target.value })}
              placeholder="Opcional"
            />
          </Field>
          <Field label="Nombre empresa">
            <Input
              value={form.nombreEmpresa}
              onChange={(event) => patch({ nombreEmpresa: event.target.value })}
            />
          </Field>
          <Field label="Concepto">
            <Input
              value={form.concepto}
              onChange={(event) => patch({ concepto: event.target.value })}
            />
          </Field>
          <Field label="Fecha pago">
            <DatePicker
              value={fechaPagoDate}
              onChange={(date) =>
                patch({ fechaPago: date ? dateToInputValue(date) : "" })
              }
              placeholder="Selecciona fecha de pago"
            />
          </Field>
          <Field label="Valor">
            <Input
              type="text"
              inputMode="numeric"
              value={formatCopInput(form.valor)}
              onChange={(event) => {
                const nextValor = parseCopInput(event.target.value);
                const numeric = Number(nextValor);
                patch({
                  valor: nextValor,
                  cajaMenorId: "",
                  centrosCostoDistribucion: createDefaultDistribucion(
                    Number.isFinite(numeric) && numeric > 0 ? numeric : 0,
                    {
                      centroCostoCodigo: form.centroCostoCodigo,
                      centroCostoNombre: form.centroCostoNombre,
                      centrosCostoDistribucion: form.centrosCostoDistribucion,
                    },
                  ),
                });
              }}
              placeholder="$ 0"
            />
          </Field>
          <div className="md:col-span-2">
            <CentroCostoDistribucionEditor
              total={valorNumerico > 0 ? valorNumerico : 0}
              value={form.centrosCostoDistribucion}
              empresa={empresa}
              disabled={loading || !Number.isFinite(valorNumerico) || valorNumerico <= 0}
              onChange={(centrosCostoDistribucion) => {
                const legacy = toLegacyCentroCosto(centrosCostoDistribucion);
                patch({
                  centrosCostoDistribucion,
                  centroCostoCodigo: legacy.centroCostoCodigo,
                  centroCostoNombre: legacy.centroCostoNombre,
                });
              }}
            />
          </div>
          <Field label="Caja Menor">
            <SearchableSelect
              options={cajaMenorOptions}
              value={form.cajaMenorId}
              onValueChange={(cajaMenorId) => patch({ cajaMenorId })}
              disabled={!valor || cajasResult === undefined}
              placeholder={
                !valor
                  ? "Ingresa primero el valor"
                  : cajasResult === undefined
                    ? "Cargando Cajas Menores..."
                    : "Selecciona Caja Menor"
              }
              emptyMessage={
                contratoIncompatible
                  ? "No fue posible cargar las Cajas Menores. Actualiza la página o contacta soporte."
                  : permitirSaldoNegativo
                  ? "No hay Cajas Menores activas asignadas a ti"
                  : "No hay Cajas Menores con saldo suficiente"
              }
            />
            {saldoDespuesSeleccion !== null && saldoDespuesSeleccion < 0 ? (
              <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Esta operación dejará la caja en saldo negativo (
                {formatCurrency(saldoDespuesSeleccion, "COP")}).
              </p>
            ) : null}
          </Field>
          <Field label="Soporte">
            <label className="flex h-10 cursor-pointer items-center gap-2 rounded-md border border-dashed border-slate-300 bg-white px-3 text-sm text-slate-600">
              <Upload className="h-4 w-4" />
              <span className="truncate">
                {form.file?.name ?? "Adjuntar imagen o PDF"}
              </span>
              <input
                type="file"
                className="hidden"
                accept="image/*,application/pdf"
                onChange={(event) =>
                  patch({ file: event.target.files?.[0] ?? null })
                }
              />
            </label>
          </Field>
          <div className="md:col-span-2">
            <Field label="Observaciones">
              <Textarea
                className="min-h-24 resize-none"
                value={form.observaciones}
                onChange={(event) => patch({ observaciones: event.target.value })}
              />
            </Field>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
          <Button
            type="button"
            variant="outline"
            className="rounded-xl"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            className="rounded-xl"
            disabled={loading}
            onClick={() => void submit()}
          >
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ReceiptText className="mr-2 h-4 w-4" />
            )}
            Crear recibo
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {description ? (
          <p className="mt-0.5 text-xs text-slate-500">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}

function parseLocalDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day);
}

function dateToInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDefaultPhysicalDocumentForm(
  defaultEmpresaId: number | null = null,
): PhysicalDocumentForm {
  return {
    empresaId: defaultEmpresaId,
    numeroFactura: "",
    proveedorNit: "",
    proveedorNombre: "",
    fechaEmision: new Date().toISOString().slice(0, 10),
    fechaVencimiento: "",
    subtotal: "",
    impuestos: "",
    total: "",
    moneda: "COP",
    descripcion: "",
    categoria: "administracion",
    file: null,
  };
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Used by the caja-menor receipt dialog below; the physical document fields
// use the decimal-aware helpers from lib/money instead.
function parseCopInput(value: string) {
  return value.replace(/\D/g, "");
}

function formatCopInput(value: string) {
  const digits = parseCopInput(value);
  if (!digits) return "";
  return `$ ${Number(digits).toLocaleString("es-CO")}`;
}

function getPaginationItems(currentPage: number, totalPages: number) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set<number>([1, totalPages]);

  for (let page = currentPage - 1; page <= currentPage + 1; page += 1) {
    if (page > 1 && page < totalPages) pages.add(page);
  }

  if (currentPage <= 3) {
    pages.add(2);
    pages.add(3);
    pages.add(4);
  }

  if (currentPage >= totalPages - 2) {
    pages.add(totalPages - 1);
    pages.add(totalPages - 2);
    pages.add(totalPages - 3);
  }

  const sortedPages = Array.from(pages)
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((a, b) => a - b);

  return sortedPages.reduce<Array<number | string>>((items, page, index) => {
    const previousPage = sortedPages[index - 1];
    if (previousPage && page - previousPage > 1) {
      items.push(`ellipsis-${previousPage}-${page}`);
    }
    items.push(page);
    return items;
  }, []);
}
