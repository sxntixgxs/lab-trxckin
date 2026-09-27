import type { QueryCtx } from '../_generated/server';
import type { WorkforceSnapshot } from '../../lib/workforce/types';
import { addDays, bogotaDate, periodFor } from '../../lib/workforce/dates';
import { type Access, bounded, dto, MAX_CATALOG, MAX_ROWS, permitted } from './common';

export async function readSnapshot(
  ctx: QueryCtx,
  access: Access,
  from: string,
  to: string,
  now: number,
): Promise<WorkforceSnapshot> {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(from) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(to) ||
    !Number.isFinite(Date.parse(from)) ||
    !Number.isFinite(Date.parse(to)) ||
    from > to ||
    to > addDays(from, 62)
  )
    throw new Error('Consulte un rango válido de hasta 63 días.');
  const { companyId, actor } = access;
  const allEmployees = bounded(
    await ctx.db
      .query('wfEmployees')
      .withIndex('by_companyId', (q) => q.eq('companyId', companyId))
      .take(MAX_CATALOG + 1),
    MAX_CATALOG,
  );
  const allGroups = bounded(
    await ctx.db
      .query('wfGroups')
      .withIndex('by_companyId', (q) => q.eq('companyId', companyId))
      .take(MAX_CATALOG + 1),
    MAX_CATALOG,
  );
  const self = allEmployees.find((e) => e.active && e.linkedUserId === actor.userId);
  const manage =
    permitted(actor, 'workforce/scheduling') ||
    permitted(actor, 'workforce/attendance') ||
    permitted(actor, 'workforce/check-in');
  const broad =
    access.hr &&
    (manage || ['workforce/employees', 'workforce/locations', 'workforce/settings'].some((p) => permitted(actor, p)));
  const ownMemberships = self
    ? bounded(
        await ctx.db
          .query('wfMemberships')
          .withIndex('by_companyId_and_employeeId_and_effectiveFrom', (q) =>
            q.eq('companyId', companyId).eq('employeeId', self._id),
          )
          .take(501),
        500,
      )
    : [];
  const groups = allGroups.filter(
    (g) =>
      broad ||
      (manage && g.managerIds.includes(actor.userId)) ||
      ownMemberships.some(
        (m) => m.groupId === g._id && m.effectiveFrom <= to && (!m.effectiveTo || m.effectiveTo >= from),
      ),
  );
  const managedIds = new Set(
    groups.filter((g) => broad || (manage && g.managerIds.includes(actor.userId))).map((g) => String(g._id)),
  );
  const memberships = broad
    ? bounded(
        await ctx.db
          .query('wfMemberships')
          .withIndex('by_companyId', (q) => q.eq('companyId', companyId))
          .take(MAX_ROWS + 1),
      )
    : (
        await Promise.all(
          [...managedIds].map((groupId) =>
            ctx.db
              .query('wfMemberships')
              .withIndex('by_companyId_and_groupId_and_effectiveFrom', (q) =>
                q.eq('companyId', companyId).eq('groupId', groupId),
              )
              .take(MAX_ROWS + 1),
          ),
        )
      )
        .flat()
        .concat(ownMemberships);
  bounded(memberships);
  const membershipRows = [...new Map(memberships.map((m) => [m._id, m])).values()];
  const employeeIds = new Set(
    membershipRows
      .filter((m) => m.effectiveFrom <= to && (!m.effectiveTo || m.effectiveTo >= from))
      .map((m) => m.employeeId),
  );
  if (self) employeeIds.add(self._id);
  const employees = allEmployees.filter((e) => broad || employeeIds.has(e._id));
  const sites = bounded(
    await ctx.db
      .query('wfSites')
      .withIndex('by_companyId', (q) => q.eq('companyId', companyId))
      .take(MAX_CATALOG + 1),
    MAX_CATALOG,
  ).filter((s) => broad || groups.some((g) => g.siteIds.includes(s._id)));
  const templates = bounded(
    await ctx.db
      .query('wfTemplates')
      .withIndex('by_companyId', (q) => q.eq('companyId', companyId))
      .take(MAX_CATALOG + 1),
    MAX_CATALOG,
  );
  const schedules = broad
    ? bounded(
        await ctx.db
          .query('wfSchedules')
          .withIndex('by_companyId_and_date', (q) => q.eq('companyId', companyId).gte('date', from).lte('date', to))
          .take(MAX_ROWS + 1),
      )
    : bounded(
        (
          await Promise.all(
            [...managedIds].map((groupId) =>
              ctx.db
                .query('wfSchedules')
                .withIndex('by_companyId_and_groupId_and_date', (q) =>
                  q.eq('companyId', companyId).eq('groupId', groupId).gte('date', from).lte('date', to),
                )
                .take(MAX_ROWS + 1),
            ),
          )
        )
          .flat()
          .concat(
            self
              ? await ctx.db
                  .query('wfSchedules')
                  .withIndex('by_companyId_and_employeeId_and_date', (q) =>
                    q.eq('companyId', companyId).eq('employeeId', self._id).gte('date', from).lte('date', to),
                  )
                  .take(64)
              : [],
          ),
      );
  const attendance = broad
    ? bounded(
        await ctx.db
          .query('wfAttendance')
          .withIndex('by_companyId_and_date', (q) => q.eq('companyId', companyId).gte('date', from).lte('date', to))
          .take(MAX_ROWS + 1),
      )
    : bounded(
        (
          await Promise.all(
            [...managedIds].map((groupId) =>
              ctx.db
                .query('wfAttendance')
                .withIndex('by_companyId_and_groupId_and_date', (q) =>
                  q.eq('companyId', companyId).eq('groupId', groupId).gte('date', from).lte('date', to),
                )
                .take(MAX_ROWS + 1),
            ),
          )
        )
          .flat()
          .concat(
            self
              ? await ctx.db
                  .query('wfAttendance')
                  .withIndex('by_companyId_and_employeeId_and_date', (q) =>
                    q.eq('companyId', companyId).eq('employeeId', self._id).gte('date', from).lte('date', to),
                  )
                  .take(64)
              : [],
          ),
      );
  const marks = broad
    ? bounded(
        await ctx.db
          .query('wfMarks')
          .withIndex('by_companyId_and_date', (q) => q.eq('companyId', companyId).gte('date', from).lte('date', to))
          .take(MAX_ROWS + 1),
      )
    : bounded(
        (
          await Promise.all(
            [...managedIds].map((groupId) =>
              ctx.db
                .query('wfMarks')
                .withIndex('by_companyId_and_groupId_and_date', (q) =>
                  q.eq('companyId', companyId).eq('groupId', groupId).gte('date', from).lte('date', to),
                )
                .take(MAX_ROWS + 1),
            ),
          )
        )
          .flat()
          .concat(
            self
              ? await ctx.db
                  .query('wfMarks')
                  .withIndex('by_companyId_and_employeeId_and_date', (q) =>
                    q.eq('companyId', companyId).eq('employeeId', self._id).gte('date', from).lte('date', to),
                  )
                  .take(MAX_ROWS + 1)
              : [],
          ),
      );
  const closures = bounded(
    await ctx.db
      .query('wfClosures')
      .withIndex('by_companyId_and_periodStart', (q) =>
        q.eq('companyId', companyId).gte('periodStart', periodFor(from).start).lte('periodStart', to),
      )
      .take(MAX_ROWS + 1),
  ).filter((c) => broad || groups.some((g) => g._id === c.groupId));
  const today = bogotaDate(now);
  // Locks are indexed separately so both self and supervisor discover overdue
  // entries without loading unrestricted attendance history.
  const sessions = bounded(
    (
      await Promise.all(
        [...managedIds].map((groupId) =>
          ctx.db
            .query('wfSessions')
            .withIndex('by_companyId_and_groupId', (q) => q.eq('companyId', companyId).eq('groupId', groupId))
            .take(MAX_CATALOG + 1),
        ),
      )
    ).flat(),
    MAX_CATALOG,
  );
  if (self) {
    const ownSession = await ctx.db
      .query('wfSessions')
      .withIndex('by_companyId_and_employeeId', (q) => q.eq('companyId', companyId).eq('employeeId', self._id))
      .unique();
    if (ownSession) sessions.push(ownSession);
  }
  for (const session of sessions) {
    if (session.date < from || session.date > to) {
      const id = ctx.db.normalizeId('wfAttendance', session.attendanceId);
      const open = id ? await ctx.db.get('wfAttendance', id) : null;
      if (open) attendance.push(open);
    }
    const employee = allEmployees.find((e) => e._id === session.employeeId);
    if (employee && !employees.some((e) => e._id === employee._id)) employees.push(employee);
  }
  const canReadAttendance = permitted(actor, 'workforce/attendance');
  const canCheckIn = permitted(actor, 'workforce/check-in');
  const visibleAttendance = attendance.filter(
    (a) =>
      canReadAttendance ||
      (canCheckIn && a.employeeId === self?._id) ||
      (canCheckIn && (a.openEntry !== undefined || a.date >= addDays(today, -1))),
  );
  const visibleMarks = marks.filter((m) => canReadAttendance || (canCheckIn && m.employeeId === self?._id));
  const visibleSchedules = schedules.filter((s) => manage || s.employeeId === self?._id);
  return {
    companyId,
    from,
    to,
    employees: employees.map(dto),
    groups: groups.map(dto),
    memberships: membershipRows.map(dto),
    sites: sites.map(dto),
    templates: templates.map(dto),
    schedules: [...new Map(visibleSchedules.map((s) => [s._id, s])).values()].map(dto),
    attendance: [...new Map(visibleAttendance.map((s) => [s._id, s])).values()].map(dto),
    marks: [...new Map(visibleMarks.map((s) => [s._id, s])).values()].map(dto),
    closures: closures.map(dto),
    settings: access.settings,
    capabilities: {
      admin: actor.admin,
      hr: access.hr,
      manage: manage && (access.hr || managedIds.size > 0),
      ...(self ? { selfEmployeeId: self._id } : {}),
      userId: actor.userId,
      userName: actor.name,
      permissions: actor.permissions,
    },
  };
}
