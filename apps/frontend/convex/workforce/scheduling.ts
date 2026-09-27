import type { MutationCtx } from '../_generated/server';
import type { CalculationInput, CommandResult, ScheduleChange, WorkforceCommand } from '../../lib/workforce/types';
import { calculateWeek, validateSchedule } from '../../lib/workforce/calculation';
import { addDays, bogotaDate, bogotaTimestamp, weekStart } from '../../lib/workforce/dates';
import {
  audit,
  bounded,
  stableJson,
  editable,
  groupAccess,
  membershipAt,
  policyAt,
  record,
  revision,
  type Access,
} from './common';
import { rebuildAttendanceWeek } from './attendance';

type ScheduleCommand = Extract<WorkforceCommand, { type: 'saveSchedule' }>;
const key = (employeeId: string, date: string) => `${employeeId}:${date}`;
export async function saveSchedule(
  ctx: MutationCtx,
  access: Access,
  command: ScheduleCommand,
  now: number,
): Promise<CommandResult> {
  const { companyId } = access;
  const changes = [...command.changes];
  const recurrenceKeys = new Map<string, string>();
  if (command.recurrence) {
    const { endDate, everyWeeks } = command.recurrence;
    for (const source of command.changes) {
      if (endDate < source.date || endDate > addDays(source.date, 364))
        throw new Error('La recurrencia debe terminar dentro de un año y después de su inicio.');
      const recurrenceKey = stableJson([
        source.employeeId,
        source.date,
        source.blocks,
        source.isRest,
        source.siteId ?? null,
        endDate,
        everyWeeks,
      ]);
      recurrenceKeys.set(key(source.employeeId, source.date), recurrenceKey);
      for (let date = addDays(source.date, everyWeeks * 7); date <= endDate; date = addDays(date, everyWeeks * 7)) {
        const offset = bogotaTimestamp(date) - bogotaTimestamp(source.date);
        changes.push({
          ...source,
          date,
          blocks: source.blocks.map((b) => ({ ...b, start: b.start + offset, end: b.end + offset })),
          expectedRevision: 0,
        });
        recurrenceKeys.set(key(source.employeeId, date), recurrenceKey);
      }
    }
  }
  if (changes.length > 350)
    throw new Error('La operación admite hasta 350 jornadas. Reduzca la recurrencia o la selección.');
  if (new Set(changes.map((c) => key(c.employeeId, c.date))).size !== changes.length)
    throw new Error('La selección contiene jornadas duplicadas o recurrencias superpuestas.');
  const employeeIds = [...new Set(changes.map((c) => c.employeeId))];
  if (employeeIds.length > 50) throw new Error('Seleccione un máximo de 50 trabajadores por operación.');
  const results: NonNullable<CommandResult['results']> = [];
  for (const employeeId of employeeIds) {
    const employee = await record(ctx, 'wfEmployees', employeeId, companyId);
    if (!employee.active) throw new Error(`${employee.name}: el trabajador está inactivo.`);
    const edits = changes.filter((c) => c.employeeId === employeeId);
    const dates = edits.map((c) => c.date).sort();
    const targetStart = weekStart(dates[0]);
    const start = addDays(targetStart, -1);
    const end = addDays(weekStart(dates[dates.length - 1]), 13);
    const stored = bounded(
      await ctx.db
        .query('wfSchedules')
        .withIndex('by_companyId_and_employeeId_and_date', (q) =>
          q.eq('companyId', companyId).eq('employeeId', employeeId).gte('date', start).lte('date', end),
        )
        .take(401),
      400,
    );
    const byDate = new Map(stored.map((s) => [s.date, s]));
    const drafts = new Map<string, { change: ScheduleChange; input: CalculationInput }>();
    for (const change of edits) {
      const group = await groupAccess(ctx, access, change.groupId, 'workforce/scheduling', true);
      await editable(ctx, access, change.groupId, change.date, now);
      if (change.date > addDays(bogotaDate(now), 364)) throw new Error('Programe como máximo un año desde hoy.');
      const old = byDate.get(change.date) ?? null;
      const recurrenceKey = recurrenceKeys.get(key(employeeId, change.date));
      const identicalRecurrence =
        old &&
        recurrenceKey &&
        old.recurrenceId === recurrenceKey &&
        stableJson({
          blocks: old.blocks,
          siteId: old.siteId,
          observation: old.observation,
          isRest: old.isRest,
          groupId: old.groupId,
        }) ===
          stableJson({
            blocks: change.blocks,
            siteId: change.siteId,
            observation: change.observation,
            isRest: change.isRest,
            groupId: change.groupId,
          });
      if (!identicalRecurrence) revision(old, change.expectedRevision);
      if (old) {
        await groupAccess(ctx, access, old.groupId, 'workforce/scheduling');
        await editable(ctx, access, old.groupId, old.date, now);
      }
      const member = await membershipAt(ctx, companyId, employeeId, change.date);
      if (member?.groupId !== change.groupId)
        throw new Error(`${employee.name}: no pertenece al grupo en ${change.date}.`);
      if (change.siteId) {
        const site = await record(ctx, 'wfSites', change.siteId, companyId);
        if (!site.active || !group.siteIds.includes(site._id))
          throw new Error('La sede del turno no está activa y habilitada en el grupo.');
      }
      for (const block of change.blocks) {
        if (block.start < bogotaTimestamp(change.date) || block.end > bogotaTimestamp(addDays(change.date, 2)))
          throw new Error('Los bloques deben pertenecer a la fecha de jornada o su madrugada siguiente.');
        if (block.start % 60_000 || block.end % 60_000)
          throw new Error('Programe los bloques con precisión de minutos completos.');
        if (block.templateId) {
          const template = await record(ctx, 'wfTemplates', block.templateId, companyId);
          if (!template.active && !old?.blocks.some((b) => b.templateId === template._id))
            throw new Error('No se puede asignar una plantilla inactiva.');
        }
      }
      if (!identicalRecurrence)
        drafts.set(change.date, {
          change,
          input: {
            id: key(employeeId, change.date),
            date: change.date,
            blocks: change.blocks,
            agreement: old?.agreement ?? employee.agreement,
            policy: old?.policy ?? policyAt(access.settings, change.date),
          },
        });
    }
    const inputs: CalculationInput[] = stored.map(
      (s) =>
        drafts.get(s.date)?.input ?? {
          id: key(employeeId, s.date),
          date: s.date,
          blocks: s.blocks,
          agreement: s.agreement,
          policy: s.policy,
        },
    );
    for (const [date, draft] of drafts) if (!byDate.has(date)) inputs.push(draft.input);
    const violations = validateSchedule(inputs).filter((error) => error.slice(0, 10) >= targetStart);
    if (violations.length) throw new Error(`${employee.name}: ${violations.join(' ')}`);
    const calculated = calculateWeek(inputs);
    for (const planned of calculated) {
      if (planned.date < targetStart) continue;
      const old = byDate.get(planned.date);
      const draft = drafts.get(planned.date);
      const resultGroup = await record(ctx, 'wfGroups', draft?.change.groupId ?? old!.groupId, companyId);
      if (access.hr || resultGroup.managerIds.includes(access.actor.userId))
        results.push({ employeeId, date: planned.date, planned });
      if (draft || (old && stableJson(old.planned) !== stableJson(planned))) {
        await editable(ctx, access, draft?.change.groupId ?? old!.groupId, planned.date, now);
        if (!command.preview) {
          if (draft) {
            const { expectedRevision: ignored, ...fields } = draft.change;
            void ignored;
            const recurrenceKey = recurrenceKeys.get(key(employeeId, planned.date));
            const next = {
              ...fields,
              companyId,
              agreement: draft.input.agreement,
              policy: draft.input.policy,
              planned,
              revision: (old?.revision ?? 0) + 1,
              ...(recurrenceKey ? { recurrenceId: recurrenceKey } : {}),
            };
            if (old) await ctx.db.replace('wfSchedules', old._id, next);
            else await ctx.db.insert('wfSchedules', next);
          } else if (old) await ctx.db.patch('wfSchedules', old._id, { planned, revision: old.revision + 1 });
        }
      }
    }
    if (!command.preview) {
      for (const week of new Set(edits.map((e) => weekStart(e.date))))
        await rebuildAttendanceWeek(ctx, access, employeeId, week, now);
    }
  }
  if (!command.preview) {
    if (command.recurrence)
      for (const recurrenceKey of new Set(recurrenceKeys.values())) {
        const source = command.changes.find((s) => recurrenceKeys.get(key(s.employeeId, s.date)) === recurrenceKey)!;
        const exists = await ctx.db
          .query('wfRecurrences')
          .withIndex('by_companyId_and_key', (q) => q.eq('companyId', companyId).eq('key', recurrenceKey))
          .unique();
        if (!exists)
          await ctx.db.insert('wfRecurrences', {
            companyId,
            key: recurrenceKey,
            employeeId: source.employeeId,
            startDate: source.date,
            endDate: command.recurrence.endDate,
            everyWeeks: command.recurrence.everyWeeks,
            createdBy: access.actor.userId,
          });
      }
    await audit(
      ctx,
      access,
      'saveSchedule',
      'batch',
      'Programación guardada',
      { changes, recurrence: command.recurrence },
      now,
    );
  }
  return {
    ok: true,
    message: command.preview
      ? 'Vista previa calculada y validada por el servidor.'
      : `${changes.length} jornadas guardadas.`,
    results,
  };
}
