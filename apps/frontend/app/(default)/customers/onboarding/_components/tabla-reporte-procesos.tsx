"use client";

import { Fragment, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { Ban, CheckCircle2, ChevronDown, ChevronRight, FileSpreadsheet, Loader2, Search, XCircle } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useEmpresaFilter } from "@/hooks/useEmpresaFilter";
import { getEmpresaNombre } from "@/lib/empresas";
import { diffDiasLaborales } from "@/lib/onboarding/dias-laborales";
import { CUSTOMER_FASE_LABELS, CUSTOMER_FASES_ORDEN_REPORTE } from "@/lib/onboarding/phases/customers";
import { formatDateTimeCO, RIESGO_CONFIG } from "./ui-config";

type TipoConteoDias = "calendario" | "laborales";
type EstadoFinal = "COMPLETADO" | "RECHAZADO" | "ANULADA";

function diffDays(from: number | null | undefined, to: number | null | undefined): number | null {
  if (!from || !to) return null;
  return Math.max(0, Math.round(((to - from) / (1000 * 60 * 60 * 24)) * 100) / 100);
}

function calcularDias(from: number | null | undefined, to: number | null | undefined, tipo: TipoConteoDias): number | null {
  return tipo === "laborales" ? diffDiasLaborales(from, to) : diffDays(from, to);
}

function getDiasLabel(tipo: TipoConteoDias): string {
  return tipo === "laborales" ? "Días laborales" : "Días calendario";
}

function formatDias(dias: number | null): string {
  if (dias == null) return "—";
  if (dias < 1) return `${Math.round(dias * 24)} h`;
  return `${dias.toFixed(dias < 10 ? 2 : 1)} d`;
}

type ReporteRow = {
  inscripcionId: string;
  empresa: number;
  tipoSolicitud: "INSCRIPCIÓN" | "ACTUALIZACIÓN";
  tipoPersona: string;
  tipoDocumento: string;
  numeroDocumento: string;
  razonSocial: string;
  riesgo: string;
  tipoEvaluacion: string;
  estadoFinal: EstadoFinal;
  fechaCreacion: number;
  fechaCierre: number | null;
  fases: Array<{
    fase: string;
    estado: string;
    fechaInicio: number | null;
    fechaCompletado: number | null;
    asignadoA: string | null;
    completadoPor: string | null;
    observaciones: string | null;
  }>;
};

async function exportExcel(rows: ReporteRow[]) {
  const XLSX = await import("xlsx");

  const crearResumen = (tipo: TipoConteoDias) => {
    const headers = ["Empresa", "Tipo Solicitud", "Tipo Documento", "Nro. Documento", "Razón Social", "Riesgo", "Evaluación", "Estado Final", "Fecha Inicio Proceso", "Fecha Cierre", `${getDiasLabel(tipo)} totales`];
    const data = rows.map((r) => {
      const dias = calcularDias(r.fechaCreacion, r.fechaCierre, tipo);
      return [
        getEmpresaNombre(r.empresa),
        r.tipoSolicitud,
        r.tipoDocumento,
        r.numeroDocumento,
        r.razonSocial,
        r.riesgo,
        r.tipoEvaluacion,
        r.estadoFinal,
        formatDateTimeCO(r.fechaCreacion),
        formatDateTimeCO(r.fechaCierre),
        dias != null ? dias.toFixed(2) : "",
      ];
    });
    const sheet = XLSX.utils.aoa_to_sheet([headers, ...data]);
    sheet["!cols"] = headers.map((h, i) => ({ wch: Math.max(h.length, ...data.map((r) => String(r[i] ?? "").length)) + 2 }));
    return sheet;
  };

  const crearDetalle = (tipo: TipoConteoDias) => {
    const headers = ["Tipo Solicitud", "Nro. Documento", "Razón Social", "Riesgo", "Estado Final", "Fase", "Estado Fase", "Fecha Inicio", "Fecha Fin", getDiasLabel(tipo)];
    const data: string[][] = [];
    for (const r of rows) {
      for (const f of r.fases) {
        const d = calcularDias(f.fechaInicio, f.fechaCompletado, tipo);
        data.push([
          r.tipoSolicitud,
          r.numeroDocumento,
          r.razonSocial,
          r.riesgo,
          r.estadoFinal,
          CUSTOMER_FASE_LABELS[f.fase] ?? f.fase,
          f.estado,
          formatDateTimeCO(f.fechaInicio),
          formatDateTimeCO(f.fechaCompletado),
          d != null ? d.toFixed(2) : "",
        ]);
      }
    }
    const sheet = XLSX.utils.aoa_to_sheet([headers, ...data]);
    sheet["!cols"] = headers.map((h, i) => ({ wch: Math.max(h.length, ...data.map((r) => String(r[i] ?? "").length)) + 2 }));
    return sheet;
  };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, crearResumen("calendario"), "Resumen Calendario");
  XLSX.utils.book_append_sheet(wb, crearDetalle("calendario"), "Fases Calendario");
  XLSX.utils.book_append_sheet(wb, crearResumen("laborales"), "Resumen Laborales");
  XLSX.utils.book_append_sheet(wb, crearDetalle("laborales"), "Fases Laborales");
  XLSX.writeFile(wb, `reporte-clientes-${Date.now()}.xlsx`);
}

