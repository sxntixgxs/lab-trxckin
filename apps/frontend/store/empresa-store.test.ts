import { beforeEach, describe, expect, test, vi } from "vitest";

const { memoryStorage, fakeDocument } = vi.hoisted(() => {
  const data = new Map<string, string>();
  const memoryStorage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
    clear: () => data.clear(),
    key: (index: number) => [...data.keys()][index] ?? null,
    get length() {
      return data.size;
    },
  };
  const fakeDocument = { cookie: "" };
  vi.stubGlobal("localStorage", memoryStorage);
  vi.stubGlobal("document", fakeDocument);
  return { memoryStorage, fakeDocument };
});

import { useEmpresaStore } from "./empresa-store";

const STORAGE_KEY = "empresa-activa";

function cookieValue() {
  const match = /empresa-activa=([^;]*)/.exec(fakeDocument.cookie);
  return match ? match[1] : undefined;
}

function seedPersisted(empresaActiva: number | null) {
  memoryStorage.setItem(STORAGE_KEY, JSON.stringify({ state: { empresaActiva }, version: 0 }));
}

const GLOBAL = { empresas: [1, 2, 3, 4], canAccessAllEmpresas: true, isAdmin: true };
const RESTRICTED_ONE = { empresas: [2], canAccessAllEmpresas: false, isAdmin: false };
const RESTRICTED_TWO = { empresas: [2, 3], canAccessAllEmpresas: false, isAdmin: false };

beforeEach(() => {
  useEmpresaStore.setState(useEmpresaStore.getInitialState(), true);
  memoryStorage.clear();
  fakeDocument.cookie = "";
});

describe("initialize", () => {
  test("global user: every company available, 'Todas' by default, cookie cleared", () => {
    useEmpresaStore.getState().initialize(GLOBAL);
    const state = useEmpresaStore.getState();
    expect(state._initialized).toBe(true);
    expect(state.empresasDisponibles).toEqual([1, 2, 3, 4]);
    expect(state.empresaActiva).toBeNull();
    expect(state.canAccessAllEmpresas).toBe(true);
    expect(state.isAdmin).toBe(true);
    expect(cookieValue()).toBe("");
  });

  test("global user keeps a valid persisted selection", () => {
    useEmpresaStore.setState({ empresaActiva: 3 });
    useEmpresaStore.getState().initialize(GLOBAL);
    expect(useEmpresaStore.getState().empresaActiva).toBe(3);
    expect(cookieValue()).toBe("3");
  });

  test("global user: persisted selection outside the catalog is reset", () => {
    useEmpresaStore.setState({ empresaActiva: 42 });
    useEmpresaStore.getState().initialize(GLOBAL);
    expect(useEmpresaStore.getState().empresaActiva).toBeNull();
  });

  test("restricted user with one company auto-selects it and mirrors the cookie", () => {
    useEmpresaStore.getState().initialize(RESTRICTED_ONE);
    expect(useEmpresaStore.getState().empresaActiva).toBe(2);
    expect(useEmpresaStore.getState().empresasDisponibles).toEqual([2]);
    expect(cookieValue()).toBe("2");
  });

  test("restricted user with several companies starts without a selection", () => {
    useEmpresaStore
      .getState()
      .initialize({ empresas: [3, 2], canAccessAllEmpresas: false, isAdmin: false });
    expect(useEmpresaStore.getState().empresasDisponibles).toEqual([2, 3]);
    expect(useEmpresaStore.getState().empresaActiva).toBeNull();
  });

  test("restricted user: persisted selection they may not see is reset", () => {
    useEmpresaStore.setState({ empresaActiva: 1 });
    useEmpresaStore.getState().initialize(RESTRICTED_TWO);
    expect(useEmpresaStore.getState().empresaActiva).toBeNull();
  });

  test("re-initializing with the same scope is a no-op", () => {
    useEmpresaStore.getState().initialize(GLOBAL);
    useEmpresaStore.getState().setEmpresaActiva(2);
    const before = useEmpresaStore.getState();
    useEmpresaStore.getState().initialize({ ...GLOBAL, empresas: [4, 3, 2, 1] });
    expect(useEmpresaStore.getState()).toBe(before);
  });

  test("switching to a different user (impersonation) re-validates the selection", () => {
    useEmpresaStore.getState().initialize(GLOBAL);
    useEmpresaStore.getState().setEmpresaActiva(1);
    useEmpresaStore.getState().initialize(RESTRICTED_ONE);
    expect(useEmpresaStore.getState().empresaActiva).toBe(2);
    expect(useEmpresaStore.getState().canAccessAllEmpresas).toBe(false);
  });
});

describe("setEmpresaActiva", () => {
  test("global user may pick any company or 'Todas'", () => {
    useEmpresaStore.getState().initialize(GLOBAL);
    useEmpresaStore.getState().setEmpresaActiva(4);
    expect(useEmpresaStore.getState().empresaActiva).toBe(4);
    expect(cookieValue()).toBe("4");
    useEmpresaStore.getState().setEmpresaActiva(null);
    expect(useEmpresaStore.getState().empresaActiva).toBeNull();
    expect(cookieValue()).toBe("");
  });

  test("restricted user cannot pick 'Todas' or a foreign company", () => {
    useEmpresaStore.getState().initialize(RESTRICTED_TWO);
    useEmpresaStore.getState().setEmpresaActiva(3);
    expect(useEmpresaStore.getState().empresaActiva).toBe(3);
    useEmpresaStore.getState().setEmpresaActiva(null);
    expect(useEmpresaStore.getState().empresaActiva).toBe(3);
    useEmpresaStore.getState().setEmpresaActiva(1);
    expect(useEmpresaStore.getState().empresaActiva).toBe(3);
  });
});

describe("persistence", () => {
  test("only empresaActiva is persisted", () => {
    useEmpresaStore.getState().initialize(GLOBAL);
    useEmpresaStore.getState().setEmpresaActiva(2);
    const stored = JSON.parse(memoryStorage.getItem(STORAGE_KEY) ?? "{}") as {
      state: Record<string, unknown>;
    };
    expect(stored.state).toEqual({ empresaActiva: 2 });
  });

  test("rehydrates a persisted selection, which initialize then validates", async () => {
    seedPersisted(3);
    await useEmpresaStore.persist.rehydrate();
    expect(useEmpresaStore.getState().empresaActiva).toBe(3);
    useEmpresaStore.getState().initialize(RESTRICTED_ONE);
    expect(useEmpresaStore.getState().empresaActiva).toBe(2);
  });

  test("a legacy bare-number value does not break rehydration", async () => {
    memoryStorage.setItem(STORAGE_KEY, "3");
    await expect(useEmpresaStore.persist.rehydrate()).resolves.not.toThrow();
    expect(useEmpresaStore.getState().empresaActiva).toBeNull();
  });

  test("getEmpresasParaFiltro follows the filter contract", () => {
    useEmpresaStore.getState().initialize(GLOBAL);
    expect(useEmpresaStore.getState().getEmpresasParaFiltro()).toEqual([]);
    useEmpresaStore.getState().setEmpresaActiva(1);
    expect(useEmpresaStore.getState().getEmpresasParaFiltro()).toEqual([1]);
    useEmpresaStore.getState().initialize(RESTRICTED_TWO);
    expect(useEmpresaStore.getState().getEmpresasParaFiltro()).toEqual([2, 3]);
  });
});
