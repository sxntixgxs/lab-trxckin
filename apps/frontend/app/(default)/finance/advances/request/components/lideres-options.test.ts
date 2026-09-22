import { describe, expect, test } from "vitest";

import {
  filtrarLideres,
  getLideresDisponibles,
  normalizarUsuarioAnticipo,
  type UsuarioAnticipo,
} from "./lideres-options";

function usuario(overrides: Partial<UsuarioAnticipo>): UsuarioAnticipo {
  return {
    id: "usuario",
    nombre: "Usuario",
    activo: true,
    lider_proceso: true,
    ...overrides,
  };
}

describe("opciones de líderes para solicitar anticipos", () => {
  test("normaliza banderas y empresas igual que el directorio de Facturación", () => {
    const result = normalizarUsuarioAnticipo({
      id: "lider-global",
      nombre: "Líder Global",
      id_empresa: "2",
      empresas: [{ id_empresa: "1" }],
      acceso_todas_empresas: "true",
      lider_proceso: "1",
      activo: "true",
    });

    expect(result).toMatchObject({
      id: "lider-global",
      id_empresa: 2,
      empresas: [2, 1],
      acceso_todas_empresas: true,
      lider_proceso: true,
      activo: true,
    });
  });

  test("incluye líderes de la empresa y líderes con acceso a todas las empresas", () => {
    const local = usuario({ id: "local", nombre: "Local", id_empresa: 1 });
    const adicional = usuario({
      id: "adicional",
      nombre: "Adicional",
      id_empresa: 2,
      empresas: [2, 1],
    });
    const global = usuario({
      id: "global",
      nombre: "Global",
      id_empresa: 2,
      acceso_todas_empresas: true,
    });
    const otraEmpresa = usuario({ id: "otra", id_empresa: 2 });
    const inactivo = usuario({ id: "inactivo", id_empresa: 1, activo: false });

    expect(
      getLideresDisponibles([local, adicional, global, otraEmpresa, inactivo], 1).map(
        (item) => item.id
      )
    ).toEqual(["adicional", "global", "local"]);
  });

  test("mantiene al jefe configurado aunque no esté marcado como líder", () => {
    const jefe = usuario({ id: "jefe", lider_proceso: false, id_empresa: 2 });

    expect(getLideresDisponibles([], 1, jefe)).toEqual([jefe]);
  });

  test("busca sin depender de mayúsculas o tildes", () => {
    const lideres = [
      usuario({
        id: "uno",
        nombre: "María Núñez",
        email: "maria@example.com",
        cargo: "Directora de operaciones",
      }),
      usuario({ id: "dos", nombre: "Carlos Pérez", email: "carlos@example.com" }),
    ];

    expect(filtrarLideres(lideres, "maria nunez").map((item) => item.id)).toEqual(["uno"]);
    expect(filtrarLideres(lideres, "operaciones").map((item) => item.id)).toEqual(["uno"]);
    expect(filtrarLideres(lideres, "carlos@example").map((item) => item.id)).toEqual(["dos"]);
  });
});
