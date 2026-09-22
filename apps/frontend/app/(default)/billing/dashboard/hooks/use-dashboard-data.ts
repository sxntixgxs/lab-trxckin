"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { EMPRESAS_LIST } from "@/lib/empresas";
import { useEmpresaFilter } from "@/hooks/useEmpresaFilter";
import { getFacturacionErrorMessage } from "../../lib/user-facing-error";
import {
  DATE_PRESET_LABELS,
  DEFAULT_FILTERS,
  GRUPO_FASE_LABELS,
  RESPONSABLE_PANEL_TO_GRUPO_FASE,
  SLA_ESTADO_LABELS,
  type DashboardDistribucion,
  type DashboardFilters,
  type DashboardResumen,
  type FilterChip,
  type ResponsablePanelGroup,
  type ResponsablesResponse,
} from "../types";

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal, cache: "no-store" });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(
      (body && typeof body === "object" && "error" in body
        ? String((body as { error?: string }).error)
        : null) ?? `Error ${response.status}`
    );
  }
  return response.json() as Promise<T>;
}

function buildEmpresasParam(ids: number[]) {
  return ids.join(",");
}

function buildFilterChips(filters: DashboardFilters): FilterChip[] {
  const chips: FilterChip[] = [];

  if (filters.grupoFase) {
    chips.push({
      id: `grupo:${filters.grupoFase}`,
      kind: "grupoFase",
      label: GRUPO_FASE_LABELS[filters.grupoFase] ?? filters.grupoFase,
    });
  }

  if (filters.slaEstado) {
    chips.push({
      id: `sla:${filters.slaEstado}`,
      kind: "slaEstado",
      label: SLA_ESTADO_LABELS[filters.slaEstado] ?? filters.slaEstado,
    });
  }

  if (filters.preset === "personalizado" && filters.from && filters.to) {
    chips.push({
      id: "dateRange",
      kind: "dateRange",
      label: `${filters.from} → ${filters.to}`,
    });
  } else if (filters.preset === "todas") {
    chips.push({
      id: "dateRange",
      kind: "dateRange",
      label: DATE_PRESET_LABELS.todas,
    });
  }

  return chips;
}

