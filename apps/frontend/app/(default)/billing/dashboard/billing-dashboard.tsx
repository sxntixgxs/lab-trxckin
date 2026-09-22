"use client";

import { useMemo } from "react";
import { useEmpresaFilter } from "@/hooks/useEmpresaFilter";
import { useDashboardData } from "./hooks/use-dashboard-data";
import { CommandHeader } from "./components/command-header";
import { KpiStrip } from "./components/kpi-strip";
import { AttentionStrip } from "./components/attention-strip";
import { ResponsablesPanel } from "./components/responsables-panel";
import { AnalyticsPanel } from "./components/analytics-panel";
import { ActiveFiltersBar } from "./components/active-filters-bar";
import type { ResponsablePanelGroup } from "./types";

export function BillingDashboard() {
  const { empresaActivaInfo, mostrarSelector, opcionesSelector, empresaActiva, setEmpresaActiva } =
    useEmpresaFilter();
  const dashboard = useDashboardData();

  const activeKpi = useMemo(() => {
    if (dashboard.filters.slaEstado === "breached") {
      return "sla_vencido" as const;
    }
    if (dashboard.filters.grupoFase === "lideres") return "lideres" as const;
    if (dashboard.filters.grupoFase === "fases_contables") return "fases_contables" as const;
    if (dashboard.filters.grupoFase === "tesoreria") return "tesoreria" as const;
    return null;
  }, [dashboard.filters]);

  const activeResponsableGroup: ResponsablePanelGroup =
    dashboard.filters.activeResponsableGroup ??
    (dashboard.filters.grupoFase === "fases_contables"
      ? "fases_contables"
      : dashboard.filters.grupoFase === "tesoreria"
        ? "tesoreria"
        : dashboard.filters.grupoFase === "recepcion"
          ? "recepcion"
          : dashboard.filters.grupoFase === "gerencia"
            ? "gerencia"
            : "lideres");

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-5 pb-12 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-4">
        {mostrarSelector && opcionesSelector.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {opcionesSelector.map((opcion) => (
              <button
                key={opcion.id ?? "todas"}
                type="button"
                onClick={() => setEmpresaActiva(opcion.id)}
                className={`inline-flex min-h-[36px] items-center rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring ${
                  empresaActiva === opcion.id
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                }`}
              >
                {opcion.nombre}
              </button>
            ))}
          </div>
        ) : null}

        <CommandHeader
          empresaNombre={empresaActivaInfo?.nombre}
          preset={dashboard.filters.preset}
          from={dashboard.filters.from}
          to={dashboard.filters.to}
          search={dashboard.responsableSearch}
          lastRefreshedAt={dashboard.resumen?.generatedAt ?? dashboard.lastRefreshedAt}
          isRefreshing={dashboard.isRefreshing}
          onPresetChange={dashboard.setPreset}
          onCustomRange={dashboard.setCustomRange}
          onSearchChange={dashboard.setResponsableSearch}
          onRefresh={dashboard.refresh}
        />

        {!dashboard.hasEmpresaSelection ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Selecciona una empresa para ver el panel operativo.
          </div>
        ) : null}

        {dashboard.resumenError ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            {dashboard.resumenError}
          </div>
        ) : null}

        <KpiStrip
          kpis={dashboard.resumen?.kpis}
          activeKpi={activeKpi}
          onSelect={(kind) => dashboard.applyKpiFilter(kind)}
        />

        <AttentionStrip alerts={dashboard.resumen?.alerts} />

        <ActiveFiltersBar
          chips={dashboard.activeFilterChips}
          onRemoveChip={dashboard.removeFilterChip}
          onClearAll={dashboard.resetFilters}
        />

        <ResponsablesPanel
          data={dashboard.responsablesData}
          isLoading={dashboard.responsablesLoading}
          error={dashboard.responsablesError}
          activeGroup={activeResponsableGroup}
          search={dashboard.responsableSearch}
          empresasParam={dashboard.empresasParam}
          preset={dashboard.filters.preset}
          from={dashboard.filters.from}
          to={dashboard.filters.to}
          onGroupChange={dashboard.setActiveResponsableGroup}
        />

        <AnalyticsPanel
          distribucion={dashboard.distribucion}
          distribucionLoading={dashboard.distribucionLoading}
          distribucionError={dashboard.distribucionError}
          weeklyTrend={dashboard.resumen?.weeklyTrend}
        />
      </div>
    </div>
  );
}
