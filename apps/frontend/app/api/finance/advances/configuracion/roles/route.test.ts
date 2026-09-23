import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { convexServer, requireAnticiposSession, resolveEmpresasPermitidas } from "../../_lib";
import { POST } from "./route";

vi.mock("../../_lib", () => ({
  api: { financiero: { anticipos: { configurarRol: "financiero/anticipos:configurarRol" } } },
  convexServer: { mutation: vi.fn() },
  getConvexServerSecret: () => "server-secret",
  requireAnticiposSession: vi.fn(),
  resolveEmpresasPermitidas: vi.fn(),
}));

function request(body: unknown) {
  return new NextRequest("http://localhost/api/finance/advances/configuracion/roles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const BODY = {
  empresa: 1,
  rol: "TESORERO",
  userId: "tesorero-1",
  nombre: "Tesorero",
  email: "tesorero@example.com",
};

function sesion(user: { id: string; hasFullAccess: boolean; rolId: number }) {
  return {
    session: { user: { id: user.id } },
    user: { id: user.id, hasFullAccess: user.hasFullAccess, rol: { id: user.rolId } },
  };
}

describe("POST /api/finance/advances/configuracion/roles", () => {
  beforeEach(() => {
    vi.mocked(resolveEmpresasPermitidas).mockReturnValue({ empresas: [1] } as never);
    vi.mocked(convexServer.mutation).mockResolvedValue("config-id" as never);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("passes the session caller so Convex can require an admin or the company's GERENCIA", async () => {
    vi.mocked(requireAnticiposSession).mockResolvedValue(
      sesion({ id: "gestor-1", hasFullAccess: false, rolId: 7 }) as never,
    );
    const response = await POST(request(BODY));
    expect(response.status).toBe(200);
    expect(convexServer.mutation).toHaveBeenCalledWith(
      "financiero/anticipos:configurarRol",
      expect.objectContaining({
        secret: "server-secret",
        actorUserId: "gestor-1",
        actorEsAdmin: false,
        empresa: 1,
        rol: "TESORERO",
      }),
    );
  });

  it("flags administrators (full access or role 1)", async () => {
    vi.mocked(requireAnticiposSession).mockResolvedValue(
      sesion({ id: "admin-1", hasFullAccess: false, rolId: 1 }) as never,
    );
    await POST(request(BODY));
    expect(convexServer.mutation).toHaveBeenCalledWith(
      "financiero/anticipos:configurarRol",
      expect.objectContaining({ actorUserId: "admin-1", actorEsAdmin: true }),
    );
  });

  it("answers 403 when Convex refuses the caller", async () => {
    vi.mocked(requireAnticiposSession).mockResolvedValue(
      sesion({ id: "gestor-1", hasFullAccess: false, rolId: 7 }) as never,
    );
    vi.mocked(convexServer.mutation).mockRejectedValue(
      new Error(
        "[CONVEX M(financiero/anticipos:configurarRol)] Uncaught Error: No autorizado: solo un administrador o la Gerencia configura los roles.",
      ),
    );
    const response = await POST(request(BODY));
    expect(response.status).toBe(403);
  });
});
