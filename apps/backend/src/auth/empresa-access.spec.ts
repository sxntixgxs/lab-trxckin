import { describe, expect, it } from "vitest";
import { empresasAccesibles, puedeAccederEmpresa } from "./empresa-access";

const miembro = { hasFullAccess: false, acceso_todas_empresas: false, empresas: [{ id_empresa: 2 }] };

describe("puedeAccederEmpresa", () => {
  it("limits scoped members to their companies", () => {
    expect(puedeAccederEmpresa(miembro, 2)).toBe(true);
    expect(puedeAccederEmpresa(miembro, 1)).toBe(false);
  });

  it("lets admins and global-access users in", () => {
    expect(puedeAccederEmpresa({ ...miembro, hasFullAccess: true }, 1)).toBe(true);
    expect(puedeAccederEmpresa({ ...miembro, acceso_todas_empresas: true }, 3)).toBe(true);
  });

  it("fails closed for unknown companies, even for admins", () => {
    expect(puedeAccederEmpresa({ ...miembro, hasFullAccess: true }, 9)).toBe(false);
    expect(puedeAccederEmpresa({ ...miembro, acceso_todas_empresas: true }, 0)).toBe(false);
  });
});

describe("empresasAccesibles", () => {
  it("filters the companies the user may see", () => {
    expect(empresasAccesibles(miembro)).toEqual([2]);
    expect(empresasAccesibles({ ...miembro, acceso_todas_empresas: true })).toEqual([1, 2, 3, 4]);
  });
});
