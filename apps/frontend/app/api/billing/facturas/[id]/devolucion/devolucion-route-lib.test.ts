import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/convex/_generated/api", () => ({ api: {} }));
vi.mock("@/lib/convexServerClient", () => ({
  convexServer: { query: vi.fn() },
}));
vi.mock("@/lib/empresas", () => ({ hasGlobalEmpresaAccess: vi.fn() }));

import { fetchLideresActivosParaEmpresa } from "./devolucion-route-lib";

describe("devolucion route user lookup", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("consulta el directorio sin enviar empresaId al backend y filtra localmente", async () => {
    vi.stubEnv("BACKEND_URL", "https://backend.example");
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json([
        {
          id: 17,
          nombre: "ANA LÍDER",
          email: "ANA@EXAMPLE.COM",
          activo: 1,
          lider_proceso: 1,
          id_empresa: 7,
          procesoUsuario: { id: 42, nombre: "Operaciones" },
        },
        {
          id: "18",
          nombre: "Beatriz Global",
          email: "beatriz@example.com",
          lider_proceso: true,
          acceso_todas_empresas: true,
        },
        {
          id: 19,
          nombre: "Carlos Otra Empresa",
          email: "carlos@example.com",
          activo: true,
          lider_proceso: true,
          id_empresa: 9,
        },
        {
          id: 20,
          nombre: "Diana Inactiva",
          email: "diana@example.com",
          activo: false,
          lider_proceso: true,
          id_empresa: 7,
        },
      ])
    );
    vi.stubGlobal("fetch", fetchMock);

    const resultado = await fetchLideresActivosParaEmpresa({
      empresaId: 7,
      authorization: "Bearer token",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://backend.example/api/v1/usuarios/directorio",
      {
        headers: { Authorization: "Bearer token" },
        cache: "no-store",
      }
    );
    expect(resultado).toEqual([
      {
        usuarioId: "17",
        nombre: "ANA LÍDER",
        email: "ana@example.com",
        procesoId: 42,
        procesoNombre: "Operaciones",
      },
      {
        usuarioId: "18",
        nombre: "Beatriz Global",
        email: "beatriz@example.com",
      },
    ]);
  });
});
