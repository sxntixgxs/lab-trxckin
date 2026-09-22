/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { actingAsActorArgs } from "../test-utils/convexActingAs";

const modules = import.meta.glob("./**/*.*s");

const EMPRESA = 1;
const SOLICITANTE = "solicitante-1";
const JEFE = "jefe-1";
const CONTADOR = "contador-1";
const GERENTE = "gerente-1";
const TESORERO = "tesorero-1";

const baseArgs = {
  empresa: EMPRESA,
  empresa_id: EMPRESA,
  razonSocial: "Proveedor Test",
  nit: "900123456",
  formaPago: "TRANSFERENCIA PAGO ELECTRÓNICO" as const,
  valorNumerico: 1_000_000,
  valorLetra: "UN MILLON DE PESOS",
  maxLegalizacionDate: 1_800_000_000_000,
  createdById: SOLICITANTE,
};

function makeTest() {
  return actingAsActorArgs(convexTest(schema, modules));
}

const seededRoles = new WeakSet<object>();

/** Phase mutations authorize the caller against `anticiposRolesConfig`, so seed one user per role. */
async function seedRoles(t: ReturnType<typeof makeTest>) {
  if (seededRoles.has(t)) return;
  seededRoles.add(t);
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

async function crearAnticipo(
  t: ReturnType<typeof makeTest>,
  overrides: Record<string, unknown> = {}
) {
  await seedRoles(t);
  return await t.mutation(api.financiero.anticipos.crearAnticipo, {
    ...baseArgs,
    ...overrides,
  });
}

async function obtenerAnticipo(
  t: ReturnType<typeof makeTest>,
  anticipoId: Id<"anticipos">
) {
  return await t.query(api.financiero.anticipos.obtenerAnticipoPorId, {
    id: anticipoId,
  });
}

describe("anticipos workflow routing", () => {
  test("default creation without jefe goes to contabilidad", async () => {
    const t = makeTest();
    const { anticipoId } = await crearAnticipo(t);

    const anticipo = await obtenerAnticipo(t, anticipoId);
    expect(anticipo?.faseActual).toBe("III_REVISION_CONTABILIDAD");
    expect(anticipo?.cubreFacturaCompleta).toBe(true);
  });

  test("non-100% creation without jefe goes to gerencia", async () => {
    const t = makeTest();
    const { anticipoId } = await crearAnticipo(t, {
      cubreFacturaCompleta: false,
    });

    const anticipo = await obtenerAnticipo(t, anticipoId);
    expect(anticipo?.faseActual).toBe("IV_APROBACION_GERENCIA");
    expect(anticipo?.cubreFacturaCompleta).toBe(false);
  });

  test("non-100% creation with jefe starts in jefe directo", async () => {
    const t = makeTest();
    const { anticipoId } = await crearAnticipo(t, {
      cubreFacturaCompleta: false,
      responsableUserId: JEFE,
      responsableOrigen: "jefe_directo",
    });

    const anticipo = await obtenerAnticipo(t, anticipoId);
    expect(anticipo?.faseActual).toBe("II_APROBACION_JEFE_DIRECTO");
  });

  test("non-100% with jefe approval goes to gerencia", async () => {
    const t = makeTest();
    const { anticipoId } = await crearAnticipo(t, {
      cubreFacturaCompleta: false,
      responsableUserId: JEFE,
      responsableOrigen: "jefe_directo",
    });

    await t.mutation(api.financiero.anticipos.aprobarJefeDirecto, {
      anticipoId,
      jefeDirectoUserId: JEFE,
      decision: "APROBADO",
    });

    const anticipo = await obtenerAnticipo(t, anticipoId);
    expect(anticipo?.faseActual).toBe("IV_APROBACION_GERENCIA");
  });

  test("100% creation with jefe still goes from jefe to contabilidad", async () => {
    const t = makeTest();
    const { anticipoId } = await crearAnticipo(t, {
      responsableUserId: JEFE,
      responsableOrigen: "jefe_directo",
    });

    await t.mutation(api.financiero.anticipos.aprobarJefeDirecto, {
      anticipoId,
      jefeDirectoUserId: JEFE,
      decision: "APROBADO",
    });

    const anticipo = await obtenerAnticipo(t, anticipoId);
    expect(anticipo?.faseActual).toBe("III_REVISION_CONTABILIDAD");
  });

  test("gerencia return target follows the actual route", async () => {
    const t = makeTest();

    const { anticipoId: anticipo100 } = await crearAnticipo(t, {
      responsableUserId: JEFE,
      responsableOrigen: "jefe_directo",
    });
    await t.mutation(api.financiero.anticipos.aprobarJefeDirecto, {
      anticipoId: anticipo100,
      jefeDirectoUserId: JEFE,
      decision: "APROBADO",
    });
    await t.mutation(api.financiero.anticipos.aprobarContabilidad, {
      anticipoId: anticipo100,
      contadorUserId: CONTADOR,
      decision: "APROBADO",
    });

    await t.mutation(api.financiero.anticipos.devolverAnticipo, {
      anticipoId: anticipo100,
      actorUserId: GERENTE,
      faseDestino: "III_REVISION_CONTABILIDAD",
      motivo: "Ajustar valor contable",
    });

    const anticipo100Devuelto = await obtenerAnticipo(t, anticipo100);
    expect(anticipo100Devuelto?.faseActual).toBe("III_REVISION_CONTABILIDAD");

    const { anticipoId: anticipoParcial } = await crearAnticipo(t, {
      cubreFacturaCompleta: false,
      responsableUserId: JEFE,
      responsableOrigen: "jefe_directo",
    });
    await t.mutation(api.financiero.anticipos.aprobarJefeDirecto, {
      anticipoId: anticipoParcial,
      jefeDirectoUserId: JEFE,
      decision: "APROBADO",
    });

    await t.mutation(api.financiero.anticipos.devolverAnticipo, {
      anticipoId: anticipoParcial,
      actorUserId: GERENTE,
      faseDestino: "II_APROBACION_JEFE_DIRECTO",
      motivo: "Revisar soporte",
    });

    const anticipoParcialDevuelto = await obtenerAnticipo(t, anticipoParcial);
    expect(anticipoParcialDevuelto?.faseActual).toBe(
      "II_APROBACION_JEFE_DIRECTO"
    );
  });

  test("gerencia cannot return partial anticipo without prior jefe review", async () => {
    const t = makeTest();
    const { anticipoId } = await crearAnticipo(t, {
      cubreFacturaCompleta: false,
    });

    await expect(
      t.mutation(api.financiero.anticipos.devolverAnticipo, {
        anticipoId,
        actorUserId: GERENTE,
        faseDestino: "II_APROBACION_JEFE_DIRECTO",
        motivo: "No aplica",
      })
    ).rejects.toThrow("La devolución seleccionada no aplica para esta fase.");
  });

  test("non-100% anticipos appear for gerencia and not in contabilidad queue", async () => {
    const t = makeTest();
    const { anticipoId } = await crearAnticipo(t, {
      cubreFacturaCompleta: false,
    });

    const anticipo = await obtenerAnticipo(t, anticipoId);
    expect(anticipo?.faseActual).toBe("IV_APROBACION_GERENCIA");

    const enContabilidad = await t.run(async (ctx) =>
      ctx.db
        .query("anticipos")
        .withIndex("by_faseActual", (q) =>
          q.eq("faseActual", "III_REVISION_CONTABILIDAD")
        )
        .collect()
    );
    expect(enContabilidad.some((row) => row._id === anticipoId)).toBe(false);
  });

  test("stores cubreFacturaCompleta in solicitud phase payload", async () => {
    const t = makeTest();
    const { anticipoId } = await crearAnticipo(t, {
      cubreFacturaCompleta: false,
    });

    const fases = await t.query(
      api.financiero.anticipos.obtenerFasesDeAnticipo,
      { anticipoId }
    );
    const solicitud = fases.find((fase) => fase.fase === "I_SOLICITUD");
    expect(solicitud?.payload).toMatchObject({
      cubreFacturaCompleta: false,
    });
  });

  test("peajes anticipos force cubreFacturaCompleta true", async () => {
    const t = makeTest();
    const { anticipoId } = await crearAnticipo(t, {
      tipoBolsa: "peajes",
      cubreFacturaCompleta: false,
    });

    const anticipo = await obtenerAnticipo(t, anticipoId);
    expect(anticipo?.cubreFacturaCompleta).toBe(true);
    expect(anticipo?.faseActual).toBe("III_REVISION_CONTABILIDAD");
  });
});

async function avanzarHastaTesoreria(
  t: ReturnType<typeof makeTest>,
  anticipoId: Id<"anticipos">
) {
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

async function storeTestFile(
  t: ReturnType<typeof makeTest>,
  contents: string,
  type = "application/pdf"
) {
  return await t.run(async (ctx) =>
    ctx.storage.store(new Blob([contents], { type }))
  );
}

describe("anticipos desembolso adjuntos persistence", () => {
  test("persists draft attachments across re-query and reads size from storage", async () => {
    const t = makeTest();
    const { anticipoId } = await crearAnticipo(t);
    await avanzarHastaTesoreria(t, anticipoId);

    const storageId = await storeTestFile(t, "soporte-a");
    const metadata = await t.run(async (ctx) =>
      ctx.db.system.get("_storage", storageId)
    );
    expect(metadata?.size).toBeGreaterThan(0);

    await t.mutation(
      api.financiero.anticipos.guardarAdjuntoBorradorDesembolso,
      {
        anticipoId,
        tesoreroUserId: TESORERO,
        storageId,
        nombre: "soporte-a.pdf",
      }
    );

    const adjuntos = await t.query(
      api.financiero.anticipos.obtenerAdjuntosBorradorDesembolso,
      { anticipoId }
    );
    expect(adjuntos).toHaveLength(1);
    expect(adjuntos[0]).toMatchObject({
      storageId,
      nombre: "soporte-a.pdf",
      tamanio: metadata!.size,
    });
  });

  test("deletes attachment rows and physical storage object", async () => {
    const t = makeTest();
    const { anticipoId } = await crearAnticipo(t);
    await avanzarHastaTesoreria(t, anticipoId);

    const storageId = await storeTestFile(t, "borrar-me");
    await t.mutation(
      api.financiero.anticipos.guardarAdjuntoBorradorDesembolso,
      {
        anticipoId,
        tesoreroUserId: TESORERO,
        storageId,
        nombre: "borrar.pdf",
      }
    );

    await t.mutation(
      api.financiero.anticipos.eliminarAdjuntoBorradorDesembolso,
      {
        anticipoId,
        tesoreroUserId: TESORERO,
        storageId,
      }
    );

    const adjuntos = await t.query(
      api.financiero.anticipos.obtenerAdjuntosBorradorDesembolso,
      { anticipoId }
    );
    expect(adjuntos).toHaveLength(0);

    const metadata = await t.run(async (ctx) =>
      ctx.db.system.get("_storage", storageId)
    );
    expect(metadata).toBeNull();
  });

  test("rejects deletion outside active Tesorería phase", async () => {
    const t = makeTest();
    const { anticipoId } = await crearAnticipo(t);
    await avanzarHastaTesoreria(t, anticipoId);

    const storageId = await storeTestFile(t, "fuera-fase");
    await t.mutation(
      api.financiero.anticipos.guardarAdjuntoBorradorDesembolso,
      {
        anticipoId,
        tesoreroUserId: TESORERO,
        storageId,
        nombre: "fuera.pdf",
      }
    );

    await t.mutation(api.financiero.anticipos.devolverAnticipo, {
      anticipoId,
      actorUserId: TESORERO,
      faseDestino: "IV_APROBACION_GERENCIA",
      motivo: "Revisar antes de desembolsar",
    });

    await expect(
      t.mutation(api.financiero.anticipos.eliminarAdjuntoBorradorDesembolso, {
        anticipoId,
        tesoreroUserId: TESORERO,
        storageId,
      })
    ).rejects.toThrow(
      "Sólo se pueden eliminar soportes mientras el anticipo esté en Tesorería."
    );
  });

  test("keeps DEVUELTO history with files and inherits them on return to Tesorería", async () => {
    const t = makeTest();
    const { anticipoId } = await crearAnticipo(t);
    await avanzarHastaTesoreria(t, anticipoId);

    const storageId = await storeTestFile(t, "reutilizar");
    await t.mutation(
      api.financiero.anticipos.guardarAdjuntoBorradorDesembolso,
      {
        anticipoId,
        tesoreroUserId: TESORERO,
        storageId,
        nombre: "reutilizar.pdf",
      }
    );

    await t.mutation(api.financiero.anticipos.devolverAnticipo, {
      anticipoId,
      actorUserId: TESORERO,
      faseDestino: "IV_APROBACION_GERENCIA",
      motivo: "Falta revisión",
    });

    const fasesDevuelto = await t.query(
      api.financiero.anticipos.obtenerFasesDeAnticipo,
      { anticipoId }
    );
    const faseDevuelta = fasesDevuelto.find(
      (fase) =>
        fase.fase === "IV_DESEMBOLSO_TESORERIA" && fase.estado === "DEVUELTO"
    );
    expect(faseDevuelta?.adjuntos).toEqual([
      { storageId, nombre: "reutilizar.pdf" },
    ]);

    await t.mutation(api.financiero.anticipos.aprobarGerencia, {
      anticipoId,
      gerenteUserId: GERENTE,
      decision: "APROBADO",
    });

    const borrador = await t.query(
      api.financiero.anticipos.obtenerAdjuntosBorradorDesembolso,
      { anticipoId }
    );
    expect(borrador).toHaveLength(1);
    expect(borrador[0]?.storageId).toBe(storageId);
  });

  test("later deletion also clears returned history references", async () => {
    const t = makeTest();
    const { anticipoId } = await crearAnticipo(t);
    await avanzarHastaTesoreria(t, anticipoId);

    const storageId = await storeTestFile(t, "limpiar-historial");
    await t.mutation(
      api.financiero.anticipos.guardarAdjuntoBorradorDesembolso,
      {
        anticipoId,
        tesoreroUserId: TESORERO,
        storageId,
        nombre: "historial.pdf",
      }
    );

    await t.mutation(api.financiero.anticipos.devolverAnticipo, {
      anticipoId,
      actorUserId: TESORERO,
      faseDestino: "IV_APROBACION_GERENCIA",
      motivo: "Devolver",
    });
    await t.mutation(api.financiero.anticipos.aprobarGerencia, {
      anticipoId,
      gerenteUserId: GERENTE,
      decision: "APROBADO",
    });

    await t.mutation(
      api.financiero.anticipos.eliminarAdjuntoBorradorDesembolso,
      {
        anticipoId,
        tesoreroUserId: TESORERO,
        storageId,
      }
    );

    const fases = await t.query(
      api.financiero.anticipos.obtenerFasesDeAnticipo,
      { anticipoId }
    );
    const fasesTesoreria = fases.filter(
      (fase) => fase.fase === "IV_DESEMBOLSO_TESORERIA"
    );
    for (const fase of fasesTesoreria) {
      expect(
        fase.adjuntos?.some((adjunto) => adjunto.storageId === storageId) ??
          false
      ).toBe(false);
    }
  });

  test("final registration uses only server-persisted supports", async () => {
    const t = makeTest();
    const { anticipoId } = await crearAnticipo(t);
    await avanzarHastaTesoreria(t, anticipoId);

    const storageIdA = await storeTestFile(t, "primero");
    const storageIdB = await storeTestFile(t, "segundo");
    await t.mutation(
      api.financiero.anticipos.guardarAdjuntoBorradorDesembolso,
      {
        anticipoId,
        tesoreroUserId: TESORERO,
        storageId: storageIdA,
        nombre: "primero.pdf",
      }
    );
    await t.mutation(
      api.financiero.anticipos.guardarAdjuntoBorradorDesembolso,
      {
        anticipoId,
        tesoreroUserId: TESORERO,
        storageId: storageIdB,
        nombre: "segundo.pdf",
      }
    );

    await t.mutation(api.financiero.anticipos.registrarDesembolsoTesoreria, {
      anticipoId,
      tesoreroUserId: TESORERO,
      observaciones: "Desembolso con soportes persistidos",
    });

    const anticipo = await obtenerAnticipo(t, anticipoId);
    expect(anticipo?.faseActual).toBe("V_PENDIENTE_LEGALIZACION");
    expect(anticipo?.desembolso?.soporte).toEqual({
      storageId: storageIdA,
      nombre: "primero.pdf",
    });

    const fases = await t.query(
      api.financiero.anticipos.obtenerFasesDeAnticipo,
      { anticipoId }
    );
    const faseCompletada = fases.find(
      (fase) =>
        fase.fase === "IV_DESEMBOLSO_TESORERIA" && fase.estado === "COMPLETADO"
    );
    expect(faseCompletada?.adjuntos).toEqual([
      { storageId: storageIdA, nombre: "primero.pdf" },
      { storageId: storageIdB, nombre: "segundo.pdf" },
    ]);
  });

  test("same file appears in returned and completed Tesorería attempts", async () => {
    const t = makeTest();
    const { anticipoId } = await crearAnticipo(t);
    await avanzarHastaTesoreria(t, anticipoId);

    const storageId = await storeTestFile(t, "ambos-intentos");
    await t.mutation(
      api.financiero.anticipos.guardarAdjuntoBorradorDesembolso,
      {
        anticipoId,
        tesoreroUserId: TESORERO,
        storageId,
        nombre: "ambos.pdf",
      }
    );

    await t.mutation(api.financiero.anticipos.devolverAnticipo, {
      anticipoId,
      actorUserId: TESORERO,
      faseDestino: "IV_APROBACION_GERENCIA",
      motivo: "Reintento",
    });
    await t.mutation(api.financiero.anticipos.aprobarGerencia, {
      anticipoId,
      gerenteUserId: GERENTE,
      decision: "APROBADO",
    });
    await t.mutation(api.financiero.anticipos.registrarDesembolsoTesoreria, {
      anticipoId,
      tesoreroUserId: TESORERO,
    });

    const fases = await t.query(
      api.financiero.anticipos.obtenerFasesDeAnticipo,
      { anticipoId }
    );
    const tesoreria = fases.filter(
      (fase) => fase.fase === "IV_DESEMBOLSO_TESORERIA"
    );
    const devuelta = tesoreria.find((fase) => fase.estado === "DEVUELTO");
    const completada = tesoreria.find((fase) => fase.estado === "COMPLETADO");
    expect(devuelta?.adjuntos).toEqual([
      { storageId, nombre: "ambos.pdf" },
    ]);
    expect(completada?.adjuntos).toEqual([
      { storageId, nombre: "ambos.pdf" },
    ]);
  });

  test("allows registration without attachments", async () => {
    const t = makeTest();
    const { anticipoId } = await crearAnticipo(t);
    await avanzarHastaTesoreria(t, anticipoId);

    await t.mutation(api.financiero.anticipos.registrarDesembolsoTesoreria, {
      anticipoId,
      tesoreroUserId: TESORERO,
    });

    const anticipo = await obtenerAnticipo(t, anticipoId);
    expect(anticipo?.faseActual).toBe("V_PENDIENTE_LEGALIZACION");
    expect(anticipo?.desembolso?.soporte).toBeUndefined();
  });

  test("deduplicates save races and discards orphan uploads after phase change", async () => {
    const t = makeTest();
    const { anticipoId } = await crearAnticipo(t);
    await avanzarHastaTesoreria(t, anticipoId);

    const storageId = await storeTestFile(t, "dedupe");
    await t.mutation(
      api.financiero.anticipos.guardarAdjuntoBorradorDesembolso,
      {
        anticipoId,
        tesoreroUserId: TESORERO,
        storageId,
        nombre: "dedupe.pdf",
      }
    );
    await t.mutation(
      api.financiero.anticipos.guardarAdjuntoBorradorDesembolso,
      {
        anticipoId,
        tesoreroUserId: TESORERO,
        storageId,
        nombre: "dedupe.pdf",
      }
    );

    const adjuntos = await t.query(
      api.financiero.anticipos.obtenerAdjuntosBorradorDesembolso,
      { anticipoId }
    );
    expect(adjuntos).toHaveLength(1);

    const orphanId = await storeTestFile(t, "huerfano");
    await t.mutation(api.financiero.anticipos.devolverAnticipo, {
      anticipoId,
      actorUserId: TESORERO,
      faseDestino: "IV_APROBACION_GERENCIA",
      motivo: "Cambio de fase durante carga",
    });

    const orphanResult = await t.mutation(
      api.financiero.anticipos.guardarAdjuntoBorradorDesembolso,
      {
        anticipoId,
        tesoreroUserId: TESORERO,
        storageId: orphanId,
        nombre: "huerfano.pdf",
      }
    );
    expect(orphanResult).toMatchObject({
      discarded: true,
      reason: expect.stringMatching(/ya no está en Tesorería/),
    });

    const orphanMeta = await t.run(async (ctx) =>
      ctx.db.system.get("_storage", orphanId)
    );
    expect(orphanMeta).toBeNull();
  });
});

describe("crearAnticipo proveedor origen", () => {
  test("stores SIESA origen, id and sucursal", async () => {
    const t = makeTest();
    const { anticipoId } = await crearAnticipo(t, {
      proveedorOrigen: "siesa",
      proveedorSiesaId: "prov-10",
      proveedorSiesaSucursalId: "suc-2",
    });

    const anticipo = await obtenerAnticipo(t, anticipoId);
    expect(anticipo?.proveedorOrigen).toBe("siesa");
    expect(anticipo?.proveedorSiesaId).toBe("prov-10");
    expect(anticipo?.proveedorSiesaSucursalId).toBe("suc-2");

    const faseSolicitud = await t.run(async (ctx) => {
      return await ctx.db
        .query("anticiposFases")
        .withIndex("by_anticipoId_fase", (q) =>
          q.eq("anticipoId", anticipoId).eq("fase", "I_SOLICITUD")
        )
        .unique();
    });
    expect(faseSolicitud?.payload).toMatchObject({
      proveedorOrigen: "siesa",
      proveedorSiesaId: "prov-10",
      proveedorSiesaSucursalId: "suc-2",
    });
  });

  test("stores manual_solicitud origen with confirmation snapshot", async () => {
    const t = makeTest();
    const { anticipoId } = await crearAnticipo(t, {
      proveedorOrigen: "manual_solicitud",
      proveedorManualConfirmado: true,
    });

    const anticipo = await obtenerAnticipo(t, anticipoId);
    expect(anticipo?.proveedorOrigen).toBe("manual_solicitud");
    expect(anticipo?.proveedorSiesaId).toBeUndefined();
    expect(anticipo?.proveedorSiesaSucursalId).toBeUndefined();

    const faseSolicitud = await t.run(async (ctx) => {
      return await ctx.db
        .query("anticiposFases")
        .withIndex("by_anticipoId_fase", (q) =>
          q.eq("anticipoId", anticipoId).eq("fase", "I_SOLICITUD")
        )
        .unique();
    });
    expect(faseSolicitud?.payload).toMatchObject({
      proveedorOrigen: "manual_solicitud",
      proveedorManualConfirmado: true,
    });
  });

  test("rejects manual without confirmation", async () => {
    const t = makeTest();
    await expect(
      crearAnticipo(t, {
        proveedorOrigen: "manual_solicitud",
        proveedorManualConfirmado: false,
      })
    ).rejects.toThrow(/confirmar/i);
  });

  test("rejects SIESA without identifier", async () => {
    const t = makeTest();
    await expect(
      crearAnticipo(t, {
        proveedorOrigen: "siesa",
      })
    ).rejects.toThrow(/SIESA/i);
  });

  test("rejects empty nit or razon social", async () => {
    const t = makeTest();
    await expect(crearAnticipo(t, { nit: "   " })).rejects.toThrow(/NIT/i);
    await expect(crearAnticipo(t, { razonSocial: "  " })).rejects.toThrow(
      /razón social/i
    );
    await expect(crearAnticipo(t, { nit: "1234" })).rejects.toThrow(
      /5 dígitos/i
    );
  });

  test("legacy creation without origen remains valid", async () => {
    const t = makeTest();
    const { anticipoId } = await crearAnticipo(t);
    const anticipo = await obtenerAnticipo(t, anticipoId);
    expect(anticipo?.proveedorOrigen).toBeUndefined();
    expect(anticipo?.razonSocial).toBe("Proveedor Test");
    expect(anticipo?.nit).toBe("900123456");
  });
});
