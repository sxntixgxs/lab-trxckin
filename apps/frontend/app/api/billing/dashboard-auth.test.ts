import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

/**
 * Auth contract tests for Facturación dashboard API helpers.
 * These validate empresa scoping logic without hitting Convex.
 */
import { parseEmpresasParam, resolveEmpresasPermitidas } from "@/app/api/billing/empresa-scope";

describe("facturacion dashboard API auth helpers", () => {
  it("parses empresas query param", () => {
    expect(parseEmpresasParam("1,2, 3")).toEqual([1, 2, 3]);
    expect(parseEmpresasParam(null)).toEqual([]);
  });

  it("rejects unauthorized company for non-global user", () => {
    const result = resolveEmpresasPermitidas(
      {
        user: {
          id_rol: 10,
          acceso_todas_empresas: false,
          empresas: [1],
        },
      },
      [2]
    );
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error.status).toBe(403);
    }
  });

  it("allows requested companies within permitted set", () => {
    const result = resolveEmpresasPermitidas(
      {
        user: {
          id_rol: 10,
          acceso_todas_empresas: false,
          empresas: [1, 2],
        },
      },
      [1]
    );
    expect(result).toEqual([1]);
  });

  it("allows any company for global access", () => {
    const result = resolveEmpresasPermitidas(
      {
        user: {
          id_rol: 1,
          acceso_todas_empresas: true,
          empresas: [],
        },
      },
      [3, 4]
    );
    expect(result).toEqual([3, 4]);
  });
});

describe("API route smoke shape", () => {
  it("builds a NextRequest for resumen", () => {
    const req = new NextRequest(
      "http://localhost/api/billing/dashboard/resumen?empresas=1&preset=mes_actual"
    );
    expect(req.nextUrl.searchParams.get("empresas")).toBe("1");
  });
});
