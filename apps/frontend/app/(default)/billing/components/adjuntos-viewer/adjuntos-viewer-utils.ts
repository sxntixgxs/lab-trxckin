import {
  COMPARISON_MIN_WIDTH,
  DEFAULT_LAYOUT_PREFERENCES,
  DEFAULT_PANE_STATE,
  type DocumentoAdjuntoPreviewable,
  MAX_OPEN_DOCUMENTS,
  type PaneState,
  type StoredViewerPreferences,
  type ThreePanelPreset,
  VIEWER_PREFERENCES_STORAGE_KEY,
  type ViewerLayoutPreferences,
  ZOOM_MAX,
  ZOOM_MIN,
  type ZoomMode,
} from "./adjuntos-viewer-types";

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function clampZoom(value: number) {
  return clamp(Number(value.toFixed(3)), ZOOM_MIN, ZOOM_MAX);
}

export function clampPanelSize(value: number) {
  return clamp(Math.round(value), 15, 85);
}

export function normalizePanelPair(pair: [number, number]): [number, number] {
  const first = clampPanelSize(pair[0]);
  const second = clampPanelSize(100 - first);
  return [first, second];
}

export function normalizePanelTriple(triple: [number, number, number]): [number, number, number] {
  const first = clampPanelSize(triple[0]);
  const second = clampPanelSize(triple[1]);
  const third = clamp(100 - first - second, 15, 85);
  const total = first + second + third;
  if (total === 100) {
    return [first, second, third];
  }
  const scale = 100 / total;
  return normalizePanelTriple([first * scale, second * scale, third * scale] as [
    number,
    number,
    number,
  ]);
}

function isThreePanelPreset(value: unknown): value is ThreePanelPreset {
  return value === "stacked" || value === "columns";
}

function isNumberPair(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number" &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1])
  );
}

function isNumberTriple(value: unknown): value is [number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((entry) => typeof entry === "number" && Number.isFinite(entry))
  );
}

export function parseStoredViewerPreferences(raw: string | null): ViewerLayoutPreferences {
  if (!raw) return DEFAULT_LAYOUT_PREFERENCES;

  try {
    const parsed = JSON.parse(raw) as Partial<StoredViewerPreferences>;
    return {
      threePanelPreset: isThreePanelPreset(parsed.threePanelPreset)
        ? parsed.threePanelPreset
        : DEFAULT_LAYOUT_PREFERENCES.threePanelPreset,
      twoPanelSizes: isNumberPair(parsed.twoPanelSizes)
        ? normalizePanelPair(parsed.twoPanelSizes)
        : DEFAULT_LAYOUT_PREFERENCES.twoPanelSizes,
      threePanelStackedSizes: {
        main:
          typeof parsed.threePanelStackedSizes?.main === "number"
            ? clampPanelSize(parsed.threePanelStackedSizes.main)
            : DEFAULT_LAYOUT_PREFERENCES.threePanelStackedSizes.main,
        secondaryStack: isNumberPair(parsed.threePanelStackedSizes?.secondaryStack)
          ? normalizePanelPair(parsed.threePanelStackedSizes.secondaryStack)
          : DEFAULT_LAYOUT_PREFERENCES.threePanelStackedSizes.secondaryStack,
      },
      threePanelColumnSizes: isNumberTriple(parsed.threePanelColumnSizes)
        ? normalizePanelTriple(parsed.threePanelColumnSizes)
        : DEFAULT_LAYOUT_PREFERENCES.threePanelColumnSizes,
    };
  } catch {
    return DEFAULT_LAYOUT_PREFERENCES;
  }
}

export function loadViewerPreferences(): ViewerLayoutPreferences {
  if (typeof window === "undefined") {
    return DEFAULT_LAYOUT_PREFERENCES;
  }
  return parseStoredViewerPreferences(window.localStorage.getItem(VIEWER_PREFERENCES_STORAGE_KEY));
}

export function saveViewerPreferences(preferences: ViewerLayoutPreferences) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(VIEWER_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
}

