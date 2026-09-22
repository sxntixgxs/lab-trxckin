import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { prepareImpersonateCookie, prepareRestoreCookie } from "./impersonate-bff";

const admin = {
  id: "admin-1",
  nombre: "Admin",
  email: "admin@example.com",
  hasFullAccess: true,
  rol: { slug: "admin" },
};

describe("impersonate BFF cookie decisions", () => {
  it("sets the cookie after an admin chooses a target", () => {
    const decision = prepareImpersonateCookie({
      actor: admin,
      existing: null,
      targetUserId: "user-2",
    });
    assert.deepEqual(decision, {
      ok: true,
      cookie: { actorUserId: "admin-1", targetUserId: "user-2" },
    });
  });

  it("rejects a non-admin", () => {
    const decision = prepareImpersonateCookie({
      actor: { id: "user-2", nombre: "Ana", email: "ana@example.com", hasFullAccess: false, rol: { slug: "member" } },
      existing: null,
      targetUserId: "user-3",
    });
    assert.equal(decision.ok, false);
    if (!decision.ok) {
      assert.equal(decision.status, 403);
    }
  });

  it("reuses the stored actor when already acting", () => {
    const decision = prepareImpersonateCookie({
      actor: admin,
      existing: { actorUserId: "admin-1" },
      targetUserId: "user-3",
    });
    assert.deepEqual(decision, {
      ok: true,
      cookie: { actorUserId: "admin-1", targetUserId: "user-3" },
    });
  });

  it("clears the cookie on restore", () => {
    const decision = prepareRestoreCookie({
      actor: admin,
      existing: { actorUserId: "admin-1" },
    });
    assert.deepEqual(decision, { ok: true });
  });

  it("clears a cookie that does not belong to the real admin", () => {
    const decision = prepareRestoreCookie({
      actor: admin,
      existing: { actorUserId: "other-admin" },
    });
    assert.equal(decision.ok, false);
    if (!decision.ok) {
      assert.equal(decision.clearCookie, true);
    }
  });
});
