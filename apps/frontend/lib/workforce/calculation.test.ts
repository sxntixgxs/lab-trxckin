import { describe, expect, it } from 'vitest';
import { calculateWeek, DEFAULT_POLICY, emptyTotals, formatMinutes, validateSchedule } from './calculation';
import { addDays, bogotaTimestamp } from './dates';
import type { CalculationInput, CalculationResult, Interval } from './types';

const date = '2026-09-21'; // Monday, non-holiday.
const interval = (start: string, end: string, day = date): Interval => ({
  start: bogotaTimestamp(day, start),
  end: bogotaTimestamp(end <= start ? addDays(day, 1) : day, end),
});
function day(blocks: Interval[], overrides: Partial<CalculationInput> = {}): CalculationInput {
  return {
    id: 'jornada',
    date,
    blocks,
    agreement: { dailyMinutes: 480, weeklyMinutes: 2_520, restDay: 0 },
    policy: { ...DEFAULT_POLICY },
    ...overrides,
  };
}
const result = (input: CalculationInput) => calculateWeek([input])[0];
const ordinary = (r: CalculationResult) =>
  r.totals.ordinaryDay + r.totals.ordinaryNight + r.totals.restDay + r.totals.restNight;
const extra = (r: CalculationResult) => r.totalMinutes - ordinary(r);

describe('workforce classification', () => {
  it('splits the 06:00 and 19:00 boundaries exactly', () => {
    const r = result(day([interval('05:00', '07:00'), interval('18:00', '20:00')]));
    expect(r.totals).toEqual({ ...emptyTotals(), ordinaryDay: 120, ordinaryNight: 120 });
    expect(r.totalMinutes).toBe(240);
  });

  it("uses the employee's agreed daily hours and does not round extras to 30", () => {
    const r = result(
      day([interval('08:00', '14:17')], {
        mealOverrideMinutes: 0,
        agreement: { dailyMinutes: 360, weeklyMinutes: 2_520, restDay: 0 },
      }),
    );
    expect(r.totals.ordinaryDay).toBe(360);
    expect(r.totals.extraDay).toBe(17);
  });

  it('cannot turn hours beyond the policy cap into ordinary hours with a longer agreement', () => {
    const r = result(
      day([interval('08:00', '17:00')], {
        mealOverrideMinutes: 0,
        agreement: { dailyMinutes: 600, weeklyMinutes: 3_000, restDay: 0 },
      }),
    );
    expect(ordinary(r)).toBe(480);
    expect(extra(r)).toBe(60);
  });

  it('carries complete elapsed minutes across second offsets and category boundaries', () => {
    const r = result(day([interval('18:59:30', '20:00:30')]));
    expect(r.totalMinutes).toBe(61);
    expect(r.totals.ordinaryNight).toBe(61);
    expect(Object.values(r.totals).reduce((a, b) => a + b, 0)).toBe(61);
    expect(result(day([interval('08:00:30', '09:00:29')])).totalMinutes).toBe(59);
  });

  it('carries fractional elapsed minutes between separated blocks', () => {
    const r = result(day([interval('08:00:00', '08:00:40'), interval('09:00:00', '09:00:40')]));
    expect(r.totalMinutes).toBe(1);
    expect(r.totals.ordinaryDay).toBe(1);
  });

  it('keeps one daily counter across midnight and reports excess actual work', () => {
    const d = '2026-09-25';
    const r = result(day([interval('18:00', '04:30', d)], { date: d, mealOverrideMinutes: 0 }));
    expect(r.totals).toEqual({ ...emptyTotals(), ordinaryDay: 60, ordinaryNight: 420, extraNight: 150 });
    expect(r.incidents).toContain('Supera el límite de 2 h 00 min extra en la jornada.');
  });

  it('combines all split blocks into the same ordinary daily allowance', () => {
    const r = result(
      day([interval('06:00', '09:00'), interval('11:00', '14:00'), interval('18:00', '21:00')], {
        mealOverrideMinutes: 0,
      }),
    );
    expect(r.totals).toEqual({ ...emptyTotals(), ordinaryDay: 420, ordinaryNight: 60, extraNight: 60 });
  });

  it('uses custom rest weekdays and counts a coincident public holiday once', () => {
    const holiday = '2026-07-20'; // Monday and national holiday.
    const r = result(
      day([interval('08:00', '10:00', holiday)], {
        date: holiday,
        agreement: { dailyMinutes: 480, weeklyMinutes: 2_520, restDay: 1 },
      }),
    );
    expect(r.totals).toEqual({ ...emptyTotals(), restDay: 120 });
    const sunday = '2026-09-20';
    expect(
      result(
        day([interval('08:00', '10:00', sunday)], {
          date: sunday,
          agreement: { dailyMinutes: 480, weeklyMinutes: 2_520, restDay: 1 },
        }),
      ).totals.ordinaryDay,
    ).toBe(120);
  });

  it('splits rest-day classification at midnight', () => {
    const saturday = '2026-09-26';
    const r = result(day([interval('23:00', '02:00', saturday)], { date: saturday }));
    expect(r.totals.ordinaryNight).toBe(60);
    expect(r.totals.restNight).toBe(120);
  });

  it('preserves the original inputs and returns results in input order', () => {
    const first = day([interval('08:00', '09:00')], { id: 'monday' });
    const next = day([interval('08:00', '09:00', addDays(date, 1))], { id: 'tuesday', date: addDays(date, 1) });
    const inputs = [next, first];
    const copy = structuredClone(inputs);
    expect(calculateWeek(inputs).map((r) => r.id)).toEqual(['tuesday', 'monday']);
    expect(inputs).toEqual(copy);
  });
});

