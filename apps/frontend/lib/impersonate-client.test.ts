import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  canUseImpersonationBanner,
  consumeSessionFlash,
  isAdminUser,
  isEditableTarget,
  isImpersonateShortcut,
} from "./impersonate-client";

describe("impersonate client helpers", () => {
  it("lets admins and acting sessions use the banner", () => {
    assert.equal(canUseImpersonationBanner({ isAdmin: true, isImpersonating: false }), true);
    assert.equal(canUseImpersonationBanner({ isAdmin: false, isImpersonating: true }), true);
    assert.equal(canUseImpersonationBanner({ isAdmin: false, isImpersonating: false }), false);
  });

  it("recognizes Ctrl/Cmd+U", () => {
    assert.equal(isImpersonateShortcut({ metaKey: true, ctrlKey: false, key: "u" }), true);
    assert.equal(isImpersonateShortcut({ metaKey: false, ctrlKey: true, key: "U" }), true);
    assert.equal(isImpersonateShortcut({ metaKey: false, ctrlKey: false, key: "u" }), false);
  });

  it("ignores the shortcut target when typing in inputs", () => {
    assert.equal(isEditableTarget({ tagName: "INPUT" } as EventTarget), true);
    assert.equal(isEditableTarget({ tagName: "BUTTON" } as EventTarget), false);
  });

  it("treats full-access and admin slug as admin", () => {
    assert.equal(isAdminUser({ hasFullAccess: true, rol: { slug: "member" } }), true);
    assert.equal(isAdminUser({ hasFullAccess: false, rol: { slug: "admin" } }), true);
    assert.equal(isAdminUser({ hasFullAccess: false, rol: { slug: "member" } }), false);
  });

  it("consumes the session-change flash message once", () => {
    const store = new Map<string, string>([["session-change-flash", "Hola"]]);
    const g = globalThis as { window?: unknown };
    const previous = g.window;
    g.window = {
      sessionStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        removeItem: (key: string) => void store.delete(key),
      },
    };
    try {
      assert.equal(consumeSessionFlash(), "Hola");
      assert.equal(consumeSessionFlash(), null);
    } finally {
      g.window = previous;
    }
  });

  it("returns null when session storage is unavailable", () => {
    const g = globalThis as { window?: unknown };
    const previous = g.window;
    g.window = {
      get sessionStorage(): Storage {
        throw new Error("blocked");
      },
    };
    try {
      assert.equal(consumeSessionFlash(), null);
    } finally {
      g.window = previous;
    }
  });
});
