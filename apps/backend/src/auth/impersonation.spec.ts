import { describe, expect, it } from "vitest";
import { evaluateImpersonation, shouldApplyImpersonationHeader } from "./impersonation";

describe("evaluateImpersonation", () => {
  it("rejects a non-admin actor", () => {
    const result = evaluateImpersonation({
      actorIsAdmin: false,
      actorId: "admin-1",
      target: { id: "user-2", activo: true },
    });
    expect(result).toEqual({
      ok: false,
      status: 403,
      message: "Solo los administradores pueden impersonar",
    });
  });

  it("rejects self impersonation", () => {
    const result = evaluateImpersonation({
      actorIsAdmin: true,
      actorId: "admin-1",
      target: { id: "admin-1", activo: true },
    });
    expect(result).toMatchObject({ ok: false, status: 400 });
  });

  it("rejects an inactive target", () => {
    const result = evaluateImpersonation({
      actorIsAdmin: true,
      actorId: "admin-1",
      target: { id: "user-2", activo: false },
    });
    expect(result).toMatchObject({ ok: false, status: 400 });
  });

  it("rejects a missing target", () => {
    const result = evaluateImpersonation({
      actorIsAdmin: true,
      actorId: "admin-1",
      target: null,
    });
    expect(result).toMatchObject({ ok: false, status: 400 });
  });

  it("allows an admin to impersonate an active user", () => {
    expect(
      evaluateImpersonation({
        actorIsAdmin: true,
        actorId: "admin-1",
        target: { id: "user-2", activo: true },
      }),
    ).toEqual({ ok: true });
  });
});

describe("shouldApplyImpersonationHeader", () => {
  it("ignores the header unless the actor is admin", () => {
    expect(shouldApplyImpersonationHeader(false, "user-2")).toBe(false);
    expect(shouldApplyImpersonationHeader(true, "")).toBe(false);
    expect(shouldApplyImpersonationHeader(true, "user-2")).toBe(true);
  });
});
