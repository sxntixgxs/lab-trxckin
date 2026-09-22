"use client";

// Presentation config of the CUSTOMER onboarding board. Risk badges, date helpers and small
// widgets are shared with the supplier board; only the phase machine differs.
import { Ban, Building2, CheckCircle2, FileText, ShieldCheck, XCircle } from "lucide-react";
import { CUSTOMER_FASE_ROL, CUSTOMER_FASES_PROGRESO, CUSTOMER_FASES_TERMINALES } from "@/lib/onboarding/phases/customers";
import { rolCumplimientoPorRiesgo } from "@/lib/onboarding/risk/compute";
import type { FaseConfig } from "@/app/(default)/suppliers/onboarding/_components/ui-config";

export {
  ESTADO_DOC_BADGE,
  ESTADO_DOC_LABEL,
  EVALUACION_CONFIG,
  evaluacionFromRiesgo,
  formatDateTimeCO,
  getInitials,
  getOnboardingErrorMessage,
  InfoItem,
  RIESGO_BADGE_SOLID,
  RIESGO_CONFIG,
  shortRef,
  TipoSolicitudChip,
  toDateStr,
  toDateTimeStr,
  triggerDownload,
  type BadgeConfig,
  type FaseConfig,
} from "@/app/(default)/suppliers/onboarding/_components/ui-config";

export const CUSTOMER_MODULO = "customer" as const;

export const FASE_CONFIG: Record<string, FaseConfig> = {
  I_ANALISIS_RIESGO: { label: "Análisis de Riesgo", short: "I", color: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200", icon: FileText },
  II_PENDIENTE_FORMULARIO: { label: "Pendiente Formulario", short: "II", color: "text-violet-700", bg: "bg-violet-50", border: "border-violet-200", icon: FileText },
  IIA_PENDIENTE_FIRMA: { label: "Pendiente Firma", short: "IIA", color: "text-violet-600", bg: "bg-violet-50", border: "border-violet-200", icon: FileText },
  III_REVISION_DOCUMENTAL: { label: "Revisión Documental", short: "III", color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200", icon: FileText },
  IIIA_APROBACION_CUMPLIMIENTO: { label: "Aprobación Cumplimiento", short: "IIIA", color: "text-indigo-700", bg: "bg-indigo-50", border: "border-indigo-200", icon: ShieldCheck },
  IV_CREACION_CONTABILIDAD: { label: "Creación Contabilidad", short: "IV", color: "text-teal-700", bg: "bg-teal-50", border: "border-teal-200", icon: Building2 },
  COMPLETADO: { label: "Completado", short: "✓", color: "text-green-700", bg: "bg-green-50", border: "border-green-200", icon: CheckCircle2 },
  RECHAZADO: { label: "Rechazado", short: "✗", color: "text-red-700", bg: "bg-red-50", border: "border-red-200", icon: XCircle },
  ANULADA: { label: "Anulada", short: "!", color: "text-slate-700", bg: "bg-slate-100", border: "border-slate-300", icon: Ban },
};

export const FASES_ORDERED: readonly string[] = CUSTOMER_FASES_PROGRESO;
export const FASES_TERMINALES: ReadonlySet<string> = CUSTOMER_FASES_TERMINALES;

export const FASES_GESTIONABLES: ReadonlySet<string> = new Set([
  "I_ANALISIS_RIESGO",
  "III_REVISION_DOCUMENTAL",
  "IIIA_APROBACION_CUMPLIMIENTO",
  "IV_CREACION_CONTABILIDAD",
]);

/** Role that owns the current phase of an inscription (Fase IIIA escalates by evaluation type). */
export function rolRequeridoParaFase(fase: string | undefined, tipoEvaluacion: string | undefined): string | undefined {
  if (!fase) return undefined;
  if (fase === "IIIA_APROBACION_CUMPLIMIENTO") return rolCumplimientoPorRiesgo(tipoEvaluacion);
  return CUSTOMER_FASE_ROL[fase];
}

export const FORMA_PAGO_OPTIONS = ["Anticipado", "Contado", "Crédito"] as const;
export const PLAZO_OPTIONS = ["NA", "15 días", "30 días", "60 días", "90 días", "120 días"] as const;
export type FormaPago = (typeof FORMA_PAGO_OPTIONS)[number];
export type PlazoPago = (typeof PLAZO_OPTIONS)[number];
/** Options available for the term selector given the payment method (Anticipado ⇔ NA). */
export function plazosPara(formaPago: string): readonly PlazoPago[] {
  return formaPago === "Anticipado" ? ["NA"] : PLAZO_OPTIONS.filter((p) => p !== "NA");
}