export function useDashboardData() {
  const { empresaActiva, empresasDisponibles, canAccessAllEmpresas } = useEmpresaFilter();

  const empresaIds = useMemo(() => {
    if (typeof empresaActiva === "number") return [empresaActiva];
    if (empresasDisponibles.length > 0) return empresasDisponibles;
    if (canAccessAllEmpresas) return EMPRESAS_LIST.map((e) => e.id);
    return [];
  }, [empresaActiva, empresasDisponibles, canAccessAllEmpresas]);

  const empresasParam = useMemo(() => buildEmpresasParam(empresaIds), [empresaIds]);

  const [filters, setFiltersState] = useState<DashboardFilters>(DEFAULT_FILTERS);
  /** Local-only search over the active responsables group (does not hit APIs). */
  const [responsableSearch, setResponsableSearch] = useState("");
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number | null>(null);

  const [resumen, setResumen] = useState<DashboardResumen | undefined>(undefined);
  const [resumenLoading, setResumenLoading] = useState(false);
  const [resumenError, setResumenError] = useState<string | null>(null);

  const [responsablesData, setResponsablesData] = useState<ResponsablesResponse | undefined>(
    undefined
  );
  const [responsablesLoading, setResponsablesLoading] = useState(false);
  const [responsablesError, setResponsablesError] = useState<string | null>(null);

  const [distribucion, setDistribucion] = useState<DashboardDistribucion | undefined>(undefined);
  const [distribucionLoading, setDistribucionLoading] = useState(false);
  const [distribucionError, setDistribucionError] = useState<string | null>(null);

  const activeFilterChips = useMemo(() => buildFilterChips(filters), [filters]);

  const setFilters = useCallback((patch: Partial<DashboardFilters>) => {
    setFiltersState((prev) => ({ ...prev, ...patch }));
  }, []);

  const setPreset = useCallback(
    (preset: DashboardFilters["preset"]) =>
      setFilters({
        preset,
        ...(preset === "personalizado" ? {} : { from: undefined, to: undefined }),
      }),
    [setFilters]
  );

  const setCustomRange = useCallback(
    (from: string, to: string) => setFilters({ preset: "personalizado", from, to }),
    [setFilters]
  );

  const applyKpiFilter = useCallback((kind: "lideres" | "fases_contables" | "tesoreria" | "sla_vencido") => {
    if (kind === "sla_vencido") {
      setFiltersState((prev) => {
        const isActive = prev.slaEstado === "breached";
        return {
          ...prev,
          slaEstado: isActive ? undefined : "breached",
          grupoFase: isActive ? prev.grupoFase : undefined,
          activeResponsableGroup: isActive ? prev.activeResponsableGroup : undefined,
          ignoreDateRange: false,
        };
      });
      return;
    }

    const panelGroup = kind as ResponsablePanelGroup;
    setFiltersState((prev) => {
      const isActive = prev.grupoFase === kind;
      return {
        ...prev,
        grupoFase: isActive ? undefined : kind,
        slaEstado: isActive ? prev.slaEstado : undefined,
        activeResponsableGroup: isActive ? undefined : panelGroup,
        ignoreDateRange: false,
      };
    });
  }, []);

  const setActiveResponsableGroup = useCallback(
    (group: ResponsablePanelGroup) => {
      setFilters({
        activeResponsableGroup: group,
        grupoFase: RESPONSABLE_PANEL_TO_GRUPO_FASE[group],
        slaEstado: undefined,
      });
    },
    [setFilters]
  );

  const removeFilterChip = useCallback(
    (chip: FilterChip) => {
      if (chip.kind === "grupoFase") {
        setFilters({ grupoFase: undefined, activeResponsableGroup: undefined });
        return;
      }
      if (chip.kind === "slaEstado") {
        setFilters({ slaEstado: undefined });
        return;
      }
      if (chip.kind === "dateRange") {
        setFilters({ preset: "mes_actual", from: undefined, to: undefined });
      }
    },
    [setFilters]
  );

  const resetFilters = useCallback(() => {
    setFiltersState(DEFAULT_FILTERS);
    setResponsableSearch("");
  }, []);

  const refresh = useCallback(() => {
    setRefreshNonce((n) => n + 1);
  }, []);

  // Resumen
  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshNonce forces a manual refetch.
  useEffect(() => {
    if (empresaIds.length === 0) {
      setResumen(undefined);
      return;
    }
    const controller = new AbortController();
    setResumenLoading(true);
    setResumenError(null);
    const params = new URLSearchParams({ empresas: empresasParam });
    params.set("preset", filters.preset);
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);

    fetchJson<DashboardResumen>(
      `/api/billing/dashboard/resumen?${params.toString()}`,
      controller.signal
    )
      .then((data) => {
        setResumen(data);
        setLastRefreshedAt(Date.now());
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setResumenError(
          getFacturacionErrorMessage(error, "No se pudo cargar el resumen.")
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setResumenLoading(false);
      });

    return () => controller.abort();
  }, [empresasParam, empresaIds.length, filters.preset, filters.from, filters.to, refreshNonce]);

  // Responsables panel
  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshNonce forces a manual refetch.
  useEffect(() => {
    if (empresaIds.length === 0) {
      setResponsablesData(undefined);
      return;
    }
    const controller = new AbortController();
    setResponsablesLoading(true);
    setResponsablesError(null);
    const params = new URLSearchParams({ empresas: empresasParam });
    params.set("preset", filters.preset);
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);

    fetchJson<ResponsablesResponse>(
      `/api/billing/dashboard/responsables?${params.toString()}`,
      controller.signal
    )
      .then((data) => setResponsablesData(data))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setResponsablesError(
          getFacturacionErrorMessage(error, "No se pudo cargar responsables.")
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setResponsablesLoading(false);
      });

    return () => controller.abort();
  }, [empresasParam, empresaIds.length, filters.preset, filters.from, filters.to, refreshNonce]);

  // Distribución (filter-aware charts: period, group, SLA)
  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshNonce forces a manual refetch.
  useEffect(() => {
    if (empresaIds.length === 0) {
      setDistribucion(undefined);
      return;
    }
    const controller = new AbortController();
    setDistribucionLoading(true);
    setDistribucionError(null);
    const params = new URLSearchParams({ empresas: empresasParam });
    params.set("preset", filters.preset);
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
    if (filters.grupoFase) params.set("grupoFase", filters.grupoFase);
    if (filters.fase) params.set("fase", filters.fase);
    if (filters.slaEstado) params.set("slaEstado", filters.slaEstado);
    if (filters.tipoFlujo) params.set("tipoFlujo", filters.tipoFlujo);
    if (filters.moneda) params.set("moneda", filters.moneda);
    if (filters.ignoreDateRange) params.set("ignoreDateRange", "true");

    fetchJson<DashboardDistribucion>(
      `/api/billing/dashboard/distribucion?${params.toString()}`,
      controller.signal
    )
      .then((data) => setDistribucion(data))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setDistribucionError(
          getFacturacionErrorMessage(error, "No se pudo cargar la distribución.")
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setDistribucionLoading(false);
      });

    return () => controller.abort();
  }, [
    empresasParam,
    empresaIds.length,
    filters.preset,
    filters.from,
    filters.to,
    filters.grupoFase,
    filters.fase,
    filters.slaEstado,
    filters.tipoFlujo,
    filters.moneda,
    filters.ignoreDateRange,
    refreshNonce,
  ]);

  return {
    empresaIds,
    empresasParam,
    hasEmpresaSelection: empresaIds.length > 0,

    filters,
    responsableSearch,
    setResponsableSearch,
    setFilters,
    setPreset,
    setCustomRange,
    resetFilters,
    setActiveResponsableGroup,
    applyKpiFilter,
    activeFilterChips,
    removeFilterChip,

    resumen,
    resumenLoading,
    resumenError,

    responsablesData,
    responsablesLoading,
    responsablesError,

    distribucion,
    distribucionLoading,
    distribucionError,

    refresh,
    lastRefreshedAt,
    isRefreshing: resumenLoading || responsablesLoading || distribucionLoading,
  };
}

export type UseDashboardDataReturn = ReturnType<typeof useDashboardData>;
