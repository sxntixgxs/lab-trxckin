/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");

const SECRET = "test-mcp-read-secret";
const EMPRESA = 2;

async function sembrado() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.mcp.demo.sembrar, { empresa: EMPRESA });
  return t;
}

describe("MCP read queries", () => {
  beforeEach(() => {
    vi.stubEnv("MCP_READ_SECRET", SECRET);
    vi.stubEnv("MCP_EMPRESAS", String(EMPRESA));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("reject a missing, wrong or server secret", async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.mcp.lectura.empresas, { secret: "" })).rejects.toThrow("No autorizado");
    await expect(t.query(api.mcp.lectura.empresas, { secret: "otro" })).rejects.toThrow("No autorizado");
    await expect(
      t.query(api.mcp.lectura.empresas, { secret: "test-convex-server-secret" })
    ).rejects.toThrow("No autorizado");
  });

  test("fail closed when MCP_READ_SECRET is unset", async () => {
    vi.stubEnv("MCP_READ_SECRET", "");
    const t = convexTest(schema, modules);
    await expect(t.query(api.mcp.lectura.empresas, { secret: SECRET })).rejects.toThrow("No autorizado");
  });

  test("list only the companies in MCP_EMPRESAS", async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(api.mcp.lectura.empresas, { secret: SECRET })).toEqual([
      { id: 2, nombre: "Cordillera Minería S.A.S.", nit: "900000002" },
    ]);
  });

  test("pending approvals: oldest in phase first, closed and out-of-scope invoices left out", async () => {
    const t = await sembrado();
    const { facturas, empresa, hayMas } = await t.query(api.mcp.lectura.aprobacionesPendientes, {
      secret: SECRET,
      nowMs: Date.now(),
      proveedor: "acme",
    });

    expect(empresa).toBe(EMPRESA);
    expect(hayMas).toBe(false);
    expect(facturas.map((f) => f.numeroFactura)).toEqual(["DRM-1041", "DRM-1063", "DRM-1066", "DRM-1052", "DRM-1060"]);
    expect(facturas[0]).toMatchObject({
      fase: "revision_lider",
      responsables: [{ nombre: "Santiago Sandoval", email: "santiago.sandoval@example.com", rol: "lider" }],
      sla: { estado: "breached", umbralDiasLaborales: 3 },
    });
    expect(facturas[0].sla!.diasLaboralesRestantes).toBeLessThan(0);
    expect(facturas.find((f) => f.numeroFactura === "DRM-1060")!.sla!.estado).toBe("healthy");
  });

  test("pending approvals filter by owner and refuse other companies", async () => {
    const t = await sembrado();
    const { facturas } = await t.query(api.mcp.lectura.aprobacionesPendientes, {
      secret: SECRET,
      nowMs: Date.now(),
      responsable: "camila.rojas@example.com",
    });
    expect(facturas.map((f) => f.numeroFactura)).toEqual(["DRM-1063"]);

    await expect(
      t.query(api.mcp.lectura.aprobacionesPendientes, { secret: SECRET, nowMs: Date.now(), empresa: 3 })
    ).rejects.toThrow("fuera del alcance");
  });

  test("invoice status by number and NIT; out-of-scope invoices read as not found", async () => {
    const t = await sembrado();
    const { facturas } = await t.query(api.mcp.lectura.estadoFactura, {
      secret: SECRET,
      nowMs: Date.now(),
      numeroFactura: "drm 1063",
      proveedorNit: "901.555.222",
    });
    expect(facturas).toHaveLength(1);
    expect(facturas[0]).toMatchObject({
      numeroFactura: "DRM-1063",
      proveedor: { nit: "901555222", nombre: "ACME Logistics S.A.S." },
      faseEtiqueta: "Tesorería",
      activa: true,
    });

    const conDv = await t.query(api.mcp.lectura.estadoFactura, {
      secret: SECRET,
      nowMs: Date.now(),
      numeroFactura: "DRM-1063",
      proveedorNit: "901.555.222-8",
    });
    expect(conDv.facturas.map((f) => f.numeroFactura)).toEqual(["DRM-1063"]);

    const otroProveedor = await t.query(api.mcp.lectura.estadoFactura, {
      secret: SECRET,
      nowMs: Date.now(),
      numeroFactura: "DRM-1063",
      proveedorNit: "900777111",
    });
    expect(otroProveedor.facturas).toEqual([]);

    const cerrada = await t.query(api.mcp.lectura.estadoFactura, {
      secret: SECRET,
      nowMs: Date.now(),
      numeroFactura: "DRM-1070",
    });
    expect(cerrada.facturas[0]).toMatchObject({ fase: "cerrada", activa: false, sla: null, responsables: [] });

    const otraEmpresa = await t.query(api.mcp.lectura.estadoFactura, {
      secret: SECRET,
      nowMs: Date.now(),
      numeroFactura: "DRM-2001",
    });
    expect(otraEmpresa.facturas).toEqual([]);

    const idAjeno = await t.run(async (ctx) => {
      const factura = await ctx.db
        .query("facturacionFacturas")
        .withIndex("by_empresa", (q) => q.eq("empresa", 3))
        .first();
      return factura!._id;
    });
    const porId = await t.query(api.mcp.lectura.estadoFactura, {
      secret: SECRET,
      nowMs: Date.now(),
      facturaId: idAjeno,
    });
    expect(porId.facturas).toEqual([]);
  });

  test("advance balances by requester, with overdue settlement flagged", async () => {
    const t = await sembrado();
    const { anticipos, totalPendiente } = await t.query(api.mcp.lectura.saldoAnticipos, {
      secret: SECRET,
      nowMs: Date.now(),
      solicitanteEmail: "Mateo.Castano@example.com",
    });
    expect(anticipos).toHaveLength(2);
    expect(totalPendiente).toBe(3_000_000);
    const [reciente, parcial] = anticipos;
    expect(reciente).toMatchObject({ valorSolicitado: 1_200_000, legalizado: 0, pendiente: 1_200_000, legalizacionVencida: true });
    expect(parcial).toMatchObject({ valorSolicitado: 5_000_000, legalizado: 3_200_000, pendiente: 1_800_000, legalizacionVencida: false });
  });

  test("seeding is idempotent and limpiar removes only seeded rows", async () => {
    const t = await sembrado();
    expect(await t.mutation(internal.mcp.demo.sembrar, { empresa: EMPRESA })).toMatchObject({ sembrada: false });

    const borrado = await t.mutation(internal.mcp.demo.limpiar, {});
    expect(borrado).toEqual({ facturas: 11, anticipos: 3, umbrales: 16 });
    const restantes = await t.run(async (ctx) => ({
      facturas: (await ctx.db.query("facturacionFacturas").take(1)).length,
      items: (await ctx.db.query("facturacionDashboardItems").take(1)).length,
      anticipos: (await ctx.db.query("anticiposDashboardItems").take(1)).length,
    }));
    expect(restantes).toEqual({ facturas: 0, items: 0, anticipos: 0 });
  });
});
