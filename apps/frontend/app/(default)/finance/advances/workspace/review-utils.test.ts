import { describe, expect, test } from "vitest";

import type { Id } from "@/convex/_generated/dataModel";
import type { AnticipoRow } from "../dashboard/types";
import {
  applyReviewPlansToDrafts,
  buildEffectiveReviewPlans,
  buildReviewConfirmationGroups,
  getReviewValidationError,
  hasMixedReviewPhases,
} from "./review-utils";
import type { AnticipoReviewDraft } from "./types";

function advance(
  consecutivo: number,
  faseActual: AnticipoRow["faseActual"],
  overrides: Partial<AnticipoRow> = {}
) {
  return {
    _id: `anticipo-${consecutivo}` as Id<"anticipos">,
    _creationTime: 1,
    empresa: 1,
    empresa_id: 1,
    consecutivo,
    razonSocial: `Proveedor ${consecutivo}`,
    nit: `900${consecutivo}`,
    formaPago: "TRANSFERENCIA PAGO ELECTRÓNICO",
    valorNumerico: 100_000,
    valorContable: 100_000,
    valorLetra: "CIEN MIL PESOS",
    maxLegalizacionDate: 1_800_000_000_000,
    soportesSolicitud: [],
    createdById: "solicitante",
    cubreFacturaCompleta: true,
    faseActual,
    legalizacion: [],
    createdAt: 1,
    updatedAt: 1,
    ultimaFaseInicio: 1,
    faseEnCurso: null,
    ...overrides,
  } as AnticipoRow;
}

function draft(
  anticipo: AnticipoRow,
  overrides: Partial<AnticipoReviewDraft> = {}
): AnticipoReviewDraft {
  return {
    anticipo,
    observedPhase: anticipo.faseActual,
    observation: "",
    accountingValue: anticipo.valorContable ?? anticipo.valorNumerico,
    files: [],
    status: "draft",
    ...overrides,
  };
}

describe("anticipos review utilities", () => {
  test("distinguishes same-phase selection from mixed selection", () => {
    const accountingA = advance(1, "III_REVISION_CONTABILIDAD");
    const accountingB = advance(2, "III_REVISION_CONTABILIDAD");
    const management = advance(3, "IV_APROBACION_GERENCIA");

    expect(hasMixedReviewPhases([accountingA, accountingB])).toBe(false);
    expect(hasMixedReviewPhases([accountingA, management])).toBe(true);
  });

  test("requires a decision and an individual rejection reason", () => {
    const first = draft(advance(10, "III_REVISION_CONTABILIDAD"));
    expect(getReviewValidationError([first], "review")).toContain("Define la decisión");

    const second = draft(advance(11, "III_REVISION_CONTABILIDAD"), {
      decision: "RECHAZADO",
    });
    expect(
      getReviewValidationError(
        [{ ...first, decision: "RECHAZADO", observation: "No cumple" }, second],
        "review"
      )
    ).toContain("#11");
  });

  test("requires an observation only when accounting changes its value", () => {
    const accounting = advance(20, "III_REVISION_CONTABILIDAD");
    const unchanged = draft(accounting, { decision: "APROBADO" });
    expect(getReviewValidationError([unchanged], "review")).toBeNull();

    const adjusted = { ...unchanged, accountingValue: 90_000 };
    expect(getReviewValidationError([adjusted], "review")).toContain("Explica el cambio");
    expect(
      getReviewValidationError(
        [{ ...adjusted, observation: "Ajuste contable soportado" }],
        "review"
      )
    ).toBeNull();
  });

  test("groups confirmation by action and next phase with adjusted totals", () => {
    const groups = buildReviewConfirmationGroups(
      [
        draft(advance(30, "III_REVISION_CONTABILIDAD"), {
          decision: "APROBADO",
          accountingValue: 90_000,
          observation: "Ajuste",
        }),
        draft(advance(31, "III_REVISION_CONTABILIDAD"), {
          decision: "APROBADO",
        }),
        draft(advance(32, "IV_APROBACION_GERENCIA"), {
          decision: "RECHAZADO",
          observation: "No autorizado",
        }),
      ],
      "review"
    );

    expect(groups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "Aprobar",
          nextPhase: "Gerencia",
          count: 2,
          amount: 190_000,
        }),
        expect.objectContaining({
          action: "Rechazar",
          nextPhase: "Cerrado",
          count: 1,
          amount: 100_000,
        }),
      ])
    );
  });

  test("keeps individual decisions when a joint fallback is defined", () => {
    const drafts = [
      draft(advance(40, "IV_APROBACION_GERENCIA"), {
        decision: "RECHAZADO",
        observation: "Excepción individual",
        hasIndividualOverride: true,
      }),
      draft(advance(41, "IV_APROBACION_GERENCIA")),
    ];

    const plans = buildEffectiveReviewPlans(drafts, "APROBADO", "Aprobación conjunta");

    expect(plans).toEqual([
      expect.objectContaining({
        anticipoId: "anticipo-40",
        decision: "RECHAZADO",
        observation: "Excepción individual",
        source: "individual",
      }),
      expect.objectContaining({
        anticipoId: "anticipo-41",
        decision: "APROBADO",
        observation: "Aprobación conjunta",
        source: "joint",
      }),
    ]);

    expect(applyReviewPlansToDrafts(drafts, plans)).toEqual([
      expect.objectContaining({ decision: "RECHAZADO" }),
      expect.objectContaining({ decision: "APROBADO" }),
    ]);
  });

  test("leaves mixed or incomplete items pending without a joint fallback", () => {
    const drafts = [
      draft(advance(50, "II_APROBACION_JEFE_DIRECTO"), {
        decision: "APROBADO",
        hasIndividualOverride: true,
      }),
      draft(advance(51, "IV_APROBACION_GERENCIA")),
    ];
    const plans = buildEffectiveReviewPlans(drafts);
    const effectiveDrafts = applyReviewPlansToDrafts(drafts, plans);

    expect(plans[0]?.source).toBe("individual");
    expect(plans[1]?.decision).toBeUndefined();
    expect(getReviewValidationError(effectiveDrafts, "review")).toContain("#51");
  });
});
