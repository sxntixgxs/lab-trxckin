/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { asUser } from "../test-utils/onboardingActors";

const modules = import.meta.glob("./**/*.*s");

type T = ReturnType<typeof convexTest>;

const PROVEEDOR = {
  empresa: 1,
  tipoPersona: "PERSONA_JURIDICA" as const,
  tipoDocumento: "NIT" as const,
  numeroDocumento: "900.123.456",
  razonSocial: "ACME Colombia S.A.S.",
  contactoNombre: "Laura Gómez",
  contactoEmail: "laura@acme.test",
  contactoCelular: "3001234567",
  servicioSuministrado: "Insumos",
  montoAnual: "Menor a 10 millones COP",
  codigoCiiu: "2599",
  actividadEconomicaPrincipal: "Metalmecánica",
  codigoCiiuSecundario: "",
  actividadEconomicaSecundaria: "",
  sectorEconomico: "Proveedores materias primas e insumos",
  jurisdiccionNacional: "Santander",
  jurisdiccionInternacional: "",
  isPep: false,
  listas: "NO",
};

const CLIENTE = {
  empresa: 1,
  tipoPersona: "PERSONA_JURIDICA" as const,
  tipoDocumento: "NIT" as const,
  numeroDocumento: "800.666.777",
  razonSocial: "Ferretería El Nevado S.A.S.",
  direccion: "Carrera 23 # 65-11",
  ciudad: "Manizales",
  departamento: "Caldas",
  celular: "3128765432",
  email: "cartera@nevado.test",
  representanteLegalNombre: "Marta RL",
  representanteLegalTipoDocumento: "C.C." as const,
  representanteLegalNumeroDocumento: "52000000",
  representanteLegalEmail: "marta@nevado.test",
  representanteLegalNacionalidad: "Colombiana",
  servicioSuministrado: "Venta de materiales",
  montoAnual: "Ventas Comerciales Menor a 10 millones",
  sectorEconomico: "Privados: Otros",
  jurisdiccionNacional: "Caldas",
  jurisdiccionInternacional: "",
  isPep: false,
  listas: "NO",
  formaPago: "Crédito" as const,
  plazo: "30 días" as const,
};

const PERMISOS = ["suppliers/onboarding", "customers/onboarding"];

async function usuarios(t: T) {
  return {
    admin: await asUser(t, { id: "admin", nombre: "Admin", hasFullAccess: true, permisos: ["*"] }),
    resp: await asUser(t, { id: "resp", nombre: "Responsable Uno", permisos: PERMISOS, empresas: [1, 2] }),
    otro: await asUser(t, { id: "otro", nombre: "Responsable Dos", permisos: PERMISOS, empresas: [1] }),
    ajeno: await asUser(t, { id: "ajeno", nombre: "Otra Empresa", permisos: PERMISOS, empresas: [3] }),
  };
}

async function fijarFase(t: T, id: Id<"onboardingProveedores">, faseActual: "COMPLETADO" | "RECHAZADO", desde: number) {
  await t.run(async (ctx) => ctx.db.patch("onboardingProveedores", id, { faseActual, faseActualDesde: desde }));
}

const EN_CURSO = /PROCESO_EN_CURSO/;

