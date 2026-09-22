import { describe, expect, test } from "vitest";
import type { Doc } from "../../_generated/dataModel";
import { buildResumenItem, cleanOptionalText, mapWebhookEventToEstado, resumenKey, shouldApplyEstadoTransition } from "./correos";

describe("mapWebhookEventToEstado", () => {
  test("traduce los eventos de Resend al estado del intento", () => {
    expect(mapWebhookEventToEstado("email.sent")).toBe("ENVIADO");
    expect(mapWebhookEventToEstado("email.delivered")).toBe("ENTREGADO");
    expect(mapWebhookEventToEstado("email.delivery_delayed")).toBe("DEMORADO");
    for (const evento of ["email.failed", "email.bounced", "email.suppressed"]) expect(mapWebhookEventToEstado(evento)).toBe("FALLIDO");
    expect(mapWebhookEventToEstado("email.opened")).toBeNull();
    expect(mapWebhookEventToEstado("unknown")).toBeNull();
  });
});

describe("shouldApplyEstadoTransition", () => {
  test("FALLIDO siempre se aplica", () => {
    expect(shouldApplyEstadoTransition("ENTREGADO", "FALLIDO", 1, 100)).toBe(true);
  });

  test("solo avanza hacia estados de mayor rango", () => {
    expect(shouldApplyEstadoTransition("PENDIENTE", "ENVIADO", 1, undefined)).toBe(true);
    expect(shouldApplyEstadoTransition("ENVIADO", "ENTREGADO", 1, undefined)).toBe(true);
    expect(shouldApplyEstadoTransition("DEMORADO", "ENTREGADO", 1, 5)).toBe(true);
    expect(shouldApplyEstadoTransition("ENTREGADO", "ENVIADO", 200, 100)).toBe(false);
    expect(shouldApplyEstadoTransition("ENTREGADO", "DEMORADO", 200, 100)).toBe(false);
  });

  test("un evento repetido del mismo estado solo se aplica si es más reciente", () => {
    expect(shouldApplyEstadoTransition("ENVIADO", "ENVIADO", 200, 100)).toBe(true);
    expect(shouldApplyEstadoTransition("ENVIADO", "ENVIADO", 50, 100)).toBe(false);
    expect(shouldApplyEstadoTransition("ENVIADO", "ENVIADO", 50, undefined)).toBe(true);
  });
});

describe("resumen del hand-off", () => {
  test("resumenKey separa formulario y firma", () => {
    expect(resumenKey("FORM")).toBe("form");
    expect(resumenKey("SIGN")).toBe("sign");
  });

  test("buildResumenItem prefiere el detalle de fallo sobre el código", () => {
    const base = {
      _id: "correo_1",
      _creationTime: 1,
      modulo: "customer",
      inscripcionId: "ins_1",
      handoff: "SIGN",
      tipoNotificacion: "PENDIENTE_FIRMA",
      origen: "AUTOMATICO",
      destinatarioNombre: "RL",
      destinatarioEmail: "rl@demo.test",
      numeroIntento: 2,
      estado: "FALLIDO",
      creadoEn: 1,
      actualizadoEn: 9,
      codigoFallo: "bounced",
      detalleFallo: "Mailbox full",
    } as unknown as Doc<"onboardingCorreos">;
    expect(buildResumenItem(base)).toEqual({ correoId: "correo_1", estado: "FALLIDO", email: "rl@demo.test", numeroIntento: 2, actualizadoEn: 9, falloResumen: "Mailbox full" });
    expect(buildResumenItem({ ...base, detalleFallo: undefined }).falloResumen).toBe("bounced");
  });
});

describe("cleanOptionalText", () => {
  test("recorta, descarta vacíos y limita la longitud", () => {
    expect(cleanOptionalText(undefined, 10)).toBeUndefined();
    expect(cleanOptionalText("   ", 10)).toBeUndefined();
    expect(cleanOptionalText("  hola  ", 10)).toBe("hola");
    expect(cleanOptionalText("abcdefghijklmnop", 5)).toBe("abcde");
  });
});
