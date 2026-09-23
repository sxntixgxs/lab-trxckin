/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";

import { actingAsActorArgs, DEFAULT_ACTOR_ID_KEYS } from "../test-utils/convexActingAs";
import { asUser } from "../test-utils/onboardingActors";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");

const SECRET = "test-convex-server-secret";
const EMPRESA = 1;
const SOLICITANTE = "aut-solicitante";
const CONTADOR = "aut-contador";
const GERENTE = "aut-gerente";
const TESORERO = "aut-tesorero";
const INTRUSO = "aut-intruso";
const NOW = 1_779_840_000_000;

const PERMISOS_ANTICIPOS = ["finance/advances", "finance/advances/request"];

function makeTest() {
  return actingAsActorArgs(convexTest(schema, modules), DEFAULT_ACTOR_ID_KEYS, {
    permisos: PERMISOS_ANTICIPOS,
    empresas: [EMPRESA],
  });
}

type T = ReturnType<typeof makeTest>;

async function seedRoles(t: T) {
  await t.run(async (ctx) => {
    for (const [rol, userId] of [
      ["CONTABILIDAD", CONTADOR],
      ["GERENCIA", GERENTE],
      ["TESORERO", TESORERO],
    ] as const) {
      await ctx.db.insert("anticiposRolesConfig", {
        empresa: EMPRESA,
        rol,
        userId,
        nombre: userId,
        email: `${userId}@example.com`,
      });
    }
  });
}

async function crearAnticipo(t: T, createdById = SOLICITANTE) {
  const { anticipoId } = (await t.mutation(api.financiero.anticipos.crearAnticipo, {
    empresa: EMPRESA,
    empresa_id: EMPRESA,
    razonSocial: "Proveedor Test",
    nit: "900123456",
    formaPago: "TRANSFERENCIA PAGO ELECTRÓNICO",
    valorNumerico: 1_000_000,
    valorLetra: "UN MILLON DE PESOS",
    maxLegalizacionDate: 1_800_000_000_000,
    createdById,
  })) as { anticipoId: Id<"anticipos"> };
  return anticipoId;
}

async function aTesoreria(t: T, anticipoId: Id<"anticipos">) {
  await t.mutation(api.financiero.anticipos.aprobarContabilidad, {
    anticipoId,
    contadorUserId: CONTADOR,
    decision: "APROBADO",
  });
  await t.mutation(api.financiero.anticipos.aprobarGerencia, {
    anticipoId,
    gerenteUserId: GERENTE,
    decision: "APROBADO",
  });
}

async function aLegalizacion(t: T, anticipoId: Id<"anticipos">) {
  await aTesoreria(t, anticipoId);
  await t.mutation(api.financiero.anticipos.registrarDesembolsoTesoreria, {
    anticipoId,
    tesoreroUserId: TESORERO,
  });
}

async function leerAnticipo(t: T, anticipoId: Id<"anticipos">) {
  return await t.run(async (ctx) => ctx.db.get("anticipos", anticipoId));
}

async function storeFile(t: T, contents = "soporte") {
  return (await t.run(async (ctx) =>
    ctx.storage.store(new Blob([contents], { type: "application/pdf" })),
  )) as Id<"_storage">;
}

