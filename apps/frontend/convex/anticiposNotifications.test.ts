/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  type AnticipoNotificationEvent,
  dedupeAnticipoNotificationRecipients,
} from "./lib/anticiposNotifications";
import schema from "./schema";
import { actingAsActorArgs } from "../test-utils/convexActingAs";

const modules = import.meta.glob("./**/*.*s");
const SECRET = "anticipos-notifications-test-secret";

process.env.CONVEX_SERVER_SECRET = SECRET;

const EMPRESA = 1;
const SOLICITANTE = {
  userId: "solicitante-1",
  nombre: "Sara Solicitante",
  email: "sara.solicitante@example.com",
};
const JEFE = {
  userId: "jefe-1",
  nombre: "Jaime Jefe",
  email: "jaime.jefe@example.com",
};
const CONTADOR = {
  userId: "contador-1",
  nombre: "Camila Contabilidad",
  email: "camila.contabilidad@example.com",
};
const GERENTE = {
  userId: "gerente-1",
  nombre: "Gabriela Gerencia",
  email: "gabriela.gerencia@example.com",
};
const TESORERO = {
  userId: "tesorero-1",
  nombre: "Tomás Tesorería",
  email: "tomas.tesoreria@example.com",
};

function makeTest() {
  return actingAsActorArgs(convexTest(schema, modules));
}

async function scheduledNotificationFor(
  t: ReturnType<typeof makeTest>,
  event: AnticipoNotificationEvent
) {
  const jobs = await t.run(async (ctx) => ctx.db.system.query("_scheduled_functions").collect());
  return jobs.find((job) => {
    const serialized = JSON.stringify(job);
    return (
      serialized.includes("enviarNotificacionAnticipo") &&
      serialized.includes(`\"evento\":\"${event}\"`)
    );
  });
}

async function configureRoles(t: ReturnType<typeof makeTest>) {
  await t.mutation(api.financiero.anticipos.configurarRol, {
    secret: SECRET,
    empresa: EMPRESA,
    rol: "CONTABILIDAD",
    usuarios: [CONTADOR],
  });
  await t.mutation(api.financiero.anticipos.configurarRol, {
    secret: SECRET,
    empresa: EMPRESA,
    rol: "GERENCIA",
    ...GERENTE,
  });
  await t.mutation(api.financiero.anticipos.configurarRol, {
    secret: SECRET,
    empresa: EMPRESA,
    rol: "TESORERO",
    ...TESORERO,
  });
}

async function createAdvance(t: ReturnType<typeof makeTest>) {
  return await t.mutation(api.financiero.anticipos.crearAnticipo, {
    empresa: EMPRESA,
    empresa_id: EMPRESA,
    razonSocial: "Proveedor de prueba",
    nit: "900123456",
    formaPago: "TRANSFERENCIA PAGO ELECTRÓNICO",
    valorNumerico: 1_000_000,
    valorLetra: "UN MILLÓN DE PESOS",
    maxLegalizacionDate: 1_900_000_000_000,
    createdById: SOLICITANTE.userId,
    solicitanteNombre: SOLICITANTE.nombre,
    solicitanteEmail: SOLICITANTE.email,
    responsableUserId: JEFE.userId,
    responsableNombre: JEFE.nombre,
    responsableEmail: JEFE.email,
    responsableOrigen: "jefe_directo",
    cubreFacturaCompleta: true,
  });
}

