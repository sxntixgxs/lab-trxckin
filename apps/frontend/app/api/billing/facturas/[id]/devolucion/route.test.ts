import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET, POST } from "./route";

vi.mock("../../../_lib", () => ({
  convexServer: {
    query: vi.fn(),
    mutation: vi.fn(),
  },
  getConvexServerSecret: () => "server-secret",
  RUTAS_SISTEMA: { FACTURACION_FACTURAS: "billing/invoices" },
  requireFacturacionSession: vi.fn(),
}));

vi.mock("./devolucion-route-lib", () => ({
  assertEmpresaAutorizada: vi.fn(),
  obtenerContextoDevolucionFactura: vi.fn(),
  resolveResponsableDevolucion: vi.fn(),
}));

vi.mock("@/lib/api-route-auth", () => ({
  requireBackendApiSession: vi.fn(),
}));

const { convexServer, requireFacturacionSession } = await import("../../../_lib");
const { requireBackendApiSession } = await import("@/lib/api-route-auth");
const { assertEmpresaAutorizada, obtenerContextoDevolucionFactura, resolveResponsableDevolucion } =
  await import("./devolucion-route-lib");

describe("facturacion facturas devolucion route", () => {
  beforeEach(() => {
    vi.mocked(requireBackendApiSession).mockResolvedValue({
      ok: true,
      session: { user: { id: "user-1" } },
      accessToken: "token",
    } as never);
    vi.mocked(requireFacturacionSession).mockResolvedValue({
      session: {
        user: {
          id: "user-1",
          nombre: "Santiago Sandoval",
          email: "user@example.com",
          empresas: [1],
        },
      },
    } as never);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("GET rechaza sesion ausente", async () => {
    vi.mocked(requireBackendApiSession).mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: "No autorizado" }), { status: 401 }),
    } as never);

    const response = await GET(new Request("http://localhost/api"), {
      params: Promise.resolve({ id: "factura-1" }),
    });

    expect(response.status).toBe(401);
  });

  it("GET rechaza sin permiso de facturas", async () => {
    vi.mocked(requireFacturacionSession).mockResolvedValue({
      error: new Response(JSON.stringify({ error: "Sin permiso" }), { status: 403 }),
    } as never);

    const response = await GET(new Request("http://localhost/api"), {
      params: Promise.resolve({ id: "factura-1" }),
    });

    expect(response.status).toBe(403);
  });

  it("GET rechaza empresa no autorizada", async () => {
    vi.mocked(obtenerContextoDevolucionFactura).mockResolvedValue({
      puedeDevolver: true,
      estadoActual: "causacion",
      empresa: 2,
      asignacionId: "asignacion-1",
      destinos: [],
    });
    vi.mocked(assertEmpresaAutorizada).mockImplementationOnce(() => {
      throw new Error("Empresa no autorizada");
    });

    const response = await GET(new Request("http://localhost/api"), {
      params: Promise.resolve({ id: "factura-1" }),
    });

    expect(response.status).toBe(403);
  });

  it("GET devuelve contexto cuando la empresa esta autorizada", async () => {
    vi.mocked(obtenerContextoDevolucionFactura).mockResolvedValue({
      puedeDevolver: true,
      estadoActual: "causacion",
      empresa: 1,
      asignacionId: "asignacion-1",
      destinos: [],
    });

    const response = await GET(new Request("http://localhost/api"), {
      params: Promise.resolve({ id: "factura-1" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      puedeDevolver: true,
      estadoActual: "causacion",
    });
    expect(assertEmpresaAutorizada).toHaveBeenCalled();
  });

  it("POST exige observacion", async () => {
    const response = await POST(
      new Request("http://localhost/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ faseDestino: "revision_lider" }),
      }),
      { params: Promise.resolve({ id: "factura-1" }) }
    );

    expect(response.status).toBe(400);
  });

  it("POST ejecuta devolucion con responsable resuelto server-side", async () => {
    vi.mocked(obtenerContextoDevolucionFactura).mockResolvedValue({
      puedeDevolver: true,
      estadoActual: "causacion",
      empresa: 1,
      asignacionId: "asignacion-1",
      destinos: [
        {
          fase: "revision_lider",
          label: "Líder",
          requiereSeleccionResponsable: true,
          candidatos: [],
          responsableHistorico: null,
        },
      ],
    });
    vi.mocked(resolveResponsableDevolucion).mockResolvedValue({
      usuarioId: "lider-1",
      nombre: "Lider",
      email: "lider@example.com",
    });

    const response = await POST(
      new Request("http://localhost/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          faseDestino: "revision_lider",
          comentario: "Devolver por inconsistencia.",
          responsableId: "lider-1",
        }),
      }),
      { params: Promise.resolve({ id: "factura-1" }) }
    );

    expect(response.status).toBe(200);
    expect(resolveResponsableDevolucion).toHaveBeenCalledWith(
      expect.objectContaining({ empresaId: 1, responsableId: "lider-1" })
    );
    expect(convexServer.mutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actorUserId: "user-1",
      })
    );
    const mutationArgs = vi.mocked(convexServer.mutation).mock.calls[0]?.[1];
    expect(mutationArgs).not.toHaveProperty("actorNombre");
    expect(mutationArgs).not.toHaveProperty("actorEmail");
  });
});
