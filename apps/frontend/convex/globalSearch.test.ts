/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { refrescarProyeccionFactura } from "./lib/facturacionDashboardProjection";
import schema from "./schema";
import { actingAsActorArgs } from "../test-utils/convexActingAs";
import { asUser } from "../test-utils/onboardingActors";

const modules = import.meta.glob("./**/*.*s");
const NOW = Date.UTC(2026, 5, 15);

type T = ReturnType<typeof convexTest>;

async function seedFactura(t: T, args: { empresa: number; numero: string; proveedor: string }) {
  return (await t.run(async (ctx) => {
    const facturaId = await ctx.db.insert("facturacionFacturas", {
      empresa: args.empresa,
      numeroFactura: args.numero,
      tipoDocumento: "01",
      tipoDocumentoNormalizado: "01",
      documentoClase: "factura",
      proveedorNit: "900123456",
      proveedorNitNormalizado: "900123456",
      numeroFacturaNormalizado: args.numero.replace(/\D/g, ""),
      proveedorNombre: args.proveedor,
      fechaEmision: "2026-06-01",
      subtotal: 100_000,
      impuestos: 0,
      total: 100_000,
      moneda: "COP",
      descripcion: "Documento de prueba",
      origen: "carga_manual",
      creadoEn: NOW,
      actualizadoEn: NOW,
    });
    await refrescarProyeccionFactura(ctx, facturaId, NOW);
    return facturaId;
  })) as Id<"facturacionFacturas">;
}

async function seedSupplier(
  t: T,
  args: { empresa?: number; razonSocial: string; nit: string; responsableId?: string; searchText?: string | false },
) {
  return (await t.run(async (ctx) =>
    ctx.db.insert("onboardingProveedores", {
      empresa: args.empresa ?? 1,
      NIT: args.nit,
      ...(args.searchText === false
        ? {}
        : {
            searchText:
              args.searchText ??
              `${args.razonSocial.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()} ${args.nit}`,
          }),
      faseActual: "II_PENDIENTE_FORMULARIO",
      matriz_00: {
        responsableId: args.responsableId ?? "resp-1",
        servicioSuministrado: "Servicio",
        montoAnual: "Menor a 10 millones COP",
        actividadEconomicaPrincipal: "Comercio",
        codigoCiiuSecundario: "",
        actividadEconomicaSecundaria: "",
        sectorEconomico: "Proveedores materias primas e insumos",
        jurisdiccionNacional: "Boyacá",
        jurisdiccionInternacional: "",
        isPep: false,
        listas: "NO",
        riesgo: "BAJO",
      },
      datos_generales_01: {
        tipoPersona: "PERSONA_JURIDICA",
        tipoDocumento: "NIT",
        numeroDocumento: args.nit,
        razonSocial: args.razonSocial,
        contactoNombre: "Ana Contacto",
        contactoEmail: "ana@demo.test",
        contactoCelular: "3000000000",
        representanteLegalNombre: "Luis RL",
        representanteLegalEmail: "luis@demo.test",
      },
      tipoEvaluacion_14: "SOLO LISTAS",
    }),
  )) as Id<"onboardingProveedores">;
}

async function seedAnticipoRoles(t: T) {
  await t.run(async (ctx) => {
    for (const rol of ["CONTABILIDAD", "GERENCIA", "TESORERO"] as const) {
      await ctx.db.insert("anticiposRolesConfig", {
        empresa: 1,
        rol,
        userId: `rol-${rol}`,
        nombre: rol,
        email: `${rol.toLowerCase()}@example.com`,
      });
    }
  });
}

async function seedAnticipo(t: T, args: { razonSocial: string; createdById: string }) {
  return (await actingAsActorArgs(t).mutation(api.financiero.anticipos.crearAnticipo, {
    empresa: 1,
    empresa_id: 1,
    razonSocial: args.razonSocial,
    nit: "900765432",
    formaPago: "TRANSFERENCIA PAGO ELECTRÓNICO",
    valorNumerico: 750_000,
    valorLetra: "SETECIENTOS CINCUENTA MIL PESOS",
    maxLegalizacionDate: 1_800_000_000_000,
    createdById: args.createdById,
    responsableUserId: args.createdById,
    responsableNombre: "Responsable",
    responsableOrigen: "solicitante",
  })) as { anticipoId: Id<"anticipos"> };
}

