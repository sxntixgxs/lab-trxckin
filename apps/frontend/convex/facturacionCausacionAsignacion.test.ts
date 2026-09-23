/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { actingAsActorArgs } from "../test-utils/convexActingAs";
import { asUser } from "../test-utils/onboardingActors";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");

const EMPRESA = 1;
const NOW = 1_779_840_000_000;
const ACTOR = {
  actorUserId: "actor-1",
  actorNombre: "Usuario Facturacion",
  actorEmail: "actor@example.com",
  comentario: "Enviado a causación.",
};

const ANALISTA_A = {
  usuarioId: "analista-a",
  nombre: "Analista A",
  email: "analista-a@example.com",
  peso: 70,
};

const ANALISTA_B = {
  usuarioId: "analista-b",
  nombre: "Analista B",
  email: "analista-b@example.com",
  peso: 30,
};

const LORENA = {
  usuarioId: "lorena",
  nombre: "Lorena",
  email: "lorena@example.com",
  peso: 70,
};

const ALLIANZ_NIT = "860026182";

function makeTest() {
  // Workflow mutations run as their actorUserId (identity-derived actor, see lib/serverActor.ts).
  return actingAsActorArgs(convexTest(schema, modules));
}

/** Billing settings user of the tested company. */
async function configurador(t: ReturnType<typeof makeTest>) {
  return await asUser(t, { id: "config-1", permisos: ["billing/settings"], empresas: [EMPRESA] });
}

function normalizeNit(value: string) {
  return value.replace(/\D/g, "").replace(/^0+/, "");
}

async function seedAnalistasCausacion(
  t: ReturnType<typeof makeTest>,
  usuarios: Array<{
    usuarioId: string;
    nombre: string;
    email: string;
    peso: number;
  }>,
  distribucionCursor = 0
) {
  await t.run(async (ctx) => {
    await ctx.db.insert("facturacionConfiguracion", {
      empresa: EMPRESA,
      clave: "analista_causacion",
      tipo: "usuarios_ponderados",
      usuariosPonderados: usuarios,
      distribucionCursor,
      actualizadoEn: NOW,
    });

    for (const [orden, usuario] of usuarios.entries()) {
      await ctx.db.insert("facturacionConfiguracionUsuarios", {
        empresa: EMPRESA,
        clave: "analista_causacion",
        tipo: "usuarios_ponderados",
        usuarioId: usuario.usuarioId,
        nombre: usuario.nombre,
        email: usuario.email,
        peso: usuario.peso,
        orden,
        actualizadoEn: NOW,
      });
    }
  });
}

async function insertFactura(
  t: ReturnType<typeof makeTest>,
  args: {
    numero: string;
    proveedorNit?: string;
  }
) {
  const proveedorNit = args.proveedorNit ?? "900999888";
  return await t.run(async (ctx) =>
    ctx.db.insert("facturacionFacturas", {
      empresa: EMPRESA,
      numeroFactura: args.numero,
      tipoDocumento: "01",
      tipoDocumentoNormalizado: "01",
      documentoClase: "factura",
      proveedorNit,
      proveedorNitNormalizado: normalizeNit(proveedorNit),
      numeroFacturaNormalizado: args.numero
        .replace(/[^a-z0-9]/gi, "")
        .toUpperCase(),
      proveedorNombre: "Proveedor Test",
      fechaEmision: "2026-06-01",
      subtotal: 100_000,
      impuestos: 0,
      total: 100_000,
      moneda: "COP",
      descripcion: "Documento de prueba",
      origen: "carga_manual",
      creadoEn: NOW,
      actualizadoEn: NOW,
    })
  );
}

async function insertTareaAceptada(
  t: ReturnType<typeof makeTest>,
  facturaId: Id<"facturacionFacturas">
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("facturacionTareas", {
      facturaId,
      empresa: EMPRESA,
      estado: "aceptada",
      categoria: "administracion",
      asignadoAUserId: ACTOR.actorUserId,
      asignadoANombre: ACTOR.actorNombre,
      asignadoAEmail: ACTOR.actorEmail,
      liderProcesoNombre: "Lider",
      liderProcesoEmail: "lider@example.com",
      creadoEn: NOW,
      actualizadoEn: NOW,
    })
  );
}

