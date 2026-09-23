/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { asUser } from "../test-utils/onboardingActors";
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

/** A billing settings user of companies 1 and 4 (the only ones these tests configure). */
const CONFIGURADOR = {
  id: "actor-1",
  nombre: "Usuario Facturacion",
  permisos: ["billing/settings"],
  empresas: [1, 4],
};

async function configurador(t: ReturnType<typeof makeTest>) {
  return await asUser(t, CONFIGURADOR);
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

    await (await configurador(t)).mutation(api.facturacionConfiguracion.guardarCuentaRecepcion, {
      empresa: 4,
      valor: "",
      sincronizacionGraphDeshabilitada: true,
      actualizadoPorUserId: "actor-1",
      actualizadoPorNombre: "Usuario Facturacion",
    });

    const config = await (await configurador(t)).query(api.facturacionConfiguracion.listar, {
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
      (await configurador(t)).mutation(api.facturacionConfiguracion.guardarCuentaRecepcion, {
        empresa: 1,
        valor: "",
        sincronizacionGraphDeshabilitada: false,
      }),
    ).rejects.toThrow("Ingresa la cuenta de recepción");

    await expect(
      (await configurador(t)).mutation(api.facturacionConfiguracion.guardarCuentaRecepcion, {
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

    await (await configurador(t)).mutation(api.facturacionConfiguracion.guardarGerencias, {
      empresa: 1,
      usuarios: [GERENTE_A],
      defaultUsuarioId: GERENTE_A.usuarioId,
    });

    const listado = await (await configurador(t)).query(
      api.facturacionConfiguracion.listarUsuariosPorClave,
      { clave: "gerencia", empresas: [1] },
    );

    expect(listado["1"]).toEqual([GERENTE_A]);
  });

  test("guarda multiples gerencias con default primero", async () => {
    const t = makeTest();

    await (await configurador(t)).mutation(api.facturacionConfiguracion.guardarGerencias, {
      empresa: 1,
      usuarios: [GERENTE_A, GERENTE_B],
      defaultUsuarioId: GERENTE_B.usuarioId,
    });

    const listado = await (await configurador(t)).query(
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

    const listado = await (await configurador(t)).query(
      api.facturacionConfiguracion.listarUsuariosPorClave,
      { clave: "gerencia", empresas: [1] },
    );

    expect(listado["1"]).toEqual([GERENTE_A]);
  });

  test("rechaza lista vacia, usuarios repetidos y default invalido", async () => {
    const t = makeTest();

    await expect(
      (await configurador(t)).mutation(api.facturacionConfiguracion.guardarGerencias, {
        empresa: 1,
        usuarios: [],
        defaultUsuarioId: GERENTE_A.usuarioId,
      }),
    ).rejects.toThrow("Configura al menos un usuario de gerencia.");

    await expect(
      (await configurador(t)).mutation(api.facturacionConfiguracion.guardarGerencias, {
        empresa: 1,
        usuarios: [GERENTE_A, GERENTE_A],
        defaultUsuarioId: GERENTE_A.usuarioId,
      }),
    ).rejects.toThrow("No repitas usuarios en la lista.");

    await expect(
      (await configurador(t)).mutation(api.facturacionConfiguracion.guardarGerencias, {
        empresa: 1,
        usuarios: [GERENTE_A, GERENTE_B],
        defaultUsuarioId: "gerente-x",
      }),
    ).rejects.toThrow("Selecciona un gerente default válido.");
  });
});

describe("facturacion configuracion: autorización", () => {
  const GERENTE = { usuarioId: "gerente-a", nombre: "Gerente A", email: "gerente-a@example.com" };

  test("las mutaciones exigen sesión, permiso de configuración y la empresa", async () => {
    const t = makeTest();
    const args = { empresa: 1, usuarios: [GERENTE], defaultUsuarioId: GERENTE.usuarioId };

    await expect(t.mutation(api.facturacionConfiguracion.guardarGerencias, args)).rejects.toThrow(
      "No autenticado",
    );

    const bandeja = await asUser(t, { id: "bandeja", permisos: ["billing/inbox"], empresas: [1] });
    await expect(bandeja.mutation(api.facturacionConfiguracion.guardarGerencias, args)).rejects.toThrow(
      "se requiere billing/settings",
    );

    const otraEmpresa = await asUser(t, { id: "config-9", permisos: ["billing/settings"], empresas: [9] });
    await expect(
      otraEmpresa.mutation(api.facturacionConfiguracion.guardarGerencias, args),
    ).rejects.toThrow("Empresa no autorizada");
    await expect(
      otraEmpresa.mutation(api.facturacionConfiguracion.guardarCuentaRecepcion, {
        empresa: 1,
        valor: "robado@example.com",
        sincronizacionGraphDeshabilitada: false,
      }),
    ).rejects.toThrow("Empresa no autorizada");

    const cuentas = await t.query(internal.facturacionConfiguracion.listarCuentasRecepcionInterno, {});
    expect(cuentas.cuentas).toEqual([DEFAULT_CUENTA]);
  });

  test("la auditoría usa la identidad, no los args del cliente", async () => {
    const t = makeTest();
    const config = await configurador(t);

    await config.mutation(api.facturacionConfiguracion.guardarGerencias, {
      empresa: 1,
      usuarios: [GERENTE],
      defaultUsuarioId: GERENTE.usuarioId,
      actualizadoPorUserId: "otro-usuario",
      actualizadoPorNombre: "Suplantado",
    });

    const rows = await t.run(async (ctx) => {
      const configRow = await ctx.db
        .query("facturacionConfiguracion")
        .withIndex("by_empresa_clave", (q) => q.eq("empresa", 1).eq("clave", "gerencia"))
        .first();
      const usuarios = await ctx.db
        .query("facturacionConfiguracionUsuarios")
        .withIndex("by_empresa_clave", (q) => q.eq("empresa", 1).eq("clave", "gerencia"))
        .collect();
      return { configRow, usuarios };
    });
    expect(rows.configRow).toMatchObject({
      actualizadoPorUserId: CONFIGURADOR.id,
      actualizadoPorNombre: CONFIGURADOR.nombre,
    });
    expect(rows.usuarios.map((u) => u.actualizadoPorUserId)).toEqual([CONFIGURADOR.id]);
  });

  test("listar y proveedores de causación exigen permiso de configuración", async () => {
    const t = makeTest();
    await expect(t.query(api.facturacionConfiguracion.listar, { empresa: 1 })).rejects.toThrow(
      "No autenticado",
    );
    const bandeja = await asUser(t, { id: "bandeja", permisos: ["billing/inbox"], empresas: [1] });
    await expect(bandeja.query(api.facturacionConfiguracion.listar, { empresa: 1 })).rejects.toThrow(
      "se requiere billing/settings",
    );
    await expect(
      bandeja.query(api.facturacionConfiguracion.listarProveedoresCausacion, { empresa: 1 }),
    ).rejects.toThrow("se requiere billing/settings");

    await t.run(async (ctx) => {
      await ctx.db.insert("facturacionCausacionProveedorAnalistas", {
        empresa: 1,
        proveedorNit: "900123456",
        proveedorNitNormalizado: "900123456",
        proveedorNombre: "Proveedor",
        analistaUsuarioId: "analista-1",
        analistaNombre: "Analista",
        analistaEmail: "analista@example.com",
        creadoEn: NOW,
        actualizadoEn: NOW,
      });
    });
    const [row] = (await (await configurador(t)).query(
      api.facturacionConfiguracion.listarProveedoresCausacion,
      { empresa: 1 },
    )) as Array<{ _id: never }>;
    const otraEmpresa = await asUser(t, { id: "config-9", permisos: ["billing/settings"], empresas: [9] });
    await expect(
      otraEmpresa.mutation(api.facturacionConfiguracion.eliminarProveedorCausacion, { id: row._id }),
    ).rejects.toThrow("Empresa no autorizada");
  });

  test("listarUsuariosPorClave: bandeja o configuración, o el servidor con secreto", async () => {
    const t = makeTest();
    const config = await configurador(t);
    for (const empresa of [1, 4]) {
      await config.mutation(api.facturacionConfiguracion.guardarGerencias, {
        empresa,
        usuarios: [{ ...GERENTE, usuarioId: `gerente-${empresa}` }],
        defaultUsuarioId: `gerente-${empresa}`,
      });
    }

    await expect(
      t.query(api.facturacionConfiguracion.listarUsuariosPorClave, { clave: "gerencia", empresas: [1] }),
    ).rejects.toThrow("No autenticado");
    await expect(
      t.query(api.facturacionConfiguracion.listarUsuariosPorClave, {
        clave: "gerencia",
        empresas: [1],
        secret: "otro-secreto",
      }),
    ).rejects.toThrow("No autenticado");

    const servidor = (await t.query(api.facturacionConfiguracion.listarUsuariosPorClave, {
      clave: "gerencia",
      empresas: [1],
      secret: "test-convex-server-secret",
    })) as Record<string, unknown[]>;
    expect(Object.keys(servidor)).toEqual(["1"]);

    const sinModulo = await asUser(t, { id: "otro", permisos: ["finance/advances"], empresas: [1] });
    await expect(
      sinModulo.query(api.facturacionConfiguracion.listarUsuariosPorClave, { clave: "gerencia" }),
    ).rejects.toThrow("se requiere billing/inbox o billing/settings");

    // Without an explicit company list only the caller's companies come back.
    const bandeja = await asUser(t, { id: "bandeja", permisos: ["billing/inbox"], empresas: [4] });
    const propias = (await bandeja.query(api.facturacionConfiguracion.listarUsuariosPorClave, {
      clave: "gerencia",
    })) as Record<string, unknown[]>;
    expect(Object.keys(propias)).toEqual(["4"]);
  });
});