/** Invoice crossed against the advance (active legalization row), in `estadoTarea`. */
async function seedCruce(
  t: T,
  anticipoId: Id<"anticipos">,
  args: { numero: string; estadoTarea: Doc<"facturacionTareas">["estado"]; valorAplicado: number },
) {
  return await t.run(async (ctx) => {
    const facturaId = await ctx.db.insert("facturacionFacturas", {
      empresa: EMPRESA,
      numeroFactura: args.numero,
      tipoDocumento: "01",
      proveedorNit: "900123456",
      proveedorNombre: "Proveedor Test",
      fechaEmision: "2026-06-01",
      subtotal: 100_000,
      impuestos: 0,
      total: 100_000,
      moneda: "COP",
      descripcion: "Factura legalizada con anticipo",
      origen: "carga_manual",
      esLegalizacionAnticipo: true,
      valorAPagar: 100_000 - args.valorAplicado,
      creadoEn: NOW,
      actualizadoEn: NOW,
    });
    await ctx.db.insert("facturacionTareas", {
      facturaId,
      empresa: EMPRESA,
      estado: args.estadoTarea,
      categoria: "administracion",
      asignadoANombre: "Lider",
      asignadoAEmail: "lider@example.com",
      liderProcesoNombre: "Lider",
      liderProcesoEmail: "lider@example.com",
      creadoEn: NOW,
      actualizadoEn: NOW,
    });
    await ctx.db.insert("facturacionAnticipoLegalizaciones", {
      facturaId,
      anticipoId,
      empresa: EMPRESA,
      liderNombre: "Lider",
      liderEmail: "lider@example.com",
      valorAplicado: args.valorAplicado,
      saldoAntes: 0,
      saldoDespues: args.valorAplicado,
      estado: "activa",
      actorNombre: "Lider",
      actorEmail: "lider@example.com",
      creadoEn: NOW,
      actualizadoEn: NOW,
    });
    const anticipo = await ctx.db.get("anticipos", anticipoId);
    await ctx.db.patch("anticipos", anticipoId, {
      saldoLegalizado: (anticipo?.saldoLegalizado ?? 0) + args.valorAplicado,
      legalizacion: [
        ...(anticipo?.legalizacion ?? []),
        {
          legalizadoPorUserId: "lider",
          fechaLegalizacion: NOW,
          facturaId,
          valorLegalizado: args.valorAplicado,
        },
      ],
    });
    return facturaId;
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("anticipos: creación y lectura con autorización", () => {
  test("crear exige el permiso de solicitud en la empresa", async () => {
    const t = convexTest(schema, modules);
    const args = {
      empresa: EMPRESA,
      empresa_id: EMPRESA,
      razonSocial: "Proveedor Test",
      nit: "900123456",
      formaPago: "TRANSFERENCIA PAGO ELECTRÓNICO" as const,
      valorNumerico: 500_000,
      valorLetra: "QUINIENTOS MIL",
      maxLegalizacionDate: 1_800_000_000_000,
      createdById: "ignorado",
    };
    const sinPermiso = await asUser(t, { id: "sin-permiso", permisos: ["billing/inbox"], empresas: [1] });
    await expect(sinPermiso.mutation(api.financiero.anticipos.crearAnticipo, args)).rejects.toThrow(
      "se requiere finance/advances/request",
    );
    const otraEmpresa = await asUser(t, {
      id: "otra-empresa",
      permisos: ["finance/advances/request"],
      empresas: [2],
    });
    await expect(otraEmpresa.mutation(api.financiero.anticipos.crearAnticipo, args)).rejects.toThrow(
      "Empresa no autorizada",
    );
  });

  test("detalle, fases y soportes: dueño, responsables de rol y fase; nadie más", async () => {
    const t = makeTest();
    await seedRoles(t);
    const anticipoId = await crearAnticipo(t);
    await aTesoreria(t, anticipoId);
    const soporte = await storeFile(t);
    await t.mutation(api.financiero.anticipos.guardarAdjuntoBorradorDesembolso, {
      anticipoId,
      tesoreroUserId: TESORERO,
      storageId: soporte,
      nombre: "soporte.pdf",
    });

    const leer = async (user: Parameters<typeof asUser>[1]) => {
      const cliente = await asUser(t, user);
      return {
        anticipo: await cliente.query(api.financiero.anticipos.obtenerAnticipoPorId, { id: anticipoId }),
        fases: (await cliente.query(api.financiero.anticipos.obtenerFasesDeAnticipo, {
          anticipoId,
        })) as unknown[],
        borrador: (await cliente.query(api.financiero.anticipos.obtenerAdjuntosBorradorDesembolso, {
          anticipoId,
        })) as unknown[],
      };
    };

    const solicitante = await leer({ id: SOLICITANTE, permisos: ["finance/advances/request"], empresas: [1] });
    expect(solicitante.anticipo).not.toBeNull();
    expect(solicitante.fases.length).toBeGreaterThan(0);

    const tesorero = await leer({ id: TESORERO, permisos: ["finance/advances"], empresas: [1] });
    expect(tesorero.borrador).toHaveLength(1);

    for (const ajeno of [
      { id: "otro-solicitante", permisos: ["finance/advances/request"], empresas: [1] },
      { id: "gestor-sin-rol", permisos: ["finance/advances"], empresas: [1] },
      { id: "sin-modulo", permisos: ["billing/invoices"], empresas: [1] },
      { id: TESORERO, permisos: ["finance/advances"], empresas: [2] },
    ]) {
      const vista = await leer(ajeno);
      expect(vista).toEqual({ anticipo: null, fases: [], borrador: [] });
    }

    // No actor key in the args: the proxy runs this call without an identity.
    await expect(
      t.query(api.financiero.anticipos.obtenerAnticipoPorId, { id: anticipoId }),
    ).rejects.toThrow("No autenticado");
  });

  test("obtenerRolesConfig solo devuelve las empresas del usuario", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      for (const empresa of [1, 2]) {
        await ctx.db.insert("anticiposRolesConfig", {
          empresa,
          rol: "GERENCIA",
          userId: `gerente-${empresa}`,
          nombre: `Gerente ${empresa}`,
          email: `gerente-${empresa}@example.com`,
        });
      }
    });
    const solicitante = await asUser(t, { id: "sol", permisos: ["finance/advances/request"], empresas: [1] });
    const propias = (await solicitante.query(api.financiero.anticipos.obtenerRolesConfig, {})) as Array<{
      empresa?: number;
    }>;
    expect(propias.map((row) => row.empresa)).toEqual([1]);
    expect(
      await solicitante.query(api.financiero.anticipos.obtenerRolesConfig, { empresa: 2 }),
    ).toEqual([]);

    const sinModulo = await asUser(t, { id: "sin-modulo", permisos: ["billing/inbox"], empresas: [1] });
    expect(await sinModulo.query(api.financiero.anticipos.obtenerRolesConfig, {})).toEqual([]);
  });
});

