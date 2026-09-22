"use client";

import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CalendarRange,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  FileCheck2,
  FileText,
  Landmark,
  RefreshCw,
  Search,
  UsersRound,
  WalletCards,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import { faseLabels, formatterCOP } from "../../dashboard/constants";
import type { AnticipoRow } from "../../dashboard/types";
import { formatDate, getEstadoClass, normalizeFaseActual } from "../../dashboard/utils";
import { getValorContableAnticipo } from "../../lib/valor-contable-anticipo";
import type {
  AnticiposDashboardSummary,
  AnticiposFilters,
  AnticiposMetric,
  AnticiposOwnerWorkload,
} from "../types";
import { getEffectiveLegalizable, getLedgerPrimaryAmount } from "../workspace-utils";

type DashboardProps = {
  summary?: AnticiposDashboardSummary;
  workload: AnticiposOwnerWorkload[];
  rows: AnticipoRow[];
  filters: AnticiposFilters;
  onFiltersChange: (patch: Partial<AnticiposFilters>) => void;
  isLoading: boolean;
  isRefreshing: boolean;
  error?: string;
  onRefresh: () => void;
  onDetail: (row: AnticipoRow) => void;
  canGoBack: boolean;
  canGoNext: boolean;
  onPreviousPage: () => void;
  onNextPage: () => void;
};

type KpiDefinition = {
  key: string;
  label: string;
  helper: string;
  icon: typeof FileText;
  metric?: AnticiposMetric;
  previous?: AnticiposMetric;
};

function percentageChange(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : 100;
  return Math.round(((current - previous) / previous) * 100);
}

function MetricCell({
  item,
  active,
  flowMode,
  onClick,
}: {
  item: KpiDefinition;
  active: boolean;
  flowMode: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;
  const change = item.previous
    ? percentageChange(item.metric?.count ?? 0, item.previous.count)
    : null;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "min-w-[190px] flex-1 border border-transparent px-4 py-4 text-left transition-[background-color,border-color,box-shadow] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600",
        active
          ? "relative z-10 border-slate-900 bg-slate-900 text-white ring-2 ring-inset ring-emerald-400"
          : "bg-white hover:border-slate-300 hover:bg-slate-50 hover:shadow-sm"
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span className={cn("text-xs font-medium", active ? "text-slate-300" : "text-slate-500")}>
          {item.label}
        </span>
        <Icon className={cn("h-4 w-4", active ? "text-emerald-300" : "text-slate-400")} />
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tabular-nums">{item.metric?.count ?? 0}</span>
        <span className={cn("text-xs tabular-nums", active ? "text-slate-300" : "text-slate-500")}>
          {formatterCOP.format(item.metric?.amount ?? 0)}
        </span>
      </div>
      <div
        className={cn(
          "mt-2 flex items-center gap-1 text-xs",
          active ? "text-slate-300" : "text-slate-500"
        )}
      >
        {flowMode && change != null ? (
          <>
            {change > 0 ? (
              <ArrowUpRight className="h-3.5 w-3.5 text-emerald-500" />
            ) : change < 0 ? (
              <ArrowDownRight className="h-3.5 w-3.5 text-rose-500" />
            ) : null}
            <span>
              {change > 0 ? "+" : ""}
              {change}% vs. período anterior
            </span>
          </>
        ) : (
          <span>{item.helper}</span>
        )}
      </div>
    </button>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4" aria-label="Cargando dashboard">
      <div className="grid gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 md:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="h-32 animate-pulse bg-white p-4 motion-reduce:animate-none">
            <div className="h-3 w-24 rounded bg-slate-100" />
            <div className="mt-5 h-7 w-32 rounded bg-slate-100" />
          </div>
        ))}
      </div>
      <div className="h-80 animate-pulse rounded-xl bg-slate-100 motion-reduce:animate-none" />
    </div>
  );
}

