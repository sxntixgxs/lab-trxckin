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

  test("los adjuntos se listan a participantes y a quien ve facturas de la empresa", async () => {
    const t = makeTest();
    const { facturaId, asignacionId } = await seedFactura(t, { numero: "FAC-ADJ-3", empresa: 1 });
    const lider = await asUser(t, LIDER);
    await lider.mutation(api.facturacionAdjuntos.crear, {
      facturaId,
      asignacionId,
      storageId: await storeBlob(t),
      nombre: "soporte.pdf",
      subidoPorNombre: "x",
      subidoPorEmail: "x@example.com",
    });

    const listar = async (user: TestUser) =>
      (await (await asUser(t, user)).query(api.facturacionAdjuntos.listarPorFactura, {
        facturaId,
      })) as Array<{ url: string | null }>;

    expect(await listar(LIDER)).toHaveLength(1);
    expect(await listar({ ...OTRO, permisos: ["billing/invoices"], empresas: [1] })).toHaveLength(1);
    expect(await listar({ ...OTRO, permisos: ["billing/invoices"], empresas: [2] })).toHaveLength(0);
    expect(await listar({ ...INTRUSO, permisos: ["billing/inbox"], empresas: [1] })).toHaveLength(0);

    // Petty cash screens only see invoices booked against petty cash.
    const cajaMenor = await asUser(t, {
      id: "custodio-1",
      permisos: ["billing/petty-cash-reimbursement"],
      empresas: [1],
    });
    const listarCaja = async () =>
      (await cajaMenor.query(api.facturacionAdjuntos.listarPorFacturas, {
        facturaIds: [facturaId],
      })) as Array<{ adjuntos: unknown[] }>;
    expect((await listarCaja())[0].adjuntos).toHaveLength(0);
    await t.run(async (ctx) => {
      await ctx.db.patch("facturacionFacturas", facturaId, { esLegalizacionCajaMenor: true });
    });
    expect((await listarCaja())[0].adjuntos).toHaveLength(1);
  });
});

