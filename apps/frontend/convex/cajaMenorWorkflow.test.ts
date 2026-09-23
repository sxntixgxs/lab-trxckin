/// <reference types="vite/client" />

import aggregateTest from "@convex-dev/aggregate/test";
import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import { actingAsActorArgs, DEFAULT_ACTOR_ID_KEYS } from "../test-utils/convexActingAs";
import { asUser } from "../test-utils/onboardingActors";

const modules = import.meta.glob("./**/*.*s");

const EMPRESA = 1;
const NOW = 1_779_840_000_000;

const LIDER = {
  actorUserId: "lider-1",
  actorNombre: "Lider Proceso",
  actorEmail: "lider@example.com",
};
const LIDER_APROBADOR = {
  actorUserId: "lider-aprobador-1",
  actorNombre: "Lider Aprobador",
  actorEmail: "lider-aprobador@example.com",
};
const OTRO_USUARIO = {
  actorUserId: "otro-usuario-1",
  actorNombre: "Otro Usuario",
  actorEmail: "otro@example.com",
};
const CONTADOR = {
  usuarioId: "contador-1",
  nombre: "Contador",
  email: "contador@example.com",
};
const CONTADOR_ACTOR = {
  actorUserId: CONTADOR.usuarioId,
  actorNombre: CONTADOR.nombre,
  actorEmail: CONTADOR.email,
};
const CONTADOR_B = {
  usuarioId: "contador-2",
  nombre: "Contador B",
  email: "contador-b@example.com",
};
const CONTADOR_B_ACTOR = {
  actorUserId: CONTADOR_B.usuarioId,
  actorNombre: CONTADOR_B.nombre,
  actorEmail: CONTADOR_B.email,
};
const EVENTOS_DIAN = {
  usuarioId: "eventos-dian-1",
  nombre: "Eventos DIAN A",
  email: "eventos-dian-a@example.com",
};
const EVENTOS_DIAN_ACTOR = {
  actorUserId: EVENTOS_DIAN.usuarioId,
  actorNombre: EVENTOS_DIAN.nombre,
  actorEmail: EVENTOS_DIAN.email,
};
const EVENTOS_DIAN_B = {
  usuarioId: "eventos-dian-2",
  nombre: "Eventos DIAN B",
  email: "eventos-dian-b@example.com",
};
const EVENTOS_DIAN_B_ACTOR = {
  actorUserId: EVENTOS_DIAN_B.usuarioId,
  actorNombre: EVENTOS_DIAN_B.nombre,
  actorEmail: EVENTOS_DIAN_B.email,
};
const REVISOR = {
  actorUserId: "revisor-1",
  actorNombre: "Revisor Caja Menor",
  actorEmail: "revisor@example.com",
};
const REVISOR_A = {
  usuarioId: "revisor-a",
  nombre: "Revisor A",
  email: "revisor-a@example.com",
  peso: 70,
};
const REVISOR_B = {
  usuarioId: "revisor-b",
  nombre: "Revisor B",
  email: "revisor-b@example.com",
  peso: 30,
};
const REVISOR_CERO = {
  usuarioId: "revisor-cero",
  nombre: "Revisor Cero",
  email: "revisor-cero@example.com",
  peso: 0,
};
const GERENCIA = {
  actorUserId: "gf-1",
  actorNombre: "Gerencia Financiera",
  actorEmail: "gf@example.com",
};
const TESORERO = {
  actorUserId: "tesorero-1",
  actorNombre: "Tesorero",
  actorEmail: "tesorero@example.com",
};
function makeTest() {
  const t = convexTest(schema, modules);
  aggregateTest.register(t, "cajaMenorMovimientosDisponibles");
  aggregateTest.register(t, "cajaMenorReembolsosActivosCaja");
  aggregateTest.register(t, "cajaMenorReembolsosActivosResponsable");
  aggregateTest.register(t, "cajaMenorReembolsosActivosCustodio");
  // `userId` of obtenerCajasAsignadasDisponiblesV2 is also the caller (queryConActorIds).
  return actingAsActorArgs(t, [...DEFAULT_ACTOR_ID_KEYS, "userId"]);
}

