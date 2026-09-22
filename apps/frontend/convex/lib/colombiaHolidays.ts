/**
 * Colombian public holiday calculator (Ley Emiliani + fixed dates).
 * Does not depend on a static year JSON — works for any Gregorian year.
 */

const BOGOTA_TZ = "America/Bogota";

/** Meeus/Jones/Butcher Gregorian Easter Sunday (UTC noon). */
export function easterSundayUtc(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function toBogotaDateKey(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BOGOTA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
}

export function bogotaDateParts(ms: number): {
  year: number;
  month: number;
  day: number;
  weekday: number;
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BOGOTA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(new Date(ms));

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    weekday: weekdayMap[get("weekday")] ?? 0,
  };
}

function dateKeyFromYmd(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function addDaysUtc(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

/** Next Monday on or after the given UTC date (Ley Emiliani). */
function nextMondayOnOrAfter(date: Date): Date {
  const day = date.getUTCDay();
  if (day === 1) return date;
  const delta = day === 0 ? 1 : 8 - day;
  return addDaysUtc(date, delta);
}

function ymdFromUtc(date: Date): string {
  return dateKeyFromYmd(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

const holidayCache = new Map<number, Set<string>>();

export function colombianHolidayKeysForYear(year: number): Set<string> {
  const cached = holidayCache.get(year);
  if (cached) return cached;

  const keys = new Set<string>();
  const addFixed = (month: number, day: number) => {
    keys.add(dateKeyFromYmd(year, month, day));
  };
  const addEmiliani = (month: number, day: number) => {
    keys.add(ymdFromUtc(nextMondayOnOrAfter(new Date(Date.UTC(year, month - 1, day)))));
  };

  // Fixed
  addFixed(1, 1);
  addFixed(5, 1);
  addFixed(7, 20);
  addFixed(8, 7);
  addFixed(12, 8);
  addFixed(12, 25);

  // Ley Emiliani (observed on Monday)
  addEmiliani(1, 6); // Reyes Magos
  addEmiliani(3, 19); // San José
  addEmiliani(6, 29); // San Pedro y San Pablo
  addEmiliani(8, 15); // Asunción
  addEmiliani(11, 1); // Todos los Santos
  addEmiliani(11, 11); // Independencia de Cartagena

  const easter = easterSundayUtc(year);
  keys.add(ymdFromUtc(addDaysUtc(easter, -3))); // Jueves Santo
  keys.add(ymdFromUtc(addDaysUtc(easter, -2))); // Viernes Santo
  keys.add(ymdFromUtc(nextMondayOnOrAfter(addDaysUtc(easter, 39)))); // Ascensión
  keys.add(ymdFromUtc(nextMondayOnOrAfter(addDaysUtc(easter, 60)))); // Corpus Christi
  keys.add(ymdFromUtc(nextMondayOnOrAfter(addDaysUtc(easter, 68)))); // Sagrado Corazón

  holidayCache.set(year, keys);
  return keys;
}

export function isColombianHoliday(ms: number): boolean {
  const { year } = bogotaDateParts(ms);
  return colombianHolidayKeysForYear(year).has(toBogotaDateKey(ms));
}

export function isColombianBusinessDay(ms: number): boolean {
  const { weekday } = bogotaDateParts(ms);
  if (weekday === 0 || weekday === 6) return false;
  return !isColombianHoliday(ms);
}

/** Start of the given Bogotá calendar day as epoch ms (approx via noon shift). */
export function startOfBogotaDayMs(ms: number): number {
  const key = toBogotaDateKey(ms);
  // Interpret YYYY-MM-DD as midnight Bogotá → UTC via fixed offset lookup
  const probe = new Date(`${key}T12:00:00-05:00`);
  const keyAtProbe = toBogotaDateKey(probe.getTime());
  // Adjust if DST-like mismatch (Colombia has no DST; -05 is stable)
  if (keyAtProbe !== key) {
    return new Date(`${key}T00:00:00-05:00`).getTime();
  }
  return new Date(`${key}T00:00:00-05:00`).getTime();
}

export function addBogotaCalendarDays(ms: number, days: number): number {
  const start = startOfBogotaDayMs(ms);
  return start + days * 86_400_000;
}
