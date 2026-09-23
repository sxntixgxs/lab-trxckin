/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { actingAsActorArgs, DEFAULT_ACTOR_ID_KEYS } from "../test-utils/convexActingAs";
import { asUser } from "../test-utils/onboardingActors";

const modules = import.meta.glob("./**/*.*s");
const SECRET = "anticipos-ajustes-test-secret";
const EMPRESA = 1;
const SOLICITANTE = "solicitante-ajustes";
const CONTADOR = "contador-ajustes";
const GERENTE = "gerente-ajustes";
const TESORERO = "tesorero-ajustes";

process.env.CONVEX_SERVER_SECRET = SECRET;

/** Every seeded actor may request and manage advances of the tested company. */
const PRIVILEGIOS_ANTICIPOS = {
  permisos: ["finance/advances", "finance/advances/request"],
  empresas: [EMPRESA],
};

function makeTest() {
  return actingAsActorArgs(convexTest(schema, modules), DEFAULT_ACTOR_ID_KEYS, PRIVILEGIOS_ANTICIPOS);
}

/** The advance read queries check visibility per caller: read as a full-access user. */
async function lectorAnticipos(t: ReturnType<typeof makeTest>) {
  return await asUser(t, { id: "lector-anticipos", hasFullAccess: true, permisos: ["*"] });
}

async function seedRoles(t: ReturnType<typeof makeTest>) {
  await t.mutation(api.financiero.anticipos.configurarRol, {
    secret: SECRET,
    actorUserId: "admin-anticipos",
    actorEsAdmin: true,
    empresa: EMPRESA,
    rol: "CONTABILIDAD",
    usuarios: [{ userId: CONTADOR, nombre: "Contador", email: "contador@test.com" }],
  });
  await t.mutation(api.financiero.anticipos.configurarRol, {
    secret: SECRET,
    actorUserId: "admin-anticipos",
    actorEsAdmin: true,
    empresa: EMPRESA,
    rol: "GERENCIA",
    userId: GERENTE,
    nombre: "Gerente",
    email: "gerente@test.com",
  });
  await t.mutation(api.financiero.anticipos.configurarRol, {
    secret: SECRET,
    actorUserId: "admin-anticipos",
    actorEsAdmin: true,
    empresa: EMPRESA,
    rol: "TESORERO",
    userId: TESORERO,
    nombre: "Tesorero",
    email: "tesorero@test.com",
  });
}

async function crearAnticipoPendienteLegalizacion(
  t: ReturnType<typeof makeTest>,
  valorNumerico = 25_000,
  tipoBolsa: "general" | "peajes" = "general"
) {
  const { anticipoId } = await t.mutation(api.financiero.anticipos.crearAnticipo, {
    empresa: EMPRESA,
    empresa_id: EMPRESA,
    razonSocial: "Proveedor Ajustes",
    nit: "900555666",
    formaPago: "TRANSFERENCIA PAGO ELECTRÓNICO",
    valorNumerico,
    valorLetra: "VEINTICINCO MIL",
    maxLegalizacionDate: 1_900_000_000_000,
    createdById: SOLICITANTE,
    tipoBolsa,
  });

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
  await t.mutation(api.financiero.anticipos.registrarDesembolsoTesoreria, {
    anticipoId,
    tesoreroUserId: TESORERO,
  });

  return anticipoId;
}

async function aplicarAjuste(
  t: ReturnType<typeof makeTest>,
  anticipoId: Id<"anticipos">,
  args: {
    operacion: "SUMAR" | "RESTAR";
    montoAjuste: number;
    valorEsperado: number;
    operacionId?: string;
    actorUserId?: string;
    actorRol?: "GERENCIA" | "TESORERO";
    tipo?: "CORRECCION_DESEMBOLSO" | "REINTEGRO" | "CUADRE_OTROS_SISTEMAS";
    motivo?: string;
  }
) {
  return await t.mutation(api.financiero.anticiposAjustes.aplicarAjuste, {
    secret: SECRET,
    anticipoId,
    empresa: EMPRESA,
    operacionId: args.operacionId ?? `op-${Math.random()}`,
    tipo: args.tipo ?? "CORRECCION_DESEMBOLSO",
    operacion: args.operacion,
    montoAjuste: args.montoAjuste,
    valorEsperado: args.valorEsperado,
    motivo: args.motivo ?? "Ajuste de prueba",
    actor: {
      userId: args.actorUserId ?? GERENTE,
      nombre: "Actor",
      email: "actor@test.com",
      rol: args.actorRol ?? "GERENCIA",
    },
  });
}

