/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import schema from "./schema";
import { asUser } from "../test-utils/onboardingActors";
import { hashToken, issueToken, requireOnboardingToken } from "./lib/onboarding/tokens";

const modules = import.meta.glob("./**/*.*s");

function setup() {
  return convexTest(schema, modules);
}

type T = ReturnType<typeof setup>;

async function seedSupplier(t: T, faseActual: string) {
  return (await t.run(async (ctx) =>
    ctx.db.insert("onboardingProveedores", {
      empresa: 1,
      NIT: "900123456",
      faseActual: faseActual as "II_PENDIENTE_FORMULARIO",
      matriz_00: {
        responsableId: "resp-1",
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
        numeroDocumento: "900.123.456",
        razonSocial: "Proveedor Demo S.A.S.",
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

function tokenDeUrl(url: string): string {
  return new URL(url).searchParams.get("t") ?? "";
}

async function tokenValido(t: T, inscripcionId: Id<"onboardingProveedores">, token: string) {
  const inscripcion = await t.query(api.onboarding.suppliersPublic.obtenerInscripcionPublica, {
    inscripcionId,
    token,
  });
  return inscripcion !== null;
}

// issueToken schedules expireToken weeks ahead; keep those timers parked (see
// onboardingFoundation.test.ts).
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
  vi.stubEnv("FRONTEND_URL", "https://app.test");
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("evaluación de Compras (Fase V)", () => {
  const CRITERIOS_CERO = {
    experiencia: 15,
    referencias: 0,
    portfolio: 10,
    certificados: 0,
    garantias: 0,
    fichasTecnicas: 0,
    formaPago: 0,
    sstAmbiental: 0,
  };

  test("el puntaje y la aprobación se calculan en el servidor", async () => {
    const t = setup();
    const inscripcionId = await seedSupplier(t, "V_EVALUACION_COMPRAS");
    const admin = await asUser(t, { id: "admin", hasFullAccess: true, permisos: ["*"] });

    const evaluacionId = (await admin.mutation(api.onboarding.suppliersEvaluar.evaluarProveedor, {
      inscripcionId,
      ...CRITERIOS_CERO,
      // Tampered client result: ignored.
      calificacionGeneral: 5,
      isAprobado: true,
    })) as Id<"onboardingProveedoresEvaluaciones">;
    const evaluacion = await t.run(async (ctx) =>
      ctx.db.get("onboardingProveedoresEvaluaciones", evaluacionId),
    );
    // (15 + 0 + 10 + 0 + 0 + 0 + 0 + 0) / 8 = 3.125 of 30 -> 10% -> 0.5 of 5, with zeros.
    expect(evaluacion).toMatchObject({ calificacionGeneral: 0.5, isAprobado: false });

    await admin.mutation(api.onboarding.suppliersEvaluar.evaluarProveedor, {
      inscripcionId,
      experiencia: 30,
      referencias: 30,
      portfolio: 30,
      certificados: 30,
      garantias: 30,
      fichasTecnicas: 30,
      formaPago: 30,
      sstAmbiental: null,
    });
    const aprobada = await t.run(async (ctx) =>
      ctx.db.get("onboardingProveedoresEvaluaciones", evaluacionId),
    );
    expect(aprobada).toMatchObject({ calificacionGeneral: 5, isAprobado: true });
  });

  test("rechaza valores que no son opciones del criterio", async () => {
    const t = setup();
    const inscripcionId = await seedSupplier(t, "V_EVALUACION_COMPRAS");
    const admin = await asUser(t, { id: "admin", hasFullAccess: true, permisos: ["*"] });
    await expect(
      admin.mutation(api.onboarding.suppliersEvaluar.evaluarProveedor, {
        inscripcionId,
        ...CRITERIOS_CERO,
        experiencia: 1000,
      }),
    ).rejects.toThrow(/Valor no válido para el criterio/);
  });
});

describe("Copiar enlace (emitirEnlaceAcceso)", () => {
  test("un enlace nuevo invalida los anteriores del mismo paso", async () => {
    const t = setup();
    const inscripcionId = await seedSupplier(t, "II_PENDIENTE_FORMULARIO");
    const inicial = await t.run(async (ctx) =>
      issueToken(ctx as MutationCtx, { modulo: "supplier", inscripcionId, scope: "FORM" }),
    );
    expect(await tokenValido(t, inscripcionId, inicial.token)).toBe(true);

    const admin = await asUser(t, { id: "admin", hasFullAccess: true, permisos: ["*"] });
    const { url } = (await admin.mutation(api.onboarding.tokens.emitirEnlaceAcceso, {
      modulo: "supplier",
      inscripcionId,
      scope: "FORM",
    })) as { url: string };
    const nuevo = tokenDeUrl(url);

    expect(await tokenValido(t, inscripcionId, nuevo)).toBe(true);
    expect(await tokenValido(t, inscripcionId, inicial.token)).toBe(false);
    const fila = await t.run(async (ctx) => ctx.db.get("onboardingAccessTokens", inicial.tokenId));
    expect(fila?.revokedReason).toBe("ROTATED");
  });

  test("los enlaces de solo lectura no revocan el enlace de firma vigente", async () => {
    const t = setup();
    const inscripcionId = await seedSupplier(t, "IIA_PENDIENTE_FIRMA");
    const firma = await t.run(async (ctx) =>
      issueToken(ctx as MutationCtx, { modulo: "supplier", inscripcionId, scope: "SIGN" }),
    );
    const admin = await asUser(t, { id: "admin", hasFullAccess: true, permisos: ["*"] });
    await admin.mutation(api.onboarding.tokens.emitirEnlaceAcceso, {
      modulo: "supplier",
      inscripcionId,
      scope: "SIGN",
      viewOnly: true,
    });
    expect(await tokenValido(t, inscripcionId, firma.token)).toBe(true);
  });

  test("solo emite enlaces del formulario mientras el tercero lo diligencia", async () => {
    const t = setup();
    const inscripcionId = await seedSupplier(t, "IV_APROBADO_CUMPLIMIENTO");
    const admin = await asUser(t, { id: "admin", hasFullAccess: true, permisos: ["*"] });
    await expect(
      admin.mutation(api.onboarding.tokens.emitirEnlaceAcceso, {
        modulo: "supplier",
        inscripcionId,
        scope: "FORM",
      }),
    ).rejects.toThrow(/solo está disponible mientras el tercero diligencia/);
  });

  test("la rotación alcanza el token vigente aunque haya muchos revocados", async () => {
    const t = setup();
    const inscripcionId = await seedSupplier(t, "II_PENDIENTE_FORMULARIO");
    await t.run(async (ctx) => {
      for (let index = 0; index < 120; index += 1) {
        await ctx.db.insert("onboardingAccessTokens", {
          modulo: "supplier",
          inscripcionId,
          scope: "FORM",
          tokenHash: await hashToken(`revocado-${index}-${"x".repeat(20)}`),
          createdAt: index,
          expiresAt: index + 1,
          revokedAt: index + 1,
          revokedReason: "ROTATED",
        });
      }
    });
    const vigente = await t.run(async (ctx) =>
      issueToken(ctx as MutationCtx, { modulo: "supplier", inscripcionId, scope: "FORM" }),
    );
    await t.run(async (ctx) =>
      issueToken(ctx as MutationCtx, { modulo: "supplier", inscripcionId, scope: "FORM", rotate: true }),
    );
    await expect(
      t.run(async (ctx) =>
        requireOnboardingToken(ctx, {
          modulo: "supplier",
          inscripcionId,
          token: vigente.token,
          scopes: ["FORM"],
        }),
      ),
    ).rejects.toThrow(/no es válido/);
  });
});

describe("mutaciones públicas: re-verificación del documento", () => {
  test("generateUploadUrlPublico exige el tipo y número de documento", async () => {
    const t = setup();
    const inscripcionId = await seedSupplier(t, "II_PENDIENTE_FORMULARIO");
    const { token } = await t.run(async (ctx) =>
      issueToken(ctx as MutationCtx, { modulo: "supplier", inscripcionId, scope: "FORM" }),
    );
    await expect(
      t.mutation(api.onboarding.suppliersPublic.generateUploadUrlPublico, {
        inscripcionId,
        token,
        tipoDocumento: "NIT",
        numeroDocumento: "800000000",
      }),
    ).rejects.toThrow(/no coincide/);
    const url = await t.mutation(api.onboarding.suppliersPublic.generateUploadUrlPublico, {
      inscripcionId,
      token,
      tipoDocumento: "NIT",
      numeroDocumento: "900123456",
    });
    expect(typeof url).toBe("string");
  });

  test("firmarFormularioRepresentante exige el tipo y número de documento", async () => {
    const t = setup();
    const inscripcionId = await seedSupplier(t, "IIA_PENDIENTE_FIRMA");
    const { token } = await t.run(async (ctx) =>
      issueToken(ctx as MutationCtx, { modulo: "supplier", inscripcionId, scope: "SIGN" }),
    );
    await expect(
      t.mutation(api.onboarding.suppliersPublic.firmarFormularioRepresentante, {
        inscripcionId,
        token,
        tipoDocumento: "C.C.",
        numeroDocumento: "900123456",
        firmaDataUrl: `data:image/png;base64,${"A".repeat(200)}`,
      }),
    ).rejects.toThrow(/no coincide/);
    const ins = await t.run(async (ctx) => ctx.db.get("onboardingProveedores", inscripcionId));
    expect(ins?.faseActual).toBe("IIA_PENDIENTE_FIRMA");
    expect(ins?.firmaRepresentante_16).toBeUndefined();
  });
});
