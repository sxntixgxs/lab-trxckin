import { faseLabels } from "../dashboard/constants";
import type { AnticipoRow } from "../dashboard/types";
import { getDefaultReturnTarget } from "../dashboard/utils";
import { getValorContableAnticipo } from "../lib/valor-contable-anticipo";
import type {
  AnticipoReviewDecision,
  AnticipoReviewDraft,
  AnticipoReviewMode,
  AnticipoReviewPlan,
} from "./types";

export type AnticipoReviewConfirmationGroup = {
  key: string;
  action: string;
  nextPhase: string;
  count: number;
  amount: number;
};

export function hasMixedReviewPhases(items: AnticipoRow[]) {
  return new Set(items.map((item) => item.faseActual)).size > 1;
}

export function buildEffectiveReviewPlans(
  drafts: AnticipoReviewDraft[],
  jointDecision?: AnticipoReviewDecision,
  jointObservation = ""
): AnticipoReviewPlan[] {
  return drafts.map((draft) => {
    const individual = draft.hasIndividualOverride === true;
    return {
      anticipoId: String(draft.anticipo._id),
      observedPhase: draft.observedPhase,
      decision: individual ? draft.decision : jointDecision,
      observation: individual ? draft.observation : jointObservation,
      source: individual ? "individual" : "joint",
    };
  });
}

export function applyReviewPlansToDrafts(
  drafts: AnticipoReviewDraft[],
  plans: AnticipoReviewPlan[]
) {
  const planById = new Map(plans.map((plan) => [plan.anticipoId, plan]));
  return drafts.map((draft) => {
    const plan = planById.get(String(draft.anticipo._id));
    return plan ? { ...draft, decision: plan.decision, observation: plan.observation } : draft;
  });
}

export function nextReviewPhaseLabel(anticipo: AnticipoRow) {
  if (anticipo.faseActual === "II_APROBACION_JEFE_DIRECTO") {
    return anticipo.cubreFacturaCompleta === false ? "Gerencia" : "Contabilidad";
  }
  if (anticipo.faseActual === "III_REVISION_CONTABILIDAD") return "Gerencia";
  if (anticipo.faseActual === "IV_APROBACION_GERENCIA") return "Tesorería";
  return "Siguiente fase";
}

export function getReviewValidationError(drafts: AnticipoReviewDraft[], mode: AnticipoReviewMode) {
  if (mode === "readonly") return null;
  for (const draft of drafts) {
    if (draft.status === "success") continue;
    if (mode === "review" && !draft.decision) {
      return `Define la decisión del anticipo #${draft.anticipo.consecutivo}.`;
    }
    if (
      (draft.decision === "RECHAZADO" || mode === "devolver" || mode === "anular") &&
      !draft.observation.trim()
    ) {
      return `Registra el motivo del anticipo #${draft.anticipo.consecutivo}.`;
    }
    if (
      mode === "review" &&
      draft.decision === "APROBADO" &&
      draft.anticipo.faseActual === "III_REVISION_CONTABILIDAD"
    ) {
      const current = getValorContableAnticipo(draft.anticipo);
      if (
        draft.accountingValue == null ||
        !Number.isFinite(draft.accountingValue) ||
        draft.accountingValue < 0
      ) {
        return `Revisa el valor contable del anticipo #${draft.anticipo.consecutivo}.`;
      }
      if (draft.accountingValue !== current && !draft.observation.trim()) {
        return `Explica el cambio de valor del anticipo #${draft.anticipo.consecutivo}.`;
      }
    }
  }
  return null;
}

function groupDescriptor(draft: AnticipoReviewDraft, mode: AnticipoReviewMode) {
  if (mode === "anular") {
    return { key: "anular:cerrado", action: "Anular", nextPhase: "Cerrado" };
  }
  if (mode === "desembolso") {
    return {
      key: "desembolso:legalizacion",
      action: "Registrar desembolso",
      nextPhase: "Pendiente de legalización",
    };
  }
  if (mode === "devolver") {
    const target = getDefaultReturnTarget(
      draft.anticipo.faseActual,
      draft.anticipo.responsableOrigen,
      draft.anticipo.cubreFacturaCompleta,
      draft.anticipo.tipoBolsa
    );
    const nextPhase = target ? (faseLabels[target] ?? target) : "Sin destino disponible";
    return { key: `devolver:${target ?? "none"}`, action: "Devolver", nextPhase };
  }
  if (draft.decision === "RECHAZADO") {
    return { key: "rechazar:cerrado", action: "Rechazar", nextPhase: "Cerrado" };
  }
  const nextPhase = nextReviewPhaseLabel(draft.anticipo);
  return {
    key: `aprobar:${draft.anticipo.faseActual}:${nextPhase}`,
    action: "Aprobar",
    nextPhase,
  };
}

export function buildReviewConfirmationGroups(
  drafts: AnticipoReviewDraft[],
  mode: AnticipoReviewMode
): AnticipoReviewConfirmationGroup[] {
  const groups = new Map<string, AnticipoReviewConfirmationGroup>();
  for (const draft of drafts) {
    if (draft.status === "success") continue;
    const descriptor = groupDescriptor(draft, mode);
    const current = groups.get(descriptor.key) ?? {
      ...descriptor,
      count: 0,
      amount: 0,
    };
    const amount =
      mode === "review" &&
      draft.decision === "APROBADO" &&
      draft.anticipo.faseActual === "III_REVISION_CONTABILIDAD"
        ? (draft.accountingValue ?? getValorContableAnticipo(draft.anticipo))
        : getValorContableAnticipo(draft.anticipo);
    current.count += 1;
    current.amount += amount;
    groups.set(descriptor.key, current);
  }
  return [...groups.values()];
}
