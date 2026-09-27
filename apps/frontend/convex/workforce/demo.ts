import type { MutationCtx } from '../_generated/server';
import type { CommandResult, ScheduleChange } from '../../lib/workforce/types';
import { addDays, bogotaDate, bogotaTimestamp, weekStart } from '../../lib/workforce/dates';
import { audit, requireHr, type Access } from './common';
import { saveSchedule } from './scheduling';
import { rebuildAttendanceWeek } from './attendance';

export async function seedDemo(ctx: MutationCtx, access: Access, now: number): Promise<CommandResult> {
  requireHr(access, 'workforce/settings');
  const { companyId, actor } = access;
  const already = await ctx.db
    .query('wfEmployees')
    .withIndex('by_companyId_and_code', (q) => q.eq('companyId', companyId).eq('code', 'WF-DEMO-001'))
    .unique();
  if (already)
    return { ok: true, message: 'Los datos demostrativos ya están creados; no se duplicaron.', recordId: already._id };
  const launch = weekStart(bogotaDate(now));
  const siteId = await ctx.db.insert('wfSites', {
    companyId,
    name: 'Sede demostración · Bogotá',
    latitude: 4.711,
    longitude: -74.0721,
    radius: 150,
    tolerance: 30,
    maxAccuracy: 100,
    maxAgeSeconds: 60,
    active: true,
    revision: 1,
  });
  const groupId = await ctx.db.insert('wfGroups', {
    companyId,
    name: 'Operaciones · Demo',
    description:
      'Trabajadores ficticios para explorar programación y asistencia. Configure las coordenadas reales antes de marcar.',
    managerIds: [actor.userId],
    siteIds: [siteId],
    active: true,
    revision: 1,
  });
  const templates = [
    { name: 'Mañana', code: 'MAÑ', color: '#3b82f6', startTime: '08:00', endTime: '16:00' },
    { name: 'Noche', code: 'NOC', color: '#8b5cf6', startTime: '22:00', endTime: '06:00' },
    { name: 'Extendido', code: 'EXT', color: '#f59e0b', startTime: '08:00', endTime: '18:00' },
  ];
  const templateIds = [];
  for (const template of templates)
    templateIds.push(await ctx.db.insert('wfTemplates', { companyId, ...template, active: true, revision: 1 }));
  const linked = await ctx.db
    .query('wfEmployees')
    .withIndex('by_companyId_and_linkedUserId', (q) => q.eq('companyId', companyId).eq('linkedUserId', actor.userId))
    .take(501);
  const names = ['Ana Torres · Demo', 'Carlos Ríos · Demo', 'Lucía Méndez · Demo', 'Mateo Silva · Demo'];
  for (let index = 0; index < names.length; index++) {
    const employeeId = await ctx.db.insert('wfEmployees', {
      companyId,
      code: `WF-DEMO-00${index + 1}`,
      name: names[index],
      job: index === 1 ? 'Operador nocturno (ficticio)' : 'Auxiliar de operaciones (ficticio)',
      active: true,
      ...(index === 0 && !linked.some((e) => e.active) ? { linkedUserId: actor.userId } : {}),
      agreement: { dailyMinutes: 480, weeklyMinutes: 2520, restDay: 0 },
      revision: 1,
    });
    await ctx.db.insert('wfMemberships', { companyId, employeeId, groupId, effectiveFrom: launch });
    const changes: ScheduleChange[] = [];
    for (let day = 0; day < 7; day++) {
      const date = addDays(launch, day);
      const templateIndex = index === 1 ? 1 : index === 3 && day === 1 ? 2 : 0;
      const template = templates[templateIndex];
      const rest = day === 0 && index !== 2;
      // Lucía illustrates a Sunday worked, with Monday as her scheduled day off.
      const isRest = rest || (index === 2 && day === 1);
      const blocks = isRest
        ? []
        : [
            {
              start: bogotaTimestamp(date, template.startTime),
              end: bogotaTimestamp(templateIndex === 1 ? addDays(date, 1) : date, template.endTime),
              templateId: templateIds[templateIndex],
              label: template.name,
              color: template.color,
            },
          ];
      changes.push({
        employeeId,
        groupId,
        date,
        blocks,
        isRest,
        observation: 'Escenario demostrativo; datos ficticios.',
        expectedRevision: 0,
      });
    }
    await saveSchedule(ctx, access, { type: 'saveSchedule', changes, preview: false }, now);
    const completed = changes.filter((c) => c.blocks.length && c.blocks[0].end < now);
    for (let i = 0; i < completed.length; i++) {
      const day = completed[i];
      for (const kind of ['IN', 'OUT'] as const) {
        if (index === 2 && i === completed.length - 1 && kind === 'OUT') continue;
        const correction = index === 3 && i === 0 && kind === 'OUT';
        const timestamp = kind === 'IN' ? day.blocks[0].start : day.blocks[0].end;
        const markId = await ctx.db.insert('wfMarks', {
          companyId,
          employeeId,
          groupId,
          date: day.date,
          originalDate: day.date,
          originalGroupId: groupId,
          kind,
          timestamp: correction ? timestamp - 20 * 60_000 : timestamp,
          ...(correction ? { effectiveTimestamp: timestamp } : {}),
          origin: 'DEMO',
          actorId: actor.userId,
          actorName: actor.name,
          reason: 'SIMULADO: escenario demostrativo sin evidencia GPS.',
          excluded: false,
          revision: correction ? 2 : 1,
        });
        if (correction)
          await audit(
            ctx,
            access,
            'editMark',
            markId,
            'SIMULADO: ajuste de salida de veinte minutos.',
            { originalTimestamp: timestamp - 20 * 60_000, effectiveTimestamp: timestamp },
            now,
          );
      }
    }
    await rebuildAttendanceWeek(ctx, access, employeeId, launch, now);
  }
  await audit(ctx, access, 'seedDemo', groupId, 'Creación explícita de datos ficticios', { launch, workers: 4 }, now);
  return {
    ok: true,
    message: 'Demo creada: cuatro trabajadores ficticios, tres plantillas y escenarios de asistencia.',
    recordId: groupId,
  };
}
