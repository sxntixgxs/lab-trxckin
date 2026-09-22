export function formatCurrency(value: number, currency = "COP") {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatDate(value: number | string | null | undefined) {
  const date = parseCalendarDate(value);
  if (!Number.isFinite(date.getTime())) return "Sin fecha";
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
  }).format(date);
}

function parseCalendarDate(value: number | string | null | undefined): Date {
  if (value == null || value === "") return new Date(Number.NaN);
  if (typeof value === "string") {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (match) {
      const [, year, month, day] = match;
      return new Date(Number(year), Number(month) - 1, Number(day));
    }
  }
  return new Date(value);
}

export function formatDateTime(value: number | string | null | undefined) {
  const date = new Date(value ?? Number.NaN);
  if (!Number.isFinite(date.getTime())) return "Sin fecha y hora";
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function timeAgo(value: number | string | null | undefined) {
  const date = new Date(value ?? Number.NaN).getTime();
  if (!Number.isFinite(date)) return "Sin fecha";
  const diffMs = date - Date.now();
  const diffMinutes = Math.round(diffMs / 60_000);

  const rtf = new Intl.RelativeTimeFormat("es", { numeric: "auto" });

  if (Math.abs(diffMinutes) < 60) {
    return rtf.format(diffMinutes, "minute");
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) {
    return rtf.format(diffHours, "hour");
  }

  const diffDays = Math.round(diffHours / 24);
  if (Math.abs(diffDays) < 30) {
    return rtf.format(diffDays, "day");
  }

  const diffMonths = Math.round(diffDays / 30);
  return rtf.format(diffMonths, "month");
}

/** Formatea un timestamp como "Xd Yh" / "Xh Ym" / "Ym" (tiempo transcurrido). */
export function formatElapsed(value: number | string | null | undefined) {
  const date = new Date(value ?? Number.NaN).getTime();
  if (!Number.isFinite(date)) return "Sin fecha";
  const diff = Math.max(0, Date.now() - date);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "<1m";
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  const remMin = minutes % 60;
  if (hours < 24) return remMin ? `${hours}h ${remMin}m` : `${hours}h`;

  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours ? `${days}d ${remHours}h` : `${days}d`;
}
