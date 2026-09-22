export type MovimientoCajaMenorEstado =
  | "pendiente_reembolso"
  | "en_reembolso"
  | "reembolsado"
  | "anulado";

export type ReembolsoCajaMenorEstado =
  | "pendiente_aprobacion_lider"
  | "pendiente_revision"
  | "pendiente_revision_impuestos"
  | "pendiente_eventos_dian"
  | "pendiente_aprobacion"
  | "pendiente_pago_tesoreria"
  | "aprobado_pendiente_recibo"
  | "rechazado"
  | "recibido"
  | "anulado";

export type EstadoTone = "slate" | "amber" | "teal" | "emerald" | "rose" | "sky";

export const MOVIMIENTO_ESTADO_LABELS: Record<MovimientoCajaMenorEstado, string> = {
  pendiente_reembolso: "Pendiente reembolso",
  en_reembolso: "En reembolso",
  reembolsado: "Reembolsado",
  anulado: "Anulado",
};

export const REEMBOLSO_ESTADO_LABELS: Record<ReembolsoCajaMenorEstado, string> = {
  pendiente_aprobacion_lider: "Pendiente aprobación líder",
  pendiente_revision: "Pendiente revisión",
  pendiente_revision_impuestos: "Pendiente revisión impuestos",
  pendiente_eventos_dian: "Eventos DIAN",
  pendiente_aprobacion: "Pendiente aprobación",
  pendiente_pago_tesoreria: "Pendiente pago Tesorería",
  aprobado_pendiente_recibo: "Aprobado · pendiente recibo",
  rechazado: "Rechazado",
  recibido: "Pagado",
  anulado: "Anulado",
};

export const MOVIMIENTO_ESTADO_TONES: Record<MovimientoCajaMenorEstado, EstadoTone> = {
  pendiente_reembolso: "amber",
  en_reembolso: "sky",
  reembolsado: "emerald",
  anulado: "rose",
};

export const REEMBOLSO_ESTADO_TONES: Record<ReembolsoCajaMenorEstado, EstadoTone> = {
  pendiente_aprobacion_lider: "amber",
  pendiente_revision: "teal",
  pendiente_revision_impuestos: "sky",
  pendiente_eventos_dian: "teal",
  pendiente_aprobacion: "amber",
  pendiente_pago_tesoreria: "sky",
  aprobado_pendiente_recibo: "sky",
  rechazado: "rose",
  recibido: "emerald",
  anulado: "slate",
};

export function getMovimientoEstadoLabel(estado: string) {
  return (
    MOVIMIENTO_ESTADO_LABELS[estado as MovimientoCajaMenorEstado] ?? estado
  );
}

export function getReembolsoEstadoLabel(estado: string) {
  return REEMBOLSO_ESTADO_LABELS[estado as ReembolsoCajaMenorEstado] ?? estado;
}

export function getMovimientoEstadoTone(estado: string): EstadoTone {
  return MOVIMIENTO_ESTADO_TONES[estado as MovimientoCajaMenorEstado] ?? "slate";
}

export function getReembolsoEstadoTone(estado: string): EstadoTone {
  return REEMBOLSO_ESTADO_TONES[estado as ReembolsoCajaMenorEstado] ?? "slate";
}

export const ESTADO_TONE_CLASSES: Record<
  EstadoTone,
  { badge: string; kpi?: string }
> = {
  slate: {
    badge: "border-slate-200 bg-slate-50 text-slate-700",
    kpi: "border-slate-200 bg-white text-slate-950",
  },
  amber: {
    badge: "border-amber-200 bg-amber-50 text-amber-800",
    kpi: "border-amber-200 bg-amber-50 text-amber-950",
  },
  teal: {
    badge: "border-teal-200 bg-teal-50 text-teal-800",
    kpi: "border-teal-200 bg-teal-50 text-teal-950",
  },
  emerald: {
    badge: "border-emerald-200 bg-emerald-50 text-emerald-800",
    kpi: "border-emerald-200 bg-emerald-50 text-emerald-950",
  },
  rose: {
    badge: "border-rose-200 bg-rose-50 text-rose-800",
    kpi: "border-rose-200 bg-rose-50 text-rose-950",
  },
  sky: {
    badge: "border-sky-200 bg-sky-50 text-sky-800",
    kpi: "border-sky-200 bg-sky-50 text-sky-950",
  },
};

export function parseMoneyInput(value: string) {
  const normalized = value.replace(/[^\d.,]/g, "").replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function getSaldoDisponibleTone(saldo: number): EstadoTone {
  if (saldo < 0) return "rose";
  if (saldo > 0) return "emerald";
  return "slate";
}

export function getSaldoDisponibleTextClass(saldo: number) {
  if (saldo < 0) return "font-bold tabular-nums text-rose-600";
  if (saldo > 0) return "font-bold tabular-nums text-emerald-700";
  return "font-bold tabular-nums text-slate-600";
}

export function getMutationErrorMessage(
  error: unknown,
  fallback = "Ocurrió un error inesperado.",
) {
  if (error && typeof error === "object" && "data" in error) {
    const data = (error as { data: unknown }).data;
    if (typeof data === "string" && data.trim()) return data;
    if (
      data &&
      typeof data === "object" &&
      "message" in data &&
      typeof (data as { message: unknown }).message === "string"
    ) {
      const message = (data as { message: string }).message.trim();
      if (message) return message;
    }
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
}