async function seedRevisoresCajaMenorPonderados(
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
    const existing = await ctx.db
      .query("facturacionConfiguracion")
      .withIndex("by_empresa_clave", (q) =>
        q.eq("empresa", EMPRESA).eq("clave", "revisor_caja_menor")
      )
      .first();
    if (existing) {
      await ctx.db.delete("facturacionConfiguracion", existing._id);
    }

    await ctx.db.insert("facturacionConfiguracion", {
      empresa: EMPRESA,
      clave: "revisor_caja_menor",
      tipo: "usuarios_ponderados",
      usuariosPonderados: usuarios,
      distribucionCursor,
      actualizadoEn: NOW,
    });

    for (const [orden, usuario] of usuarios.entries()) {
      await ctx.db.insert("facturacionConfiguracionUsuarios", {
        empresa: EMPRESA,
        clave: "revisor_caja_menor",
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

async function seedContadoresImpuestos(
  t: ReturnType<typeof makeTest>,
  usuarios: Array<{ usuarioId: string; nombre: string; email: string }>,
  empresa = EMPRESA
) {
  await t.run(async (ctx) => {
    const existing = await ctx.db
      .query("facturacionConfiguracion")
      .withIndex("by_empresa_clave", (q) =>
        q.eq("empresa", empresa).eq("clave", "contadores_impuestos")
      )
      .first();
    if (existing) {
      await ctx.db.delete("facturacionConfiguracion", existing._id);
    }

    await ctx.db.insert("facturacionConfiguracion", {
      empresa,
      clave: "contadores_impuestos",
      tipo: "usuarios_lista",
      usuarios,
      actualizadoEn: NOW,
    });

    const existingIndexRows = await ctx.db
      .query("facturacionConfiguracionUsuarios")
      .withIndex("by_empresa_clave", (q) =>
        q.eq("empresa", empresa).eq("clave", "contadores_impuestos")
      )
      .collect();
    for (const row of existingIndexRows) {
      await ctx.db.delete("facturacionConfiguracionUsuarios", row._id);
    }

    for (const [orden, usuario] of usuarios.entries()) {
      await ctx.db.insert("facturacionConfiguracionUsuarios", {
        empresa,
        clave: "contadores_impuestos",
        tipo: "usuarios_lista",
        usuarioId: usuario.usuarioId,
        nombre: usuario.nombre,
        email: usuario.email,
        orden,
        actualizadoEn: NOW,
      });
    }
  });
}

async function seedEventosDian(
  t: ReturnType<typeof makeTest>,
  usuarios: Array<{ usuarioId: string; nombre: string; email: string }>,
  empresa = EMPRESA
) {
  await t.run(async (ctx) => {
    const existing = await ctx.db
      .query("facturacionConfiguracion")
      .withIndex("by_empresa_clave", (q) =>
        q.eq("empresa", empresa).eq("clave", "eventos_dian")
      )
      .first();
    if (existing) {
      await ctx.db.delete("facturacionConfiguracion", existing._id);
    }

    await ctx.db.insert("facturacionConfiguracion", {
      empresa,
      clave: "eventos_dian",
      tipo: "usuarios_lista",
      usuarios,
      actualizadoEn: NOW,
    });

    const existingIndexRows = await ctx.db
      .query("facturacionConfiguracionUsuarios")
      .withIndex("by_empresa_clave", (q) =>
        q.eq("empresa", empresa).eq("clave", "eventos_dian")
      )
      .collect();
    for (const row of existingIndexRows) {
      await ctx.db.delete("facturacionConfiguracionUsuarios", row._id);
    }

    for (const [orden, usuario] of usuarios.entries()) {
      await ctx.db.insert("facturacionConfiguracionUsuarios", {
        empresa,
        clave: "eventos_dian",
        tipo: "usuarios_lista",
        usuarioId: usuario.usuarioId,
        nombre: usuario.nombre,
        email: usuario.email,
        orden,
        actualizadoEn: NOW,
      });
    }
  });
}

async function seedConfigs(t: ReturnType<typeof makeTest>) {
  await t.run(async (ctx) => {
    await ctx.db.insert("facturacionConfiguracion", {
      empresa: EMPRESA,
      clave: "revisor_caja_menor",
      tipo: "usuarios_lista",
      usuarios: [
        {
          usuarioId: REVISOR.actorUserId,
          nombre: REVISOR.actorNombre,
          email: REVISOR.actorEmail,
        },
      ],
      actualizadoEn: NOW,
    });
    await ctx.db.insert("facturacionConfiguracion", {
      empresa: EMPRESA,
      clave: "tesorero",
      tipo: "usuario",
      usuarioId: TESORERO.actorUserId,
      nombre: TESORERO.actorNombre,
      email: TESORERO.actorEmail,
      actualizadoEn: NOW,
    });
    await ctx.db.insert("cajasMenoresRolesConfig", {
      empresa: EMPRESA,
      rol: "GERENCIA_FINANCIERA",
      usuarios: [
        {
          userId: GERENCIA.actorUserId,
          nombre: GERENCIA.actorNombre,
          email: GERENCIA.actorEmail,
        },
      ],
      updatedAt: NOW,
    });
  });
  await seedContadoresImpuestos(t, [CONTADOR]);
  await seedEventosDian(t, [EVENTOS_DIAN]);
}

type ReembolsoAdjuntoInput = {
  storageId: Id<"_storage">;
  nombre: string;
  mimeType?: string;
};

async function enviarImpuestosAEventosDian(
  t: ReturnType<typeof makeTest>,
  reembolsoId: Id<"cajasMenoresReembolsos">,
  options?: {
    eventosDianUserId?: string;
    destinoAprobacion?: "eventos_dian" | "gerencia";
    comentario?: string;
    adjuntos?: ReembolsoAdjuntoInput[];
    actor?: typeof CONTADOR_ACTOR;
  }
) {
  await t.mutation(api.cajasMenores.decidirRevisionImpuestosReembolsoCajaMenor, {
    reembolsoId,
    decision: "aprobar",
    eventosDianUserId:
      options?.destinoAprobacion === "gerencia"
        ? undefined
        : (options?.eventosDianUserId ?? EVENTOS_DIAN.usuarioId),
    destinoAprobacion: options?.destinoAprobacion,
    comentario: options?.comentario,
    adjuntos: options?.adjuntos,
    ...(options?.actor ?? CONTADOR_ACTOR),
  });
}

async function aprobarEventosDianEnGerencia(
  t: ReturnType<typeof makeTest>,
  reembolsoId: Id<"cajasMenoresReembolsos">,
  options?: {
    actor?: typeof EVENTOS_DIAN_ACTOR;
    comentario?: string;
    adjuntos?: ReembolsoAdjuntoInput[];
  }
) {
  await t.mutation(api.cajasMenores.decidirEventosDianReembolsoCajaMenor, {
    reembolsoId,
    decision: "aprobar",
    comentario: options?.comentario,
    adjuntos: options?.adjuntos,
    ...(options?.actor ?? EVENTOS_DIAN_ACTOR),
  });
}

async function avanzarImpuestosHastaGerencia(
  t: ReturnType<typeof makeTest>,
  reembolsoId: Id<"cajasMenoresReembolsos">,
  options?: {
    eventosDianUserId?: string;
    destinoAprobacion?: "eventos_dian" | "gerencia";
    comentario?: string;
    adjuntos?: ReembolsoAdjuntoInput[];
    eventosDianActor?: typeof EVENTOS_DIAN_ACTOR;
  }
) {
  await enviarImpuestosAEventosDian(t, reembolsoId, options);
  if (options?.destinoAprobacion !== "gerencia") {
    await aprobarEventosDianEnGerencia(t, reembolsoId, {
      actor: options?.eventosDianActor,
      comentario: options?.comentario,
      adjuntos: options?.adjuntos,
    });
  }
}

async function seedCaja(
  t: ReturnType<typeof makeTest>,
  assignedUsersIds = [LIDER.actorUserId],
  empresa = EMPRESA
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("cajasMenores", {
      empresa_id: empresa,
      nombre: "Caja Obra",
      assignedValue: 1_000_000,
      assignedValueLetras: "Un millón",
      assignedUsersIds,
      estado: "activa",
      createdAt: NOW,
      createdByUserId: LIDER.actorUserId,
      updatedAt: NOW,
      updatedByUserId: LIDER.actorUserId,
    })
  );
}

async function seedFacturaConTarea(
  t: ReturnType<typeof makeTest>,
  args: {
    suffix: string;
    estado: "revision_lider" | "legalizada" | "reembolso_caja_menor" | "causacion";
    total?: number;
    empresa?: number;
    /** Leader who owns the task and its revision_lider assignment (default LIDER). */
    lider?: { actorUserId: string; actorNombre: string; actorEmail: string };
  }
) {
  const lider = args.lider ?? LIDER;
  return await t.run(async (ctx) => {
    const now = NOW + Number(args.suffix.replace(/\D/g, "") || 0);
    const empresa = args.empresa ?? EMPRESA;
    const facturaId = await ctx.db.insert("facturacionFacturas", {
      empresa,
      numeroFactura: `FAC-${args.suffix}`,
      tipoDocumento: "Factura",
      proveedorNit: "900123456",
      proveedorNombre: "Proveedor Caja",
      fechaEmision: "2026-06-01",
      subtotal: args.total ?? 100_000,
      impuestos: 0,
      total: args.total ?? 100_000,
      moneda: "COP",
      descripcion: "Compra menor",
      origen: "carga_manual",
      creadoEn: now,
      actualizadoEn: now,
    });
    const tareaId = await ctx.db.insert("facturacionTareas", {
      facturaId,
      empresa,
      estado: args.estado,
      categoria: "administracion",
      asignadoAUserId: lider.actorUserId,
      asignadoANombre: lider.actorNombre,
      asignadoAEmail: lider.actorEmail,
      liderProcesoUserId: lider.actorUserId,
      liderProcesoNombre: lider.actorNombre,
      liderProcesoEmail: lider.actorEmail,
      creadoEn: now,
      actualizadoEn: now,
    });

    let asignacionId: Id<"facturacionAsignaciones"> | undefined;
    if (args.estado === "revision_lider") {
      const grupoId = `revision_lider:${String(facturaId)}:${args.suffix}`;
      asignacionId = await ctx.db.insert("facturacionAsignaciones", {
        facturaId,
        tareaId,
        empresa,
        fase: "revision_lider",
        estado: "pendiente",
        rol: "lider",
        grupoId,
        asignadoAUserId: lider.actorUserId,
        asignadoANombre: lider.actorNombre,
        asignadoAEmail: lider.actorEmail,
        fechaAsignacion: now,
        creadoEn: now,
        actualizadoEn: now,
      });
      await ctx.db.patch("facturacionTareas", tareaId, {
        currentAsignacionId: asignacionId,
        grupoAsignacionActualId: grupoId,
      });
    }

    return { facturaId, tareaId, asignacionId };
  });
}

async function seedMovimientoPendiente(
  t: ReturnType<typeof makeTest>,
  args: {
    cajaMenorId: Id<"cajasMenores">;
    suffix: string;
    estadoTarea: "legalizada" | "reembolso_caja_menor";
    valor?: number;
  }
) {
  const base = await seedFacturaConTarea(t, {
    suffix: args.suffix,
    estado: args.estadoTarea,
    total: args.valor ?? 100_000,
  });
  const movimientoId = await t.run(async (ctx) =>
    ctx.db.insert("facturacionCajaMenorMovimientos", {
      facturaId: base.facturaId,
      cajaMenorId: args.cajaMenorId,
      origen: "factura_sistema",
      estado: "pendiente_reembolso",
      nit: "900123456",
      nombreEmpresa: "Proveedor Caja",
      concepto: `Movimiento ${args.suffix}`,
      fechaPago: "2026-06-02",
      valor: args.valor ?? 100_000,
      centroCostoCodigo: "CC-1",
      centroCostoNombre: "Centro Costo",
      actorUserId: LIDER.actorUserId,
      actorNombre: LIDER.actorNombre,
      actorEmail: LIDER.actorEmail,
      creadoEn: NOW,
      actualizadoEn: NOW,
    })
  );
  await t.run(async (ctx) => {
    await ctx.db.patch("facturacionFacturas", base.facturaId, {
      esLegalizacionCajaMenor: true,
      cajaMenorId: args.cajaMenorId,
      cajaMenorNombre: "Caja Obra",
    });
    const { backfillDocumentoBandeja } = await import("./lib/cajaMenorBandeja");
    await backfillDocumentoBandeja(ctx, "facturacionCajaMenorMovimientos", movimientoId);
  });
  return { ...base, movimientoId };
}

async function getSnapshot(t: ReturnType<typeof makeTest>) {
  return await t.run(async (ctx) => ({
    facturas: await ctx.db.query("facturacionFacturas").collect(),
    tareas: await ctx.db.query("facturacionTareas").collect(),
    asignaciones: await ctx.db.query("facturacionAsignaciones").collect(),
    movimientos: await ctx.db.query("facturacionCajaMenorMovimientos").collect(),
    reembolsos: await ctx.db.query("cajasMenoresReembolsos").collect(),
    aprobaciones: await ctx.db.query("facturacionAprobaciones").collect(),
    legalizaciones: await ctx.db.query("facturacionCajaMenorLegalizaciones").collect(),
  }));
}

async function seedReembolsoPendienteRevision(
  t: ReturnType<typeof makeTest>,
  cajaMenorId: Id<"cajasMenores">,
  suffix: string
) {
  const movimiento = await seedMovimientoPendiente(t, {
    cajaMenorId,
    suffix,
    estadoTarea: "reembolso_caja_menor",
  });
  const reembolsoId = await t.mutation(api.cajasMenores.generarReembolsoCajaMenor, {
    cajaMenorId,
    movimientoIds: [movimiento.movimientoId],
    custodioUserId: LIDER.actorUserId,
    custodioNombre: LIDER.actorNombre,
    custodioEmail: LIDER.actorEmail,
    ...LIDER,
  });
  return { reembolsoId, movimientoId: movimiento.movimientoId };
}

async function seedReembolsoPendienteImpuestos(
  t: ReturnType<typeof makeTest>,
  cajaMenorId: Id<"cajasMenores">,
  suffix: string,
  contadorUserId: string = CONTADOR.usuarioId
) {
  const { reembolsoId, movimientoId } = await seedReembolsoPendienteRevision(
    t,
    cajaMenorId,
    suffix
  );
  await t.mutation(api.cajasMenores.revisarReembolsoCajaMenor, {
    reembolsoId,
    decision: "aprobar",
    contadorUserId,
    ...REVISOR,
  });
  return { reembolsoId, movimientoId };
}

async function seedReembolsoPendienteEventosDian(
  t: ReturnType<typeof makeTest>,
  cajaMenorId: Id<"cajasMenores">,
  suffix: string,
  contadorUserId: string = CONTADOR.usuarioId,
  eventosDianUserId: string = EVENTOS_DIAN.usuarioId
) {
  const { reembolsoId, movimientoId } = await seedReembolsoPendienteImpuestos(
    t,
    cajaMenorId,
    suffix,
    contadorUserId
  );
  await enviarImpuestosAEventosDian(t, reembolsoId, { eventosDianUserId });
  return { reembolsoId, movimientoId };
}

async function seedReembolsoPendienteAprobacion(
  t: ReturnType<typeof makeTest>,
  cajaMenorId: Id<"cajasMenores">,
  suffix: string,
  contadorUserId: string = CONTADOR.usuarioId,
  eventosDianUserId: string = EVENTOS_DIAN.usuarioId
) {
  const { reembolsoId, movimientoId } = await seedReembolsoPendienteEventosDian(
    t,
    cajaMenorId,
    suffix,
    contadorUserId,
    eventosDianUserId
  );
  await aprobarEventosDianEnGerencia(t, reembolsoId, {
    actor:
      eventosDianUserId === EVENTOS_DIAN_B.usuarioId ? EVENTOS_DIAN_B_ACTOR : EVENTOS_DIAN_ACTOR,
  });
  return { reembolsoId, movimientoId };
}

async function storeTestFile(t: ReturnType<typeof makeTest>, name: string) {
  return await t.run(async (ctx) =>
    ctx.storage.store(new Blob([name], { type: "application/pdf" }))
  );
}

describe("Caja Menor reimbursement workflow", () => {
  test("leader marks Caja Menor and task moves to reembolso_caja_menor", async () => {
    const t = makeTest();
    await seedConfigs(t);
    const cajaMenorId = await seedCaja(t);
    const { asignacionId } = await seedFacturaConTarea(t, {
      suffix: "mark",
      estado: "revision_lider",
    });

    await t.mutation(api.facturacionTareas.marcarEsLegalizacionCajaMenor, {
      tareaId: (await getSnapshot(t)).tareas[0]._id,
      asignacionId,
      esLegalizacionCajaMenor: true,
      cajaMenorId,
      nit: "900123456",
      nombreEmpresa: "Proveedor Caja",
      concepto: "Papelería",
      fechaPago: "2026-06-02",
      centroCostoId: "1:1:CC-1",
      centroCostoCodigo: "CC-1",
      centroCostoNombre: "Centro Costo",
      ...LIDER,
    });

    const snapshot = await getSnapshot(t);
    expect(snapshot.tareas[0].estado).toBe("reembolso_caja_menor");
    expect(snapshot.tareas[0].currentAsignacionId).toBeUndefined();
    expect(snapshot.asignaciones[0].estado).toBe("completada");
    expect(snapshot.movimientos[0].estado).toBe("pendiente_reembolso");
  });

  test.each([
    { nombre: "Andes", appEmpresa: 1, centroCostoId: "1:1:CC-1" },
    { nombre: "Cordillera", appEmpresa: 2, centroCostoId: "2:1:CC-1" },
    { nombre: "Pacifico", appEmpresa: 3, centroCostoId: "1:7:CC-1" },
    { nombre: "Altiplano", appEmpresa: 4, centroCostoId: "1:13:CC-1" },
  ])("accepts a canonical cost-center ID in the exact $nombre scope", async ({
    nombre,
    appEmpresa,
    centroCostoId,
  }) => {
    const t = makeTest();
    const cajaMenorId = await seedCaja(t, [LIDER.actorUserId], appEmpresa);
    const { tareaId, asignacionId } = await seedFacturaConTarea(t, {
      suffix: `scope-${nombre}`,
      estado: "revision_lider",
      empresa: appEmpresa,
    });

    await t.mutation(api.facturacionTareas.marcarEsLegalizacionCajaMenor, {
      tareaId,
      asignacionId,
      esLegalizacionCajaMenor: true,
      cajaMenorId,
      concepto: "Compra por empresa",
      fechaPago: "2026-06-02",
      centroCostoId,
      centroCostoCodigo: "CC-1",
      centroCostoNombre: "Centro Uno",
      ...LIDER,
    });

    const snapshot = await getSnapshot(t);
    expect(snapshot.movimientos[0].centroCostoId).toBe(centroCostoId);
    expect(snapshot.movimientos[0].centrosCostoDistribucion?.[0].centroCostoId).toBe(centroCostoId);
  });

  test.each([
    {
      nombre: "SIESA source",
      appEmpresa: 1,
      centroCostoId: "2:1:CC-1",
      codigo: "CC-1",
      error: "no corresponde",
    },
    {
      nombre: "SIESA company",
      appEmpresa: 3,
      centroCostoId: "1:1:CC-1",
      codigo: "CC-1",
      error: "no corresponde",
    },
    {
      nombre: "embedded code",
      appEmpresa: 1,
      centroCostoId: "1:1:CC-OTHER",
      codigo: "CC-1",
      error: "no corresponde",
    },
    {
      nombre: "excluded company 12",
      appEmpresa: 1,
      centroCostoId: "1:12:CC-1",
      codigo: "CC-1",
      error: "no corresponde",
    },
    {
      nombre: "excluded company 17",
      appEmpresa: 1,
      centroCostoId: "1:17:CC-1",
      codigo: "CC-1",
      error: "no corresponde",
    },
    {
      nombre: "unknown app company",
      appEmpresa: 99,
      centroCostoId: "1:1:CC-1",
      codigo: "CC-1",
      error: "no tiene una fuente",
    },
    {
      nombre: "zero app company",
      appEmpresa: 0,
      centroCostoId: "1:1:CC-1",
      codigo: "CC-1",
      error: "no tiene una fuente",
    },
  ])("rejects a cost-center ID with mismatched $nombre", async ({
    appEmpresa,
    centroCostoId,
    codigo,
    error,
  }) => {
    const t = makeTest();
    const cajaMenorId = await seedCaja(t, [LIDER.actorUserId], appEmpresa);
    const { tareaId, asignacionId } = await seedFacturaConTarea(t, {
      suffix: `bad-scope-${appEmpresa}-${centroCostoId}`,
      estado: "revision_lider",
      empresa: appEmpresa,
    });

    await expect(
      t.mutation(api.facturacionTareas.marcarEsLegalizacionCajaMenor, {
        tareaId,
        asignacionId,
        esLegalizacionCajaMenor: true,
        cajaMenorId,
        concepto: "Compra inválida",
        fechaPago: "2026-06-02",
        centroCostoId,
        centroCostoCodigo: codigo,
        centroCostoNombre: "Centro Uno",
        ...LIDER,
      })
    ).rejects.toThrow(error);
  });

  test("rejects a new cost-center selection without a canonical ID", async () => {
    const t = makeTest();
    const cajaMenorId = await seedCaja(t);
    const { tareaId, asignacionId } = await seedFacturaConTarea(t, {
      suffix: "missing-canonical-id",
      estado: "revision_lider",
    });

    await expect(
      t.mutation(api.facturacionTareas.marcarEsLegalizacionCajaMenor, {
        tareaId,
        asignacionId,
        esLegalizacionCajaMenor: true,
        cajaMenorId,
        concepto: "Compra sin ID",
        fechaPago: "2026-06-02",
        centroCostoCodigo: "CC-1",
        centroCostoNombre: "Centro Uno",
        ...LIDER,
      })
    ).rejects.toThrow("ID canónico");
  });

  test("preserves an exact id-less cost-center identity already stored on the invoice", async () => {
    const t = makeTest();
    const cajaMenorId = await seedCaja(t);
    const { facturaId, tareaId, asignacionId } = await seedFacturaConTarea(t, {
      suffix: "legacy-invoice-cost-center",
      estado: "revision_lider",
    });
    await t.run(async (ctx) => {
      await ctx.db.patch("facturacionFacturas", facturaId, {
        centroCostoCodigo: "CC-LEGACY",
        centroCostoNombre: "Centro Histórico",
      });
    });

    await t.mutation(api.facturacionTareas.marcarEsLegalizacionCajaMenor, {
      tareaId,
      asignacionId,
      esLegalizacionCajaMenor: true,
      cajaMenorId,
      concepto: "Compra histórica",
      fechaPago: "2026-06-02",
      centroCostoCodigo: "CC-LEGACY",
      centroCostoNombre: "Centro Histórico",
      ...LIDER,
    });

    const snapshot = await getSnapshot(t);
    expect(snapshot.movimientos[0].centroCostoId).toBeUndefined();
    expect(snapshot.movimientos[0].centrosCostoDistribucion).toEqual([
      {
        centroCostoCodigo: "CC-LEGACY",
        centroCostoNombre: "Centro Histórico",
        valor: 100_000,
      },
    ]);
  });

  test("changed id-less invoice identity still requires a canonical ID", async () => {
    const t = makeTest();
    const cajaMenorId = await seedCaja(t);
    const { facturaId, tareaId, asignacionId } = await seedFacturaConTarea(t, {
      suffix: "changed-legacy-invoice-cost-center",
      estado: "revision_lider",
    });
    await t.run(async (ctx) => {
      await ctx.db.patch("facturacionFacturas", facturaId, {
        centroCostoCodigo: "CC-LEGACY",
        centroCostoNombre: "Centro Histórico",
      });
    });

    await expect(
      t.mutation(api.facturacionTareas.marcarEsLegalizacionCajaMenor, {
        tareaId,
        asignacionId,
        esLegalizacionCajaMenor: true,
        cajaMenorId,
        concepto: "Compra histórica editada",
        fechaPago: "2026-06-02",
        centroCostoCodigo: "CC-CHANGED",
        centroCostoNombre: "Centro Cambiado",
        ...LIDER,
      })
    ).rejects.toThrow("debe incluir un ID canónico válido");
  });

  test("physical receipt persists the complete canonical cost-center distribution", async () => {
    const t = makeTest();
    const cajaMenorId = await seedCaja(t);
    const soporteStorageId = await storeTestFile(t, "recibo-fisico.pdf");
    const centrosCostoDistribucion = [
      {
        centroCostoId: "1:1:CC-1",
        centroCostoCodigo: "CC-1",
        centroCostoNombre: "Centro Uno",
        valor: 60_000,
      },
      {
        centroCostoId: "1:1:CC-2",
        centroCostoCodigo: "CC-2",
        centroCostoNombre: "Centro Dos",
        valor: 40_000,
      },
    ];

    await t.mutation(api.cajasMenores.crearReciboFisicoCajaMenor, {
      empresa: 1,
      cajaMenorId,
      nombreEmpresa: "Proveedor físico",
      concepto: "Compra con recibo",
      fechaPago: "2026-06-02",
      valor: 100_000,
      centroCostoId: "1:1:CC-1",
      centroCostoCodigo: "CC-1",
      centroCostoNombre: "Centro Uno",
      centrosCostoDistribucion,
      soporteStorageId,
      soporteNombre: "recibo-fisico.pdf",
      soporteMimeType: "application/pdf",
      ...LIDER,
    });

    const snapshot = await getSnapshot(t);
    expect(snapshot.movimientos[0].origen).toBe("recibo_fisico");
    expect(snapshot.movimientos[0].centroCostoId).toBe("1:1:CC-1");
    expect(snapshot.movimientos[0].centrosCostoDistribucion).toEqual(centrosCostoDistribucion);
    expect(snapshot.facturas[0].centrosCostoDistribucion).toEqual(centrosCostoDistribucion);
  });

  test("id-less historical movement remains selectable without a reimbursement override", async () => {
    const t = makeTest();
    await seedConfigs(t);
    const cajaMenorId = await seedCaja(t);
    const movimiento = await seedMovimientoPendiente(t, {
      cajaMenorId,
      suffix: "select",
      estadoTarea: "reembolso_caja_menor",
    });

    const reembolsoId = await t.mutation(api.cajasMenores.generarReembolsoCajaMenor, {
      cajaMenorId,
      movimientoIds: [movimiento.movimientoId],
      custodioUserId: LIDER.actorUserId,
      custodioNombre: LIDER.actorNombre,
      custodioEmail: LIDER.actorEmail,
      ...LIDER,
    });

    const snapshot = await getSnapshot(t);
    expect(snapshot.reembolsos[0]._id).toEqual(reembolsoId);
    expect(snapshot.reembolsos[0].estado).toBe("pendiente_revision");
    expect(snapshot.reembolsos[0].numeroReembolso).toMatch(/^GFN-F006-/);
    expect(snapshot.reembolsos[0].formatoSnapshot?.movimientos).toHaveLength(1);
    expect(snapshot.movimientos[0].centroCostoId).toBeUndefined();
  });

  test("generation updates centro de costo on movement, factura and snapshot", async () => {
    const t = makeTest();
    await seedConfigs(t);
    const cajaMenorId = await seedCaja(t);
    const movimiento = await seedMovimientoPendiente(t, {
      cajaMenorId,
      suffix: "cc",
      estadoTarea: "reembolso_caja_menor",
    });

    await t.mutation(api.cajasMenores.generarReembolsoCajaMenor, {
      cajaMenorId,
      movimientoIds: [movimiento.movimientoId],
      centroCostoOverrides: [
        {
          movimientoId: movimiento.movimientoId,
          centroCostoId: "1:1:CC-2",
          centroCostoCodigo: "CC-2",
          centroCostoNombre: "Centro Nuevo",
        },
      ],
      custodioUserId: LIDER.actorUserId,
      custodioNombre: LIDER.actorNombre,
      custodioEmail: LIDER.actorEmail,
      ...LIDER,
    });

    const snapshot = await getSnapshot(t);
    expect(snapshot.movimientos[0].centroCostoCodigo).toBe("CC-2");
    expect(snapshot.movimientos[0].centroCostoNombre).toBe("Centro Nuevo");
    expect(snapshot.facturas[0].centroCostoCodigo).toBe("CC-2");
    expect(snapshot.facturas[0].centroCostoNombre).toBe("Centro Nuevo");
    expect(snapshot.reembolsos[0].formatoSnapshot?.movimientos[0].centroCostoCodigo).toBe("CC-2");
  });

  test("generation with leader approval starts pending selected approver", async () => {
    const t = makeTest();
    await seedConfigs(t);
    const cajaMenorId = await seedCaja(t, [LIDER.actorUserId]);
    const movimiento = await seedMovimientoPendiente(t, {
      cajaMenorId,
      suffix: "lead-pending",
      estadoTarea: "reembolso_caja_menor",
    });

    const reembolsoId = await t.mutation(api.cajasMenores.generarReembolsoCajaMenor, {
      cajaMenorId,
      movimientoIds: [movimiento.movimientoId],
      aprobacionLider: {
        aprobadorUserId: OTRO_USUARIO.actorUserId,
        aprobadorNombre: OTRO_USUARIO.actorNombre,
        aprobadorEmail: OTRO_USUARIO.actorEmail,
      },
      custodioUserId: LIDER.actorUserId,
      custodioNombre: LIDER.actorNombre,
      custodioEmail: LIDER.actorEmail,
      ...LIDER,
    });

    const snapshot = await getSnapshot(t);
    expect(snapshot.reembolsos[0].estado).toBe("pendiente_aprobacion_lider");
    expect(snapshot.reembolsos[0].liderAprobadorUserId).toBe(OTRO_USUARIO.actorUserId);

    const dashboardAprobador = await t.query(api.cajasMenores.obtenerDashboardReembolsos, {
      empresas: [EMPRESA],
      actorUserId: OTRO_USUARIO.actorUserId,
    });
    expect(dashboardAprobador.canAccess).toBe(true);
    expect(
      dashboardAprobador.pendientesAprobacionLider.some(
        (item: { _id: unknown; puedeAprobarLider?: boolean }) =>
          String(item._id) === String(reembolsoId) && item.puedeAprobarLider
      )
    ).toBe(true);

    const dashboardSolicitante = await t.query(api.cajasMenores.obtenerDashboardReembolsos, {
      empresas: [EMPRESA],
      actorUserId: LIDER.actorUserId,
    });
    expect(dashboardSolicitante.pendientesAprobacionLider).toHaveLength(0);

    const detalleSolicitante = await t.query(api.cajasMenores.obtenerDetalleReembolsoCajaMenor, {
      reembolsoId,
      actorUserId: LIDER.actorUserId,
    });
    expect(detalleSolicitante).not.toBeNull();
    expect(detalleSolicitante?.faseModal).toBe("solo_lectura");
    expect(detalleSolicitante?.puedeActuar).toBe(false);

    const detalleLider = await t.query(api.cajasMenores.obtenerDetalleReembolsoCajaMenor, {
      reembolsoId,
      actorUserId: OTRO_USUARIO.actorUserId,
    });
    expect(detalleLider?.faseModal).toBe("pendiente_aprobacion_lider");
    expect(detalleLider?.puedeActuar).toBe(true);
  });

  test("leader approval sends reimbursement to Revisor Caja Menor", async () => {
    const t = makeTest();
    await seedConfigs(t);
    const cajaMenorId = await seedCaja(t, [LIDER.actorUserId]);
    const movimiento = await seedMovimientoPendiente(t, {
      cajaMenorId,
      suffix: "lead-ok",
      estadoTarea: "reembolso_caja_menor",
    });
    const reembolsoId = await t.mutation(api.cajasMenores.generarReembolsoCajaMenor, {
      cajaMenorId,
      movimientoIds: [movimiento.movimientoId],
      aprobacionLider: {
        aprobadorUserId: OTRO_USUARIO.actorUserId,
        aprobadorNombre: OTRO_USUARIO.actorNombre,
        aprobadorEmail: OTRO_USUARIO.actorEmail,
      },
      custodioUserId: LIDER.actorUserId,
      custodioNombre: LIDER.actorNombre,
      custodioEmail: LIDER.actorEmail,
      ...LIDER,
    });

    await t.mutation(api.cajasMenores.decidirAprobacionLiderReembolsoCajaMenor, {
      reembolsoId,
      decision: "aprobar",
      comentario: "Autorizado por líder",
      ...OTRO_USUARIO,
    });

    const snapshot = await getSnapshot(t);
    expect(snapshot.reembolsos[0].estado).toBe("pendiente_revision");
    expect(snapshot.reembolsos[0].liderDecisionEn).toBeDefined();
    const detalle = await t.query(api.cajasMenores.obtenerDetalleReembolsoCajaMenor, {
      reembolsoId,
      actorUserId: REVISOR.actorUserId,
    });
    expect(detalle?.faseModal).toBe("pendiente_revision");
    expect(
      detalle?.timeline.some((evento: { etapa: string }) => evento.etapa === "aprobacion_lider")
    ).toBe(true);
  });

  test("leader rejection ungroups movements like reviewer rejection", async () => {
    const t = makeTest();
    await seedConfigs(t);
    const cajaMenorId = await seedCaja(t, [LIDER.actorUserId]);
    const movimiento = await seedMovimientoPendiente(t, {
      cajaMenorId,
      suffix: "lead-reject",
      estadoTarea: "reembolso_caja_menor",
    });
    const reembolsoId = await t.mutation(api.cajasMenores.generarReembolsoCajaMenor, {
      cajaMenorId,
      movimientoIds: [movimiento.movimientoId],
      aprobacionLider: {
        aprobadorUserId: OTRO_USUARIO.actorUserId,
        aprobadorNombre: OTRO_USUARIO.actorNombre,
        aprobadorEmail: OTRO_USUARIO.actorEmail,
      },
      custodioUserId: LIDER.actorUserId,
      custodioNombre: LIDER.actorNombre,
      custodioEmail: LIDER.actorEmail,
      ...LIDER,
    });

    await t.mutation(api.cajasMenores.decidirAprobacionLiderReembolsoCajaMenor, {
      reembolsoId,
      decision: "rechazar",
      comentario: "Debe corregirse",
      ...OTRO_USUARIO,
    });

    const snapshot = await getSnapshot(t);
    expect(snapshot.reembolsos[0].estado).toBe("rechazado");
    expect(snapshot.movimientos[0].estado).toBe("pendiente_reembolso");
    expect(snapshot.movimientos[0].reembolsoId).toBeUndefined();
  });

  test("leader approval validates self approval and centro de costo", async () => {
    const t = makeTest();
    await seedConfigs(t);
    const cajaMenorId = await seedCaja(t, [LIDER.actorUserId]);
    const first = await seedMovimientoPendiente(t, {
      cajaMenorId,
      suffix: "val-self",
      estadoTarea: "reembolso_caja_menor",
    });

    await expect(
      t.mutation(api.cajasMenores.generarReembolsoCajaMenor, {
        cajaMenorId,
        movimientoIds: [first.movimientoId],
        aprobacionLider: {
          aprobadorUserId: LIDER.actorUserId,
          aprobadorNombre: LIDER.actorNombre,
          aprobadorEmail: LIDER.actorEmail,
        },
        custodioUserId: LIDER.actorUserId,
        custodioNombre: LIDER.actorNombre,
        custodioEmail: LIDER.actorEmail,
        ...LIDER,
      })
    ).rejects.toThrow("No puedes aprobar tu propia solicitud");

    const second = await seedMovimientoPendiente(t, {
      cajaMenorId,
      suffix: "val-non-custodian",
      estadoTarea: "reembolso_caja_menor",
    });
    const reembolsoId = await t.mutation(api.cajasMenores.generarReembolsoCajaMenor, {
      cajaMenorId,
      movimientoIds: [second.movimientoId],
      aprobacionLider: {
        aprobadorUserId: OTRO_USUARIO.actorUserId,
        aprobadorNombre: OTRO_USUARIO.actorNombre,
        aprobadorEmail: OTRO_USUARIO.actorEmail,
      },
      custodioUserId: LIDER.actorUserId,
      custodioNombre: LIDER.actorNombre,
      custodioEmail: LIDER.actorEmail,
      ...LIDER,
    });
    expect(String(reembolsoId)).toBeTruthy();

    const third = await seedMovimientoPendiente(t, {
      cajaMenorId,
      suffix: "val-cc",
      estadoTarea: "reembolso_caja_menor",
    });
    await expect(
      t.mutation(api.cajasMenores.generarReembolsoCajaMenor, {
        cajaMenorId,
        movimientoIds: [third.movimientoId],
        centroCostoOverrides: [
          {
            movimientoId: third.movimientoId,
            centroCostoCodigo: "",
            centroCostoNombre: "Centro Nuevo",
          },
        ],
        custodioUserId: LIDER.actorUserId,
        custodioNombre: LIDER.actorNombre,
        custodioEmail: LIDER.actorEmail,
        ...LIDER,
      })
    ).rejects.toThrow("Selecciona un centro de costo");
  });

  test("marking Caja Menor with valid split stores distribution on movement and factura", async () => {
    const t = makeTest();
    await seedConfigs(t);
    const cajaMenorId = await seedCaja(t);
    const { asignacionId } = await seedFacturaConTarea(t, {
      suffix: "split-mark",
      estado: "revision_lider",
      total: 100_000,
    });

    await t.mutation(api.facturacionTareas.marcarEsLegalizacionCajaMenor, {
      tareaId: (await getSnapshot(t)).tareas[0]._id,
      asignacionId,
      esLegalizacionCajaMenor: true,
      cajaMenorId,
      concepto: "Papelería repartida",
      fechaPago: "2026-06-02",
      centrosCostoDistribucion: [
        {
          centroCostoId: "1:1:CC-1",
          centroCostoCodigo: "CC-1",
          centroCostoNombre: "Centro Uno",
          valor: 60_000,
        },
        {
          centroCostoId: "1:1:CC-2",
          centroCostoCodigo: "CC-2",
          centroCostoNombre: "Centro Dos",
          valor: 40_000,
        },
      ],
      ...LIDER,
    });

    const snapshot = await getSnapshot(t);
    expect(snapshot.movimientos[0].centroCostoCodigo).toBe("CC-1");
    expect(snapshot.movimientos[0].centrosCostoDistribucion).toEqual([
      {
        centroCostoId: "1:1:CC-1",
        centroCostoCodigo: "CC-1",
        centroCostoNombre: "Centro Uno",
        valor: 60_000,
      },
      {
        centroCostoId: "1:1:CC-2",
        centroCostoCodigo: "CC-2",
        centroCostoNombre: "Centro Dos",
        valor: 40_000,
      },
    ]);
    expect(snapshot.facturas[0].centrosCostoDistribucion).toEqual(
      snapshot.movimientos[0].centrosCostoDistribucion
    );
  });

  test("marking Caja Menor rejects invalid split totals", async () => {
    const t = makeTest();
    await seedConfigs(t);
    const cajaMenorId = await seedCaja(t);
    const { asignacionId } = await seedFacturaConTarea(t, {
      suffix: "split-invalid",
      estado: "revision_lider",
      total: 100_000,
    });

    await expect(
      t.mutation(api.facturacionTareas.marcarEsLegalizacionCajaMenor, {
        tareaId: (await getSnapshot(t)).tareas[0]._id,
        asignacionId,
        esLegalizacionCajaMenor: true,
        cajaMenorId,
        concepto: "Papelería",
        fechaPago: "2026-06-02",
        centrosCostoDistribucion: [
          {
            centroCostoId: "1:1:CC-1",
            centroCostoCodigo: "CC-1",
            centroCostoNombre: "Centro Uno",
            valor: 60_000,
          },
          {
            centroCostoId: "1:1:CC-2",
            centroCostoCodigo: "CC-2",
            centroCostoNombre: "Centro Dos",
            valor: 30_000,
          },
        ],
        ...LIDER,
      })
    ).rejects.toThrow("La distribución debe sumar");
  });

  test("generation override updates distribution on movement, factura and snapshot", async () => {
    const t = makeTest();
    await seedConfigs(t);
    const cajaMenorId = await seedCaja(t);
    const movimiento = await seedMovimientoPendiente(t, {
      cajaMenorId,
      suffix: "split-gen",
      estadoTarea: "reembolso_caja_menor",
      valor: 150_000,
    });

    await t.mutation(api.cajasMenores.generarReembolsoCajaMenor, {
      cajaMenorId,
      movimientoIds: [movimiento.movimientoId],
      centroCostoOverrides: [
        {
          movimientoId: movimiento.movimientoId,
          centroCostoId: "1:1:CC-1",
          centroCostoCodigo: "CC-1",
          centroCostoNombre: "Centro Uno",
          centrosCostoDistribucion: [
            {
              centroCostoId: "1:1:CC-1",
              centroCostoCodigo: "CC-1",
              centroCostoNombre: "Centro Uno",
              valor: 90_000,
            },
            {
              centroCostoId: "1:1:CC-2",
              centroCostoCodigo: "CC-2",
              centroCostoNombre: "Centro Dos",
              valor: 60_000,
            },
          ],
        },
      ],
      custodioUserId: LIDER.actorUserId,
      custodioNombre: LIDER.actorNombre,
      custodioEmail: LIDER.actorEmail,
      ...LIDER,
    });

    const snapshot = await getSnapshot(t);
    expect(snapshot.movimientos[0].centrosCostoDistribucion).toEqual([
      {
        centroCostoId: "1:1:CC-1",
        centroCostoCodigo: "CC-1",
        centroCostoNombre: "Centro Uno",
        valor: 90_000,
      },
      {
        centroCostoId: "1:1:CC-2",
        centroCostoCodigo: "CC-2",
        centroCostoNombre: "Centro Dos",
        valor: 60_000,
      },
    ]);
    expect(snapshot.facturas[0].centrosCostoDistribucion).toEqual(
      snapshot.movimientos[0].centrosCostoDistribucion
    );
    expect(snapshot.reembolsos[0].formatoSnapshot?.movimientos[0].centrosCostoDistribucion).toEqual(
      snapshot.movimientos[0].centrosCostoDistribucion
    );
  });

  test("id-less historical identity may be resubmitted unchanged on generation", async () => {
    const t = makeTest();
    await seedConfigs(t);
    const cajaMenorId = await seedCaja(t);
    const movimiento = await seedMovimientoPendiente(t, {
      cajaMenorId,
      suffix: "legacy-cc",
      estadoTarea: "reembolso_caja_menor",
      valor: 80_000,
    });

    await t.mutation(api.cajasMenores.generarReembolsoCajaMenor, {
      cajaMenorId,
      movimientoIds: [movimiento.movimientoId],
      centroCostoOverrides: [
        {
          movimientoId: movimiento.movimientoId,
          centroCostoCodigo: "CC-1",
          centroCostoNombre: "Centro Costo",
        },
      ],
      custodioUserId: LIDER.actorUserId,
      custodioNombre: LIDER.actorNombre,
      custodioEmail: LIDER.actorEmail,
      ...LIDER,
    });

    const snapshot = await getSnapshot(t);
    expect(snapshot.movimientos[0].centrosCostoDistribucion).toEqual([
      {
        centroCostoCodigo: "CC-1",
        centroCostoNombre: "Centro Costo",
        valor: 80_000,
      },
    ]);
  });

  test("changed historical identity requires a valid canonical ID", async () => {
    const t = makeTest();
    await seedConfigs(t);
    const cajaMenorId = await seedCaja(t);
    const movimiento = await seedMovimientoPendiente(t, {
      cajaMenorId,
      suffix: "legacy-changed-no-id",
      estadoTarea: "reembolso_caja_menor",
      valor: 80_000,
    });

    await expect(
      t.mutation(api.cajasMenores.generarReembolsoCajaMenor, {
        cajaMenorId,
        movimientoIds: [movimiento.movimientoId],
        centroCostoOverrides: [
          {
            movimientoId: movimiento.movimientoId,
            centroCostoCodigo: "CC-9",
            centroCostoNombre: "Centro Legacy",
          },
        ],
        custodioUserId: LIDER.actorUserId,
        custodioNombre: LIDER.actorNombre,
        custodioEmail: LIDER.actorEmail,
        ...LIDER,
      })
    ).rejects.toThrow("debe incluir un ID canónico válido");

    const snapshot = await getSnapshot(t);
    expect(snapshot.movimientos[0].centroCostoCodigo).toBe("CC-1");
    expect(snapshot.reembolsos).toHaveLength(0);
  });

  test("reviewer rejects entire request and ungroups all movements", async () => {
    const t = makeTest();
    await seedConfigs(t);
    const cajaMenorId = await seedCaja(t);
    const first = await seedMovimientoPendiente(t, {
      cajaMenorId,
      suffix: "r1",
      estadoTarea: "reembolso_caja_menor",
      valor: 50_000,
    });
    const second = await seedMovimientoPendiente(t, {
      cajaMenorId,
      suffix: "r2",
      estadoTarea: "reembolso_caja_menor",
      valor: 70_000,
    });

    await t.mutation(api.cajasMenores.generarReembolsoCajaMenor, {
      cajaMenorId,
      movimientoIds: [first.movimientoId, second.movimientoId],
      custodioUserId: LIDER.actorUserId,
      custodioNombre: LIDER.actorNombre,
      custodioEmail: LIDER.actorEmail,
      ...LIDER,
    });
    const reembolsoId = (await getSnapshot(t)).reembolsos[0]._id;

    await t.mutation(api.cajasMenores.revisarReembolsoCajaMenor, {
      reembolsoId,
      decision: "rechazar",
      comentario: "Soporte insuficiente",
      ...REVISOR,
    });

    const snapshot = await getSnapshot(t);
    expect(snapshot.reembolsos[0].estado).toBe("rechazado");
    expect(
      snapshot.movimientos.every(
        (movimiento) => movimiento.estado === "pendiente_reembolso" && !movimiento.reembolsoId
      )
    ).toBe(true);
  });

  test("reviewer approves entire request and sends to Gerencia Financiera", async () => {
    const t = makeTest();
    await seedConfigs(t);
    const cajaMenorId = await seedCaja(t);
    const movimiento = await seedMovimientoPendiente(t, {
      cajaMenorId,
      suffix: "approve",
      estadoTarea: "reembolso_caja_menor",
    });

    await t.mutation(api.cajasMenores.generarReembolsoCajaMenor, {
      cajaMenorId,
      movimientoIds: [movimiento.movimientoId],
      custodioUserId: LIDER.actorUserId,
      custodioNombre: LIDER.actorNombre,
      custodioEmail: LIDER.actorEmail,
      ...LIDER,
    });
    const reembolsoId = (await getSnapshot(t)).reembolsos[0]._id;

    await t.mutation(api.cajasMenores.revisarReembolsoCajaMenor, {
      reembolsoId,
      decision: "aprobar",
      contadorUserId: CONTADOR.usuarioId,
      ...REVISOR,
    });

    const snapshot = await getSnapshot(t);
    expect(snapshot.reembolsos[0].estado).toBe("pendiente_revision_impuestos");
    expect(snapshot.reembolsos[0].movimientoIds).toHaveLength(1);
    expect(snapshot.reembolsos[0].contadorAsignadoUserId).toBe(CONTADOR.usuarioId);
  });

  test("Gerencia approves and sends to Tesorería", async () => {
    const t = makeTest();
    await seedConfigs(t);
    const cajaMenorId = await seedCaja(t);
    const movimiento = await seedMovimientoPendiente(t, {
      cajaMenorId,
      suffix: "gf",
      estadoTarea: "reembolso_caja_menor",
    });

    await t.mutation(api.cajasMenores.generarReembolsoCajaMenor, {
      cajaMenorId,
      movimientoIds: [movimiento.movimientoId],
      custodioUserId: LIDER.actorUserId,
      custodioNombre: LIDER.actorNombre,
      custodioEmail: LIDER.actorEmail,
      ...LIDER,
    });
    const reembolsoId = (await getSnapshot(t)).reembolsos[0]._id;
    await t.mutation(api.cajasMenores.revisarReembolsoCajaMenor, {
      reembolsoId,
      decision: "aprobar",
      contadorUserId: CONTADOR.usuarioId,
      ...REVISOR,
    });

    await avanzarImpuestosHastaGerencia(t, reembolsoId);

    await t.mutation(api.cajasMenores.decidirReembolsoCajaMenor, {
      reembolsoId,
      decision: "aprobar",
      ...GERENCIA,
    });

    const snapshot = await getSnapshot(t);
    expect(snapshot.reembolsos[0].estado).toBe("pendiente_pago_tesoreria");
    expect(snapshot.reembolsos[0].tesoreroUserId).toBe(TESORERO.actorUserId);
  });

  test("Tesorería uploads payment proof and completes reimbursement", async () => {
    const t = makeTest();
    await seedConfigs(t);
    const cajaMenorId = await seedCaja(t);
    const movimiento = await seedMovimientoPendiente(t, {
      cajaMenorId,
      suffix: "pay",
      estadoTarea: "reembolso_caja_menor",
    });

    await t.mutation(api.cajasMenores.generarReembolsoCajaMenor, {
      cajaMenorId,
      movimientoIds: [movimiento.movimientoId],
      custodioUserId: LIDER.actorUserId,
      custodioNombre: LIDER.actorNombre,
      custodioEmail: LIDER.actorEmail,
      ...LIDER,
    });
    const reembolsoId = (await getSnapshot(t)).reembolsos[0]._id;
    await t.mutation(api.cajasMenores.revisarReembolsoCajaMenor, {
      reembolsoId,
      decision: "aprobar",
      contadorUserId: CONTADOR.usuarioId,
      ...REVISOR,
    });
    await avanzarImpuestosHastaGerencia(t, reembolsoId);
    await t.mutation(api.cajasMenores.decidirReembolsoCajaMenor, {
      reembolsoId,
      decision: "aprobar",
      ...GERENCIA,
    });

    const storageId = await t.run(async (ctx) =>
      ctx.storage.store(new Blob(["comprobante"], { type: "application/pdf" }))
    );

    await t.mutation(api.cajasMenores.cargarComprobantePagoReembolsoCajaMenor, {
      reembolsoId,
      comprobanteStorageId: storageId,
      comprobanteNombre: "comprobante.pdf",
      comprobanteMimeType: "application/pdf",
      ...TESORERO,
    });

    const snapshot = await getSnapshot(t);
    expect(snapshot.reembolsos[0].estado).toBe("recibido");
    expect(snapshot.movimientos[0].estado).toBe("reembolsado");
    expect(snapshot.tareas[0].estado).toBe("legalizada");
  });

  test("reviewer can approve with attachments", async () => {
    const t = makeTest();
    await seedConfigs(t);
    const cajaMenorId = await seedCaja(t);
    const { reembolsoId } = await seedReembolsoPendienteRevision(t, cajaMenorId, "adj-rev");
    const storageId = await storeTestFile(t, "soporte-revisor.pdf");

    await t.mutation(api.cajasMenores.revisarReembolsoCajaMenor, {
      reembolsoId,
      decision: "aprobar",
      comentario: "Documentación completa",
      contadorUserId: CONTADOR.usuarioId,
      adjuntos: [
        {
          storageId,
          nombre: "soporte-revisor.pdf",
          mimeType: "application/pdf",
        },
      ],
      ...REVISOR,
    });

    const adjuntos = await t.query(internal.cajasMenores.obtenerAdjuntosReembolsoCajaMenor, {
      reembolsoId,
    });
    expect(adjuntos).toHaveLength(1);
    expect(adjuntos[0].etapa).toBe("revision");
    expect(adjuntos[0].nombre).toBe("soporte-revisor.pdf");
  });

  test("Gerencia can reject with comment and attachments", async () => {
    const t = makeTest();
    await seedConfigs(t);
    const cajaMenorId = await seedCaja(t);
    const { reembolsoId } = await seedReembolsoPendienteRevision(t, cajaMenorId, "adj-gf");
    await t.mutation(api.cajasMenores.revisarReembolsoCajaMenor, {
      reembolsoId,
      decision: "aprobar",
      contadorUserId: CONTADOR.usuarioId,
      ...REVISOR,
    });
    await avanzarImpuestosHastaGerencia(t, reembolsoId);
    const storageId = await storeTestFile(t, "observacion-gf.pdf");

    await t.mutation(api.cajasMenores.decidirReembolsoCajaMenor, {
      reembolsoId,
      decision: "rechazar",
      comentario: "Presupuesto excedido",
      adjuntos: [
        {
          storageId,
          nombre: "observacion-gf.pdf",
          mimeType: "application/pdf",
        },
      ],
      ...GERENCIA,
    });

    const snapshot = await getSnapshot(t);
    expect(snapshot.reembolsos[0].estado).toBe("rechazado");
    const adjuntos = await t.query(internal.cajasMenores.obtenerAdjuntosReembolsoCajaMenor, {
      reembolsoId,
    });
    expect(adjuntos.some((adjunto) => adjunto.etapa === "aprobacion")).toBe(true);
  });

  test("Tesorería loads comprobante with comment and completes reimbursement", async () => {
    const t = makeTest();
    await seedConfigs(t);
    const cajaMenorId = await seedCaja(t);
    const { reembolsoId } = await seedReembolsoPendienteRevision(t, cajaMenorId, "adj-pay");
    await t.mutation(api.cajasMenores.revisarReembolsoCajaMenor, {
      reembolsoId,
      decision: "aprobar",
      contadorUserId: CONTADOR.usuarioId,
      ...REVISOR,
    });
    await avanzarImpuestosHastaGerencia(t, reembolsoId);
    await t.mutation(api.cajasMenores.decidirReembolsoCajaMenor, {
      reembolsoId,
      decision: "aprobar",
      comentario: "Autorizado",
      ...GERENCIA,
    });
    const storageId = await storeTestFile(t, "comprobante-pago.pdf");

    await t.mutation(api.cajasMenores.cargarComprobantePagoReembolsoCajaMenor, {
      reembolsoId,
      comprobanteStorageId: storageId,
      comprobanteNombre: "comprobante-pago.pdf",
      comprobanteMimeType: "application/pdf",
      comentario: "Transferencia ref. 12345",
      ...TESORERO,
    });

    const detalle = await t.query(api.cajasMenores.obtenerDetalleReembolsoCajaMenor, {
      reembolsoId,
      actorUserId: TESORERO.actorUserId,
    });
    expect(detalle?.reembolso.estado).toBe("recibido");
    const eventoTesoreria = detalle?.timeline.find((evento) => evento.etapa === "tesoreria");
    expect(eventoTesoreria?.comentario).toBe("Transferencia ref. 12345");
    expect(eventoTesoreria?.adjuntos).toHaveLength(1);
  });

  test("timeline returns events with users, dates, comments and files", async () => {
    const t = makeTest();
    await seedConfigs(t);
    const cajaMenorId = await seedCaja(t);
    const { reembolsoId } = await seedReembolsoPendienteRevision(t, cajaMenorId, "timeline");
    const storageRevision = await storeTestFile(t, "rev.pdf");
    const storageGerencia = await storeTestFile(t, "gf.pdf");

    const storageContabilidad = await storeTestFile(t, "contabilidad.pdf");

    await t.mutation(api.cajasMenores.revisarReembolsoCajaMenor, {
      reembolsoId,
      decision: "aprobar",
      comentario: "OK revisor",
      contadorUserId: CONTADOR.usuarioId,
      adjuntos: [{ storageId: storageRevision, nombre: "rev.pdf" }],
      ...REVISOR,
    });
    await enviarImpuestosAEventosDian(t, reembolsoId, {
      comentario: "OK contabilidad",
      adjuntos: [{ storageId: storageContabilidad, nombre: "contabilidad.pdf" }],
    });
    await aprobarEventosDianEnGerencia(t, reembolsoId);
    await t.mutation(api.cajasMenores.decidirReembolsoCajaMenor, {
      reembolsoId,
      decision: "aprobar",
      comentario: "OK gerencia",
      adjuntos: [{ storageId: storageGerencia, nombre: "gf.pdf" }],
      ...GERENCIA,
    });

    const detalle = await t.query(api.cajasMenores.obtenerDetalleReembolsoCajaMenor, {
      reembolsoId,
      actorUserId: GERENCIA.actorUserId,
    });
    expect(detalle?.timeline.length).toBeGreaterThanOrEqual(4);
    expect(detalle?.timeline[0].etapa).toBe("solicitud");
    expect(detalle?.timeline.some((evento) => evento.etapa === "revision")).toBe(true);
    expect(detalle?.timeline.some((evento) => evento.etapa === "contabilidad")).toBe(true);
    expect(detalle?.timeline.some((evento) => evento.etapa === "eventos_dian")).toBe(true);
    expect(detalle?.timeline.some((evento) => evento.etapa === "aprobacion")).toBe(true);
    const revision = detalle?.timeline.find((evento) => evento.etapa === "revision");
    expect(revision?.usuarioNombre).toBe(REVISOR.actorNombre);
    expect(revision?.adjuntos[0]?.nombre).toBe("rev.pdf");
    expect(revision?.titulo).toBe("Enviado a Contabilidad por Revisor Caja Menor");
    expect(revision?.comentario).toBeUndefined();
    const contabilidadAsignacion = detalle?.timeline.find(
      (evento) => evento.etapa === "contabilidad" && evento.tipo === "creado"
    );
    expect(contabilidadAsignacion?.titulo).toBe(`Asignado a Contabilidad · ${CONTADOR.nombre}`);
    expect(contabilidadAsignacion?.comentario).toBe("OK revisor");
    const contabilidadAprobacion = detalle?.timeline.find(
      (evento) => evento.etapa === "contabilidad" && evento.tipo === "aprobado"
    );
    expect(contabilidadAprobacion?.usuarioNombre).toBe(CONTADOR.nombre);
    expect(contabilidadAprobacion?.adjuntos[0]?.nombre).toBe("contabilidad.pdf");
    expect(contabilidadAprobacion?.titulo).toBe(
      "Enviado a Eventos DIAN por Impuestos/Contabilidad"
    );
  });

  test("timeline shows Enviar a Contabilidad comment only on Asignado a Contabilidad, including historical duplicates", async () => {
    const t = makeTest();
    await seedConfigs(t);
    const cajaMenorId = await seedCaja(t);
    const { reembolsoId } = await seedReembolsoPendienteRevision(t, cajaMenorId, "comment-dedupe");

    await t.mutation(api.cajasMenores.revisarReembolsoCajaMenor, {
      reembolsoId,
      decision: "aprobar",
      comentario: "Revisar retención ICA",
      contadorUserId: CONTADOR.usuarioId,
      ...REVISOR,
    });

    // Simulate historical rows that stored the same transition comment on both fields.
    await t.run(async (ctx) => {
      const reembolso = await ctx.db.get("cajasMenoresReembolsos", reembolsoId);
      expect(reembolso).not.toBeNull();
      await ctx.db.patch("cajasMenoresReembolsos", reembolsoId, {
        reviewerComentario: "Revisar retención ICA",
        contadorAsignacionComentario: "Revisar retención ICA",
      });
    });

    const detalle = await t.query(api.cajasMenores.obtenerDetalleReembolsoCajaMenor, {
      reembolsoId,
      actorUserId: GERENCIA.actorUserId,
    });
    const revision = detalle?.timeline.find(
      (evento) => evento.titulo === "Enviado a Contabilidad por Revisor Caja Menor"
    );
    const asignaciones = detalle?.timeline.filter(
      (evento) =>
        evento.etapa === "contabilidad" &&
        evento.tipo === "creado" &&
        evento.comentario === "Revisar retención ICA"
    );
    expect(revision?.comentario).toBeUndefined();
    expect(asignaciones).toHaveLength(1);
    expect(asignaciones?.[0]?.titulo).toBe(`Asignado a Contabilidad · ${CONTADOR.nombre}`);
  });

  test("tesorero-only user can see pending payment reimbursements", async () => {
    const t = makeTest();
    await seedConfigs(t);
    const cajaMenorId = await seedCaja(t);
    const { reembolsoId } = await seedReembolsoPendienteRevision(t, cajaMenorId, "tes-access");
    await t.mutation(api.cajasMenores.revisarReembolsoCajaMenor, {
      reembolsoId,
      decision: "aprobar",
      contadorUserId: CONTADOR.usuarioId,
      ...REVISOR,
    });
    await avanzarImpuestosHastaGerencia(t, reembolsoId);
    await t.mutation(api.cajasMenores.decidirReembolsoCajaMenor, {
      reembolsoId,
      decision: "aprobar",
      ...GERENCIA,
    });

    const dashboard = await t.query(api.cajasMenores.obtenerDashboardReembolsos, {
      empresas: [EMPRESA],
      actorUserId: TESORERO.actorUserId,
    });
    expect(dashboard.canPayTesoreria).toBe(true);
    expect(dashboard.canAccess).toBe(true);
    expect(
      dashboard.pendientesRecibo.some(
        (item) => String(item._id) === String(reembolsoId) && item.puedeCargarComprobante === true
      )
    ).toBe(true);

    const detalle = await t.query(api.cajasMenores.obtenerDetalleReembolsoCajaMenor, {
      reembolsoId,
      actorUserId: TESORERO.actorUserId,
    });
    expect(detalle?.faseModal).toBe("pendiente_pago_tesoreria");
    expect(detalle?.puedeActuar).toBe(true);
  });

  test("70/30 reviewers distribute 7/3 over 10 reimbursements", async () => {
    const t = makeTest();
    await seedRevisoresCajaMenorPonderados(t, [REVISOR_A, REVISOR_B]);
    await t.run(async (ctx) => {
      await ctx.db.insert("facturacionConfiguracion", {
        empresa: EMPRESA,
        clave: "tesorero",
        tipo: "usuario",
        usuarioId: TESORERO.actorUserId,
        nombre: TESORERO.actorNombre,
        email: TESORERO.actorEmail,
        actualizadoEn: NOW,
      });
      await ctx.db.insert("cajasMenoresRolesConfig", {
        empresa: EMPRESA,
        rol: "GERENCIA_FINANCIERA",
        usuarios: [
          {
            userId: GERENCIA.actorUserId,
            nombre: GERENCIA.actorNombre,
            email: GERENCIA.actorEmail,
          },
        ],
        updatedAt: NOW,
      });
    });
    const cajaMenorId = await seedCaja(t);
    const counts = { [REVISOR_A.usuarioId]: 0, [REVISOR_B.usuarioId]: 0 };

    for (let index = 0; index < 10; index += 1) {
      const movimiento = await seedMovimientoPendiente(t, {
        cajaMenorId,
        suffix: `dist-${index}`,
        estadoTarea: "reembolso_caja_menor",
      });
      await t.mutation(api.cajasMenores.generarReembolsoCajaMenor, {
        cajaMenorId,
        movimientoIds: [movimiento.movimientoId],
        custodioUserId: LIDER.actorUserId,
        custodioNombre: LIDER.actorNombre,
        custodioEmail: LIDER.actorEmail,
        ...LIDER,
      });
      const reembolso = (await getSnapshot(t)).reembolsos.at(-1);
      const assignee = reembolso?.reviewAssignedUserId;
      if (assignee && assignee in counts) {
        counts[assignee as keyof typeof counts] += 1;
      }
    }

    expect(counts[REVISOR_A.usuarioId]).toBe(7);
    expect(counts[REVISOR_B.usuarioId]).toBe(3);
  });

  test("0% reviewer is never auto-assigned but can receive horizontal move", async () => {
    const t = makeTest();
    await seedRevisoresCajaMenorPonderados(t, [{ ...REVISOR_A, peso: 100 }, REVISOR_CERO]);
    await t.run(async (ctx) => {
      await ctx.db.insert("facturacionConfiguracion", {
        empresa: EMPRESA,
        clave: "tesorero",
        tipo: "usuario",
        usuarioId: TESORERO.actorUserId,
        nombre: TESORERO.actorNombre,
        email: TESORERO.actorEmail,
        actualizadoEn: NOW,
      });
    });
    const cajaMenorId = await seedCaja(t);
    const { reembolsoId } = await seedReembolsoPendienteRevision(t, cajaMenorId, "zero");

    const snapshot = await getSnapshot(t);
    expect(snapshot.reembolsos[0].reviewAssignedUserId).toBe(REVISOR_A.usuarioId);

    await t.mutation(api.cajasMenores.reasignarRevisorReembolsoCajaMenor, {
      reembolsoId,
      revisorUserId: REVISOR_CERO.usuarioId,
      comentario: "Carga manual temporal",
      actorUserId: REVISOR_A.usuarioId,
      actorNombre: REVISOR_A.nombre,
      actorEmail: REVISOR_A.email,
    });

    const updated = await getSnapshot(t);
    expect(updated.reembolsos[0].reviewAssignedUserId).toBe(REVISOR_CERO.usuarioId);
  });

  test("review queues filter by assignee and GF sees all", async () => {
    const t = makeTest();
    await seedRevisoresCajaMenorPonderados(t, [REVISOR_A, REVISOR_B]);
    await t.run(async (ctx) => {
      await ctx.db.insert("cajasMenoresRolesConfig", {
        empresa: EMPRESA,
        rol: "GERENCIA_FINANCIERA",
        usuarios: [
          {
            userId: GERENCIA.actorUserId,
            nombre: GERENCIA.actorNombre,
            email: GERENCIA.actorEmail,
          },
        ],
        updatedAt: NOW,
      });
    });
    const cajaMenorId = await seedCaja(t);
    const first = await seedReembolsoPendienteRevision(t, cajaMenorId, "q1");
    const second = await seedReembolsoPendienteRevision(t, cajaMenorId, "q2");

    await t.mutation(api.cajasMenores.reasignarRevisorReembolsoCajaMenor, {
      reembolsoId: second.reembolsoId,
      revisorUserId: REVISOR_B.usuarioId,
      comentario: "Balanceo manual",
      actorUserId: GERENCIA.actorUserId,
      actorNombre: GERENCIA.actorNombre,
      actorEmail: GERENCIA.actorEmail,
    });

    const dashboardA = await t.query(api.cajasMenores.obtenerDashboardReembolsos, {
      empresas: [EMPRESA],
      actorUserId: REVISOR_A.usuarioId,
    });
    const dashboardB = await t.query(api.cajasMenores.obtenerDashboardReembolsos, {
      empresas: [EMPRESA],
      actorUserId: REVISOR_B.usuarioId,
    });
    const dashboardGf = await t.query(api.cajasMenores.obtenerDashboardReembolsos, {
      empresas: [EMPRESA],
      actorUserId: GERENCIA.actorUserId,
    });

    expect(
      dashboardA.pendientesRevision.some(
        (item: { _id: unknown }) => String(item._id) === String(first.reembolsoId)
      )
    ).toBe(true);
    expect(
      dashboardA.pendientesRevision.some(
        (item: { _id: unknown }) => String(item._id) === String(second.reembolsoId)
      )
    ).toBe(false);
    expect(
      dashboardB.pendientesRevision.some(
        (item: { _id: unknown }) => String(item._id) === String(second.reembolsoId)
      )
    ).toBe(true);
    expect(dashboardGf.pendientesRevision).toHaveLength(2);
  });

  test("direct and leader-approved paths assign reviewer at review entry", async () => {
    const t = makeTest();
    await seedConfigs(t);
    const cajaMenorId = await seedCaja(t, [LIDER.actorUserId, LIDER_APROBADOR.actorUserId]);

    const direct = await seedMovimientoPendiente(t, {
      cajaMenorId,
      suffix: "direct-assign",
      estadoTarea: "reembolso_caja_menor",
    });
    await t.mutation(api.cajasMenores.generarReembolsoCajaMenor, {
      cajaMenorId,
      movimientoIds: [direct.movimientoId],
      custodioUserId: LIDER.actorUserId,
      custodioNombre: LIDER.actorNombre,
      custodioEmail: LIDER.actorEmail,
      ...LIDER,
    });

    const leaderFlow = await seedMovimientoPendiente(t, {
      cajaMenorId,
      suffix: "leader-assign",
      estadoTarea: "reembolso_caja_menor",
    });
    const leaderReembolsoId = await t.mutation(api.cajasMenores.generarReembolsoCajaMenor, {
      cajaMenorId,
      movimientoIds: [leaderFlow.movimientoId],
      aprobacionLider: {
        aprobadorUserId: LIDER_APROBADOR.actorUserId,
        aprobadorNombre: LIDER_APROBADOR.actorNombre,
        aprobadorEmail: LIDER_APROBADOR.actorEmail,
      },
      custodioUserId: LIDER.actorUserId,
      custodioNombre: LIDER.actorNombre,
      custodioEmail: LIDER.actorEmail,
      ...LIDER,
    });
    await t.mutation(api.cajasMenores.decidirAprobacionLiderReembolsoCajaMenor, {
      reembolsoId: leaderReembolsoId,
      decision: "aprobar",
      ...LIDER_APROBADOR,
    });

    const snapshot = await getSnapshot(t);
    expect(snapshot.reembolsos[0].reviewAssignedUserId).toBe(REVISOR.actorUserId);
    expect(snapshot.reembolsos[1].reviewAssignedUserId).toBe(REVISOR.actorUserId);
  });
});

describe("Revisor Caja Menor read-only cajas visibility", () => {
  const EMPRESA_2 = 2;

  async function seedCajaEmpresa(
    t: ReturnType<typeof makeTest>,
    empresaId: number,
    nombre: string
  ) {
    return await t.run(async (ctx) =>
      ctx.db.insert("cajasMenores", {
        empresa_id: empresaId,
        nombre,
        assignedValue: 500_000,
        assignedValueLetras: "Quinientos mil",
        assignedUsersIds: [LIDER.actorUserId],
        estado: "activa",
        createdAt: NOW,
        createdByUserId: LIDER.actorUserId,
        updatedAt: NOW,
        updatedByUserId: LIDER.actorUserId,
      })
    );
  }

  test("reviewer configured for company 1 sees cajas with canManage false", async () => {
    const t = makeTest();
    await seedConfigs(t);
    await seedCaja(t);
    const cajas = await t.query(api.cajasMenores.obtenerCajas, {
      empresas: [EMPRESA],
      actorUserId: REVISOR.actorUserId,
    });
    expect(cajas).toHaveLength(1);
    expect(cajas[0].canManage).toBe(false);
  });

  test("reviewer does not see cajas for companies where they are not configured", async () => {
    const t = makeTest();
    await seedConfigs(t);
    await seedCaja(t);
    await seedCajaEmpresa(t, EMPRESA_2, "Caja Empresa 2");
    const cajas = await t.query(api.cajasMenores.obtenerCajas, {
      empresas: [EMPRESA, EMPRESA_2],
      actorUserId: REVISOR.actorUserId,
    });
    expect(cajas).toHaveLength(1);
    expect(cajas[0].empresa_id).toBe(EMPRESA);
  });

  test("reviewer can fetch authorized caja detail and unauthorized users get null", async () => {
    const t = makeTest();
    await seedConfigs(t);
    const cajaMenorId = await seedCaja(t);
    const detalleRevisor = await t.query(api.cajasMenores.obtenerDetalleCaja, {
      cajaMenorId,
      actorUserId: REVISOR.actorUserId,
    });
    const detalleOtro = await t.query(api.cajasMenores.obtenerDetalleCaja, {
      cajaMenorId,
      actorUserId: OTRO_USUARIO.actorUserId,
    });
    expect(detalleRevisor?.caja._id).toEqual(cajaMenorId);
    expect(detalleOtro).toBeNull();
  });

  test("reviewer cannot call actualizarCajaMenor, eliminarCajaMenor, or crearRefill", async () => {
    const t = makeTest();
    await seedConfigs(t);
    const cajaMenorId = await seedCaja(t);
    await expect(
      t.mutation(api.cajasMenores.actualizarCajaMenor, {
        cajaMenorId,
        nombre: "Caja editada",
        assignedUsersIds: [LIDER.actorUserId],
        ...REVISOR,
      })
    ).rejects.toThrow("No tienes permisos de Gerencia Financiera.");
    await expect(
      t.mutation(api.cajasMenores.eliminarCajaMenor, {
        cajaMenorId,
        ...REVISOR,
      })
    ).rejects.toThrow("No tienes permisos de Gerencia Financiera.");
    await expect(
      t.mutation(api.cajasMenores.crearRefill, {
        cajaMenorId,
        refillValue: 100_000,
        refillValueLetras: "Cien mil",
        refillToUserId: LIDER.actorUserId,
        ...REVISOR,
      })
    ).rejects.toThrow("No tienes permisos de Gerencia Financiera.");
  });

  test("zero-weight configured reviewers count as configured for read-only visibility", async () => {
    const t = makeTest();
    await seedRevisoresCajaMenorPonderados(t, [REVISOR_A, REVISOR_CERO]);
    const cajaMenorId = await seedCaja(t);
    const empresas = await t.query(api.cajasMenores.obtenerEmpresasRevisorCajaMenor, {
      actorUserId: REVISOR_CERO.usuarioId,
    });
    const cajas = await t.query(api.cajasMenores.obtenerCajas, {
      empresas: [EMPRESA],
      actorUserId: REVISOR_CERO.usuarioId,
    });
    const detalle = await t.query(api.cajasMenores.obtenerDetalleCaja, {
      cajaMenorId,
      actorUserId: REVISOR_CERO.usuarioId,
    });
    expect(empresas).toContain(EMPRESA);
    expect(cajas).toHaveLength(1);
    expect(cajas[0].canManage).toBe(false);
    expect(detalle?.caja._id).toEqual(cajaMenorId);
  });

  test("obtenerCajasAsignadasDisponibles includes underfunded cajas when permitirSaldoNegativo is on", async () => {
    const t = makeTest();
    await seedConfigs(t);
    const cajaMenorId = await t.run(async (ctx) =>
      ctx.db.insert("cajasMenores", {
        empresa_id: EMPRESA,
        nombre: "Caja Baja",
        assignedValue: 100_000,
        assignedValueLetras: "Cien mil",
        assignedUsersIds: [LIDER.actorUserId],
        estado: "activa",
        createdAt: NOW,
        createdByUserId: LIDER.actorUserId,
        updatedAt: NOW,
        updatedByUserId: LIDER.actorUserId,
      })
    );
    const valorMinimo = 500_000;

    const sinFlag = await t.query(api.cajasMenores.obtenerCajasAsignadasDisponiblesV2, {
      empresa: EMPRESA,
      userId: LIDER.actorUserId,
      valorMinimo,
    });
    expect(sinFlag.permitirSaldoNegativo).toBe(false);
    expect(sinFlag.cajas.map((caja) => caja._id)).not.toContain(cajaMenorId);

    await t.mutation(api.cajasMenores.configurarPermitirSaldoNegativo, {
      empresa: EMPRESA,
      permitirSaldoNegativo: true,
      ...GERENCIA,
    });

    const conFlag = await t.query(api.cajasMenores.obtenerCajasAsignadasDisponiblesV2, {
      empresa: EMPRESA,
      userId: LIDER.actorUserId,
      valorMinimo,
    });
    expect(conFlag.permitirSaldoNegativo).toBe(true);
    expect(conFlag.cajas.map((caja) => caja._id)).toContain(cajaMenorId);

  });

  test("obtenerCajasAsignadasDisponiblesV2 preserves eligibility rules", async () => {
    const t = makeTest();
    const disponibleId = await seedCaja(t);
    const noAsignadaId = await seedCaja(t, [OTRO_USUARIO.actorUserId]);
    const inactivaId = await t.run(async (ctx) =>
      ctx.db.insert("cajasMenores", {
        empresa_id: EMPRESA,
        nombre: "Caja Inactiva",
        assignedValue: 1_000_000,
        assignedValueLetras: "Un millón",
        assignedUsersIds: [LIDER.actorUserId],
        estado: "cerrada",
        createdAt: NOW,
        updatedAt: NOW,
        updatedByUserId: LIDER.actorUserId,
      })
    );
    const otraEmpresaId = await t.run(async (ctx) =>
      ctx.db.insert("cajasMenores", {
        empresa_id: 2,
        nombre: "Caja Otra Empresa",
        assignedValue: 1_000_000,
        assignedValueLetras: "Un millón",
        assignedUsersIds: [LIDER.actorUserId],
        estado: "activa",
        createdAt: NOW,
        updatedAt: NOW,
        updatedByUserId: LIDER.actorUserId,
      })
    );
    const refillPendienteId = await seedCaja(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("cajasMenoresRefills", {
        cajaMenorId: refillPendienteId,
        refillDate: NOW,
        refillValue: 100_000,
        refillValueLetras: "Cien mil",
        refillByUserId: GERENCIA.actorUserId,
        refillToUserId: LIDER.actorUserId,
        receiptConfirmed: false,
      });
    });

    const result = await t.query(api.cajasMenores.obtenerCajasAsignadasDisponiblesV2, {
      empresa: EMPRESA,
      userId: LIDER.actorUserId,
      valorMinimo: 50_000,
    });
    const ids = result.cajas.map((caja) => caja._id);

    expect(result).toMatchObject({ permitirSaldoNegativo: false });
    expect(ids).toContain(disponibleId);
    expect(ids).not.toContain(noAsignadaId);
    expect(ids).not.toContain(inactivaId);
    expect(ids).not.toContain(otraEmpresaId);
    expect(ids).not.toContain(refillPendienteId);
  });

  test("obtenerCajasAsignadasDisponiblesV2 returns a stable empty object", async () => {
    const t = makeTest();
    await seedCaja(t, [OTRO_USUARIO.actorUserId]);

    await expect(
      t.query(api.cajasMenores.obtenerCajasAsignadasDisponiblesV2, {
        empresa: EMPRESA,
        userId: LIDER.actorUserId,
        valorMinimo: 50_000,
      })
    ).resolves.toEqual({ cajas: [], permitirSaldoNegativo: false });
  });
});

describe("Devolver movimiento Caja Menor a buzón", () => {
  test("devolverMovimientoABuzon unlinks pending invoice and assigns actor as leader", async () => {
    const t = makeTest();
    await seedConfigs(t);
    const cajaMenorId = await seedCaja(t);
    const seeded = await seedMovimientoPendiente(t, {
      cajaMenorId,
      suffix: "dev-fac",
      estadoTarea: "reembolso_caja_menor",
      valor: 90_000,
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("facturacionCajaMenorLegalizaciones", {
        facturaId: seeded.facturaId,
        cajaMenorId,
        tareaId: seeded.tareaId,
        empresa: EMPRESA,
        valorAplicado: 90_000,
        saldoAntes: 1_000_000,
        saldoDespues: 910_000,
        estado: "activa",
        actorUserId: LIDER.actorUserId,
        actorNombre: LIDER.actorNombre,
        actorEmail: LIDER.actorEmail,
        creadoEn: NOW,
        actualizadoEn: NOW,
      });
      await ctx.db.patch("facturacionFacturas", seeded.facturaId, {
        centroCostoCodigo: "CC-1",
        centroCostoNombre: "Centro Costo",
        fechaPagoCajaMenor: "2026-06-02",
        conceptoCajaMenor: "Movimiento dev-fac",
      });
    });

    const result = await t.mutation(api.cajasMenores.devolverMovimientoABuzon, {
      movimientoId: seeded.movimientoId,
      ...LIDER,
    });

    const snapshot = await getSnapshot(t);
    const factura = snapshot.facturas.find((row) => row._id === seeded.facturaId);
    const tarea = snapshot.tareas.find((row) => row._id === seeded.tareaId);
    const movimiento = snapshot.movimientos.find((row) => row._id === seeded.movimientoId);
    const asignacion = snapshot.asignaciones.find((row) => row._id === result.asignacionId);
    const audit = snapshot.aprobaciones.find((row) => row.accion === "devolver_buzon");

    expect(movimiento?.estado).toBe("anulado");
    expect(movimiento?.reembolsoId).toBeUndefined();
    expect(factura?.esLegalizacionCajaMenor).toBe(false);
    expect(factura?.cajaMenorId).toBeUndefined();
    expect(factura?.cajaMenorNombre).toBeUndefined();
    expect(factura?.centroCostoCodigo).toBeUndefined();
    expect(factura?.centroCostoNombre).toBeUndefined();
    expect(factura?.fechaPagoCajaMenor).toBeUndefined();
    expect(factura?.conceptoCajaMenor).toBeUndefined();
    expect(snapshot.legalizaciones.every((row) => row.estado === "reemplazada")).toBe(true);
    expect(tarea).toMatchObject({
      estado: "revision_lider",
      currentAsignacionId: result.asignacionId,
      asignadoAUserId: LIDER.actorUserId,
      liderProcesoUserId: LIDER.actorUserId,
    });
    expect(asignacion).toMatchObject({
      fase: "revision_lider",
      rol: "lider",
      estado: "pendiente",
      asignadoAUserId: LIDER.actorUserId,
    });
    expect(audit).toMatchObject({
      accion: "devolver_buzon",
      actorUserId: LIDER.actorUserId,
      estadoAnterior: "reembolso_caja_menor",
      estadoNuevo: "revision_lider",
      comentario: `Documento devuelto a Revisión Líder y desvinculado de Caja Menor por ${LIDER.actorNombre}`,
    });
  });

  test("devolverMovimientoABuzon works for physical receipts", async () => {
    const t = makeTest();
    await seedConfigs(t);
    const cajaMenorId = await seedCaja(t);
    const base = await seedFacturaConTarea(t, {
      suffix: "dev-rec",
      estado: "reembolso_caja_menor",
      total: 45_000,
    });
    const movimientoId = await t.run(async (ctx) => {
      await ctx.db.patch("facturacionFacturas", base.facturaId, {
        tipoDocumento: "RECIBO_FISICO_CAJA_MENOR",
        esReciboFisicoCajaMenor: true,
        esLegalizacionCajaMenor: true,
        cajaMenorId,
        cajaMenorNombre: "Caja Obra",
        origen: "recibo_fisico",
      });
      return await ctx.db.insert("facturacionCajaMenorMovimientos", {
        facturaId: base.facturaId,
        cajaMenorId,
        origen: "recibo_fisico",
        estado: "pendiente_reembolso",
        nombreEmpresa: "Proveedor Caja",
        concepto: "Recibo físico",
        fechaPago: "2026-06-03",
        valor: 45_000,
        centroCostoCodigo: "CC-1",
        centroCostoNombre: "Centro Costo",
        actorUserId: LIDER.actorUserId,
        actorNombre: LIDER.actorNombre,
        actorEmail: LIDER.actorEmail,
        creadoEn: NOW,
        actualizadoEn: NOW,
      });
    });

    const result = await t.mutation(api.cajasMenores.devolverMovimientoABuzon, {
      movimientoId,
      ...LIDER,
    });

    const snapshot = await getSnapshot(t);
    const tarea = snapshot.tareas.find((row) => row._id === base.tareaId);
    const movimiento = snapshot.movimientos.find((row) => row._id === movimientoId);
    expect(movimiento?.estado).toBe("anulado");
    expect(tarea?.estado).toBe("revision_lider");
    expect(tarea?.asignadoAUserId).toBe(LIDER.actorUserId);
    expect(result.asignacionId).toBeTruthy();
  });

  test("devolverMovimientoABuzon rejects invalid cases and is idempotent", async () => {
    const t = makeTest();
    await seedConfigs(t);
    const cajaMenorId = await seedCaja(t);
    const pending = await seedMovimientoPendiente(t, {
      cajaMenorId,
      suffix: "dev-ok",
      estadoTarea: "reembolso_caja_menor",
    });
    const foreignCajaId = await seedCaja(t, [OTRO_USUARIO.actorUserId]);
    const foreign = await seedMovimientoPendiente(t, {
      cajaMenorId: foreignCajaId,
      suffix: "dev-foreign",
      estadoTarea: "reembolso_caja_menor",
    });
    await t.run(async (ctx) => {
      await ctx.db.patch("facturacionCajaMenorMovimientos", foreign.movimientoId, {
        actorUserId: OTRO_USUARIO.actorUserId,
        actorNombre: OTRO_USUARIO.actorNombre,
        actorEmail: OTRO_USUARIO.actorEmail,
      });
    });

    await t.mutation(api.cajasMenores.generarReembolsoCajaMenor, {
      cajaMenorId,
      movimientoIds: [pending.movimientoId],
      custodioUserId: LIDER.actorUserId,
      custodioNombre: LIDER.actorNombre,
      custodioEmail: LIDER.actorEmail,
      ...LIDER,
    });
    const enReembolso = (await getSnapshot(t)).movimientos.find(
      (row) => row._id === pending.movimientoId
    );
    expect(enReembolso?.estado).toBe("en_reembolso");

    await expect(
      t.mutation(api.cajasMenores.devolverMovimientoABuzon, {
        movimientoId: pending.movimientoId,
        ...LIDER,
      })
    ).rejects.toThrow(/pendientes de reembolso/i);

    await expect(
      t.mutation(api.cajasMenores.devolverMovimientoABuzon, {
        movimientoId: foreign.movimientoId,
        ...LIDER,
      })
    ).rejects.toThrow(/custodio|asignado/i);

    const retrySeed = await seedMovimientoPendiente(t, {
      cajaMenorId,
      suffix: "dev-retry",
      estadoTarea: "reembolso_caja_menor",
    });
    await t.mutation(api.cajasMenores.devolverMovimientoABuzon, {
      movimientoId: retrySeed.movimientoId,
      ...LIDER,
    });
    const afterFirst = await getSnapshot(t);
    const asignacionesAfterFirst = afterFirst.asignaciones.filter(
      (row) =>
        row.facturaId === retrySeed.facturaId &&
        row.fase === "revision_lider" &&
        row.estado === "pendiente"
    );
    const auditsAfterFirst = afterFirst.aprobaciones.filter(
      (row) => row.facturaId === retrySeed.facturaId && row.accion === "devolver_buzon"
    );
    expect(asignacionesAfterFirst).toHaveLength(1);
    expect(auditsAfterFirst).toHaveLength(1);

    await expect(
      t.mutation(api.cajasMenores.devolverMovimientoABuzon, {
        movimientoId: retrySeed.movimientoId,
        ...LIDER,
      })
    ).rejects.toThrow(/pendientes de reembolso/i);

    const afterRetry = await getSnapshot(t);
    expect(
      afterRetry.asignaciones.filter(
        (row) =>
          row.facturaId === retrySeed.facturaId &&
          row.fase === "revision_lider" &&
          row.estado === "pendiente"
      )
    ).toHaveLength(1);
    expect(
      afterRetry.aprobaciones.filter(
        (row) => row.facturaId === retrySeed.facturaId && row.accion === "devolver_buzon"
      )
    ).toHaveLength(1);
  });

  test("draft phase attachments persist, confirm on decision, and treasury avoids duplicates", async () => {
    const t = makeTest();
    await seedConfigs(t);
    const cajaMenorId = await seedCaja(t);
    const movimiento = await seedMovimientoPendiente(t, {
      cajaMenorId,
      suffix: "draft-att",
      estadoTarea: "reembolso_caja_menor",
      valor: 90_000,
    });

    await t.mutation(api.cajasMenores.generarReembolsoCajaMenor, {
      cajaMenorId,
      movimientoIds: [movimiento.movimientoId],
      custodioUserId: LIDER.actorUserId,
      custodioNombre: LIDER.actorNombre,
      custodioEmail: LIDER.actorEmail,
      ...LIDER,
    });
    const reembolsoId = (await getSnapshot(t)).reembolsos[0]!._id;

    const storageId = await storeTestFile(t, "soporte-revision.pdf");
    const adjuntoId = await t.mutation(api.cajasMenores.crearAdjuntoBorradorReembolsoCajaMenor, {
      reembolsoId,
      storageId,
      nombre: "soporte-revision.pdf",
      mimeType: "application/pdf",
      ...REVISOR,
    });

    const detalleConBorrador = await t.query(api.cajasMenores.obtenerDetalleReembolsoCajaMenor, {
      reembolsoId,
      actorUserId: REVISOR.actorUserId,
      actorRol: REVISOR.actorRol,
    });
    expect(detalleConBorrador?.adjuntosBorradorFaseActual).toHaveLength(1);
    expect(detalleConBorrador?.adjuntosBorradorFaseActual[0]?._id).toBe(adjuntoId);
    expect(detalleConBorrador?.timeline.every((e) => e.adjuntos.length === 0)).toBe(true);

    // Another authorized actor can see but not delete
    const detalleGerenciaVista = await t.query(api.cajasMenores.obtenerDetalleReembolsoCajaMenor, {
      reembolsoId,
      actorUserId: REVISOR.actorUserId,
    });
    expect(detalleGerenciaVista?.adjuntosBorradorFaseActual[0]?.puedeEliminar).toBe(true);

    await expect(
      t.mutation(api.cajasMenores.eliminarAdjuntoBorradorReembolsoCajaMenor, {
        adjuntoId,
        ...GERENCIA,
      })
    ).rejects.toThrow(/quien subió/i);

    await t.mutation(api.cajasMenores.revisarReembolsoCajaMenor, {
      reembolsoId,
      decision: "aprobar",
      contadorUserId: CONTADOR.usuarioId,
      ...REVISOR,
    });

    const afterReview = await t.run(async (ctx) =>
      ctx.db
        .query("cajasMenoresReembolsoAdjuntos")
        .withIndex("by_reembolsoId", (q) => q.eq("reembolsoId", reembolsoId))
        .collect()
    );
    expect(afterReview).toHaveLength(1);
    expect(afterReview[0]?.estado).toBe("confirmado");

    const detalleAfter = await t.query(api.cajasMenores.obtenerDetalleReembolsoCajaMenor, {
      reembolsoId,
      actorUserId: GERENCIA.actorUserId,
    });
    expect(detalleAfter?.adjuntosBorradorFaseActual).toHaveLength(0);
    const revisionEvent = detalleAfter?.timeline.find((e) => e.id === "revision");
    expect(revisionEvent?.adjuntos).toHaveLength(1);

    // Legacy rows without estado remain confirmados
    await t.run(async (ctx) => {
      await ctx.db.patch("cajasMenoresReembolsoAdjuntos", afterReview[0]!._id, { estado: undefined });
    });
    const detalleLegacy = await t.query(api.cajasMenores.obtenerDetalleReembolsoCajaMenor, {
      reembolsoId,
      actorUserId: GERENCIA.actorUserId,
    });
    const revisionLegacy = detalleLegacy?.timeline.find((e) => e.id === "revision");
    expect(revisionLegacy?.adjuntos).toHaveLength(1);

    await avanzarImpuestosHastaGerencia(t, reembolsoId);

    await t.mutation(api.cajasMenores.decidirReembolsoCajaMenor, {
      reembolsoId,
      decision: "aprobar",
      ...GERENCIA,
    });

    const comprobanteStorageId = await storeTestFile(t, "comprobante.pdf");
    const comprobanteId = await t.mutation(
      api.cajasMenores.crearAdjuntoBorradorReembolsoCajaMenor,
      {
        reembolsoId,
        storageId: comprobanteStorageId,
        nombre: "comprobante.pdf",
        mimeType: "application/pdf",
        ...TESORERO,
      }
    );

    await t.mutation(api.cajasMenores.cargarComprobantePagoReembolsoCajaMenor, {
      reembolsoId,
      adjuntoId: comprobanteId,
      ...TESORERO,
    });

    const tesoreriaAdjuntos = await t.run(async (ctx) =>
      ctx.db
        .query("cajasMenoresReembolsoAdjuntos")
        .withIndex("by_reembolsoId", (q) => q.eq("reembolsoId", reembolsoId))
        .collect()
    );
    const tesoreriaOnly = tesoreriaAdjuntos.filter((a) => a.etapa === "tesoreria");
    expect(tesoreriaOnly).toHaveLength(1);
    expect(tesoreriaOnly[0]?.estado).toBe("confirmado");
    expect(String(tesoreriaOnly[0]?.storageId)).toBe(String(comprobanteStorageId));
  });
});

describe("Contabilidad (Impuestos) reembolso workflow", () => {
  test("revisor approval without contadorUserId throws when no previous contador is set", async () => {
    const t = makeTest();
    await seedConfigs(t);
    const cajaMenorId = await seedCaja(t);
    const { reembolsoId } = await seedReembolsoPendienteRevision(t, cajaMenorId, "no-contador");

    await expect(
      t.mutation(api.cajasMenores.revisarReembolsoCajaMenor, {
        reembolsoId,
        decision: "aprobar",
        ...REVISOR,
      })
    ).rejects.toThrow("Selecciona el contador de Impuestos/Contabilidad.");
  });

  test("revisor approval with an unconfigured contador throws", async () => {
    const t = makeTest();
    await seedConfigs(t);
    const cajaMenorId = await seedCaja(t);
    const { reembolsoId } = await seedReembolsoPendienteRevision(t, cajaMenorId, "bad-contador");

    await expect(
      t.mutation(api.cajasMenores.revisarReembolsoCajaMenor, {
        reembolsoId,
        decision: "aprobar",
        contadorUserId: "contador-no-configurado",
        ...REVISOR,
      })
    ).rejects.toThrow("no está configurado en Contadores Impuestos");
  });

  test("only the assigned contador can decide in Contabilidad; the assigned one can", async () => {
    const t = makeTest();
    await seedConfigs(t);
    await seedContadoresImpuestos(t, [CONTADOR, CONTADOR_B]);
    const cajaMenorId = await seedCaja(t);
    const { reembolsoId } = await seedReembolsoPendienteImpuestos(t, cajaMenorId, "assigned-only");

    await expect(
      t.mutation(api.cajasMenores.decidirRevisionImpuestosReembolsoCajaMenor, {
        reembolsoId,
        decision: "aprobar",
        ...CONTADOR_B_ACTOR,
      })
    ).rejects.toThrow(
      "Sólo el contador asignado y configurado puede decidir esta solicitud en Contabilidad."
    );

    await enviarImpuestosAEventosDian(t, reembolsoId);

    const snapshot = await getSnapshot(t);
    expect(snapshot.reembolsos[0].estado).toBe("pendiente_eventos_dian");
  });

  test("Contabilidad queue filters by assigned contador; Gerencia sees all pendientesContabilidad", async () => {
    const t = makeTest();
    await seedConfigs(t);
    await seedContadoresImpuestos(t, [CONTADOR, CONTADOR_B]);
    const cajaMenorId = await seedCaja(t);
    const first = await seedReembolsoPendienteImpuestos(
      t,
      cajaMenorId,
      "queue-a",
      CONTADOR.usuarioId
    );
    const secondSeed = await seedReembolsoPendienteRevision(t, cajaMenorId, "queue-b");
    await t.mutation(api.cajasMenores.revisarReembolsoCajaMenor, {
      reembolsoId: secondSeed.reembolsoId,
      decision: "aprobar",
      contadorUserId: CONTADOR_B.usuarioId,
      ...REVISOR,
    });

    const dashboardA = await t.query(api.cajasMenores.obtenerDashboardReembolsos, {
      empresas: [EMPRESA],
      actorUserId: CONTADOR.usuarioId,
    });
    const dashboardB = await t.query(api.cajasMenores.obtenerDashboardReembolsos, {
      empresas: [EMPRESA],
      actorUserId: CONTADOR_B.usuarioId,
    });
    const dashboardGf = await t.query(api.cajasMenores.obtenerDashboardReembolsos, {
      empresas: [EMPRESA],
      actorUserId: GERENCIA.actorUserId,
    });

    expect(
      dashboardA.pendientesContabilidad.some(
        (item: { _id: unknown }) => String(item._id) === String(first.reembolsoId)
      )
    ).toBe(true);
    expect(
      dashboardA.pendientesContabilidad.some(
        (item: { _id: unknown }) => String(item._id) === String(secondSeed.reembolsoId)
      )
    ).toBe(false);
    expect(
      dashboardB.pendientesContabilidad.some(
        (item: { _id: unknown }) => String(item._id) === String(secondSeed.reembolsoId)
      )
    ).toBe(true);
    expect(dashboardGf.pendientesContabilidad).toHaveLength(2);
  });

  test("reasignarContadorReembolsoCajaMenor moves to a new contador, requires a comment, and revokes previous access immediately", async () => {
    const t = makeTest();
    await seedConfigs(t);
    await seedContadoresImpuestos(t, [CONTADOR, CONTADOR_B]);
    const cajaMenorId = await seedCaja(t);
    const { reembolsoId } = await seedReembolsoPendienteImpuestos(t, cajaMenorId, "mover");

    await expect(
      t.mutation(api.cajasMenores.reasignarContadorReembolsoCajaMenor, {
        reembolsoId,
        contadorUserId: CONTADOR_B.usuarioId,
        comentario: "",
        ...GERENCIA,
      })
    ).rejects.toThrow("Indica el motivo de la reasignación.");

    await t.mutation(api.cajasMenores.reasignarContadorReembolsoCajaMenor, {
      reembolsoId,
      contadorUserId: CONTADOR_B.usuarioId,
      comentario: "Balanceo de carga entre contadores",
      ...GERENCIA,
    });

    const snapshot = await getSnapshot(t);
    expect(snapshot.reembolsos[0].estado).toBe("pendiente_revision_impuestos");
    expect(snapshot.reembolsos[0].contadorAsignadoUserId).toBe(CONTADOR_B.usuarioId);

    // The previous contador loses access to decide immediately.
    await expect(
      t.mutation(api.cajasMenores.decidirRevisionImpuestosReembolsoCajaMenor, {
        reembolsoId,
        decision: "aprobar",
        ...CONTADOR_ACTOR,
      })
    ).rejects.toThrow(
      "Sólo el contador asignado y configurado puede decidir esta solicitud en Contabilidad."
    );

    const detallePrevio = await t.query(api.cajasMenores.obtenerDetalleReembolsoCajaMenor, {
      reembolsoId,
      actorUserId: CONTADOR.usuarioId,
    });
    expect(detallePrevio?.puedeActuar).toBe(false);

    // The newly assigned contador can decide.
    await enviarImpuestosAEventosDian(t, reembolsoId, {
      eventosDianUserId: EVENTOS_DIAN.usuarioId,
      actor: CONTADOR_B_ACTOR,
    });
    const after = await getSnapshot(t);
    expect(after.reembolsos[0].estado).toBe("pendiente_eventos_dian");
  });

  test("Contabilidad approval sends to Eventos DIAN; Eventos DIAN approval moves to pendiente_aprobacion with attachments and an audit trail", async () => {
    const t = makeTest();
    await seedConfigs(t);
    const cajaMenorId = await seedCaja(t);
    const { reembolsoId } = await seedReembolsoPendienteImpuestos(t, cajaMenorId, "contab-approve");
    const storageId = await storeTestFile(t, "contabilidad-aprobado.pdf");

    await enviarImpuestosAEventosDian(t, reembolsoId, {
      comentario: "Impuestos verificados",
      adjuntos: [{ storageId, nombre: "contabilidad-aprobado.pdf", mimeType: "application/pdf" }],
    });

    let snapshot = await getSnapshot(t);
    expect(snapshot.reembolsos[0].estado).toBe("pendiente_eventos_dian");
    expect(snapshot.reembolsos[0].contadorUserId).toBe(CONTADOR.usuarioId);

    await aprobarEventosDianEnGerencia(t, reembolsoId);
    snapshot = await getSnapshot(t);
    expect(snapshot.reembolsos[0].estado).toBe("pendiente_aprobacion");

    const adjuntos = await t.query(internal.cajasMenores.obtenerAdjuntosReembolsoCajaMenor, {
      reembolsoId,
    });
    expect(
      adjuntos.some(
        (adjunto) =>
          adjunto.etapa === "contabilidad" && adjunto.nombre === "contabilidad-aprobado.pdf"
      )
    ).toBe(true);

    expect(
      snapshot.aprobaciones.some((row) => row.accion === "enviar_eventos_dian_reembolso_caja_menor")
    ).toBe(true);
  });

  test("Contabilidad devolver keeps grouping and reviewer; reenvío reuses the same contador until it is unconfigured", async () => {
    const t = makeTest();
    await seedConfigs(t);
    const cajaMenorId = await seedCaja(t);
    const { reembolsoId, movimientoId } = await seedReembolsoPendienteImpuestos(
      t,
      cajaMenorId,
      "devolver"
    );

    await expect(
      t.mutation(api.cajasMenores.decidirRevisionImpuestosReembolsoCajaMenor, {
        reembolsoId,
        decision: "devolver",
        ...CONTADOR_ACTOR,
      })
    ).rejects.toThrow("Indica el motivo de la devolución a Revisor Caja Menor.");

    await t.mutation(api.cajasMenores.decidirRevisionImpuestosReembolsoCajaMenor, {
      reembolsoId,
      decision: "devolver",
      comentario: "Falta soporte tributario",
      ...CONTADOR_ACTOR,
    });

    let snapshot = await getSnapshot(t);
    expect(snapshot.reembolsos[0].estado).toBe("pendiente_revision");
    expect(snapshot.reembolsos[0].reviewAssignedUserId).toBe(REVISOR.actorUserId);
    const movimientoDevuelto = snapshot.movimientos.find((row) => row._id === movimientoId);
    expect(movimientoDevuelto?.estado).toBe("en_reembolso");
    expect(movimientoDevuelto?.reembolsoId).toEqual(reembolsoId);

    const dashboardContador = await t.query(api.cajasMenores.obtenerDashboardReembolsos, {
      empresas: [EMPRESA],
      actorUserId: CONTADOR.usuarioId,
    });
    const dashboardRevisor = await t.query(api.cajasMenores.obtenerDashboardReembolsos, {
      empresas: [EMPRESA],
      actorUserId: REVISOR.actorUserId,
    });
    expect(
      dashboardContador.pendientesContabilidad.some(
        (item: { _id: unknown }) => String(item._id) === String(reembolsoId)
      )
    ).toBe(false);
    const itemRevision = dashboardRevisor.pendientesRevision.find(
      (item: { _id: unknown }) => String(item._id) === String(reembolsoId)
    );
    expect(itemRevision).toBeDefined();
    expect(itemRevision?.puedeRevisar).toBe(true);
    expect(itemRevision?.puedeReasignarRevision).toBe(true);

    // Reenvío sin nueva selección reutiliza el mismo contador.
    await t.mutation(api.cajasMenores.revisarReembolsoCajaMenor, {
      reembolsoId,
      decision: "aprobar",
      ...REVISOR,
    });
    snapshot = await getSnapshot(t);
    expect(snapshot.reembolsos[0].estado).toBe("pendiente_revision_impuestos");
    expect(snapshot.reembolsos[0].contadorAsignadoUserId).toBe(CONTADOR.usuarioId);

    const dashboardContadorTrasReenvio = await t.query(
      api.cajasMenores.obtenerDashboardReembolsos,
      {
        empresas: [EMPRESA],
        actorUserId: CONTADOR.usuarioId,
      }
    );
    expect(
      dashboardContadorTrasReenvio.pendientesContabilidad.some(
        (item: { _id: unknown }) => String(item._id) === String(reembolsoId)
      )
    ).toBe(true);

    // Devuelve de nuevo y, mientras tanto, el contador deja de estar configurado.
    await t.mutation(api.cajasMenores.decidirRevisionImpuestosReembolsoCajaMenor, {
      reembolsoId,
      decision: "devolver",
      comentario: "Aún falta información",
      ...CONTADOR_ACTOR,
    });
    await seedContadoresImpuestos(t, [CONTADOR_B]);

    await expect(
      t.mutation(api.cajasMenores.revisarReembolsoCajaMenor, {
        reembolsoId,
        decision: "aprobar",
        ...REVISOR,
      })
    ).rejects.toThrow(
      "El contador anterior ya no está configurado. Selecciona un contador válido."
    );

    await t.mutation(api.cajasMenores.revisarReembolsoCajaMenor, {
      reembolsoId,
      decision: "aprobar",
      contadorUserId: CONTADOR_B.usuarioId,
      ...REVISOR,
    });
    const final = await getSnapshot(t);
    expect(final.reembolsos[0].contadorAsignadoUserId).toBe(CONTADOR_B.usuarioId);
  });

  test("multiple devolver/reenvío cycles keep full contabilidad history in events and timeline", async () => {
    const t = makeTest();
    await seedConfigs(t);
    const cajaMenorId = await seedCaja(t);
    const { reembolsoId } = await seedReembolsoPendienteImpuestos(t, cajaMenorId, "cycles");

    for (let cycle = 0; cycle < 3; cycle += 1) {
      await t.mutation(api.cajasMenores.decidirRevisionImpuestosReembolsoCajaMenor, {
        reembolsoId,
        decision: "devolver",
        comentario: `Ciclo ${cycle}: falta ajuste`,
        ...CONTADOR_ACTOR,
      });
      await t.mutation(api.cajasMenores.revisarReembolsoCajaMenor, {
        reembolsoId,
        decision: "aprobar",
        ...REVISOR,
      });
    }

    const eventos = await t.run(async (ctx) =>
      ctx.db
        .query("cajasMenoresReembolsoEventos")
        .withIndex("by_reembolsoId", (q) => q.eq("reembolsoId", reembolsoId))
        .collect()
    );
    // 1 initial assignment + 3 × (devolucion + reenvío/asignación) = 7 events.
    expect(eventos).toHaveLength(7);
    expect(eventos.filter((evento) => evento.tipo === "devolucion")).toHaveLength(3);
    expect(eventos.filter((evento) => evento.tipo === "asignacion")).toHaveLength(4);

    const detalle = await t.query(api.cajasMenores.obtenerDetalleReembolsoCajaMenor, {
      reembolsoId,
      actorUserId: GERENCIA.actorUserId,
    });
    const contabilidadTimeline = detalle?.timeline.filter(
      (evento) => evento.etapa === "contabilidad"
    );
    expect(contabilidadTimeline).toHaveLength(7);
    expect(contabilidadTimeline?.filter((evento) => evento.tipo === "devuelto")).toHaveLength(3);
  });

  test("Contabilidad rechazo ungroups all movements back to pendiente_reembolso", async () => {
    const t = makeTest();
    await seedConfigs(t);
    const cajaMenorId = await seedCaja(t);
    const first = await seedMovimientoPendiente(t, {
      cajaMenorId,
      suffix: "contab-rej-1",
      estadoTarea: "reembolso_caja_menor",
      valor: 40_000,
    });
    const second = await seedMovimientoPendiente(t, {
      cajaMenorId,
      suffix: "contab-rej-2",
      estadoTarea: "reembolso_caja_menor",
      valor: 60_000,
    });
    await t.mutation(api.cajasMenores.generarReembolsoCajaMenor, {
      cajaMenorId,
      movimientoIds: [first.movimientoId, second.movimientoId],
      custodioUserId: LIDER.actorUserId,
      custodioNombre: LIDER.actorNombre,
      custodioEmail: LIDER.actorEmail,
      ...LIDER,
    });
    const reembolsoId = (await getSnapshot(t)).reembolsos[0]._id;
    await t.mutation(api.cajasMenores.revisarReembolsoCajaMenor, {
      reembolsoId,
      decision: "aprobar",
      contadorUserId: CONTADOR.usuarioId,
      ...REVISOR,
    });

    await expect(
      t.mutation(api.cajasMenores.decidirRevisionImpuestosReembolsoCajaMenor, {
        reembolsoId,
        decision: "rechazar",
        ...CONTADOR_ACTOR,
      })
    ).rejects.toThrow("Indica el motivo del rechazo.");

    await t.mutation(api.cajasMenores.decidirRevisionImpuestosReembolsoCajaMenor, {
      reembolsoId,
      decision: "rechazar",
      comentario: "Gastos no deducibles",
      ...CONTADOR_ACTOR,
    });

    const snapshot = await getSnapshot(t);
    expect(snapshot.reembolsos[0].estado).toBe("rechazado");
    expect(
      snapshot.movimientos.every(
        (movimiento) => movimiento.estado === "pendiente_reembolso" && !movimiento.reembolsoId
      )
    ).toBe(true);
  });

  test("grandfathered reembolso already in pendiente_aprobacion skips impuestos and continues with GF", async () => {
    const t = makeTest();
    await seedConfigs(t);
    const cajaMenorId = await seedCaja(t);
    const { reembolsoId } = await seedReembolsoPendienteRevision(t, cajaMenorId, "grandfathered");

    // Simulates a legacy reembolso that skipped the new Contabilidad phase entirely
    // (e.g. migrated straight from pendiente_revision to pendiente_aprobacion).
    await t.run(async (ctx) => {
      const { patchReembolsoConBandeja } = await import("./lib/cajaMenorBandeja");
      await patchReembolsoConBandeja(ctx, reembolsoId, {
        estado: "pendiente_aprobacion",
        reviewerUserId: REVISOR.actorUserId,
        reviewerNombre: REVISOR.actorNombre,
        reviewerEmail: REVISOR.actorEmail,
        reviewerDecisionEn: NOW,
        actualizadoEn: NOW,
      });
    });

    await t.mutation(api.cajasMenores.decidirReembolsoCajaMenor, {
      reembolsoId,
      decision: "aprobar",
      ...GERENCIA,
    });

    const snapshot = await getSnapshot(t);
    expect(snapshot.reembolsos[0].estado).toBe("pendiente_pago_tesoreria");
    expect(snapshot.reembolsos[0].tesoreroUserId).toBe(TESORERO.actorUserId);
  });

  test("usuarioPuedeAccederReembolsoCajaMenor and obtenerEmpresasContadorImpuestos recognize a configured contador", async () => {
    const t = makeTest();
    await seedConfigs(t);

    const puedeAcceder = await t.query(internal.cajasMenores.usuarioPuedeAccederReembolsoCajaMenor, {
      empresa: EMPRESA,
      actorUserId: CONTADOR.usuarioId,
    });
    expect(puedeAcceder).toBe(true);

    const noConfigurado = await t.query(internal.cajasMenores.usuarioPuedeAccederReembolsoCajaMenor, {
      empresa: EMPRESA,
      actorUserId: OTRO_USUARIO.actorUserId,
    });
    expect(noConfigurado).toBe(false);

    const empresas = await t.query(internal.cajasMenores.obtenerEmpresasContadorImpuestos, {
      actorUserId: CONTADOR.usuarioId,
    });
    expect(empresas).toContain(EMPRESA);

    // The configured staff lists are for the reimbursement role holders.
    const contador = await asUser(t, { id: CONTADOR.usuarioId });
    const listado = (await contador.query(api.cajasMenores.listarContadoresImpuestosConfigurados, {
      empresa: EMPRESA,
    })) as Array<{ usuarioId: string }>;
    expect(listado.map((contador) => contador.usuarioId)).toContain(CONTADOR.usuarioId);
  });

  test("Gerencia devolver to Contabilidad removes from GF queue and preserves grouping", async () => {
    const t = makeTest();
    await seedConfigs(t);
    const cajaMenorId = await seedCaja(t);
    const { reembolsoId, movimientoId } = await seedReembolsoPendienteAprobacion(
      t,
      cajaMenorId,
      "gf-dev-contab"
    );

    await expect(
      t.mutation(api.cajasMenores.decidirReembolsoCajaMenor, {
        reembolsoId,
        decision: "devolver",
        destinoDevolucion: "contabilidad",
        responsableDestinoUserId: CONTADOR.usuarioId,
        ...GERENCIA,
      })
    ).rejects.toThrow("Indica el motivo de la devolución.");

    await t.mutation(api.cajasMenores.decidirReembolsoCajaMenor, {
      reembolsoId,
      decision: "devolver",
      destinoDevolucion: "contabilidad",
      responsableDestinoUserId: CONTADOR.usuarioId,
      comentario: "Ajustar soporte tributario",
      ...GERENCIA,
    });

    const snapshot = await getSnapshot(t);
    expect(snapshot.reembolsos[0].estado).toBe("pendiente_revision_impuestos");
    expect(snapshot.reembolsos[0].contadorAsignadoUserId).toBe(CONTADOR.usuarioId);
    const movimiento = snapshot.movimientos.find((row) => row._id === movimientoId);
    expect(movimiento?.estado).toBe("en_reembolso");
    expect(movimiento?.reembolsoId).toEqual(reembolsoId);

    const dashboardGf = await t.query(api.cajasMenores.obtenerDashboardReembolsos, {
      empresas: [EMPRESA],
      actorUserId: GERENCIA.actorUserId,
    });
    const dashboardContador = await t.query(api.cajasMenores.obtenerDashboardReembolsos, {
      empresas: [EMPRESA],
      actorUserId: CONTADOR.usuarioId,
    });
    expect(
      dashboardGf.pendientesAprobacion.some(
        (item: { _id: unknown }) => String(item._id) === String(reembolsoId)
      )
    ).toBe(false);
    const itemContabilidad = dashboardContador.pendientesContabilidad.find(
      (item: { _id: unknown }) => String(item._id) === String(reembolsoId)
    );
    expect(itemContabilidad).toBeDefined();
    expect(itemContabilidad?.puedeDecidirContabilidad).toBe(true);

    const detalle = await t.query(api.cajasMenores.obtenerDetalleReembolsoCajaMenor, {
      reembolsoId,
      actorUserId: GERENCIA.actorUserId,
    });
    const devolucion = detalle?.timeline.find(
      (evento) => evento.titulo === "Devuelto por Gerencia Financiera a Impuestos/Contabilidad"
    );
    expect(devolucion?.comentario).toBe("Ajustar soporte tributario");
  });

  test("Gerencia devolver to Revisor enables direct resend to Gerencia without Contabilidad", async () => {
    const t = makeTest();
    await seedConfigs(t);
    const cajaMenorId = await seedCaja(t);
    const { reembolsoId, movimientoId } = await seedReembolsoPendienteAprobacion(
      t,
      cajaMenorId,
      "gf-dev-rev"
    );

    await t.mutation(api.cajasMenores.decidirReembolsoCajaMenor, {
      reembolsoId,
      decision: "devolver",
      destinoDevolucion: "revision",
      responsableDestinoUserId: REVISOR.actorUserId,
      comentario: "Corregir concepto",
      ...GERENCIA,
    });

    let snapshot = await getSnapshot(t);
    expect(snapshot.reembolsos[0].estado).toBe("pendiente_revision");
    expect(snapshot.reembolsos[0].retornoGerenciaPendienteEn).toBe("revision");
    expect(snapshot.reembolsos[0].reviewAssignedUserId).toBe(REVISOR.actorUserId);

    const dashboardRevisor = await t.query(api.cajasMenores.obtenerDashboardReembolsos, {
      empresas: [EMPRESA],
      actorUserId: REVISOR.actorUserId,
    });
    const itemRevision = dashboardRevisor.pendientesRevision.find(
      (item: { _id: unknown }) => String(item._id) === String(reembolsoId)
    );
    expect(itemRevision?.puedeRevisar).toBe(true);

    await t.mutation(api.cajasMenores.revisarReembolsoCajaMenor, {
      reembolsoId,
      decision: "aprobar",
      destinoAprobacion: "gerencia",
      comentario: "Corregido, vuelve a GF",
      ...REVISOR,
    });

    snapshot = await getSnapshot(t);
    expect(snapshot.reembolsos[0].estado).toBe("pendiente_aprobacion");
    expect(snapshot.reembolsos[0].permiteReenvioDirectoGerencia).toBeUndefined();
    const movimiento = snapshot.movimientos.find((row) => row._id === movimientoId);
    expect(movimiento?.estado).toBe("en_reembolso");
    expect(movimiento?.reembolsoId).toEqual(reembolsoId);

    const detalle = await t.query(api.cajasMenores.obtenerDetalleReembolsoCajaMenor, {
      reembolsoId,
      actorUserId: GERENCIA.actorUserId,
    });
    expect(
      detalle?.timeline.some(
        (evento) => evento.titulo === "Reenviado a Gerencia Financiera por Revisor Caja Menor"
      )
    ).toBe(true);
  });

  test("Reviewer cannot bypass Contabilidad unless GF returned directly to revision", async () => {
    const t = makeTest();
    await seedConfigs(t);
    const cajaMenorId = await seedCaja(t);
    const { reembolsoId } = await seedReembolsoPendienteRevision(t, cajaMenorId, "no-bypass");

    await expect(
      t.mutation(api.cajasMenores.revisarReembolsoCajaMenor, {
        reembolsoId,
        decision: "aprobar",
        destinoAprobacion: "gerencia",
        ...REVISOR,
      })
    ).rejects.toThrow(
      "Este reembolso debe pasar por Impuestos/Contabilidad antes de Gerencia Financiera."
    );

    const { reembolsoId: returnedId } = await seedReembolsoPendienteImpuestos(
      t,
      cajaMenorId,
      "contab-return"
    );
    await t.mutation(api.cajasMenores.decidirRevisionImpuestosReembolsoCajaMenor, {
      reembolsoId: returnedId,
      decision: "devolver",
      comentario: "Falta soporte",
      ...CONTADOR_ACTOR,
    });

    await expect(
      t.mutation(api.cajasMenores.revisarReembolsoCajaMenor, {
        reembolsoId: returnedId,
        decision: "aprobar",
        destinoAprobacion: "gerencia",
        ...REVISOR,
      })
    ).rejects.toThrow(
      "Este reembolso debe pasar por Impuestos/Contabilidad antes de Gerencia Financiera."
    );
  });

  test("GF devolver to Revisor then Contabilidad route still reaches Gerencia", async () => {
    const t = makeTest();
    await seedConfigs(t);
    const cajaMenorId = await seedCaja(t);
    const { reembolsoId } = await seedReembolsoPendienteAprobacion(
      t,
      cajaMenorId,
      "gf-route-contab"
    );

    await t.mutation(api.cajasMenores.decidirReembolsoCajaMenor, {
      reembolsoId,
      decision: "devolver",
      destinoDevolucion: "revision",
      responsableDestinoUserId: REVISOR.actorUserId,
      comentario: "Revisar nuevamente",
      ...GERENCIA,
    });

    await t.mutation(api.cajasMenores.revisarReembolsoCajaMenor, {
      reembolsoId,
      decision: "aprobar",
      destinoAprobacion: "contabilidad",
      contadorUserId: CONTADOR.usuarioId,
      ...REVISOR,
    });

    await avanzarImpuestosHastaGerencia(t, reembolsoId);

    const snapshot = await getSnapshot(t);
    expect(snapshot.reembolsos[0].estado).toBe("pendiente_aprobacion");
  });
});

describe("Eventos DIAN reembolso workflow", () => {
  test("listarEventosDianConfigurados reads normalized config and legacy fallback", async () => {
    const t = makeTest();
    await seedConfigs(t);
    await seedEventosDian(t, [EVENTOS_DIAN, EVENTOS_DIAN_B]);

    const eventosDian = await asUser(t, { id: EVENTOS_DIAN.usuarioId });
    const listado = (await eventosDian.query(api.cajasMenores.listarEventosDianConfigurados, {
      empresa: EMPRESA,
    })) as Array<{ usuarioId: string }>;
    expect(listado.map((usuario) => usuario.usuarioId)).toEqual([
      EVENTOS_DIAN.usuarioId,
      EVENTOS_DIAN_B.usuarioId,
    ]);

    await t.run(async (ctx) => {
      const rows = await ctx.db
        .query("facturacionConfiguracionUsuarios")
        .withIndex("by_empresa_clave", (q) =>
          q.eq("empresa", EMPRESA).eq("clave", "eventos_dian")
        )
        .collect();
      for (const row of rows) {
        await ctx.db.delete("facturacionConfiguracionUsuarios", row._id);
      }
    });

    const legacyOnly = (await eventosDian.query(api.cajasMenores.listarEventosDianConfigurados, {
      empresa: EMPRESA,
    })) as Array<{ usuarioId: string }>;
    expect(legacyOnly.map((usuario) => usuario.usuarioId)).toContain(EVENTOS_DIAN.usuarioId);
  });

  test("usuarioPuedeAccederReembolsoCajaMenor recognizes configured Eventos DIAN user", async () => {
    const t = makeTest();
    await seedConfigs(t);

    const puedeAcceder = await t.query(internal.cajasMenores.usuarioPuedeAccederReembolsoCajaMenor, {
      empresa: EMPRESA,
      actorUserId: EVENTOS_DIAN.usuarioId,
    });
    expect(puedeAcceder).toBe(true);

    const noConfigurado = await t.query(internal.cajasMenores.usuarioPuedeAccederReembolsoCajaMenor, {
      empresa: EMPRESA,
      actorUserId: OTRO_USUARIO.actorUserId,
    });
    expect(noConfigurado).toBe(false);

    const empresas = await t.query(internal.cajasMenores.obtenerEmpresasEventosDian, {
      actorUserId: EVENTOS_DIAN.usuarioId,
    });
    expect(empresas).toContain(EMPRESA);
  });

  test("Impuestos cannot send to Eventos DIAN without selecting a responsable", async () => {
    const t = makeTest();
    await seedConfigs(t);
    const cajaMenorId = await seedCaja(t);
    const { reembolsoId } = await seedReembolsoPendienteImpuestos(t, cajaMenorId, "no-eventos");

    await expect(
      t.mutation(api.cajasMenores.decidirRevisionImpuestosReembolsoCajaMenor, {
        reembolsoId,
        decision: "aprobar",
        ...CONTADOR_ACTOR,
      })
    ).rejects.toThrow("Selecciona el responsable de Eventos DIAN.");
  });

  test("Impuestos cannot send with unconfigured Eventos DIAN user", async () => {
    const t = makeTest();
    await seedConfigs(t);
    const cajaMenorId = await seedCaja(t);
    const { reembolsoId } = await seedReembolsoPendienteImpuestos(t, cajaMenorId, "bad-eventos");

    await expect(
      t.mutation(api.cajasMenores.decidirRevisionImpuestosReembolsoCajaMenor, {
        reembolsoId,
        decision: "aprobar",
        eventosDianUserId: "eventos-no-configurado",
        ...CONTADOR_ACTOR,
      })
    ).rejects.toThrow("no está configurado en Eventos DIAN");
  });

  test("Eventos DIAN queue is private to assigned responsable; Gerencia sees all", async () => {
    const t = makeTest();
    await seedConfigs(t);
    await seedEventosDian(t, [EVENTOS_DIAN, EVENTOS_DIAN_B]);
    const cajaMenorId = await seedCaja(t);
    const first = await seedReembolsoPendienteEventosDian(
      t,
      cajaMenorId,
      "eventos-queue-a",
      CONTADOR.usuarioId,
      EVENTOS_DIAN.usuarioId
    );
    const second = await seedReembolsoPendienteEventosDian(
      t,
      cajaMenorId,
      "eventos-queue-b",
      CONTADOR.usuarioId,
      EVENTOS_DIAN_B.usuarioId
    );

    const dashboardA = await t.query(api.cajasMenores.obtenerDashboardReembolsos, {
      empresas: [EMPRESA],
      actorUserId: EVENTOS_DIAN.usuarioId,
    });
    const dashboardB = await t.query(api.cajasMenores.obtenerDashboardReembolsos, {
      empresas: [EMPRESA],
      actorUserId: EVENTOS_DIAN_B.usuarioId,
    });
    const dashboardGf = await t.query(api.cajasMenores.obtenerDashboardReembolsos, {
      empresas: [EMPRESA],
      actorUserId: GERENCIA.actorUserId,
    });

    expect(dashboardA.canReviewEventosDian).toBe(true);
    expect(
      dashboardA.pendientesEventosDian.some(
        (item: { _id: unknown }) => String(item._id) === String(first.reembolsoId)
      )
    ).toBe(true);
    expect(
      dashboardA.pendientesEventosDian.some(
        (item: { _id: unknown }) => String(item._id) === String(second.reembolsoId)
      )
    ).toBe(false);
    expect(
      dashboardA.seguimientoEnProceso.some(
        (item: { _id: unknown }) => String(item._id) === String(second.reembolsoId)
      )
    ).toBe(true);
    expect(
      dashboardB.pendientesEventosDian.some(
        (item: { _id: unknown }) => String(item._id) === String(second.reembolsoId)
      )
    ).toBe(true);
    expect(dashboardGf.pendientesEventosDian).toHaveLength(2);
    expect(dashboardGf.seguimientoEnProceso).toHaveLength(0);

    const detalleAjeno = await t.query(api.cajasMenores.obtenerDetalleReembolsoCajaMenor, {
      reembolsoId: second.reembolsoId,
      actorUserId: EVENTOS_DIAN.usuarioId,
    });
    expect(detalleAjeno).not.toBeNull();
    expect(detalleAjeno?.puedeActuar).toBe(false);
  });

  test("only assigned Eventos DIAN user can decide; another Eventos user cannot", async () => {
    const t = makeTest();
    await seedConfigs(t);
    await seedEventosDian(t, [EVENTOS_DIAN, EVENTOS_DIAN_B]);
    const cajaMenorId = await seedCaja(t);
    const { reembolsoId } = await seedReembolsoPendienteEventosDian(
      t,
      cajaMenorId,
      "eventos-decide",
      CONTADOR.usuarioId,
      EVENTOS_DIAN.usuarioId
    );

    await expect(
      t.mutation(api.cajasMenores.decidirEventosDianReembolsoCajaMenor, {
        reembolsoId,
        decision: "aprobar",
        ...EVENTOS_DIAN_B_ACTOR,
      })
    ).rejects.toThrow(
      "Sólo el responsable asignado y configurado en Eventos DIAN puede decidir esta solicitud."
    );

    await aprobarEventosDianEnGerencia(t, reembolsoId);
    const snapshot = await getSnapshot(t);
    expect(snapshot.reembolsos[0].estado).toBe("pendiente_aprobacion");
  });

  test("Eventos DIAN devolver requires contador and returns to Impuestos", async () => {
    const t = makeTest();
    await seedConfigs(t);
    const cajaMenorId = await seedCaja(t);
    const { reembolsoId } = await seedReembolsoPendienteEventosDian(t, cajaMenorId, "eventos-dev");

    await expect(
      t.mutation(api.cajasMenores.decidirEventosDianReembolsoCajaMenor, {
        reembolsoId,
        decision: "devolver",
        ...EVENTOS_DIAN_ACTOR,
      })
    ).rejects.toThrow("Indica el motivo de la devolución a Impuestos/Contabilidad.");

    await t.mutation(api.cajasMenores.decidirEventosDianReembolsoCajaMenor, {
      reembolsoId,
      decision: "devolver",
      contadorUserId: CONTADOR.usuarioId,
      comentario: "Falta clasificación DIAN",
      ...EVENTOS_DIAN_ACTOR,
    });

    const snapshot = await getSnapshot(t);
    expect(snapshot.reembolsos[0].estado).toBe("pendiente_revision_impuestos");
    expect(snapshot.reembolsos[0].contadorAsignadoUserId).toBe(CONTADOR.usuarioId);
  });

  test("Eventos DIAN rechazo ungroups all movements", async () => {
    const t = makeTest();
    await seedConfigs(t);
    const cajaMenorId = await seedCaja(t);
    const { reembolsoId, movimientoId } = await seedReembolsoPendienteEventosDian(
      t,
      cajaMenorId,
      "eventos-rechazo"
    );

    await t.mutation(api.cajasMenores.decidirEventosDianReembolsoCajaMenor, {
      reembolsoId,
      decision: "rechazar",
      comentario: "No cumple requisitos DIAN",
      ...EVENTOS_DIAN_ACTOR,
    });

    const snapshot = await getSnapshot(t);
    expect(snapshot.reembolsos[0].estado).toBe("rechazado");
    const movimiento = snapshot.movimientos.find((row) => row._id === movimientoId);
    expect(movimiento?.estado).toBe("pendiente_reembolso");
    expect(movimiento?.reembolsoId).toBeUndefined();
  });

  test("reasignarEventosDianReembolsoCajaMenor moves visibility to new responsable", async () => {
    const t = makeTest();
    await seedConfigs(t);
    await seedEventosDian(t, [EVENTOS_DIAN, EVENTOS_DIAN_B]);
    const cajaMenorId = await seedCaja(t);
    const { reembolsoId } = await seedReembolsoPendienteEventosDian(
      t,
      cajaMenorId,
      "eventos-mover"
    );

    await expect(
      t.mutation(api.cajasMenores.reasignarEventosDianReembolsoCajaMenor, {
        reembolsoId,
        eventosDianUserId: EVENTOS_DIAN_B.usuarioId,
        comentario: "",
        ...GERENCIA,
      })
    ).rejects.toThrow("Indica el motivo de la reasignación.");

    await t.mutation(api.cajasMenores.reasignarEventosDianReembolsoCajaMenor, {
      reembolsoId,
      eventosDianUserId: EVENTOS_DIAN_B.usuarioId,
      comentario: "Balanceo de carga",
      ...GERENCIA,
    });

    const snapshot = await getSnapshot(t);
    expect(snapshot.reembolsos[0].eventosDianAsignadoUserId).toBe(EVENTOS_DIAN_B.usuarioId);

    await expect(
      t.mutation(api.cajasMenores.decidirEventosDianReembolsoCajaMenor, {
        reembolsoId,
        decision: "aprobar",
        ...EVENTOS_DIAN_ACTOR,
      })
    ).rejects.toThrow(
      "Sólo el responsable asignado y configurado en Eventos DIAN puede decidir esta solicitud."
    );

    await aprobarEventosDianEnGerencia(t, reembolsoId, { actor: EVENTOS_DIAN_B_ACTOR });
    expect((await getSnapshot(t)).reembolsos[0].estado).toBe("pendiente_aprobacion");
  });

  test("Gerencia devolver to Eventos DIAN reuses previous responsable when still configured", async () => {
    const t = makeTest();
    await seedConfigs(t);
    await seedEventosDian(t, [EVENTOS_DIAN, EVENTOS_DIAN_B]);
    const cajaMenorId = await seedCaja(t);
    const { reembolsoId } = await seedReembolsoPendienteAprobacion(t, cajaMenorId, "gf-dev-eventos");

    await t.mutation(api.cajasMenores.decidirReembolsoCajaMenor, {
      reembolsoId,
      decision: "devolver",
      destinoDevolucion: "eventos_dian",
      responsableDestinoUserId: EVENTOS_DIAN.usuarioId,
      comentario: "Ajustar evento DIAN",
      ...GERENCIA,
    });

    const snapshot = await getSnapshot(t);
    expect(snapshot.reembolsos[0].estado).toBe("pendiente_eventos_dian");
    expect(snapshot.reembolsos[0].eventosDianAsignadoUserId).toBe(EVENTOS_DIAN.usuarioId);

    const detalle = await t.query(api.cajasMenores.obtenerDetalleReembolsoCajaMenor, {
      reembolsoId,
      actorUserId: GERENCIA.actorUserId,
    });
    expect(
      detalle?.timeline.some(
        (evento) => evento.titulo === "Devuelto por Gerencia Financiera a Eventos DIAN"
      )
    ).toBe(true);
  });

  test("Impuestos with retornoGerencia contabilidad can reenviar directo a Gerencia", async () => {
    const t = makeTest();
    await seedConfigs(t);
    const cajaMenorId = await seedCaja(t);
    const { reembolsoId } = await seedReembolsoPendienteAprobacion(t, cajaMenorId, "contab-shortcut");

    await t.mutation(api.cajasMenores.decidirReembolsoCajaMenor, {
      reembolsoId,
      decision: "devolver",
      destinoDevolucion: "contabilidad",
      responsableDestinoUserId: CONTADOR.usuarioId,
      comentario: "Corregir impuestos",
      ...GERENCIA,
    });

    await enviarImpuestosAEventosDian(t, reembolsoId, { destinoAprobacion: "gerencia" });

    const snapshot = await getSnapshot(t);
    expect(snapshot.reembolsos[0].estado).toBe("pendiente_aprobacion");
    expect(snapshot.reembolsos[0].retornoGerenciaPendienteEn).toBeUndefined();

    const detalle = await t.query(api.cajasMenores.obtenerDetalleReembolsoCajaMenor, {
      reembolsoId,
      actorUserId: GERENCIA.actorUserId,
    });
    expect(
      detalle?.timeline.some(
        (evento) =>
          evento.titulo ===
          "Reenviado directamente a Gerencia Financiera por Impuestos/Contabilidad"
      )
    ).toBe(true);
  });

  test("Impuestos cannot skip Eventos DIAN without retornoGerencia contabilidad marker", async () => {
    const t = makeTest();
    await seedConfigs(t);
    const cajaMenorId = await seedCaja(t);
    const { reembolsoId } = await seedReembolsoPendienteImpuestos(t, cajaMenorId, "no-shortcut");

    await expect(
      t.mutation(api.cajasMenores.decidirRevisionImpuestosReembolsoCajaMenor, {
        reembolsoId,
        decision: "aprobar",
        destinoAprobacion: "gerencia",
        ...CONTADOR_ACTOR,
      })
    ).rejects.toThrow(
      "Solo puedes enviar directamente a Gerencia cuando Gerencia devolvió el reembolso a Impuestos."
    );
  });

  test("Eventos DIAN attachments are stored under eventos_dian etapa", async () => {
    const t = makeTest();
    await seedConfigs(t);
    const cajaMenorId = await seedCaja(t);
    const { reembolsoId } = await seedReembolsoPendienteEventosDian(
      t,
      cajaMenorId,
      "eventos-adj"
    );
    const storageId = await storeTestFile(t, "soporte-eventos-dian.pdf");

    await t.mutation(api.cajasMenores.decidirEventosDianReembolsoCajaMenor, {
      reembolsoId,
      decision: "aprobar",
      adjuntos: [{ storageId, nombre: "soporte-eventos-dian.pdf", mimeType: "application/pdf" }],
      ...EVENTOS_DIAN_ACTOR,
    });

    const adjuntos = await t.query(internal.cajasMenores.obtenerAdjuntosReembolsoCajaMenor, {
      reembolsoId,
    });
    expect(
      adjuntos.some(
        (adjunto) =>
          adjunto.etapa === "eventos_dian" && adjunto.nombre === "soporte-eventos-dian.pdf"
      )
    ).toBe(true);
  });
});

describe("salto de fases consecutivas reembolso", () => {
  test("revisor y contador mismo usuario envia a Eventos DIAN omitiendo Contabilidad", async () => {
    const t = makeTest();
    await seedConfigs(t);
    await seedContadoresImpuestos(t, [
      {
        usuarioId: REVISOR.actorUserId,
        nombre: REVISOR.actorNombre,
        email: REVISOR.actorEmail,
      },
      CONTADOR,
    ]);
    const cajaMenorId = await seedCaja(t);
    const { reembolsoId } = await seedReembolsoPendienteRevision(t, cajaMenorId, "skip-eventos");

    await t.mutation(api.cajasMenores.avanzarFasesConsecutivasReembolsoCajaMenor, {
      reembolsoId,
      destinoEsperado: "eventos_dian",
      eventosDianUserId: EVENTOS_DIAN.usuarioId,
      ...REVISOR,
    });

    const reembolso = await t.run(async (ctx) => ctx.db.get("cajasMenoresReembolsos", reembolsoId));
    expect(reembolso?.estado).toBe("pendiente_eventos_dian");
    expect(reembolso?.contadorDecisionEn).toBeTruthy();
    expect(reembolso?.eventosDianAsignadoUserId).toBe(EVENTOS_DIAN.usuarioId);
  });

  test("revisor contador y Eventos DIAN mismo usuario envia a Gerencia", async () => {
    const t = makeTest();
    await seedConfigs(t);
    await seedContadoresImpuestos(t, [
      {
        usuarioId: REVISOR.actorUserId,
        nombre: REVISOR.actorNombre,
        email: REVISOR.actorEmail,
      },
    ]);
    await seedEventosDian(t, [
      {
        usuarioId: REVISOR.actorUserId,
        nombre: REVISOR.actorNombre,
        email: REVISOR.actorEmail,
      },
    ]);
    const cajaMenorId = await seedCaja(t);
    const { reembolsoId } = await seedReembolsoPendienteRevision(t, cajaMenorId, "skip-gerencia");

    await t.mutation(api.cajasMenores.avanzarFasesConsecutivasReembolsoCajaMenor, {
      reembolsoId,
      destinoEsperado: "gerencia",
      ...REVISOR,
    });

    const reembolso = await t.run(async (ctx) => ctx.db.get("cajasMenoresReembolsos", reembolsoId));
    expect(reembolso?.estado).toBe("pendiente_aprobacion");
    expect(reembolso?.eventosDianDecisionEn).toBeTruthy();
  });

  test("obtenerDetalle expone saltoFasesConsecutivas al responsable asignado", async () => {
    const t = makeTest();
    await seedConfigs(t);
    await seedContadoresImpuestos(t, [
      {
        usuarioId: REVISOR.actorUserId,
        nombre: REVISOR.actorNombre,
        email: REVISOR.actorEmail,
      },
    ]);
    const cajaMenorId = await seedCaja(t);
    const { reembolsoId } = await seedReembolsoPendienteRevision(t, cajaMenorId, "detalle-skip");

    const detalle = await t.query(api.cajasMenores.obtenerDetalleReembolsoCajaMenor, {
      reembolsoId,
      actorUserId: REVISOR.actorUserId,
    });
    expect(detalle?.saltoFasesConsecutivas).toMatchObject({
      destino: "eventos_dian",
      fasesSaltadas: ["contabilidad"],
      motivo: "roles_consecutivos",
    });
  });
});

function buildAjusteValorContable(args: {
  movimientoId: Id<"facturacionCajaMenorMovimientos">;
  valorContableNuevo: number;
}) {
  return {
    movimientoId: args.movimientoId,
    valorContableNuevo: args.valorContableNuevo,
    centroCostoId: "1:1:CC-1",
    centroCostoCodigo: "CC-1",
    centroCostoNombre: "Centro Costo",
    centrosCostoDistribucion: [
      {
        centroCostoId: "1:1:CC-1",
        centroCostoCodigo: "CC-1",
        centroCostoNombre: "Centro Costo",
        valor: args.valorContableNuevo,
      },
    ],
  };
}

describe("Reembolso valor contable adjustments", () => {
  test("adjusts from revision on approve and syncs factura, movimiento, total and snapshot", async () => {
    const t = makeTest();
    await seedConfigs(t);
    const cajaMenorId = await seedCaja(t);
    const { reembolsoId, movimientoId } = await seedReembolsoPendienteRevision(
      t,
      cajaMenorId,
      "ajuste-revision-aprueba"
    );
    const snapshotBefore = await getSnapshot(t);
    const totalOriginal = snapshotBefore.facturas[0].total;

    await t.mutation(api.cajasMenores.revisarReembolsoCajaMenor, {
      reembolsoId,
      decision: "aprobar",
      contadorUserId: CONTADOR.usuarioId,
      comentario: "Ajuste contable en revisión",
      ajustesValorContable: [buildAjusteValorContable({ movimientoId, valorContableNuevo: 80_000 })],
      ...REVISOR,
    });

    const snapshot = await getSnapshot(t);
    expect(snapshot.reembolsos[0].valorTotal).toBe(80_000);
    expect(snapshot.movimientos[0].valor).toBe(80_000);
    expect(snapshot.facturas[0].total).toBe(totalOriginal);
    expect(snapshot.facturas[0].valorContable).toBe(80_000);
    expect(snapshot.reembolsos[0].formatoSnapshot?.valorTotal).toBe(80_000);
    expect(snapshot.reembolsos[0].formatoSnapshot?.movimientos[0]?.valor).toBe(80_000);
    const audit = snapshot.aprobaciones.find(
      (row) => row.accion === "enviar_impuestos_reembolso_caja_menor"
    );
    expect(audit?.valorContableCambio).toMatchObject({
      valorAnterior: 100_000,
      valorNuevo: 80_000,
      moneda: "COP",
    });
  });

  test("requires comment when adjusting valor contable", async () => {
    const t = makeTest();
    await seedConfigs(t);
    const cajaMenorId = await seedCaja(t);
    const { reembolsoId, movimientoId } = await seedReembolsoPendienteRevision(
      t,
      cajaMenorId,
      "ajuste-sin-comentario"
    );

    await expect(
      t.mutation(api.cajasMenores.revisarReembolsoCajaMenor, {
        reembolsoId,
        decision: "aprobar",
        contadorUserId: CONTADOR.usuarioId,
        ajustesValorContable: [
          buildAjusteValorContable({ movimientoId, valorContableNuevo: 80_000 }),
        ],
        ...REVISOR,
      })
    ).rejects.toThrow("comentario");
  });

  test("rejects zero and non-integer valor contable", async () => {
    const t = makeTest();
    await seedConfigs(t);
    const cajaMenorId = await seedCaja(t);
    const { reembolsoId, movimientoId } = await seedReembolsoPendienteRevision(
      t,
      cajaMenorId,
      "ajuste-invalido"
    );

    await expect(
      t.mutation(api.cajasMenores.revisarReembolsoCajaMenor, {
        reembolsoId,
        decision: "rechazar",
        comentario: "Rechazo con ajuste inválido",
        ajustesValorContable: [
          buildAjusteValorContable({ movimientoId, valorContableNuevo: 0 }),
        ],
        ...REVISOR,
      })
    ).rejects.toThrow("entero");

    await expect(
      t.mutation(api.cajasMenores.revisarReembolsoCajaMenor, {
        reembolsoId,
        decision: "rechazar",
        comentario: "Rechazo con decimal",
        ajustesValorContable: [
          {
            ...buildAjusteValorContable({ movimientoId, valorContableNuevo: 80_000 }),
            valorContableNuevo: 80_000.5,
            centrosCostoDistribucion: [
              {
                centroCostoId: "1:1:CC-1",
                centroCostoCodigo: "CC-1",
                centroCostoNombre: "Centro Costo",
                valor: 80_000.5,
              },
            ],
          },
        ],
        ...REVISOR,
      })
    ).rejects.toThrow("entero");
  });

  test("adjusts from impuestos on devolver and keeps total recalculated", async () => {
    const t = makeTest();
    await seedConfigs(t);
    const cajaMenorId = await seedCaja(t);
    const { reembolsoId, movimientoId } = await seedReembolsoPendienteImpuestos(
      t,
      cajaMenorId,
      "ajuste-impuestos-devolver"
    );

    await t.mutation(api.cajasMenores.decidirRevisionImpuestosReembolsoCajaMenor, {
      reembolsoId,
      decision: "devolver",
      comentario: "Devolver con ajuste",
      ajustesValorContable: [buildAjusteValorContable({ movimientoId, valorContableNuevo: 75_000 })],
      ...CONTADOR_ACTOR,
    });

    const snapshot = await getSnapshot(t);
    expect(snapshot.reembolsos[0].estado).toBe("pendiente_revision");
    expect(snapshot.reembolsos[0].valorTotal).toBe(75_000);
    expect(snapshot.movimientos[0].valor).toBe(75_000);
  });

  test("adjusts from eventos dian on reject", async () => {
    const t = makeTest();
    await seedConfigs(t);
    const cajaMenorId = await seedCaja(t);
    const { reembolsoId, movimientoId } = await seedReembolsoPendienteEventosDian(
      t,
      cajaMenorId,
      "ajuste-eventos-rechazar"
    );

    await t.mutation(api.cajasMenores.decidirEventosDianReembolsoCajaMenor, {
      reembolsoId,
      decision: "rechazar",
      comentario: "Rechazo con ajuste",
      ajustesValorContable: [buildAjusteValorContable({ movimientoId, valorContableNuevo: 70_000 })],
      ...EVENTOS_DIAN_ACTOR,
    });

    const snapshot = await getSnapshot(t);
    expect(snapshot.reembolsos[0].estado).toBe("rechazado");
    expect(snapshot.reembolsos[0].valorTotal).toBe(70_000);
  });

  test("works without ajustesValorContable for backward compatibility", async () => {
    const t = makeTest();
    await seedConfigs(t);
    const cajaMenorId = await seedCaja(t);
    const { reembolsoId } = await seedReembolsoPendienteRevision(
      t,
      cajaMenorId,
      "compat-sin-ajustes"
    );

    await t.mutation(api.cajasMenores.revisarReembolsoCajaMenor, {
      reembolsoId,
      decision: "aprobar",
      contadorUserId: CONTADOR.usuarioId,
      ...REVISOR,
    });

    const snapshot = await getSnapshot(t);
    expect(snapshot.reembolsos[0].valorTotal).toBe(100_000);
  });
});

const JULIETH = {
  actorUserId: "julieth-1",
  actorNombre: "Julieth Custodio",
  actorEmail: "julieth@example.com",
};
const JUAN = {
  actorUserId: "juan-1",
  actorNombre: "Juan Custodio",
  actorEmail: "juan@example.com",
};

describe("Shared custodio reimbursements and active tracking", () => {
  test("both custodios see the same pending movement and outsider cannot", async () => {
    const t = makeTest();
    await seedConfigs(t);
    const cajaMenorId = await seedCaja(t, [JULIETH.actorUserId, JUAN.actorUserId]);
    const movimiento = await seedMovimientoPendiente(t, {
      cajaMenorId,
      suffix: "shared-pending",
      estadoTarea: "reembolso_caja_menor",
    });

    const dashboardJulieth = await t.query(api.cajasMenores.obtenerDashboardReembolsos, {
      empresas: [EMPRESA],
      actorUserId: JULIETH.actorUserId,
    });
    const dashboardJuan = await t.query(api.cajasMenores.obtenerDashboardReembolsos, {
      empresas: [EMPRESA],
      actorUserId: JUAN.actorUserId,
    });
    const dashboardOutsider = await t.query(api.cajasMenores.obtenerDashboardReembolsos, {
      empresas: [EMPRESA],
      actorUserId: OTRO_USUARIO.actorUserId,
    });

    const pendingJulieth = dashboardJulieth.cajas[0]?.pendientes ?? [];
    const pendingJuan = dashboardJuan.cajas[0]?.pendientes ?? [];
    expect(pendingJulieth.map((row) => String(row._id))).toEqual([
      String(movimiento.movimientoId),
    ]);
    expect(pendingJuan.map((row) => String(row._id))).toEqual([
      String(movimiento.movimientoId),
    ]);
    expect(dashboardOutsider.cajas).toHaveLength(0);

    await expect(
      t.mutation(api.cajasMenores.generarReembolsoCajaMenor, {
        cajaMenorId,
        movimientoIds: [movimiento.movimientoId],
        custodioUserId: OTRO_USUARIO.actorUserId,
        custodioNombre: OTRO_USUARIO.actorNombre,
        custodioEmail: OTRO_USUARIO.actorEmail,
        ...OTRO_USUARIO,
      })
    ).rejects.toThrow(/custodio|asignado/i);
  });

  test("another custodio generates and preserves original marker", async () => {
    const t = makeTest();
    await seedConfigs(t);
    const cajaMenorId = await seedCaja(t, [JULIETH.actorUserId, JUAN.actorUserId]);
    const movimiento = await seedMovimientoPendiente(t, {
      cajaMenorId,
      suffix: "shared-generate",
      estadoTarea: "reembolso_caja_menor",
    });

    const reembolsoId = await t.mutation(api.cajasMenores.generarReembolsoCajaMenor, {
      cajaMenorId,
      movimientoIds: [movimiento.movimientoId],
      custodioUserId: JUAN.actorUserId,
      custodioNombre: JUAN.actorNombre,
      custodioEmail: JUAN.actorEmail,
      ...JUAN,
    });

    const snapshot = await getSnapshot(t);
    const reembolso = snapshot.reembolsos.find((row) => String(row._id) === String(reembolsoId));
    const mov = snapshot.movimientos.find((row) => String(row._id) === String(movimiento.movimientoId));
    expect(reembolso?.custodioUserId).toBe(JUAN.actorUserId);
    expect(reembolso?.formatoSnapshot?.custodioNombre).toBe(JUAN.actorNombre);
    expect(mov?.actorUserId).toBe(LIDER.actorUserId);
    expect(mov?.estado).toBe("en_reembolso");
  });

  test("centro costo override audits with new action", async () => {
    const t = makeTest();
    await seedConfigs(t);
    const cajaMenorId = await seedCaja(t, [JULIETH.actorUserId, JUAN.actorUserId]);
    const movimiento = await seedMovimientoPendiente(t, {
      cajaMenorId,
      suffix: "cc-audit",
      estadoTarea: "reembolso_caja_menor",
    });

    await t.mutation(api.cajasMenores.generarReembolsoCajaMenor, {
      cajaMenorId,
      movimientoIds: [movimiento.movimientoId],
      centroCostoOverrides: [
        {
          movimientoId: movimiento.movimientoId,
          centroCostoId: "1:1:CC-2",
          centroCostoCodigo: "CC-2",
          centroCostoNombre: "Centro Nuevo",
          centrosCostoDistribucion: [
            {
              centroCostoId: "1:1:CC-2",
              centroCostoCodigo: "CC-2",
              centroCostoNombre: "Centro Nuevo",
              valor: 100_000,
            },
          ],
        },
      ],
      custodioUserId: JUAN.actorUserId,
      custodioNombre: JUAN.actorNombre,
      custodioEmail: JUAN.actorEmail,
      ...JUAN,
    });

    const snapshot = await getSnapshot(t);
    const audit = snapshot.aprobaciones.find(
      (row) => row.accion === "actualizar_centro_costo_caja_menor"
    );
    expect(audit?.actorUserId).toBe(JUAN.actorUserId);
    expect(audit?.comentario).toContain("CC-1");
    expect(audit?.comentario).toContain("CC-2");
    expect(snapshot.movimientos[0]?.centroCostoCodigo).toBe("CC-2");
  });

  test("invalid centro costo distribution rolls back generation", async () => {
    const t = makeTest();
    await seedConfigs(t);
    const cajaMenorId = await seedCaja(t, [JULIETH.actorUserId, JUAN.actorUserId]);
    const movimiento = await seedMovimientoPendiente(t, {
      cajaMenorId,
      suffix: "cc-invalid",
      estadoTarea: "reembolso_caja_menor",
    });

    await expect(
      t.mutation(api.cajasMenores.generarReembolsoCajaMenor, {
        cajaMenorId,
        movimientoIds: [movimiento.movimientoId],
        centroCostoOverrides: [
          {
            movimientoId: movimiento.movimientoId,
            centroCostoCodigo: "CC-9",
            centroCostoNombre: "Sin ID",
            centrosCostoDistribucion: [
              {
                centroCostoCodigo: "CC-9",
                centroCostoNombre: "Sin ID",
                valor: 100_000,
              },
            ],
          },
        ],
        custodioUserId: JUAN.actorUserId,
        custodioNombre: JUAN.actorNombre,
        custodioEmail: JUAN.actorEmail,
        ...JUAN,
      })
    ).rejects.toThrow(/ID canónico/i);

    const snapshot = await getSnapshot(t);
    expect(snapshot.reembolsos).toHaveLength(0);
    expect(snapshot.movimientos[0]?.centroCostoCodigo).toBe("CC-1");
    expect(
      snapshot.aprobaciones.filter(
        (row) => row.accion === "actualizar_centro_costo_caja_menor"
      )
    ).toHaveLength(0);
  });

  test("observer sees seguimiento while assignee sees operational queue", async () => {
    const t = makeTest();
    await seedConfigs(t);
    await seedContadoresImpuestos(t, [CONTADOR, CONTADOR_B]);
    const cajaMenorId = await seedCaja(t, [JULIETH.actorUserId, LIDER.actorUserId]);
    const { reembolsoId } = await seedReembolsoPendienteImpuestos(
      t,
      cajaMenorId,
      "observe-vs-act",
      CONTADOR.usuarioId
    );

    const dashboardObserver = await t.query(api.cajasMenores.obtenerDashboardReembolsos, {
      empresas: [EMPRESA],
      actorUserId: CONTADOR_B.usuarioId,
    });
    const dashboardAssignee = await t.query(api.cajasMenores.obtenerDashboardReembolsos, {
      empresas: [EMPRESA],
      actorUserId: CONTADOR.usuarioId,
    });

    expect(
      dashboardObserver.seguimientoEnProceso.some(
        (item) => String(item._id) === String(reembolsoId)
      )
    ).toBe(true);
    expect(
      dashboardAssignee.pendientesContabilidad.some(
        (item) => String(item._id) === String(reembolsoId)
      )
    ).toBe(true);
    expect(
      dashboardAssignee.seguimientoEnProceso.some(
        (item) => String(item._id) === String(reembolsoId)
      )
    ).toBe(false);

    const detalleObserver = await t.query(api.cajasMenores.obtenerDetalleReembolsoCajaMenor, {
      reembolsoId,
      actorUserId: CONTADOR_B.usuarioId,
    });
    const detalleAssignee = await t.query(api.cajasMenores.obtenerDetalleReembolsoCajaMenor, {
      reembolsoId,
      actorUserId: CONTADOR.usuarioId,
    });
    expect(detalleObserver?.puedeActuar).toBe(false);
    expect(detalleAssignee?.puedeActuar).toBe(true);
  });

  test("visible KPI counts include seguimiento without duplicating operational items", async () => {
    const t = makeTest();
    await seedConfigs(t);
    await t.run(async (ctx) => {
      const config = await ctx.db
        .query("facturacionConfiguracion")
        .withIndex("by_empresa_clave", (q) =>
          q.eq("empresa", EMPRESA).eq("clave", "revisor_caja_menor")
        )
        .first();
      if (!config) throw new Error("Missing revisor config");
      await ctx.db.patch("facturacionConfiguracion", config._id, {
        usuarios: [
          {
            usuarioId: REVISOR.actorUserId,
            nombre: REVISOR.actorNombre,
            email: REVISOR.actorEmail,
          },
          {
            usuarioId: REVISOR_B.usuarioId,
            nombre: REVISOR_B.nombre,
            email: REVISOR_B.email,
          },
        ],
        actualizadoEn: NOW,
      });
      await ctx.db.insert("facturacionConfiguracionUsuarios", {
        empresa: EMPRESA,
        clave: "revisor_caja_menor",
        tipo: "usuarios_lista",
        usuarioId: REVISOR_B.usuarioId,
        nombre: REVISOR_B.nombre,
        email: REVISOR_B.email,
        orden: 1,
        actualizadoEn: NOW,
      });
    });
    const cajaMenorId = await seedCaja(t, [JULIETH.actorUserId, LIDER.actorUserId]);
    await seedReembolsoPendienteRevision(t, cajaMenorId, "kpi-counts");

    const dashboard = await t.query(api.cajasMenores.obtenerDashboardReembolsos, {
      empresas: [EMPRESA],
      actorUserId: REVISOR_B.usuarioId,
    });

    expect(dashboard.conteosVisiblesPorEstado.pendiente_revision).toBe(1);
    expect(dashboard.pendientesRevision).toHaveLength(0);
    expect(dashboard.seguimientoEnProceso).toHaveLength(1);
  });

  test("removed custodio keeps active request in seguimiento only", async () => {
    const t = makeTest();
    await seedConfigs(t);
    const cajaMenorId = await seedCaja(t, [JULIETH.actorUserId, JUAN.actorUserId]);
    const movimiento = await seedMovimientoPendiente(t, {
      cajaMenorId,
      suffix: "removed-custodio",
      estadoTarea: "reembolso_caja_menor",
    });
    const reembolsoId = await t.mutation(api.cajasMenores.generarReembolsoCajaMenor, {
      cajaMenorId,
      movimientoIds: [movimiento.movimientoId],
      custodioUserId: JULIETH.actorUserId,
      custodioNombre: JULIETH.actorNombre,
      custodioEmail: JULIETH.actorEmail,
      ...JULIETH,
    });

    await t.run(async (ctx) => {
      await ctx.db.patch("cajasMenores", cajaMenorId, {
        assignedUsersIds: [JUAN.actorUserId],
        updatedAt: NOW,
      });
    });

    const dashboardJulieth = await t.query(api.cajasMenores.obtenerDashboardReembolsos, {
      empresas: [EMPRESA],
      actorUserId: JULIETH.actorUserId,
    });
    expect(dashboardJulieth.canGenerate).toBe(false);
    expect(dashboardJulieth.cajas).toHaveLength(0);
    expect(
      dashboardJulieth.seguimientoEnProceso.some(
        (item) => String(item._id) === String(reembolsoId)
      )
    ).toBe(true);

    await t.mutation(api.cajasMenores.revisarReembolsoCajaMenor, {
      reembolsoId,
      decision: "rechazar",
      comentario: "Rechazo final",
      ...REVISOR,
    });

    const dashboardAfterTerminal = await t.query(api.cajasMenores.obtenerDashboardReembolsos, {
      empresas: [EMPRESA],
      actorUserId: JULIETH.actorUserId,
    });
    expect(dashboardAfterTerminal.seguimientoEnProceso).toHaveLength(0);
    expect(
      await t.query(api.cajasMenores.obtenerDetalleReembolsoCajaMenor, {
        reembolsoId,
        actorUserId: JULIETH.actorUserId,
      })
    ).toBeNull();
  });

  test("concurrent generation allows only one reimbursement", async () => {
    const t = makeTest();
    await seedConfigs(t);
    const cajaMenorId = await seedCaja(t, [JULIETH.actorUserId, JUAN.actorUserId]);
    const movimiento = await seedMovimientoPendiente(t, {
      cajaMenorId,
      suffix: "concurrency",
      estadoTarea: "reembolso_caja_menor",
    });

    await t.mutation(api.cajasMenores.generarReembolsoCajaMenor, {
      cajaMenorId,
      movimientoIds: [movimiento.movimientoId],
      custodioUserId: JULIETH.actorUserId,
      custodioNombre: JULIETH.actorNombre,
      custodioEmail: JULIETH.actorEmail,
      ...JULIETH,
    });

    await expect(
      t.mutation(api.cajasMenores.generarReembolsoCajaMenor, {
        cajaMenorId,
        movimientoIds: [movimiento.movimientoId],
        custodioUserId: JUAN.actorUserId,
        custodioNombre: JUAN.actorNombre,
        custodioEmail: JUAN.actorEmail,
        ...JUAN,
      })
    ).rejects.toThrow(/otro reembolso/i);

    const snapshot = await getSnapshot(t);
    expect(snapshot.reembolsos).toHaveLength(1);
    expect(
      snapshot.aprobaciones.filter(
        (row) => row.accion === "actualizar_centro_costo_caja_menor"
      )
    ).toHaveLength(0);
  });
});

describe("bandeja reembolso caja menor", () => {
  test("obtenerResumenBandejaReembolsos expone KPIs y cajas para custodio", async () => {
    const t = makeTest();
    await seedConfigs(t);
    const cajaMenorId = await seedCaja(t, [JULIETH.actorUserId]);
    await seedMovimientoPendiente(t, {
      cajaMenorId,
      suffix: "bandeja-resumen",
      estadoTarea: "reembolso_caja_menor",
    });

    const resumen = await t.query(api.cajaMenorBandejaQueries.obtenerResumenBandejaReembolsos, {
      empresas: [EMPRESA],
      actorUserId: JULIETH.actorUserId,
    });

    expect(resumen.canAccess).toBe(true);
    expect(resumen.canGenerate).toBe(true);
    expect(resumen.kpis.facturasPendientes).toBeGreaterThanOrEqual(1);
    expect(resumen.cajas.some((caja) => String(caja.cajaMenorId) === String(cajaMenorId))).toBe(
      true
    );
  });

  test("listarMovimientosPendientesCajaPaginados limita a custodio actual", async () => {
    const t = makeTest();
    await seedConfigs(t);
    const cajaMenorId = await seedCaja(t, [JULIETH.actorUserId]);
    await seedMovimientoPendiente(t, {
      cajaMenorId,
      suffix: "bandeja-mov",
      estadoTarea: "reembolso_caja_menor",
    });

    const lista = await t.query(
      api.cajaMenorBandejaQueries.listarMovimientosPendientesCajaPaginados,
      {
        cajaMenorId,
        actorUserId: JULIETH.actorUserId,
        paginationOpts: { numItems: 20, cursor: null },
      }
    );
    expect(lista.page.length).toBeGreaterThanOrEqual(1);

    const ajeno = await t.query(
      api.cajaMenorBandejaQueries.listarMovimientosPendientesCajaPaginados,
      {
        cajaMenorId,
        actorUserId: OTRO_USUARIO.actorUserId,
        paginationOpts: { numItems: 20, cursor: null },
      }
    );
    expect(ajeno.page).toHaveLength(0);
  });

  test("generar reembolso actualiza bandeja y listado paginado de solicitudes", async () => {
    const t = makeTest();
    await seedConfigs(t);
    const cajaMenorId = await seedCaja(t, [JULIETH.actorUserId]);
    const movimiento = await seedMovimientoPendiente(t, {
      cajaMenorId,
      suffix: "bandeja-gen",
      estadoTarea: "reembolso_caja_menor",
    });

    await t.mutation(api.cajasMenores.generarReembolsoCajaMenor, {
      cajaMenorId,
      movimientoIds: [movimiento.movimientoId],
      custodioUserId: JULIETH.actorUserId,
      custodioNombre: JULIETH.actorNombre,
      custodioEmail: JULIETH.actorEmail,
      ...JULIETH,
    });

    const resumen = await t.query(api.cajaMenorBandejaQueries.obtenerResumenBandejaReembolsos, {
      empresas: [EMPRESA],
      actorUserId: JULIETH.actorUserId,
    });
    expect(resumen.kpis.facturasPendientes).toBe(0);
    expect(resumen.kpis.solicitudesActivas).toBeGreaterThanOrEqual(1);
  });

  test("listarSolicitudesReembolsoBandejaPaginadas devuelve filas planas autorizadas", async () => {
    const t = makeTest();
    await seedConfigs(t);
    const cajaMenorId = await seedCaja(t, [JULIETH.actorUserId]);
    const movimiento = await seedMovimientoPendiente(t, {
      cajaMenorId,
      suffix: "bandeja-flat",
      estadoTarea: "reembolso_caja_menor",
    });

    await t.mutation(api.cajasMenores.generarReembolsoCajaMenor, {
      cajaMenorId,
      movimientoIds: [movimiento.movimientoId],
      custodioUserId: JULIETH.actorUserId,
      custodioNombre: JULIETH.actorNombre,
      custodioEmail: JULIETH.actorEmail,
      ...JULIETH,
    });

    const lista = await t.query(
      api.cajaMenorBandejaQueries.listarSolicitudesReembolsoBandejaPaginadas,
      {
        empresas: [EMPRESA],
        actorUserId: JULIETH.actorUserId,
        paginationOpts: { numItems: 20, cursor: null },
      }
    );
    expect(lista.page.length).toBeGreaterThanOrEqual(1);
    expect(lista.page[0]?.cajaMenorId).toBe(cajaMenorId);
    expect(lista.page[0]?.empresaId).toBe(EMPRESA);

    const ajeno = await t.query(
      api.cajaMenorBandejaQueries.listarSolicitudesReembolsoBandejaPaginadas,
      {
        empresas: [EMPRESA],
        actorUserId: OTRO_USUARIO.actorUserId,
        paginationOpts: { numItems: 20, cursor: null },
      }
    );
    expect(ajeno.page).toHaveLength(0);
  });

  test("obtenerFormatoReembolsoCajaMenor exige autorización", async () => {
    const t = makeTest();
    await seedConfigs(t);
    const cajaMenorId = await seedCaja(t, [JULIETH.actorUserId]);
    const movimiento = await seedMovimientoPendiente(t, {
      cajaMenorId,
      suffix: "bandeja-pdf",
      estadoTarea: "reembolso_caja_menor",
    });

    await t.mutation(api.cajasMenores.generarReembolsoCajaMenor, {
      cajaMenorId,
      movimientoIds: [movimiento.movimientoId],
      custodioUserId: JULIETH.actorUserId,
      custodioNombre: JULIETH.actorNombre,
      custodioEmail: JULIETH.actorEmail,
      ...JULIETH,
    });

    const solicitudes = await t.query(
      api.cajaMenorBandejaQueries.listarSolicitudesReembolsoBandejaPaginadas,
      {
        empresas: [EMPRESA],
        actorUserId: JULIETH.actorUserId,
        paginationOpts: { numItems: 20, cursor: null },
      }
    );
    const reembolsoId = solicitudes.page[0]?.reembolsoId;
    expect(reembolsoId).toBeTruthy();

    const autorizado = await t.query(api.cajasMenores.obtenerFormatoReembolsoCajaMenor, {
      reembolsoId: reembolsoId!,
      actorUserId: JULIETH.actorUserId,
    });
    expect(autorizado?.numeroReembolso).toBeTruthy();

    const bloqueado = await t.query(api.cajasMenores.obtenerFormatoReembolsoCajaMenor, {
      reembolsoId: reembolsoId!,
      actorUserId: OTRO_USUARIO.actorUserId,
    });
    expect(bloqueado).toBeNull();
  });

  test("marcarEsLegalizacionCajaMenor deja movimiento visible para todos los custodios", async () => {
    const t = makeTest();
    await seedConfigs(t);
    const cajaMenorId = await seedCaja(t, [JULIETH.actorUserId, JUAN.actorUserId]);
    // Julieth reviews the invoice (her assignment) and is a custodian of the fund.
    const { asignacionId } = await seedFacturaConTarea(t, {
      suffix: "bandeja-real-flow",
      estado: "revision_lider",
      lider: JULIETH,
    });

    await t.mutation(api.facturacionTareas.marcarEsLegalizacionCajaMenor, {
      tareaId: (await getSnapshot(t)).tareas[0]._id,
      asignacionId,
      esLegalizacionCajaMenor: true,
      cajaMenorId,
      nit: "900123456",
      nombreEmpresa: "Proveedor Caja",
      concepto: "Papelería",
      fechaPago: "2026-06-02",
      centroCostoId: "1:1:CC-1",
      centroCostoCodigo: "CC-1",
      centroCostoNombre: "Centro Costo",
      ...JULIETH,
    });

    const snapshot = await getSnapshot(t);
    const movimiento = snapshot.movimientos[0];
    expect(snapshot.tareas[0].estado).toBe("reembolso_caja_menor");
    expect(movimiento.estado).toBe("pendiente_reembolso");
    expect(movimiento.reembolsoId).toBeUndefined();
    expect(movimiento.cajaMenorId).toBe(cajaMenorId);
    expect(movimiento.disponibleEnBandeja).toBe(true);

    const resumen = await t.query(api.cajaMenorBandejaQueries.obtenerResumenBandejaReembolsos, {
      empresas: [EMPRESA],
      actorUserId: JULIETH.actorUserId,
    });
    expect(resumen.kpis.facturasPendientes).toBe(1);
    expect(resumen.kpis.valorPendiente).toBe(movimiento.valor);

    const listaJulieth = await t.query(
      api.cajaMenorBandejaQueries.listarMovimientosPendientesCajaPaginados,
      {
        cajaMenorId,
        actorUserId: JULIETH.actorUserId,
        paginationOpts: { numItems: 20, cursor: null },
      }
    );
    const listaJuan = await t.query(
      api.cajaMenorBandejaQueries.listarMovimientosPendientesCajaPaginados,
      {
        cajaMenorId,
        actorUserId: JUAN.actorUserId,
        paginationOpts: { numItems: 20, cursor: null },
      }
    );
    const listaAjeno = await t.query(
      api.cajaMenorBandejaQueries.listarMovimientosPendientesCajaPaginados,
      {
        cajaMenorId,
        actorUserId: OTRO_USUARIO.actorUserId,
        paginationOpts: { numItems: 20, cursor: null },
      }
    );

    expect(listaJulieth.page).toHaveLength(1);
    expect(listaJuan.page).toHaveLength(1);
    expect(listaAjeno.page).toHaveLength(0);
  });

  test("repairMovimientoDisponibilidadBandeja corrige flags y aggregate de forma idempotente", async () => {
    const t = makeTest();
    await seedConfigs(t);
    const cajaMenorId = await seedCaja(t, [JULIETH.actorUserId]);
    const base = await seedFacturaConTarea(t, {
      suffix: "repair-migration",
      estado: "reembolso_caja_menor",
    });

    const ids = await t.run(async (ctx) => {
      const { repairMovimientoDisponibilidadBandeja } = await import("./lib/cajaMenorBandeja");
      const create = async (
        suffix: string,
        overrides: Partial<Doc<"facturacionCajaMenorMovimientos">> = {}
      ) => {
        const id = await ctx.db.insert("facturacionCajaMenorMovimientos", {
          facturaId: base.facturaId,
          cajaMenorId,
          origen: "factura_sistema",
          estado: "pendiente_reembolso",
          nit: "900123456",
          nombreEmpresa: "Proveedor Caja",
          concepto: `Movimiento ${suffix}`,
          fechaPago: "2026-06-02",
          valor: 10_000,
          centroCostoCodigo: "CC-1",
          centroCostoNombre: "Centro Costo",
          actorUserId: JULIETH.actorUserId,
          actorNombre: JULIETH.actorNombre,
          actorEmail: JULIETH.actorEmail,
          creadoEn: NOW,
          actualizadoEn: NOW,
          proyeccionBandejaVersion: 1,
          disponibleEnBandeja: false,
          ...overrides,
        });
        return id;
      };

      const brokenIds = await Promise.all([
        create("broken-1"),
        create("broken-2"),
        create("broken-3"),
        create("broken-4"),
      ]);
      const correctId = await create("correct", { disponibleEnBandeja: true });
      const enReembolsoId = await create("en-reembolso", {
        estado: "en_reembolso",
        reembolsoId: undefined,
      });
      const anuladoId = await create("anulado", { estado: "anulado" });

      const repairAll = async () => {
        const docs = await ctx.db.query("facturacionCajaMenorMovimientos").collect();
        for (const doc of docs) {
          await repairMovimientoDisponibilidadBandeja(ctx, doc);
        }
      };

      await repairAll();
      return { brokenIds, correctId, enReembolsoId, anuladoId };
    });

    const resumenAfterFirst = await t.query(api.cajaMenorBandejaQueries.obtenerResumenBandejaReembolsos, {
      empresas: [EMPRESA],
      actorUserId: JULIETH.actorUserId,
    });
    expect(resumenAfterFirst.kpis.facturasPendientes).toBe(5);
    expect(resumenAfterFirst.kpis.valorPendiente).toBe(50_000);

    const lista = await t.query(
      api.cajaMenorBandejaQueries.listarMovimientosPendientesCajaPaginados,
      {
        cajaMenorId,
        actorUserId: JULIETH.actorUserId,
        paginationOpts: { numItems: 20, cursor: null },
      }
    );
    expect(lista.page).toHaveLength(5);

    await t.run(async (ctx) => {
      const { repairMovimientoDisponibilidadBandeja } = await import("./lib/cajaMenorBandeja");
      const docs = await ctx.db.query("facturacionCajaMenorMovimientos").collect();
      for (const doc of docs) {
        await repairMovimientoDisponibilidadBandeja(ctx, doc);
      }
    });

    const resumenAfterSecond = await t.query(api.cajaMenorBandejaQueries.obtenerResumenBandejaReembolsos, {
      empresas: [EMPRESA],
      actorUserId: JULIETH.actorUserId,
    });
    expect(resumenAfterSecond.kpis.facturasPendientes).toBe(5);
    expect(resumenAfterSecond.kpis.valorPendiente).toBe(50_000);

    const snapshot = await getSnapshot(t);
    for (const id of ids.brokenIds) {
      const doc = snapshot.movimientos.find((row) => row._id === id);
      expect(doc?.disponibleEnBandeja).toBe(true);
    }
    expect(snapshot.movimientos.find((row) => row._id === ids.correctId)?.disponibleEnBandeja).toBe(
      true
    );
    expect(snapshot.movimientos.find((row) => row._id === ids.enReembolsoId)?.disponibleEnBandeja).toBe(
      false
    );
    expect(snapshot.movimientos.find((row) => row._id === ids.anuladoId)?.disponibleEnBandeja).toBe(
      false
    );
  });
});

describe("caja menor: autorización y consistencia de la bandeja", () => {
  const MARCA_BASE = {
    esLegalizacionCajaMenor: true,
    nit: "900123456",
    nombreEmpresa: "Proveedor Caja",
    concepto: "Papelería",
    fechaPago: "2026-06-02",
    centroCostoId: "1:1:CC-1",
    centroCostoCodigo: "CC-1",
    centroCostoNombre: "Centro Costo",
  };

  test("obtenerCajasAsignadasDisponiblesV2 devuelve siempre las cajas de quien consulta", async () => {
    const t = makeTest();
    await seedConfigs(t);
    await seedCaja(t, [LIDER.actorUserId]);

    const otro = await asUser(t, { id: OTRO_USUARIO.actorUserId });
    const ajenas = (await otro.query(api.cajasMenores.obtenerCajasAsignadasDisponiblesV2, {
      empresa: EMPRESA,
      userId: LIDER.actorUserId,
    })) as { cajas: unknown[] };
    expect(ajenas.cajas).toEqual([]);

    // The proxy runs this one as LIDER (the userId arg is the caller).
    const propias = (await t.query(api.cajasMenores.obtenerCajasAsignadasDisponiblesV2, {
      empresa: EMPRESA,
      userId: LIDER.actorUserId,
    })) as { cajas: unknown[] };
    expect(propias.cajas).toHaveLength(1);
  });

  test("configuración y personal configurado: roles del flujo, Gerencia o administradores", async () => {
    const t = makeTest();
    await seedConfigs(t);
    await t.mutation(api.cajasMenores.configurarPermitirSaldoNegativo, {
      empresa: EMPRESA,
      permitirSaldoNegativo: true,
      ...GERENCIA,
    });

    const ajeno = await asUser(t, {
      id: OTRO_USUARIO.actorUserId,
      permisos: ["billing/inbox"],
      empresas: [EMPRESA],
    });
    for (const lista of [
      api.cajasMenores.listarContadoresImpuestosConfigurados,
      api.cajasMenores.listarEventosDianConfigurados,
      api.cajasMenores.listarRevisoresCajaMenorConfigurados,
      api.cajasMenores.obtenerRolesConfig,
    ]) {
      expect(await ajeno.query(lista, { empresa: EMPRESA })).toEqual([]);
    }
    expect(
      await ajeno.query(api.cajasMenores.obtenerConfigCajaMenorEmpresa, { empresa: EMPRESA }),
    ).toEqual({ permitirSaldoNegativo: false });

    const revisor = await asUser(t, { id: REVISOR.actorUserId });
    expect(
      (await revisor.query(api.cajasMenores.listarContadoresImpuestosConfigurados, {
        empresa: EMPRESA,
      })) as unknown[],
    ).not.toHaveLength(0);
    const gerencia = await asUser(t, { id: GERENCIA.actorUserId });
    expect(
      (await gerencia.query(api.cajasMenores.obtenerRolesConfig, { empresa: EMPRESA })) as unknown[],
    ).toHaveLength(1);
    const cajasMenores = await asUser(t, {
      id: "gestor-cajas",
      permisos: ["finance/petty-cash"],
      empresas: [EMPRESA],
    });
    expect(
      await cajasMenores.query(api.cajasMenores.obtenerConfigCajaMenorEmpresa, { empresa: EMPRESA }),
    ).toEqual({ permitirSaldoNegativo: true });

    await expect(
      t.query(api.cajasMenores.obtenerRolesConfig, { empresa: EMPRESA }),
    ).rejects.toThrow("No autenticado");
  });

  test("marcar Caja Menor exige al dueño de la revisión y a un custodio de la caja", async () => {
    const t = makeTest();
    await seedConfigs(t);
    const cajaMenorId = await seedCaja(t, [JUAN.actorUserId]);
    const { tareaId, asignacionId } = await seedFacturaConTarea(t, {
      suffix: "auth-marca",
      estado: "revision_lider",
    });
    const args = { ...MARCA_BASE, tareaId, asignacionId, cajaMenorId };

    // Juan is a custodian but the review belongs to Lider: sending Lider's actor args does not help.
    const juan = await asUser(t, { id: JUAN.actorUserId });
    await expect(
      juan.mutation(api.facturacionTareas.marcarEsLegalizacionCajaMenor, { ...args, ...LIDER }),
    ).rejects.toThrow("No tienes asignada esta tarea.");
    // Lider owns the review but is not a custodian of that fund.
    await expect(
      t.mutation(api.facturacionTareas.marcarEsLegalizacionCajaMenor, { ...args, ...LIDER }),
    ).rejects.toThrow("Sólo un custodio asignado puede usar esta Caja Menor.");

    const snapshot = await getSnapshot(t);
    expect(snapshot.movimientos).toHaveLength(0);
    expect(snapshot.tareas[0].estado).toBe("revision_lider");
  });

  test("legalizar con Caja Menor desde Contabilidad exige al contador asignado", async () => {
    const t = makeTest();
    await seedConfigs(t);
    const { tareaId, facturaId } = await seedFacturaConTarea(t, {
      suffix: "auth-legaliza",
      estado: "causacion",
    });
    const asignacionId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("facturacionAsignaciones", {
        facturaId,
        tareaId,
        empresa: EMPRESA,
        fase: "revision_impuestos",
        estado: "pendiente",
        rol: "contador_impuestos",
        grupoId: `revision_impuestos:${String(facturaId)}`,
        asignadoAUserId: CONTADOR.usuarioId,
        asignadoANombre: CONTADOR.nombre,
        asignadoAEmail: CONTADOR.email,
        fechaAsignacion: NOW,
        creadoEn: NOW,
        actualizadoEn: NOW,
      });
      await ctx.db.patch("facturacionTareas", tareaId, {
        estado: "revision_impuestos",
        currentAsignacionId: id,
      });
      return id;
    });

    await expect(
      t.mutation(api.facturacionTareas.legalizarCajaMenorFactura, {
        asignacionId,
        comentario: "Legalizar",
        ...OTRO_USUARIO,
      }),
    ).rejects.toThrow("No tienes asignada esta tarea.");
    const asignacion = await t.run(async (ctx) => ctx.db.get("facturacionAsignaciones", asignacionId));
    expect(asignacion?.estado).toBe("pendiente");
  });

  test("devolverMovimientoABuzon saca el movimiento de la bandeja y del agregado", async () => {
    const t = makeTest();
    await seedConfigs(t);
    const cajaMenorId = await seedCaja(t);
    const seeded = await seedMovimientoPendiente(t, {
      cajaMenorId,
      suffix: "devolver-agregado",
      estadoTarea: "reembolso_caja_menor",
      valor: 90_000,
    });
    const resumen = async () =>
      (await t.query(api.cajaMenorBandejaQueries.obtenerResumenBandejaReembolsos, {
        empresas: [EMPRESA],
        actorUserId: LIDER.actorUserId,
      })) as { kpis: { facturasPendientes: number; valorPendiente: number } };
    expect((await resumen()).kpis.facturasPendientes).toBe(1);

    await t.mutation(api.cajasMenores.devolverMovimientoABuzon, {
      movimientoId: seeded.movimientoId,
      ...LIDER,
    });

    const movimiento = (await getSnapshot(t)).movimientos.find(
      (row) => row._id === seeded.movimientoId,
    );
    expect(movimiento?.estado).toBe("anulado");
    expect(movimiento?.disponibleEnBandeja).toBe(false);
    expect((await resumen()).kpis).toMatchObject({ facturasPendientes: 0, valorPendiente: 0 });
  });

  test("recalcular la causación de un reembolso mantiene su entrada en el agregado", async () => {
    const t = makeTest();
    await seedConfigs(t);
    const cajaMenorId = await seedCaja(t);
    const { reembolsoId } = await seedReembolsoPendienteRevision(t, cajaMenorId, "causacion-agregado");

    await t.run(async (ctx) => {
      const { patchReembolsoConBandeja } = await import("./lib/cajaMenorBandeja");
      const { recomputeReembolsoCausacionCounts } = await import("./facturacionCausacion");
      await patchReembolsoConBandeja(ctx, reembolsoId, { actualizadoEn: NOW });
      await recomputeReembolsoCausacionCounts(ctx, reembolsoId, NOW + 1_000);
    });

    // Before the fix the next bandeja patch failed with DELETE_MISSING_KEY.
    await t.mutation(api.cajasMenores.revisarReembolsoCajaMenor, {
      reembolsoId,
      decision: "aprobar",
      contadorUserId: CONTADOR.usuarioId,
      ...REVISOR,
    });
    const reembolso = await t.run(async (ctx) => ctx.db.get("cajasMenoresReembolsos", reembolsoId));
    expect(reembolso?.estado).toBe("pendiente_revision_impuestos");
  });

  test("eliminarArchivoFallido solo borra un archivo recién subido", async () => {
    const t = makeTest();
    await seedConfigs(t);
    const cajaMenorId = await seedCaja(t);
    const { reembolsoId } = await seedReembolsoPendienteRevision(t, cajaMenorId, "archivo-fallido");
    const store = async (contenido: string) =>
      (await t.run(async (ctx) =>
        ctx.storage.store(new Blob([contenido], { type: "application/pdf" })),
      )) as Id<"_storage">;

    const reciente = await store("subida fallida");
    await t.mutation(api.cajasMenores.eliminarArchivoFallidoReembolsoCajaMenor, {
      reembolsoId,
      storageId: reciente,
      ...REVISOR,
    });
    expect(await t.run(async (ctx) => ctx.db.system.get("_storage", reciente))).toBeNull();

    const antiguo = await store("archivo de otro registro");
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(Date.now() + 60 * 60 * 1000);
      await t.mutation(api.cajasMenores.eliminarArchivoFallidoReembolsoCajaMenor, {
        reembolsoId,
        storageId: antiguo,
        ...REVISOR,
      });
    } finally {
      vi.useRealTimers();
    }
    expect(await t.run(async (ctx) => ctx.db.system.get("_storage", antiguo))).not.toBeNull();
  });
});
