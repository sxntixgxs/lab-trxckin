/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");

const EMPRESA = 1;
const NOW = 1_779_840_000_000;
const SECRET = "test-documento-fisico-secret";

const LIDER = {
  actorUserId: "lider-1",
  actorNombre: "Líder Proceso",
  actorEmail: "lider@example.com",
  actorProcesoId: 42,
  actorProcesoNombre: "Gestión Administrativa",
};

const RECEPCION_A = {
  usuarioId: "recepcion-a",
  nombre: "Recepción A",
  email: "recepcion-a@example.com",
};

const RECEPCION_B = {
  usuarioId: "recepcion-b",
  nombre: "Recepción B",
  email: "recepcion-b@example.com",
};

function makeTest() {
  process.env.CONVEX_SERVER_SECRET = SECRET;
  return convexTest(schema, modules);
}

async function seedRecepcionConfig(t: ReturnType<typeof makeTest>) {
  await t.run(async (ctx) => {
    await ctx.db.insert("facturacionConfiguracion", {
      empresa: EMPRESA,
      clave: "recepcion",
      tipo: "usuarios_lista",
      usuarios: [RECEPCION_A, RECEPCION_B],
      actualizadoEn: NOW,
    });
  });
}

function baseDocumentoArgs(soporteStorageId: Id<"_storage">) {
  return {
    secret: SECRET,
    empresa: EMPRESA,
    numeroFactura: "FIS-001",
    proveedorNit: "900123456",
    proveedorNombre: "Proveedor Físico",
    fechaEmision: "2026-06-01",
    subtotal: 100_000,
    impuestos: 19_000,
    moneda: "COP",
    descripcion: "Documento físico manual",
    categoria: "administracion" as const,
    soporteStorageId,
    soporteNombre: "soporte.pdf",
    soporteMimeType: "application/pdf",
    ...LIDER,
  };
}

async function storeTestFile(t: ReturnType<typeof makeTest>, contents: string) {
  return await t.run(async (ctx) =>
    ctx.storage.store(new Blob([contents], { type: "application/pdf" })),
  );
}

describe("crearDocumentoFisicoDesdeServidor", () => {
  test("crea el documento y lo asigna al creador en revision_lider", async () => {
    const t = makeTest();
    await seedRecepcionConfig(t);
    const soporteStorageId = await storeTestFile(t, "soporte-doc-fisico");

    const result = await t.mutation(api.facturacionFacturas.crearDocumentoFisicoDesdeServidor, {
      ...baseDocumentoArgs(soporteStorageId),
    });

    const snapshot = await t.run(async (ctx) => {
      const tarea = (await ctx.db.get("facturacionTareas", result.tareaId)) as Doc<"facturacionTareas"> | null;
      const asignaciones = await ctx.db
        .query("facturacionAsignaciones")
        .withIndex("by_tareaId", (q) => q.eq("tareaId", result.tareaId))
        .collect();
      const aprobaciones = await ctx.db
        .query("facturacionAprobaciones")
        .withIndex("by_tareaId", (q) => q.eq("tareaId", result.tareaId))
        .collect();
      const scheduled = await ctx.db.system.query("_scheduled_functions").collect();
      return { tarea, asignaciones, aprobaciones, scheduled };
    });

    expect(result.estado).toBe("revision_lider");
    expect(snapshot.tarea?.estado).toBe("revision_lider");
    expect(snapshot.tarea?.currentAsignacionId).toBe(result.asignacionId);
    expect(snapshot.tarea?.lideresTotal).toBe(1);
    expect(snapshot.tarea?.lideresCompletados).toBe(0);
    expect(snapshot.tarea?.asignadoAUserId).toBe(LIDER.actorUserId);
    expect(snapshot.tarea?.liderProcesoUserId).toBe(LIDER.actorUserId);
    expect(snapshot.tarea?.liderProcesoProcesoId).toBe(LIDER.actorProcesoId);
    expect(typeof snapshot.tarea?.faseIniciadaEn).toBe("number");

    const recepcionAsignaciones = snapshot.asignaciones.filter(
      (row) => row.fase === "recepcion",
    );
    expect(recepcionAsignaciones.every((row) => row.estado === "cancelada")).toBe(true);

    const liderPendientes = snapshot.asignaciones.filter(
      (row) => row.fase === "revision_lider" && row.estado === "pendiente",
    );
    expect(liderPendientes).toHaveLength(1);
    expect(liderPendientes[0]?.asignadoAUserId).toBe(LIDER.actorUserId);
    expect(liderPendientes[0]?.rol).toBe("lider");

    const acciones = snapshot.aprobaciones.map((row) => row.accion);
    expect(acciones).toContain("asignar_recepcion");
    expect(acciones).toContain("crear_documento_fisico");
    expect(acciones).toContain("asignar_lider");

    const notificationJob = snapshot.scheduled.find((job) => {
      const serialized = JSON.stringify(job);
      return (
        serialized.includes("enviarNotificacion") &&
        serialized.includes("revision_lider")
      );
    });
    expect(notificationJob).toBeDefined();
  });

  test("rechaza un secreto de servidor inválido", async () => {
    const t = makeTest();
    await seedRecepcionConfig(t);
    const soporteStorageId = await storeTestFile(t, "soporte-doc-fisico");

    await expect(
      t.mutation(api.facturacionFacturas.crearDocumentoFisicoDesdeServidor, {
        ...baseDocumentoArgs(soporteStorageId),
        secret: "invalid-secret",
      }),
    ).rejects.toThrow("No autorizado");
  });

  test("crearDesdeFacturaInterno mantiene recepcion para flujos normales", async () => {
    const t = makeTest();
    await seedRecepcionConfig(t);

    const facturaId = await t.run(async (ctx) =>
      ctx.db.insert("facturacionFacturas", {
        empresa: EMPRESA,
        numeroFactura: "XML-001",
        tipoDocumento: "01",
        tipoDocumentoNormalizado: "01",
        documentoClase: "factura",
        proveedorNit: "900123456",
        proveedorNitNormalizado: "900123456",
        numeroFacturaNormalizado: "XML001",
        proveedorNombre: "Proveedor XML",
        fechaEmision: "2026-06-01",
        subtotal: 100_000,
        impuestos: 0,
        total: 100_000,
        moneda: "COP",
        descripcion: "Factura XML",
        origen: "correo",
        creadoEn: NOW,
        actualizadoEn: NOW,
      }),
    );

    const tareaId = await t.mutation(internal.facturacionTareas.crearDesdeFacturaInterno, {
      facturaId,
      empresa: EMPRESA,
      categoria: "administracion",
    });

    const snapshot = await t.run(async (ctx) => {
      const tarea = (await ctx.db.get("facturacionTareas", tareaId)) as Doc<"facturacionTareas"> | null;
      const asignaciones = await ctx.db
        .query("facturacionAsignaciones")
        .withIndex("by_tareaId", (q) => q.eq("tareaId", tareaId))
        .collect();
      return { tarea, asignaciones };
    });

    expect(snapshot.tarea?.estado).toBe("recepcion");
    expect(
      snapshot.asignaciones.filter(
        (row) => row.fase === "recepcion" && row.estado === "pendiente",
      ),
    ).toHaveLength(2);
  });
});
