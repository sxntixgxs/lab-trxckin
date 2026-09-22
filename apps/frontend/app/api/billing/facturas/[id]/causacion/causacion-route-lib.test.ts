import { describe, expect, it, vi } from "vitest";

vi.mock("@/convex/_generated/api", () => ({ api: {} }));
vi.mock("@/lib/convexServerClient", () => ({
  convexServer: { query: vi.fn(), mutation: vi.fn() },
}));

import type { BillingSession as Session } from "@/lib/billing-session";

import {
  mapConvexCausacionError,
  parseCausacionContexto,
  parseCausacionContextoFromBody,
  parseCausacionPatchBody,
  resolveActorFromSession,
  resolveEmpresasAutorizadas,
} from "./causacion-route-lib";

describe("causacion-route-lib", () => {
  it("parseCausacionContexto acepta flujo y reembolso", () => {
    expect(parseCausacionContexto(new URLSearchParams())).toEqual({ tipo: "flujo_factura" });
    expect(
      parseCausacionContexto(
        new URLSearchParams({
          contextoTipo: "reembolso_caja_menor",
          reembolsoId: "reembolso-1",
          movimientoId: "mov-1",
        })
      )
    ).toEqual({
      tipo: "reembolso_caja_menor",
      reembolsoId: "reembolso-1",
      movimientoId: "mov-1",
    });
  });

  it("parseCausacionPatchBody valida cuerpo mínimo", () => {
    expect(
      parseCausacionPatchBody({
        expectedVersion: 0,
        causado: true,
        numeroFp: "FP-001",
        contexto: { tipo: "flujo_factura" },
      })
    ).toEqual({
      expectedVersion: 0,
      causado: true,
      numeroFp: "FP-001",
      contexto: { tipo: "flujo_factura" },
    });
  });

  it("parseCausacionContextoFromBody rechaza contexto incompleto", () => {
    expect(() =>
      parseCausacionContextoFromBody({
        expectedVersion: 0,
        causado: true,
        contexto: { tipo: "reembolso_caja_menor" },
      })
    ).toThrow(/incompleto/);
  });

  it("resolveActorFromSession exige user.id", () => {
    expect(() =>
      resolveActorFromSession({
        user: { nombre: "Ana", email: "ana@example.com" },
      } as Session)
    ).toThrow(/identificar/);

    expect(
      resolveActorFromSession({
        user: { id: "user-1", nombre: "Ana", email: "Ana@Example.com" },
      } as Session)
    ).toEqual({
      actorUserId: "user-1",
      actorNombre: "Ana",
      actorEmail: "ana@example.com",
    });
  });

  it("resolveEmpresasAutorizadas da todas las empresas a un admin sin asignaciones", () => {
    expect(
      resolveEmpresasAutorizadas({
        user: {
          id: "admin-1",
          nombre: "Admin",
          email: "admin@example.com",
          id_rol: 1,
          empresas: [],
          acceso_todas_empresas: true,
        },
      })
    ).toEqual([1, 2, 3, 4]);
  });

  it("resolveEmpresasAutorizadas respeta el listado de un usuario sin acceso global", () => {
    expect(
      resolveEmpresasAutorizadas({
        user: {
          id: "user-2",
          nombre: "Ana",
          email: "ana@example.com",
          id_rol: 2,
          empresas: [1],
          acceso_todas_empresas: false,
        },
      })
    ).toEqual([1]);
  });

  it("mapConvexCausacionError traduce códigos estructurados", () => {
    expect(
      mapConvexCausacionError({
        data: { code: "UNPROCESSABLE", message: "No hay cambios que guardar." },
      })
    ).toEqual({ status: 422, message: "No hay cambios que guardar." });

    expect(
      mapConvexCausacionError({
        data: { code: "CONFLICT", message: "La causación cambió." },
      })
    ).toEqual({ status: 409, message: "La causación cambió." });

    expect(mapConvexCausacionError(new Error("Indica expectedVersion."))).toEqual({
      status: 400,
      message: "Indica expectedVersion.",
    });
  });
});
