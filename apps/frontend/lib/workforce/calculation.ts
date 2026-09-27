import { colombianHolidayKeysForYear } from '../../convex/lib/colombiaHolidays';
import { addDays, bogotaDate, bogotaMinute, bogotaTimestamp, weekday, weekStart } from './dates';
import type {
  CalculationInput,
  CalculationPolicy,
  CalculationResult,
  HourCategory,
  HourTotals,
  Interval,
} from './types';

const MINUTE = 60_000;

// Template for launch-forward data only. effectiveFrom is the first full
// Sunday-start week after the 42-hour transition; it is not the statutory
// transition date. Company initialization replaces it with its launch week.
export const DEFAULT_POLICY: CalculationPolicy = {
  version: 'CO-2026-42H-v1',
  effectiveFrom: '2026-07-19',
  ordinaryDailyMinutes: 480,
  ordinaryWeeklyMinutes: 2_520,
  nightStartMinute: 1_140,
  nightEndMinute: 360,
  mealAfterMinutes: 360,
  mealMinutes: 60,
  mealOffsetMinutes: 240,
  maxExtraDailyMinutes: 120,
  maxExtraWeeklyMinutes: 720,
};

export const CATEGORY_LABELS: Record<HourCategory, string> = {
  ordinaryDay: 'Ordinaria diurna',
  ordinaryNight: 'Ordinaria nocturna',
  extraDay: 'Extra diurna',
  extraNight: 'Extra nocturna',
  restDay: 'Descanso/festivo diurna',
  restNight: 'Descanso/festivo nocturna',
  restExtraDay: 'Extra descanso/festivo diurna',
  restExtraNight: 'Extra descanso/festivo nocturna',
};

export function emptyTotals(): HourTotals {
  return {
    ordinaryDay: 0,
    ordinaryNight: 0,
    extraDay: 0,
    extraNight: 0,
    restDay: 0,
    restNight: 0,
    restExtraDay: 0,
    restExtraNight: 0,
  };
}

export function formatMinutes(minutes: number): string {
  if (!Number.isFinite(minutes)) return '—';
  const whole = Math.floor(Math.abs(minutes));
  return `${minutes < 0 ? '−' : ''}${Math.floor(whole / 60)} h ${String(whole % 60).padStart(2, '0')} min`;
}

function union(intervals: Interval[]): Interval[] {
  const sorted = intervals.map((interval) => ({ ...interval })).sort((a, b) => a.start - b.start);
  const merged: Interval[] = [];
  for (const interval of sorted) {
    const last = merged.at(-1);
    if (last && interval.start <= last.end) last.end = Math.max(last.end, interval.end);
    else merged.push(interval);
  }
  return merged;
}

function subtract(blocks: Interval[], exclusions: Interval[]): Interval[] {
  const result: Interval[] = [];
  for (const block of blocks) {
    let cursor = block.start;
    for (const exclusion of exclusions) {
      if (exclusion.end <= cursor || exclusion.start >= block.end) continue;
      if (exclusion.start > cursor) result.push({ start: cursor, end: exclusion.start });
      cursor = Math.max(cursor, exclusion.end);
      if (cursor >= block.end) break;
    }
    if (cursor < block.end) result.push({ start: cursor, end: block.end });
  }
  return result;
}

function validInterval(interval: Interval): boolean {
  return (
    Number.isFinite(interval.start) &&
    Number.isFinite(interval.end) &&
    Math.abs(interval.start) <= 8_640_000_000_000_000 &&
    Math.abs(interval.end) <= 8_640_000_000_000_000 &&
    interval.end > interval.start &&
    interval.end - interval.start <= 31 * 86_400_000
  );
}

function invalidConfiguration(input: CalculationInput): boolean {
  const { agreement: a, policy: p } = input;
  const positive = [a.dailyMinutes, a.weeklyMinutes, p.ordinaryDailyMinutes, p.ordinaryWeeklyMinutes];
  const nonnegative = [
    p.mealAfterMinutes,
    p.mealMinutes,
    p.mealOffsetMinutes,
    p.maxExtraDailyMinutes,
    p.maxExtraWeeklyMinutes,
  ];
  return (
    positive.some((n) => !Number.isInteger(n) || n <= 0) ||
    nonnegative.some((n) => !Number.isInteger(n) || n < 0) ||
    p.ordinaryDailyMinutes > 480 ||
    p.ordinaryWeeklyMinutes > 2_520 ||
    p.maxExtraDailyMinutes > 120 ||
    p.maxExtraWeeklyMinutes > 720 ||
    !Number.isInteger(a.restDay) ||
    a.restDay < 0 ||
    a.restDay > 6 ||
    [p.nightStartMinute, p.nightEndMinute].some((n) => !Number.isInteger(n) || n < 0 || n >= 1_440) ||
    (input.mealOverrideMinutes !== undefined &&
      (!Number.isInteger(input.mealOverrideMinutes) ||
        input.mealOverrideMinutes < 0 ||
        input.mealOverrideMinutes > 1_440))
  );
}

