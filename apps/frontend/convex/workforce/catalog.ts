import type { MutationCtx } from '../_generated/server';
import type { WorkforceCommand, CommandResult } from '../../lib/workforce/types';
import { addDays, bogotaDate, weekStart } from '../../lib/workforce/dates';
import {
  audit,
  bounded,
  stableJson,
  editable,
  launchGuard,
  membershipAt,
  persistSettings,
  record,
  requireHr,
  revision,
  type Access,
} from './common';

type CatalogCommand = Extract<
  WorkforceCommand,
  { type: 'saveEmployee' | 'saveGroup' | 'saveSite' | 'saveTemplate' | 'saveSettings' | 'transferMember' }
>;
export async function catalogCommand(
  ctx: MutationCtx,
  access: Access,
  command: CatalogCommand,
  now: number,
): Promise<CommandResult> {
  const { companyId } = access;
  if (command.type === 'saveEmployee') {
    requireHr(access, 'workforce/employees');
    const { id, ...fields } = command.employee;
    const current = id ? await record(ctx, 'wfEmployees', id, companyId) : null;
    revision(current, command.expectedRevision);
    const sameCode = bounded(
      await ctx.db
        .query('wfEmployees')
        .withIndex('by_companyId_and_code', (q) => q.eq('companyId', companyId).eq('code', fields.code))
        .take(501),
      500,
    );
    if (sameCode.some((e) => e._id !== id)) throw new Error('El código del trabajador ya está registrado.');
    if (fields.active && fields.linkedUserId) {
      const linked = bounded(
        await ctx.db
          .query('wfEmployees')
          .withIndex('by_companyId_and_linkedUserId', (q) =>
            q.eq('companyId', companyId).eq('linkedUserId', fields.linkedUserId),
          )
          .take(501),
        500,
      );
      if (linked.some((e) => e.active && e._id !== id))
        throw new Error('La cuenta ya está vinculada a otro trabajador activo de la empresa.');
    }
    const next = { ...fields, companyId, revision: (current?.revision ?? 0) + 1 };
    const recordId = current
      ? (await ctx.db.replace('wfEmployees', current._id, next), current._id)
      : await ctx.db.insert('wfEmployees', next);
    await audit(
      ctx,
      access,
      command.type,
      recordId,
      'Actualización de catálogo',
      { before: current, after: next },
      now,
    );
    return { ok: true, message: 'Trabajador guardado.', recordId, revision: next.revision };
  }
  if (command.type === 'saveGroup') {
    requireHr(access, 'workforce/scheduling');
    const { id, ...fields } = command.group;
    const current = id ? await record(ctx, 'wfGroups', id, companyId) : null;
    revision(current, command.expectedRevision);
    for (const siteId of fields.siteIds) await record(ctx, 'wfSites', siteId, companyId);
    const next = {
      ...fields,
      managerIds: [...new Set(fields.managerIds)],
      siteIds: [...new Set(fields.siteIds)],
      companyId,
      revision: (current?.revision ?? 0) + 1,
    };
    const recordId = current
      ? (await ctx.db.replace('wfGroups', current._id, next), current._id)
      : await ctx.db.insert('wfGroups', next);
    await audit(ctx, access, command.type, recordId, 'Actualización de grupo', { before: current, after: next }, now);
    return { ok: true, message: 'Grupo guardado.', recordId, revision: next.revision };
  }
  if (command.type === 'saveSite') {
    requireHr(access, 'workforce/locations');
    const { id, ...fields } = command.site;
    const current = id ? await record(ctx, 'wfSites', id, companyId) : null;
    revision(current, command.expectedRevision);
    const next = { ...fields, companyId, revision: (current?.revision ?? 0) + 1 };
    const recordId = current
      ? (await ctx.db.replace('wfSites', current._id, next), current._id)
      : await ctx.db.insert('wfSites', next);
    await audit(ctx, access, command.type, recordId, 'Actualización de sede', { before: current, after: next }, now);
    return { ok: true, message: 'Sede guardada.', recordId, revision: next.revision };
  }
  if (command.type === 'saveTemplate') {
    requireHr(access, 'workforce/scheduling');
    const { id, ...fields } = command.template;
    const current = id ? await record(ctx, 'wfTemplates', id, companyId) : null;
    revision(current, command.expectedRevision);
    const next = { ...fields, companyId, revision: (current?.revision ?? 0) + 1 };
    const recordId = current
      ? (await ctx.db.replace('wfTemplates', current._id, next), current._id)
      : await ctx.db.insert('wfTemplates', next);
    await audit(
      ctx,
      access,
      command.type,
      recordId,
      'Los turnos existentes conservan su horario',
      { before: current, after: next },
      now,
    );
    return {
      ok: true,
      message: 'Plantilla guardada. Los turnos existentes conservan su horario.',
      recordId,
      revision: next.revision,
    };
  }
  if (command.type === 'saveSettings') {
    requireHr(access, 'workforce/settings');
    revision(access.settings, command.expectedRevision);
    if (
      !access.actor.admin &&
      stableJson([...command.hrUserIds].sort()) !== stableJson([...access.settings.hrUserIds].sort())
    )
      throw new Error('Solo un administrador puede asignar responsables de TH.');
    const configId = await persistSettings(ctx, access);
    const prior = access.settings.policies.find((p) => p.version === command.policy.version);
    if (prior && stableJson(prior) !== stableJson(command.policy))
      throw new Error('Use una versión nueva: las políticas publicadas son inmutables.');
    if (!prior) {
      if (command.policy.effectiveFrom !== weekStart(command.policy.effectiveFrom))
        throw new Error('La política debe iniciar un domingo.');
      if (command.policy.effectiveFrom <= bogotaDate(now))
        throw new Error('Una política nueva debe iniciar una semana futura.');
      if (access.settings.policies.some((p) => p.effectiveFrom === command.policy.effectiveFrom))
        throw new Error('Ya hay una política para esa fecha.');
      const last = access.settings.policies[access.settings.policies.length - 1];
      if (command.policy.effectiveFrom <= last.effectiveFrom)
        throw new Error('La nueva vigencia debe ser posterior a las políticas publicadas.');
      const futureSchedules = await ctx.db
        .query('wfSchedules')
        .withIndex('by_companyId_and_date', (q) =>
          q.eq('companyId', companyId).gte('date', command.policy.effectiveFrom),
        )
        .take(1);
      if (futureSchedules.length)
        throw new Error(
          'Ya hay turnos desde esa vigencia. Elija una semana posterior a la programación existente para conservar sus reglas.',
        );
      await ctx.db.insert('wfPolicies', { companyId, policy: command.policy });
    }
    await ctx.db.patch('wfSettings', configId, {
      hrUserIds: [...new Set(command.hrUserIds)],
      revision: access.settings.revision + 1,
    });
    await audit(
      ctx,
      access,
      command.type,
      configId,
      command.reason,
      { hrUserIds: command.hrUserIds, policy: command.policy },
      now,
    );
    return {
      ok: true,
      message: 'Configuración guardada con vigencia versionada.',
      revision: access.settings.revision + 1,
    };
  }
  requireHr(access, 'workforce/scheduling');
  const employee = await record(ctx, 'wfEmployees', command.employeeId, companyId);
  const group = await record(ctx, 'wfGroups', command.groupId, companyId);
  if (!employee.active || !group.active) throw new Error('El trabajador y el grupo deben estar activos.');
  revision(employee, command.expectedRevision);
  launchGuard(access, command.effectiveFrom);
  if (command.effectiveFrom < bogotaDate(now))
    throw new Error('Un traslado debe tener vigencia de hoy o futura; no modifica la historia de asistencia.');
  const memberships = bounded(
    await ctx.db
      .query('wfMemberships')
      .withIndex('by_companyId_and_employeeId_and_effectiveFrom', (q) =>
        q.eq('companyId', companyId).eq('employeeId', employee._id),
      )
      .take(501),
    500,
  );
  if (memberships.some((m) => m.effectiveFrom >= command.effectiveFrom))
    throw new Error('Existe una afiliación o traslado para esa fecha o posterior. Elija una fecha posterior.');
  const current = await membershipAt(ctx, companyId, employee._id, command.effectiveFrom);
  if (current?.groupId === group._id)
    throw new Error('El trabajador ya pertenece a este grupo en la fecha seleccionada.');
  const attended = await ctx.db
    .query('wfAttendance')
    .withIndex('by_companyId_and_employeeId_and_date', (q) =>
      q.eq('companyId', companyId).eq('employeeId', employee._id).gte('date', command.effectiveFrom),
    )
    .take(1);
  if (attended.length)
    throw new Error('Ya existe asistencia desde la fecha del traslado. Seleccione una fecha posterior.');
  const future = bounded(
    await ctx.db
      .query('wfSchedules')
      .withIndex('by_companyId_and_employeeId_and_date', (q) =>
        q.eq('companyId', companyId).eq('employeeId', employee._id).gte('date', command.effectiveFrom),
      )
      .take(367),
    366,
  );
  for (const day of future) {
    await editable(ctx, access, day.groupId, day.date, now);
    await editable(ctx, access, group._id, day.date, now);
    if (day.siteId && !group.siteIds.includes(day.siteId))
      throw new Error(
        'Un turno futuro tiene una sede no habilitada en el grupo de destino. Ajuste ese turno antes del traslado.',
      );
  }
  if (current) await ctx.db.patch('wfMemberships', current._id, { effectiveTo: addDays(command.effectiveFrom, -1) });
  const recordId = await ctx.db.insert('wfMemberships', {
    companyId,
    employeeId: employee._id,
    groupId: group._id,
    effectiveFrom: command.effectiveFrom,
  });
  for (const day of future)
    await ctx.db.patch('wfSchedules', day._id, { groupId: group._id, revision: day.revision + 1 });
  await ctx.db.patch('wfEmployees', employee._id, { revision: employee.revision + 1 });
  await audit(
    ctx,
    access,
    command.type,
    employee._id,
    command.reason,
    {
      previousGroup: current?.groupId,
      groupId: group._id,
      effectiveFrom: command.effectiveFrom,
      updatedSchedules: future.length,
    },
    now,
  );
  return {
    ok: true,
    message: 'Traslado registrado con fecha efectiva e historial.',
    recordId,
    revision: employee.revision + 1,
  };
}
