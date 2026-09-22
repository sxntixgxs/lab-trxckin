"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo } from "react";
import { CURRENT_USER_QUERY_KEY, useCurrentUser } from "@/hooks/useCurrentUser";
import {
  buildOpcionesSelector,
  resolveEmpresasParaFiltro,
  shouldMostrarSelector,
} from "@/lib/empresa-selector";
import { EMPRESAS_MAP, resolveEmpresaAccess } from "@/lib/empresas";
import { useEmpresaStore } from "@/store/empresa-store";

// Shared by every hook instance (sidebar, pages, dashboard hook): the first value observed
// after the store is initialized becomes the baseline, so only a real switch triggers the
// refresh, exactly once, instead of every instance firing on mount.
let lastHandledEmpresa: number | null | undefined;

/**
 * Active-company filter (port of dev-pc `hooks/useEmpresaFilter.ts`). The allowed set comes
 * from `/api/me`; the selection lives in `useEmpresaStore` (localStorage + cookie).
 */
export function useEmpresaFilter() {
  const { backendUser } = useCurrentUser();
  const router = useRouter();
  const queryClient = useQueryClient();
  const {
    empresaActiva,
    empresasDisponibles,
    isAdmin,
    canAccessAllEmpresas,
    _initialized,
    setEmpresaActiva: storeSetEmpresaActiva,
    initialize,
  } = useEmpresaStore();

  // `backendUser` keeps its reference while the profile is unchanged (React Query structural
  // sharing) and changes when impersonation swaps the effective user, which re-runs initialize.
  const access = useMemo(() => resolveEmpresaAccess(backendUser), [backendUser]);

  useEffect(() => {
    if (!backendUser) return;
    initialize({
      empresas: access.empresas,
      canAccessAllEmpresas: access.canAccessAllEmpresas,
      isAdmin: access.isAdmin,
    });
  }, [backendUser, access, initialize]);

  useEffect(() => {
    if (!_initialized) return;
    if (lastHandledEmpresa === undefined) {
      lastHandledEmpresa = empresaActiva;
      return;
    }
    if (lastHandledEmpresa === empresaActiva) return;
    lastHandledEmpresa = empresaActiva;
    // BFF (REST) caches refetch with the new scope. Convex subscriptions re-run on their own
    // because the company is a query arg. The profile query is excluded: the user's companies
    // do not change because they picked one.
    void queryClient.invalidateQueries({
      predicate: (query) => query.queryKey[0] !== CURRENT_USER_QUERY_KEY[0],
    });
    router.refresh();
  }, [empresaActiva, _initialized, router, queryClient]);

  const setEmpresaActiva = useCallback(
    (id: number | null) => {
      storeSetEmpresaActiva(id);
    },
    [storeSetEmpresaActiva],
  );

  const empresasParaFiltro = useMemo(
    () => resolveEmpresasParaFiltro(empresaActiva, canAccessAllEmpresas, empresasDisponibles),
    [empresaActiva, canAccessAllEmpresas, empresasDisponibles],
  );

  const opcionesSelector = useMemo(
    () => buildOpcionesSelector(canAccessAllEmpresas, empresasDisponibles),
    [canAccessAllEmpresas, empresasDisponibles],
  );

  const mostrarSelector = shouldMostrarSelector(canAccessAllEmpresas, empresasDisponibles);

  const empresaActivaInfo =
    empresaActiva !== null ? EMPRESAS_MAP[empresaActiva] : undefined;

  return {
    empresaActiva,
    setEmpresaActiva,
    empresasDisponibles,
    empresasParaFiltro,
    canAccessAllEmpresas,
    mostrarSelector,
    opcionesSelector,
    empresaActivaInfo,
    isAdmin,
    initialized: _initialized,
  };
}