function TrendPanel({ summary }: { summary?: AnticiposDashboardSummary }) {
  const trend = summary?.weeklyTrend ?? [];
  const max = Math.max(
    1,
    ...trend.flatMap((row) => [row.solicitado, row.desembolsado, row.legalizado])
  );
  return (
    <section
      className="rounded-xl border border-slate-200 bg-white px-5 py-5"
      aria-labelledby="trend-title"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 id="trend-title" className="text-sm font-semibold text-slate-950">
            Flujo semanal
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Solicitudes, desembolsos y cierres dentro del período.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-slate-600">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-slate-500" />
            Solicitudes
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-blue-600" />
            Desembolsos
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-600" />
            Legalizados
          </span>
        </div>
      </div>
      {trend.length === 0 ? (
        <div className="flex h-48 items-center justify-center text-sm text-slate-500">
          No hay movimiento suficiente para el período seleccionado.
        </div>
      ) : (
        <div className="mt-6 flex h-48 items-end gap-4 overflow-x-auto pb-1">
          {trend.map((row) => (
            <div key={row.week} className="flex min-w-20 flex-1 flex-col items-center gap-2">
              <div className="flex h-36 items-end gap-1.5">
                {[
                  { value: row.solicitado, color: "bg-slate-500" },
                  { value: row.desembolsado, color: "bg-blue-600" },
                  { value: row.legalizado, color: "bg-emerald-600" },
                ].map((bar, index) => (
                  <div
                    key={index}
                    className={cn(
                      "w-3 rounded-t-sm transition-[height] duration-200 motion-reduce:transition-none",
                      bar.color
                    )}
                    style={{
                      height: `${Math.max(bar.value > 0 ? 6 : 0, (bar.value / max) * 100)}%`,
                    }}
                    title={`${bar.value}`}
                  />
                ))}
              </div>
              <span className="text-[11px] text-slate-500">{row.week.slice(5)}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function AnticiposOperationalDashboard({
  summary,
  workload,
  rows,
  filters,
  onFiltersChange,
  isLoading,
  isRefreshing,
  error,
  onRefresh,
  onDetail,
  canGoBack,
  canGoNext,
  onPreviousPage,
  onNextPage,
}: DashboardProps) {
  const [customOpen, setCustomOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(filters.from ?? "");
  const [draftTo, setDraftTo] = useState(filters.to ?? "");

  useEffect(() => {
    if (!customOpen) return;
    setDraftFrom(filters.from ?? "");
    setDraftTo(filters.to ?? "");
  }, [customOpen, filters.from, filters.to]);

  const flowMode = filters.mode === "flow";
  const kpis: KpiDefinition[] = flowMode
    ? [
        {
          key: "solicitado",
          label: "Solicitudes",
          helper: "Creadas en el período",
          icon: FileText,
          metric: summary?.flow.solicitado,
          previous: summary?.previousFlow.solicitado,
        },
        {
          key: "aprobado_gerencia",
          label: "Aprobadas",
          helper: "Aprobación de Gerencia",
          icon: FileCheck2,
          metric: summary?.flow.aprobadoGerencia,
          previous: summary?.previousFlow.aprobadoGerencia,
        },
        {
          key: "desembolsado",
          label: "Desembolsadas",
          helper: "Registradas por Tesorería",
          icon: Landmark,
          metric: summary?.flow.desembolsado,
          previous: summary?.previousFlow.desembolsado,
        },
        {
          key: "legalizado",
          label: "Legalizadas",
          helper: "Saldo completamente cruzado",
          icon: CheckCircle2,
          metric: summary?.flow.legalizado,
          previous: summary?.previousFlow.legalizado,
        },
      ]
    : [
        {
          key: "mis_pendientes",
          label: "Mis pendientes",
          helper: "Asignadas a tu usuario",
          icon: Clock3,
          metric: summary?.backlog.misPendientes,
        },
        {
          key: "en_aprobacion",
          label: "En aprobación",
          helper: "Jefe, Contabilidad y Gerencia",
          icon: FileCheck2,
          metric: summary?.backlog.enAprobacion,
        },
        {
          key: "por_desembolsar",
          label: "Por desembolsar",
          helper: "Pendientes de Tesorería",
          icon: Landmark,
          metric: summary?.backlog.porDesembolsar,
        },
        {
          key: "por_legalizar",
          label: "Pendientes de legalización",
          helper: "Saldo abierto en Facturación",
          icon: WalletCards,
          metric: summary?.backlog.porLegalizar,
        },
        {
          key: "vencidos",
          label: "Vencidos",
          helper: "Fecha máxima superada",
          icon: AlertTriangle,
          metric: summary?.backlog.vencidos,
        },
      ];

  return (
    <div className="space-y-4">
      <section
        className="rounded-xl border border-slate-200 bg-white p-4"
        aria-labelledby="dashboard-controls-title"
      >
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
          <div className="min-w-0">
            <h2 id="dashboard-controls-title" className="text-base font-semibold text-slate-950">
              Panel operativo
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {summary?.generatedAt
                ? `Actualizado ${new Date(summary.generatedAt).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}`
                : "Esperando datos"}
            </p>
          </div>
          <div className="flex flex-1 flex-col gap-2 xl:flex-row xl:items-center xl:justify-end">
            <div
              className="inline-flex w-fit rounded-xl border border-slate-200 bg-slate-50 p-1"
              role="group"
              aria-label="Modo del dashboard"
            >
              {[
                { value: "flow", label: "Flujo del período" },
                { value: "backlog", label: "Backlog actual" },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() =>
                    onFiltersChange({ mode: option.value as "flow" | "backlog", kpi: undefined })
                  }
                  className={cn(
                    "min-h-9 rounded-lg px-3 text-xs font-medium transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
                    filters.mode === option.value
                      ? "bg-white text-slate-950 shadow-xs"
                      : "text-slate-600"
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {flowMode ? (
              <div
                className="inline-flex w-fit flex-wrap rounded-xl border border-slate-200 bg-slate-50 p-1"
                role="group"
                aria-label="Período"
              >
                {[
                  { value: "mes_actual", label: "Mes actual" },
                  { value: "mes_anterior", label: "Mes anterior" },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() =>
                      onFiltersChange({
                        preset: option.value as "mes_actual" | "mes_anterior",
                        from: undefined,
                        to: undefined,
                      })
                    }
                    className={cn(
                      "min-h-9 rounded-lg px-3 text-xs font-medium transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
                      filters.preset === option.value ? "bg-slate-900 text-white" : "text-slate-600"
                    )}
                  >
                    {option.label}
                  </button>
                ))}
                <Popover open={customOpen} onOpenChange={setCustomOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className={cn(
                        "flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-medium focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
                        filters.preset === "personalizado"
                          ? "bg-slate-900 text-white"
                          : "text-slate-600"
                      )}
                    >
                      <CalendarRange className="h-3.5 w-3.5" />
                      {filters.preset === "personalizado" && filters.from && filters.to
                        ? `${filters.from} → ${filters.to}`
                        : "Personalizado"}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-[320px]">
                    <p className="text-sm font-semibold text-slate-900">Rango personalizado</p>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <Input
                        type="date"
                        value={draftFrom}
                        onChange={(event) => setDraftFrom(event.target.value)}
                        aria-label="Fecha inicial"
                      />
                      <Input
                        type="date"
                        value={draftTo}
                        onChange={(event) => setDraftTo(event.target.value)}
                        aria-label="Fecha final"
                      />
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      className="mt-3 w-full"
                      disabled={!draftFrom || !draftTo || draftFrom > draftTo}
                      onClick={() => {
                        onFiltersChange({ preset: "personalizado", from: draftFrom, to: draftTo });
                        setCustomOpen(false);
                      }}
                    >
                      Aplicar rango
                    </Button>
                  </PopoverContent>
                </Popover>
              </div>
            ) : null}

            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-10 w-10 shrink-0"
              onClick={onRefresh}
              aria-label="Actualizar dashboard"
            >
              <RefreshCw
                className={cn("h-4 w-4", isRefreshing && "animate-spin motion-reduce:animate-none")}
              />
            </Button>
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
      ) : null}

      {isLoading ? (
        <DashboardSkeleton />
      ) : (
        <>
          <section
            className={cn(
              "grid gap-px overflow-x-auto rounded-xl border border-slate-200 bg-slate-200",
              flowMode ? "md:grid-cols-2 xl:grid-cols-4" : "md:grid-cols-2 xl:grid-cols-5"
            )}
            aria-label="Indicadores de anticipos"
          >
            {kpis.map((item) => (
              <MetricCell
                key={item.key}
                item={item}
                active={filters.kpi === item.key}
                flowMode={flowMode}
                onClick={() =>
                  onFiltersChange({
                    mode: flowMode ? "flow" : "backlog",
                    kpi: filters.kpi === item.key ? undefined : item.key,
                    phase: undefined,
                    urgency: "all",
                  })
                }
              />
            ))}
          </section>

          {summary?.alerts.length ? (
            <section
              className="flex flex-wrap gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200"
              aria-label="Alertas operativas"
            >
              {summary.alerts.map((alert) => (
                <button
                  key={alert.kind}
                  type="button"
                  onClick={() =>
                    onFiltersChange({ mode: "backlog", urgency: alert.kind, kpi: undefined })
                  }
                  className="flex min-h-12 flex-1 items-center gap-3 bg-white px-4 py-3 text-left text-sm hover:bg-amber-50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <AlertTriangle
                    className={cn(
                      "h-4 w-4 shrink-0",
                      alert.kind === "overdue" ? "text-rose-600" : "text-amber-600"
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate text-slate-700">{alert.label}</span>
                  <Badge variant="outline" className="rounded-full bg-white">
                    {alert.count}
                  </Badge>
                  <ArrowRight className="h-4 w-4 text-slate-400" />
                </button>
              ))}
            </section>
          ) : null}

          <div className="grid gap-4 xl:grid-cols-[minmax(0,.85fr)_minmax(0,1.35fr)]">
            <section
              className="overflow-hidden rounded-xl border border-slate-200 bg-white"
              aria-labelledby="workload-title"
            >
              <header className="border-b border-slate-200 px-5 py-4">
                <h3
                  id="workload-title"
                  className="flex items-center gap-2 text-sm font-semibold text-slate-950"
                >
                  <UsersRound className="h-4 w-4 text-slate-500" />
                  Carga por responsable
                </h3>
                <p className="mt-1 text-xs text-slate-500">Asignaciones activas y antigüedad.</p>
              </header>
              {workload.length === 0 ? (
                <div className="flex h-48 items-center justify-center px-5 text-center text-sm text-slate-500">
                  No hay asignaciones activas para este alcance.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {workload.slice(0, 10).map((owner) => (
                    <div
                      key={`${owner.userId ?? owner.nombre}-${owner.rol}`}
                      className="flex items-center gap-3 px-5 py-3"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-semibold text-slate-700">
                        {owner.nombre
                          .split(" ")
                          .slice(0, 2)
                          .map((part) => part[0])
                          .join("")
                          .toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-slate-900">
                          {owner.nombre}
                        </span>
                        <span className="block truncate text-xs text-slate-500">{owner.rol}</span>
                      </span>
                      <span className="text-right">
                        <span className="block text-sm font-semibold tabular-nums text-slate-900">
                          {owner.count}
                        </span>
                        <span className="block text-[11px] tabular-nums text-slate-500">
                          {formatterCOP.format(owner.amount)}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section
              className="overflow-hidden rounded-xl border border-slate-200 bg-white"
              aria-labelledby="ledger-title"
            >
              <header className="border-b border-slate-200 px-5 py-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3
                      id="ledger-title"
                      className="flex items-center gap-2 text-sm font-semibold text-slate-950"
                    >
                      <CircleDollarSign className="h-4 w-4 text-slate-500" />
                      Ledger de anticipos
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                      El indicador activo define este alcance.
                    </p>
                  </div>
                  <div className="relative w-full sm:max-w-xs">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      value={filters.search}
                      onChange={(event) => onFiltersChange({ search: event.target.value })}
                      placeholder="Buscar tercero, NIT o número"
                      className="h-9 bg-white pl-9 pr-8"
                    />
                    {filters.search ? (
                      <button
                        type="button"
                        onClick={() => onFiltersChange({ search: "" })}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400"
                        aria-label="Limpiar búsqueda"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                </div>
              </header>
              {rows.length === 0 ? (
                <div className="flex h-48 items-center justify-center px-5 text-center text-sm text-slate-500">
                  No hay anticipos para el indicador y período seleccionados.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {rows.map((row) => (
                    <button
                      key={String(row._id)}
                      type="button"
                      onClick={() => onDetail(row)}
                      className="grid w-full gap-2 border-l-2 border-l-transparent px-5 py-3 text-left transition-[background-color,border-color,box-shadow] hover:border-l-emerald-500 hover:bg-slate-50 focus-visible:border-l-emerald-600 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600 sm:grid-cols-[minmax(0,1fr)_180px_160px] sm:items-center"
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-slate-900">
                          #{row.consecutivo} · {row.razonSocial}
                        </span>
                        <span className="block truncate text-xs text-slate-500">
                          NIT {row.nit} · {formatDate(row.createdAt)}
                        </span>
                      </span>
                      <Badge
                        variant="outline"
                        className={cn(
                          "w-fit max-w-full rounded-full",
                          getEstadoClass(row.faseActual)
                        )}
                      >
                        <span className="truncate">
                          {faseLabels[normalizeFaseActual(row.faseActual)] ?? row.faseActual}
                        </span>
                      </Badge>
                      <span className="font-semibold tabular-nums text-slate-900 sm:text-right">
                        {formatterCOP.format(getLedgerPrimaryAmount(row))}
                        {row.faseActual === "V_PENDIENTE_LEGALIZACION" ? (
                          <>
                            <span className="mt-0.5 block text-[11px] font-normal text-slate-500">
                              Saldo pendiente
                            </span>
                            <span className="mt-0.5 block text-[11px] font-normal text-slate-500">
                              Legalizado {formatterCOP.format(row.saldoLegalizado ?? 0)} de{" "}
                              {formatterCOP.format(getEffectiveLegalizable(row))}
                            </span>
                          </>
                        ) : null}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <footer className="flex items-center justify-between border-t border-slate-200 px-5 py-3">
                <span className="text-xs text-slate-500">20 por página</span>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    disabled={!canGoBack}
                    onClick={onPreviousPage}
                    aria-label="Página anterior"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    disabled={!canGoNext}
                    onClick={onNextPage}
                    aria-label="Página siguiente"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </footer>
            </section>
          </div>

          {flowMode ? <TrendPanel summary={summary} /> : null}
        </>
      )}
    </div>
  );
}
