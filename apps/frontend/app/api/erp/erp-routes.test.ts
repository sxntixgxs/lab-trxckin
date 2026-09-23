import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@workos-inc/authkit-nextjs", () => ({ withAuth: vi.fn(async () => ({ accessToken: "token" })) }));
vi.mock("@/lib/fetch-backend", () => ({
  fetchBackend: vi.fn(),
  getCurrentBackendUser: vi.fn(),
  userHasPermission: (user: { hasFullAccess: boolean; permisos: string[] }, permiso: string) =>
    user.hasFullAccess || user.permisos.includes("*") || user.permisos.includes(permiso),
}));

import { fetchBackend, getCurrentBackendUser } from "@/lib/fetch-backend";
import { GET as buscarProveedores } from "@/app/api/proveedores/search/route";
import { GET as listarCatalogo } from "@/app/api/erp/catalogo/[entidad]/route";
import { GET as listarCorridas, POST as sincronizar } from "@/app/api/erp/sincronizaciones/route";

function usuario(permisos: string[], empresas = [1], accesoTodas = false) {
  return {
    id: "user-1",
    nombre: "Ana",
    email: "ana@example.com",
    rol: { id: 2, slug: "member", nombre: "Miembro" },
    empresas,
    acceso_todas_empresas: accesoTodas,
    hasFullAccess: false,
    permisos,
  };
}

function ultimaLlamada(): [string, RequestInit | undefined] {
  const llamadas = vi.mocked(fetchBackend).mock.calls;
  return llamadas[llamadas.length - 1] as [string, RequestInit | undefined];
}

const req = (url: string, init?: RequestInit) => new Request(`http://localhost${url}`, init);

describe("rutas del catálogo del ERP", () => {
  beforeEach(() => {
    vi.mocked(fetchBackend).mockResolvedValue(Response.json({ ok: true }));
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("la búsqueda de proveedores exige empresa y reenvía solo q, empresa y limit", async () => {
    vi.mocked(getCurrentBackendUser).mockResolvedValue(usuario(["finance/advances/request"]) as never);
    expect((await buscarProveedores(req("/api/proveedores/search?q=900"))).status).toBe(400);

    await buscarProveedores(req("/api/proveedores/search?nit=900222333&empresa=1&pageSize=100&maxPages=10&limit=12"));
    expect(ultimaLlamada()[0]).toBe("/api/v1/proveedores/search?empresa=1&q=900222333&limit=12");

    vi.mocked(getCurrentBackendUser).mockResolvedValue(usuario(["dashboard"]) as never);
    expect((await buscarProveedores(req("/api/proveedores/search?q=900&empresa=1"))).status).toBe(403);
  });

  it("administración: sincronizar y listar con el permiso de Terceros ERP", async () => {
    vi.mocked(getCurrentBackendUser).mockResolvedValue(usuario(["suppliers/onboarding"]) as never);
    expect((await listarCorridas(req("/api/erp/sincronizaciones"))).status).toBe(403);

    vi.mocked(getCurrentBackendUser).mockResolvedValue(usuario(["administracion/terceros-erp"], [1, 2]) as never);
    await listarCorridas(req("/api/erp/sincronizaciones?empresa=2&limit=5"));
    expect(ultimaLlamada()[0]).toBe("/api/v1/erp/sincronizaciones?empresa=2&limit=5");

    await sincronizar(req("/api/erp/sincronizaciones", { method: "POST", body: JSON.stringify({ empresa: 1, entidad: "CLIENTES", extra: true }) }));
    expect(ultimaLlamada()).toEqual([
      "/api/v1/erp/sincronizaciones",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ entidad: "CLIENTES", empresa: 1 }) }),
    ]);
    expect(
      (await sincronizar(req("/api/erp/sincronizaciones", { method: "POST", body: JSON.stringify({ empresa: 4 }) }))).status,
    ).toBe(403);
    expect(
      (await sincronizar(req("/api/erp/sincronizaciones", { method: "POST", body: JSON.stringify({ entidad: "OTRA" }) }))).status,
    ).toBe(400);
  });

  it("administración: catálogo por entidad conocida y empresa obligatoria", async () => {
    vi.mocked(getCurrentBackendUser).mockResolvedValue(usuario(["administracion/terceros-erp"]) as never);
    const params = (entidad: string) => ({ params: Promise.resolve({ entidad }) });
    expect((await listarCatalogo(req("/api/erp/catalogo/otros?empresa=1"), params("otros"))).status).toBe(404);
    expect((await listarCatalogo(req("/api/erp/catalogo/proveedores"), params("proveedores"))).status).toBe(400);
    await listarCatalogo(req("/api/erp/catalogo/proveedores?empresa=1&q=andina&page=2&pageSize=10&x=1"), params("proveedores"));
    expect(ultimaLlamada()[0]).toBe("/api/v1/erp/catalogo/proveedores?q=andina&page=2&pageSize=10&empresa=1");
  });
});
