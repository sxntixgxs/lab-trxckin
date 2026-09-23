/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { actingAsActorArgs } from "../test-utils/convexActingAs";
import { asUser } from "../test-utils/onboardingActors";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");

const SECRET = "test-server-secret";
process.env.CONVEX_SERVER_SECRET = SECRET;

const EMPRESA = 1;
const NOW = 1_779_840_000_000;
const ACTOR = {
  actorUserId: "responsable-1",
  actorNombre: "Responsable",
  actorEmail: "responsable@example.com",
};

function makeTest() {
  // Workflow mutations run as their actorUserId (the assignee seeded below).
  return actingAsActorArgs(convexTest(schema, modules));
}

async function seedFacturaConAsignacion(
  t: ReturnType<typeof makeTest>,
  args: { valorContable?: number; esAnticipo?: boolean } = {}
) {
  return await t.run(async (ctx) => {
    const facturaId = await ctx.db.insert("facturacionFacturas", {
      empresa: EMPRESA,
      numeroFactura: "FAC-CRU-1",
      tipoDocumento: "01",
      tipoDocumentoNormalizado: "01",
      documentoClase: "factura",
      proveedorNit: "900123456",
      proveedorNitNormalizado: "900123456",
      numeroFacturaNormalizado: "FACCRU1",
      proveedorNombre: "Proveedor Test",
      fechaEmision: "2026-06-01",
      subtotal: args.valorContable ?? 100,
      impuestos: 0,
      total: args.valorContable ?? 100,
      valorContable: args.valorContable ?? 100,
      esLegalizacionAnticipo: args.esAnticipo ?? false,
      moneda: "COP",
      descripcion: "Factura cruce interno",
      origen: "carga_manual",
      creadoEn: NOW,
      actualizadoEn: NOW,
    });

    const tareaId = await ctx.db.insert("facturacionTareas", {
      facturaId,
      empresa: EMPRESA,
      estado: "causacion",
      categoria: "administracion",
      asignadoAUserId: ACTOR.actorUserId,
      asignadoANombre: ACTOR.actorNombre,
      asignadoAEmail: ACTOR.actorEmail,
      liderProcesoNombre: ACTOR.actorNombre,
      liderProcesoEmail: ACTOR.actorEmail,
      creadoEn: NOW,
      actualizadoEn: NOW,
    });

    const asignacionId = await ctx.db.insert("facturacionAsignaciones", {
      facturaId,
      tareaId,
      empresa: EMPRESA,
      fase: "causacion",
      estado: "pendiente",
      rol: "analista_causacion",
      grupoId: `causacion:${String(facturaId)}:${String(tareaId)}`,
      asignadoAUserId: ACTOR.actorUserId,
      asignadoANombre: ACTOR.actorNombre,
      asignadoAEmail: ACTOR.actorEmail,
      fechaAsignacion: NOW,
      creadoEn: NOW,
      actualizadoEn: NOW,
    });

    await ctx.db.patch("facturacionTareas", tareaId, { currentAsignacionId: asignacionId });

    return { facturaId, tareaId, asignacionId };
  });
}

