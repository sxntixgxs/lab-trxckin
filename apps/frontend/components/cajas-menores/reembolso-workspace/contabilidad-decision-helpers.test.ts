import { describe, expect, test } from "vitest";

import { getDevolucionGerenciaValidation, getFaseDestinoLabel, usaRutaSaltoFasesRevisionEnReembolso } from "./panels/decision-panel";

describe("getFaseDestinoLabel (Contabilidad phase)", () => {
  test("pendiente_revision routes to Impuestos/Contabilidad", () => {
    expect(getFaseDestinoLabel("pendiente_revision")).toBe("Impuestos/Contabilidad");
  });

  test("pendiente_revision_impuestos routes to Eventos DIAN by default", () => {
    expect(getFaseDestinoLabel("pendiente_revision_impuestos")).toBe("Eventos DIAN");
  });

  test("pendiente_revision_impuestos can route to Gerencia on contabilidad return", () => {
    expect(
      getFaseDestinoLabel("pendiente_revision_impuestos", {
        retornoGerenciaPendienteEn: "contabilidad",
        destinoAprobacionImpuestos: "gerencia",
      })
    ).toBe("Gerencia Financiera");
  });

  test("pendiente_eventos_dian routes to Gerencia Financiera", () => {
    expect(getFaseDestinoLabel("pendiente_eventos_dian")).toBe("Gerencia Financiera");
  });

  test("pendiente_aprobacion routes to Tesorería", () => {
    expect(getFaseDestinoLabel("pendiente_aprobacion")).toBe("Tesorería");
  });

  test("esReenvioContabilidad flag does not change the destination label", () => {
    expect(getFaseDestinoLabel("pendiente_revision", { esReenvioContabilidad: true })).toBe(
      "Impuestos/Contabilidad"
    );
    expect(getFaseDestinoLabel("pendiente_revision", { esReenvioContabilidad: false })).toBe(
      "Impuestos/Contabilidad"
    );
  });

  test("direct resend to Gerencia updates approve destination label", () => {
    expect(
      getFaseDestinoLabel("pendiente_revision", {
        destinoAprobacionRevision: "gerencia",
        permiteReenvioDirectoGerencia: true,
      })
    ).toBe("Gerencia Financiera");
  });

  test("phase skip to Gerencia updates approve destination label", () => {
    expect(
      getFaseDestinoLabel("pendiente_revision", {
        usaSaltoFases: true,
        saltoFasesConsecutivas: {
          destino: "gerencia",
          fasesSaltadas: ["contabilidad", "eventos_dian"],
          requiereSeleccionEventosDian: false,
          motivo: "roles_consecutivos",
        },
      })
    ).toBe("Gerencia Financiera");
  });

  test("normal route keeps Contabilidad label even when destinoAprobacionRevision is gerencia", () => {
    expect(
      getFaseDestinoLabel("pendiente_revision", {
        destinoAprobacionRevision: "gerencia",
        usaSaltoFases: false,
        saltoFasesConsecutivas: {
          destino: "gerencia",
          fasesSaltadas: ["contabilidad", "eventos_dian"],
          requiereSeleccionEventosDian: false,
          motivo: "roles_consecutivos",
        },
      })
    ).toBe("Impuestos/Contabilidad");
  });
});

describe("usaRutaSaltoFasesRevisionEnReembolso", () => {
  test("is false when salto is unavailable even if usaSaltoFases defaults to true", () => {
    expect(
      usaRutaSaltoFasesRevisionEnReembolso({
        usaSaltoFases: true,
        saltoFasesConsecutivas: null,
      }),
    ).toBe(false);
  });

  test("is true only when skip route is actually available", () => {
    expect(
      usaRutaSaltoFasesRevisionEnReembolso({
        usaSaltoFases: true,
        saltoFasesConsecutivas: {
          destino: "eventos_dian",
          fasesSaltadas: ["contabilidad"],
          requiereSeleccionEventosDian: true,
          motivo: "roles_consecutivos",
        },
      }),
    ).toBe(true);
  });
});

describe("getDevolucionGerenciaValidation (Gerencia return composer)", () => {
  test("lists every missing field on an empty form", () => {
    const state = getDevolucionGerenciaValidation({
      destino: "",
      responsableUserId: "",
      comentario: "",
    });
    expect(state.faltantes).toEqual(["destino", "responsable", "motivo"]);
    expect(state.mensaje).toBe("destino, responsable y motivo");
    expect(state.disabled).toBe(true);
  });

  test("uses a single label without conjunction when only one field is missing", () => {
    const state = getDevolucionGerenciaValidation({
      destino: "contabilidad",
      responsableUserId: "user-1",
      comentario: "   ",
    });
    expect(state.faltantes).toEqual(["motivo"]);
    expect(state.mensaje).toBe("motivo");
    expect(state.disabled).toBe(true);
  });

  test("joins two missing fields with 'y'", () => {
    const state = getDevolucionGerenciaValidation({
      destino: "revision",
      responsableUserId: "",
      comentario: "",
    });
    expect(state.faltantes).toEqual(["responsable", "motivo"]);
    expect(state.mensaje).toBe("responsable y motivo");
    expect(state.disabled).toBe(true);
  });

  test("accepts eventos_dian as Gerencia return destination", () => {
    const state = getDevolucionGerenciaValidation({
      destino: "eventos_dian",
      responsableUserId: "user-dian",
      comentario: "Corregir soporte DIAN.",
    });
    expect(state.faltantes).toEqual([]);
    expect(state.disabled).toBe(false);
  });

  test("is enabled once destino, responsable and motivo are complete", () => {
    const state = getDevolucionGerenciaValidation({
      destino: "contabilidad",
      responsableUserId: "user-1",
      comentario: "Corregir soporte de la factura 3.",
    });
    expect(state.faltantes).toEqual([]);
    expect(state.mensaje).toBe("");
    expect(state.disabled).toBe(false);
  });

  test("stays disabled while responsables are loading even if complete", () => {
    const state = getDevolucionGerenciaValidation({
      destino: "revision",
      responsableUserId: "user-2",
      comentario: "Revisar de nuevo.",
      loading: true,
    });
    expect(state.faltantes).toEqual([]);
    expect(state.disabled).toBe(true);
  });

  test("stays disabled while a submission is busy", () => {
    const state = getDevolucionGerenciaValidation({
      destino: "revision",
      responsableUserId: "user-2",
      comentario: "Revisar de nuevo.",
      busy: true,
    });
    expect(state.disabled).toBe(true);
  });
});
