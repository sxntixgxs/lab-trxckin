"use client";

import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileSearch,
  FileText,
  Loader2,
  Search,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

import { faseLabels, fasesFlujoAnticipo, formatterCOP } from "../../dashboard/constants";
import type { AnticipoRow } from "../../dashboard/types";
import { formatDate, getEstadoClass, normalizeFaseActual } from "../../dashboard/utils";
import { getValorContableAnticipo } from "../../lib/valor-contable-anticipo";
import type { AnticiposFilters } from "../types";

export function MyAnticiposView({
  rows,
  filters,
  onFiltersChange,
  isLoading,
  error,
  onDetail,
  canGoBack,
  canGoNext,
  onPreviousPage,
  onNextPage,
}: {
  rows: AnticipoRow[];
  filters: AnticiposFilters;
  onFiltersChange: (patch: Partial<AnticiposFilters>) => void;
  isLoading: boolean;
  error?: string;
  onDetail: (row: AnticipoRow) => void;
  canGoBack: boolean;
  canGoNext: boolean;
  onPreviousPage: () => void;
  onNextPage: () => void;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white" aria-labelledby="my-anticipos-title">
      <header className="border-b border-slate-200 px-5 py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 id="my-anticipos-title" className="flex items-center gap-2 text-base font-semibold text-slate-950">
              <FileText className="h-5 w-5 text-emerald-600" />
              Mis solicitudes
            </h2>
            <p className="mt-1 text-sm text-slate-600">Consulta el avance, saldo y legalizaciones de tus anticipos.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative min-w-[260px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={filters.search}
                onChange={(event) => onFiltersChange({ search: event.target.value })}
                placeholder="Buscar consecutivo, tercero o NIT"
                className="h-10 bg-white pl-9 pr-9"
              />
              {filters.search ? (
                <button type="button" onClick={() => onFiltersChange({ search: "" })} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" aria-label="Limpiar búsqueda">
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>
            <Select value={filters.phase ?? "all"} onValueChange={(value) => onFiltersChange({ phase: value === "all" ? undefined : value })}>
              <SelectTrigger className="h-10 w-full bg-white sm:w-[220px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las fases</SelectItem>
                {fasesFlujoAnticipo.map((phase) => (
                  <SelectItem key={phase.faseKey} value={phase.faseKey}>{phase.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </header>

      {error ? (
        <div className="flex min-h-56 flex-col items-center justify-center gap-2 px-6 text-center text-sm text-rose-800">
          <AlertTriangle className="h-7 w-7" />
          {error}
        </div>
      ) : isLoading ? (
        <div className="flex min-h-64 items-center justify-center text-sm text-slate-600">
          <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" />
          Cargando tus solicitudes…
        </div>
      ) : rows.length === 0 ? (
        <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
            <FileSearch className="h-6 w-6" />
          </span>
          <p className="mt-4 text-sm font-semibold text-slate-900">No hay solicitudes para estos filtros</p>
          <p className="mt-1 text-sm text-slate-600">Cambia la búsqueda o crea una nueva solicitud.</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-200">
          {rows.map((row) => {
            const accounting = getValorContableAnticipo(row);
            const legalized = row.saldoLegalizado ?? 0;
            const progress = accounting > 0 ? Math.min(100, (legalized / accounting) * 100) : 0;
            const completed = ["COMPLETADO", "VI_LEGALIZADO"].includes(row.faseActual);
            return (
              <button
                key={String(row._id)}
                type="button"
                onClick={() => onDetail(row)}
                className="grid w-full gap-4 px-5 py-4 text-left transition-colors hover:bg-slate-50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring lg:grid-cols-[minmax(220px,1fr)_minmax(180px,.8fr)_minmax(210px,.9fr)_auto] lg:items-center"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-slate-950">Anticipo #{row.consecutivo}</span>
                  <span className="mt-0.5 block truncate text-sm text-slate-600">{row.razonSocial}</span>
                  <span className="block text-xs text-slate-500">Solicitado {formatDate(row.createdAt)}</span>
                </span>
                <span>
                  <Badge variant="outline" className={cn("max-w-full rounded-full", getEstadoClass(row.faseActual))}>
                    {completed ? <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> : <Clock3 className="mr-1 h-3.5 w-3.5" />}
                    <span className="truncate">{faseLabels[normalizeFaseActual(row.faseActual)] ?? row.faseActual}</span>
                  </Badge>
                  <span className="mt-2 block text-xs text-slate-500">Fecha máxima {formatDate(row.maxLegalizacionDate)}</span>
                </span>
                <span>
                  <span className="flex items-center justify-between gap-3 text-xs text-slate-500">
                    <span>Legalizado</span>
                    <span className="tabular-nums">{formatterCOP.format(legalized)} / {formatterCOP.format(accounting)}</span>
                  </span>
                  <span className="mt-2 block h-2 overflow-hidden rounded-full bg-slate-100">
                    <span className="block h-full rounded-full bg-emerald-600" style={{ width: `${progress}%` }} />
                  </span>
                </span>
                <span className="flex items-center justify-end gap-2 text-sm font-medium text-emerald-700">
                  Ver detalle
                  <ChevronRight className="h-4 w-4" />
                </span>
              </button>
            );
          })}
        </div>
      )}

      <footer className="flex items-center justify-between border-t border-slate-200 px-5 py-3">
        <span className="text-xs text-slate-500">20 solicitudes por página</span>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="icon" className="h-9 w-9" disabled={!canGoBack} onClick={onPreviousPage} aria-label="Página anterior"><ChevronLeft className="h-4 w-4" /></Button>
          <Button type="button" variant="outline" size="icon" className="h-9 w-9" disabled={!canGoNext} onClick={onNextPage} aria-label="Página siguiente"><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </footer>
    </section>
  );
}
