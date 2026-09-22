import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { requireBackendApiSession } from "@/lib/api-route-auth";

import { requireFacturacionSession } from "../../_lib";
import {
  assertActorEnGerenciaEmpresa,
  assertEmpresaAutorizada,
  obtenerAsignacionParaRuta,
} from "./asignar-fase-usuario-route-lib";
import { POST } from "./route";

vi.mock("../../_lib", () => ({
  convexServer: {
    mutation: vi.fn(),
  },
  getConvexServerSecret: () => "server-secret",
  RUTAS_SISTEMA: { FACTURACION_BUZON: "billing/inbox" },
  requireFacturacionSession: vi.fn(),
}));

vi.mock("./asignar-fase-usuario-route-lib", () => ({
  assertActorEnGerenciaEmpresa: vi.fn(),
  assertEmpresaAutorizada: vi.fn(),
  obtenerAsignacionParaRuta: vi.fn(),
  resolveAssigneeForGerenciaTarget: vi.fn(),
  parseGerenciaPhaseTarget: (value: unknown) => {
    const valid = new Set([
      "recepcion",
      "revision_lider",
      "causacion",
      "revision_impuestos",
      "eventos_dian",
      "gerencia",
      "revision_tesoreria",
    ]);
    return typeof value === "string" && valid.has(value) ? value : null;
  },
}));

vi.mock("@/lib/api-route-auth", () => ({
  requireBackendApiSession: vi.fn(),
}));

describe("POST /api/billing/buzon/asignar-fase-usuario", () => {
  beforeEach(() => {
    vi.mocked(requireBackendApiSession).mockResolvedValue({
      ok: true,
      session: { user: { id: "user-1" } },
      accessToken: "token",
    } as never);
    vi.mocked(requireFacturacionSession).mockResolvedValue({
      session: {
        user: {
          id: "actor-1",
          nombre: "Actor",
          email: "actor@example.com",
          empresas: [1],
        },
      },
    } as never);
    vi.mocked(obtenerAsignacionParaRuta).mockResolvedValue({
      empresa: 1,
      estado: "gerencia",
      fase: "gerencia",
      asignadoAUserId: "gerente-a",
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

    const response = await POST({
      json: async () => ({ assignments: [] }),
    } as never);

    expect(response).toBeDefined();
    expect(response!.status).toBe(401);
  });

  it("rechaza actor no configurado en gerencia", async () => {
    vi.mocked(assertEmpresaAutorizada).mockImplementation(() => undefined);
    vi.mocked(assertActorEnGerenciaEmpresa).mockRejectedValue(
      new Error("No tienes permisos de Gerencia para esta empresa."),
    );

    const response = await POST({
      json: async () => ({
        assignments: [
          {
            assignmentId: "asignacion-1",
            targetStage: "causacion",
            assigneeId: "analista-1",
            observation: "Observación obligatoria.",
          },
        ],
      }),
    } as never);

    expect(response).toBeDefined();
    expect(response!.status).toBe(403);
    expect(await response!.json()).toEqual({
      error: "No tienes permisos de Gerencia para esta empresa.",
    });
  });
});
