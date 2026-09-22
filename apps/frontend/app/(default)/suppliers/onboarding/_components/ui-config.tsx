"use client";

import type { ReactNode } from "react";
import { Ban, Briefcase, Building2, CheckCircle2, FileText, XCircle } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { TIPO_EVALUACION_MATRIX } from "@/lib/onboarding/risk/shared";
import { SUPPLIER_FASE_ROL, SUPPLIER_FASES_PROGRESO } from "@/lib/onboarding/phases/suppliers";
import { rolCumplimientoPorRiesgo } from "@/lib/onboarding/risk/compute";

export const SUPPLIER_MODULO = "supplier" as const;

// ─── Phase presentation ────────────────────────────────────────────────────────
export type FaseConfig = {
  label: string;
  short: string;
  color: string;
  bg: string;
  border: string;
  icon: React.ElementType;
};

export const FASE_CONFIG: Record<string, FaseConfig> = {
  I_ANALISIS_RIESGO: { label: "Análisis de Riesgo", short: "I", color: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200", icon: FileText },
  II_PENDIENTE_FORMULARIO: { label: "Pendiente Formulario", short: "II", color: "text-violet-700", bg: "bg-violet-50", border: "border-violet-200", icon: FileText },
  IIA_PENDIENTE_FIRMA: { label: "Pendiente Firma", short: "IIA", color: "text-violet-600", bg: "bg-violet-50", border: "border-violet-200", icon: FileText },
  III_REVISION_DOCUMENTAL: { label: "Revisión Documental", short: "III", color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200", icon: FileText },
  III_REVISION_DOCUMENTAL_COMPRAS: { label: "Revisión Documental — Compras", short: "III-C", color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200", icon: FileText },
  III_REVISION_DOCUMENTAL_CUMPLIMIENTO: { label: "Revisión Documental — Cumplimiento", short: "III-K", color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200", icon: FileText },
  IV_APROBADO_CUMPLIMIENTO: { label: "Aprobación Cumplimiento", short: "IV", color: "text-indigo-700", bg: "bg-indigo-50", border: "border-indigo-200", icon: Briefcase },
  V_EVALUACION_COMPRAS: { label: "Evaluación Compras", short: "V", color: "text-orange-700", bg: "bg-orange-50", border: "border-orange-200", icon: Briefcase },
  VI_CREACION_CONTABILIDAD: { label: "Creación Contabilidad", short: "VI", color: "text-teal-700", bg: "bg-teal-50", border: "border-teal-200", icon: Building2 },
  COMPLETADO: { label: "Completado", short: "✓", color: "text-green-700", bg: "bg-green-50", border: "border-green-200", icon: CheckCircle2 },
  RECHAZADO: { label: "Rechazado", short: "✗", color: "text-red-700", bg: "bg-red-50", border: "border-red-200", icon: XCircle },
  ANULADA: { label: "Anulada", short: "!", color: "text-slate-700", bg: "bg-slate-100", border: "border-slate-300", icon: Ban },
};

export const FASES_ORDERED: readonly string[] = SUPPLIER_FASES_PROGRESO;

export const FASES_TERMINALES: ReadonlySet<string> = new Set(["COMPLETADO", "RECHAZADO", "ANULADA"]);

export const FASES_GESTIONABLES: ReadonlySet<string> = new Set([
  "I_ANALISIS_RIESGO",
  "III_REVISION_DOCUMENTAL",
  "III_REVISION_DOCUMENTAL_COMPRAS",
  "III_REVISION_DOCUMENTAL_CUMPLIMIENTO",
  "IV_APROBADO_CUMPLIMIENTO",
  "V_EVALUACION_COMPRAS",
  "VI_CREACION_CONTABILIDAD",
]);

// ─── Risk / evaluation presentation ────────────────────────────────────────────
export type BadgeConfig = { label: string; dot: string; badge: string };

export const RIESGO_CONFIG: Record<string, BadgeConfig> = {
  BAJO: { label: "Bajo", dot: "bg-green-500", badge: "bg-green-50 text-green-700 border-green-200" },
  MEDIO: { label: "Medio", dot: "bg-yellow-500", badge: "bg-yellow-50 text-yellow-700 border-yellow-200" },
  ALTO: { label: "Alto", dot: "bg-orange-500", badge: "bg-orange-50 text-orange-700 border-orange-200" },
  SUPERIOR: { label: "Superior", dot: "bg-red-500", badge: "bg-red-50 text-red-700 border-red-200" },
  INDEFINIDO: { label: "Indefinido", dot: "bg-slate-300", badge: "bg-slate-50 text-slate-500 border-slate-200" },
};

export const EVALUACION_CONFIG: Record<string, BadgeConfig> = {
  "SOLO LISTAS": { label: "Solo listas", dot: "bg-green-500", badge: "bg-green-50 text-green-700 border-green-200" },
  SIMPLIFICADA: { label: "Simplificada", dot: "bg-yellow-500", badge: "bg-yellow-50 text-yellow-700 border-yellow-200" },
  COMPLETA: { label: "Completa", dot: "bg-orange-500", badge: "bg-orange-50 text-orange-700 border-orange-200" },
  INTENSIFICADA: { label: "Intensificada", dot: "bg-red-500", badge: "bg-red-50 text-red-700 border-red-200" },
  INDEFINIDO: { label: "Indefinido", dot: "bg-slate-300", badge: "bg-slate-50 text-slate-500 border-slate-200" },
};

/** Solid badge classes (dialog headers, summaries). */
export const RIESGO_BADGE_SOLID: Record<string, string> = {
  BAJO: "bg-green-100 text-green-800 border-green-200",
  MEDIO: "bg-yellow-100 text-yellow-800 border-yellow-200",
  ALTO: "bg-orange-100 text-orange-800 border-orange-200",
  SUPERIOR: "bg-red-100 text-red-800 border-red-200",
  "SOLO LISTAS": "bg-green-100 text-green-800 border-green-200",
  SIMPLIFICADA: "bg-yellow-100 text-yellow-800 border-yellow-200",
  COMPLETA: "bg-orange-100 text-orange-800 border-orange-200",
  INTENSIFICADA: "bg-red-100 text-red-800 border-red-200",
  INDEFINIDO: "bg-slate-100 text-slate-600 border-slate-200",
};

export const ESTADO_DOC_BADGE: Record<string, string> = {
  PENDIENTE: "bg-amber-50 text-amber-700 border-amber-200",
  EN_REVISION: "bg-blue-50 text-blue-700 border-blue-200",
  APROBADO: "bg-green-50 text-green-700 border-green-200",
  RECHAZADO: "bg-red-50 text-red-700 border-red-200",
};

export const ESTADO_DOC_LABEL: Record<string, string> = {
  PENDIENTE: "Pendiente",
  EN_REVISION: "En revisión",
  APROBADO: "Aprobado",
  RECHAZADO: "Rechazado",
};

export function evaluacionFromRiesgo(riesgo: string): string {
  return TIPO_EVALUACION_MATRIX[riesgo] ?? "INDEFINIDO";
}

/** Role that owns the current phase of an inscription (Fase IV escalates by evaluation type). */
export function rolRequeridoParaFase(fase: string | undefined, tipoEvaluacion: string | undefined): string | undefined {
  if (!fase) return undefined;
  if (fase === "IV_APROBADO_CUMPLIMIENTO") return rolCumplimientoPorRiesgo(tipoEvaluacion);
  return SUPPLIER_FASE_ROL[fase];
}

// ─── Small helpers ─────────────────────────────────────────────────────────────
export function shortRef(id: string): string {
  return id.slice(-8).toUpperCase();
}

export function toDateStr(ts: number | undefined): string {
  return format(new Date(ts ?? Date.now()), "dd/MM/yyyy", { locale: es });
}

export function toDateTimeStr(ts: number): string {
  return format(new Date(ts), "dd/MM/yyyy HH:mm", { locale: es });
}

export function formatDateTimeCO(ts: number | null | undefined): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("es-CO", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]!.toUpperCase())
    .join("");
}

/** Extracts the human message from a Convex error (strips request ids and prefixes). */
export function getOnboardingErrorMessage(error: unknown, fallback = "No se pudo completar la acción."): string {
  if (!(error instanceof Error)) return fallback;
  const message = error.message;
  const uncaught = message.match(/Uncaught Error:\s*([^]*?)(?:\. at handler|$)/);
  if (uncaught?.[1]) return uncaught[1].trim();
  return (
    message
      .replace(/^\[CONVEX[^\]]*\]\s*/g, "")
      .replace(/\[Request ID:[^\]]+\]\s*/g, "")
      .replace(/Server Error\s*/g, "")
      .trim() || fallback
  );
}

export async function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function InfoItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-0.5 rounded-lg border border-slate-100 bg-white px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <div className="text-sm font-medium text-slate-800">{children}</div>
    </div>
  );
}

export function TipoSolicitudChip({ tipoSolicitud, className = "" }: { tipoSolicitud?: string; className?: string }) {
  if (!tipoSolicitud) return null;
  const actualizacion = tipoSolicitud === "ACTUALIZACIÓN";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
        actualizacion ? "border-amber-200 bg-amber-50 text-amber-700" : "border-green-200 bg-green-50 text-green-700"
      } ${className}`}
    >
      {tipoSolicitud}
    </span>
  );
}