describe("consultas de facturación con alcance por usuario y empresa", () => {
  test("getWithTarea: participantes y facturas de la empresa; los demás ven null", async () => {
    const t = makeTest();
    const { facturaId } = await seedFactura(t, { numero: "FAC-DET-1", empresa: 1 });
    const detalle = async (user: TestUser) =>
      await (await asUser(t, user)).query(api.facturacionFacturas.getWithTarea, { id: facturaId });

    expect(await detalle(LIDER)).not.toBeNull();
    expect(await detalle({ ...OTRO, permisos: ["billing/invoices"], empresas: [1] })).not.toBeNull();
    expect(await detalle({ ...OTRO, permisos: ["billing/invoices"], empresas: [2] })).toBeNull();
    expect(await detalle({ ...INTRUSO, permisos: ["billing/tasks"], empresas: [1] })).toBeNull();
    await expect(t.query(api.facturacionFacturas.getWithTarea, { id: facturaId })).rejects.toThrow(
      "No autenticado",
    );
  });

  test("buscarPorCufesParaValidacionDian solo cruza facturas de empresas visibles", async () => {
    const t = makeTest();
    await seedFactura(t, { numero: "FAC-CUFE-1", empresa: 1, cufe: "cufe-compartido" });
    await seedFactura(t, { numero: "FAC-CUFE-2", empresa: 2, cufe: "cufe-empresa-2" });

    const sinPermiso = await asUser(t, { ...OTRO, permisos: ["billing/inbox"], empresas: [1, 2] });
    await expect(
      sinPermiso.query(api.facturacionFacturas.buscarPorCufesParaValidacionDian, {
        cufes: ["cufe-compartido"],
      }),
    ).rejects.toThrow("se requiere billing/invoices");

    const empresa1 = await asUser(t, { ...OTRO, permisos: ["billing/invoices"], empresas: [1] });
    const resultado = (await empresa1.query(api.facturacionFacturas.buscarPorCufesParaValidacionDian, {
      cufes: ["cufe-compartido", "cufe-empresa-2"],
    })) as { coincidencias: Array<{ cufe: string }> };
    expect(resultado.coincidencias.map((c) => c.cufe)).toEqual(["cufe-compartido"]);
    await expect(
      empresa1.query(api.facturacionFacturas.buscarPorCufesParaValidacionDian, {
        cufes: ["cufe-empresa-2"],
        empresa: 2,
      }),
    ).rejects.toThrow("Empresa no autorizada");
  });

  test("facturacionTareas.listar exige tareas y respeta las empresas del usuario", async () => {
    const t = makeTest();
    await seedFactura(t, { numero: "FAC-TAR-1", empresa: 1 });
    await seedFactura(t, { numero: "FAC-TAR-2", empresa: 2 });

    const bandeja = await asUser(t, { ...OTRO, permisos: ["billing/inbox"], empresas: [1] });
    await expect(bandeja.query(api.facturacionTareas.listar, {})).rejects.toThrow(
      "se requiere billing/tasks",
    );

    const tareas1 = await asUser(t, { ...OTRO, permisos: ["billing/tasks"], empresas: [1] });
    const propias = (await tareas1.query(api.facturacionTareas.listar, {})) as Array<{
      factura: Doc<"facturacionFacturas"> | null;
    }>;
    expect(propias.map((tarea) => tarea.factura?.numeroFactura)).toEqual(["FAC-TAR-1"]);
    const porEstado = (await tareas1.query(api.facturacionTareas.listar, {
      estado: "revision_lider",
    })) as unknown[];
    expect(porEstado).toHaveLength(1);
    await expect(tareas1.query(api.facturacionTareas.listar, { empresa: 2 })).rejects.toThrow(
      "Empresa no autorizada",
    );

    const todas = await asUser(t, { ...OTRO, permisos: ["billing/tasks"], accesoTodasEmpresas: true });
    expect((await todas.query(api.facturacionTareas.listar, {})) as unknown[]).toHaveLength(2);
  });

  test("facturacionCorreos.listar exige correos y respeta las empresas del usuario", async () => {
    const t = makeTest();
    await t.run(async (ctx) => {
      for (const empresa of [1, 2]) {
        await ctx.db.insert("facturacionCorreos", {
          empresa,
          graphMessageId: `msg-${empresa}`,
          subject: `Factura empresa ${empresa}`,
          from: "proveedor@example.com",
          toRecipients: ["facturas@example.com"],
          bodyPreview: "",
          receivedDateTime: "2026-06-01T10:00:00Z",
          isRead: false,
          hasAttachments: false,
          importance: "normal",
          procesado: false,
        });
      }
    });

    const sinPermiso = await asUser(t, { ...OTRO, permisos: ["billing/invoices"], empresas: [1] });
    await expect(sinPermiso.query(api.facturacionCorreos.listar, {})).rejects.toThrow(
      "se requiere billing/emails",
    );
    const correos1 = await asUser(t, { ...OTRO, permisos: ["billing/emails"], empresas: [1] });
    const propios = (await correos1.query(api.facturacionCorreos.listar, {})) as Array<{ empresa?: number }>;
    expect(propios.map((c) => c.empresa)).toEqual([1]);
    const noProcesados = (await correos1.query(api.facturacionCorreos.listar, {
      procesado: false,
    })) as unknown[];
    expect(noProcesados).toHaveLength(1);
    await expect(correos1.query(api.facturacionCorreos.listar, { empresa: 2 })).rejects.toThrow(
      "Empresa no autorizada",
    );
  });

  test("listado y exportación de facturas quedan en las empresas del usuario", async () => {
    const t = makeTest();
    await seedFactura(t, { numero: "FAC-EXP-1", empresa: 1 });
    await seedFactura(t, { numero: "FAC-EXP-2", empresa: 2 });

    const tareas = await asUser(t, { ...OTRO, permisos: ["billing/tasks"], empresas: [1] });
    await expect(
      tareas.query(api.facturacionFacturas.listarFilasParaExportar, {}),
    ).rejects.toThrow("se requiere billing/invoices");

    const facturas1 = await asUser(t, { ...OTRO, permisos: ["billing/invoices"], empresas: [1] });
    const exportadas = (await facturas1.query(api.facturacionFacturas.listarFilasParaExportar, {
      empresas: [1, 2],
    })) as { rows: Array<{ numeroFactura: string }> };
    expect(exportadas.rows.map((row) => row.numeroFactura)).toEqual(["FAC-EXP-1"]);
    const soloAjena = (await facturas1.query(api.facturacionFacturas.listarFilasParaExportar, {
      empresas: [2],
    })) as { rows: unknown[] };
    expect(soloAjena.rows).toEqual([]);
    expect(
      await facturas1.query(api.facturacionFacturas.listarResponsablesActuales, { empresas: [2] }),
    ).toEqual([]);
  });
});

