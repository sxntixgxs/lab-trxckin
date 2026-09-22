import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { resolveEmpresasParaFiltro } from "@/lib/empresa-selector";
import { COOKIE_EMPRESA_ACTIVA, EMPRESAS_LIST, normalizeEmpresaIds } from "@/lib/empresas";

function setCookie(value: string) {
  if (typeof document === "undefined") return;
  const isSecure = typeof window !== "undefined" && window.location?.protocol === "https:";
  const secure = isSecure ? ";Secure" : "";
  document.cookie = `${COOKIE_EMPRESA_ACTIVA}=${value};path=/;max-age=31536000;SameSite=Lax${secure}`;
}

export type EmpresaInitializeInput = {
  empresas: number[];
  canAccessAllEmpresas: boolean;
  isAdmin: boolean;
};

interface EmpresaState {
  /** `null` = "Todas las empresas". */
  empresaActiva: number | null;
  empresasDisponibles: number[];
  isAdmin: boolean;
  canAccessAllEmpresas: boolean;
  _initialized: boolean;

  setEmpresaActiva: (id: number | null) => void;
  initialize: (input: EmpresaInitializeInput) => void;
  getEmpresasParaFiltro: () => number[];
}

/**
 * Active-company store (port of dev-pc `store/empresa-store.ts`). Only `empresaActiva` is
 * persisted (localStorage) and mirrored to the `empresa-activa` cookie; the allowed set is
 * re-derived from the current user on every `initialize`, which also validates the
 * persisted selection.
 */
export const useEmpresaStore = create<EmpresaState>()(
  persist(
    (set, get) => ({
      empresaActiva: null,
      empresasDisponibles: [],
      isAdmin: false,
      canAccessAllEmpresas: false,
      _initialized: false,

      setEmpresaActiva: (id) => {
        const { canAccessAllEmpresas, empresasDisponibles } = get();
        if (id === null && !canAccessAllEmpresas) return;
        if (id !== null && !canAccessAllEmpresas && !empresasDisponibles.includes(id)) {
          return;
        }
        set({ empresaActiva: id });
        setCookie(id !== null ? String(id) : "");
      },

      initialize: ({ empresas, canAccessAllEmpresas: canAccessAll, isAdmin }) => {
        const empresasConAcceso = canAccessAll
          ? EMPRESAS_LIST.map((empresa) => empresa.id)
          : normalizeEmpresaIds(empresas);
        const current = get();

        if (
          current._initialized &&
          current.isAdmin === isAdmin &&
          current.canAccessAllEmpresas === canAccessAll
        ) {
          const same =
            current.empresasDisponibles.length === empresasConAcceso.length &&
            current.empresasDisponibles.every((e, i) => e === empresasConAcceso[i]);
          if (same) return;
        }

        const updates: Partial<EmpresaState> = {
          empresasDisponibles: empresasConAcceso,
          isAdmin,
          canAccessAllEmpresas: canAccessAll,
          _initialized: true,
        };

        if (!canAccessAll) {
          const activa = current.empresaActiva;
          if (activa === null || !empresasConAcceso.includes(activa)) {
            updates.empresaActiva = empresasConAcceso.length === 1 ? empresasConAcceso[0] : null;
          }
        } else if (
          current.empresaActiva !== null &&
          !empresasConAcceso.includes(current.empresaActiva)
        ) {
          updates.empresaActiva = null;
        }

        set(updates);
        const final = get();
        setCookie(final.empresaActiva !== null ? String(final.empresaActiva) : "");
      },

      getEmpresasParaFiltro: () => {
        const { empresaActiva, empresasDisponibles, canAccessAllEmpresas } = get();
        return resolveEmpresasParaFiltro(empresaActiva, canAccessAllEmpresas, empresasDisponibles);
      },
    }),
    {
      name: "empresa-activa",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ empresaActiva: state.empresaActiva }),
    },
  ),
);