describe("notificaciones del flujo de anticipos", () => {
  test("deduplica destinatarios por correo sin distinguir mayúsculas", () => {
    expect(
      dedupeAnticipoNotificationRecipients([
        { nombre: "Primero", email: "PERSONA@EXAMPLE.COM" },
        { nombre: "Duplicado", email: "persona@example.com" },
      ])
    ).toEqual([{ nombre: "Primero", email: "persona@example.com" }]);
  });

  test("conserva el ID para resolver solicitantes antiguos sin correo guardado", async () => {
    const t = makeTest();
    await t.mutation(api.financiero.anticipos.crearAnticipo, {
      empresa: EMPRESA,
      empresa_id: EMPRESA,
      razonSocial: "Proveedor histórico",
      nit: "900654321",
      formaPago: "TRANSFERENCIA PAGO ELECTRÓNICO",
      valorNumerico: 100_000,
      valorLetra: "CIEN MIL PESOS",
      maxLegalizacionDate: 1_900_000_000_000,
      createdById: SOLICITANTE.userId,
      cubreFacturaCompleta: false,
    });

    const solicitud = await scheduledNotificationFor(t, "I_SOLICITUD");
    expect(JSON.stringify(solicitud)).toContain(SOLICITANTE.userId);
  });

  test("notifica al responsable correspondiente al entrar en cada fase", async () => {
    const t = makeTest();
    await configureRoles(t);
    const { anticipoId } = await createAdvance(t);

    const solicitud = await scheduledNotificationFor(t, "I_SOLICITUD");
    const jefe = await scheduledNotificationFor(t, "II_APROBACION_JEFE_DIRECTO");
    expect(JSON.stringify(solicitud)).toContain(SOLICITANTE.email);
    expect(JSON.stringify(jefe)).toContain(JEFE.email);

    await t.mutation(api.financiero.anticipos.aprobarJefeDirecto, {
      anticipoId,
      jefeDirectoUserId: JEFE.userId,
      decision: "APROBADO",
    });
    const contabilidad = await scheduledNotificationFor(t, "III_REVISION_CONTABILIDAD");
    expect(JSON.stringify(contabilidad)).toContain(CONTADOR.email);

    await t.mutation(api.financiero.anticipos.aprobarContabilidad, {
      anticipoId,
      contadorUserId: CONTADOR.userId,
      decision: "APROBADO",
    });
    const gerencia = await scheduledNotificationFor(t, "IV_APROBACION_GERENCIA");
    expect(JSON.stringify(gerencia)).toContain(GERENTE.email);

    await t.mutation(api.financiero.anticipos.aprobarGerencia, {
      anticipoId,
      gerenteUserId: GERENTE.userId,
      decision: "APROBADO",
    });
    const tesoreria = await scheduledNotificationFor(t, "IV_DESEMBOLSO_TESORERIA");
    expect(JSON.stringify(tesoreria)).toContain(TESORERO.email);
  });

  test("al desembolsar notifica al solicitante y al aprobador seleccionado", async () => {
    const t = makeTest();
    await configureRoles(t);
    const { anticipoId } = await createAdvance(t);
    await t.mutation(api.financiero.anticipos.aprobarJefeDirecto, {
      anticipoId,
      jefeDirectoUserId: JEFE.userId,
      decision: "APROBADO",
    });
    await t.mutation(api.financiero.anticipos.aprobarContabilidad, {
      anticipoId,
      contadorUserId: CONTADOR.userId,
      decision: "APROBADO",
    });
    await t.mutation(api.financiero.anticipos.aprobarGerencia, {
      anticipoId,
      gerenteUserId: GERENTE.userId,
      decision: "APROBADO",
    });

    await t.mutation(api.financiero.anticipos.registrarDesembolsoTesoreria, {
      anticipoId,
      tesoreroUserId: TESORERO.userId,
    });

    const pendienteLegalizacion = await scheduledNotificationFor(t, "V_PENDIENTE_LEGALIZACION");
    const serialized = JSON.stringify(pendienteLegalizacion);
    expect(serialized).toContain(SOLICITANTE.email);
    expect(serialized).toContain(JEFE.email);
    expect(serialized.match(new RegExp(SOLICITANTE.email, "g"))).toHaveLength(1);
    expect(serialized.match(new RegExp(JEFE.email, "g"))).toHaveLength(1);
  });

  test("la notificación de legalización completa conserva ambos interesados", async () => {
    const t = makeTest();
    const { anticipoId } = await createAdvance(t);

    await t.run(async (ctx) => {
      const anticipo = await ctx.db.get("anticipos", anticipoId as Id<"anticipos">);
      if (!anticipo) throw new Error("Anticipo de prueba no encontrado");
      const { scheduleAnticipoPhaseNotification } = await import("./lib/anticiposNotifications");
      await scheduleAnticipoPhaseNotification(ctx, anticipo, "VI_LEGALIZADO");
    });

    const legalizado = await scheduledNotificationFor(t, "VI_LEGALIZADO");
    const serialized = JSON.stringify(legalizado);
    expect(serialized).toContain(SOLICITANTE.email);
    expect(serialized).toContain(JEFE.email);
  });
});
