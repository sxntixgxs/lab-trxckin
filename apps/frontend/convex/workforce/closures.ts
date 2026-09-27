import type { MutationCtx } from '../_generated/server';
import type { CommandResult, WorkforceCommand } from '../../lib/workforce/types';
import { addDays, bogotaDate, periodFor } from '../../lib/workforce/dates';
import { audit, bounded, closureFor, groupAccess, requireHr, revision, type Access } from './common';

export async function closeCommand(
  ctx: MutationCtx,
  access: Access,
  command: Extract<WorkforceCommand, { type: 'closePeriod' | 'reopenPeriod' }>,
  now: number,
): Promise<CommandResult> {
  const { companyId, actor } = access;
  await groupAccess(ctx, access, command.groupId, 'workforce/attendance');
  const period = periodFor(command.periodStart);
  if (period.start !== command.periodStart || period.end < access.settings.launchDate)
    throw new Error('Seleccione una quincena válida desde el lanzamiento.');
  const today = bogotaDate(now);
  if (period.start > today) throw new Error('No puede cerrar una quincena futura.');
  const closure = await closureFor(ctx, companyId, command.groupId, period.start);
  revision(closure, command.expectedRevision);
  if (command.type === 'reopenPeriod') {
    requireHr(access, 'workforce/attendance');
    if (!closure || closure.state !== 'CLOSED') throw new Error('Solo se puede reabrir una quincena cerrada.');
    await ctx.db.patch('wfClosures', closure._id, {
      state: 'CORRECTION_TH',
      revision: closure.revision + 1,
      reason: command.reason,
    });
    await audit(ctx, access, command.type, closure._id, command.reason, { period }, now);
    return {
      ok: true,
      message: 'Quincena reabierta para correcciones de TH.',
      recordId: closure._id,
      revision: closure.revision + 1,
    };
  }
  if (closure?.state === 'CLOSED') throw new Error('La quincena ya está cerrada.');
  if (closure?.state === 'CORRECTION_TH' && !access.hr) throw new Error('Solo TH puede cerrar una quincena reabierta.');
  if (!access.hr && today > addDays(period.end, 5))
    throw new Error('La ventana de cinco días terminó. Talento humano debe finalizar el cierre.');
  if (!closure || closure.state === 'OPEN') {
    const next = {
      companyId,
      groupId: command.groupId,
      periodStart: period.start,
      periodEnd: period.end,
      state: 'CLOSING' as const,
      revision: (closure?.revision ?? 0) + 1,
      reason: command.reason,
    };
    const id = closure
      ? (await ctx.db.replace('wfClosures', closure._id, next), closure._id)
      : await ctx.db.insert('wfClosures', next);
    await audit(ctx, access, 'startClosing', id, command.reason, { period }, now);
    return {
      ok: true,
      message: 'Revisión de cierre iniciada. Resuelva los pendientes antes de finalizar.',
      recordId: id,
      revision: next.revision,
    };
  }
  if (today <= period.end) throw new Error('La quincena debe terminar antes de finalizar su cierre.');
  const schedules = bounded(
    await ctx.db
      .query('wfSchedules')
      .withIndex('by_companyId_and_groupId_and_date', (q) =>
        q.eq('companyId', companyId).eq('groupId', command.groupId).gte('date', period.start).lte('date', period.end),
      )
      .take(2501),
  );
  const attendance = bounded(
    await ctx.db
      .query('wfAttendance')
      .withIndex('by_companyId_and_groupId_and_date', (q) =>
        q.eq('companyId', companyId).eq('groupId', command.groupId).gte('date', period.start).lte('date', period.end),
      )
      .take(2501),
  );
  const pending = attendance.filter((a) => a.status !== 'REVIEWED' || a.openEntry !== undefined || a.incidents.length);
  const missing = schedules.filter(
    (s) => !s.isRest && s.blocks.length && !attendance.some((a) => a.employeeId === s.employeeId && a.date === s.date),
  );
  if (pending.length || missing.length)
    throw new Error(
      `El cierre tiene ${pending.length} jornadas sin resolver y ${missing.length} turnos sin asistencia. Complete la conciliación.`,
    );
  await ctx.db.patch('wfClosures', closure._id, {
    state: 'CLOSED',
    revision: closure.revision + 1,
    reason: command.reason,
    closedAt: now,
    closedBy: actor.userId,
  });
  await audit(
    ctx,
    access,
    command.type,
    closure._id,
    command.reason,
    {
      period,
      attendanceIds: attendance.map((a) => a._id),
      totals: attendance.map((a) => ({
        employeeId: a.employeeId,
        date: a.date,
        actual: a.actual,
        policy: a.policy.version,
      })),
    },
    now,
  );
  return {
    ok: true,
    message: 'Quincena cerrada. Sus marcaciones y cálculos quedan protegidos.',
    recordId: closure._id,
    revision: closure.revision + 1,
  };
}
