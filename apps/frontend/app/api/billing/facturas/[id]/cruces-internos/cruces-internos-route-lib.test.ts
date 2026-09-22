import { describe, expect, it, vi } from "vitest";

vi.mock("@/convex/_generated/api", () => ({ api: {} }));
vi.mock("@/lib/convexServerClient", () => ({
  convexServer: { query: vi.fn(), mutation: vi.fn() },
}));
vi.mock("@/lib/empresas", () => ({ hasGlobalEmpresaAccess: vi.fn() }));

import type { BillingSession as Session } from "@/lib/billing-session";
import type { Id } from "@/convex/_generated/dataModel";
import { hasGlobalEmpresaAccess } from "@/lib/empresas";
import {
  assertEmpresaAutorizada,
  resolveActorFromSession,
  validateAgregarCruceDocumentoInternoInput,
  validateEditarCruceDocumentoInternoInput,
  validateRetirarCruceDocumentoInternoInput,
} from "./cruces-internos-route-lib";

function makeSession(overrides: Partial<Session["user"]> = {}): Session {
  return {
    user: {
      id: "user-1",
      nombre: "Ana Usuario",
      email: "ana@example.com",
      id_rol: 2,
      acceso_todas_empresas: false,
      empresas: [10],
      ...overrides,
    },
    expires: "2099-01-01",
  };
}

describe("cruces internos route lib", () => {
  it("resuelve actor desde la sesión del servidor", () => {
    expect(resolveActorFromSession(makeSession())).toEqual({
      actorUserId: "user-1",
      actorNombre: "Ana Usuario",
      actorEmail: "ana@example.com",
    });
  });

  it("rechaza sesión sin identificador de usuario", () => {
    expect(() =>
      resolveActorFromSession(makeSession({ id: "" }))
    ).toThrow("No se pudo identificar al usuario de la sesión.");
  });

  it("autoriza empresa permitida en la sesión", () => {
    vi.mocked(hasGlobalEmpresaAccess).mockReturnValue(false);
    expect(() => assertEmpresaAutorizada(makeSession(), 10)).not.toThrow();
  });

  it("rechaza empresa no autorizada", () => {
    vi.mocked(hasGlobalEmpresaAccess).mockReturnValue(false);
    expect(() => assertEmpresaAutorizada(makeSession(), 99)).toThrow(
      "Empresa no autorizada"
    );
  });

  it("valida alta de documento interno", () => {
    expect(
      validateAgregarCruceDocumentoInternoInput({
        asignacionId: "asignacion-1",
        numeroDocumento: " FC-001 ",
        valorAplicado: 30,
        comentario: "Referencia interna",
      })
    ).toEqual({
      asignacionId: "asignacion-1",
      numeroDocumento: " FC-001 ",
      valorAplicado: 30,
      comentario: "Referencia interna",
    });
  });

  it("rechaza alta sin número o valor", () => {
    expect(() =>
      validateAgregarCruceDocumentoInternoInput({
        asignacionId: "asignacion-1",
        valorAplicado: 10,
      })
    ).toThrow("Indica el número de factura o cuenta de cobro.");
    expect(() =>
      validateAgregarCruceDocumentoInternoInput({
        asignacionId: "asignacion-1",
        numeroDocumento: "FC-001",
      })
    ).toThrow("Indica un valor aplicado válido.");
  });

  it("valida edición con versión esperada", () => {
    expect(
      validateEditarCruceDocumentoInternoInput({
        asignacionId: "asignacion-1",
        cruceId: "cruce-1",
        expectedActualizadoEn: 123,
        numeroDocumento: "FC-002",
        valorAplicado: 25,
      })
    ).toMatchObject({
      cruceId: "cruce-1" as Id<"facturacionCrucesDocumentosInternos">,
      expectedActualizadoEn: 123,
      valorAplicado: 25,
    });
  });

  it("valida retiro con versión esperada", () => {
    expect(
      validateRetirarCruceDocumentoInternoInput({
        asignacionId: "asignacion-1",
        cruceId: "cruce-1",
        expectedActualizadoEn: 456,
        comentario: "Duplicado",
      })
    ).toEqual({
      asignacionId: "asignacion-1",
      cruceId: "cruce-1",
      expectedActualizadoEn: 456,
      comentario: "Duplicado",
    });
  });
});
