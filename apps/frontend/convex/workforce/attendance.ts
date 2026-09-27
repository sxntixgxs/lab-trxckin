import type { Doc } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import type { CalculationInput, CommandResult, Interval, WorkforceCommand } from '../../lib/workforce/types';
import { calculateWeek } from '../../lib/workforce/calculation';
import { addDays, bogotaDate, bogotaTimestamp, weekStart } from '../../lib/workforce/dates';
import { validateGps } from '../../lib/workforce/geo';
import {
  audit,
  bounded,
  stableJson,
  closureFor,
  dto,
  editable,
  groupAccess,
  membershipAt,
  policyAt,
  record,
  requirePermission,
  revision,
  type Access,
} from './common';

export const STRUCTURAL = [
  'ENTRADA_SIN_SALIDA',
  'SALIDA_SIN_ENTRADA',
  'ENTRADA_DUPLICADA',
  'SALIDA_ANTERIOR_ENTRADA',
  'JORNADA_SUPERA_24H',
  'SIN_MARCACIONES',
];
function pairMarks(marks: Doc<'wfMarks'>[]) {
  const blocks: Interval[] = [];
  const incidents: string[] = [];
  let openEntry: number | undefined;
  for (const mark of marks
    .filter((m) => !m.excluded)
    .sort(
      (a, b) =>
        (a.effectiveTimestamp ?? a.timestamp) - (b.effectiveTimestamp ?? b.timestamp) ||
        a._creationTime - b._creationTime,
    )) {
    const timestamp = mark.effectiveTimestamp ?? mark.timestamp;
    const kind = mark.effectiveKind ?? mark.kind;
    if (kind === 'IN') {
      if (openEntry !== undefined) incidents.push('ENTRADA_DUPLICADA');
      else openEntry = timestamp;
    } else if (openEntry === undefined) incidents.push('SALIDA_SIN_ENTRADA');
    else {
      if (timestamp <= openEntry) incidents.push('SALIDA_ANTERIOR_ENTRADA');
      else if (timestamp - openEntry > 86_400_000) incidents.push('JORNADA_SUPERA_24H');
      else blocks.push({ start: openEntry, end: timestamp });
      openEntry = undefined;
    }
  }
  if (openEntry !== undefined) incidents.push('ENTRADA_SIN_SALIDA');
  if (!marks.some((m) => !m.excluded)) incidents.push('SIN_MARCACIONES');
  return { blocks, incidents: [...new Set(incidents)], openEntry };
}