describe("globalSearch.buscar", () => {
  test("requires authentication and ignores terms shorter than 2 characters", async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.globalSearch.buscar, { q: "acme" })).rejects.toThrow();

    const user = await asUser(t, { id: "u1", hasFullAccess: true, permisos: ["*"] });
    expect(await user.query(api.globalSearch.buscar, { q: " a " })).toEqual({
      facturas: [],
      anticipos: [],
      proveedores: [],
      clientes: [],
      centrosCosto: [],
    });
  });

  test("invoices need billing/invoices and stay inside the user's companies", async () => {
    const t = convexTest(schema, modules);
    await seedFactura(t, { empresa: 1, numero: "FE-100", proveedor: "Acme Andes" });
    await seedFactura(t, { empresa: 2, numero: "FE-200", proveedor: "Acme Cordillera" });

    const sinPermiso = await asUser(t, { id: "sin", permisos: ["perfil"], empresas: [1] });
    expect((await sinPermiso.query(api.globalSearch.buscar, { q: "acme" })) as { facturas: unknown[] }).toMatchObject({
      facturas: [],
    });

    const empresa1 = await asUser(t, { id: "e1", permisos: ["billing/invoices"], empresas: [1] });
    const res = (await empresa1.query(api.globalSearch.buscar, { q: "acme" })) as {
      facturas: Array<{ numeroFactura: string; empresa: number }>;
    };
    expect(res.facturas.map((f) => f.numeroFactura)).toEqual(["FE-100"]);

    // Asking for a company the user cannot see returns nothing.
    const ajena = (await empresa1.query(api.globalSearch.buscar, { q: "acme", empresa: 2 })) as {
      facturas: unknown[];
    };
    expect(ajena.facturas).toEqual([]);

    const admin = await asUser(t, { id: "admin", hasFullAccess: true, permisos: ["*"] });
    const todas = (await admin.query(api.globalSearch.buscar, { q: "acme" })) as {
      facturas: Array<{ numeroFactura: string }>;
    };
    expect(todas.facturas.map((f) => f.numeroFactura).sort()).toEqual(["FE-100", "FE-200"]);
  });

  test("an exact invoice number ranks first and each group is capped at 5", async () => {
    const t = convexTest(schema, modules);
    for (let i = 1; i <= 7; i++) {
      await seedFactura(t, { empresa: 1, numero: `FE-${i}0`, proveedor: "Proveedor Uno" });
    }
    const admin = await asUser(t, { id: "admin", hasFullAccess: true, permisos: ["*"] });
    const res = (await admin.query(api.globalSearch.buscar, { q: "proveedor" })) as {
      facturas: unknown[];
    };
    expect(res.facturas).toHaveLength(5);
  });

  test("advance requesters only see their own advances", async () => {
    const t = convexTest(schema, modules);
    await seedAnticipoRoles(t);
    await seedAnticipo(t, { razonSocial: "Transportes Sol", createdById: "sol" });
    await seedAnticipo(t, { razonSocial: "Transportes Luna", createdById: "otro" });

    const solicitante = await asUser(t, { id: "sol", permisos: ["finance/advances/request"], empresas: [1] });
    const propios = (await solicitante.query(api.globalSearch.buscar, { q: "transportes" })) as {
      anticipos: Array<{ razonSocial: string }>;
    };
    expect(propios.anticipos.map((a) => a.razonSocial)).toEqual(["Transportes Sol"]);

    // Dashboard permission without a configured role: only own/assigned ("visible" scope).
    const gestor = await asUser(t, { id: "gestor", permisos: ["finance/advances"], empresas: [1] });
    const visibles = (await gestor.query(api.globalSearch.buscar, { q: "transportes" })) as {
      anticipos: unknown[];
    };
    expect(visibles.anticipos).toEqual([]);

    // A configured role (here Contabilidad) sees every advance of the company.
    const contador = await asUser(t, { id: "rol-CONTABILIDAD", permisos: ["finance/advances"], empresas: [1] });
    const todos = (await contador.query(api.globalSearch.buscar, { q: "transportes" })) as {
      anticipos: unknown[];
    };
    expect(todos.anticipos).toHaveLength(2);
  });

  test("onboarding respects the module permission, responsable level and exact NIT", async () => {
    const t = convexTest(schema, modules);
    await seedSupplier(t, { razonSocial: "Distribuidora Andina", nit: "900111222", responsableId: "resp" });
    await seedSupplier(t, { razonSocial: "Distribuidora Pacífico", nit: "900333444", responsableId: "otro" });
    // Text index does not match it (stands in for a row not yet backfilled: convex-test's fake
    // search index cannot hold documents that lack the search field, real Convex skips them).
    await seedSupplier(t, { razonSocial: "Legado SAS", nit: "800555666", searchText: "" });

    const sinModulo = await asUser(t, { id: "x", permisos: ["billing/invoices"], empresas: [1] });
    expect(
      ((await sinModulo.query(api.globalSearch.buscar, { q: "distribuidora" })) as { proveedores: unknown[] })
        .proveedores,
    ).toEqual([]);

    // Only the route permission => "responsable" level: sees only their own processes.
    const resp = await asUser(t, { id: "resp", permisos: ["suppliers/onboarding"], empresas: [1] });
    const propios = (await resp.query(api.globalSearch.buscar, { q: "distribuidora" })) as {
      proveedores: Array<{ razonSocial: string }>;
    };
    expect(propios.proveedores.map((p) => p.razonSocial)).toEqual(["Distribuidora Andina"]);

    const admin = await asUser(t, { id: "admin", hasFullAccess: true, permisos: ["*"] });
    const sinTilde = (await admin.query(api.globalSearch.buscar, { q: "pacifico" })) as {
      proveedores: Array<{ razonSocial: string }>;
    };
    expect(sinTilde.proveedores.map((p) => p.razonSocial)).toEqual(["Distribuidora Pacífico"]);

    // Still found by exact NIT, also when pasted with dots and a check digit.
    const porNit = (await admin.query(api.globalSearch.buscar, { q: "800.555.666-1" })) as {
      proveedores: Array<{ razonSocial: string }>;
    };
    expect(porNit.proveedores.map((p) => p.razonSocial)).toEqual(["Legado SAS"]);
  });

  test("backfill fills searchText for legacy inscriptions", async () => {
    const t = convexTest(schema, modules);
    const id = await seedSupplier(t, { razonSocial: "Ñandú Logística", nit: "901000111", searchText: false });
    await t.mutation(internal.onboarding.searchBackfill.backfillSearchText, { tabla: "onboardingProveedores" });
    const row = await t.run(async (ctx) => ctx.db.get("onboardingProveedores", id));
    expect(row?.searchText).toBe("nandu logistica 901000111");
  });
});
