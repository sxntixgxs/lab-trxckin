import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { requireBackendApiSession } from "@/lib/api-route-auth";

import { convexServer, requireFacturacionSession } from "../_lib";
import { POST } from "./route";

vi.mock("../_lib", () => ({
  convexServer: {
    mutation: vi.fn(),
  },
  getConvexServerSecret: () => "server-secret",
  RUTAS_SISTEMA: { FACTURACION_BUZON: "billing/inbox" },
  requireFacturacionSession: vi.fn(),
}));

vi.mock("@/lib/api-route-auth", () => ({
  requireBackendApiSession: vi.fn(),
}));

const baseBody = {
  empresa: 1,
  numeroFactura: "FAC-001",
  proveedorNit: "900123456",
  proveedorNombre: "Proveedor",
  fechaEmision: "2026-06-01",
  subtotal: 100000,
  impuestos: 19000,
  moneda: "COP",
  descripcion: "Servicio",
  categoria: "administracion",
  soporteStorageId: "storage-1",
  soporteNombre: "soporte.pdf",
};

describe("POST /api/billing/documentos-fisicos", () => {
  beforeEach(() => {
    vi.mocked(requireBackendApiSession).mockResolvedValue({
      ok: true,
      session: { user: { id: "user-1" } },
      accessToken: "token",
    } as never);
    vi.mocked(requireFacturacionSession).mockResolvedValue({
      session: {
        user: {
          id: "lider-1",
          nombre: "Líder",
          email: "lider@example.com",
          empresas: [1],
          lider_proceso: true,
          id_proceso: 10,
          proceso: { id: 10, nombre: "Proceso A" },
        },
      },
    } as never);
    vi.mocked(convexServer.mutation).mockResolvedValue({
      facturaId: "factura-1",
      tareaId: "tarea-1",
      asignacionId: "asignacion-1",
      estado: "revision_lider",
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("rechaza sesión ausente", async () => {
    vi.mocked(requireBackendApiSession).mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: "No autenticado" }), {
        status: 401,
      }),
    } as never);

    const response = await POST(
      new Request("http://localhost/api/billing/documentos-fisicos", {
        method: "POST",
        body: JSON.stringify(baseBody),
      }) as never,
    );
    expect(response).toBeDefined();

    expect(response!.status).toBe(401);
  });

  it("rechaza usuarios que no son líderes de proceso", async () => {
    vi.mocked(requireFacturacionSession).mockResolvedValue({
      session: {
        user: {
          id: "user-1",
          nombre: "Usuario",
          email: "user@example.com",
          empresas: [1],
          lider_proceso: false,
        },
      },
    } as never);

    const response = await POST(
      new Request("http://localhost/api/billing/documentos-fisicos", {
        method: "POST",
        body: JSON.stringify(baseBody),
      }) as never,
    );
    expect(response).toBeDefined();

    expect(response!.status).toBe(403);
    expect(convexServer.mutation).not.toHaveBeenCalled();
  });

  it("rechaza campos de actor en el cuerpo", async () => {
    const response = await POST(
      new Request("http://localhost/api/billing/documentos-fisicos", {
        method: "POST",
        body: JSON.stringify({
          ...baseBody,
          actorUserId: "otro-usuario",
        }),
      }) as never,
    );
    expect(response).toBeDefined();

    expect(response!.status).toBe(400);
    expect(convexServer.mutation).not.toHaveBeenCalled();
  });

  it("crea el documento físico con actor derivado de la sesión", async () => {
    const response = await POST(
      new Request("http://localhost/api/billing/documentos-fisicos", {
        method: "POST",
        body: JSON.stringify(baseBody),
      }) as never,
    );
    expect(response).toBeDefined();

    expect(response!.status).toBe(200);
    expect(convexServer.mutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        secret: "server-secret",
        actorUserId: "lider-1",
        actorNombre: "Líder",
        actorEmail: "lider@example.com",
        actorProcesoId: 10,
        actorProcesoNombre: "Proceso A",
        numeroFactura: "FAC-001",
      }),
    );
  });
});