/** Rebuild from immutable originals + effective corrections, then classify whole worker weeks. */
export async function rebuildAttendanceWeek(
  ctx: MutationCtx,
  access: Access,
  employeeId: string,
  week: string,
  now: number,
) {
  const { companyId } = access;
  const from = addDays(week, -1),
    to = addDays(week, 13);
  const employee = await record(ctx, 'wfEmployees', employeeId, companyId);
  const existing = bounded(
    await ctx.db
      .query('wfAttendance')
      .withIndex('by_companyId_and_employeeId_and_date', (q) =>
        q.eq('companyId', companyId).eq('employeeId', employeeId).gte('date', from).lte('date', to),
      )
      .take(23),
    22,
  );
  const schedules = bounded(
    await ctx.db
      .query('wfSchedules')
      .withIndex('by_companyId_and_employeeId_and_date', (q) =>
        q.eq('companyId', companyId).eq('employeeId', employeeId).gte('date', from).lte('date', to),
      )
      .take(23),
    22,
  );
  const marks = bounded(
    await ctx.db
      .query('wfMarks')
      .withIndex('by_companyId_and_employeeId_and_date', (q) =>
        q.eq('companyId', companyId).eq('employeeId', employeeId).gte('date', from).lte('date', to),
      )
      .take(1501),
    1500,
  );
  const dates = [...new Set([...existing.map((d) => d.date), ...marks.map((m) => m.date)])].sort();
  const drafts = [];
  const inputs: CalculationInput[] = [];
  for (const date of dates) {
    const old = existing.find((d) => d.date === date);
    const schedule = schedules.find((s) => s.date === date);
    const dayMarks = marks.filter((m) => m.date === date);
    bounded(dayMarks, 100);
    const pairs = pairMarks(dayMarks);
    const groupId = schedule?.groupId ?? old?.groupId ?? dayMarks[0]?.groupId;
    if (!groupId) continue;
    const agreement = old?.agreement ?? schedule?.agreement ?? employee.agreement;
    const policy = old?.policy ?? schedule?.policy ?? policyAt(access.settings, date);
    const incidents = [...pairs.incidents];
    if (!schedule || schedule.isRest || !schedule.blocks.length) incidents.push('SIN_PROGRAMACION');
    else if (
      !pairs.incidents.length &&
      stableJson(
        pairs.blocks.map((b) => ({ start: Math.floor(b.start / 60_000), end: Math.floor(b.end / 60_000) })),
      ) !==
        stableJson(
          [...schedule.blocks]
            .sort((a, b) => a.start - b.start)
            .map((b) => ({ start: b.start / 60_000, end: b.end / 60_000 })),
        )
    )
      incidents.push('DIFERENCIA_HORARIO');
    const draft = { old, schedule, date, dayMarks, groupId, agreement, policy, pairs, incidents };
    drafts.push(draft);
    inputs.push({
      id: `${employeeId}:${date}`,
      date,
      blocks: pairs.incidents.length ? [] : pairs.blocks,
      agreement,
      policy,
      ...(old?.mealOverrideMinutes !== undefined ? { mealOverrideMinutes: old.mealOverrideMinutes } : {}),
    });
  }
  const calculated = calculateWeek(inputs);
  const open: Array<{ attendanceId: string; date: string; groupId: string; entryTimestamp: number }> = [];
  for (const draft of drafts) {
    const actual = calculated.find((r) => r.date === draft.date)!;
    const { old, pairs, date, groupId, agreement, policy, schedule } = draft;
    const incidents = [...new Set([...draft.incidents, ...actual.incidents])];
    const next = {
      companyId,
      employeeId,
      groupId,
      date,
      ...(schedule ? { scheduleId: String(schedule._id), scheduleRevision: schedule.revision } : {}),
      blocks: pairs.blocks,
      ...(pairs.openEntry !== undefined ? { openEntry: pairs.openEntry } : {}),
      ...(old?.mealOverrideMinutes !== undefined ? { mealOverrideMinutes: old.mealOverrideMinutes } : {}),
      agreement,
      policy,
      actual,
      markIds: draft.dayMarks.map((m) => String(m._id)),
    };
    const unchanged =
      old &&
      stableJson({
        blocks: old.blocks,
        openEntry: old.openEntry,
        actual: old.actual,
        markIds: old.markIds,
        scheduleId: old.scheduleId,
        scheduleRevision: old.scheduleRevision,
        groupId: old.groupId,
      }) ===
        stableJson({
          blocks: next.blocks,
          openEntry: pairs.openEntry,
          actual,
          markIds: next.markIds,
          scheduleId: next.scheduleId,
          scheduleRevision: next.scheduleRevision,
          groupId,
        });
    let attendanceId = old?._id;
    const closure = old ? await closureFor(ctx, companyId, groupId, date) : null;
    const sameClosedAmounts =
      old &&
      closure?.state === 'CLOSED' &&
      stableJson({ ...old.actual, incidents: [] }) === stableJson({ ...actual, incidents: [] }) &&
      stableJson(old.blocks) === stableJson(pairs.blocks) &&
      old.openEntry === pairs.openEntry &&
      stableJson(old.markIds) === stableJson(next.markIds) &&
      old.scheduleRevision === next.scheduleRevision;
    if (!unchanged && date >= week && !sameClosedAmounts) {
      await editable(ctx, access, groupId, date, now);
      const data = { ...next, incidents, status: 'PENDING' as const, revision: (old?.revision ?? 0) + 1 };
      if (old) await ctx.db.replace('wfAttendance', old._id, data);
      else attendanceId = await ctx.db.insert('wfAttendance', data);
    }
    if (pairs.openEntry !== undefined && attendanceId)
      open.push({ attendanceId, date, groupId, entryTimestamp: pairs.openEntry });
  }
  const session = await ctx.db
    .query('wfSessions')
    .withIndex('by_companyId_and_employeeId', (q) => q.eq('companyId', companyId).eq('employeeId', employeeId))
    .unique();
  const outside = session && (session.date < from || session.date > to);
  if (open.length > 1 || (outside && open.length))
    throw new Error('El trabajador tiene otra entrada abierta. Resuelva la sesión antes de registrar otra.');
  if (open.length) {
    if (session) await ctx.db.replace('wfSessions', session._id, { companyId, employeeId, ...open[0] });
    else await ctx.db.insert('wfSessions', { companyId, employeeId, ...open[0] });
  } else if (session && !outside) await ctx.db.delete('wfSessions', session._id);
}