describe("anticipos: devolver, rechazar y anular con rol", () => {
  test("devolver exige al dueño de la fase actual", async () => {
    const t = makeTest();
    await seedRoles(t);
    const anticipoId = await crearAnticipo(t);
    await t.mutation(api.financiero.anticipos.aprobarContabilidad, {
      anticipoId,
      contadorUserId: CONTADOR,
      decision: "APROBADO",
    });
    const args = { anticipoId, faseDestino: "III_REVISION_CONTABILIDAD" as const, motivo: "Revisar" };

    await expect(
      t.mutation(api.financiero.anticipos.devolverAnticipo, { ...args, actorUserId: INTRUSO }),
    ).rejects.toThrow("No tienes asignada esta fase del anticipo.");
    await t.mutation(api.financiero.anticipos.devolverAnticipo, { ...args, actorUserId: GERENTE });
    expect((await leerAnticipo(t, anticipoId))?.faseActual).toBe("III_REVISION_CONTABILIDAD");
  });

  test("rechazar: solo en revisión, por el dueño de la fase y nunca tras el desembolso", async () => {
    const t = makeTest();
    await seedRoles(t);
    const enRevision = await crearAnticipo(t);
    await expect(
      t.mutation(api.financiero.anticipos.rechazarAnticipo, {
        anticipoId: enRevision,
        rechazadoPorUserId: INTRUSO,
        motivo: "No",
      }),
    ).rejects.toThrow("No tienes asignada esta fase del anticipo.");
    await t.mutation(api.financiero.anticipos.rechazarAnticipo, {
      anticipoId: enRevision,
      rechazadoPorUserId: CONTADOR,
      motivo: "Soportes incompletos",
    });
    expect((await leerAnticipo(t, enRevision))?.faseActual).toBe("RECHAZADO");

    const enTesoreria = await crearAnticipo(t);
    await aTesoreria(t, enTesoreria);
    await expect(
      t.mutation(api.financiero.anticipos.rechazarAnticipo, {
        anticipoId: enTesoreria,
        rechazadoPorUserId: TESORERO,
        motivo: "Tarde",
      }),
    ).rejects.toThrow("Solo se puede rechazar un anticipo en revisión");

    const desembolsado = await crearAnticipo(t);
    await aLegalizacion(t, desembolsado);
    await expect(
      t.mutation(api.financiero.anticipos.rechazarAnticipo, {
        anticipoId: desembolsado,
        rechazadoPorUserId: GERENTE,
        motivo: "Después del pago",
      }),
    ).rejects.toThrow("Solo se puede rechazar un anticipo en revisión");
    expect((await leerAnticipo(t, desembolsado))?.faseActual).toBe("V_PENDIENTE_LEGALIZACION");
  });

  test("anular antes del desembolso: el dueño de la fase actual", async () => {
    const t = makeTest();
    await seedRoles(t);
    const anticipoId = await crearAnticipo(t);
    await expect(
      t.mutation(api.financiero.anticipos.anularAnticipo, {
        anticipoId,
        anuladoPorUserId: INTRUSO,
        motivo: "Ajeno",
      }),
    ).rejects.toThrow("No tienes asignada esta fase del anticipo.");
    await t.mutation(api.financiero.anticipos.anularAnticipo, {
      anticipoId,
      anuladoPorUserId: CONTADOR,
      motivo: "Duplicado",
    });
    const anticipo = await leerAnticipo(t, anticipoId);
    expect(anticipo?.faseActual).toBe("ANULADO");
    expect(anticipo?.anulacion?.anuladoPorUserId).toBe(CONTADOR);

    // Closed advances cannot be annulled.
    const rechazado = await crearAnticipo(t);
    await t.mutation(api.financiero.anticipos.rechazarAnticipo, {
      anticipoId: rechazado,
      rechazadoPorUserId: CONTADOR,
      motivo: "No aplica",
    });
    await expect(
      t.mutation(api.financiero.anticipos.anularAnticipo, {
        anticipoId: rechazado,
        anuladoPorUserId: CONTADOR,
        motivo: "Anular rechazado",
      }),
    ).rejects.toThrow("ya cerró su flujo");
  });

  test("anular un anticipo desembolsado: Gerencia o Tesorería, y revierte sus cruces", async () => {
    const t = makeTest();
    await seedRoles(t);
    const anticipoId = await crearAnticipo(t);
    await aLegalizacion(t, anticipoId);
    const facturaId = await seedCruce(t, anticipoId, {
      numero: "FAC-CRUCE-1",
      estadoTarea: "causacion",
      valorAplicado: 40_000,
    });

    // The legalization responsible (the requester) no longer annuls a disbursed advance.
    await expect(
      t.mutation(api.financiero.anticipos.anularAnticipo, {
        anticipoId,
        anuladoPorUserId: SOLICITANTE,
        motivo: "Ya no lo necesito",
      }),
    ).rejects.toThrow("Solo Gerencia o Tesorería pueden anular un anticipo ya desembolsado.");

    await t.mutation(api.financiero.anticipos.anularAnticipo, {
      anticipoId,
      anuladoPorUserId: TESORERO,
      motivo: "Reintegro recibido",
    });

    const estado = await t.run(async (ctx) => ({
      anticipo: await ctx.db.get("anticipos", anticipoId),
      factura: await ctx.db.get("facturacionFacturas", facturaId),
      cruces: await ctx.db
        .query("facturacionAnticipoLegalizaciones")
        .withIndex("by_anticipoId", (q) => q.eq("anticipoId", anticipoId))
        .collect(),
    }));
    expect(estado.anticipo?.faseActual).toBe("ANULADO");
    expect(estado.anticipo?.saldoLegalizado).toBe(0);
    expect(estado.anticipo?.legalizacion).toEqual([]);
    expect(estado.cruces.map((cruce) => cruce.estado)).toEqual(["anulada"]);
    // Without active crosses the invoice pays its full accounting value again.
    expect(estado.factura?.valorAPagar).toBeUndefined();
  });

  test("anular se rechaza si el anticipo legalizó una factura ya cerrada", async () => {
    const t = makeTest();
    await seedRoles(t);
    const anticipoId = await crearAnticipo(t);
    await aLegalizacion(t, anticipoId);
    await seedCruce(t, anticipoId, { numero: "FAC-PAGADA", estadoTarea: "pagada", valorAplicado: 30_000 });

    await expect(
      t.mutation(api.financiero.anticipos.anularAnticipo, {
        anticipoId,
        anuladoPorUserId: GERENTE,
        motivo: "Anular",
      }),
    ).rejects.toThrow("FAC-PAGADA, que ya cerró su flujo");
    expect((await leerAnticipo(t, anticipoId))?.faseActual).toBe("V_PENDIENTE_LEGALIZACION");
  });
});

