"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import {
  COOKIE_EMPRESA_ACTIVA,
  EMPRESAS_LIST,
  EMPRESAS_MAP,
  hasGlobalEmpresaAccess,
  type EmpresaInfo,
} from "@/lib/empresas";
import { useCurrentUser } from "@/hooks/useCurrentUser";

function readStoredEmpresa(): number | null {
  if (typeof window === "undefined") return null;
  const fromStorage = window.localStorage.getItem(COOKIE_EMPRESA_ACTIVA);
  const parsed = Number(fromStorage);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function persistEmpresa(id: number | null) {
  if (typeof window === "undefined") return;
  if (id === null) {
    window.localStorage.removeItem(COOKIE_EMPRESA_ACTIVA);
    document.cookie = `${COOKIE_EMPRESA_ACTIVA}=;path=/;max-age=0;SameSite=Lax`;
    return;
  }
  window.localStorage.setItem(COOKIE_EMPRESA_ACTIVA, String(id));
  const isSecure = window.location?.protocol === "https:";
  document.cookie = `${COOKIE_EMPRESA_ACTIVA}=${id};path=/;max-age=31536000;SameSite=Lax${
    isSecure ? ";Secure" : ""
  }`;
}

// Shared store so every hook instance sees the same value, and SSR/hydration
// both render `null` (localStorage is only read after hydration).
const listeners = new Set<() => void>();

function notifyEmpresaListeners() {
  for (const listener of listeners) listener();
}

function subscribeEmpresa(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === COOKIE_EMPRESA_ACTIVA) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function getServerEmpresa(): number | null {
  return null;
}

export function useEmpresaFilter() {
  const { backendUser } = useCurrentUser();
  const canAccessAllEmpresas = hasGlobalEmpresaAccess(
    backendUser?.rol.id ?? 0,
    backendUser?.hasFullAccess,
  );
  const empresasDisponibles = useMemo(
    () => EMPRESAS_LIST.map((empresa) => empresa.id),
    [],
  );
  const empresaActiva = useSyncExternalStore(
    subscribeEmpresa,
    readStoredEmpresa,
    getServerEmpresa,
  );

  const setEmpresaActiva = useCallback((id: number | null) => {
    persistEmpresa(id);
    notifyEmpresaListeners();
  }, []);

  const empresasParaFiltro = useMemo(() => {
    if (empresaActiva !== null) return [empresaActiva];
    if (canAccessAllEmpresas) return [];
    return empresasDisponibles;
  }, [canAccessAllEmpresas, empresaActiva, empresasDisponibles]);

  const mostrarSelector = canAccessAllEmpresas || empresasDisponibles.length > 1;

  const opcionesSelector: {
    id: number | null;
    nombre: string;
    info?: EmpresaInfo;
  }[] = [];

  if (canAccessAllEmpresas) {
    opcionesSelector.push({ id: null, nombre: "Todas las empresas" });
    for (const emp of EMPRESAS_LIST) {
      opcionesSelector.push({ id: emp.id, nombre: emp.nombre, info: emp });
    }
  } else {
    for (const empId of empresasDisponibles) {
      const info = EMPRESAS_MAP[empId];
      opcionesSelector.push({
        id: empId,
        nombre: info?.nombre ?? `Empresa ${empId}`,
        info,
      });
    }
  }

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
    isAdmin: Boolean(backendUser?.hasFullAccess),
  };
}
