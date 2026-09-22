import { isColombianBusinessDay } from "@/convex/lib/colombiaHolidays";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function nextLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
}

/** Día hábil colombiano: excluye fines de semana y festivos (Ley Emiliani). */
export function esDiaLaboral(fecha: Date | number): boolean {
  const ms = typeof fecha === "number" ? fecha : fecha.getTime();
  return isColombianBusinessDay(ms);
}

/**
 * Diferencia en días hábiles (fraccionaria, redondeada a 2 decimales) entre dos
 * instantes. Las horas que caen en fin de semana o festivo no cuentan.
 */
export function diffDiasLaborales(
  from: number | null | undefined,
  to: number | null | undefined,
): number | null {
  if (!from || !to) return null;
  if (to <= from) return 0;

  let total = 0;
  let cursor = startOfLocalDay(new Date(from));

  while (cursor.getTime() < to) {
    const siguienteDia = nextLocalDay(cursor);
    if (esDiaLaboral(cursor.getTime() + MS_PER_DAY / 2)) {
      const inicio = Math.max(from, cursor.getTime());
      const fin = Math.min(to, siguienteDia.getTime());
      if (fin > inicio) {
        total += (fin - inicio) / MS_PER_DAY;
      }
    }
    cursor = siguienteDia;
  }

  return Math.max(0, Math.round(total * 100) / 100);
}

/** Diferencia en días calendario (fraccionaria, 2 decimales). */
export function diffDiasCalendario(
  from: number | null | undefined,
  to: number | null | undefined,
): number | null {
  if (!from || !to) return null;
  if (to <= from) return 0;
  return Math.round(((to - from) / MS_PER_DAY) * 100) / 100;
}
