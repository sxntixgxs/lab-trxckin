import { describe, expect, test } from "vitest";
import { hasGlobalEmpresaAccess, normalizeEmpresaIds, resolveEmpresaAccess } from "./empresas";

describe("hasGlobalEmpresaAccess", () => {
  test("only the explicit flag grants global scope", () => {
    expect(hasGlobalEmpresaAccess(10, true)).toBe(true);
    expect(hasGlobalEmpresaAccess(10, false)).toBe(false);
    expect(hasGlobalEmpresaAccess(10, undefined)).toBe(false);
  });

  test("legacy role ids no longer grant global scope", () => {
    for (const idRol of [1, 4, 99]) {
      expect(hasGlobalEmpresaAccess(idRol, false)).toBe(false);
      expect(hasGlobalEmpresaAccess(idRol, null)).toBe(false);
    }
  });
});

describe("normalizeEmpresaIds", () => {
  test("sorts, dedupes and drops invalid ids", () => {
    expect(normalizeEmpresaIds([3, 2, 3, 0, -1, 2.5])).toEqual([2, 3]);
    expect(normalizeEmpresaIds(undefined)).toEqual([]);
  });
});

describe("resolveEmpresaAccess", () => {
  test("admin (hasFullAccess) sees every company", () => {
    expect(resolveEmpresaAccess({ hasFullAccess: true, empresas: [2] })).toEqual({
      empresas: [1, 2, 3, 4],
      canAccessAllEmpresas: true,
      isAdmin: true,
    });
  });

  test("flagged member sees every company but is not admin", () => {
    expect(resolveEmpresaAccess({ acceso_todas_empresas: true, empresas: [2] })).toEqual({
      empresas: [1, 2, 3, 4],
      canAccessAllEmpresas: true,
      isAdmin: false,
    });
  });

  test("restricted member sees only their (normalized) companies", () => {
    expect(
      resolveEmpresaAccess({ acceso_todas_empresas: false, hasFullAccess: false, empresas: [3, 2] }),
    ).toEqual({ empresas: [2, 3], canAccessAllEmpresas: false, isAdmin: false });
  });

  test("missing user has no access", () => {
    expect(resolveEmpresaAccess(null)).toEqual({
      empresas: [],
      canAccessAllEmpresas: false,
      isAdmin: false,
    });
  });
});
