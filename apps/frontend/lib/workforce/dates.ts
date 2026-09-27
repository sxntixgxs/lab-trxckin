/** Colombia has used UTC−05:00 without DST since 1993. This module supports the
 * launch-forward workforce data and never depends on the browser/server zone. */
const DAY = 86_400_000;
const BOGOTA_OFFSET = 5 * 60 * 60 * 1_000;

function dateUtc(date: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Fecha inválida; usa AAAA-MM-DD.');
  const ms = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== date) {
    throw new Error('Fecha de calendario inválida.');
  }
  return ms;
}

export function bogotaDate(timestamp: number): string {
  if (!Number.isFinite(timestamp)) throw new Error('Instante inválido.');
  return new Date(timestamp - BOGOTA_OFFSET).toISOString().slice(0, 10);
}

export function bogotaTimestamp(date: string, time = '00:00'): number {
  const parts = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(time);
  if (!parts) throw new Error('Hora inválida; usa HH:mm.');
  const [, hour, minute, second = '0'] = parts;
  if (Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) {
    throw new Error('Hora fuera del rango permitido.');
  }
  return dateUtc(date) + BOGOTA_OFFSET + (Number(hour) * 3_600 + Number(minute) * 60 + Number(second)) * 1_000;
}

export function addDays(date: string, days: number): string {
  if (!Number.isInteger(days)) throw new Error('La cantidad de días debe ser entera.');
  return new Date(dateUtc(date) + days * DAY).toISOString().slice(0, 10);
}

export function weekday(date: string): number {
  return new Date(dateUtc(date)).getUTCDay();
}

export function bogotaMinute(timestamp: number): number {
  const date = new Date(timestamp - BOGOTA_OFFSET);
  if (!Number.isFinite(date.getTime())) throw new Error('Instante inválido.');
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

export function weekStart(date: string): string {
  return addDays(date, -weekday(date));
}

export function periodFor(date: string): { start: string; end: string } {
  dateUtc(date);
  const prefix = date.slice(0, 7);
  if (Number(date.slice(8)) <= 15) return { start: `${prefix}-01`, end: `${prefix}-15` };
  const nextMonth = new Date(dateUtc(`${prefix}-01`));
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  return { start: `${prefix}-16`, end: new Date(nextMonth.getTime() - DAY).toISOString().slice(0, 10) };
}

export function datesBetween(start: string, end: string): string[] {
  const first = dateUtc(start);
  const last = dateUtc(end);
  if (last < first) return [];
  if ((last - first) / DAY > 3_660) throw new Error('El rango de fechas es demasiado amplio.');
  const result: string[] = [];
  for (let ms = first; ms <= last; ms += DAY) result.push(new Date(ms).toISOString().slice(0, 10));
  return result;
}
