/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { asUser, type TestUser } from "../test-utils/onboardingActors";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");

const NOW = 1_779_840_000_000;

function makeTest() {
  return convexTest(schema, modules);
}

type T = ReturnType<typeof makeTest>;

const LIDER: TestUser = { id: "lider-1", nombre: "Lider Uno", email: "lider@example.com" };
const OTRO: TestUser = { id: "otro-1", nombre: "Otro Usuario", email: "otro@example.com" };
const INTRUSO: TestUser = { id: "intruso-1", nombre: "Intruso", email: "intruso@example.com" };
const ADMIN: TestUser = { id: "admin-1", hasFullAccess: true, permisos: ["*"] };

/** Client args that try to act as the leader; the server must ignore them. */
const ACTOR_SUPLANTADO = {
  actorUserId: "lider-1",
  actorNombre: "Lider Uno",
  actorEmail: "lider@example.com",
};

async function seedFactura(
  t: T,
  args: {
    numero: string;
    empresa?: number;
    asignado?: TestUser;
    conAsignacion?: boolean;
    cufe?: string;
    estado?: "revision_lider" | "aceptada";
  },
) {
  const asignado = args.asignado ?? LIDER;
  const empresa = args.empresa ?? 1;
  const estado = args.estado ?? "revision_lider";
  return await t.run(async (ctx) => {
    const facturaId = await ctx.db.insert("facturacionFacturas", {
      empresa,
      numeroFactura: args.numero,
      tipoDocumento: "01",
      proveedorNit: "900123456",
      proveedorNombre: "Proveedor Test",
      fechaEmision: "2026-06-01",
      subtotal: 100_000,
      impuestos: 0,
      total: 100_000,
      moneda: "COP",
      descripcion: "Documento de prueba",
      origen: "carga_manual",
      ...(args.cufe ? { cufe: args.cufe } : {}),
      creadoEn: NOW,
      actualizadoEn: NOW,
    });
    const tareaId = await ctx.db.insert("facturacionTareas", {
      facturaId,
      empresa,
      estado,
      categoria: "administracion",
      asignadoAUserId: asignado.id,
      asignadoANombre: asignado.nombre ?? asignado.id,
      asignadoAEmail: asignado.email ?? `${asignado.id}@example.com`,
      liderProcesoUserId: asignado.id,
      liderProcesoNombre: asignado.nombre ?? asignado.id,
      liderProcesoEmail: asignado.email ?? `${asignado.id}@example.com`,
      creadoEn: NOW,
      actualizadoEn: NOW,
    });
    let asignacionId: Id<"facturacionAsignaciones"> | undefined;
    if (args.conAsignacion !== false) {
      const grupoId = `${estado}:${String(facturaId)}`;
      asignacionId = await ctx.db.insert("facturacionAsignaciones", {
        facturaId,
        tareaId,
        empresa,
        fase: estado,
        estado: "pendiente",
        rol: "lider",
        grupoId,
        asignadoAUserId: asignado.id,
        asignadoANombre: asignado.nombre ?? asignado.id,
        asignadoAEmail: asignado.email ?? `${asignado.id}@example.com`,
        fechaAsignacion: NOW,
        creadoEn: NOW,
        actualizadoEn: NOW,
      });
      await ctx.db.patch("facturacionTareas", tareaId, {
        currentAsignacionId: asignacionId,
        grupoAsignacionActualId: grupoId,
      });
    }
    return { facturaId, tareaId, asignacionId: asignacionId! };
  });
}

async function storeBlob(t: T, contenido = "%PDF-1.4 demo") {
  return (await t.run(async (ctx) =>
    ctx.storage.store(new Blob([contenido], { type: "application/pdf" })),
  )) as Id<"_storage">;
}

async function aprobaciones(t: T, facturaId: Id<"facturacionFacturas">) {
  return await t.run(async (ctx) =>
    ctx.db
      .query("facturacionAprobaciones")
      .withIndex("by_facturaId", (q) => q.eq("facturaId", facturaId))
      .collect(),
  );
}

