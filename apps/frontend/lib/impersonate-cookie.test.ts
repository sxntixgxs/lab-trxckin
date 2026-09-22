import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  decodeImpersonateCookie,
  encodeImpersonateCookie,
  IMPERSONATE_TTL_MS,
} from "./impersonate-cookie-codec";

const SECRET = "test-impersonate-secret";

describe("impersonate cookie", () => {
  it("roundtrips a signed payload", () => {
    const now = Date.parse("2026-09-19T00:00:00.000Z");
    const encoded = encodeImpersonateCookie(
      { actorUserId: "admin-1", targetUserId: "user-2" },
      now,
      SECRET,
    );
    assert.deepEqual(decodeImpersonateCookie(encoded, now + 1000, SECRET), {
      actorUserId: "admin-1",
      targetUserId: "user-2",
      exp: now + IMPERSONATE_TTL_MS,
    });
  });

  it("rejects a tampered signature", () => {
    const encoded = encodeImpersonateCookie(
      { actorUserId: "admin-1", targetUserId: "user-2" },
      Date.now(),
      SECRET,
    );
    assert.equal(decodeImpersonateCookie(`${encoded}x`, Date.now(), SECRET), null);
  });

  it("rejects an expired cookie", () => {
    const now = Date.parse("2026-09-19T00:00:00.000Z");
    const encoded = encodeImpersonateCookie(
      { actorUserId: "admin-1", targetUserId: "user-2" },
      now,
      SECRET,
    );
    assert.equal(decodeImpersonateCookie(encoded, now + IMPERSONATE_TTL_MS + 1, SECRET), null);
  });
});