function category(extra: boolean, night: boolean, rest: boolean): HourCategory {
  if (rest) return extra ? (night ? 'restExtraNight' : 'restExtraDay') : night ? 'restNight' : 'restDay';
  return extra ? (night ? 'extraNight' : 'extraDay') : night ? 'ordinaryNight' : 'ordinaryDay';
}

/** Calculate all supplied jornadas for ONE employee, across every affected week.
 * Input order is preserved. The daily counter belongs to the jornada's date;
 * the weekly counter follows each instant's Bogotá calendar week.
 *
 * Source instants retain seconds. Classification splits at exact boundaries and
 * carries fractional minutes forward inside each jornada: one complete elapsed
 * minute is assigned to the category in which it completes. Thus totals never
 * lose seconds independently at each boundary or round extras to 30 minutes.
 */
export function calculateWeek(inputs: CalculationInput[]): CalculationResult[] {
  const results = inputs.map((input): CalculationResult => ({
    id: input.id,
    date: input.date,
    totalMinutes: 0,
    grossMinutes: 0,
    mealMinutes: 0,
    totals: emptyTotals(),
    incidents: [],
    policyVersion: input.policy.version,
  }));
  const work: Array<Interval & { index: number }> = [];
  const original: Array<Interval & { index: number }> = [];
  const addIncident = (index: number, message: string) => {
    if (!results[index].incidents.includes(message)) results[index].incidents.push(message);
  };

  inputs.forEach((input, index) => {
    try {
      bogotaTimestamp(input.date);
    } catch {
      addIncident(index, 'Fecha de jornada inválida.');
      return;
    }
    if (invalidConfiguration(input)) {
      addIncident(index, 'Acuerdo o política de cálculo inválidos.');
      return;
    }
    if (
      input.blocks.some((block) => !validInterval(block)) ||
      (input.breaks ?? []).some((block) => !validInterval(block))
    ) {
      addIncident(index, 'Intervalo inválido o de más de 31 días; requiere conciliación.');
      return;
    }
    const blocks = union(input.blocks);
    original.push(...input.blocks.map((block) => ({ ...block, index })));
    const grossMs = blocks.reduce((sum, block) => sum + block.end - block.start, 0);
    const exclusions = [...(input.breaks ?? [])];
    const meal =
      input.mealOverrideMinutes ?? (grossMs > input.policy.mealAfterMinutes * MINUTE ? input.policy.mealMinutes : 0);
    if (meal > 0 && blocks.length) {
      const start = blocks[0].start + input.policy.mealOffsetMinutes * MINUTE;
      exclusions.push({ start, end: start + meal * MINUTE });
    }
    // A gap already absent from blocks is not charged again. Explicit and
    // automatic breaks are unioned before subtraction for the same reason.
    const paid = subtract(blocks, union(exclusions));
    const netMs = paid.reduce((sum, block) => sum + block.end - block.start, 0);
    results[index].grossMinutes = Math.floor(grossMs / MINUTE);
    results[index].mealMinutes = Math.floor(grossMs / MINUTE) - Math.floor(netMs / MINUTE);
    work.push(...paid.map((block) => ({ ...block, index })));
  });

  original.sort((a, b) => a.start - b.start || a.end - b.end);
  for (let i = 0; i < original.length; i++) {
    for (let j = i + 1; j < original.length && original[j].start < original[i].end; j++) {
      addIncident(original[i].index, 'Hay bloques superpuestos en esta jornada o una jornada vecina.');
      addIncident(original[j].index, 'Hay bloques superpuestos en esta jornada o una jornada vecina.');
    }
  }

  const dailyWorked = new Map<string, number>();
  const dailyExtra = new Map<string, number>();
  const weeklyOrdinary = new Map<string, number>();
  const weeklyExtra = new Map<string, number>();
  const weekContributors = new Map<string, Set<number>>();
  const accumulated = inputs.map(() => 0);

  for (const block of work.sort((a, b) => a.start - b.start || a.index - b.index)) {
    const input = inputs[block.index];
    const { agreement, policy } = input;
    const dailyLimit = Math.min(agreement.dailyMinutes, policy.ordinaryDailyMinutes) * MINUTE;
    const weeklyLimit = Math.min(agreement.weeklyMinutes, policy.ordinaryWeeklyMinutes) * MINUTE;
    let cursor = block.start;
    while (cursor < block.end) {
      const date = bogotaDate(cursor);
      const midnight = bogotaTimestamp(date);
      const week = weekStart(date);
      const usedDaily = dailyWorked.get(input.date) ?? 0;
      const usedWeekly = weeklyOrdinary.get(week) ?? 0;
      const extra = usedDaily >= dailyLimit || usedWeekly >= weeklyLimit;
      let end = Math.min(block.end, bogotaTimestamp(addDays(date, 1)));
      for (const minute of [policy.nightStartMinute, policy.nightEndMinute]) {
        const boundary = midnight + minute * MINUTE;
        if (boundary > cursor) end = Math.min(end, boundary);
      }
      if (!extra) end = Math.min(end, cursor + dailyLimit - usedDaily, cursor + weeklyLimit - usedWeekly);
      const duration = end - cursor;
      const minute = bogotaMinute(cursor);
      const night =
        policy.nightStartMinute > policy.nightEndMinute
          ? minute >= policy.nightStartMinute || minute < policy.nightEndMinute
          : minute >= policy.nightStartMinute && minute < policy.nightEndMinute;
      const rest =
        weekday(date) === agreement.restDay || colombianHolidayKeysForYear(Number(date.slice(0, 4))).has(date);
      const previousMs = accumulated[block.index];
      accumulated[block.index] += duration;
      results[block.index].totals[category(extra, night, rest)] +=
        Math.floor(accumulated[block.index] / MINUTE) - Math.floor(previousMs / MINUTE);
      dailyWorked.set(input.date, usedDaily + duration);
      if (extra) {
        dailyExtra.set(input.date, (dailyExtra.get(input.date) ?? 0) + duration);
        weeklyExtra.set(week, (weeklyExtra.get(week) ?? 0) + duration);
      } else weeklyOrdinary.set(week, usedWeekly + duration);
      const contributors = weekContributors.get(week) ?? new Set<number>();
      contributors.add(block.index);
      weekContributors.set(week, contributors);
      cursor = end;
    }
  }

  inputs.forEach((input, index) => {
    results[index].totalMinutes = Math.floor(accumulated[index] / MINUTE);
    if ((dailyExtra.get(input.date) ?? 0) > input.policy.maxExtraDailyMinutes * MINUTE) {
      addIncident(
        index,
        `Supera el límite de ${formatMinutes(input.policy.maxExtraDailyMinutes)} extra en la jornada.`,
      );
    }
  });
  for (const [week, indices] of weekContributors) {
    const limit = Math.min(...Array.from(indices, (index) => inputs[index].policy.maxExtraWeeklyMinutes));
    if ((weeklyExtra.get(week) ?? 0) > limit * MINUTE) {
      for (const index of indices)
        addIncident(index, `Supera el límite de ${formatMinutes(limit)} extra en la semana del ${week}.`);
    }
  }
  return results;
}

/** Used to reject new schedules. Actual attendance is still calculated and
 * retained with its incidents, even if the supported limits were exceeded. */
export function validateSchedule(inputs: CalculationInput[]): string[] {
  const errors = new Set(
    calculateWeek(inputs).flatMap((result) => result.incidents.map((incident) => `${result.date}: ${incident}`)),
  );
  for (const input of inputs) {
    if (input.blocks.length > 3) errors.add(`${input.date}: Solo se permiten tres bloques por jornada.`);
    const blocks = input.blocks.filter(validInterval).toSorted((a, b) => a.start - b.start);
    if (blocks.length && bogotaDate(blocks[0].start) !== input.date)
      errors.add(`${input.date}: El primer bloque debe comenzar en la fecha de la jornada.`);
    if (blocks.length && blocks.at(-1)!.end - blocks[0].start > 24 * 60 * MINUTE)
      errors.add(`${input.date}: Una jornada no puede extenderse por más de 24 horas.`);
  }
  return [...errors];
}
