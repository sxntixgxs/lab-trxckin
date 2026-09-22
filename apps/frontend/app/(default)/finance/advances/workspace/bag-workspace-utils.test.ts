import { describe, expect, test } from "vitest";

import {
  buildBagWorkspaceSearchParams,
  DEFAULT_BAG_SORT,
  DEFAULT_BAG_STATUS,
  isBagDetailDialogOpen,
  isBagFilterStateDefault,
  normalizeBagWorkspaceBagId,
  parseBagWorkspaceUrl,
  shouldRefetchBagItems,
  shouldRefreshBagItemsOnAnticipoClose,
} from "./bag-workspace-utils";

describe("bag workspace url utils", () => {
  test("parses defaults when params are absent", () => {
    expect(parseBagWorkspaceUrl(new URLSearchParams())).toEqual({
      view: null,
      bagId: null,
      q: "",
      estado: DEFAULT_BAG_STATUS,
      orden: DEFAULT_BAG_SORT,
    });
  });

  test("parses bag detail state from the URL", () => {
    const params = new URLSearchParams(
      "view=bags&bag=bolsa-123&q=acme&estado=overdue&orden=recent"
    );
    expect(parseBagWorkspaceUrl(params)).toEqual({
      view: "bags",
      bagId: "bolsa-123",
      q: "acme",
      estado: "overdue",
      orden: "recent",
    });
  });

  test("builds search params and omits default filter values", () => {
    const next = buildBagWorkspaceSearchParams(new URLSearchParams(), {
      view: "bags",
      bagId: "bolsa-123",
    });
    expect(next.toString()).toBe("view=bags&bag=bolsa-123");
    expect(isBagFilterStateDefault(parseBagWorkspaceUrl(next))).toBe(true);
  });

  test("clears bag detail params when returning to overview", () => {
    const next = buildBagWorkspaceSearchParams(
      new URLSearchParams("view=bags&bag=bolsa-123&q=test&estado=legalized&orden=pending"),
      { clearBag: true, q: "", estado: DEFAULT_BAG_STATUS, orden: DEFAULT_BAG_SORT }
    );
    expect(next.toString()).toBe("view=bags");
  });

  test("opens the URL-controlled dialog only when bag is selected and anticipo detail is closed", () => {
    const state = parseBagWorkspaceUrl(new URLSearchParams("view=bags&bag=bolsa-123"));
    expect(isBagDetailDialogOpen(state, false)).toBe(true);
    expect(isBagDetailDialogOpen(state, true)).toBe(false);
    expect(isBagDetailDialogOpen(parseBagWorkspaceUrl(new URLSearchParams()), false)).toBe(false);
  });

  test("preserves bag URL state while anticipo detail suspends the dialog", () => {
    const params = new URLSearchParams(
      "view=bags&bag=bolsa-123&q=acme&estado=overdue&orden=recent"
    );
    const state = parseBagWorkspaceUrl(params);
    expect(isBagDetailDialogOpen(state, true)).toBe(false);
    expect(state.bagId).toBe("bolsa-123");
    expect(state.q).toBe("acme");
    expect(state.estado).toBe("overdue");
    expect(state.orden).toBe("recent");
  });

  test("refreshes bag items only after a changed anticipo closes with an active bag", () => {
    expect(shouldRefreshBagItemsOnAnticipoClose("bolsa-123", true)).toBe(true);
    expect(shouldRefreshBagItemsOnAnticipoClose("bolsa-123", false)).toBe(false);
    expect(shouldRefreshBagItemsOnAnticipoClose(null, true)).toBe(false);
    expect(shouldRefreshBagItemsOnAnticipoClose("null", true)).toBe(false);
  });

  test("normalizes invalid bag URL sentinels to no active bag", () => {
    for (const value of [null, undefined, "", "   ", "null", "undefined", " NULL ", " undefined "]) {
      expect(normalizeBagWorkspaceBagId(value)).toBeNull();
    }
    expect(normalizeBagWorkspaceBagId("bolsa-123")).toBe("bolsa-123");
    expect(normalizeBagWorkspaceBagId(" bolsa-456 ")).toBe("bolsa-456");
  });

  test("parses stale bag=null URLs as no active bag", () => {
    expect(parseBagWorkspaceUrl(new URLSearchParams("view=bags&bag=null")).bagId).toBeNull();
    expect(parseBagWorkspaceUrl(new URLSearchParams("view=bags&bag=undefined")).bagId).toBeNull();
    expect(parseBagWorkspaceUrl(new URLSearchParams("view=bags&bag=  ")).bagId).toBeNull();
  });

  test("rebuilding search params drops invalid bag sentinels", () => {
    const next = buildBagWorkspaceSearchParams(new URLSearchParams("view=bags&bag=null"), {
      view: "bags",
    });
    expect(next.toString()).toBe("view=bags");
    expect(parseBagWorkspaceUrl(next).bagId).toBeNull();
  });

  test("does not qualify bag-items refetch without an active bag", () => {
    expect(shouldRefetchBagItems(null)).toBe(false);
    expect(shouldRefetchBagItems("null")).toBe(false);
    expect(shouldRefetchBagItems("undefined")).toBe(false);
    expect(shouldRefetchBagItems("bolsa-123")).toBe(true);
  });
});
