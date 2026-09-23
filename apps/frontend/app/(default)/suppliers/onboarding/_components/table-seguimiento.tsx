"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  ArrowUpDown,
  Ban,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  FileText,
  Loader2,
  MoreHorizontal,
  Search,
  Settings2,
  XCircle,
} from "lucide-react";
import { differenceInDays, format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useEmpresaFilter } from "@/hooks/useEmpresaFilter";
import { useInscripcionDeepLink } from "@/hooks/useInscripcionDeepLink";
import { useUsuariosMap } from "@/hooks/useUsuariosMap";
import { ROLES_CUMPLIMIENTO } from "@/lib/onboarding/roles";
import { CorreoStatusBadge, pickCorreoResumenVisible } from "./correo-status";
import { DetailDialog, permisosDetalle } from "./detail-dialog";
import DownloadPdfMenu from "./download-pdf-menu";
import { FaseDialogs, type FaseDialogKey, faseDialogFor } from "./fase-dialogs";
import {
  EVALUACION_CONFIG,
  evaluacionFromRiesgo,
  FASE_CONFIG,
  FASES_ORDERED,
  FASES_TERMINALES,
  getInitials,
  getOnboardingErrorMessage,
  RIESGO_CONFIG,
  rolRequeridoParaFase,
  SUPPLIER_MODULO,
  TipoSolicitudChip,
} from "./ui-config";

export type SeguimientoData = FunctionReturnType<typeof api.onboarding.suppliers.obtenerInscripcionesConUltimaFase>;

export interface ExportRow {
  razonSocial: string;
  tipoSolicitud: string;
  tipoPersona: string;
  tipoDocumento: string;
  numeroDocumento: string;
  contactoEmail: string;
  riesgo: string;
  evaluacion: string;
  servicioSuministrado: string;
  montoAnual: string;
  faseActual: string;
  responsableNombre: string;
  responsableProceso: string;
  fechaInicioProceso: string;
  fechaUltimaFase: string;
}

function daysSince(ts: number) {
  return differenceInDays(Date.now(), ts);
}

