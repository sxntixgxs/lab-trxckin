import { calculateWeek } from '@/lib/workforce/calculation';
import type { CalculationPolicy, CalculationResult, ScheduleChange, WorkforceSnapshot } from '@/lib/workforce/types';

export const scheduleCellKey = (employeeId: string, date: string) => `${employeeId}|${date}`;

/** Keep adjacent days and frozen policies, exactly as the server's whole-week calculation does. */
export function calculateSchedulePreview(data: WorkforceSnapshot, drafts: Record<string, ScheduleChange>) {
  const output = new Map<string, CalculationResult>();
  for (const employee of data.employees) {
    const stored = data.schedules.filter((schedule) => schedule.employeeId === employee.id);
    const dates = new Set([
      ...stored.map((day) => day.date),
      ...Object.values(drafts)
        .filter((day) => day.employeeId === employee.id)
        .map((day) => day.date),
    ]);
    const inputs = [...dates].map((date) => {
      const persisted = stored.find((day) => day.date === date);
      const day = drafts[scheduleCellKey(employee.id, date)] ?? persisted!;
      const policy =
        persisted?.policy ??
        ([...data.settings.policies]
          .filter((p) => p.effectiveFrom <= date)
          .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0] as CalculationPolicy);
      return {
        id: scheduleCellKey(employee.id, date),
        date,
        blocks: day.blocks,
        agreement: persisted?.agreement ?? employee.agreement,
        policy,
      };
    });
    for (const result of calculateWeek(inputs)) output.set(result.id, result);
  }
  return output;
}

export function selectedRectangle(employeeIds: string[], dates: string[], anchor: string, end: string) {
  const [firstEmployee, firstDate] = anchor.split('|');
  const [lastEmployee, lastDate] = end.split('|');
  const first = employeeIds.indexOf(firstEmployee),
    last = employeeIds.indexOf(lastEmployee);
  if (first < 0 || last < 0) return [];
  const [from, to] = [firstDate, lastDate].sort();
  return employeeIds
    .slice(Math.min(first, last), Math.max(first, last) + 1)
    .flatMap((id) => dates.filter((date) => date >= from && date <= to).map((date) => scheduleCellKey(id, date)));
}
