import { describe, expect, it } from "vitest";
import { tieneAlgunPermiso } from "./permisos.guard";

describe("tieneAlgunPermiso", () => {
  const miembro = { hasFullAccess: false, permisos: ["dashboard", "billing/settings"] };

  it("passes with any of the listed routes", () => {
    expect(tieneAlgunPermiso(miembro, ["finance/advances/request", "billing/settings"])).toBe(true);
    expect(tieneAlgunPermiso(miembro, ["suppliers/onboarding"])).toBe(false);
  });

  it("always passes for admins and when nothing is required", () => {
    expect(tieneAlgunPermiso({ hasFullAccess: true, permisos: [] }, ["administracion/terceros-erp"])).toBe(true);
    expect(tieneAlgunPermiso(miembro, [])).toBe(true);
  });
});