describe("procesos existentes por documento", () => {
  beforeEach(() => {
    vi.stubEnv("FRONTEND_URL", "https://app.test");
    vi.stubEnv("NOTIFICATIONS_INTERNAL_KEY", "notif-key");
    // Crear un proceso programa el correo de invitación.
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  test("bloquea un segundo proceso en curso del mismo documento y empresa, aunque no se vea el otro", async () => {
    const t = convexTest(schema, modules);
    const u = await usuarios(t);
    await u.resp.mutation(api.onboarding.suppliers.crearMatrizRiesgo, PROVEEDOR);

    await expect(
      u.otro.mutation(api.onboarding.suppliers.crearMatrizRiesgo, { ...PROVEEDOR, numeroDocumento: "900123456-8" }),
    ).rejects.toThrow(EN_CURSO);
    await expect(
      u.resp.mutation(api.onboarding.suppliers.crearMatrizRiesgo, { ...PROVEEDOR, numeroDocumento: "9001234568" }),
    ).rejects.toThrow(EN_CURSO);

    // Otra empresa u otro documento no chocan.
    await u.resp.mutation(api.onboarding.suppliers.crearMatrizRiesgo, { ...PROVEEDOR, empresa: 2 });
    await u.resp.mutation(api.onboarding.suppliers.crearMatrizRiesgo, { ...PROVEEDOR, numeroDocumento: "900.999.111" });
  });

  test("permite iniciar de nuevo cuando el anterior quedó anulado, completado o rechazado", async () => {
    const t = convexTest(schema, modules);
    const u = await usuarios(t);
    const primero = await u.resp.mutation(api.onboarding.suppliers.crearMatrizRiesgo, PROVEEDOR);
    await u.admin.mutation(api.onboarding.suppliers.anularProceso, { inscripcionId: primero, motivo: "Datos errados" });

    const segundo = await u.resp.mutation(api.onboarding.suppliers.crearMatrizRiesgo, PROVEEDOR);
    await fijarFase(t, segundo, "COMPLETADO", Date.now());
    const tercero = await u.resp.mutation(api.onboarding.suppliers.crearMatrizRiesgo, PROVEEDOR);
    await fijarFase(t, tercero, "RECHAZADO", Date.now());
    await u.resp.mutation(api.onboarding.suppliers.crearMatrizRiesgo, { ...PROVEEDOR, tipoSolicitudOrigen: "ERP", tipoSolicitud: "ACTUALIZACIÓN" });

    const creados = await t.run(async (ctx) =>
      ctx.db
        .query("onboardingProveedores")
        .withIndex("by_empresa_NIT", (q) => q.eq("empresa", 1).eq("NIT", "900123456"))
        .collect(),
    );
    expect(creados.map((ins) => ins.faseActual)).toEqual(["ANULADA", "COMPLETADO", "RECHAZADO", "II_PENDIENTE_FORMULARIO"]);
    expect(creados[3].datos_generales_01).toMatchObject({ tipoSolicitud: "ACTUALIZACIÓN", tipoSolicitudOrigen: "ERP" });
  });

  test("la alerta separa en curso y cerrados, oculta los anulados y reduce los que el actor no ve", async () => {
    const t = convexTest(schema, modules);
    const u = await usuarios(t);
    const anulado = await u.resp.mutation(api.onboarding.suppliers.crearMatrizRiesgo, PROVEEDOR);
    await u.admin.mutation(api.onboarding.suppliers.anularProceso, { inscripcionId: anulado, motivo: "Duplicado" });
    const rechazado = await u.resp.mutation(api.onboarding.suppliers.crearMatrizRiesgo, PROVEEDOR);
    await fijarFase(t, rechazado, "RECHAZADO", 1_000);
    const completado = await u.resp.mutation(api.onboarding.suppliers.crearMatrizRiesgo, PROVEEDOR);
    await fijarFase(t, completado, "COMPLETADO", 2_000);
    const enCurso = await u.resp.mutation(api.onboarding.suppliers.crearMatrizRiesgo, PROVEEDOR);

    const args = { empresa: 1, numeroDocumento: "900123456-8", tipoDocumento: "NIT" as const };
    const propio = await u.resp.query(api.onboarding.suppliers.obtenerProcesosPorDocumento, args);
    expect(propio.enCurso).toEqual([
      expect.objectContaining({ inscripcionId: enCurso, visible: true, razonSocial: "ACME Colombia S.A.S.", responsableNombre: "Responsable Uno" }),
    ]);
    expect(propio.finalizados.map((p) => [p.inscripcionId, p.faseActual])).toEqual([
      [completado, "COMPLETADO"],
      [rechazado, "RECHAZADO"],
    ]);

    const ajeno = await u.otro.query(api.onboarding.suppliers.obtenerProcesosPorDocumento, args);
    expect(ajeno.enCurso).toEqual([
      expect.objectContaining({ inscripcionId: null, razonSocial: null, visible: false, responsableNombre: "Responsable Uno", faseActual: "II_PENDIENTE_FORMULARIO" }),
    ]);
    expect(ajeno.finalizados).toHaveLength(2);

    // Una cédula con los mismos dígitos no es el mismo tercero.
    const cedula = await u.resp.query(api.onboarding.suppliers.obtenerProcesosPorDocumento, {
      empresa: 1,
      numeroDocumento: "9001234568",
      tipoDocumento: "C.C.",
    });
    expect(cedula).toEqual({ enCurso: [], finalizados: [] });

    await expect(u.ajeno.query(api.onboarding.suppliers.obtenerProcesosPorDocumento, args)).rejects.toThrow(/Empresa/);
  });

  test("el detalle apilado devuelve null en vez de fallar cuando el actor no puede verlo", async () => {
    const t = convexTest(schema, modules);
    const u = await usuarios(t);
    const id = await u.resp.mutation(api.onboarding.suppliers.crearMatrizRiesgo, PROVEEDOR);

    const detalle = await u.resp.query(api.onboarding.suppliers.obtenerDetalleInscripcion, { inscripcionId: id });
    expect(detalle).toMatchObject({
      access: { nivel: "responsable", usuarioId: "resp" },
      puedeVerAdjuntos: true,
      inscripcion: { _id: id, tipoSolicitud: "INSCRIPCIÓN" },
    });
    expect(await u.otro.query(api.onboarding.suppliers.obtenerDetalleInscripcion, { inscripcionId: id })).toBeNull();
    expect(await u.ajeno.query(api.onboarding.suppliers.obtenerDetalleInscripcion, { inscripcionId: id })).toBeNull();
    expect(await u.admin.query(api.onboarding.suppliers.obtenerDetalleInscripcion, { inscripcionId: id })).not.toBeNull();
  });

  test("devolverFase no reabre un proceso cerrado mientras haya otro en curso", async () => {
    const t = convexTest(schema, modules);
    const u = await usuarios(t);
    const rechazado = await u.resp.mutation(api.onboarding.suppliers.crearMatrizRiesgo, PROVEEDOR);
    await fijarFase(t, rechazado, "RECHAZADO", Date.now());
    const enCurso = await u.resp.mutation(api.onboarding.suppliers.crearMatrizRiesgo, PROVEEDOR);
    const faseII = await t.run(async (ctx) =>
      ctx.db
        .query("onboardingProveedoresFases")
        .withIndex("by_inscripcionId_fase", (q) => q.eq("inscripcionId", rechazado).eq("fase", "II_PENDIENTE_FORMULARIO"))
        .first(),
    );

    await expect(
      u.admin.mutation(api.onboarding.suppliers.devolverFase, { faseId: faseII!._id, motivo: "Reabrir" }),
    ).rejects.toThrow(EN_CURSO);

    await u.admin.mutation(api.onboarding.suppliers.anularProceso, { inscripcionId: enCurso, motivo: "Se reabre el anterior" });
    await u.admin.mutation(api.onboarding.suppliers.devolverFase, { faseId: faseII!._id, motivo: "Reabrir" });
    const reabierto = await t.run(async (ctx) => ctx.db.get("onboardingProveedores", rechazado));
    expect(reabierto?.faseActual).toBe("II_PENDIENTE_FORMULARIO");
  });

  test("clientes: el mismo bloqueo y la misma alerta", async () => {
    const t = convexTest(schema, modules);
    const u = await usuarios(t);
    const id = await u.resp.mutation(api.onboarding.customers.crearMatrizRiesgo, CLIENTE);
    await expect(
      u.otro.mutation(api.onboarding.customers.crearMatrizRiesgo, { ...CLIENTE, numeroDocumento: "800666777" }),
    ).rejects.toThrow(EN_CURSO);

    const alerta = await u.otro.query(api.onboarding.customers.obtenerProcesosPorDocumento, {
      empresa: 1,
      numeroDocumento: "800.666.777",
      tipoDocumento: "NIT",
    });
    expect(alerta.enCurso).toEqual([expect.objectContaining({ inscripcionId: null, responsableNombre: "Responsable Uno" })]);
    expect(await u.resp.query(api.onboarding.customers.obtenerDetalleInscripcion, { inscripcionId: id })).not.toBeNull();
    expect(await u.otro.query(api.onboarding.customers.obtenerDetalleInscripcion, { inscripcionId: id })).toBeNull();
  });
});
