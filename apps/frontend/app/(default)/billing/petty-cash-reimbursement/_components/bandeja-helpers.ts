import type { SolicitudBandejaRow } from "./types";

export type BandejaView = "solicitudes" | "facturas";

export type SolicitudesAlcance = "todas" | "accion" | "seguimiento";

export const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;
export type BandejaPageSize = (typeof PAGE_SIZE_OPTIONS)[number];
export const BANDEJA_LIST_LOAD_SIZE = 200;

export type CajaResumen = {
  cajaMenorId: string;
  empresaId: number;
  nombre: string;
  estado: "activa" | "cerrada" | "anulado";
  saldoDisponible: number;
  isCustodio: boolean;
  canGenerate: boolean;
  visibilityMode: "full" | "participant_only";
  facturasPendientesCount: number;
  facturasPendientesValor: number;
  solicitudesActivasCount: number;
  solicitudesActivasValor: number;
  accionesAsignadasCount: number;
};

export const FASE_OPCIONES = [
  { value: "pendiente_aprobacion_lider", label: "Aprobación líder" },
  { value: "pendiente_revision", label: "Revisión" },
  { value: "pendiente_revision_impuestos", label: "Contabilidad" },
  { value: "pendiente_eventos_dian", label: "Eventos DIAN" },
  { value: "pendiente_aprobacion", label: "Gerencia" },
  { value: "pendiente_pago_tesoreria", label: "Tesorería" },
] as const;

export function resolveInitialView(input: {
  accionesAsignadas: number;
  facturasPendientes: number;
  solicitudesActivas: number;
  canGenerate: boolean;
}): { view: BandejaView; alcance: SolicitudesAlcance } {
  if (input.accionesAsignadas > 0) {
    return { view: "solicitudes", alcance: "accion" };
  }
  if (input.canGenerate && input.facturasPendientes > 0) {
    return { view: "facturas", alcance: "todas" };
  }
  return { view: "solicitudes", alcance: "todas" };
}

export function sortCajasForFacturas(cajas: CajaResumen[]) {
  return [...cajas]
    .filter((caja) => caja.canGenerate)
    .sort((a, b) => {
      const aHasPending = a.facturasPendientesCount > 0 ? 0 : 1;
      const bHasPending = b.facturasPendientesCount > 0 ? 0 : 1;
      if (aHasPending !== bHasPending) return aHasPending - bHasPending;
      if (a.empresaId !== b.empresaId) return a.empresaId - b.empresaId;
      return a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" });
    });
}

export function pickInitialExpandedCaja(view: BandejaView, cajas: CajaResumen[]) {
  if (view === "facturas") {
    const sorted = sortCajasForFacturas(cajas);
    const withPending = sorted.find((caja) => caja.facturasPendientesCount > 0);
    return (withPending ?? sorted[0])?.cajaMenorId ?? null;
  }
  return null;
}

const BOGOTA_OFFSET_MS = -5 * 60 * 60 * 1000;

function bogotaDateParts(date: Date) {
  const shifted = new Date(date.getTime() + BOGOTA_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
  };
}

export function bogotaDayStartMs(isoDate: string) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return Date.UTC(year, month - 1, day, 5, 0, 0, 0);
}

export function bogotaDayEndMs(isoDate: string) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return Date.UTC(year, month - 1, day + 1, 4, 59, 59, 999);
}

export function isoDateInBogota(timestampMs: number) {
  const { year, month, day } = bogotaDateParts(new Date(timestampMs));
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function normalizeBandejaSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function dedupeSolicitudes(rows: SolicitudBandejaRow[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = String(row.reembolsoId);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function filterSolicitudesLoaded(
  rows: SolicitudBandejaRow[],
  input: {
    alcance: SolicitudesAlcance;
    fases: string[];
    cajaFiltro: string;
    actualizadoDesde: string;
    actualizadoHasta: string;
    busqueda: string;
    sortDirection: "asc" | "desc";
  },
) {
  let items = [...rows];

  if (input.alcance === "accion") {
    items = items.filter((row) => row.puedeActuar);
  } else if (input.alcance === "seguimiento") {
    items = items.filter((row) => !row.puedeActuar);
  }

  if (input.fases.length > 0) {
    items = items.filter((row) => input.fases.includes(row.estado));
  }

  if (input.cajaFiltro !== "all") {
    items = items.filter((row) => String(row.cajaMenorId) === input.cajaFiltro);
  }

  if (input.actualizadoDesde) {
    const desde = bogotaDayStartMs(input.actualizadoDesde);
    items = items.filter((row) => row.actualizadoEn >= desde);
  }

  if (input.actualizadoHasta) {
    const hasta = bogotaDayEndMs(input.actualizadoHasta);
    items = items.filter((row) => row.actualizadoEn <= hasta);
  }

  if (input.busqueda.trim()) {
    const query = normalizeBandejaSearch(input.busqueda);
    items = items.filter((row) => normalizeBandejaSearch(row.busquedaTexto).includes(query));
  }

  const direction = input.sortDirection === "asc" ? 1 : -1;
  items.sort((a, b) => (a.actualizadoEn - b.actualizadoEn) * direction);
  return items;
}

export function paginateLoadedRows<T>(rows: T[], currentPage: number, rowsPerPage: number) {
  const totalPages = Math.max(1, Math.ceil(rows.length / rowsPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * rowsPerPage;
  return {
    totalPages,
    safeCurrentPage,
    visibleRows: rows.slice(startIndex, startIndex + rowsPerPage),
    pageStart: rows.length === 0 ? 0 : startIndex + 1,
    pageEnd: Math.min(safeCurrentPage * rowsPerPage, rows.length),
  };
}

export function getPaginationItems(currentPage: number, totalPages: number) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set<number>([1, totalPages]);
  for (let page = currentPage - 1; page <= currentPage + 1; page += 1) {
    if (page > 1 && page < totalPages) pages.add(page);
  }
  if (currentPage <= 3) {
    pages.add(2);
    pages.add(3);
    pages.add(4);
  }
  if (currentPage >= totalPages - 2) {
    pages.add(totalPages - 1);
    pages.add(totalPages - 2);
    pages.add(totalPages - 3);
  }

  const sortedPages = Array.from(pages)
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((a, b) => a - b);

  return sortedPages.reduce<Array<number | string>>((items, page, index) => {
    const previousPage = sortedPages[index - 1];
    if (previousPage && page - previousPage > 1) {
      items.push(`ellipsis-${previousPage}-${page}`);
    }
    items.push(page);
    return items;
  }, []);
}

export function selectVisibleIds(current: string[], visibleIds: string[]) {
  const merged = new Set(current);
  for (const id of visibleIds) merged.add(id);
  return [...merged];
}

export function mergePageSelections(
  selectedByCaja: Record<string, string[]>,
  cajaId: string,
  pageIds: string[],
) {
  return {
    ...selectedByCaja,
    [cajaId]: selectVisibleIds(selectedByCaja[cajaId] ?? [], pageIds),
  };
}

export function clearOtherCajaSelections(
  selectedByCaja: Record<string, string[]>,
  cajaId: string,
) {
  return { [cajaId]: selectedByCaja[cajaId] ?? [] };
}
