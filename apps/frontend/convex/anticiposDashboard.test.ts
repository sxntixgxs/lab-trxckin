/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import { actingAsActorArgs } from "../test-utils/convexActingAs";

const modules = import.meta.glob("./**/*.*s");
const SECRET = "anticipos-dashboard-test-secret";
const EMPRESA = 1;
const SOLICITANTE = "solicitante-dashboard";
const CONTADOR = "contador-dashboard";
const GERENTE = "gerente-dashboard";
const TESORERO = "tesorero-dashboard";
const RESPONSABLE = "responsable-dashboard";

process.env.CONVEX_SERVER_SECRET = SECRET;

function makeTest() {
  return actingAsActorArgs(convexTest(schema, modules));
}

async function seedRoles(t: ReturnType<typeof makeTest>) {
  await t.run(async (ctx) => {
    await ctx.db.insert("anticiposRolesConfig", {
      empresa: EMPRESA,
      rol: "CONTABILIDAD",
      userId: CONTADOR,
      nombre: "Contador Dashboard",
      email: "contador@example.com",
      usuarios: [
        {
          userId: CONTADOR,
          nombre: "Contador Dashboard",
          email: "contador@example.com",
        },
      ],
    });
    await ctx.db.insert("anticiposRolesConfig", {
      empresa: EMPRESA,
      rol: "GERENCIA",
      userId: GERENTE,
      nombre: "Gerente Dashboard",
      email: "gerente@example.com",
    });
    await ctx.db.insert("anticiposRolesConfig", {
      empresa: EMPRESA,
      rol: "TESORERO",
      userId: TESORERO,
      nombre: "Tesorero Dashboard",
      email: "tesorero@example.com",
    });
  });
}

async function createAdvance(
  t: ReturnType<typeof makeTest>,
  overrides: Record<string, unknown> = {}
) {
  return await t.mutation(api.financiero.anticipos.crearAnticipo, {
    empresa: EMPRESA,
    empresa_id: EMPRESA,
    razonSocial: "Proveedor Dashboard",
    nit: "900765432",
    formaPago: "TRANSFERENCIA PAGO ELECTRÓNICO",
    valorNumerico: 750_000,
    valorLetra: "SETECIENTOS CINCUENTA MIL PESOS",
    maxLegalizacionDate: 1_800_000_000_000,
    createdById: SOLICITANTE,
    responsableUserId: RESPONSABLE,
    responsableNombre: "Responsable Legalización",
    responsableOrigen: "solicitante",
    ...overrides,
  });
}

async function projectedItem(t: ReturnType<typeof makeTest>, anticipoId: Id<"anticipos">) {
  return await t.run(async (ctx) =>
    ctx.db
      .query("anticiposDashboardItems")
      .withIndex("by_anticipoId", (q) => q.eq("anticipoId", anticipoId))
      .unique()
  );
}