describe("anticipos ajustes auditables", () => {
  test("aumenta un anticipo de peajes por cuadre con otros sistemas aunque supere el aprobado", async () => {
    const t = makeTest();
    await seedRoles(t);
    const anticipoId = await crearAnticipoPendienteLegalizacion(t, 2_000_000, "peajes");

    const result = await aplicarAjuste(t, anticipoId, {
      tipo: "CUADRE_OTROS_SISTEMAS",
      operacion: "SUMAR",
      montoAjuste: 350_000,
      valorEsperado: 2_000_000,
      motivo: "Cuadre contra el valor registrado en el sistema externo",
    });

    expect(result.resumen.valorAprobado).toBe(2_000_000);
    expect(result.resumen.valorLegalizable).toBe(2_350_000);
    expect(result.resumen.saldoPendiente).toBe(2_350_000);

    const anticipo = await (await lectorAnticipos(t)).query(api.financiero.anticipos.obtenerAnticipoPorId, {
      id: anticipoId,
    });
    expect(anticipo?.valorNumerico).toBe(2_000_000);
    expect(anticipo?.valorLegalizableActual).toBe(2_350_000);
    expect(anticipo?.tipoBolsa).toBe("peajes");

    const ajustes = await t.run(async (ctx) =>
      ctx.db
        .query("anticiposAjustes")
        .withIndex("by_anticipoId", (q) => q.eq("anticipoId", anticipoId))
        .collect()
    );
    expect(ajustes).toHaveLength(1);
    expect(ajustes[0]?.tipo).toBe("CUADRE_OTROS_SISTEMAS");
    expect(ajustes[0]?.valorAjuste).toBe(350_000);
  });

  test("rechaza restar con el tipo cuadre con otros sistemas", async () => {
    const t = makeTest();
    await seedRoles(t);
    const anticipoId = await crearAnticipoPendienteLegalizacion(t, 25_000, "peajes");

    await expect(
      aplicarAjuste(t, anticipoId, {
        tipo: "CUADRE_OTROS_SISTEMAS",
        operacion: "RESTAR",
        montoAjuste: 5_000,
        valorEsperado: 25_000,
      })
    ).rejects.toThrow(/cuadre con otros sistemas únicamente aumentan/);
  });

  test("habilita y aplica ajustes en anticipos de peajes", async () => {
    const t = makeTest();
    await seedRoles(t);
    const anticipoId = await crearAnticipoPendienteLegalizacion(t, 25_000, "peajes");

    const contexto = await t.query(api.financiero.anticiposAjustes.obtenerContextoAjustes, {
      secret: SECRET,
      anticipoId,
      actorUserId: GERENTE,
    });

    expect(contexto.tipoBolsa).toBe("peajes");
    expect(contexto.capacidades.puedeAplicar).toBe(true);

    const result = await aplicarAjuste(t, anticipoId, {
      operacion: "RESTAR",
      montoAjuste: 5_000,
      valorEsperado: 25_000,
    });

    expect(result.completado).toBe(false);
    const anticipo = await (await lectorAnticipos(t)).query(api.financiero.anticipos.obtenerAnticipoPorId, {
      id: anticipoId,
    });
    expect(anticipo?.tipoBolsa).toBe("peajes");
    expect(anticipo?.valorLegalizableActual).toBe(20_000);
    expect(anticipo?.saldoLegalizado ?? 0).toBe(0);
    expect(anticipo?.faseActual).toBe("V_PENDIENTE_LEGALIZACION");
  });

  test("aplica reducción de 25.000 a 20.000 con saldo legalizado 0", async () => {
    const t = makeTest();
    await seedRoles(t);
    const anticipoId = await crearAnticipoPendienteLegalizacion(t, 25_000);

    const result = await aplicarAjuste(t, anticipoId, {
      operacion: "RESTAR",
      montoAjuste: 5_000,
      valorEsperado: 25_000,
    });

    expect(result.completado).toBe(false);
    const anticipo = await (await lectorAnticipos(t)).query(api.financiero.anticipos.obtenerAnticipoPorId, {
      id: anticipoId,
    });
    expect(anticipo?.valorNumerico).toBe(25_000);
    expect(anticipo?.valorContable ?? anticipo?.valorNumerico).toBe(25_000);
    expect(anticipo?.valorLegalizableActual).toBe(20_000);
    expect(anticipo?.saldoLegalizado ?? 0).toBe(0);
    expect(anticipo?.faseActual).toBe("V_PENDIENTE_LEGALIZACION");
  });

  test("completa anticipo cuando resta deja legalizable igual al saldo legalizado", async () => {
    const t = makeTest();
    await seedRoles(t);
    const anticipoId = await crearAnticipoPendienteLegalizacion(t, 2_063_470);

    await t.run(async (ctx) => {
      await ctx.db.patch("anticipos", anticipoId, { saldoLegalizado: 2_063_468 });
    });

    const result = await aplicarAjuste(t, anticipoId, {
      operacion: "RESTAR",
      montoAjuste: 2,
      valorEsperado: 2_063_470,
    });

    expect(result.completado).toBe(true);
    const anticipo = await (await lectorAnticipos(t)).query(api.financiero.anticipos.obtenerAnticipoPorId, {
      id: anticipoId,
    });
    expect(anticipo?.faseActual).toBe("COMPLETADO");
    expect(anticipo?.valorLegalizableActual).toBe(2_063_468);
  });

  test("aplica corrección positiva de 20.000 a 22.000 sin superar aprobado", async () => {
    const t = makeTest();
    await seedRoles(t);
    const anticipoId = await crearAnticipoPendienteLegalizacion(t, 25_000);

    await aplicarAjuste(t, anticipoId, {
      operacion: "RESTAR",
      montoAjuste: 5_000,
      valorEsperado: 25_000,
    });

    const result = await aplicarAjuste(t, anticipoId, {
      operacion: "SUMAR",
      montoAjuste: 2_000,
      valorEsperado: 20_000,
    });

    expect(result.completado).toBe(false);
    const anticipo = await (await lectorAnticipos(t)).query(api.financiero.anticipos.obtenerAnticipoPorId, {
      id: anticipoId,
    });
    expect(anticipo?.valorLegalizableActual).toBe(22_000);
    expect(anticipo?.faseActual).toBe("V_PENDIENTE_LEGALIZACION");
  });

  test("rechaza resta superior al saldo legalizable disponible", async () => {
    const t = makeTest();
    await seedRoles(t);
    const anticipoId = await crearAnticipoPendienteLegalizacion(t, 25_000);
    await t.run(async (ctx) => {
      await ctx.db.patch("anticipos", anticipoId, { saldoLegalizado: 10_000 });
    });

    await expect(
      aplicarAjuste(t, anticipoId, {
        operacion: "RESTAR",
        montoAjuste: 20_000,
        valorEsperado: 25_000,
      })
    ).rejects.toThrow(/inferior al saldo legalizado|supera el saldo legalizable/);
  });

  test("rechaza suma superior al valor aprobado", async () => {
    const t = makeTest();
    await seedRoles(t);
    const anticipoId = await crearAnticipoPendienteLegalizacion(t, 25_000);

    await aplicarAjuste(t, anticipoId, {
      operacion: "RESTAR",
      montoAjuste: 10_000,
      valorEsperado: 25_000,
    });

    await expect(
      aplicarAjuste(t, anticipoId, {
        operacion: "SUMAR",
        montoAjuste: 11_000,
        valorEsperado: 15_000,
      })
    ).rejects.toThrow(/supera el valor aprobado/);
  });

  test("rechaza reintegro con operación sumar", async () => {
    const t = makeTest();
    await seedRoles(t);
    const anticipoId = await crearAnticipoPendienteLegalizacion(t, 25_000);

    await expect(
      aplicarAjuste(t, anticipoId, {
        operacion: "SUMAR",
        montoAjuste: 1_000,
        valorEsperado: 25_000,
        tipo: "REINTEGRO",
      })
    ).rejects.toThrow(/reintegros únicamente disminuyen/);
  });

  test("rechaza valorEsperado obsoleto", async () => {
    const t = makeTest();
    await seedRoles(t);
    const anticipoId = await crearAnticipoPendienteLegalizacion(t, 25_000);

    await expect(
      aplicarAjuste(t, anticipoId, {
        operacion: "RESTAR",
        montoAjuste: 1_000,
        valorEsperado: 24_000,
      })
    ).rejects.toThrow(/cambió/);
  });

  test("idempotencia por operacionId", async () => {
    const t = makeTest();
    await seedRoles(t);
    const anticipoId = await crearAnticipoPendienteLegalizacion(t, 25_000);
    const operacionId = "op-idempotente";

    const first = await aplicarAjuste(t, anticipoId, {
      operacionId,
      operacion: "RESTAR",
      montoAjuste: 5_000,
      valorEsperado: 25_000,
    });
    const second = await aplicarAjuste(t, anticipoId, {
      operacionId,
      operacion: "RESTAR",
      montoAjuste: 5_000,
      valorEsperado: 20_000,
    });

    expect(first.idempotente).toBe(false);
    expect(second.idempotente).toBe(true);

    const ajustes = await t.run(async (ctx) =>
      ctx.db
        .query("anticiposAjustes")
        .withIndex("by_anticipoId", (q) => q.eq("anticipoId", anticipoId))
        .collect()
    );
    expect(ajustes).toHaveLength(1);
  });

  test("reversa último ajuste y reabre anticipo completado", async () => {
    const t = makeTest();
    await seedRoles(t);
    const anticipoId = await crearAnticipoPendienteLegalizacion(t, 25_000);
    await t.run(async (ctx) => {
      await ctx.db.patch("anticipos", anticipoId, { saldoLegalizado: 20_000 });
    });

    const applied = await aplicarAjuste(t, anticipoId, {
      operacion: "RESTAR",
      montoAjuste: 5_000,
      valorEsperado: 25_000,
    });
    expect(applied.completado).toBe(true);

    const reversed = await t.mutation(api.financiero.anticiposAjustes.reversarAjuste, {
      secret: SECRET,
      anticipoId,
      ajusteId: applied.ajusteId,
      empresa: EMPRESA,
      operacionId: "reverso-1",
      motivo: "Corrección administrativa",
      actor: {
        userId: GERENTE,
        nombre: "Gerente",
        email: "gerente@test.com",
        rol: "GERENCIA",
      },
    });

    expect(reversed.reabierto).toBe(true);
    const anticipo = await (await lectorAnticipos(t)).query(api.financiero.anticipos.obtenerAnticipoPorId, {
      id: anticipoId,
    });
    expect(anticipo?.valorLegalizableActual).toBe(25_000);
    expect(anticipo?.faseActual).toBe("V_PENDIENTE_LEGALIZACION");
  });

  test("bloquea reverso de ajuste positivo si valor anterior queda por debajo de lo legalizado", async () => {
    const t = makeTest();
    await seedRoles(t);
    const anticipoId = await crearAnticipoPendienteLegalizacion(t, 25_000);

    await aplicarAjuste(t, anticipoId, {
      operacion: "RESTAR",
      montoAjuste: 5_000,
      valorEsperado: 25_000,
    });

    const suma = await aplicarAjuste(t, anticipoId, {
      operacion: "SUMAR",
      montoAjuste: 2_000,
      valorEsperado: 20_000,
    });

    await t.run(async (ctx) => {
      await ctx.db.patch("anticipos", anticipoId, { saldoLegalizado: 21_000 });
    });

    await expect(
      t.mutation(api.financiero.anticiposAjustes.reversarAjuste, {
        secret: SECRET,
        anticipoId,
        ajusteId: suma.ajusteId,
        empresa: EMPRESA,
        operacionId: "reverso-bloqueado",
        motivo: "Intento inválido",
        actor: {
          userId: GERENTE,
          nombre: "Gerente",
          email: "gerente@test.com",
          rol: "GERENCIA",
        },
      })
    ).rejects.toThrow(/valor anterior quedaría por debajo de lo legalizado/);
  });

  test("rechaza usuario sin rol configurado", async () => {
    const t = makeTest();
    await seedRoles(t);
    const anticipoId = await crearAnticipoPendienteLegalizacion(t, 25_000);

    await expect(
      aplicarAjuste(t, anticipoId, {
        operacion: "RESTAR",
        montoAjuste: 5_000,
        valorEsperado: 25_000,
        actorUserId: "intruso",
      })
    ).rejects.toThrow(/Sin permiso/);
  });

  test("completa anticipo con resta decimal de 0,5 sobre saldo pendiente", async () => {
    const t = makeTest();
    await seedRoles(t);
    const valorLegalizable = 4_354_180;
    const saldoLegalizado = 4_354_179.5;
    const anticipoId = await crearAnticipoPendienteLegalizacion(t, valorLegalizable);

    await t.run(async (ctx) => {
      await ctx.db.patch("anticipos", anticipoId, { saldoLegalizado });
    });

    const result = await aplicarAjuste(t, anticipoId, {
      operacion: "RESTAR",
      montoAjuste: 0.5,
      valorEsperado: valorLegalizable,
    });

    expect(result.completado).toBe(true);
    const anticipo = await (await lectorAnticipos(t)).query(api.financiero.anticipos.obtenerAnticipoPorId, {
      id: anticipoId,
    });
    expect(anticipo?.valorLegalizableActual).toBe(4_354_179.5);
    expect(anticipo?.faseActual).toBe("COMPLETADO");

    const ajustes = await t.run(async (ctx) =>
      ctx.db
        .query("anticiposAjustes")
        .withIndex("by_anticipoId", (q) => q.eq("anticipoId", anticipoId))
        .collect()
    );
    expect(ajustes).toHaveLength(1);
    expect(ajustes[0]?.valorAjuste).toBe(-0.5);
  });

  test("aplica suma decimal sin superar el valor aprobado", async () => {
    const t = makeTest();
    await seedRoles(t);
    const anticipoId = await crearAnticipoPendienteLegalizacion(t, 25_000);

    await aplicarAjuste(t, anticipoId, {
      operacion: "RESTAR",
      montoAjuste: 5_000,
      valorEsperado: 25_000,
    });

    const result = await aplicarAjuste(t, anticipoId, {
      operacion: "SUMAR",
      montoAjuste: 0.25,
      valorEsperado: 20_000,
    });

    const anticipo = await (await lectorAnticipos(t)).query(api.financiero.anticipos.obtenerAnticipoPorId, {
      id: anticipoId,
    });
    expect(anticipo?.valorLegalizableActual).toBe(20_000.25);
    expect(result.completado).toBe(false);
  });

  test("rechaza montos inválidos y precisión excesiva", async () => {
    const t = makeTest();
    await seedRoles(t);
    const anticipoId = await crearAnticipoPendienteLegalizacion(t, 25_000);

    await expect(
      aplicarAjuste(t, anticipoId, {
        operacion: "RESTAR",
        montoAjuste: 0,
        valorEsperado: 25_000,
      })
    ).rejects.toThrow(/mayor a cero y tener máximo dos decimales/);

    await expect(
      aplicarAjuste(t, anticipoId, {
        operacion: "RESTAR",
        montoAjuste: -1,
        valorEsperado: 25_000,
      })
    ).rejects.toThrow(/mayor a cero y tener máximo dos decimales/);

    await expect(
      aplicarAjuste(t, anticipoId, {
        operacion: "RESTAR",
        montoAjuste: 0.001,
        valorEsperado: 25_000,
      })
    ).rejects.toThrow(/mayor a cero y tener máximo dos decimales/);
  });

  test("rechaza resta decimal que supera el límite por 0,01", async () => {
    const t = makeTest();
    await seedRoles(t);
    const anticipoId = await crearAnticipoPendienteLegalizacion(t, 100);

    await t.run(async (ctx) => {
      await ctx.db.patch("anticipos", anticipoId, { saldoLegalizado: 50.5 });
    });

    await expect(
      aplicarAjuste(t, anticipoId, {
        operacion: "RESTAR",
        montoAjuste: 50.51,
        valorEsperado: 100,
      })
    ).rejects.toThrow(/supera el saldo legalizable/);
  });

  test("reversa ajuste decimal y reabre anticipo completado", async () => {
    const t = makeTest();
    await seedRoles(t);
    const anticipoId = await crearAnticipoPendienteLegalizacion(t, 100);

    await t.run(async (ctx) => {
      await ctx.db.patch("anticipos", anticipoId, { saldoLegalizado: 99.5 });
    });

    const applied = await aplicarAjuste(t, anticipoId, {
      operacion: "RESTAR",
      montoAjuste: 0.5,
      valorEsperado: 100,
    });
    expect(applied.completado).toBe(true);

    const reversed = await t.mutation(api.financiero.anticiposAjustes.reversarAjuste, {
      secret: SECRET,
      anticipoId,
      ajusteId: applied.ajusteId,
      empresa: EMPRESA,
      operacionId: "reverso-decimal",
      motivo: "Corrección decimal",
      actor: {
        userId: GERENTE,
        nombre: "Gerente",
        email: "gerente@test.com",
        rol: "GERENCIA",
      },
    });

    expect(reversed.reabierto).toBe(true);
    const anticipo = await (await lectorAnticipos(t)).query(api.financiero.anticipos.obtenerAnticipoPorId, {
      id: anticipoId,
    });
    expect(anticipo?.valorLegalizableActual).toBe(100);
    expect(anticipo?.faseActual).toBe("V_PENDIENTE_LEGALIZACION");
  });
});
