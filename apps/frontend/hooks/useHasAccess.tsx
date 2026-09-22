"use client";

import { useCurrentUser } from "@/hooks/useCurrentUser";

export function useHasAccess(ruta?: string): boolean {
  const { hasAccessTo } = useCurrentUser();
  return hasAccessTo(ruta);
}

export function useUserPermissions() {
  const { backendUser, isLoading } = useCurrentUser();
  return {
    permisos: backendUser?.permisos ?? [],
    isLoading,
    hasFullAccess: Boolean(backendUser?.hasFullAccess || backendUser?.permisos.includes("*")),
  };
}