async function dayFor(ctx: MutationCtx, companyId: number, employeeId: string, date: string) {
  return ctx.db
    .query('wfAttendance')
    .withIndex('by_companyId_and_employeeId_and_date', (q) =>
      q.eq('companyId', companyId).eq('employeeId', employeeId).eq('date', date),
    )
    .unique();
}
function validateManualTimestamp(date: string, timestamp: number, now: number) {
  if (timestamp < bogotaTimestamp(date) || timestamp >= bogotaTimestamp(addDays(date, 2)) || timestamp > now)
    throw new Error('La hora debe pertenecer a la jornada o su madrugada siguiente y no puede estar en el futuro.');
}
type AttendanceCommand = Extract<WorkforceCommand, { type: 'mark' | 'manualMark' | 'editMark' | 'reviewAttendance' }>;
export async function attendanceCommand(
  ctx: MutationCtx,
  access: Access,
  command: AttendanceCommand,
  now: number,
): Promise<CommandResult> {
  const { companyId, actor } = access;
  if (command.type === 'mark') {
    requirePermission(access, 'workforce/check-in');
    const self = bounded(
      await ctx.db
        .query('wfEmployees')
        .withIndex('by_companyId_and_linkedUserId', (q) =>
          q.eq('companyId', companyId).eq('linkedUserId', actor.userId),
        )
        .take(501),
      500,
    ).find((e) => e.active);
    const employee = command.mode === 'self' ? self : await record(ctx, 'wfEmployees', command.employeeId!, companyId);
    if (!employee || !employee.active) throw new Error('Vincule una cuenta a un trabajador activo antes de marcar.');
    if (command.mode === 'self' && command.employeeId && command.employeeId !== employee._id)
      throw new Error('Solo puede registrar su propia asistencia.');
    const session = await ctx.db
      .query('wfSessions')
      .withIndex('by_companyId_and_employeeId', (q) => q.eq('companyId', companyId).eq('employeeId', employee._id))
      .unique();
    if (command.kind === 'IN' && session) throw new Error('Ya hay una entrada abierta. Registre la salida.');
    if (command.kind === 'OUT' && !session) throw new Error('No hay una entrada abierta para registrar la salida.');
    let date = session?.date ?? bogotaDate(now);
    if (!session) {
      const today = bogotaDate(now);
      const nearby = await ctx.db
        .query('wfSchedules')
        .withIndex('by_companyId_and_employeeId_and_date', (q) =>
          q
            .eq('companyId', companyId)
            .eq('employeeId', employee._id)
            .gte('date', addDays(today, -1))
            .lte('date', today),
        )
        .take(3);
      const containing = nearby.find((s) => s.blocks.some((b) => b.start <= now && now < b.end));
      if (containing) date = containing.date;
    }
    if (session && now - session.entryTimestamp > 86_400_000)
      throw new Error('La entrada supera 24 horas. Solicite una corrección al gestor.');
    const member = await membershipAt(ctx, companyId, employee._id, date);
    const groupId = session?.groupId ?? member?.groupId;
    if (!groupId) throw new Error('El trabajador necesita un grupo vigente con sede habilitada.');
    const group =
      command.mode === 'supervisor'
        ? await groupAccess(ctx, access, groupId, 'workforce/check-in', true)
        : await record(ctx, 'wfGroups', groupId, companyId);
    if (!group.active) throw new Error('El grupo está inactivo. Solicite revisión a Talento humano.');
    await editable(ctx, access, groupId, date, now);
    const day = await dayFor(ctx, companyId, employee._id, date);
    revision(day, command.expectedRevision);
    const schedule = await ctx.db
      .query('wfSchedules')
      .withIndex('by_companyId_and_employeeId_and_date', (q) =>
        q.eq('companyId', companyId).eq('employeeId', employee._id).eq('date', date),
      )
      .unique();
    const siteIds = schedule?.siteId ? group.siteIds.filter((s) => s === schedule.siteId) : group.siteIds;
    const sites = await Promise.all(siteIds.map((id) => record(ctx, 'wfSites', id, companyId)));
    const gpsSite = validateGps(command.gps, sites.map(dto), now);
    const recordId = await ctx.db.insert('wfMarks', {
      companyId,
      employeeId: employee._id,
      groupId,
      date,
      originalDate: date,
      originalGroupId: groupId,
      kind: command.kind,
      timestamp: now,
      origin: command.mode === 'self' ? 'SELF_GPS' : 'SUPERVISOR_GPS',
      actorId: actor.userId,
      actorName: actor.name,
      reason: command.reason,
      gps: { ...command.gps, ...gpsSite },
      excluded: false,
      revision: 1,
    });
    await rebuildAttendanceWeek(ctx, access, employee._id, weekStart(date), now);
    await audit(
      ctx,
      access,
      'mark',
      recordId,
      command.reason,
      { mode: command.mode, kind: command.kind, workerId: employee._id, gpsDeviceOwner: actor.userId },
      now,
    );
    return { ok: true, message: `${command.kind === 'IN' ? 'Entrada' : 'Salida'} registrada.`, recordId };
  }
  if (command.type === 'manualMark') {
    await groupAccess(ctx, access, command.groupId, 'workforce/attendance');
    const employee = await record(ctx, 'wfEmployees', command.employeeId, companyId);
    const member = await membershipAt(ctx, companyId, employee._id, command.date);
    if (member?.groupId !== command.groupId) throw new Error('El trabajador no pertenece al grupo en esa fecha.');
    await editable(ctx, access, command.groupId, command.date, now);
    validateManualTimestamp(command.date, command.timestamp, now);
    revision(await dayFor(ctx, companyId, employee._id, command.date), command.expectedRevision);
    const recordId = await ctx.db.insert('wfMarks', {
      companyId,
      employeeId: employee._id,
      groupId: command.groupId,
      date: command.date,
      originalDate: command.date,
      originalGroupId: command.groupId,
      kind: command.kind,
      timestamp: command.timestamp,
      origin: 'MANUAL',
      actorId: actor.userId,
      actorName: actor.name,
      reason: command.reason,
      excluded: false,
      revision: 1,
    });
    await rebuildAttendanceWeek(ctx, access, employee._id, weekStart(command.date), now);
    await audit(ctx, access, command.type, recordId, command.reason, command, now);
    return { ok: true, message: 'Marcación manual registrada para conciliación.', recordId };
  }
  if (command.type === 'editMark') {
    const mark = await record(ctx, 'wfMarks', command.markId, companyId);
    await groupAccess(ctx, access, mark.groupId, 'workforce/attendance');
    await editable(ctx, access, mark.groupId, mark.date, now);
    revision(mark, command.expectedRevision);
    validateManualTimestamp(command.date, command.timestamp, now);
    const member = await membershipAt(ctx, companyId, mark.employeeId, command.date);
    if (!member) throw new Error('No existe grupo vigente en la fecha de destino.');
    await groupAccess(ctx, access, member.groupId, 'workforce/attendance');
    await editable(ctx, access, member.groupId, command.date, now);
    await ctx.db.patch('wfMarks', mark._id, {
      excluded: command.excluded,
      effectiveKind: command.kind,
      effectiveTimestamp: command.timestamp,
      date: command.date,
      groupId: member.groupId,
      revision: mark.revision + 1,
    });
    // A correction can keep the same duration; explicitly invalidate prior review.
    for (const date of new Set([mark.date, command.date])) {
      const day = await dayFor(ctx, companyId, mark.employeeId, date);
      if (day)
        await ctx.db.patch('wfAttendance', day._id, {
          status: 'PENDING',
          resolution: undefined,
          revision: day.revision + 1,
        });
    }
    for (const week of new Set([weekStart(mark.date), weekStart(command.date)]))
      await rebuildAttendanceWeek(ctx, access, mark.employeeId, week, now);
    await audit(ctx, access, command.type, mark._id, command.reason, { before: mark, correction: command }, now);
    return {
      ok: true,
      message: 'Corrección guardada; la marcación original se conserva.',
      recordId: mark._id,
      revision: mark.revision + 1,
    };
  }
  await groupAccess(ctx, access, command.groupId, 'workforce/attendance');
  await editable(ctx, access, command.groupId, command.date, now);
  let day = await dayFor(ctx, companyId, command.employeeId, command.date);
  revision(day, command.expectedRevision);
  if (!day || day.incidents.includes('SIN_MARCACIONES')) {
    if (command.confirmedAbsence !== true) throw new Error('Confirme explícitamente la ausencia y explique el motivo.');
    const dayMarks = bounded(
      await ctx.db
        .query('wfMarks')
        .withIndex('by_companyId_and_employeeId_and_date', (q) =>
          q.eq('companyId', companyId).eq('employeeId', command.employeeId).eq('date', command.date),
        )
        .take(101),
      100,
    );
    const session = await ctx.db
      .query('wfSessions')
      .withIndex('by_companyId_and_employeeId', (q) =>
        q.eq('companyId', companyId).eq('employeeId', command.employeeId),
      )
      .unique();
    if (dayMarks.some((mark) => !mark.excluded) || session)
      throw new Error('Resuelva las marcaciones activas o la sesión abierta antes de confirmar una ausencia.');
    const schedule = await ctx.db
      .query('wfSchedules')
      .withIndex('by_companyId_and_employeeId_and_date', (q) =>
        q.eq('companyId', companyId).eq('employeeId', command.employeeId).eq('date', command.date),
      )
      .unique();
    if (
      !schedule ||
      schedule.groupId !== command.groupId ||
      !schedule.blocks.length ||
      schedule.blocks.some((b) => b.end > now)
    )
      throw new Error('Solo se puede confirmar ausencia de un turno programado que ya terminó.');
    if (!day) {
      const actual = calculateWeek([
        {
          id: `${command.employeeId}:${command.date}`,
          date: command.date,
          blocks: [],
          agreement: schedule.agreement,
          policy: schedule.policy,
        },
      ])[0];
      const dayId = await ctx.db.insert('wfAttendance', {
        companyId,
        employeeId: command.employeeId,
        groupId: command.groupId,
        date: command.date,
        scheduleId: String(schedule._id),
        scheduleRevision: schedule.revision,
        blocks: [],
        markIds: [],
        agreement: schedule.agreement,
        policy: schedule.policy,
        actual,
        revision: 0,
        status: 'PENDING',
        incidents: ['SIN_MARCACIONES'],
      });
      day = (await ctx.db.get('wfAttendance', dayId))!;
    }
  } else if (command.confirmedAbsence) {
    throw new Error('Una jornada con marcaciones activas no puede declararse ausencia.');
  }
  if (day.groupId !== command.groupId) throw new Error('La asistencia no pertenece a este grupo.');
  if (day.openEntry !== undefined || day.incidents.some((i) => STRUCTURAL.includes(i) && i !== 'SIN_MARCACIONES'))
    throw new Error('Complete o corrija las marcaciones antes de revisar la jornada.');
  if (command.mealOverrideMinutes !== undefined && command.mealOverrideMinutes !== day.mealOverrideMinutes) {
    if (!access.hr) throw new Error('Solo Talento humano puede corregir la deducción de almuerzo.');
    await ctx.db.patch('wfAttendance', day._id, { mealOverrideMinutes: command.mealOverrideMinutes });
    await rebuildAttendanceWeek(ctx, access, command.employeeId, weekStart(command.date), now);
  }
  const revised = (await ctx.db.get('wfAttendance', day._id))!;
  await ctx.db.patch('wfAttendance', day._id, {
    status: 'REVIEWED',
    incidents: [],
    resolution: command.resolution,
    revision: revised.revision + 1,
  });
  await audit(
    ctx,
    access,
    command.type,
    day._id,
    command.resolution,
    {
      resolved: day.incidents,
      confirmedAbsence: command.confirmedAbsence === true,
      mealOverrideMinutes: command.mealOverrideMinutes,
    },
    now,
  );
  return { ok: true, message: 'Jornada revisada y conciliada.', recordId: day._id, revision: revised.revision + 1 };
}