async function getDistribucionCursor(t: ReturnType<typeof makeTest>) {
  return await t.run(async (ctx) => {
    const config = await ctx.db
      .query("facturacionConfiguracion")
      .withIndex("by_empresa_clave", (q) =>
        q.eq("empresa", EMPRESA).eq("clave", "analista_causacion")
      )
      .first();
    return config?.distribucionCursor ?? 0;
  });
}

describe("facturacion causacion asignacion", () => {
  test("70/30 sin overrides asigna 7/3 en 10 envíos y avanza cursor a 10", async () => {
    const t = makeTest();
    await seedAnalistasCausacion(t, [ANALISTA_A, ANALISTA_B]);

    const counts = { [ANALISTA_A.usuarioId]: 0, [ANALISTA_B.usuarioId]: 0 };

    for (let index = 0; index < 10; index += 1) {
      const facturaId = await insertFactura(t, { numero: `FAC-DIST-${index}` });
      const tareaId = await insertTareaAceptada(t, facturaId);

      await t.mutation(api.facturacionTareas.enviarACausacion, {
        tareaId,
        ...ACTOR,
      });

      const asignacion = await t.run(async (ctx) => {
        const tarea = await ctx.db.get("facturacionTareas", tareaId);
        if (!tarea?.currentAsignacionId) return null;
        return await ctx.db.get("facturacionAsignaciones", tarea.currentAsignacionId);
      });

      const userId = asignacion?.asignadoAUserId;
      if (userId && userId in counts) {
        counts[userId as keyof typeof counts] += 1;
      }

      expect(asignacion?.metadata).toMatchObject({
        origenAsignacion: "distribucion_ponderada",
      });
    }

    expect(counts[ANALISTA_A.usuarioId]).toBe(7);
    expect(counts[ANALISTA_B.usuarioId]).toBe(3);
    expect(await getDistribucionCursor(t)).toBe(10);
  });

  test("NIT Allianz asigna Lorena y no mueve distribucionCursor", async () => {
    const t = makeTest();
    await seedAnalistasCausacion(t, [LORENA, ANALISTA_B], 0);

    await (await configurador(t)).mutation(api.facturacionConfiguracion.guardarProveedorCausacion, {
      empresa: EMPRESA,
      proveedorNit: ALLIANZ_NIT,
      proveedorNombre: "Allianz Seguros",
      analistaUsuarioId: LORENA.usuarioId,
      analistaNombre: LORENA.nombre,
      analistaEmail: LORENA.email,
    });

    const facturaId = await insertFactura(t, {
      numero: "FAC-ALLIANZ",
      proveedorNit: ALLIANZ_NIT,
    });
    const tareaId = await insertTareaAceptada(t, facturaId);

    await t.mutation(api.facturacionTareas.enviarACausacion, {
      tareaId,
      ...ACTOR,
    });

    const snapshot = await t.run(async (ctx) => {
      const tarea = await ctx.db.get("facturacionTareas", tareaId);
      const asignacion = tarea?.currentAsignacionId
        ? await ctx.db.get("facturacionAsignaciones", tarea.currentAsignacionId)
        : null;
      return { tarea, asignacion };
    });

    expect(snapshot.tarea?.causacionAsignadoAUserId).toBe(LORENA.usuarioId);
    expect(snapshot.asignacion?.metadata).toMatchObject({
      origenAsignacion: "proveedor_fijo",
      proveedorNitNormalizado: normalizeNit(ALLIANZ_NIT),
    });
    expect(await getDistribucionCursor(t)).toBe(0);
  });

  test("proveedor sin override consume el cursor ponderado", async () => {
    const t = makeTest();
    await seedAnalistasCausacion(t, [LORENA, ANALISTA_B], 0);

    await (await configurador(t)).mutation(api.facturacionConfiguracion.guardarProveedorCausacion, {
      empresa: EMPRESA,
      proveedorNit: ALLIANZ_NIT,
      proveedorNombre: "Allianz Seguros",
      analistaUsuarioId: LORENA.usuarioId,
      analistaNombre: LORENA.nombre,
      analistaEmail: LORENA.email,
    });

    const allianzFacturaId = await insertFactura(t, {
      numero: "FAC-ALLIANZ-2",
      proveedorNit: ALLIANZ_NIT,
    });
    const allianzTareaId = await insertTareaAceptada(t, allianzFacturaId);
    await t.mutation(api.facturacionTareas.enviarACausacion, {
      tareaId: allianzTareaId,
      ...ACTOR,
    });
    expect(await getDistribucionCursor(t)).toBe(0);

    const otraFacturaId = await insertFactura(t, {
      numero: "FAC-OTRO",
      proveedorNit: "900111222",
    });
    const otraTareaId = await insertTareaAceptada(t, otraFacturaId);
    await t.mutation(api.facturacionTareas.enviarACausacion, {
      tareaId: otraTareaId,
      ...ACTOR,
    });

    const otraAsignacion = await t.run(async (ctx) => {
      const tarea = await ctx.db.get("facturacionTareas", otraTareaId);
      if (!tarea?.currentAsignacionId) return null;
      return await ctx.db.get("facturacionAsignaciones", tarea.currentAsignacionId);
    });

    expect(otraAsignacion?.metadata).toMatchObject({
      origenAsignacion: "distribucion_ponderada",
    });
    expect(await getDistribucionCursor(t)).toBe(1);
  });

  test("rechaza NIT duplicado entre dos analistas", async () => {
    const t = makeTest();
    await seedAnalistasCausacion(t, [ANALISTA_A, ANALISTA_B]);

    await (await configurador(t)).mutation(api.facturacionConfiguracion.guardarProveedorCausacion, {
      empresa: EMPRESA,
      proveedorNit: ALLIANZ_NIT,
      proveedorNombre: "Allianz Seguros",
      analistaUsuarioId: ANALISTA_A.usuarioId,
      analistaNombre: ANALISTA_A.nombre,
      analistaEmail: ANALISTA_A.email,
    });

    await expect(
      (await configurador(t)).mutation(api.facturacionConfiguracion.guardarProveedorCausacion, {
        empresa: EMPRESA,
        proveedorNit: ALLIANZ_NIT,
        proveedorNombre: "Allianz Seguros",
        analistaUsuarioId: ANALISTA_B.usuarioId,
        analistaNombre: ANALISTA_B.nombre,
        analistaEmail: ANALISTA_B.email,
      })
    ).rejects.toThrow(/NIT ya está asignado/i);
  });

  test("bloquea quitar analista con proveedores asignados", async () => {
    const t = makeTest();
    await seedAnalistasCausacion(t, [ANALISTA_A, ANALISTA_B]);

    await (await configurador(t)).mutation(api.facturacionConfiguracion.guardarProveedorCausacion, {
      empresa: EMPRESA,
      proveedorNit: ALLIANZ_NIT,
      proveedorNombre: "Allianz Seguros",
      analistaUsuarioId: ANALISTA_A.usuarioId,
      analistaNombre: ANALISTA_A.nombre,
      analistaEmail: ANALISTA_A.email,
    });

    await expect(
      (await configurador(t)).mutation(api.facturacionConfiguracion.guardarAnalistasCausacion, {
        empresa: EMPRESA,
        usuarios: [{ ...ANALISTA_B, peso: 100 }],
      })
    ).rejects.toThrow(/proveedores con analista fijo/i);
  });

  test("guardarRevisoresCajaMenor valida total 100 y preserva cursor", async () => {
    const t = makeTest();
    await t.run(async (ctx) => {
      await ctx.db.insert("facturacionConfiguracion", {
        empresa: EMPRESA,
        clave: "revisor_caja_menor",
        tipo: "usuarios_ponderados",
        usuariosPonderados: [ANALISTA_A, ANALISTA_B],
        distribucionCursor: 4,
        actualizadoEn: NOW,
      });
    });

    await expect(
      (await configurador(t)).mutation(api.facturacionConfiguracion.guardarRevisoresCajaMenor, {
        empresa: EMPRESA,
        usuarios: [{ ...ANALISTA_A, peso: 60 }, ANALISTA_B],
      }),
    ).rejects.toThrow(/debe sumar 100/i);

    await (await configurador(t)).mutation(api.facturacionConfiguracion.guardarRevisoresCajaMenor, {
      empresa: EMPRESA,
      usuarios: [ANALISTA_A, ANALISTA_B],
    });

    const cursor = await t.run(async (ctx) => {
      const config = await ctx.db
        .query("facturacionConfiguracion")
        .withIndex("by_empresa_clave", (q) =>
          q.eq("empresa", EMPRESA).eq("clave", "revisor_caja_menor"),
        )
        .first();
      return config?.distribucionCursor ?? 0;
    });

    expect(cursor).toBe(4);
  });
});