describe("facturacionCrucesDocumentosInternos integrated case", () => {
  test("recalcula valor a pagar al cambiar el valor contable", async () => {
    const t = makeTest();
    const { facturaId, asignacionId } = await seedFacturaConAsignacion(t, {
      valorContable: 4_652_900,
    });

    await t.mutation(
      api.facturacionCrucesDocumentosInternos.agregarCruceDocumentoInternoDesdeServidor,
      {
        secret: SECRET,
        facturaId,
        asignacionId,
        numeroDocumento: "FEP33331",
        valorAplicado: 4_620_000,
        ...ACTOR,
      }
    );

    let factura = await t.run((ctx) => ctx.db.get("facturacionFacturas", facturaId));
    expect(factura?.valorAPagar).toBe(32_900);

    await t.mutation(api.facturacionTareas.guardarValorContableFactura, {
      asignacionId,
      valorContableNuevo: 4_632_000,
      comentario: "Ajuste del valor contable en causación",
      ...ACTOR,
    });

    factura = await t.run((ctx) => ctx.db.get("facturacionFacturas", facturaId));
    expect(factura?.valorContable).toBe(4_632_000);
    expect(factura?.valorCrucesDocumentosInternos).toBe(4_620_000);
    expect(factura?.valorAPagar).toBe(12_000);
  });

  test("acepta los metadatos que Convex agrega al resultado paginado", async () => {
    const t = makeTest();
    const { facturaId, asignacionId } = await seedFacturaConAsignacion(t);

    await t.mutation(
      api.facturacionCrucesDocumentosInternos.agregarCruceDocumentoInternoDesdeServidor,
      {
        secret: SECRET,
        facturaId,
        asignacionId,
        numeroDocumento: "INT-PAGINADO",
        valorAplicado: 25,
        ...ACTOR,
      }
    );

    const result = await t.query(
      api.facturacionCrucesDocumentosInternos.obtenerResumenCrucesInternosDesdeServidor,
      {
        secret: SECRET,
        facturaId,
        asignacionId,
        actorUserId: ACTOR.actorUserId,
        actorEmail: ACTOR.actorEmail,
        paginationOpts: { numItems: 50, cursor: null },
      }
    );

    expect(result.documentos.page).toHaveLength(1);
    expect(result.documentos.page[0]?.numeroDocumento).toBe("INT-PAGINADO");
    expect(result.documentos.page[0]?._creationTime).toEqual(expect.any(Number));
    expect(result.documentos.isDone).toBe(true);
    expect(result.documentos.continueCursor).toEqual(expect.any(String));
    expect(result.totales).toEqual({ cantidad: 1, valorAplicado: 25 });

    // Invoice detail sections: read as the invoice's assignee.
    const responsable = await asUser(t, { id: ACTOR.actorUserId, email: ACTOR.actorEmail });
    const activos = (await responsable.query(
      api.facturacionCrucesDocumentosInternos.listarCrucesInternosActivosPorFactura,
      {
        facturaId,
        paginationOpts: { numItems: 50, cursor: null },
      }
    )) as { page: Array<{ numeroDocumento: string }> };
    expect(activos.page).toHaveLength(1);
    expect(activos.page[0]?.numeroDocumento).toBe("INT-PAGINADO");

    const historial = (await responsable.query(
      api.facturacionCrucesDocumentosInternos.listarHistorialCrucesInternosFactura,
      {
        facturaId,
        paginationOpts: { numItems: 50, cursor: null },
      }
    )) as { page: Array<{ accion: string }> };
    expect(historial.page).toHaveLength(1);
    expect(historial.page[0]?.accion).toBe("agregar_cruce_documento_interno");
  });

  test("flujo obligatorio con documentos, anticipos y retiro", async () => {
    const t = makeTest();
    const { facturaId, asignacionId } = await seedFacturaConAsignacion(t, {
      valorContable: 100,
      esAnticipo: true,
    });

    await t.mutation(
      api.facturacionCrucesDocumentosInternos.agregarCruceDocumentoInternoDesdeServidor,
      {
        secret: SECRET,
        facturaId,
        asignacionId,
        numeroDocumento: "INT-30",
        valorAplicado: 30,
        ...ACTOR,
      }
    );
    await t.mutation(
      api.facturacionCrucesDocumentosInternos.agregarCruceDocumentoInternoDesdeServidor,
      {
        secret: SECRET,
        facturaId,
        asignacionId,
        numeroDocumento: "INT-20",
        valorAplicado: 20,
        ...ACTOR,
      }
    );

    let factura = await t.run((ctx) => ctx.db.get("facturacionFacturas", facturaId));
    expect(factura?.valorCrucesDocumentosInternos).toBe(50);
    expect(factura?.valorAPagar).toBe(50);

    const anticipoId = await t.run(async (ctx) => {
      const bolsaId = await ctx.db.insert("bolsasAnticipos", {
        empresa: EMPRESA,
        tipoBolsa: "general",
        procesoKey: "operaciones",
        procesoNombre: "Operaciones",
        estado: "activa",
        creadoEn: NOW,
        actualizadoEn: NOW,
      });
      await ctx.db.patch("facturacionFacturas", facturaId, {
        esLegalizacionAnticipo: true,
        anticipoBolsaId: bolsaId,
        anticipoProcesoNombre: "Operaciones",
        anticipoLiderNombre: "Lider",
        anticipoLiderEmail: "lider@example.com",
      });
      return await ctx.db.insert("anticipos", {
        empresa: EMPRESA,
        empresa_id: EMPRESA,
        bolsaId,
        consecutivo: 1,
        razonSocial: "Proveedor Test",
        nit: "900123456",
        formaPago: "TRANSFERENCIA PAGO ELECTRÓNICO",
        tipoBolsa: "general",
        valorNumerico: 40,
        valorContable: 40,
        valorLetra: "CUARENTA PESOS",
        saldoLegalizado: 0,
        maxLegalizacionDate: NOW + 86_400_000,
        soportesSolicitud: [],
        cubreFacturaCompleta: true,
        faseActual: "V_PENDIENTE_LEGALIZACION",
        legalizacion: [],
        createdById: ACTOR.actorUserId,
        responsableUserId: ACTOR.actorUserId,
        createdAt: NOW,
        updatedAt: NOW,
      });
    });

    await t.mutation(api.facturacionTareas.guardarCruceAnticipoDesdeServidor, {
      secret: SECRET,
      facturaId,
      asignacionId,
      anticipoIds: [anticipoId],
      expectedBolsaId: (await t.run((ctx) => ctx.db.get("facturacionFacturas", facturaId)))!.anticipoBolsaId!,
      ...ACTOR,
    });

    factura = await t.run((ctx) => ctx.db.get("facturacionFacturas", facturaId));
    expect(factura?.valorAPagar).toBe(10);

    await t.mutation(
      api.facturacionCrucesDocumentosInternos.agregarCruceDocumentoInternoDesdeServidor,
      {
        secret: SECRET,
        facturaId,
        asignacionId,
        numeroDocumento: "INT-10",
        valorAplicado: 10,
        ...ACTOR,
      }
    );

    factura = await t.run((ctx) => ctx.db.get("facturacionFacturas", facturaId));
    expect(factura?.valorAPagar).toBe(0);

    const doc20 = await t.run(async (ctx) => {
      const rows = await ctx.db
        .query("facturacionCrucesDocumentosInternos")
        .withIndex("by_facturaId_estado", (q) =>
          q.eq("facturaId", facturaId).eq("estado", "activo")
        )
        .collect();
      return rows.find((row) => row.numeroDocumento === "INT-20");
    });
    expect(doc20).toBeTruthy();

    await t.mutation(
      api.facturacionCrucesDocumentosInternos.retirarCruceDocumentoInternoDesdeServidor,
      {
        secret: SECRET,
        facturaId,
        asignacionId,
        cruceId: doc20!._id,
        expectedActualizadoEn: doc20!.actualizadoEn,
        ...ACTOR,
      }
    );

    factura = await t.run((ctx) => ctx.db.get("facturacionFacturas", facturaId));
    expect(factura?.valorCrucesDocumentosInternos).toBe(40);
    expect(factura?.valorAPagar).toBe(20);

    await t.mutation(api.facturacionTareas.guardarValorContableFactura, {
      asignacionId,
      valorContableNuevo: 70,
      comentario: "Reducir obligación y recalcular el anticipo",
      ...ACTOR,
    });

    factura = await t.run((ctx) => ctx.db.get("facturacionFacturas", facturaId));
    expect(factura?.valorContable).toBe(70);
    expect(factura?.valorAPagar).toBe(0);

    const legalizacionesActivas = await t.run((ctx) =>
      ctx.db
        .query("facturacionAnticipoLegalizaciones")
        .withIndex("by_facturaId_estado", (q) =>
          q.eq("facturaId", facturaId).eq("estado", "activa")
        )
        .collect()
    );
    expect(
      legalizacionesActivas.reduce((sum, row) => sum + row.valorAplicado, 0)
    ).toBe(30);
  });

  test("rechaza duplicado local y permite mismo número en otra factura", async () => {
    const t = makeTest();
    const first = await seedFacturaConAsignacion(t);
    const second = await seedFacturaConAsignacion(t);

    await t.mutation(
      api.facturacionCrucesDocumentosInternos.agregarCruceDocumentoInternoDesdeServidor,
      {
        secret: SECRET,
        facturaId: first.facturaId,
        asignacionId: first.asignacionId,
        numeroDocumento: "INT-001",
        valorAplicado: 10,
        ...ACTOR,
      }
    );

    await expect(
      t.mutation(
        api.facturacionCrucesDocumentosInternos.agregarCruceDocumentoInternoDesdeServidor,
        {
          secret: SECRET,
          facturaId: first.facturaId,
          asignacionId: first.asignacionId,
          numeroDocumento: " int-001 ",
          valorAplicado: 5,
          ...ACTOR,
        }
      )
    ).rejects.toThrow(/Ya existe un documento interno activo/);

    await t.mutation(
      api.facturacionCrucesDocumentosInternos.agregarCruceDocumentoInternoDesdeServidor,
      {
        secret: SECRET,
        facturaId: second.facturaId,
        asignacionId: second.asignacionId,
        numeroDocumento: "INT-001",
        valorAplicado: 8,
        ...ACTOR,
      }
    );

    const rows = await t.run((ctx) =>
      ctx.db.query("facturacionCrucesDocumentosInternos").collect()
    );
    expect(rows.filter((row) => row.estado === "activo")).toHaveLength(2);
  });
});