export function mergePaneState(
  current: PaneState | undefined,
  patch: Partial<PaneState>
): PaneState {
  const previous = current ?? DEFAULT_PANE_STATE;
  const merged: PaneState = {
    ...previous,
    ...patch,
    pageRotations: patch.pageRotations ?? previous.pageRotations,
  };

  if (merged.totalPages) {
    merged.page = clamp(merged.page, 1, merged.totalPages);
  } else {
    merged.page = Math.max(1, merged.page);
  }

  merged.manualZoom = clampZoom(merged.manualZoom);
  merged.scrollTop = Math.max(0, merged.scrollTop);
  merged.scrollLeft = Math.max(0, merged.scrollLeft);
  return merged;
}

export function getPageRotation(state: PaneState, page: number) {
  return state.pageRotations[page] ?? 0;
}

export function rotatePageClockwise(state: PaneState, page: number): PaneState {
  const current = getPageRotation(state, page);
  return mergePaneState(state, {
    pageRotations: {
      ...state.pageRotations,
      [page]: (current + 90) % 360,
    },
  });
}

export function stepManualZoom(state: PaneState, delta: number): PaneState {
  return mergePaneState(state, {
    zoomMode: "manual",
    manualZoom: clampZoom(state.manualZoom + delta),
  });
}

export function setZoomMode(state: PaneState, zoomMode: ZoomMode): PaneState {
  return mergePaneState(state, { zoomMode });
}

export function changePanePage(state: PaneState, delta: number): PaneState {
  const nextPage = state.page + delta;
  const maxPage = state.totalPages ?? nextPage;
  return mergePaneState(state, {
    page: clamp(nextPage, 1, maxPage),
  });
}

export type SelectionResult =
  | { ok: true; selectedIds: string[]; activeId: string; primaryId: string }
  | { ok: false; reason: "max_reached" | "must_keep_one" };

export function toggleDocumentSelection(args: {
  selectedIds: string[];
  activeId: string | null;
  primaryId: string | null;
  documentId: string;
}): SelectionResult {
  const { selectedIds, activeId, primaryId, documentId } = args;

  if (selectedIds.includes(documentId)) {
    if (selectedIds.length === 1) {
      return { ok: false, reason: "must_keep_one" };
    }
    const nextIds = selectedIds.filter((id) => id !== documentId);
    const nextActive = activeId === documentId ? (nextIds[0] ?? null) : activeId;
    const nextPrimary = primaryId === documentId ? (nextIds[0] ?? null) : primaryId;
    return {
      ok: true,
      selectedIds: nextIds,
      activeId: nextActive ?? nextIds[0] ?? documentId,
      primaryId: nextPrimary ?? nextIds[0] ?? documentId,
    };
  }

  if (selectedIds.length >= MAX_OPEN_DOCUMENTS) {
    return { ok: false, reason: "max_reached" };
  }

  const nextIds = [...selectedIds, documentId];
  return {
    ok: true,
    selectedIds: nextIds,
    activeId: documentId,
    primaryId: primaryId ?? documentId,
  };
}

export function closeDocument(args: {
  selectedIds: string[];
  activeId: string | null;
  primaryId: string | null;
  documentId: string;
}): SelectionResult {
  return toggleDocumentSelection(args);
}

export function setPrimaryDocument(args: {
  selectedIds: string[];
  activeId: string | null;
  primaryId: string | null;
  documentId: string;
}): { selectedIds: string[]; activeId: string; primaryId: string } {
  const { selectedIds, activeId, primaryId, documentId } = args;
  if (!selectedIds.includes(documentId)) {
    return {
      selectedIds,
      activeId: activeId ?? selectedIds[0] ?? documentId,
      primaryId: primaryId ?? selectedIds[0] ?? documentId,
    };
  }

  const reordered = [documentId, ...selectedIds.filter((id) => id !== documentId)];
  return {
    selectedIds: reordered,
    activeId: activeId ?? documentId,
    primaryId: documentId,
  };
}

export function changeThreePanelPreset(
  preferences: ViewerLayoutPreferences,
  preset: ThreePanelPreset
): ViewerLayoutPreferences {
  return {
    ...preferences,
    threePanelPreset: preset,
  };
}

