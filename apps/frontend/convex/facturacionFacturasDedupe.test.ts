/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");

function makeTest() {
  return convexTest(schema, modules);
}

const baseFactura = {
  empresa: 1,
  numeroFactura: "FE-123",
  tipoDocumento: "01",
  proveedorNit: "900111222",
  proveedorNombre: "Proveedor Uno",
  fechaEmision: "2026-07-01",
  subtotal: 100,
  impuestos: 19,
  total: 119,
  moneda: "COP",
  descripcion: "Servicio de prueba",
  origen: "correo" as const,
};

describe("crearDesdeXml dedupe", () => {
  test("mismo CUFE => reimporta sobre la misma factura aunque cambie el número", async () => {
    const t = makeTest();
    const primera = await t.mutation(internal.facturacionFacturas.crearDesdeXml, {
      ...baseFactura,
      cufe: "CUFE-AAA",
    });
    const segunda = await t.mutation(internal.facturacionFacturas.crearDesdeXml, {
      ...baseFactura,
      numeroFactura: "FE-123-REENVIO",
      cufe: "CUFE-AAA",
      total: 120,
    });
    expect(segunda).toBe(primera);
  });

  test("mismo número y mismo proveedor => misma factura", async () => {
    const t = makeTest();
    const primera = await t.mutation(
      internal.facturacionFacturas.crearDesdeXml,
      baseFactura
    );
    const segunda = await t.mutation(
      internal.facturacionFacturas.crearDesdeXml,
      { ...baseFactura, total: 150 }
    );
    expect(segunda).toBe(primera);
  });

  test("mismo número pero proveedor distinto => facturas separadas", async () => {
    const t = makeTest();
    const primera = await t.mutation(
      internal.facturacionFacturas.crearDesdeXml,
      baseFactura
    );
    const segunda = await t.mutation(internal.facturacionFacturas.crearDesdeXml, {
      ...baseFactura,
      proveedorNit: "800999888",
      proveedorNombre: "Proveedor Dos",
    });
    expect(segunda).not.toBe(primera);
  });

  test("empresas distintas no colisionan por número", async () => {
    const t = makeTest();
    const primera = await t.mutation(
      internal.facturacionFacturas.crearDesdeXml,
      baseFactura
    );
    const segunda = await t.mutation(internal.facturacionFacturas.crearDesdeXml, {
      ...baseFactura,
      empresa: 2,
    });
    expect(segunda).not.toBe(primera);
  });

  test("backfill normaliza filas legacy y habilita el dedupe por índice", async () => {
    const t = makeTest();

    // Fila legacy sin campos normalizados (creada antes del cambio).
    const legacyId = await t.run(async (ctx) => {
      return await ctx.db.insert("facturacionFacturas", {
        empresa: 1,
        numeroFactura: "FE-123",
        tipoDocumento: "01",
        proveedorNit: "900111222",
        proveedorNombre: "Proveedor Uno",
        fechaEmision: "2026-06-01",
        subtotal: 100,
        impuestos: 19,
        total: 119,
        moneda: "COP",
        descripcion: "Legacy",
        origen: "correo",
        creadoEn: Date.now(),
        actualizadoEn: Date.now(),
      });
    });

    await t.mutation(internal.facturacionFacturas.backfillNormalizados, {});
    await t.finishAllScheduledFunctions(() => {});

    const legacy = await t.run(async (ctx) => ctx.db.get("facturacionFacturas", legacyId));
    expect(legacy?.numeroFacturaNormalizado).toBeTruthy();
    expect(legacy?.proveedorNitNormalizado).toBeTruthy();

    const reimportada = await t.mutation(
      internal.facturacionFacturas.crearDesdeXml,
      baseFactura
    );
    expect(reimportada).toBe(legacyId);
  });
});
