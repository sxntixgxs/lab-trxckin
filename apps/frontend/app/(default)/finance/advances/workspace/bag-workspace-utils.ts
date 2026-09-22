import type { AnticiposBagSort, AnticiposBagStatus, AnticiposWorkspaceView } from "./types";

export const DEFAULT_BAG_STATUS: AnticiposBagStatus = "pending";
export const DEFAULT_BAG_SORT: AnticiposBagSort = "priority";
export const BAG_PAGE_SIZE = 20;

const VALID_VIEWS = new Set<AnticiposWorkspaceView>([
  "buzon",
  "mine",
  "dashboard",
  "bags",
  "settings",
]);
const VALID_STATUS = new Set<AnticiposBagStatus>(["pending", "overdue", "legalized", "all"]);
const VALID_SORT = new Set<AnticiposBagSort>(["priority", "pending", "recent"]);
const INVALID_BAG_ID_SENTINELS = new Set(["null", "undefined"]);

/** Normalizes URL bag IDs; invalid sentinels become null. */
export function normalizeBagWorkspaceBagId(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || INVALID_BAG_ID_SENTINELS.has(trimmed.toLowerCase())) {
    return null;
  }
  return trimmed;
}

export type BagWorkspaceUrlState = {
  view: AnticiposWorkspaceView | null;
  bagId: string | null;
  q: string;
  estado: AnticiposBagStatus;
  orden: AnticiposBagSort;
};

export function parseBagStatus(value: string | null): AnticiposBagStatus {
  if (value && VALID_STATUS.has(value as AnticiposBagStatus)) {
    return value as AnticiposBagStatus;
  }
  return DEFAULT_BAG_STATUS;
}

export function parseBagSort(value: string | null): AnticiposBagSort {
  if (value && VALID_SORT.has(value as AnticiposBagSort)) {
    return value as AnticiposBagSort;
  }
  return DEFAULT_BAG_SORT;
}

export function parseWorkspaceView(value: string | null): AnticiposWorkspaceView | null {
  if (value && VALID_VIEWS.has(value as AnticiposWorkspaceView)) {
    return value as AnticiposWorkspaceView;
  }
  return null;
}

export function parseBagWorkspaceUrl(searchParams: URLSearchParams): BagWorkspaceUrlState {
  return {
    view: parseWorkspaceView(searchParams.get("view")),
    bagId: normalizeBagWorkspaceBagId(searchParams.get("bag")),
    q: searchParams.get("q")?.trim() ?? "",
    estado: parseBagStatus(searchParams.get("estado")),
    orden: parseBagSort(searchParams.get("orden")),
  };
}

export function isBagFilterStateDefault({
  q,
  estado,
  orden,
}: Pick<BagWorkspaceUrlState, "q" | "estado" | "orden">) {
  return !q && estado === DEFAULT_BAG_STATUS && orden === DEFAULT_BAG_SORT;
}

export function buildBagWorkspaceSearchParams(
  current: URLSearchParams,
  patch: Partial<BagWorkspaceUrlState> & { clearBag?: boolean }
) {
  const next = new URLSearchParams(current.toString());
  const view = patch.view ?? parseWorkspaceView(next.get("view"));
  const bagId = normalizeBagWorkspaceBagId(
    patch.clearBag === true
      ? null
      : patch.bagId !== undefined
        ? patch.bagId
        : next.get("bag")
  );
  const q = patch.q !== undefined ? patch.q.trim() : (next.get("q")?.trim() ?? "");
  const estado = patch.estado ?? parseBagStatus(next.get("estado"));
  const orden = patch.orden ?? parseBagSort(next.get("orden"));

  if (view) next.set("view", view);
  else next.delete("view");

  if (bagId) next.set("bag", bagId);
  else next.delete("bag");

  if (q) next.set("q", q);
  else next.delete("q");

  if (estado === DEFAULT_BAG_STATUS) next.delete("estado");
  else next.set("estado", estado);

  if (orden === DEFAULT_BAG_SORT) next.delete("orden");
  else next.set("orden", orden);

  return next;
}

export function bagWorkspacePageNumber(cursorHistoryLength: number) {
  return cursorHistoryLength + 1;
}

export function isBagDetailDialogOpen(
  state: Pick<BagWorkspaceUrlState, "bagId">,
  anticipoDetailOpen: boolean
) {
  return Boolean(state.bagId) && !anticipoDetailOpen;
}

export function shouldRefreshBagItemsOnAnticipoClose(
  bagId: string | null,
  anticipoChanged: boolean
) {
  return Boolean(normalizeBagWorkspaceBagId(bagId)) && anticipoChanged;
}

export function shouldRefetchBagItems(bagId: string | null) {
  return normalizeBagWorkspaceBagId(bagId) !== null;
}