export function resetLayoutPreferences(): ViewerLayoutPreferences {
  return { ...DEFAULT_LAYOUT_PREFERENCES };
}

export function updateTwoPanelSizes(
  preferences: ViewerLayoutPreferences,
  sizes: [number, number]
): ViewerLayoutPreferences {
  return {
    ...preferences,
    twoPanelSizes: normalizePanelPair(sizes),
  };
}

export function updateThreePanelStackedSizes(
  preferences: ViewerLayoutPreferences,
  patch: Partial<ViewerLayoutPreferences["threePanelStackedSizes"]>
): ViewerLayoutPreferences {
  return {
    ...preferences,
    threePanelStackedSizes: {
      main: patch.main ? clampPanelSize(patch.main) : preferences.threePanelStackedSizes.main,
      secondaryStack: patch.secondaryStack
        ? normalizePanelPair(patch.secondaryStack)
        : preferences.threePanelStackedSizes.secondaryStack,
    },
  };
}

export function updateThreePanelColumnSizes(
  preferences: ViewerLayoutPreferences,
  sizes: [number, number, number]
): ViewerLayoutPreferences {
  return {
    ...preferences,
    threePanelColumnSizes: normalizePanelTriple(sizes),
  };
}

export function shouldUseCompactViewer(width: number, height: number) {
  return width < COMPARISON_MIN_WIDTH || height > width;
}

export function shouldUseSidebarOverlay(_containerWidth: number, sidebarOpen: boolean) {
  // Always overlay when open so the list never shrinks the comparison workspace.
  return sidebarOpen;
}

export function getComparisonViewportWidth(args: {
  containerWidth: number;
  sidebarOpen?: boolean;
  sidebarOverlay?: boolean;
}) {
  void args.sidebarOpen;
  void args.sidebarOverlay;
  return args.containerWidth;
}

export function orderDocumentsForLayout(args: {
  selectedAdjuntos: DocumentoAdjuntoPreviewable[];
  primaryId: string | null;
}) {
  const { selectedAdjuntos, primaryId } = args;
  if (!primaryId) return selectedAdjuntos;
  const primary = selectedAdjuntos.find((doc) => doc.id === primaryId);
  if (!primary) return selectedAdjuntos;
  return [primary, ...selectedAdjuntos.filter((doc) => doc.id !== primaryId)];
}

export function computeRenderScale(args: {
  zoomMode: ZoomMode;
  manualZoom: number;
  containerWidth: number;
  containerHeight: number;
  pageWidth: number;
  pageHeight: number;
  rotation: number;
}) {
  const { zoomMode, manualZoom, containerWidth, containerHeight, pageWidth, pageHeight, rotation } =
    args;

  const rotated = rotation % 180 !== 0;
  const effectiveWidth = rotated ? pageHeight : pageWidth;
  const effectiveHeight = rotated ? pageWidth : pageHeight;
  const padding = 24;
  const width = Math.max(1, containerWidth - padding);
  const height = Math.max(1, containerHeight - padding);
  const widthScale = width / Math.max(1, effectiveWidth);
  const heightScale = height / Math.max(1, effectiveHeight);

  if (zoomMode === "manual") {
    return clampZoom(manualZoom);
  }
  if (zoomMode === "fit-width") {
    return Math.max(0.1, widthScale);
  }
  return Math.max(0.1, Math.min(widthScale, heightScale));
}

export function getDefaultLayoutSizes(preferences: ViewerLayoutPreferences) {
  return {
    twoPanel: preferences.twoPanelSizes,
    threePanelStacked: {
      main: preferences.threePanelStackedSizes.main,
      secondary: 100 - preferences.threePanelStackedSizes.main,
      secondaryStack: preferences.threePanelStackedSizes.secondaryStack,
    },
    threePanelColumns: preferences.threePanelColumnSizes,
  };
}

export type { ViewerLayoutPreferences, PaneState, ZoomMode };

export function formatZoomLabel(scale: number) {
  return `${Math.round(scale * 100)}%`;
}

export function openDocumentsLabel(openCount: number, maxCount = MAX_OPEN_DOCUMENTS) {
  return `${openCount} de ${maxCount} abiertos`;
}
