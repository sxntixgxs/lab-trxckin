/** Formats a duration in milliseconds (not a timestamp) as "Xd Yh" / "Xh Ym" / "Ym". */
export function formatAgeMs(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  const total = Math.max(0, Math.round(ms));
  const minutes = Math.floor(total / 60_000);
  if (minutes < 1) return "<1m";
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  const remMin = minutes % 60;
  if (hours < 24) return remMin ? `${hours}h ${remMin}m` : `${hours}h`;

  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours ? `${days}d ${remHours}h` : `${days}d`;
}
