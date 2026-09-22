"use client";

import { useAuth } from "@workos-inc/authkit-nextjs/components";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";
import type { CurrentUser } from "@/lib/fetch-backend";
import { IMPERSONATION_CHANGED_EVENT } from "@/lib/impersonate-client";

/** Shared React Query key for the `/api/me` profile (one fetch for every consumer). */
export const CURRENT_USER_QUERY_KEY = ["me"] as const;

async function fetchCurrentUser(): Promise<CurrentUser | null> {
  const response = await fetch("/api/me", { cache: "no-store" });
  if (!response.ok) return null;
  return (await response.json()) as CurrentUser;
}

export function useCurrentUser() {
  const { user, loading } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id ?? null;

  const query = useQuery({
    queryKey: [...CURRENT_USER_QUERY_KEY, userId],
    queryFn: fetchCurrentUser,
    enabled: userId !== null,
  });

  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: CURRENT_USER_QUERY_KEY }),
    [queryClient],
  );

  // Impersonation swaps the effective user behind the same WorkOS session.
  useEffect(() => {
    const onChanged = () => {
      void refresh();
    };
    window.addEventListener(IMPERSONATION_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(IMPERSONATION_CHANGED_EVENT, onChanged);
  }, [refresh]);

  const backendUser = userId !== null ? (query.data ?? null) : null;

  const hasAccessTo = useCallback(
    (ruta?: string) => {
      if (!ruta) {
        return true;
      }
      if (!backendUser) {
        return false;
      }
      if (backendUser.hasFullAccess || backendUser.permisos.includes("*")) {
        return true;
      }
      return backendUser.permisos.includes(ruta);
    },
    [backendUser],
  );

  return {
    isAuthLoading: loading,
    isLoading: loading || (userId !== null && query.isPending),
    user,
    backendUser,
    hasAccessTo,
    refresh,
  };
}

export type CompatSessionUser = {
  id: string;
  name?: string;
  nombre: string;
  email: string;
  id_rol: number;
  id_proceso: number | null;
  id_empresa?: number;
  empresas: number[];
  acceso_todas_empresas: boolean;
  lider_proceso: boolean;
  proceso?: { id: number; nombre: string } | null;
  procesoUsuario?: { id: number; nombre: string } | null;
};

export type CompatSession = {
  user: CompatSessionUser;
};

export function toCompatSession(backendUser: CurrentUser): CompatSession {
  return {
    user: {
      id: backendUser.id,
      name: backendUser.nombre,
      nombre: backendUser.nombre,
      email: backendUser.email,
      id_rol: backendUser.rol.id,
      id_proceso: backendUser.id_proceso ?? backendUser.proceso?.id ?? null,
      empresas: backendUser.empresas ?? [],
      acceso_todas_empresas:
        backendUser.acceso_todas_empresas === true || backendUser.hasFullAccess,
      lider_proceso: backendUser.lider_proceso === true,
      proceso: backendUser.proceso ?? null,
      procesoUsuario: backendUser.proceso ?? null,
    },
  };
}

/** Legacy next-auth-like session shape used by ported billing/finance pages. */
export function useSession() {
  const { isAuthLoading, isLoading, backendUser } = useCurrentUser();
  const loading = isAuthLoading || isLoading;
  const status = loading ? "loading" : backendUser ? "authenticated" : "unauthenticated";
  return {
    data: backendUser ? toCompatSession(backendUser) : null,
    status: status as "loading" | "authenticated" | "unauthenticated",
  };
}