describe("anticipos: soportes de Tesorería", () => {
  test("solo Tesorería gestiona los soportes del desembolso", async () => {
    const t = makeTest();
    await seedRoles(t);
    const anticipoId = await crearAnticipo(t);
    await aTesoreria(t, anticipoId);
    const archivo = await storeFile(t, "ajeno");

    await expect(
      t.mutation(api.financiero.anticipos.guardarAdjuntoBorradorDesembolso, {
        anticipoId,
        tesoreroUserId: INTRUSO,
        storageId: archivo,
        nombre: "soporte.pdf",
      }),
    ).rejects.toThrow("No tienes asignada esta fase del anticipo.");
    await expect(
      t.mutation(api.financiero.anticipos.eliminarAdjuntoBorradorDesembolso, {
        anticipoId,
        tesoreroUserId: INTRUSO,
        storageId: archivo,
      }),
    ).rejects.toThrow("No tienes asignada esta fase del anticipo.");

    // Tesorería cannot use the delete path on a file that is not a disbursement support.
    await expect(
      t.mutation(api.financiero.anticipos.eliminarAdjuntoBorradorDesembolso, {
        anticipoId,
        tesoreroUserId: TESORERO,
        storageId: archivo,
      }),
    ).rejects.toThrow("El soporte no pertenece al desembolso de este anticipo.");
    expect(await t.run(async (ctx) => ctx.db.system.get("_storage", archivo))).not.toBeNull();
  });

  test("un anticipo inexistente o un archivo antiguo no se borran al descartar", async () => {
    const t = makeTest();
    await seedRoles(t);
    const anticipoId = await crearAnticipo(t);
    const archivo = await storeFile(t, "otro registro");

    const borrado = await t.run(async (ctx) => {
      const id = await ctx.db.insert("anticipos", {
        consecutivo: 999,
        razonSocial: "Tmp",
        nit: "900123456",
        formaPago: "TRANSFERENCIA PAGO ELECTRÓNICO",
        valorNumerico: 1,
        valorLetra: "UNO",
        maxLegalizacionDate: 1,
        createdById: SOLICITANTE,
        faseActual: "ANULADO",
        legalizacion: [],
        createdAt: NOW,
        updatedAt: NOW,
      });
      await ctx.db.delete("anticipos", id);
      return id;
    });
    await expect(
      t.mutation(api.financiero.anticipos.guardarAdjuntoBorradorDesembolso, {
        anticipoId: borrado,
        tesoreroUserId: TESORERO,
        storageId: archivo,
        nombre: "x.pdf",
      }),
    ).rejects.toThrow("Anticipo no encontrado.");
    expect(await t.run(async (ctx) => ctx.db.system.get("_storage", archivo))).not.toBeNull();

    // The advance left Tesorería and the file is older than the discard window: kept.
    await aTesoreria(t, anticipoId);
    await t.mutation(api.financiero.anticipos.devolverAnticipo, {
      anticipoId,
      actorUserId: TESORERO,
      faseDestino: "IV_APROBACION_GERENCIA",
      motivo: "Revisar",
    });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 60 * 60 * 1000);
    const resultado = await t.mutation(api.financiero.anticipos.guardarAdjuntoBorradorDesembolso, {
      anticipoId,
      tesoreroUserId: TESORERO,
      storageId: archivo,
      nombre: "x.pdf",
    });
    expect(resultado).toMatchObject({ discarded: true });
    expect(await t.run(async (ctx) => ctx.db.system.get("_storage", archivo))).not.toBeNull();
  });
});