describe('meal placement and break union', () => {
  it('does not deduct at exactly six hours, and deducts once above that threshold', () => {
    expect(result(day([interval('08:00', '14:00')])).mealMinutes).toBe(0);
    const r = result(day([interval('08:00', '14:01')]));
    expect(r.mealMinutes).toBe(60);
    expect(r.totalMinutes).toBe(301);
  });

  it('takes a placed meal from the correct night category', () => {
    const r = result(day([interval('16:00', '23:00')]));
    expect(r.mealMinutes).toBe(60);
    expect(r.totals.ordinaryDay).toBe(180);
    expect(r.totals.ordinaryNight).toBe(180);
  });

  it('does not deduct a meal gap already absent from split blocks', () => {
    const r = result(day([interval('08:00', '12:00'), interval('13:00', '17:00')]));
    expect(r.totalMinutes).toBe(480);
    expect(r.mealMinutes).toBe(0);
  });

  it('unions overlapping explicit and automatic breaks', () => {
    const r = result(
      day([interval('08:00', '17:00')], { breaks: [interval('12:00', '12:30'), interval('12:20', '13:00')] }),
    );
    expect(r.mealMinutes).toBe(60);
    expect(r.totalMinutes).toBe(480);
  });

  it('deducts only the uncovered part of a meal that intersects a gap', () => {
    const r = result(day([interval('08:00', '12:30'), interval('13:00', '17:00')]));
    expect(r.grossMinutes).toBe(510);
    expect(r.mealMinutes).toBe(30);
    expect(r.totalMinutes).toBe(480);
  });

  it('supports a zero override while retaining explicit unpaid breaks', () => {
    const r = result(
      day([interval('08:00', '17:00')], { mealOverrideMinutes: 0, breaks: [interval('12:00', '12:15')] }),
    );
    expect(r.mealMinutes).toBe(15);
    expect(r.totalMinutes).toBe(525);
  });
});

