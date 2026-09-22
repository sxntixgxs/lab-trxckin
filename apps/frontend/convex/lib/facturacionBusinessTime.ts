import {
  addBogotaCalendarDays,
  isColombianBusinessDay,
  startOfBogotaDayMs,
  toBogotaDateKey,
} from "./colombiaHolidays";

export type SlaEstado = "healthy" | "warning" | "breached" | "sin_sla" | "n_a";

export type SlaPhase =
  | "recepcion"
  | "revision_lider"
  | "causacion"
  | "revision_impuestos"
  | "eventos_dian"
  | "pendiente_rechazar_dian"
  | "gerencia"
  | "revision_tesoreria";

export const SLA_SUPPORTED_PHASES: SlaPhase[] = [
  "recepcion",
  "revision_lider",
  "causacion",
  "revision_impuestos",
  "eventos_dian",
  "pendiente_rechazar_dian",
  "gerencia",
  "revision_tesoreria",
];

export const SLA_PHASE_LABELS: Record<SlaPhase, string> = {
  recepcion: "Recepción",
  revision_lider: "Líder",
  causacion: "Causación",
  revision_impuestos: "Contabilidad",
  eventos_dian: "Eventos DIAN",
  pendiente_rechazar_dian: "Rechazos DIAN",
  gerencia: "Gerencia",
  revision_tesoreria: "Tesorería",
};

const MS_PER_DAY = 86_400_000;

/**
 * Fractional Colombian business days between two instants (Bogotá calendar).
 * Weekends and Colombian holidays contribute 0.
 */
export function diffBusinessDaysBogota(fromMs: number, toMs: number): number {
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) {
    return 0;
  }

  let total = 0;
  let cursor = startOfBogotaDayMs(fromMs);

  while (cursor < toMs) {
    const next = cursor + MS_PER_DAY;
    if (isColombianBusinessDay(cursor + 12 * 3_600_000)) {
      const start = Math.max(fromMs, cursor);
      const end = Math.min(toMs, next);
      if (end > start) {
        total += (end - start) / MS_PER_DAY;
      }
    }
    cursor = next;
  }

  return Math.max(0, Math.round(total * 1000) / 1000);
}

/**
 * Add N full Colombian business days to a start instant.
 * Counting starts from the next business-day boundary after `fromMs`
 * when the start falls mid-day; whole days are calendar business days.
 */
export function addBusinessDaysBogota(fromMs: number, days: number): number {
  if (!Number.isFinite(days) || days <= 0) return fromMs;

  let remaining = days;
  let cursor = fromMs;

  // Consume partial day at start if it is a business day
  const dayStart = startOfBogotaDayMs(fromMs);
  const dayEnd = dayStart + MS_PER_DAY;
  if (isColombianBusinessDay(fromMs)) {
    const fracLeft = (dayEnd - fromMs) / MS_PER_DAY;
    if (remaining <= fracLeft) {
      return fromMs + remaining * MS_PER_DAY;
    }
    remaining -= fracLeft;
    cursor = dayEnd;
  } else {
    cursor = dayEnd;
  }

  while (remaining > 0) {
    if (isColombianBusinessDay(cursor + 12 * 3_600_000)) {
      if (remaining <= 1) {
        return cursor + remaining * MS_PER_DAY;
      }
      remaining -= 1;
    }
    cursor += MS_PER_DAY;
  }

  return cursor;
}

export type SlaComputation = {
  estado: SlaEstado;
  umbralDias?: number;
  alertaEn?: number;
  venceEn?: number;
  edadDiasLaborales: number;
  progreso: number | null;
};

/**
 * SLA uses total phase time from faseIniciadaEn.
 * Warning at 80% of threshold; breach at 100%.
 * Missing threshold → sin_sla (no warning/breach emails).
 */
export function computeSlaState(args: {
  faseIniciadaEn: number | null | undefined;
  umbralDiasLaborales: number | null | undefined;
  nowMs: number;
  esActiva: boolean;
}): SlaComputation {
  if (!args.esActiva) {
    return { estado: "n_a", edadDiasLaborales: 0, progreso: null };
  }

  const start = args.faseIniciadaEn;
  if (!start) {
    return { estado: "sin_sla", edadDiasLaborales: 0, progreso: null };
  }

  const edad = diffBusinessDaysBogota(start, args.nowMs);
  const umbral = args.umbralDiasLaborales;

  if (umbral == null || !Number.isFinite(umbral) || umbral <= 0) {
    return {
      estado: "sin_sla",
      edadDiasLaborales: edad,
      progreso: null,
    };
  }

  const alertaEn = addBusinessDaysBogota(start, umbral * 0.8);
  const venceEn = addBusinessDaysBogota(start, umbral);
  const progreso = edad / umbral;

  let estado: SlaEstado = "healthy";
  if (args.nowMs >= venceEn) estado = "breached";
  else if (args.nowMs >= alertaEn) estado = "warning";

  return {
    estado,
    umbralDias: umbral,
    alertaEn,
    venceEn,
    edadDiasLaborales: edad,
    progreso,
  };
}

export function isSlaPhase(fase: string): fase is SlaPhase {
  return (SLA_SUPPORTED_PHASES as string[]).includes(fase);
}

export function localBogotaDateString(ms: number = Date.now()): string {
  return toBogotaDateKey(ms);
}

export function shouldRunDigestToday(nowMs: number = Date.now()): boolean {
  return isColombianBusinessDay(nowMs);
}

export function addCalendarDaysInclusiveRange(
  fromKey: string,
  toKey: string
): { fromMs: number; toMsExclusive: number } {
  const fromMs = new Date(`${fromKey}T00:00:00-05:00`).getTime();
  const toMsExclusive = new Date(`${toKey}T00:00:00-05:00`).getTime() + MS_PER_DAY;
  return { fromMs, toMsExclusive };
}

export function currentMonthBogotaRange(nowMs: number = Date.now()): {
  fromKey: string;
  toKey: string;
  fromMs: number;
  toMsExclusive: number;
} {
  const key = toBogotaDateKey(nowMs);
  const [y, m] = key.split("-").map(Number);
  const fromKey = `${y}-${String(m).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const toKey = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  const range = addCalendarDaysInclusiveRange(fromKey, toKey);
  return { fromKey, toKey, ...range };
}

export function previousMonthBogotaRange(nowMs: number = Date.now()): {
  fromKey: string;
  toKey: string;
  fromMs: number;
  toMsExclusive: number;
} {
  const key = toBogotaDateKey(nowMs);
  const [y, m] = key.split("-").map(Number);
  const prevMonth = m === 1 ? 12 : m - 1;
  const prevYear = m === 1 ? y - 1 : y;
  const fromKey = `${prevYear}-${String(prevMonth).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(prevYear, prevMonth, 0)).getUTCDate();
  const toKey = `${prevYear}-${String(prevMonth).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  const range = addCalendarDaysInclusiveRange(fromKey, toKey);
  return { fromKey, toKey, ...range };
}

/** Shift helper used by preview UI. */
export { addBogotaCalendarDays };
