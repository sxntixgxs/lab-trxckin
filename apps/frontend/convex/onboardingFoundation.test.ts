/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import schema from "./schema";
import { asUser } from "../test-utils/onboardingActors";
import { programarCorreoRastreado } from "./lib/onboarding/correos";
import {
  assertDocumentoCoincide,
  generateToken,
  hashToken,
  issueToken,
  requireOnboardingToken,
  revokeTokens,
} from "./lib/onboarding/tokens";

const modules = import.meta.glob("./**/*.*s");
const SECRET = "test-convex-server-secret";

function setup() {
  return convexTest(schema, modules);
}

type T = ReturnType<typeof setup>;

/** `runAfter(0)` jobs start on a real macrotask; yield once before waiting for them. */
async function flushScheduled(t: T) {
  await new Promise((resolve) => setTimeout(resolve, 25));
  await t.finishInProgressScheduledFunctions();
}

async function seedSupplier(t: T, overrides: Partial<{ empresa: number; responsableId: string; faseActual: string }> = {}) {
  return (await t.run(async (ctx) =>
    ctx.db.insert("onboardingProveedores", {
      empresa: overrides.empresa ?? 1,
      NIT: "900123456",
      faseActual: (overrides.faseActual ?? "II_PENDIENTE_FORMULARIO") as "II_PENDIENTE_FORMULARIO",
      matriz_00: {
        responsableId: overrides.responsableId ?? "resp-1",
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

/**
 * `issueToken` schedules `expireToken` weeks ahead. Node clamps such timeouts to 1 ms, so
 * with real timers those jobs would fire inside later tests through convex-test's shared
 * global lock. Fake timers keep them parked; the email tests below use real timers.
 */
describe("tokens de acceso público", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  test("Web Crypto disponible: genera y hashea tokens", async () => {
    const token = generateToken();
    expect(token.length).toBeGreaterThanOrEqual(40);
    expect(await hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashToken(token)).toBe(await hashToken(token));
    expect(generateToken()).not.toBe(token);
  });

  test("emite, verifica y almacena solo el hash", async () => {
    const t = setup();
    const inscripcionId = await seedSupplier(t);
    const issued = await t.run(async (ctx) =>
      issueToken(ctx as MutationCtx, { modulo: "supplier", inscripcionId, scope: "FORM" }),
    );
    const row = await t.run(async (ctx) => ctx.db.get("onboardingAccessTokens", issued.tokenId));
    expect(row?.tokenHash).toBe(await hashToken(issued.token));
    expect(JSON.stringify(row)).not.toContain(issued.token);

    const ok = await t.run(async (ctx) =>
      requireOnboardingToken(ctx, { modulo: "supplier", inscripcionId, token: issued.token, scopes: ["FORM"] }),
    );
    expect(ok.inscripcion._id).toBe(inscripcionId);

    await expect(
      t.run(async (ctx) =>
        requireOnboardingToken(ctx, { modulo: "supplier", inscripcionId, token: issued.token, scopes: ["SIGN"] }),
      ),
    ).rejects.toThrow(/enlace/i);
    await expect(
      t.run(async (ctx) =>
        requireOnboardingToken(ctx, { modulo: "supplier", inscripcionId, token: "x".repeat(43), scopes: ["FORM"] }),
      ),
    ).rejects.toThrow(/enlace/i);
  });

  test("rotación, revocación y expiración invalidan enlaces previos", async () => {
    const t = setup();
    const inscripcionId = await seedSupplier(t);
    const first = await t.run(async (ctx) =>
      issueToken(ctx as MutationCtx, { modulo: "supplier", inscripcionId, scope: "SIGN" }),
    );
    const second = await t.run(async (ctx) =>
      issueToken(ctx as MutationCtx, { modulo: "supplier", inscripcionId, scope: "SIGN", rotate: true }),
    );
    await expect(
      t.run(async (ctx) =>
        requireOnboardingToken(ctx, { modulo: "supplier", inscripcionId, token: first.token, scopes: ["SIGN"] }),
      ),
    ).rejects.toThrow();
    await t.run(async (ctx) =>
      requireOnboardingToken(ctx, { modulo: "supplier", inscripcionId, token: second.token, scopes: ["SIGN"] }),
    );

    const count = await t.run(async (ctx) =>
      revokeTokens(ctx as MutationCtx, { modulo: "supplier", inscripcionId, reason: "PHASE_ADVANCED" }),
    );
    expect(count).toBe(1);
    await expect(
      t.run(async (ctx) =>
        requireOnboardingToken(ctx, { modulo: "supplier", inscripcionId, token: second.token, scopes: ["SIGN"] }),
      ),
    ).rejects.toThrow();

    const third = await t.run(async (ctx) =>
      issueToken(ctx as MutationCtx, { modulo: "supplier", inscripcionId, scope: "FORM" }),
    );
    await t.run(async (ctx) => ctx.db.patch("onboardingAccessTokens", third.tokenId, { expiresAt: Date.now() - 1 }));
    await t.mutation(internal.onboarding.tokens.expireToken, { tokenId: third.tokenId });
    const expired = await t.run(async (ctx) => ctx.db.get("onboardingAccessTokens", third.tokenId));
    expect(expired?.revokedReason).toBe("EXPIRED");
  });

  test("los enlaces de solo lectura no sirven para mutaciones", async () => {
    const t = setup();
    const inscripcionId = await seedSupplier(t);
    const view = await t.run(async (ctx) =>
      issueToken(ctx as MutationCtx, { modulo: "supplier", inscripcionId, scope: "SIGN", viewOnly: true }),
    );
    await t.run(async (ctx) =>
      requireOnboardingToken(ctx, {
        modulo: "supplier",
        inscripcionId,
        token: view.token,
        scopes: ["SIGN"],
        allowViewOnly: true,
      }),
    );
    await expect(
      t.run(async (ctx) =>
        requireOnboardingToken(ctx, { modulo: "supplier", inscripcionId, token: view.token, scopes: ["SIGN"], mutation: true }),
      ),
    ).rejects.toThrow();
  });

  test("la verificación secundaria compara el documento normalizado", async () => {
    const t = setup();
    const inscripcionId = await seedSupplier(t);
    const ins = await t.run(async (ctx) => ctx.db.get("onboardingProveedores", inscripcionId));
    expect(() => assertDocumentoCoincide(ins!, "NIT", "900123456")).not.toThrow();
    expect(() => assertDocumentoCoincide(ins!, "NIT", "900-123-456")).not.toThrow();
    expect(() => assertDocumentoCoincide(ins!, "C.C.", "900123456")).toThrow();
    expect(() => assertDocumentoCoincide(ins!, "NIT", "1")).toThrow();
  });
});

describe("roles y niveles de acceso", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  test("solo administradores configuran roles; los niveles siguen la semántica original", async () => {
    const t = setup();
    const admin = await asUser(t, { id: "admin", hasFullAccess: true, permisos: ["*"] });
    const cumplimiento = await asUser(t, { id: "cumpl", permisos: ["suppliers/onboarding"], empresas: [1] });
    const consulta = await asUser(t, { id: "consulta", permisos: ["suppliers/onboarding"], empresas: [1] });
    const comercial = await asUser(t, { id: "comercial", permisos: ["suppliers/onboarding"], empresas: [1] });
    const sinPermiso = await asUser(t, { id: "nadie", permisos: ["dashboard"], empresas: [1] });

    await expect(
      cumplimiento.mutation(api.onboarding.roles.configurarRol, {
        modulo: "supplier",
        empresa: 1,
        rol: "CUMPLIMIENTO_LOW_RISK",
        userId: "cumpl",
        nombre: "Cumplimiento",
        email: "c@x.test",
      }),
    ).rejects.toThrow(/administrador/i);

    await admin.mutation(api.onboarding.roles.configurarRol, {
      modulo: "supplier",
      empresa: 1,
      rol: "CUMPLIMIENTO_LOW_RISK",
      userId: "cumpl",
      nombre: "Cumplimiento",
      email: "c@x.test",
    });
    await expect(
      admin.mutation(api.onboarding.roles.configurarRol, {
        modulo: "customer",
        empresa: 1,
        rol: "COMPRAS",
        userId: "x",
        nombre: "X",
        email: "x@x.test",
      }),
    ).rejects.toThrow(/no aplica/i);
    await admin.mutation(api.onboarding.roles.agregarWhitelist, {
      modulo: "supplier",
      empresa: 1,
      userId: "consulta",
      nombre: "Consulta",
      email: "q@x.test",
      permiso: "CONSULTA",
    });

    expect((await admin.query(api.onboarding.roles.miAcceso, { modulo: "supplier", empresa: 1 })).nivel).toBe("full");
    expect((await cumplimiento.query(api.onboarding.roles.miAcceso, { modulo: "supplier", empresa: 1 })).nivel).toBe("full");
    expect((await consulta.query(api.onboarding.roles.miAcceso, { modulo: "supplier", empresa: 1 })).nivel).toBe("solo_lectura");
    expect((await comercial.query(api.onboarding.roles.miAcceso, { modulo: "supplier", empresa: 1 })).nivel).toBe("responsable");
    await expect(sinPermiso.query(api.onboarding.roles.miAcceso, { modulo: "supplier", empresa: 1 })).rejects.toThrow(/Unauthorized/);
    await expect(comercial.query(api.onboarding.roles.miAcceso, { modulo: "supplier", empresa: 2 })).rejects.toThrow(/Empresa/);

    const roles = await cumplimiento.query(api.onboarding.roles.obtenerRolesConfig, { modulo: "supplier", empresa: 1 });
    expect(roles).toHaveLength(1);
    expect(roles[0]).toMatchObject({ rol: "CUMPLIMIENTO_LOW_RISK", userId: "cumpl" });
  });
});

describe("correos rastreados", () => {
  beforeEach(() => {
    vi.stubEnv("FRONTEND_URL", "https://app.test");
    vi.stubEnv("NOTIFICATIONS_INTERNAL_KEY", "notif-key");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  /** Must run before `convexTest()`: it wraps the globals it finds and keeps the stub as the default. */
  function stubFetch(status: number, body = "{}") {
    const fetchMock = vi.fn(async () => new Response(body, { status }));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  test("ciclo completo: intento → token → envío → webhook entregado", async () => {
    const fetchMock = stubFetch(200, JSON.stringify({ ok: true, sent: true }));
    const t = setup();
    const inscripcionId = await seedSupplier(t);

    const { correoId, numeroIntento } = await t.run(async (ctx) =>
      programarCorreoRastreado(ctx as MutationCtx, {
        modulo: "supplier",
        inscripcionId,
        handoff: "FORM",
        tipoNotificacion: "FASE_I_COMPLETADA",
        origen: "INICIAL",
        destinatarioNombre: "Ana",
        destinatarioEmail: "ANA@demo.test",
      }),
    );
    expect(numeroIntento).toBe(1);
    let ins = await t.run(async (ctx) => ctx.db.get("onboardingProveedores", inscripcionId));
    expect(ins?.correoResumen?.form).toMatchObject({ correoId, estado: "PENDIENTE", email: "ana@demo.test", numeroIntento: 1 });

    await flushScheduled(t);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://app.test/api/notifications/onboarding/supplier");
    expect((init.headers as Record<string, string>)["x-notifications-key"]).toBe("notif-key");
    const body = JSON.parse(String(init.body)) as { kind: string; correoId: string; token: string };
    expect(body.kind).toBe("tracked");
    expect(body.correoId).toBe(correoId);

    const correo = await t.run(async (ctx) => ctx.db.get("onboardingCorreos", correoId));
    expect(correo?.tokenId).toBeDefined();
    const tokenRow = await t.run(async (ctx) => ctx.db.get("onboardingAccessTokens", correo!.tokenId!));
    expect(tokenRow?.tokenHash).toBe(await hashToken(body.token));
    expect(tokenRow?.scope).toBe("FORM");

    const paraEnvio = await t.query(api.onboarding.correos.obtenerCorreoParaEnvio, { secret: SECRET, correoId });
    expect(paraEnvio?.inscripcion).toMatchObject({ modulo: "supplier", razonSocial: "Proveedor Demo S.A.S." });
    await expect(t.query(api.onboarding.correos.obtenerCorreoParaEnvio, { secret: "bad", correoId })).rejects.toThrow();

    const enviado = await t.mutation(api.onboarding.correos.registrarResultadoResendApi, {
      secret: SECRET,
      correoId,
      resendEmailId: "re_123",
    });
    expect(enviado.estado).toBe("ENVIADO");

    const late = await t.mutation(api.onboarding.correos.aplicarEventoWebhookResend, {
      secret: SECRET,
      resendEmailId: "re_123",
      svixId: "svix-2",
      tipoEvento: "email.delivered",
      eventoProveedorEn: 2_000,
    });
    expect(late).toEqual({ ok: true });
    const stale = await t.mutation(api.onboarding.correos.aplicarEventoWebhookResend, {
      secret: SECRET,
      resendEmailId: "re_123",
      svixId: "svix-1",
      tipoEvento: "email.delivery_delayed",
      eventoProveedorEn: 1_000,
    });
    expect(stale).toMatchObject({ ignored: true, reason: "stale_event" });
    const dup = await t.mutation(api.onboarding.correos.aplicarEventoWebhookResend, {
      secret: SECRET,
      resendEmailId: "re_123",
      svixId: "svix-2",
      tipoEvento: "email.delivered",
      eventoProveedorEn: 2_000,
    });
    expect(dup).toMatchObject({ ignored: true, reason: "duplicate_svix" });

    ins = await t.run(async (ctx) => ctx.db.get("onboardingProveedores", inscripcionId));
    expect(ins?.correoResumen?.form?.estado).toBe("ENTREGADO");
    expect(paraEnvio && (await t.query(api.onboarding.correos.obtenerCorreoParaEnvio, { secret: SECRET, correoId }))).toBeNull();
  });

  test("fallo HTTP de Next marca el intento como FALLIDO", async () => {
    stubFetch(500, "boom");
    const t = setup();
    const inscripcionId = await seedSupplier(t);
    const { correoId } = await t.run(async (ctx) =>
      programarCorreoRastreado(ctx as MutationCtx, {
        modulo: "supplier",
        inscripcionId,
        handoff: "SIGN",
        tipoNotificacion: "PENDIENTE_FIRMA",
        origen: "AUTOMATICO",
        destinatarioNombre: "Luis",
        destinatarioEmail: "luis@demo.test",
      }),
    );
    await flushScheduled(t);
    const correo = await t.run(async (ctx) => ctx.db.get("onboardingCorreos", correoId));
    expect(correo?.estado).toBe("FALLIDO");
    expect(correo?.detalleFallo).toContain("500");
  });

  test("reenvío con corrección de correo: nuevo intento, rota el token y actualiza el destinatario", async () => {
    stubFetch(200);
    const t = setup();
    const inscripcionId = await seedSupplier(t, { responsableId: "resp-1" });
    const first = await t.run(async (ctx) =>
      programarCorreoRastreado(ctx as MutationCtx, {
        modulo: "supplier",
        inscripcionId,
        handoff: "FORM",
        tipoNotificacion: "FASE_I_COMPLETADA",
        origen: "INICIAL",
        destinatarioNombre: "Ana",
        destinatarioEmail: "ana@demo.test",
      }),
    );
    await flushScheduled(t);

    const responsable = await asUser(t, { id: "resp-1", permisos: ["suppliers/onboarding"], empresas: [1] });
    const lector = await asUser(t, { id: "otro", permisos: ["suppliers/onboarding"], empresas: [1] });
    await expect(
      lector.mutation(api.onboarding.correos.solicitarReenvio, {
        modulo: "supplier",
        inscripcionId,
        handoff: "FORM",
        email: "nuevo@demo.test",
      }),
    ).rejects.toThrow(/No autorizado/);

    const second = await responsable.mutation(api.onboarding.correos.solicitarReenvio, {
      modulo: "supplier",
      inscripcionId,
      handoff: "FORM",
      email: "nuevo@demo.test",
    });
    expect(second.numeroIntento).toBe(2);
    await flushScheduled(t);

    const firstCorreo = await t.run(async (ctx) => ctx.db.get("onboardingCorreos", first.correoId));
    const firstToken = await t.run(async (ctx) => ctx.db.get("onboardingAccessTokens", firstCorreo!.tokenId!));
    expect(firstToken?.revokedReason).toBe("ROTATED");

    const ins = await t.run(async (ctx) => ctx.db.get("onboardingProveedores", inscripcionId));
    expect(ins?.datos_generales_01.contactoEmail).toBe("nuevo@demo.test");
    expect(ins?.correoResumen?.form).toMatchObject({ correoId: second.correoId, numeroIntento: 2 });

    const historial = await responsable.query(api.onboarding.correos.obtenerCorreosPorInscripcion, {
      modulo: "supplier",
      inscripcionId,
    });
    expect(historial.intentos.map((i) => i.numeroIntento)).toEqual([2, 1]);
  });
});