describe("anticipos dashboard projection", () => {
  test("refreshes the compact item and active owner through each approval transition", async () => {
    const t = makeTest();
    await seedRoles(t);
    const { anticipoId } = await createAdvance(t);

    expect(await projectedItem(t, anticipoId)).toMatchObject({
      faseActual: "III_REVISION_CONTABILIDAD",
      valorContable: 750_000,
      saldoPendiente: 750_000,
      esActiva: true,
    });
    let owners = await t.run(async (ctx) =>
      ctx.db
        .query("anticiposDashboardResponsables")
        .withIndex("by_anticipoId", (q) => q.eq("anticipoId", anticipoId))
        .collect()
    );
    expect(owners.map((owner) => owner.userId)).toEqual([CONTADOR]);

    await t.mutation(api.financiero.anticipos.aprobarContabilidad, {
      anticipoId,
      contadorUserId: CONTADOR,
      decision: "APROBADO",
      valorContableNuevo: 700_000,
      observaciones: "Ajuste soportado por Contabilidad.",
    });
    expect(await projectedItem(t, anticipoId)).toMatchObject({
      faseActual: "IV_APROBACION_GERENCIA",
      valorContable: 700_000,
    });
    owners = await t.run(async (ctx) =>
      ctx.db
        .query("anticiposDashboardResponsables")
        .withIndex("by_anticipoId", (q) => q.eq("anticipoId", anticipoId))
        .collect()
    );
    expect(owners.map((owner) => owner.userId)).toEqual([GERENTE]);

    await t.mutation(api.financiero.anticipos.aprobarGerencia, {
      anticipoId,
      gerenteUserId: GERENTE,
      decision: "APROBADO",
    });
    expect((await projectedItem(t, anticipoId))?.faseActual).toBe("IV_DESEMBOLSO_TESORERIA");
    owners = await t.run(async (ctx) =>
      ctx.db
        .query("anticiposDashboardResponsables")
        .withIndex("by_anticipoId", (q) => q.eq("anticipoId", anticipoId))
        .collect()
    );
    expect(owners.map((owner) => owner.userId)).toEqual([TESORERO]);

    await t.mutation(api.financiero.anticipos.registrarDesembolsoTesoreria, {
      anticipoId,
      tesoreroUserId: TESORERO,
    });
    expect(await projectedItem(t, anticipoId)).toMatchObject({
      faseActual: "V_PENDIENTE_LEGALIZACION",
      saldoPendiente: 700_000,
    });
    owners = await t.run(async (ctx) =>
      ctx.db
        .query("anticiposDashboardResponsables")
        .withIndex("by_anticipoId", (q) => q.eq("anticipoId", anticipoId))
        .collect()
    );
    expect(owners.map((owner) => owner.userId)).toEqual([RESPONSABLE]);

    const counters = await t.run(async (ctx) =>
      ctx.db.query("anticiposDashboardContadoresDia").collect()
    );
    expect(counters.find((counter) => counter.clave === "solicitado")?.count).toBe(1);
    expect(counters.find((counter) => counter.clave === "aprobado_gerencia")?.count).toBe(1);
    expect(counters.find((counter) => counter.clave === "desembolsado")?.count).toBe(1);
  });

  test("backfill is paginated and refreshing an item does not duplicate counters", async () => {
    const t = makeTest();
    await seedRoles(t);
    const ids = await t.run(async (ctx) => {
      const result: Id<"anticipos">[] = [];
      for (const consecutivo of [100, 101]) {
        result.push(
          await ctx.db.insert("anticipos", {
            empresa: EMPRESA,
            empresa_id: EMPRESA,
            consecutivo,
            razonSocial: `Proveedor Backfill ${consecutivo}`,
            nit: `90000${consecutivo}`,
            formaPago: "TRANSFERENCIA PAGO ELECTRÓNICO",
            tipoBolsa: "general",
            valorNumerico: 100_000,
            valorContable: 100_000,
            valorLetra: "CIEN MIL PESOS",
            saldoLegalizado: 0,
            maxLegalizacionDate: 1_800_000_000_000,
            soportesSolicitud: [],
            createdById: SOLICITANTE,
            cubreFacturaCompleta: true,
            faseActual: "III_REVISION_CONTABILIDAD",
            legalizacion: [],
            createdAt: 1_783_200_000_000 + consecutivo,
            updatedAt: 1_783_200_000_000 + consecutivo,
          })
        );
      }
      await ctx.db.insert("anticiposDashboardBackfills", {
        clave: "projection-v1",
        estado: "running",
        cursor: null,
        procesadas: 0,
        lotes: 0,
        actualizadoEn: 1,
      });
      return result;
    });

    await t.mutation(internal.anticiposDashboard.ejecutarBackfillLote, {});
    const first = await t.run(async (ctx) => ({
      items: await ctx.db.query("anticiposDashboardItems").collect(),
      requested: await ctx.db
        .query("anticiposDashboardContadoresDia")
        .withIndex("by_empresa_fecha_clave")
        .collect(),
      backfill: await ctx.db
        .query("anticiposDashboardBackfills")
        .withIndex("by_clave", (q) => q.eq("clave", "projection-v1"))
        .unique(),
    }));
    expect(first.items).toHaveLength(2);
    expect(first.backfill).toMatchObject({ estado: "completed", procesadas: 2 });
    expect(first.requested.filter((counter) => counter.clave === "solicitado")).toHaveLength(1);
    expect(first.requested.find((counter) => counter.clave === "solicitado")?.count).toBe(2);

    await t.mutation(internal.anticiposDashboard.refrescarProyeccion, {
      anticipoId: ids[0]!,
      nowMs: 1_783_200_999_999,
    });
    const requestedAfterRetry = await t.run(async (ctx) =>
      ctx.db.query("anticiposDashboardContadoresDia").withIndex("by_empresa_fecha_clave").collect()
    );
    expect(requestedAfterRetry.find((counter) => counter.clave === "solicitado")?.count).toBe(2);
  });

  test("items enforces mine scope, normalized search and cursor pagination", async () => {
    const t = makeTest();
    await seedRoles(t);
    await createAdvance(t, { razonSocial: "Áridos del Norte" });
    await createAdvance(t, { razonSocial: "Proveedor Dos" });
    await createAdvance(t, {
      razonSocial: "Proveedor de Otro Usuario",
      createdById: "otro-solicitante",
    });

    const mine = await t.query(api.anticiposDashboard.items, {
      secret: SECRET,
      empresas: [EMPRESA],
      viewerUserId: SOLICITANTE,
      scope: "mine",
      pageSize: 2,
    });
    expect(mine.page).toHaveLength(1);
    expect(mine.isDone).toBe(false);

    const next = await t.query(api.anticiposDashboard.items, {
      secret: SECRET,
      empresas: [EMPRESA],
      viewerUserId: SOLICITANTE,
      scope: "mine",
      pageSize: 2,
      cursor: mine.continueCursor,
    });
    expect([...mine.page, ...next.page].map((item) => item.createdById)).toEqual([
      SOLICITANTE,
      SOLICITANTE,
    ]);

    const search = await t.query(api.anticiposDashboard.items, {
      secret: SECRET,
      empresas: [EMPRESA],
      viewerUserId: SOLICITANTE,
      scope: "mine",
      busqueda: "aridos",
      pageSize: 20,
    });
    expect(search.page.map((item: Doc<"anticipos">) => item.razonSocial)).toEqual([
      "Áridos del Norte",
    ]);
  });

  test("buzon orders regular tasks by phase age and supports owner filtering", async () => {
    const t = makeTest();
    await seedRoles(t);
    const first = await createAdvance(t, { razonSocial: "Asignación antigua" });
    const second = await createAdvance(t, { razonSocial: "Asignación reciente" });

    await t.run(async (ctx) => {
      const assignments = [
        { anticipoId: first.anticipoId, startedAt: 100 },
        { anticipoId: second.anticipoId, startedAt: 200 },
      ];
      for (const assignment of assignments) {
        const phase = await ctx.db
          .query("anticiposFases")
          .withIndex("by_anticipoId_fase", (q) =>
            q.eq("anticipoId", assignment.anticipoId).eq("fase", "III_REVISION_CONTABILIDAD")
          )
          .first();
        if (phase) await ctx.db.patch("anticiposFases", phase._id, { fechaInicio: assignment.startedAt });
      }
    });
    await t.mutation(internal.anticiposDashboard.refrescarProyeccion, {
      anticipoId: first.anticipoId,
      nowMs: 1_000,
    });
    await t.mutation(internal.anticiposDashboard.refrescarProyeccion, {
      anticipoId: second.anticipoId,
      nowMs: 1_000,
    });

    const inbox = await t.query(api.anticiposDashboard.items, {
      secret: SECRET,
      empresas: [EMPRESA],
      viewerUserId: CONTADOR,
      scope: "buzon",
      responsable: CONTADOR,
      pageSize: 20,
    });
    expect(inbox.page.map((item: Doc<"anticipos">) => String(item._id))).toEqual([
      String(first.anticipoId),
      String(second.anticipoId),
    ]);
  });

  test("buzon paginates the viewer assignments instead of filtering a company page", async () => {
    const t = makeTest();
    await seedRoles(t);
    for (let index = 0; index < 20; index += 1) {
      await createAdvance(t, {
        razonSocial: `Asignación de otro líder ${index}`,
        responsableUserId: `otro-lider-${index}`,
        responsableNombre: `Otro líder ${index}`,
        responsableOrigen: "jefe_directo",
      });
    }
    const wilson = await createAdvance(t, {
      razonSocial: "Anticipo asignado a Wilson",
      responsableUserId: CONTADOR,
      responsableNombre: "Wilson Mosos",
      responsableOrigen: "jefe_directo",
    });

    const inbox = await t.query(api.anticiposDashboard.items, {
      secret: SECRET,
      empresas: [EMPRESA],
      viewerUserId: CONTADOR,
      scope: "buzon",
      pageSize: 20,
    });

    expect(inbox.page).toHaveLength(1);
    expect(String(inbox.page[0]?._id)).toBe(String(wilson.anticipoId));
    expect(inbox.page[0]?.faseActual).toBe("II_APROBACION_JEFE_DIRECTO");
  });
});
