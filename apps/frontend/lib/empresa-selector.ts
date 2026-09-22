import { EMPRESAS_LIST, EMPRESAS_MAP, type EmpresaInfo } from "@/lib/empresas";

export const TODAS_LAS_EMPRESAS_LABEL = "Todas las empresas";

export type OpcionSelector = {
  /** `null` = "Todas las empresas" (only offered to users with global scope). */
  id: number | null;
  nombre: string;
  info?: EmpresaInfo;
};

/** Options shown by the company switcher. */
export function buildOpcionesSelector(
  canAccessAll: boolean,
  empresasDisponibles: number[],
): OpcionSelector[] {
  if (canAccessAll) {
    return [
      { id: null, nombre: TODAS_LAS_EMPRESAS_LABEL },
      ...EMPRESAS_LIST.map((empresa) => ({ id: empresa.id, nombre: empresa.nombre, info: empresa })),
    ];
  }
  return empresasDisponibles.map((id) => {
    const info = EMPRESAS_MAP[id];
    return { id, nombre: info?.nombre ?? `Empresa ${id}`, info };
  });
}

/**
 * Companies to send as the `empresas` filter: the active one, `[]` (no filter) for a
 * global user viewing "Todas", or every company a restricted user may see.
 */
export function resolveEmpresasParaFiltro(
  empresaActiva: number | null,
  canAccessAll: boolean,
  empresasDisponibles: number[],
): number[] {
  if (empresaActiva !== null) return [empresaActiva];
  if (canAccessAll) return [];
  return empresasDisponibles;
}

export function shouldMostrarSelector(canAccessAll: boolean, empresasDisponibles: number[]): boolean {
  return canAccessAll || empresasDisponibles.length > 1;
}