describe("secciones del detalle de factura", () => {
  test("cruces internos, historial de notas y estado contable solo para quien ve la factura", async () => {
    const t = makeTest();
    const { facturaId } = await seedFactura(t, { numero: "FAC-SEC-1", empresa: 1 });
    const paginacion = { numItems: 20, cursor: null };
    const consultar = async (user: TestUser) => {
      const cliente = await asUser(t, user);
      return {
        cruces: (await cliente.query(
          api.facturacionCrucesDocumentosInternos.listarCrucesInternosActivosPorFactura,
          { facturaId, paginationOpts: paginacion },
        )) as { page: unknown[]; isDone: boolean },
        historial: (await cliente.query(
          api.facturacionCrucesDocumentosInternos.listarHistorialCrucesInternosFactura,
          { facturaId, paginationOpts: paginacion },
        )) as { page: unknown[] },
        notas: await cliente.query(api.facturacionNotaCreditoRelacion.listarHistorialRelacionDocumento, {
          facturaId,
        }),
        contable: await cliente.query(api.facturacionPeajesContabilidad.obtenerEstadoContableFactura, {
          facturaId,
        }),
      };
    };
    await t.run(async (ctx) => {
      const operacionId = await ctx.db.insert("facturacionPeajesOperaciones", {
        empresa: 1,
        estado: "aplicada",
        resumen: {},
        facturasCruzadas: [],
        notasCreditoAplicadas: [],
        documentosSkippeados: [],
        documentosYaProcesados: [],
        diferencias: [],
        anticiposAplicados: [],
        legalizacionIds: [],
        creadoPorNombre: "Peajes",
        creadoPorEmail: "peajes@example.com",
        creadoEn: NOW,
        actualizadoEn: NOW,
      });
      await ctx.db.insert("facturacionPeajesContabilidad", {
        facturaId,
        empresa: 1,
        operacionId,
        estado: "pendiente_contabilidad",
        numeroFactura: "FAC-SEC-1",
        numeroFacturaNormalizado: "FACSEC1",
        proveedorNombre: "Proveedor Test",
        fechaEmision: "2026-06-01",
        moneda: "COP",
        valorBruto: 100_000,
        valorNotasCredito: 0,
        valorNeto: 100_000,
        cruceAplicadoEn: NOW,
        ordenCola: "0001",
        searchText: "fac-sec-1",
        origen: "cruce",
        version: 1,
        creadoEn: NOW,
        actualizadoEn: NOW,
      });
    });

    const intruso = await consultar({ ...INTRUSO, permisos: ["billing/inbox"], empresas: [1] });
    expect(intruso).toEqual({
      cruces: { page: [], isDone: true, continueCursor: "" },
      historial: { page: [], isDone: true, continueCursor: "" },
      notas: [],
      contable: null,
    });

    const lider = await consultar(LIDER);
    expect(lider.cruces.isDone).toBe(true);
    expect(lider.contable).toMatchObject({ estado: "pendiente_contabilidad" });

    const exportacion = async (user: TestUser) =>
      await (await asUser(t, user)).query(
        api.facturacionCrucesDocumentosInternos.listarCrucesInternosActivosParaExportacion,
        { facturaIds: [facturaId], paginationOpts: paginacion },
      );
    await expect(exportacion({ ...INTRUSO, permisos: ["billing/inbox"], empresas: [1] })).rejects.toThrow(
      "se requiere billing/invoices",
    );
    expect(await exportacion({ ...OTRO, permisos: ["billing/invoices"], empresas: [2] })).toMatchObject({
      page: [],
    });
  });
});
