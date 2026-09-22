/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");

const EMPRESA = 1;
const NOW = 1_779_840_000_000;
const SECRET = "convex-test-secret";

function makeTest() {
  process.env.CONVEX_SERVER_SECRET = SECRET;
  return convexTest(schema, modules);
}

function normalizeDocNumber(value: string) {
  return value.replace(/[^a-z0-9]/gi, "").toUpperCase();
}

function normalizeNit(value: string) {
  return value.replace(/\D/g, "");
}

async function insertDoc(
  t: ReturnType<typeof makeTest>,
  args: {
    numero: string;
    documentoClase?: "factura" | "nota_credito";
    total?: number;
    valorContable?: number;
    referenciaDocumento?: string;
    facturaRelacionadaId?: Id<"facturacionFacturas">;
    relacionDocumentoOrigen?: "dian" | "manual";
    esPeaje?: boolean;
    fechaEmision?: string;
    proveedorNit?: string;
    moneda?: string;
  }
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("facturacionFacturas", {
      empresa: EMPRESA,
      numeroFactura: args.numero,
      tipoDocumento: args.documentoClase === "nota_credito" ? "91" : "01",
      tipoDocumentoNormalizado:
        args.documentoClase === "nota_credito" ? "91" : "01",
      documentoClase: args.documentoClase ?? "factura",
      proveedorNit: args.proveedorNit ?? "900123456",
      proveedorNitNormalizado: normalizeNit(args.proveedorNit ?? "900123456"),
      numeroFacturaNormalizado: normalizeDocNumber(args.numero),
      proveedorNombre: "Proveedor Uno",
      fechaEmision: args.fechaEmision ?? "2026-06-01",
      subtotal: args.total ?? 100_000,
      impuestos: 0,
      total: args.total ?? 100_000,
      valorContable: args.valorContable,
      moneda: args.moneda ?? "COP",
      descripcion: "Documento de prueba",
      origen: "carga_manual",
      ...(args.referenciaDocumento
        ? {
            referenciaDocumento: args.referenciaDocumento,
            referenciaDocumentoNormalizado: normalizeDocNumber(
              args.referenciaDocumento
            ),
          }
        : {}),
      ...(args.facturaRelacionadaId
        ? {
            facturaRelacionadaId: args.facturaRelacionadaId,
            relacionDocumentoOrigen: args.relacionDocumentoOrigen ?? "manual",
          }
        : {}),
      ...(args.esPeaje ? { esPeaje: true, rolOperacion: "PEAJES" as const } : {}),
      creadoEn: NOW,
      actualizadoEn: NOW,
    })
  );
}

describe("facturacionNotaCreditoRelacion", () => {
  test("explicit facturaRelacionadaId takes precedence over XML reference", async () => {
    const t = makeTest();
    const facturaA = await insertDoc(t, { numero: "FE-A", total: 100_000 });
    const facturaB = await insertDoc(t, { numero: "FE-B", total: 100_000 });
    const nota = await insertDoc(t, {
      numero: "NC-1",
      documentoClase: "nota_credito",
      total: 10_000,
      referenciaDocumento: "FE-A",
      facturaRelacionadaId: facturaB,
      relacionDocumentoOrigen: "manual",
    });

    const detalle = await t.query(api.facturacionFacturas.getWithTarea, {
      id: nota,
    });
    expect(detalle?.notaCreditoRelacion?.facturaOrigen?._id).toBe(facturaB);

    const detalleA = await t.query(api.facturacionFacturas.getWithTarea, {
      id: facturaA,
    });
    const notasEnA = detalleA?.notaCreditoRelacion?.notasCredito ?? [];
    expect(notasEnA.some((n: { _id: string }) => n._id === nota)).toBe(false);
  });

  test("reassignment writes history, patches manual fields, preserves XML refs", async () => {
    const t = makeTest();
    const facturaA = await insertDoc(t, { numero: "FE-A", total: 100_000 });
    const facturaB = await insertDoc(t, {
      numero: "FE-B",
      total: 100_000,
      fechaEmision: "2026-05-01",
    });
    const nota = await insertDoc(t, {
      numero: "NC-1",
      documentoClase: "nota_credito",
      total: 10_000,
      referenciaDocumento: "FE-A",
      facturaRelacionadaId: facturaA,
      relacionDocumentoOrigen: "dian",
    });

    const result = await t.mutation(
      api.facturacionNotaCreditoRelacion.reasignarNotaCreditoDesdeServidor,
      {
        secret: SECRET,
        notaCreditoId: nota,
        facturaNuevaId: facturaB,
        facturaAnteriorEfectivaEsperadaId: facturaA,
        origenRelacionAnteriorEsperado: "dian",
        motivo: "Corrección de relación para conciliación",
        contexto: { tipo: "detalle_factura" },
        actorNombre: "Tester",
        actorEmail: "tester@example.com",
        actorUserId: "u-1",
      }
    );

    expect(result.facturaNuevaId).toBe(String(facturaB));

    const notaAfter = await t.run(async (ctx) => ctx.db.get("facturacionFacturas", nota));
    expect(notaAfter?.facturaRelacionadaId).toBe(facturaB);
    expect(notaAfter?.relacionDocumentoOrigen).toBe("manual");
    expect(notaAfter?.referenciaDocumento).toBe("FE-A");
    expect(notaAfter?.referenciaDocumentoNormalizado).toBe("FEA");

    const historial = await t.query(
      api.facturacionNotaCreditoRelacion.listarHistorialRelacionDocumento,
      { facturaId: nota }
    );
    expect(historial).toHaveLength(1);
    expect(historial[0]?.facturaNuevaNumero).toBe("FE-B");
    expect(historial[0]?.motivo).toBe(
      "Corrección de relación para conciliación"
    );
  });

  test("rejects stale expected relationship with conflict", async () => {
    const t = makeTest();
    const facturaA = await insertDoc(t, { numero: "FE-A", total: 100_000 });
    const facturaB = await insertDoc(t, {
      numero: "FE-B",
      total: 100_000,
      fechaEmision: "2026-05-01",
    });
    const nota = await insertDoc(t, {
      numero: "NC-1",
      documentoClase: "nota_credito",
      total: 10_000,
      facturaRelacionadaId: facturaA,
      relacionDocumentoOrigen: "manual",
    });

    await expect(
      t.mutation(
        api.facturacionNotaCreditoRelacion.reasignarNotaCreditoDesdeServidor,
        {
          secret: SECRET,
          notaCreditoId: nota,
          facturaNuevaId: facturaB,
          facturaAnteriorEfectivaEsperadaId: null,
          origenRelacionAnteriorEsperado: "sin_relacion",
          motivo: "Intento concurrente",
          contexto: { tipo: "detalle_factura" },
          actorNombre: "Tester",
          actorEmail: "tester@example.com",
        }
      )
    ).rejects.toThrow(/CONFLICTO_RELACION/);
  });
});