describe("flujo de facturas: la asignación debe ser del usuario autenticado", () => {
  test("un usuario ajeno no completa la asignación de otro aunque envíe su actor", async () => {
    const t = makeTest();
    const { asignacionId, tareaId } = await seedFactura(t, { numero: "FAC-OWN-1" });
    const intruso = await asUser(t, INTRUSO);

    await expect(
      intruso.mutation(api.facturacionTareas.completarRevisionLider, {
        asignacionId,
        decision: "rechazar",
        comentario: "Rechazo ajeno",
        ...ACTOR_SUPLANTADO,
      }),
    ).rejects.toThrow("No tienes asignada esta tarea.");

    const estado = await t.run(async (ctx) => ({
      tarea: await ctx.db.get("facturacionTareas", tareaId),
      asignacion: await ctx.db.get("facturacionAsignaciones", asignacionId),
    }));
    expect(estado.tarea?.estado).toBe("revision_lider");
    expect(estado.asignacion?.estado).toBe("pendiente");
  });

  test("el asignado actúa y la trazabilidad usa su identidad, no los args", async () => {
    const t = makeTest();
    const { asignacionId, facturaId, tareaId } = await seedFactura(t, { numero: "FAC-OWN-2" });
    const lider = await asUser(t, LIDER);

    await lider.mutation(api.facturacionTareas.completarRevisionLider, {
      asignacionId,
      decision: "rechazar",
      comentario: "No corresponde",
      actorUserId: "otra-persona",
      actorNombre: "Otra Persona",
      actorEmail: "otra@example.com",
    });

    const tarea = await t.run(async (ctx) => ctx.db.get("facturacionTareas", tareaId));
    expect(tarea?.estado).toBe("rechazada");
    const rechazo = (await aprobaciones(t, facturaId)).find((a) => a.accion === "rechazar");
    expect(rechazo).toMatchObject({
      actorUserId: LIDER.id,
      actorNombre: LIDER.nombre,
      actorEmail: LIDER.email,
    });
  });

  test("un usuario con acceso total puede actuar sobre una asignación ajena", async () => {
    const t = makeTest();
    const { asignacionId, tareaId } = await seedFactura(t, { numero: "FAC-OWN-3" });
    const admin = await asUser(t, ADMIN);

    await admin.mutation(api.facturacionTareas.completarRevisionLider, {
      asignacionId,
      decision: "rechazar",
      comentario: "Rechazo administrativo",
      ...ACTOR_SUPLANTADO,
    });
    const tarea = await t.run(async (ctx) => ctx.db.get("facturacionTareas", tareaId));
    expect(tarea?.estado).toBe("rechazada");
  });

  test("sin sesión las mutaciones del flujo no se ejecutan", async () => {
    const t = makeTest();
    const { asignacionId } = await seedFactura(t, { numero: "FAC-OWN-4" });
    await expect(
      t.mutation(api.facturacionTareas.completarRevisionLider, {
        asignacionId,
        decision: "rechazar",
        comentario: "Sin sesión",
        ...ACTOR_SUPLANTADO,
      }),
    ).rejects.toThrow("No autenticado");
  });

  test("marcar anticipo exige ser el dueño de la asignación activa", async () => {
    const t = makeTest();
    const { asignacionId, tareaId, facturaId } = await seedFactura(t, { numero: "FAC-ANT-1" });
    const intruso = await asUser(t, INTRUSO);

    await expect(
      intruso.mutation(api.facturacionTareas.marcarEsLegalizacionAnticipo, {
        tareaId,
        asignacionId,
        esLegalizacionAnticipo: true,
        ...ACTOR_SUPLANTADO,
      }),
    ).rejects.toThrow("No tienes asignada esta tarea.");
    const factura = await t.run(async (ctx) => ctx.db.get("facturacionFacturas", facturaId));
    expect(factura?.esLegalizacionAnticipo).toBeFalsy();
  });
});

describe("flujo de facturas: acciones del panel de tareas sin asignaciones", () => {
  test("con asignaciones el panel heredado no aplica: se gestiona desde el buzón", async () => {
    const t = makeTest();
    const { tareaId } = await seedFactura(t, { numero: "FAC-LEG-1" });
    const lider = await asUser(t, LIDER);
    await expect(
      lider.mutation(api.facturacionTareas.aceptarFactura, {
        tareaId,
        comentario: "Aceptar por fuera del buzón",
        ...ACTOR_SUPLANTADO,
      }),
    ).rejects.toThrow("Gestiona esta factura desde Mi Buzón.");
  });

  test("sin asignaciones actúan el dueño o quien tiene facturas en la empresa", async () => {
    const t = makeTest();
    const { tareaId, facturaId } = await seedFactura(t, {
      numero: "FAC-LEG-2",
      conAsignacion: false,
    });

    const intruso = await asUser(t, { ...INTRUSO, permisos: ["billing/inbox"], empresas: [1] });
    await expect(
      intruso.mutation(api.facturacionTareas.agregarComentario, {
        tareaId,
        comentario: "Comentario ajeno",
        ...ACTOR_SUPLANTADO,
      }),
    ).rejects.toThrow("No tienes asignada esta tarea.");
    await expect(
      intruso.mutation(api.facturacionTareas.reasignar, {
        tareaId,
        nuevoAsignadoUserId: INTRUSO.id,
        nuevoAsignadoNombre: "Intruso",
        nuevoAsignadoEmail: "intruso@example.com",
        comentario: "Me la asigno",
        ...ACTOR_SUPLANTADO,
      }),
    ).rejects.toThrow("No tienes asignada esta tarea.");

    const otraEmpresa = await asUser(t, { ...OTRO, permisos: ["billing/invoices"], empresas: [2] });
    await expect(
      otraEmpresa.mutation(api.facturacionTareas.agregarComentario, {
        tareaId,
        comentario: "Otra empresa",
        ...ACTOR_SUPLANTADO,
      }),
    ).rejects.toThrow("No tienes asignada esta tarea.");

    const facturas = await asUser(t, { ...OTRO, permisos: ["billing/invoices"], empresas: [1] });
    await facturas.mutation(api.facturacionTareas.agregarComentario, {
      tareaId,
      comentario: "Revisado",
      ...ACTOR_SUPLANTADO,
    });
    const lider = await asUser(t, LIDER);
    await lider.mutation(api.facturacionTareas.rechazarFactura, {
      tareaId,
      comentario: "No procede",
      ...ACTOR_SUPLANTADO,
    });

    const registros = await aprobaciones(t, facturaId);
    expect(registros.map((r) => [r.accion, r.actorUserId])).toEqual([
      ["comentar", OTRO.id],
      ["rechazar", LIDER.id],
    ]);
  });
});

