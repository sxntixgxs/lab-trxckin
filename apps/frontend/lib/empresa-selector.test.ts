import { describe, expect, test } from "vitest";
import {
  buildOpcionesSelector,
  resolveEmpresasParaFiltro,
  shouldMostrarSelector,
  TODAS_LAS_EMPRESAS_LABEL,
} from "./empresa-selector";
import { EMPRESAS_MAP } from "./empresas";

describe("buildOpcionesSelector", () => {
  test("global users get 'Todas' first, then every company", () => {
    const opciones = buildOpcionesSelector(true, [2]);
    expect(opciones[0]).toEqual({ id: null, nombre: TODAS_LAS_EMPRESAS_LABEL });
    expect(opciones.slice(1).map((o) => o.id)).toEqual([1, 2, 3, 4]);
    expect(opciones[1]?.info).toBe(EMPRESAS_MAP[1]);
  });

  test("restricted users only get their companies, without 'Todas'", () => {
    const opciones = buildOpcionesSelector(false, [2, 3]);
    expect(opciones.map((o) => o.id)).toEqual([2, 3]);
    expect(opciones.every((o) => o.id !== null)).toBe(true);
    expect(opciones[0]?.nombre).toBe(EMPRESAS_MAP[2]?.nombre);
  });

  test("unknown company ids get a fallback name", () => {
    expect(buildOpcionesSelector(false, [42])).toEqual([
      { id: 42, nombre: "Empresa 42", info: undefined },
    ]);
  });
});

describe("resolveEmpresasParaFiltro", () => {
  test("active company wins", () => {
    expect(resolveEmpresasParaFiltro(3, true, [1, 2, 3, 4])).toEqual([3]);
    expect(resolveEmpresasParaFiltro(3, false, [2, 3])).toEqual([3]);
  });

  test("'Todas' means no filter for global users", () => {
    expect(resolveEmpresasParaFiltro(null, true, [1, 2, 3, 4])).toEqual([]);
  });

  test("restricted users without a selection filter by all their companies", () => {
    expect(resolveEmpresasParaFiltro(null, false, [2, 3])).toEqual([2, 3]);
  });
});

describe("shouldMostrarSelector", () => {
  test("shown for global users and for users with more than one company", () => {
    expect(shouldMostrarSelector(true, [])).toBe(true);
    expect(shouldMostrarSelector(false, [2, 3])).toBe(true);
    expect(shouldMostrarSelector(false, [2])).toBe(false);
    expect(shouldMostrarSelector(false, [])).toBe(false);
  });
});
