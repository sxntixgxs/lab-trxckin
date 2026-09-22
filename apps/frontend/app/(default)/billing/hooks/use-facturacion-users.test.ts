import { describe, expect, test } from "vitest";

import {
  buildFacturacionUsersSearchParams,
  esUsuarioFinanzas,
  mergeFacturacionUsuarios,
  normalizarUsuario,
  type FacturacionUsuario,
} from "./use-facturacion-users";

describe("facturacion users helpers", () => {
  test("builds request params with empresaId and includeGlobalAccess for configuracion", () => {
    const params = buildFacturacionUsersSearchParams({
      empresaId: 1,
      includeGlobalAccess: true,
    });

    expect(params.get("limit")).toBe("5000");
    expect(params.get("empresaId")).toBe("1");
    expect(params.get("includeGlobalAccess")).toBe("true");
  });

  test("omits empresaId and includeGlobalAccess when not configured", () => {
    const params = buildFacturacionUsersSearchParams();

    expect(params.get("limit")).toBe("5000");
    expect(params.get("empresaId")).toBeNull();
    expect(params.get("includeGlobalAccess")).toBeNull();
  });

  test("reads proceso from an object and detects Gestión Financiera with accents", () => {
    const usuario = normalizarUsuario({
      id: "u-finanzas",
      nombre: "Ana Finanzas",
      email: "ana@example.com",
      cargo: "Analista de causación",
      proceso: { id: 7, nombre: "Gestión Financiera" },
      id_proceso: 7,
      lider_proceso: false,
      activo: true,
    });

    expect(usuario).toMatchObject({
      id: "u-finanzas",
      cargo: "Analista de causación",
      id_proceso: 7,
      proceso: "Gestión Financiera",
    });
    expect(esUsuarioFinanzas(usuario!)).toBe(true);
  });

  test("normalizes company and global access fields", () => {
    const usuario = normalizarUsuario({
      id: "u-1",
      nombre: "Lider Inco",
      email: "LIDER@INCO.COM",
      id_empresa: "2",
      empresas: [{ id_empresa: "1" }, { empresa: { id: 2 } }],
      acceso_todas_empresas: "true",
      lider_proceso: "1",
      activo: "true",
    });

    expect(usuario).toMatchObject({
      id: "u-1",
      email: "lider@inco.com",
      id_empresa: 2,
      empresas: [2, 1],
      acceso_todas_empresas: true,
      lider_proceso: true,
      activo: true,
    });
  });

  test("merges users without replacing the base record", () => {
    const base: FacturacionUsuario = {
      id: "u-1",
      nombre: "Usuario Base",
      email: "base@example.com",
      cedula: "",
      cargo: "",
      telf: "",
      id_proceso: null,
      proceso: "",
      lider_proceso: false,
      activo: true,
    };
    const duplicate: FacturacionUsuario = {
      ...base,
      nombre: "Usuario Duplicado",
      acceso_todas_empresas: true,
    };
    const crossCompany: FacturacionUsuario = {
      id: "u-2",
      nombre: "Lider Cross",
      email: "lider@inco.co",
      cedula: "",
      cargo: "",
      telf: "",
      id_proceso: 12,
      proceso: "Operacion",
      lider_proceso: true,
      activo: true,
      id_empresa: 2,
      acceso_todas_empresas: true,
    };

    const merged = mergeFacturacionUsuarios([base], [duplicate, crossCompany]);

    expect(merged).toHaveLength(2);
    expect(merged.find((usuario) => usuario.id === "u-1")?.nombre).toBe(
      "Usuario Base",
    );
    expect(merged.some((usuario) => usuario.id === "u-2")).toBe(true);
  });
});