describe("buzón: siempre el del usuario autenticado", () => {
  test("listarParaBuzon y resumenParaBuzon ignoran el asignadoAUserId del cliente", async () => {
    const t = makeTest();
    await seedFactura(t, { numero: "FAC-BUZ-L1", asignado: LIDER });
    await seedFactura(t, { numero: "FAC-BUZ-L2", asignado: LIDER });
    await seedFactura(t, { numero: "FAC-BUZ-O1", asignado: OTRO });
    const otro = await asUser(t, OTRO);

    const pagina = (await otro.query(api.facturacionTareas.listarParaBuzon, {
      asignadoAUserId: LIDER.id,
      paginationOpts: { numItems: 20, cursor: null },
    })) as { page: Array<{ factura: Doc<"facturacionFacturas"> | null }> };
    expect(pagina.page.map((item) => item.factura?.numeroFactura)).toEqual(["FAC-BUZ-O1"]);

    const resumen = (await otro.query(api.facturacionTareas.resumenParaBuzon, {
      asignadoAUserId: LIDER.id,
    })) as { todas: number };
    expect(resumen.todas).toBe(1);

    await expect(
      t.query(api.facturacionTareas.resumenParaBuzon, { asignadoAUserId: LIDER.id }),
    ).rejects.toThrow("No autenticado");
  });
});

describe("adjuntos de factura", () => {
  test("solo quien trabaja la factura adjunta; el autor sale de la identidad", async () => {
    const t = makeTest();
    const { facturaId, asignacionId } = await seedFactura(t, { numero: "FAC-ADJ-1" });
    const otra = await seedFactura(t, { numero: "FAC-ADJ-2" });
    const storageId = await storeBlob(t);
    const base = {
      facturaId,
      storageId,
      nombre: "soporte.pdf",
      subidoPorUserId: "otra-persona",
      subidoPorNombre: "Otra Persona",
      subidoPorEmail: "otra@example.com",
    };

    const intruso = await asUser(t, { ...INTRUSO, permisos: ["billing/inbox"], empresas: [1] });
    await expect(intruso.mutation(api.facturacionAdjuntos.crear, base)).rejects.toThrow(
      "No tienes asignada esta factura.",
    );

    const lider = await asUser(t, LIDER);
    await expect(
      lider.mutation(api.facturacionAdjuntos.crear, { ...base, asignacionId: otra.asignacionId }),
    ).rejects.toThrow("La asignación no corresponde a esta factura.");

    const adjuntoId = (await lider.mutation(api.facturacionAdjuntos.crear, {
      ...base,
      asignacionId,
    })) as Id<"facturacionAdjuntos">;
    const adjunto = await t.run(async (ctx) => ctx.db.get("facturacionAdjuntos", adjuntoId));
    expect(adjunto).toMatchObject({
      subidoPorUserId: LIDER.id,
      subidoPorNombre: LIDER.nombre,
      subidoPorEmail: LIDER.email,
    });

    await expect(
      intruso.mutation(api.facturacionAdjuntos.eliminar, { adjuntoId }),
    ).rejects.toThrow("No puedes eliminar este adjunto.");
    await lider.mutation(api.facturacionAdjuntos.eliminar, { adjuntoId });
    expect(await t.run(async (ctx) => ctx.db.get("facturacionAdjuntos", adjuntoId))).toBeNull();
  });
});