function EstadoFinalBadge({ estado }: { estado: EstadoFinal }) {
  if (estado === "COMPLETADO") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-700">
        <CheckCircle2 className="h-3 w-3" /> Completado
      </span>
    );
  }
  if (estado === "ANULADA") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
        <Ban className="h-3 w-3" /> Anulada
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
      <XCircle className="h-3 w-3" /> Rechazado
    </span>
  );
}

/** Time-per-phase report of finished customer processes, with calendar/business-day toggle and 4-sheet Excel. */
export default function TablaReporteProcesos() {
  const { empresaActiva } = useEmpresaFilter();
  const data = useQuery(api.onboarding.customers.obtenerReporteProcesos, { empresa: empresaActiva ?? undefined }) as ReporteRow[] | undefined;

  const [estadoFiltro, setEstadoFiltro] = useState<"TODOS" | EstadoFinal>("TODOS");
  const [tipoSolicitudFiltro, setTipoSolicitudFiltro] = useState<"TODOS" | "INSCRIPCIÓN" | "ACTUALIZACIÓN">("TODOS");
  const [tipoConteoDias, setTipoConteoDias] = useState<TipoConteoDias>("calendario");
  const [search, setSearch] = useState("");
  const [expandido, setExpandido] = useState<Record<string, boolean>>({});

  const rows = useMemo(() => {
    const base = data ?? [];
    return base
      .filter((r) => (estadoFiltro === "TODOS" ? true : r.estadoFinal === estadoFiltro))
      .filter((r) => (tipoSolicitudFiltro === "TODOS" ? true : r.tipoSolicitud === tipoSolicitudFiltro))
      .filter((r) => {
        if (!search.trim()) return true;
        const q = search.trim().toLowerCase();
        return r.razonSocial.toLowerCase().includes(q) || r.numeroDocumento.toLowerCase().includes(q);
      })
      .sort((a, b) => (b.fechaCierre ?? b.fechaCreacion) - (a.fechaCierre ?? a.fechaCreacion));
  }, [data, estadoFiltro, tipoSolicitudFiltro, search]);

  const diasLabel = getDiasLabel(tipoConteoDias);

  if (data === undefined) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-slate-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cargando reporte...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input placeholder="Buscar por razón social o documento..." className="h-9 border-slate-200 bg-slate-50 pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={estadoFiltro} onValueChange={(v) => setEstadoFiltro(v as typeof estadoFiltro)}>
          <SelectTrigger className="h-9 w-full border-slate-200 bg-slate-50 sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="TODOS">Todos los estados</SelectItem>
            <SelectItem value="COMPLETADO">Completados</SelectItem>
            <SelectItem value="RECHAZADO">Rechazados</SelectItem>
            <SelectItem value="ANULADA">Anuladas</SelectItem>
          </SelectContent>
        </Select>
        <Select value={tipoSolicitudFiltro} onValueChange={(v) => setTipoSolicitudFiltro(v as typeof tipoSolicitudFiltro)}>
          <SelectTrigger className="h-9 w-full border-slate-200 bg-slate-50 sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="TODOS">Todas las solicitudes</SelectItem>
            <SelectItem value="INSCRIPCIÓN">Inscripción</SelectItem>
            <SelectItem value="ACTUALIZACIÓN">Actualización</SelectItem>
          </SelectContent>
        </Select>
        <Tabs value={tipoConteoDias} onValueChange={(v) => setTipoConteoDias(v as TipoConteoDias)} className="w-full sm:w-auto">
          <TabsList className="grid h-9 w-full grid-cols-2 bg-slate-100 p-1 sm:w-[290px]">
            <TabsTrigger value="calendario" className="text-xs">
              Días calendario
            </TabsTrigger>
            <TabsTrigger value="laborales" className="text-xs">
              Días laborales
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <Button variant="outline" size="sm" className="h-9 rounded-lg" disabled={rows.length === 0} onClick={() => exportExcel(rows)}>
          <FileSpreadsheet className="mr-2 h-4 w-4 text-green-600" />
          Exportar Excel
        </Button>
      </div>
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        <span className="font-semibold text-slate-700">Días calendario:</span> cuenta todos los días. <span className="font-semibold text-slate-700">Días laborales:</span> excluye sábados, domingos y
        festivos de Colombia.
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-16 text-center text-sm text-slate-500">No hay inscripciones finalizadas con los filtros seleccionados.</div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-3" />
                <th className="px-3 py-3">Tipo solicitud</th>
                <th className="px-3 py-3">Documento</th>
                <th className="px-3 py-3">Razón social</th>
                <th className="px-3 py-3">Riesgo</th>
                <th className="px-3 py-3">Estado final</th>
                <th className="px-3 py-3">Inicio</th>
                <th className="px-3 py-3">Cierre</th>
                <th className="px-3 py-3 text-right">{diasLabel}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => {
                const dias = calcularDias(r.fechaCreacion, r.fechaCierre, tipoConteoDias);
                const abierto = !!expandido[r.inscripcionId];
                return (
                  <Fragment key={r.inscripcionId}>
                    <tr className="cursor-pointer hover:bg-slate-50/80" onClick={() => setExpandido((p) => ({ ...p, [r.inscripcionId]: !abierto }))}>
                      <td className="px-3 py-3 text-slate-400">{abierto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</td>
                      <td className="px-3 py-3">
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-700">{r.tipoSolicitud}</span>
                      </td>
                      <td className="px-3 py-3 font-mono text-xs text-slate-800">
                        {r.tipoDocumento} {r.numeroDocumento}
                      </td>
                      <td className="px-3 py-3 font-medium text-slate-900">{r.razonSocial}</td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${(RIESGO_CONFIG[r.riesgo] ?? RIESGO_CONFIG.INDEFINIDO).badge}`}>{r.riesgo}</span>
                      </td>
                      <td className="px-3 py-3">
                        <EstadoFinalBadge estado={r.estadoFinal} />
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-600">{formatDateTimeCO(r.fechaCreacion)}</td>
                      <td className="px-3 py-3 text-xs text-slate-600">{formatDateTimeCO(r.fechaCierre)}</td>
                      <td className="px-3 py-3 text-right text-xs font-semibold text-slate-800">{formatDias(dias)}</td>
                    </tr>
                    {abierto && (
                      <tr className="bg-slate-50/60">
                        <td colSpan={9} className="px-3 py-3">
                          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                            <table className="w-full text-xs">
                              <thead className="bg-slate-100 text-left uppercase tracking-wider text-slate-500">
                                <tr>
                                  <th className="px-3 py-2">Fase</th>
                                  <th className="px-3 py-2">Estado</th>
                                  <th className="px-3 py-2">Inicio</th>
                                  <th className="px-3 py-2">Fin</th>
                                  <th className="px-3 py-2 text-right">{diasLabel}</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {[...r.fases]
                                  .sort((a, b) => CUSTOMER_FASES_ORDEN_REPORTE.indexOf(a.fase) - CUSTOMER_FASES_ORDEN_REPORTE.indexOf(b.fase))
                                  .map((f, i) => {
                                    const d = calcularDias(f.fechaInicio, f.fechaCompletado, tipoConteoDias);
                                    return (
                                      <tr key={`${r.inscripcionId}-${f.fase}-${i}`}>
                                        <td className="px-3 py-2 text-slate-800">{CUSTOMER_FASE_LABELS[f.fase] ?? f.fase}</td>
                                        <td className="px-3 py-2 text-slate-600">{f.estado}</td>
                                        <td className="px-3 py-2 text-slate-600">{formatDateTimeCO(f.fechaInicio)}</td>
                                        <td className="px-3 py-2 text-slate-600">{formatDateTimeCO(f.fechaCompletado)}</td>
                                        <td className="px-3 py-2 text-right font-semibold text-slate-800">{formatDias(d)}</td>
                                      </tr>
                                    );
                                  })}
                                {r.fases.length === 0 && (
                                  <tr>
                                    <td colSpan={5} className="px-3 py-4 text-center text-slate-400">
                                      Sin fases registradas.
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
