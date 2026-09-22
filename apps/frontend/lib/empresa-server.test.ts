import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/lib/fetch-backend", () => ({ getCurrentBackendUser: vi.fn() }));

import { cookies } from "next/headers";
import { getCurrentBackendUser, type CurrentUser } from "@/lib/fetch-backend";
import {
  getEmpresaActivaCookie,
  getServerEmpresaArray,
  getServerEmpresaIds,
  parseEmpresaCookie,
  resolveServerEmpresaIds,
} from "./empresa-server";

function mockCookie(value: string | undefined) {
  vi.mocked(cookies).mockResolvedValue({
    get: (name: string) =>
      name === "empresa-activa" && value !== undefined ? { name, value } : undefined,
  } as unknown as Awaited<ReturnType<typeof cookies>>);
}

function user(overrides: Partial<CurrentUser>): CurrentUser {
  return {
    id: "u1",
    workosUserId: "w1",
    email: "u@example.com",
    nombre: "U",
    activo: true,
    rol: { id: 2, slug: "member", nombre: "Miembro" },
    permisos: [],
    hasFullAccess: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(cookies).mockReset();
  vi.mocked(getCurrentBackendUser).mockReset();
});

describe("parseEmpresaCookie", () => {
  test("accepts positive integers only", () => {
    expect(parseEmpresaCookie("3")).toBe(3);
    expect(parseEmpresaCookie("")).toBeNull();
    expect(parseEmpresaCookie(undefined)).toBeNull();
    expect(parseEmpresaCookie("0")).toBeNull();
    expect(parseEmpresaCookie("abc")).toBeNull();
  });
});

describe("resolveServerEmpresaIds", () => {
  test("valid cookie for a global user", () => {
    expect(resolveServerEmpresaIds("2", [1, 2, 3, 4], true)).toEqual([2]);
  });

  test("valid cookie for a restricted user who may see it", () => {
    expect(resolveServerEmpresaIds("2", [2, 3], false)).toEqual([2]);
  });

  test("cookie outside the restricted user's companies falls back to all of theirs", () => {
    expect(resolveServerEmpresaIds("1", [2, 3], false)).toEqual([2, 3]);
  });

  test("no cookie: restricted users get their companies, global users no filter", () => {
    expect(resolveServerEmpresaIds(undefined, [2, 3], false)).toEqual([2, 3]);
    expect(resolveServerEmpresaIds("", [1, 2, 3, 4], true)).toEqual([]);
  });
});

describe("getServerEmpresaArray / getServerEmpresaIds", () => {
  test("reads the cookie and resolves against the user's access", async () => {
    mockCookie("3");
    const restricted = user({ empresas: [2, 3], acceso_todas_empresas: false });
    expect(await getServerEmpresaArray(restricted)).toEqual([3]);
    expect(await getServerEmpresaIds(restricted)).toBe("3");
  });

  test("admin without a cookie has no filter", async () => {
    mockCookie(undefined);
    expect(await getServerEmpresaIds(user({ hasFullAccess: true }))).toBe("");
  });
});

describe("getEmpresaActivaCookie", () => {
  test("returns the raw cookie when there is no backend session", async () => {
    mockCookie("7");
    vi.mocked(getCurrentBackendUser).mockResolvedValue(null);
    expect(await getEmpresaActivaCookie()).toBe("7");
  });

  test("validates the cookie against the session user", async () => {
    mockCookie("1");
    vi.mocked(getCurrentBackendUser).mockResolvedValue(
      user({ empresas: [2, 3], acceso_todas_empresas: false }),
    );
    expect(await getEmpresaActivaCookie()).toBe("2,3");
  });
});
