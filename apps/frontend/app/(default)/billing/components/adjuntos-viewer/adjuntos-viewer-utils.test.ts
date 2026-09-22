import { describe, expect, test } from "vitest";
import {
  DEFAULT_LAYOUT_PREFERENCES,
  DEFAULT_PANE_STATE,
  MAX_OPEN_DOCUMENTS,
  ZOOM_MAX,
  ZOOM_MIN,
} from "./adjuntos-viewer-types";
import {
  changePanePage,
  changeThreePanelPreset,
  clampZoom,
  closeDocument,
  computeRenderScale,
  getComparisonViewportWidth,
  getDefaultLayoutSizes,
  getPageRotation,
  loadViewerPreferences,
  mergePaneState,
  openDocumentsLabel,
  parseStoredViewerPreferences,
  resetLayoutPreferences,
  rotatePageClockwise,
  setPrimaryDocument,
  setZoomMode,
  shouldUseSidebarOverlay,
  stepManualZoom,
  toggleDocumentSelection,
} from "./adjuntos-viewer-utils";

describe("adjuntos viewer preferences", () => {
  test("returns defaults when storage is empty or invalid", () => {
    expect(parseStoredViewerPreferences(null)).toEqual(DEFAULT_LAYOUT_PREFERENCES);
    expect(parseStoredViewerPreferences("{")).toEqual(DEFAULT_LAYOUT_PREFERENCES);
    expect(loadViewerPreferences()).toEqual(DEFAULT_LAYOUT_PREFERENCES);
  });

  test("recovers valid stored preferences and clamps invalid sizes", () => {
    const parsed = parseStoredViewerPreferences(
      JSON.stringify({
        threePanelPreset: "columns",
        twoPanelSizes: [70, 30],
        threePanelStackedSizes: { main: 80, secondaryStack: [60, 40] },
        threePanelColumnSizes: [40, 35, 25],
      })
    );

    expect(parsed.threePanelPreset).toBe("columns");
    expect(parsed.twoPanelSizes).toEqual([70, 30]);
    expect(parsed.threePanelColumnSizes[0]).toBeGreaterThanOrEqual(15);
    expect(getDefaultLayoutSizes(parsed).threePanelColumns).toEqual(parsed.threePanelColumnSizes);
  });

  test("reset layout returns canonical defaults", () => {
    expect(resetLayoutPreferences()).toEqual(DEFAULT_LAYOUT_PREFERENCES);
  });
});

describe("adjuntos viewer selection", () => {
  test("opens up to three documents and blocks a fourth", () => {
    let selectedIds = ["a"];
    let activeId: string | null = "a";
    let primaryId: string | null = "a";

    const second = toggleDocumentSelection({
      selectedIds,
      activeId,
      primaryId,
      documentId: "b",
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    selectedIds = second.selectedIds;
    activeId = second.activeId;
    primaryId = second.primaryId;

    const third = toggleDocumentSelection({
      selectedIds,
      activeId,
      primaryId,
      documentId: "c",
    });
    expect(third.ok).toBe(true);
    if (!third.ok) return;
    selectedIds = third.selectedIds;

    const fourth = toggleDocumentSelection({
      selectedIds,
      activeId: third.activeId,
      primaryId: third.primaryId,
      documentId: "d",
    });
    expect(fourth).toEqual({ ok: false, reason: "max_reached" });
    expect(selectedIds).toHaveLength(MAX_OPEN_DOCUMENTS);
  });

  test("closing documents keeps at least one open", () => {
    const onlyOne = closeDocument({
      selectedIds: ["a"],
      activeId: "a",
      primaryId: "a",
      documentId: "a",
    });
    expect(onlyOne).toEqual({ ok: false, reason: "must_keep_one" });

    const closed = closeDocument({
      selectedIds: ["a", "b"],
      activeId: "b",
      primaryId: "a",
      documentId: "b",
    });
    expect(closed.ok).toBe(true);
    if (!closed.ok) return;
    expect(closed.selectedIds).toEqual(["a"]);
    expect(closed.activeId).toBe("a");
  });

  test("set primary reorders documents with principal first", () => {
    const next = setPrimaryDocument({
      selectedIds: ["a", "b", "c"],
      activeId: "b",
      primaryId: "a",
      documentId: "c",
    });
    expect(next.selectedIds).toEqual(["c", "a", "b"]);
    expect(next.primaryId).toBe("c");
  });

  test("change preset updates only three-panel topology", () => {
    const next = changeThreePanelPreset(DEFAULT_LAYOUT_PREFERENCES, "columns");
    expect(next.threePanelPreset).toBe("columns");
    expect(next.twoPanelSizes).toEqual(DEFAULT_LAYOUT_PREFERENCES.twoPanelSizes);
  });
});

describe("adjuntos viewer pane state", () => {
  test("clamps manual zoom between 25% and 400%", () => {
    expect(clampZoom(0.1)).toBe(ZOOM_MIN);
    expect(clampZoom(5)).toBe(ZOOM_MAX);
    expect(stepManualZoom(DEFAULT_PANE_STATE, 0.5).manualZoom).toBe(1.5);
  });

  test("rotates pages independently", () => {
    const first = rotatePageClockwise(DEFAULT_PANE_STATE, 2);
    expect(getPageRotation(first, 2)).toBe(90);
    const second = rotatePageClockwise(first, 2);
    expect(getPageRotation(second, 2)).toBe(180);
    expect(getPageRotation(second, 3)).toBe(0);
  });

  test("page navigation respects total pages", () => {
    const state = mergePaneState(DEFAULT_PANE_STATE, { totalPages: 4, page: 2 });
    expect(changePanePage(state, 1).page).toBe(3);
    expect(changePanePage(state, -5).page).toBe(1);
    expect(changePanePage(state, 5).page).toBe(4);
  });

  test("zoom modes preserve manual scale only in manual mode", () => {
    const fitWidth = setZoomMode(DEFAULT_PANE_STATE, "fit-width");
    expect(fitWidth.zoomMode).toBe("fit-width");
    const manual = setZoomMode(fitWidth, "manual");
    expect(manual.zoomMode).toBe("manual");
    expect(manual.manualZoom).toBe(1);
  });

  test("computeRenderScale adapts to container and mode", () => {
    const fitPage = computeRenderScale({
      zoomMode: "fit-page",
      manualZoom: 1,
      containerWidth: 400,
      containerHeight: 500,
      pageWidth: 800,
      pageHeight: 1000,
      rotation: 0,
    });
    const fitWidth = computeRenderScale({
      zoomMode: "fit-width",
      manualZoom: 1,
      containerWidth: 400,
      containerHeight: 500,
      pageWidth: 800,
      pageHeight: 1000,
      rotation: 0,
    });
    const manual = computeRenderScale({
      zoomMode: "manual",
      manualZoom: 1.5,
      containerWidth: 400,
      containerHeight: 500,
      pageWidth: 800,
      pageHeight: 1000,
      rotation: 0,
    });

    expect(fitPage).toBeLessThanOrEqual(fitWidth);
    expect(manual).toBe(1.5);
  });

  test("formats open documents label", () => {
    expect(openDocumentsLabel(2)).toBe("2 de 3 abiertos");
  });

  test("sidebar always overlays so comparison layout stays stable", () => {
    const containerWidth = 1300;

    expect(shouldUseSidebarOverlay(containerWidth, true)).toBe(true);
    expect(shouldUseSidebarOverlay(containerWidth, false)).toBe(false);
    expect(
      getComparisonViewportWidth({
        containerWidth,
        sidebarOpen: true,
        sidebarOverlay: true,
      }),
    ).toBe(containerWidth);
  });
});
