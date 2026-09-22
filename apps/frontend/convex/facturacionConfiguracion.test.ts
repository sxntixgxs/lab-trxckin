/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");

const NOW = 1_779_840_000_000;
const DEFAULT_CUENTA = {
  empresa: 1,
  email: "facturas@example.com",
};

function makeTest() {
  return convexTest(schema, modules);
}

async function seedCuentaRecepcion(
  t: ReturnType<typeof makeTest>,
  args: {
    empresa: number;
    valor: string;
    sincronizacionGraphDeshabilitada?: boolean;
  },
) {
  await t.run(async (ctx) => {
    await ctx.db.insert("facturacionConfiguracion", {
      empresa: args.empresa,
      clave: "cuenta_recepcion",
      tipo: "texto",
      valor: args.valor,
      ...(args.sincronizacionGraphDeshabilitada !== undefined
        ? {
            sincronizacionGraphDeshabilitada:
              args.sincronizacionGraphDeshabilitada,
          }
        : {}),
      actualizadoEn: NOW,
    });
  });
}

describe("facturacion configuracion cuenta recepcion", () => {
  test("sin cuentas configuradas retorna la cuenta por defecto", async () => {
    const t = makeTest();

    const result = await t.query(
      internal.facturacionConfiguracion.listarCuentasRecepcionInterno,
      {},
    );

    expect(result).toEqual({
      cuentas: [DEFAULT_CUENTA],
      omitidas: [],
    });
  });

  test("retorna cuentas activas y omite cuentas en carga manual", async () => {
    const t = makeTest();
    await seedCuentaRecepcion(t, {
      empresa: 1,
      valor: "Recepcion.Facturas@Example.com",
    });
    await seedCuentaRecepcion(t, {
      empresa: 4,
      valor: "facturas@altiplano.example.com",
      sincronizacionGraphDeshabilitada: true,
    });

    const result = await t.query(
      internal.facturacionConfiguracion.listarCuentasRecepcionInterno,
      {},
    );

    expect(result).toEqual({
      cuentas: [{ empresa: 1, email: "recepcion.facturas@example.com" }],
      omitidas: [
        { empresa: 4, email: "facturas@altiplano.example.com", motivo: "carga_manual" },
      ],
    });
  });

  test("una cuenta manual vacia no cae al fallback por defecto", async () => {
    const t = makeTest();
    await seedCuentaRecepcion(t, {
      empresa: 4,
      valor: "",
      sincronizacionGraphDeshabilitada: true,
    });

    const result = await t.query(
      internal.facturacionConfiguracion.listarCuentasRecepcionInterno,
      {},
    );

    expect(result).toEqual({
      cuentas: [],
      omitidas: [{ empresa: 4, email: "", motivo: "carga_manual" }],
    });
  });

  test("guardarCuentaRecepcion guarda el modo manual y listar lo expone", async () => {
    const t = makeTest();

    await t.mutation(api.facturacionConfiguracion.guardarCuentaRecepcion, {
      empresa: 4,
      valor: "",
      sincronizacionGraphDeshabilitada: true,
      actualizadoPorUserId: "actor-1",
      actualizadoPorNombre: "Usuario Facturacion",
    });

    const config = await t.query(api.facturacionConfiguracion.listar, {
      empresa: 4,
    });

    expect(config.cuenta_recepcion).toMatchObject({
      empresa: 4,
      clave: "cuenta_recepcion",
      tipo: "texto",
      valor: "",
      sincronizacionGraphDeshabilitada: true,
      actualizadoPorUserId: "actor-1",
      actualizadoPorNombre: "Usuario Facturacion",
    });
  });

  test("Graph activo requiere email y modo manual permite cuenta vacia", async () => {
    const t = makeTest();

    await expect(
      t.mutation(api.facturacionConfiguracion.guardarCuentaRecepcion, {
        empresa: 1,
        valor: "",
        sincronizacionGraphDeshabilitada: false,
      }),
    ).rejects.toThrow("Ingresa la cuenta de recepción");

    await expect(
      t.mutation(api.facturacionConfiguracion.guardarCuentaRecepcion, {
        empresa: 4,
        valor: "",
        sincronizacionGraphDeshabilitada: true,
      }),
    ).resolves.toBeTruthy();
  });
});

describe("facturacion configuracion gerencia", () => {
  const GERENTE_A = {
    usuarioId: "gerente-a",
    nombre: "Gerente A",
    email: "gerente-a@example.com",
  };
  const GERENTE_B = {
    usuarioId: "gerente-b",
    nombre: "Gerente B",
    email: "gerente-b@example.com",
  };

  test("guarda una sola gerencia y queda como default", async () => {
    const t = makeTest();

    await t.mutation(api.facturacionConfiguracion.guardarGerencias, {
      empresa: 1,
      usuarios: [GERENTE_A],
      defaultUsuarioId: GERENTE_A.usuarioId,
    });

    const listado = await t.query(
      api.facturacionConfiguracion.listarUsuariosPorClave,
      { clave: "gerencia", empresas: [1] },
    );

    expect(listado["1"]).toEqual([GERENTE_A]);
  });

  test("guarda multiples gerencias con default primero", async () => {
    const t = makeTest();

    await t.mutation(api.facturacionConfiguracion.guardarGerencias, {
      empresa: 1,
      usuarios: [GERENTE_A, GERENTE_B],
      defaultUsuarioId: GERENTE_B.usuarioId,
    });

    const listado = await t.query(
      api.facturacionConfiguracion.listarUsuariosPorClave,
      { clave: "gerencia", empresas: [1] },
    );

    expect(listado["1"]).toEqual([GERENTE_B, GERENTE_A]);
  });

  test("config legacy de usuario unico sigue resolviendo", async () => {
    const t = makeTest();

    await t.run(async (ctx) => {
      await ctx.db.insert("facturacionConfiguracion", {
        empresa: 1,
        clave: "gerencia",
        tipo: "usuario",
        usuarioId: GERENTE_A.usuarioId,
        nombre: GERENTE_A.nombre,
        email: GERENTE_A.email,
        actualizadoEn: NOW,
      });
    });

    const listado = await t.query(
      api.facturacionConfiguracion.listarUsuariosPorClave,
      { clave: "gerencia", empresas: [1] },
    );

    expect(listado["1"]).toEqual([GERENTE_A]);
  });

  test("rechaza lista vacia, usuarios repetidos y default invalido", async () => {
    const t = makeTest();

    await expect(
      t.mutation(api.facturacionConfiguracion.guardarGerencias, {
        empresa: 1,
        usuarios: [],
        defaultUsuarioId: GERENTE_A.usuarioId,
      }),
    ).rejects.toThrow("Configura al menos un usuario de gerencia.");

    await expect(
      t.mutation(api.facturacionConfiguracion.guardarGerencias, {
        empresa: 1,
        usuarios: [GERENTE_A, GERENTE_A],
        defaultUsuarioId: GERENTE_A.usuarioId,
      }),
    ).rejects.toThrow("No repitas usuarios en la lista.");

    await expect(
      t.mutation(api.facturacionConfiguracion.guardarGerencias, {
        empresa: 1,
        usuarios: [GERENTE_A, GERENTE_B],
        defaultUsuarioId: "gerente-x",
      }),
    ).rejects.toThrow("Selecciona un gerente default válido.");
  });
});