describe("anticipos: configuración de roles", () => {
  test("solo un administrador o la Gerencia de la empresa cambian los roles", async () => {
    const t = makeTest();
    await seedRoles(t);
    const base = {
      secret: SECRET,
      empresa: EMPRESA,
      rol: "TESORERO" as const,
      userId: "nuevo-tesorero",
      nombre: "Nuevo Tesorero",
      email: "nuevo@example.com",
    };

    await expect(
      t.mutation(api.financiero.anticipos.configurarRol, {
        ...base,
        actorUserId: TESORERO,
        actorEsAdmin: false,
      }),
    ).rejects.toThrow("No autorizado");
    await expect(
      t.mutation(api.financiero.anticipos.configurarRol, {
        ...base,
        secret: "otro-secreto",
        actorUserId: GERENTE,
        actorEsAdmin: false,
      }),
    ).rejects.toThrow("No autorizado");

    await t.mutation(api.financiero.anticipos.configurarRol, {
      ...base,
      actorUserId: GERENTE,
      actorEsAdmin: false,
    });
    await t.mutation(api.financiero.anticipos.configurarRol, {
      ...base,
      empresa: 2,
      actorUserId: "admin",
      actorEsAdmin: true,
    });
    // The company GERENCIA does not configure other companies.
    await expect(
      t.mutation(api.financiero.anticipos.configurarRol, {
        ...base,
        empresa: 2,
        actorUserId: GERENTE,
        actorEsAdmin: false,
      }),
    ).rejects.toThrow("No autorizado");

    const tesoreros = await t.run(async (ctx) =>
      ctx.db
        .query("anticiposRolesConfig")
        .withIndex("by_rol", (q) => q.eq("rol", "TESORERO"))
        .collect(),
    );
    expect(tesoreros.map((row) => [row.empresa, row.userId])).toEqual([
      [1, "nuevo-tesorero"],
      [2, "nuevo-tesorero"],
    ]);
  });
});
