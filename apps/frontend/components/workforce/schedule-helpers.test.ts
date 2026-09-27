import { describe, expect, it } from 'vitest';
import { DEFAULT_POLICY, emptyTotals } from '@/lib/workforce/calculation';
import { bogotaTimestamp } from '@/lib/workforce/dates';
import type { ScheduleDay, WorkforceSnapshot } from '@/lib/workforce/types';
import { calculateSchedulePreview, selectedRectangle } from './schedule-helpers';

const agreement = { dailyMinutes: 480, weeklyMinutes: 2520, restDay: 0 };
const policy = { ...DEFAULT_POLICY, mealMinutes: 0 };
const employee = {
  id: 'e1',
  companyId: 1,
  code: 'T1',
  name: 'Prueba',
  job: 'Prueba',
  active: true,
  revision: 1,
  agreement,
};
function schedule(date: string, start: string, end: string, endDate = date): ScheduleDay {
  return {
    id: date,
    companyId: 1,
    employeeId: 'e1',
    groupId: 'g1',
    date,
    blocks: [
      { start: bogotaTimestamp(date, start), end: bogotaTimestamp(endDate, end), label: 'Turno', color: '#334455' },
    ],
    observation: '',
    isRest: false,
    revision: 1,
    agreement,
    policy,
    planned: {
      id: date,
      date,
      totalMinutes: 0,
      grossMinutes: 0,
      mealMinutes: 0,
      totals: emptyTotals(),
      incidents: [],
      policyVersion: policy.version,
    },
  };
}
function snapshot(schedules: ScheduleDay[]): WorkforceSnapshot {
  return {
    companyId: 1,
    from: '2026-09-20',
    to: '2026-10-03',
    employees: [employee],
    groups: [],
    memberships: [],
    sites: [],
    templates: [],
    schedules,
    attendance: [],
    marks: [],
    closures: [],
    settings: { companyId: 1, launchDate: '2026-09-20', hrUserIds: [], policies: [policy], revision: 1 },
    capabilities: { admin: true, hr: true, manage: true, userId: 'u1', userName: 'Prueba', permissions: [] },
  };
}
describe('schedule UI preview', () => {
  it('preserves the assigned agreement and policy when the employee and settings change', () => {
    const day = schedule('2026-09-21', '07:00', '14:00');
    const data = snapshot([day]);
    data.employees = [{ ...employee, agreement: { ...agreement, dailyMinutes: 360 } }];
    data.settings.policies = [{ ...policy, version: 'new', mealMinutes: 60 }];
    const result = calculateSchedulePreview(data, {}).get('e1|2026-09-21')!;
    expect(result.totalMinutes).toBe(420);
    expect(result.totals.ordinaryDay).toBe(420);
    expect(result.totals.extraDay).toBe(0);
    expect(result.policyVersion).toBe(policy.version);
  });
  it('includes a preceding Saturday overnight block in the Sunday weekly calculation', () => {
    const saturday = schedule('2026-09-26', '22:00', '01:00', '2026-09-27');
    const sunday = schedule('2026-09-27', '07:00', '08:00');
    saturday.agreement = sunday.agreement = { ...agreement, weeklyMinutes: 60, restDay: 1 };
    const result = calculateSchedulePreview(snapshot([saturday, sunday]), {}).get('e1|2026-09-27')!;
    expect(result.totals.extraDay).toBe(60);
  });
});
describe('rectangular calendar selection', () => {
  it('supports reverse rows and dates without selecting unrelated cells', () => {
    expect(
      selectedRectangle(['a', 'b', 'c'], ['2026-09-20', '2026-09-21', '2026-09-22'], 'c|2026-09-22', 'b|2026-09-21'),
    ).toEqual(['b|2026-09-21', 'b|2026-09-22', 'c|2026-09-21', 'c|2026-09-22']);
  });
  it('does not create a range when the anchor employee was filtered away', () => {
    expect(selectedRectangle(['b'], ['2026-09-20'], 'a|2026-09-20', 'b|2026-09-20')).toEqual([]);
  });
});