// ─── Phase progress column ──────────────────────────────────────────────────────
function PhaseProgress({ faseActual }: { faseActual: string | undefined }) {
  const isCompleted = faseActual === "COMPLETADO";
  const isRejected = faseActual === "RECHAZADO";
  const isAnulada = faseActual === "ANULADA";
  const currentIdx = FASES_ORDERED.indexOf(faseActual ?? "");
  const total = FASES_ORDERED.length;
  const progress = isCompleted ? 100 : currentIdx >= 0 ? Math.round(((currentIdx + 1) / total) * 100) : 0;
  const done = isCompleted ? total : currentIdx >= 0 ? currentIdx + 1 : 0;

  if (isCompleted) {
    return (
      <div className="space-y-1.5">
        <Badge variant="outline" className="gap-1 border-green-200 bg-green-50 text-[11px] font-medium text-green-700">
          <CheckCircle2 className="h-3 w-3" /> Completado
        </Badge>
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-green-500" style={{ width: "100%" }} />
          </div>
          <span className="font-mono text-[10px] text-slate-400">
            {total}/{total}
          </span>
        </div>
      </div>
    );
  }
  if (isRejected) {
    return (
      <Badge variant="outline" className="gap-1 border-red-200 bg-red-50 text-[11px] font-medium text-red-700">
        <XCircle className="h-3 w-3" /> Rechazado
      </Badge>
    );
  }
  if (isAnulada) {
    return (
      <Badge variant="outline" className="gap-1 border-slate-300 bg-slate-100 text-[11px] font-medium text-slate-700">
        <Ban className="h-3 w-3" /> Anulada
      </Badge>
    );
  }
  if (!faseActual || currentIdx < 0) return <span className="text-xs text-slate-400">—</span>;

  const faseConf = FASE_CONFIG[faseActual];
  return (
    <div className="space-y-1.5">
      <Badge variant="outline" className={`gap-1 border text-[11px] font-medium ${faseConf.border} ${faseConf.bg} ${faseConf.color}`}>
        <Clock className="h-3 w-3" />
        {faseConf.short} · {faseConf.label.split(" ")[0]}
      </Badge>
      <div className="flex items-center gap-2">
        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${progress}%` }} />
        </div>
        <span className="font-mono text-[10px] text-slate-400">
          {done}/{total}
        </span>
      </div>
    </div>
  );
}

// ─── Stats bar ─────────────────────────────────────────────────────────────────
function StatsBar({ rows, faseFiltro, setFaseFiltro }: { rows: Array<{ faseActual?: string }>; faseFiltro: string; setFaseFiltro: (v: string) => void }) {
  const stats = useMemo(() => {
    const counts: Record<string, number> = {};
    rows.forEach((r) => {
      const f = r.faseActual ?? "SIN_FASE";
      counts[f] = (counts[f] ?? 0) + 1;
    });
    const inProgress = rows.filter((r) => r.faseActual && !FASES_TERMINALES.has(r.faseActual)).length;
    return { total: rows.length, inProgress, completado: counts.COMPLETADO ?? 0, rechazado: counts.RECHAZADO ?? 0, anulada: counts.ANULADA ?? 0 };
  }, [rows]);

  const { empresaActiva } = useEmpresaFilter();
  const rolesConfig = useQuery(api.onboarding.roles.obtenerRolesConfig, empresaActiva !== null ? { modulo: SUPPLIER_MODULO, empresa: empresaActiva } : "skip");
  const nombreRol = (rol: string) => rolesConfig?.find((r) => r.rol === rol)?.nombre ?? null;

  const fasesActivas = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => {
      if (r.faseActual) s.add(r.faseActual);
    });
    return s;
  }, [rows]);

  const STAT_CARDS = [
    { label: "Total registros", value: stats.total, icon: FileText, iconBg: "bg-blue-50", iconColor: "text-blue-600", border: "border-blue-100" },
    { label: "En proceso", value: stats.inProgress, icon: Clock, iconBg: "bg-amber-50", iconColor: "text-amber-600", border: "border-amber-100" },
    { label: "Completados", value: stats.completado, icon: CheckCircle2, iconBg: "bg-green-50", iconColor: "text-green-600", border: "border-green-100" },
    { label: "Rechazados", value: stats.rechazado, icon: XCircle, iconBg: "bg-red-50", iconColor: "text-red-500", border: "border-red-100" },
    { label: "Anuladas", value: stats.anulada, icon: Ban, iconBg: "bg-slate-100", iconColor: "text-slate-600", border: "border-slate-200" },
  ];

  const FASES_PIPELINE = [
    { faseKey: "I_ANALISIS_RIESGO", label: "I. Análisis de Riesgo", rol: "Responsable", nombre: null },
    { faseKey: "II_PENDIENTE_FORMULARIO", label: "II. Formulario Proveedor", rol: "Proveedor", nombre: null },
    { faseKey: "IIA_PENDIENTE_FIRMA", label: "IIA. Pendiente firma", rol: "Proveedor", nombre: null },
    { faseKey: "III_REVISION_DOCUMENTAL", label: "III. Revisión documental", rol: "Cumplimiento / Compras", nombre: nombreRol("CUMPLIMIENTO_LOW_RISK") },
    { faseKey: "IV_APROBADO_CUMPLIMIENTO", label: "IV. Aprobación Cumplimiento", rol: "Cumplimiento", nombre: nombreRol("CUMPLIMIENTO_LOW_RISK") },
    { faseKey: "V_EVALUACION_COMPRAS", label: "V. Evaluación Compras", rol: "Compras", nombre: nombreRol("COMPRAS") },
    { faseKey: "VI_CREACION_CONTABILIDAD", label: "VI. Creación Contabilidad", rol: "Contabilidad", nombre: nombreRol("CONTABILIDAD") },
    { faseKey: "COMPLETADO", label: "Completados", rol: "", nombre: null },
    { faseKey: "RECHAZADO", label: "Rechazados", rol: "", nombre: null },
    { faseKey: "ANULADA", label: "Anuladas", rol: "", nombre: null },
  ];

  return (
    <div className="space-y-4 border-b border-slate-100 p-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {STAT_CARDS.map(({ label, value, icon: Icon, iconBg, iconColor, border }) => (
          <div key={label} className={`flex items-center gap-3 rounded-xl border bg-white p-4 transition-all hover:shadow-xs ${border}`}>
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${iconBg}`}>
              <Icon className={`h-5 w-5 ${iconColor}`} />
            </div>
            <div>
              <p className="text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
              <p className="text-xs text-slate-500">{label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
        <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400">Filtrar por fase</p>
        <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
          {FASES_PIPELINE.map((f, i) => {
            const activa = fasesActivas.has(f.faseKey);
            const selected = faseFiltro === f.faseKey;
            return (
              <div key={f.faseKey} className="flex shrink-0 items-center gap-1">
                {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300" />}
                <button
                  type="button"
                  disabled={!activa && !selected}
                  onClick={() => setFaseFiltro(selected ? "TODOS" : f.faseKey)}
                  className={`flex flex-col items-start rounded-lg px-3 py-2 text-left transition-all focus-visible:outline-hidden ${
                    selected
                      ? "bg-blue-600 text-white shadow-xs ring-1 ring-blue-500"
                      : activa
                        ? "text-slate-600 hover:bg-white hover:text-slate-900 hover:shadow-xs"
                        : "cursor-default text-slate-400 opacity-35"
                  }`}
                >
                  <span className="text-[11px] font-semibold leading-tight">{f.label}</span>
                  {f.rol && <span className={`text-[10px] leading-tight ${selected ? "opacity-80" : "opacity-60"}`}>{f.nombre ? `${f.rol}: ${f.nombre}` : f.rol}</span>}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────
type SortField = "razonSocial" | "riesgo" | "_creationTime" | "faseActual";
type SortDir = "asc" | "desc";

export default function TableSeguimiento({ data, onDataChange }: { data: SeguimientoData | undefined; onDataChange?: (all: ExportRow[], filtered: ExportRow[]) => void }) {
  const inscripciones = data?.inscripciones;
  const access = data?.access;
  const nivel = access?.nivel;
  const modoResponsable = nivel === "responsable";
  const modoSoloConsulta = nivel === "solo_lectura" || nivel === "consulta_creacion";
  const rolesPorEmpresa = useMemo(() => {
    const map = new Map<number, string[]>();
    for (const r of access?.roles ?? []) map.set(r.empresa, [...(map.get(r.empresa) ?? []), r.rol]);
    return map;
  }, [access]);
  const esSoloFinanciero = !access?.isAdmin && (access?.roles.length ?? 0) > 0 && (access?.roles ?? []).every((r) => r.rol === "FINANCIERO");
  const anularProceso = useMutation(api.onboarding.suppliers.anularProceso);

  const [search, setSearch] = useState("");
  const [faseFiltro, setFaseFiltro] = useState("TODOS");
  const [riesgoFiltro, setRiesgoFiltro] = useState("TODOS");
  const [sortField, setSortField] = useState<SortField>("_creationTime");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  const [detailId, setDetailId] = useState<Id<"onboardingProveedores"> | null>(null);
  useInscripcionDeepLink(inscripciones, setDetailId);
  const [anularId, setAnularId] = useState<Id<"onboardingProveedores"> | null>(null);
  const [motivoAnulacion, setMotivoAnulacion] = useState("");
  const [anulando, setAnulando] = useState(false);
  const [gestionId, setGestionId] = useState<Id<"onboardingProveedores"> | null>(null);
  const [gestionDialog, setGestionDialog] = useState<FaseDialogKey | null>(null);

  function handleGestionar(id: Id<"onboardingProveedores">, faseActual: string | undefined) {
    const key = faseDialogFor(faseActual);
    if (!key) return;
    setGestionId(id);
    setGestionDialog(key);
  }

  const rows = useMemo(() => {
    if (!inscripciones) return [];
    return inscripciones.map((ins) => ({
      _id: ins._id,
      _creationTime: ins._creationTime,
      empresa: ins.empresa,
      razonSocial: ins.datos_generales_01.razonSocial ?? "—",
      tipoSolicitud: ins.tipoSolicitud,
      tipoPersona: ins.datos_generales_01.tipoPersona ?? "PERSONA_JURIDICA",
      tipoDocumento: ins.datos_generales_01.tipoDocumento ?? "",
      numeroDocumento: ins.datos_generales_01.numeroDocumento ?? "—",
      contactoEmail: ins.datos_generales_01.contactoEmail ?? "",
      riesgo: ins.matriz_00.riesgo ?? "INDEFINIDO",
      evaluacion: ins.tipoEvaluacion_14 ?? evaluacionFromRiesgo(ins.matriz_00.riesgo ?? "INDEFINIDO"),
      servicioSuministrado: ins.matriz_00.servicioSuministrado ?? "—",
      montoAnual: ins.matriz_00.montoAnual ?? "—",
      iniciadoPor: ins.matriz_00.responsableId ?? "—",
      tipoProveedor: ins.tipoProveedor ?? "GENERAL",
      faseActual: ins.faseActual as string,
      ultimaFaseInicio: ins.ultimaFaseInicio ?? null,
      correoResumen: ins.correoResumen,
    }));
  }, [inscripciones]);

  const filtered = useMemo(() => {
    let result = [...rows];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (r) =>
          r.razonSocial.toLowerCase().includes(q) ||
          r.numeroDocumento.toLowerCase().includes(q) ||
          r.contactoEmail.toLowerCase().includes(q) ||
          r.servicioSuministrado.toLowerCase().includes(q),
      );
    }
    if (faseFiltro !== "TODOS") result = result.filter((r) => r.faseActual === faseFiltro);
    if (riesgoFiltro !== "TODOS") result = result.filter((r) => r.riesgo === riesgoFiltro);
    result.sort((a, b) => {
      let aVal: string | number = a[sortField] ?? "";
      let bVal: string | number = b[sortField] ?? "";
      if (typeof aVal === "string") aVal = aVal.toLowerCase();
      if (typeof bVal === "string") bVal = bVal.toLowerCase();
      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return result;
  }, [rows, search, faseFiltro, riesgoFiltro, sortField, sortDir]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const userIdsToResolve = useMemo(() => rows.map((r) => r.iniciadoPor), [rows]);
  const userDataMap = useUsuariosMap(userIdsToResolve);

  // `onDataChange` is memoized by the parent (useCallback), so it is safe as a dependency.
  useEffect(() => {
    if (!onDataChange) return;
    function toExportRow(r: (typeof rows)[0]): ExportRow {
      const u = userDataMap[r.iniciadoPor];
      return {
        razonSocial: r.razonSocial,
        tipoSolicitud: r.tipoSolicitud,
        tipoPersona: r.tipoPersona === "PERSONA_NATURAL" ? "Persona Natural" : "Persona Jurídica",
        tipoDocumento: r.tipoDocumento,
        numeroDocumento: r.numeroDocumento,
        contactoEmail: r.contactoEmail,
        riesgo: RIESGO_CONFIG[r.riesgo]?.label ?? r.riesgo,
        evaluacion: EVALUACION_CONFIG[r.evaluacion]?.label ?? r.evaluacion,
        servicioSuministrado: r.servicioSuministrado,
        montoAnual: r.montoAnual,
        faseActual: FASE_CONFIG[r.faseActual]?.label ?? r.faseActual ?? "—",
        responsableNombre: u?.nombre ?? r.iniciadoPor,
        responsableProceso: u?.proceso ?? "—",
        fechaInicioProceso: format(new Date(r._creationTime), "dd/MM/yyyy", { locale: es }),
        fechaUltimaFase: r.ultimaFaseInicio ? format(new Date(r.ultimaFaseInicio), "dd/MM/yyyy", { locale: es }) : "—",
      };
    }
    onDataChange(rows.map(toExportRow), filtered.map(toExportRow));
  }, [rows, filtered, userDataMap, onDataChange]);

  const detailInscripcion = useMemo(() => inscripciones?.find((i) => i._id === detailId) ?? null, [inscripciones, detailId]);

  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortField(field);
      setSortDir("asc");
    }
    setPage(1);
  }

  async function handleAnular(id: Id<"onboardingProveedores">) {
    if (!motivoAnulacion.trim()) {
      toast.error("Indica la razón de la anulación.");
      return;
    }
    setAnulando(true);
    try {
      await anularProceso({ inscripcionId: id, motivo: motivoAnulacion.trim() });
      toast.success("Inscripción anulada. Quedó disponible para auditoría y sus enlaces fueron revocados.");
      setAnularId(null);
      setMotivoAnulacion("");
    } catch (e) {
      toast.error(getOnboardingErrorMessage(e, "Error al anular la inscripción"));
    } finally {
      setAnulando(false);
    }
  }

  /** Client-side hint: the server enforces the same rule in every phase mutation. */
  function canGestionarRow(row: (typeof rows)[0]) {
    if (!access || modoResponsable || modoSoloConsulta) return false;
    if (!faseDialogFor(row.faseActual)) return false;
    if (access.isAdmin) return true;
    const roles = rolesPorEmpresa.get(row.empresa) ?? [];
    if (row.faseActual === "III_REVISION_DOCUMENTAL") return roles.some((r) => r === "COMPRAS" || ROLES_CUMPLIMIENTO.has(r));
    if (row.faseActual === "I_ANALISIS_RIESGO") return roles.some((r) => ROLES_CUMPLIMIENTO.has(r));
    const ins = inscripciones?.find((i) => i._id === row._id);
    const requerido = rolRequeridoParaFase(row.faseActual, ins?.tipoEvaluacion_14);
    return !!requerido && roles.includes(requerido);
  }

  const isLoading = inscripciones === undefined;
  const puedeAnular = nivel === "full" && !esSoloFinanciero;

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
        {!isLoading && (
          <StatsBar
            rows={rows}
            faseFiltro={faseFiltro}
            setFaseFiltro={(v) => {
              setFaseFiltro(v);
              setPage(1);
            }}
          />
        )}

        <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-3.5 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Buscar por nombre, documento, email..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="h-9 rounded-lg pl-9"
            />
          </div>
          <Select
            value={faseFiltro}
            onValueChange={(v) => {
              setFaseFiltro(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="h-9 w-full rounded-lg sm:w-[185px]">
              <SelectValue placeholder="Fase" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="TODOS">Todas las fases</SelectItem>
              <SelectItem value="I_ANALISIS_RIESGO">I · Análisis de Riesgo</SelectItem>
              <SelectItem value="II_PENDIENTE_FORMULARIO">II · Pendiente Formulario</SelectItem>
              <SelectItem value="IIA_PENDIENTE_FIRMA">IIA · Pendiente firma</SelectItem>
              <SelectItem value="III_REVISION_DOCUMENTAL">III · Revisión documental</SelectItem>
              <SelectItem value="IV_APROBADO_CUMPLIMIENTO">IV · Aprobación Cumplimiento</SelectItem>
              <SelectItem value="V_EVALUACION_COMPRAS">V · Evaluación Compras</SelectItem>
              <SelectItem value="VI_CREACION_CONTABILIDAD">VI · Creación Contabilidad</SelectItem>
              <SelectItem value="COMPLETADO">Completados</SelectItem>
              <SelectItem value="RECHAZADO">Rechazados</SelectItem>
              <SelectItem value="ANULADA">Anuladas</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={riesgoFiltro}
            onValueChange={(v) => {
              setRiesgoFiltro(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="h-9 w-full rounded-lg sm:w-[140px]">
              <SelectValue placeholder="Riesgo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="TODOS">Todo el riesgo</SelectItem>
              <SelectItem value="BAJO">Bajo</SelectItem>
              <SelectItem value="MEDIO">Medio</SelectItem>
              <SelectItem value="ALTO">Alto</SelectItem>
              <SelectItem value="SUPERIOR">Superior</SelectItem>
            </SelectContent>
          </Select>
          {!isLoading && (
            <span className="shrink-0 text-xs text-slate-400 sm:pl-1">
              {filtered.length} {filtered.length === 1 ? "registro" : "registros"}
            </span>
          )}
        </div>

        <div className="w-full overflow-x-auto">
          {isLoading ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="h-7 w-7 animate-spin text-blue-500" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center gap-2 text-sm text-slate-400">
              <FileText className="h-8 w-8 text-slate-200" />
              No se encontraron inscripciones con los filtros aplicados.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100 bg-slate-50/70">
                <tr>
                  <th className="px-5 py-3 text-left">
                    <button onClick={() => toggleSort("razonSocial")} className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-slate-400 transition-colors hover:text-slate-700">
                      Proveedor <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="px-5 py-3 text-left">
                    <button onClick={() => toggleSort("riesgo")} className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-slate-400 transition-colors hover:text-slate-700">
                      Riesgo <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Evaluación</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Servicio</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Progreso</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Responsable</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Correo</th>
                  <th className="px-5 py-3 text-left">
                    <button onClick={() => toggleSort("_creationTime")} className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-slate-400 transition-colors hover:text-slate-700">
                      Fechas <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className={modoSoloConsulta ? "w-32 px-3 py-3" : "w-12 px-3 py-3"} />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {paginated.map((row) => {
                  const riesgoConf = RIESGO_CONFIG[row.riesgo] ?? RIESGO_CONFIG.INDEFINIDO;
                  const evaluacionConf = EVALUACION_CONFIG[row.evaluacion] ?? EVALUACION_CONFIG.INDEFINIDO;
                  const days = daysSince(row._creationTime);
                  const isUrgent = days > 14 && !FASES_TERMINALES.has(row.faseActual);
                  const userData = userDataMap[row.iniciadoPor];
                  const displayName = userData?.nombre ?? row.iniciadoPor;
                  const displayProceso = userData?.proceso ?? "—";
                  const canGestionar = canGestionarRow(row);
                  const visible = pickCorreoResumenVisible({ faseActual: row.faseActual, form: row.correoResumen?.form, sign: row.correoResumen?.sign });
                  const needsManage =
                    (row.faseActual === "II_PENDIENTE_FORMULARIO" || row.faseActual === "IIA_PENDIENTE_FIRMA") &&
                    (!visible.resumen || visible.resumen.estado === "FALLIDO" || visible.resumen.estado === "PENDIENTE");

                  return (
                    <tr key={row._id} className="group cursor-pointer transition-colors hover:bg-slate-50/80" onDoubleClick={() => setDetailId(row._id)}>
                      <td className="max-w-[220px] px-5 py-3.5">
                        <p className="truncate font-semibold text-slate-800 transition-colors group-hover:text-blue-600" title={row.razonSocial}>
                          {row.razonSocial}
                        </p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                          <span className="font-mono text-xs text-slate-400">
                            {row.tipoDocumento} {row.numeroDocumento}
                          </span>
                          <span className="rounded-xs border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-400">{row.tipoPersona === "PERSONA_NATURAL" ? "Natural" : "Jurídica"}</span>
                          <TipoSolicitudChip tipoSolicitud={row.tipoSolicitud} className="rounded-xs" />
                          <span className="rounded-xs border border-indigo-100 bg-indigo-50 px-1.5 py-0.5 text-[10px] text-indigo-500">{row.tipoProveedor}</span>
                        </div>
                        {row.contactoEmail && (
                          <p className="mt-0.5 truncate text-xs text-slate-400" title={row.contactoEmail}>
                            {row.contactoEmail}
                          </p>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${riesgoConf.badge}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${riesgoConf.dot}`} />
                          {riesgoConf.label}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${evaluacionConf.badge}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${evaluacionConf.dot}`} />
                          {evaluacionConf.label}
                        </span>
                      </td>
                      <td className="max-w-[180px] px-5 py-3.5">
                        <p className="truncate text-sm font-medium text-slate-700" title={row.servicioSuministrado}>
                          {row.servicioSuministrado}
                        </p>
                        {row.montoAnual && row.montoAnual !== "—" && <p className="mt-0.5 text-xs text-slate-400">Monto: {row.montoAnual}</p>}
                      </td>
                      <td className="px-5 py-3.5">
                        <PhaseProgress faseActual={row.faseActual} />
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[10px] font-bold text-blue-600">{getInitials(displayName)}</div>
                          <div className="min-w-0">
                            <span className="block max-w-[110px] truncate text-xs text-slate-600" title={displayName}>
                              {displayName}
                            </span>
                            <span className="block max-w-[110px] truncate text-[10px] text-slate-400" title={displayProceso}>
                              {displayProceso}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="max-w-[180px] px-5 py-3.5">
                        <div className="space-y-1">
                          <CorreoStatusBadge handoffLabel={visible.handoffLabel} estado={visible.resumen?.estado ?? "sin_registro"} email={visible.resumen?.email} failureDetail={visible.resumen?.falloResumen} compact />
                          {needsManage && !modoSoloConsulta ? (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setDetailId(row._id);
                              }}
                              className="text-[11px] font-medium text-blue-700 hover:underline"
                            >
                              Gestionar
                            </button>
                          ) : null}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3.5">
                        <div className="space-y-0.5">
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Inicio proceso</p>
                            <p className={`text-xs font-medium ${isUrgent ? "text-orange-500" : "text-slate-700"}`}>
                              {format(new Date(row._creationTime), "dd MMM yyyy", { locale: es })}
                              {isUrgent && <span className="ml-1">⚠</span>}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Inicio última fase</p>
                            <p className="text-xs text-slate-500">{row.ultimaFaseInicio ? format(new Date(row.ultimaFaseInicio), "dd MMM yyyy", { locale: es }) : "—"}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3.5">
                        {modoSoloConsulta ? (
                          <Button variant="ghost" size="sm" className="h-8 whitespace-nowrap rounded-lg px-2 text-blue-600 hover:bg-blue-50 hover:text-blue-700" onClick={() => setDetailId(row._id)}>
                            <Eye className="mr-1.5 h-3.5 w-3.5" />
                            Ver detalles
                          </Button>
                        ) : (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52">
                              <DropdownMenuItem onClick={() => setDetailId(row._id)}>
                                <Eye className="mr-2 h-3.5 w-3.5" /> Ver detalles
                              </DropdownMenuItem>
                              {canGestionar && (
                                <DropdownMenuItem onClick={() => handleGestionar(row._id, row.faseActual)}>
                                  <Settings2 className="mr-2 h-3.5 w-3.5" /> Gestionar fase
                                </DropdownMenuItem>
                              )}
                              <DownloadPdfMenu inscripcionId={row._id} />
                              {puedeAnular && row.faseActual !== "ANULADA" && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem className="text-red-600 focus:bg-red-50 focus:text-red-600" onClick={() => setAnularId(row._id)}>
                                    <Ban className="mr-2 h-3.5 w-3.5" /> Anular proceso
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {!isLoading && totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3">
            <span className="text-xs text-slate-400">
              Página {page} de {totalPages}
            </span>
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      <DetailDialog
        inscripcion={detailInscripcion}
        open={!!detailId}
        onOpenChange={(open) => !open && setDetailId(null)}
        puedeVerAdjuntos={data?.puedeVerAdjuntos === true}
        {...permisosDetalle(access, detailInscripcion)}
      />

      <FaseDialogs
        inscripcionId={gestionId}
        dialog={gestionDialog}
        onClose={() => {
          setGestionDialog(null);
          setGestionId(null);
        }}
      />

      <Dialog
        open={!!anularId}
        onOpenChange={(open) => {
          if (!open) {
            setAnularId(null);
            setMotivoAnulacion("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Anular inscripción</DialogTitle>
            <DialogDescription>
              El proceso quedará en estado ANULADA, sus enlaces públicos dejarán de funcionar y seguirá visible en el listado y en el detalle para auditoría.
            </DialogDescription>
          </DialogHeader>
          <Textarea value={motivoAnulacion} onChange={(e) => setMotivoAnulacion(e.target.value)} placeholder="Razón de la anulación..." rows={3} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAnularId(null)} disabled={anulando}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={() => anularId && handleAnular(anularId)} disabled={anulando || !motivoAnulacion.trim()}>
              {anulando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Ban className="mr-1 h-4 w-4" />}
              Anular
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export type { Doc as SupplierDoc };
