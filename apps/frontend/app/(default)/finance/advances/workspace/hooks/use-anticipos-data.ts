"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type {
  AnticiposBagItemsResponse,
  AnticiposBagSort,
  AnticiposBagStatus,
  AnticiposBagSummary,
  AnticiposDashboardSummary,
  AnticiposFilters,
  AnticiposItemsResponse,
  AnticiposOwnerWorkload,
  AnticiposScope,
} from "../types";
import { BAG_PAGE_SIZE, normalizeBagWorkspaceBagId } from "../bag-workspace-utils";

function buildCommonParams(empresas: number[], filters: AnticiposFilters) {
  const params = new URLSearchParams({
    empresas: empresas.join(","),
    mode: filters.mode,
    preset: filters.preset,
  });
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.search.trim()) params.set("q", filters.search.trim());
  if (filters.phase) params.set("fase", filters.phase);
  if (filters.urgency !== "all") params.set("urgencia", filters.urgency);
  if (filters.coverage) params.set("cobertura", filters.coverage);
  if (filters.responsible) params.set("responsable", filters.responsible);
  if (filters.kpi) params.set("kpi", filters.kpi);
  return params;
}

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { cache: "no-store", signal });
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new Error(body.error ?? "No se pudieron cargar los datos.");
  return body as T;
}

export function useAnticiposItems({
  empresas,
  scope,
  filters,
  pageSize,
  cursor,
  enabled = true,
}: {
  empresas: number[];
  scope: AnticiposScope;
  filters: AnticiposFilters;
  pageSize: 20 | 50;
  cursor?: string;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: ["anticipos-workspace-items", empresas, scope, filters, pageSize, cursor],
    enabled: enabled && empresas.length > 0,
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) => {
      const params = buildCommonParams(empresas, filters);
      params.set("scope", scope);
      params.set("pageSize", String(pageSize));
      if (cursor) params.set("cursor", cursor);
      return fetchJson<AnticiposItemsResponse>(
        `/api/finance/advances/items?${params.toString()}`,
        signal
      );
    },
  });
}

export function useAnticiposDashboardSummary({
  empresas,
  filters,
  enabled,
}: {
  empresas: number[];
  filters: AnticiposFilters;
  enabled: boolean;
}) {
  return useQuery({
    queryKey: [
      "anticipos-dashboard-summary",
      empresas,
      filters.preset,
      filters.from,
      filters.to,
    ],
    enabled: enabled && empresas.length > 0,
    queryFn: ({ signal }) => {
      const params = buildCommonParams(empresas, filters);
      return fetchJson<AnticiposDashboardSummary>(
        `/api/finance/advances/dashboard/resumen?${params.toString()}`,
        signal
      );
    },
  });
}

export function useAnticiposWorkload({
  empresas,
  enabled,
}: {
  empresas: number[];
  enabled: boolean;
}) {
  return useQuery({
    queryKey: ["anticipos-dashboard-workload", empresas],
    enabled: enabled && empresas.length > 0,
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ empresas: empresas.join(",") });
      return fetchJson<AnticiposOwnerWorkload[]>(
        `/api/finance/advances/dashboard/responsables?${params.toString()}`,
        signal
      );
    },
  });
}

export function useAnticiposBags({
  empresas,
  enabled,
}: {
  empresas: number[];
  enabled: boolean;
}) {
  return useQuery({
    queryKey: ["anticipos-bags", empresas],
    enabled: enabled && empresas.length > 0,
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ empresas: empresas.join(",") });
      return fetchJson<AnticiposBagSummary[]>(
        `/api/finance/advances/bolsas?${params.toString()}`,
        signal
      );
    },
  });
}

export function useAnticiposBagItems({
  bolsaId,
  empresas,
  q,
  estado,
  orden,
  cursor,
  enabled = true,
}: {
  bolsaId: string | null;
  empresas: number[];
  q: string;
  estado: AnticiposBagStatus;
  orden: AnticiposBagSort;
  cursor?: string;
  enabled?: boolean;
}) {
  const normalizedBolsaId = normalizeBagWorkspaceBagId(bolsaId);
  return useQuery({
    queryKey: ["anticipos-bag-items", normalizedBolsaId, empresas, q, estado, orden, cursor],
    enabled: enabled && Boolean(normalizedBolsaId) && empresas.length > 0,
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) => {
      if (!normalizedBolsaId) {
        throw new Error("No hay bolsa seleccionada.");
      }
      const params = new URLSearchParams({
        empresas: empresas.join(","),
        estado,
        orden,
        pageSize: String(BAG_PAGE_SIZE),
      });
      if (q.trim()) params.set("q", q.trim());
      if (cursor) params.set("cursor", cursor);
      return fetchJson<AnticiposBagItemsResponse>(
        `/api/finance/advances/bolsas/${normalizedBolsaId}/items?${params.toString()}`,
        signal
      );
    },
  });
}