describe('weekly ordinary and extra limits', () => {
  it('counts ordinary minutes up to 42 hours without counting daily extra twice', () => {
    const inputs = Array.from({ length: 6 }, (_, index) => {
      const d = addDays('2026-09-20', index);
      return day([interval('07:00', index < 5 ? '17:00' : '11:00', d)], { id: d, date: d, mealOverrideMinutes: 0 });
    });
    const results = calculateWeek(inputs);
    expect(results.reduce((sum, r) => sum + ordinary(r), 0)).toBe(2_520);
    expect(results.reduce((sum, r) => sum + extra(r), 0)).toBe(720);
    expect(results.flatMap((r) => r.incidents)).toEqual([]);
    expect(results[5].totals.extraDay).toBe(120);
  });

  it('reports >12 weekly extra hours on every affected jornada', () => {
    const inputs = Array.from({ length: 6 }, (_, index) => {
      const d = addDays('2026-09-20', index);
      return day([interval('07:00', '17:00', d)], { id: d, date: d, mealOverrideMinutes: 0 });
    });
    const results = calculateWeek(inputs);
    expect(results.every((r) => r.incidents.some((i) => i.includes('semana del 2026-09-20')))).toBe(true);
    expect(results[5].incidents.some((i) => i.includes('en la jornada'))).toBe(true);
  });

  it('resets weekly ordinary hours on Sunday while retaining an overnight daily counter', () => {
    const inputs = Array.from({ length: 6 }, (_, index) => {
      const d = addDays('2026-09-20', index);
      return day([interval('07:00', '14:00', d)], { id: d, date: d, mealOverrideMinutes: 0 });
    });
    inputs.push(
      day([interval('22:00', '06:00', '2026-09-26')], { id: 'overnight', date: '2026-09-26', mealOverrideMinutes: 0 }),
    );
    const r = calculateWeek(inputs).at(-1)!;
    expect(r.totals.extraNight).toBe(120);
    expect(r.totals.restNight).toBe(360);
    expect(r.totalMinutes).toBe(480);
  });

  it("uses each jornada's persisted policy version", () => {
    const r = result(
      day([interval('18:00', '20:00')], {
        policy: { ...DEFAULT_POLICY, version: 'company-v2', nightStartMinute: 1_080 },
      }),
    );
    expect(r.policyVersion).toBe('company-v2');
    expect(r.totals.ordinaryNight).toBe(120);
  });
});

describe('schedule validation', () => {
  it('detects cross-midnight overlaps with the adjacent jornada', () => {
    const inputs = [
      day([interval('22:00', '03:00')]),
      day([interval('02:00', '06:00', addDays(date, 1))], { id: 'next', date: addDays(date, 1) }),
    ];
    expect(validateSchedule(inputs).filter((error) => error.includes('superpuestos'))).toHaveLength(2);
  });

  it('allows adjacent blocks without overlap', () => {
    expect(validateSchedule([day([interval('08:00', '10:00'), interval('10:00', '12:00')])])).toEqual([]);
  });

  it('rejects more than three blocks and invalid policy values', () => {
    expect(
      validateSchedule([
        day([
          interval('08:00', '09:00'),
          interval('10:00', '11:00'),
          interval('12:00', '13:00'),
          interval('14:00', '15:00'),
        ]),
      ]).join(),
    ).toContain('tres bloques');
    expect(
      result(day([interval('08:00', '09:00')], { policy: { ...DEFAULT_POLICY, ordinaryDailyMinutes: Number.NaN } }))
        .incidents,
    ).toContain('Acuerdo o política de cálculo inválidos.');
  });

  it('retains incidents instead of inventing totals for malformed intervals', () => {
    const r = result(day([{ start: Number.NaN, end: 0 }]));
    expect(r.totalMinutes).toBe(0);
    expect(r.incidents).toHaveLength(1);
  });

  it('rejects policy snapshots that exceed the supported legal regime', () => {
    for (const patch of [
      { ordinaryDailyMinutes: 481 },
      { ordinaryWeeklyMinutes: 2_521 },
      { maxExtraDailyMinutes: 121 },
      { maxExtraWeeklyMinutes: 721 },
    ]) {
      const r = result(day([interval('08:00', '09:00')], { policy: { ...DEFAULT_POLICY, ...patch } }));
      expect(r.incidents).toContain('Acuerdo o política de cálculo inválidos.');
      expect(r.totalMinutes).toBe(0);
    }
  });

  it('provides stable minute formatting', () => {
    expect(formatMinutes(137)).toBe('2 h 17 min');
    expect(formatMinutes(-5)).toBe('−0 h 05 min');
    expect(formatMinutes(Number.NaN)).toBe('—');
  });
});
