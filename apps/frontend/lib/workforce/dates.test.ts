import { describe, expect, it } from 'vitest';
import {
  addDays,
  bogotaDate,
  bogotaMinute,
  bogotaTimestamp,
  datesBetween,
  periodFor,
  weekday,
  weekStart,
} from './dates';

describe('Bogotá calendar helpers', () => {
  it('preserves local dates independently of the machine time zone', () => {
    const timestamp = Date.parse('2026-09-22T04:59:59Z');
    expect(bogotaDate(timestamp)).toBe('2026-09-21');
    expect(bogotaMinute(timestamp)).toBe(1_439);
    expect(bogotaTimestamp('2026-09-21', '23:59:59')).toBe(timestamp);
    expect(bogotaTimestamp('2026-09-22')).toBe(Date.parse('2026-09-22T05:00:00Z'));
  });

  it('anchors all days Sunday through Saturday to the same week', () => {
    for (const date of datesBetween('2026-09-20', '2026-09-26')) expect(weekStart(date)).toBe('2026-09-20');
    expect(weekStart('2026-09-27')).toBe('2026-09-27');
    expect(weekday('2026-09-20')).toBe(0);
  });

  it('finds quincenas including leap February and year transitions', () => {
    expect(periodFor('2026-09-15')).toEqual({ start: '2026-09-01', end: '2026-09-15' });
    expect(periodFor('2026-09-16')).toEqual({ start: '2026-09-16', end: '2026-09-30' });
    expect(periodFor('2028-02-16').end).toBe('2028-02-29');
    expect(periodFor('2027-02-16').end).toBe('2027-02-28');
    expect(periodFor('2026-12-31').end).toBe('2026-12-31');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('returns inclusive ranges and empty reversed ranges', () => {
    expect(datesBetween('2026-09-30', '2026-10-02')).toEqual(['2026-09-30', '2026-10-01', '2026-10-02']);
    expect(datesBetween('2026-10-02', '2026-09-30')).toEqual([]);
  });

  it('rejects normalized invalid dates and times', () => {
    expect(() => bogotaTimestamp('2026-02-30', '12:00')).toThrow();
    expect(() => bogotaTimestamp('2026-02-20', '24:00')).toThrow();
    expect(() => bogotaTimestamp('2026-02-20', '10:60')).toThrow();
    expect(() => addDays('2026-02-20', 0.5)).toThrow();
    expect(() => datesBetween('2026-01-01', '2037-01-01')).toThrow();
  });
});
