/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { beforeEach, afterEach, describe, expect, test, vi } from 'vitest';
import { api } from './_generated/api';
import schema from './schema';
import type { TrustedActor, WorkforceCommand, ScheduleChange } from '../lib/workforce/types';
import { addDays, bogotaTimestamp } from '../lib/workforce/dates';

const modules = import.meta.glob('./**/*.*s');
const SECRET = 'test-convex-server-secret';
const WEEK = '2026-09-20';
let now: number;
const admin: TrustedActor = {
  userId: 'nest-admin',
  workosUserId: 'workos-admin',
  name: 'Admin Demo',
  permissions: [],
  companyIds: [1],
  allCompanies: false,
  admin: true,
};
const worker: TrustedActor = {
  userId: 'nest-worker',
  workosUserId: 'workos-worker',
  name: 'Worker Demo',
  permissions: ['workforce/check-in'],
  companyIds: [1],
  allCompanies: false,
  admin: false,
};
const manager: TrustedActor = {
  userId: 'nest-manager',
  workosUserId: 'workos-manager',
  name: 'Manager Demo',
  permissions: ['workforce/scheduling', 'workforce/attendance', 'workforce/check-in'],
  companyIds: [1],
  allCompanies: false,
  admin: false,
};
function setup() {
  return convexTest(schema, modules);
}
type T = ReturnType<typeof setup>;
function identity(t: T, actor: TrustedActor) {
  return t.withIdentity({
    subject: actor.workosUserId,
    issuer: 'https://api.workos.com/',
    tokenIdentifier: `https://api.workos.com/|${actor.workosUserId}`,
  });
}
function execute(t: T, command: WorkforceCommand, actor = admin, requestId = crypto.randomUUID(), companyId = 1) {
  return identity(t, actor).mutation(api.workforce.api.execute, {
    secret: SECRET,
    actor,
    companyId,
    requestId,
    command,
  });
}
function snapshot(t: T, actor = admin, companyId = 1, from = WEEK, to = '2026-10-03') {
  return identity(t, actor).query(api.workforce.api.snapshot, { secret: SECRET, actor, companyId, from, to, now });
}
function gps() {
  return { latitude: 4.711, longitude: -74.0721, accuracy: 10, timestamp: now };
}
async function fixture(t: T) {
  const site = await execute(t, {
    type: 'saveSite',
    site: {
      name: 'Sede test',
      latitude: 4.711,
      longitude: -74.0721,
      radius: 150,
      tolerance: 30,
      maxAccuracy: 100,
      maxAgeSeconds: 60,
      active: true,
    },
    expectedRevision: 0,
  });
  const group = await execute(t, {
    type: 'saveGroup',
    group: {
      name: 'Grupo test',
      description: '',
      managerIds: [manager.userId],
      siteIds: [site.recordId!],
      active: true,
    },
    expectedRevision: 0,
  });
  const employee = await execute(t, {
    type: 'saveEmployee',
    employee: {
      code: 'T001',
      name: 'Ana test',
      job: 'Operaciones',
      active: true,
      linkedUserId: worker.userId,
      agreement: { dailyMinutes: 480, weeklyMinutes: 2520, restDay: 0 },
    },
    expectedRevision: 0,
  });
  await t.run((ctx) =>
    ctx.db.insert('wfMemberships', {
      companyId: 1,
      employeeId: employee.recordId!,
      groupId: group.recordId!,
      effectiveFrom: WEEK,
    }),
  );
  return { siteId: site.recordId!, groupId: group.recordId!, employeeId: employee.recordId! };
}
function change(
  ids: { employeeId: string; groupId: string },
  date = '2026-09-25',
  start = '08:00',
  end = '16:00',
): ScheduleChange {
  return {
    ...ids,
    date,
    blocks: [
      {
        start: bogotaTimestamp(date, start),
        end: bogotaTimestamp(end < start ? addDays(date, 1) : date, end),
        label: 'Turno',
        color: '#3b82f6',
      },
    ],
    observation: '',
    isRest: false,
    expectedRevision: 0,
  };
}

beforeEach(() => {
  now = bogotaTimestamp('2026-09-25', '12:00');
  vi.spyOn(Date, 'now').mockImplementation(() => now);
});
afterEach(() => vi.restoreAllMocks());

describe('workforce trust boundary and scoped reads', () => {
  test('scheduling-only users receive no attendance or GPS while check-in supervisors see current sessions', async () => {
    const t = setup();
    const ids = await fixture(t);
    await execute(t, { type: 'saveSchedule', changes: [change(ids)], preview: false });
    await execute(t, { type: 'mark', mode: 'self', kind: 'IN', gps: gps(), reason: '', expectedRevision: 0 }, worker);
    const schedulingManager = await snapshot(t, { ...manager, permissions: ['workforce/scheduling'] });
    expect(schedulingManager.schedules).toHaveLength(1);
    expect(schedulingManager.attendance).toHaveLength(0);
    expect(schedulingManager.marks).toHaveLength(0);
    const schedulingWorker = await snapshot(t, { ...worker, permissions: ['workforce/scheduling'] });
    expect(schedulingWorker.attendance).toHaveLength(0);
    expect(schedulingWorker.marks).toHaveLength(0);
    const supervisor = await snapshot(t, { ...manager, permissions: ['workforce/check-in'] });
    expect(supervisor.attendance[0].openEntry).toBeDefined();
    expect(supervisor.marks).toHaveLength(0);
  });
  test('requires bridge secret, JWT subject, module permission and company independently', async () => {
    const t = setup();
    const args = { secret: SECRET, actor: admin, companyId: 1, from: WEEK, to: '2026-09-26', now };
    await expect(t.query(api.workforce.api.snapshot, args)).rejects.toThrow('identidad');
    await expect(
      identity(t, admin).query(api.workforce.api.snapshot, { ...args, secret: 'browser-forgery' }),
    ).rejects.toThrow('intermediario');
    await expect(identity(t, worker).query(api.workforce.api.snapshot, args)).rejects.toThrow('identidad');
    await expect(snapshot(t, { ...worker, permissions: [] })).rejects.toThrow('Talento humano');
    await expect(snapshot(t, worker, 2)).rejects.toThrow('Empresa');
  });
  test('strict commands reject injected authority and invalid GPS', async () => {
    const t = setup();
    const args = {
      secret: SECRET,
      actor: admin,
      companyId: 1,
      requestId: crypto.randomUUID(),
      command: { type: 'seedDemo', actorId: 'other' },
    };
    await expect(identity(t, admin).mutation(api.workforce.api.execute, args)).rejects.toThrow();
    await expect(
      execute(
        t,
        { type: 'mark', mode: 'self', kind: 'IN', gps: { ...gps(), latitude: 100 }, reason: '', expectedRevision: 0 },
        worker,
      ),
    ).rejects.toThrow();
  });
  test('workers see only their records and managers cannot mutate another group', async () => {
    const t = setup();
    const ids = await fixture(t);
    const other = await execute(t, {
      type: 'saveEmployee',
      employee: {
        code: 'OTHER',
        name: 'Other worker',
        job: '',
        active: true,
        agreement: { dailyMinutes: 480, weeklyMinutes: 2520, restDay: 0 },
      },
      expectedRevision: 0,
    });
    const otherGroup = await execute(t, {
      type: 'saveGroup',
      group: { name: 'Otro', description: '', managerIds: ['other-manager'], siteIds: [ids.siteId], active: true },
      expectedRevision: 0,
    });
    await t.run((ctx) =>
      ctx.db.insert('wfMemberships', {
        companyId: 1,
        employeeId: other.recordId!,
        groupId: otherGroup.recordId!,
        effectiveFrom: WEEK,
      }),
    );
    expect((await snapshot(t, worker)).employees.map((e) => e.id)).toEqual([ids.employeeId]);
    await expect(
      execute(
        t,
        {
          type: 'saveSchedule',
          changes: [change({ employeeId: other.recordId!, groupId: otherGroup.recordId! })],
          preview: false,
        },
        manager,
      ),
    ).rejects.toThrow('grupo');
    await expect(
      execute(
        t,
        {
          type: 'saveGroup',
          group: { name: 'Nuevo', description: '', managerIds: [manager.userId], siteIds: [], active: true },
          expectedRevision: 0,
        },
        manager,
      ),
    ).rejects.toThrow('Talento humano');
  });
  test('supervisors discover overdue sessions outside the selected calendar range', async () => {
    const t = setup();
    const ids = await fixture(t);
    await execute(t, { type: 'mark', mode: 'self', kind: 'IN', gps: gps(), reason: '', expectedRevision: 0 }, worker);
    now = bogotaTimestamp('2026-10-01', '08:00');
    const snap = await snapshot(t, manager, 1, '2026-09-27', '2026-10-03');
    expect(snap.attendance.find((d) => d.employeeId === ids.employeeId)?.date).toBe('2026-09-25');
    expect(snap.attendance[0].openEntry).toBeDefined();
  });
});

describe('catalog, schedules and deterministic writes', () => {
  test('enforces unique active links, revision checks and payload-bound request IDs', async () => {
    const t = setup();
    const ids = await fixture(t);
    const employee = (await snapshot(t)).employees[0];
    const { id, companyId: ignored, revision: rev, ...fields } = employee;
    void ignored;
    await expect(
      execute(t, { type: 'saveEmployee', employee: { ...fields, code: 'T002' }, expectedRevision: 0 }),
    ).rejects.toThrow('vinculada');
    const command: WorkforceCommand = {
      type: 'saveEmployee',
      employee: { ...fields, id, name: 'Actualizado' },
      expectedRevision: rev,
    };
    const requestId = crypto.randomUUID();
    const first = await execute(t, command, admin, requestId);
    expect(await execute(t, command, admin, requestId)).toEqual(first);
    await expect(
      execute(t, { ...command, employee: { ...command.employee, name: 'Otro' } }, admin, requestId),
    ).rejects.toThrow('otra operación');
    await expect(execute(t, command)).rejects.toThrow('otra sesión');
    expect((await snapshot(t)).employees.find((e) => e.id === ids.employeeId)?.revision).toBe(2);
  });
  test('preview is nonmutating and persisted classification matches preview', async () => {
    const t = setup();
    const ids = await fixture(t);
    const command = { type: 'saveSchedule' as const, changes: [change(ids)], preview: true };
    const before = await t.run((ctx) => ctx.db.query('wfRequests').take(100));
    const preview = await execute(t, command);
    expect((await snapshot(t)).schedules).toHaveLength(0);
    expect((await t.run((ctx) => ctx.db.query('wfRequests').take(100))).length).toBe(before.length);
    const saved = await execute(t, { ...command, preview: false });
    expect(saved.results).toEqual(preview.results);
    expect((await snapshot(t)).schedules[0].planned.totalMinutes).toBe(420);
  });
  test('neighboring overnight collisions roll back the entire batch', async () => {
    const t = setup();
    const ids = await fixture(t);
    await execute(t, { type: 'saveSchedule', changes: [change(ids, '2026-09-25', '22:00', '06:00')], preview: false });
    await expect(
      execute(t, {
        type: 'saveSchedule',
        changes: [change(ids, '2026-09-26', '05:00', '09:00'), change(ids, '2026-09-27')],
        preview: false,
      }),
    ).rejects.toThrow('superpuestos');
    expect((await snapshot(t)).schedules).toHaveLength(1);
  });
  test('extra limits and multiple-block observations are enforced server-side', async () => {
    const t = setup();
    const ids = await fixture(t);
    await expect(
      execute(t, { type: 'saveSchedule', changes: [change(ids, '2026-09-25', '06:00', '19:00')], preview: false }),
    ).rejects.toThrow('límite');
    const split = change(ids);
    split.blocks = [
      { ...split.blocks[0], end: bogotaTimestamp(split.date, '12:00') },
      { ...split.blocks[0], start: bogotaTimestamp(split.date, '13:00') },
    ];
    await expect(execute(t, { type: 'saveSchedule', changes: [split], preview: false })).rejects.toThrow('observación');
    split.observation = 'Jornada dividida';
    await execute(t, { type: 'saveSchedule', changes: [split], preview: false });
    expect((await snapshot(t)).schedules[0].planned.mealMinutes).toBe(0);
  });
  test('recurrence is finite and same series can be safely replayed', async () => {
    const t = setup();
    const ids = await fixture(t);
    const command: WorkforceCommand = {
      type: 'saveSchedule',
      changes: [change(ids)],
      recurrence: { endDate: '2026-10-09', everyWeeks: 1 },
      preview: false,
    };
    await execute(t, command);
    await execute(t, command);
    const rows = await t.run((ctx) => ctx.db.query('wfSchedules').take(100));
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.revision === 1)).toBe(true);
    expect(await t.run((ctx) => ctx.db.query('wfRecurrences').take(100))).toHaveLength(1);
  });
  test('effective transfer preserves history and moves compatible future schedules', async () => {
    const t = setup();
    const ids = await fixture(t);
    const other = await execute(t, {
      type: 'saveGroup',
      group: { name: 'Destino', description: '', managerIds: [manager.userId], siteIds: [ids.siteId], active: true },
      expectedRevision: 0,
    });
    await execute(t, { type: 'saveSchedule', changes: [change(ids, '2026-09-26')], preview: false });
    await execute(t, {
      type: 'transferMember',
      employeeId: ids.employeeId,
      groupId: other.recordId!,
      effectiveFrom: '2026-09-26',
      reason: 'Traslado efectivo',
      expectedRevision: 1,
    });
    const snap = await snapshot(t);
    expect(snap.memberships.find((m) => m.groupId === ids.groupId)?.effectiveTo).toBe('2026-09-25');
    expect(snap.schedules[0].groupId).toBe(other.recordId);
    expect(snap.employees[0].revision).toBe(2);
  });
  test("weekly recalculation cannot leak a transferred employee's other group schedules", async () => {
    const t = setup();
    const ids = await fixture(t);
    const other = await execute(t, {
      type: 'saveGroup',
      group: { name: 'Reservado', description: '', managerIds: ['other-manager'], siteIds: [ids.siteId], active: true },
      expectedRevision: 0,
    });
    await execute(t, { type: 'saveSchedule', changes: [change(ids, '2026-09-28')], preview: false });
    await execute(t, {
      type: 'transferMember',
      employeeId: ids.employeeId,
      groupId: other.recordId!,
      effectiveFrom: '2026-09-27',
      reason: 'Traslado futuro',
      expectedRevision: 1,
    });
    const result = await execute(
      t,
      { type: 'saveSchedule', changes: [change(ids, '2026-09-25')], preview: true },
      manager,
    );
    expect(result.results?.map((r) => r.date)).toEqual(['2026-09-25']);
  });
});

describe('GPS and auditable attendance', () => {
  test('atomic GPS entry, replay, duplicate protection, exit and partial totals', async () => {
    const t = setup();
    const ids = await fixture(t);
    await execute(t, { type: 'saveSchedule', changes: [change(ids)], preview: false });
    const command: WorkforceCommand = {
      type: 'mark',
      mode: 'self',
      kind: 'IN',
      gps: gps(),
      reason: '',
      expectedRevision: 0,
    };
    const requestId = crypto.randomUUID();
    const first = await execute(t, command, worker, requestId);
    now += 120_000;
    expect(await execute(t, command, worker, requestId)).toEqual(first);
    let snap = await snapshot(t, worker);
    expect(snap.marks).toHaveLength(1);
    expect(snap.attendance[0].actual.totalMinutes).toBe(0);
    await expect(execute(t, { ...command, gps: gps() }, worker)).rejects.toThrow('entrada abierta');
    now = bogotaTimestamp('2026-09-25', '16:00');
    await execute(
      t,
      {
        type: 'mark',
        mode: 'self',
        kind: 'OUT',
        gps: gps(),
        reason: '',
        expectedRevision: snap.attendance[0].revision,
      },
      worker,
    );
    snap = await snapshot(t, worker);
    expect(snap.attendance[0].openEntry).toBeUndefined();
    expect(snap.attendance[0].actual.totalMinutes).toBe(240);
    expect(snap.marks[0].gps?.siteId).toBe(ids.siteId);
    expect(await t.run((ctx) => ctx.db.query('wfSessions').take(10))).toHaveLength(0);
  });
  test('invalid/outside GPS cannot partially create a mark or request', async () => {
    const t = setup();
    await fixture(t);
    for (const fix of [
      { ...gps(), timestamp: now - 61_000 },
      { ...gps(), accuracy: 101 },
      { ...gps(), latitude: 5.71 },
    ]) {
      await expect(
        execute(t, { type: 'mark', mode: 'self', kind: 'IN', gps: fix, reason: '', expectedRevision: 0 }, worker),
      ).rejects.toThrow();
    }
    expect((await snapshot(t)).marks).toHaveLength(0);
    expect(await t.run((ctx) => ctx.db.query('wfSessions').take(10))).toHaveLength(0);
  });
  test("late entry and exit remain on yesterday's overnight jornada", async () => {
    const t = setup();
    const ids = await fixture(t);
    await execute(t, { type: 'saveSchedule', changes: [change(ids, '2026-09-25', '22:00', '06:00')], preview: false });
    now = bogotaTimestamp('2026-09-26', '00:30');
    await execute(t, { type: 'mark', mode: 'self', kind: 'IN', gps: gps(), reason: '', expectedRevision: 0 }, worker);
    let day = (await snapshot(t, worker)).attendance[0];
    expect(day.date).toBe('2026-09-25');
    now = bogotaTimestamp('2026-09-26', '06:00');
    await execute(
      t,
      { type: 'mark', mode: 'self', kind: 'OUT', gps: gps(), reason: '', expectedRevision: day.revision },
      worker,
    );
    day = (await snapshot(t, worker)).attendance[0];
    expect(day.date).toBe('2026-09-25');
    expect(day.actual.totalMinutes).toBe(330);
  });
  test('explicit shift site restriction cannot be bypassed by another eligible group site', async () => {
    const t = setup();
    const ids = await fixture(t);
    const far = await execute(t, {
      type: 'saveSite',
      site: {
        name: 'Lejana',
        latitude: 6,
        longitude: -74,
        radius: 150,
        tolerance: 30,
        maxAccuracy: 100,
        maxAgeSeconds: 60,
        active: true,
      },
      expectedRevision: 0,
    });
    const group = (await snapshot(t)).groups[0];
    await execute(t, {
      type: 'saveGroup',
      group: {
        id: group.id,
        name: group.name,
        description: group.description,
        managerIds: group.managerIds,
        siteIds: [ids.siteId, far.recordId!],
        active: true,
      },
      expectedRevision: group.revision,
    });
    await execute(t, { type: 'saveSchedule', changes: [{ ...change(ids), siteId: far.recordId }], preview: false });
    await expect(
      execute(t, { type: 'mark', mode: 'self', kind: 'IN', gps: gps(), reason: '', expectedRevision: 0 }, worker),
    ).rejects.toThrow();
  });
  test('supervisor recording identifies its GPS owner and demands a reason', async () => {
    const t = setup();
    const ids = await fixture(t);
    await expect(
      execute(
        t,
        {
          type: 'mark',
          mode: 'supervisor',
          employeeId: ids.employeeId,
          kind: 'IN',
          gps: gps(),
          reason: '',
          expectedRevision: 0,
        },
        manager,
      ),
    ).rejects.toThrow('motivo');
    await execute(
      t,
      {
        type: 'mark',
        mode: 'supervisor',
        employeeId: ids.employeeId,
        kind: 'IN',
        gps: gps(),
        reason: 'Asistencia supervisada',
        expectedRevision: 0,
      },
      manager,
    );
    const mark = (await snapshot(t)).marks[0];
    expect(mark.origin).toBe('SUPERVISOR_GPS');
    expect(mark.actorId).toBe(manager.userId);
    expect((await snapshot(t)).attendance[0].incidents).toContain('SIN_PROGRAMACION');
  });
  test('manual corrections preserve original evidence and invalidate review', async () => {
    const t = setup();
    const ids = await fixture(t);
    await execute(t, { type: 'saveSchedule', changes: [change(ids, '2026-09-24')], preview: false });
    await execute(t, {
      type: 'manualMark',
      employeeId: ids.employeeId,
      groupId: ids.groupId,
      date: '2026-09-24',
      kind: 'IN',
      timestamp: bogotaTimestamp('2026-09-24', '08:00'),
      reason: 'Soporte validado',
      expectedRevision: 0,
    });
    let snap = await snapshot(t);
    await expect(
      execute(t, {
        type: 'reviewAttendance',
        employeeId: ids.employeeId,
        groupId: ids.groupId,
        date: '2026-09-24',
        resolution: 'Validado',
        expectedRevision: snap.attendance[0].revision,
      }),
    ).rejects.toThrow('Complete');
    await execute(t, {
      type: 'manualMark',
      employeeId: ids.employeeId,
      groupId: ids.groupId,
      date: '2026-09-24',
      kind: 'OUT',
      timestamp: bogotaTimestamp('2026-09-24', '16:00'),
      reason: 'Soporte validado',
      expectedRevision: snap.attendance[0].revision,
    });
    snap = await snapshot(t);
    await execute(t, {
      type: 'reviewAttendance',
      employeeId: ids.employeeId,
      groupId: ids.groupId,
      date: '2026-09-24',
      resolution: 'Soporte conciliado',
      expectedRevision: snap.attendance[0].revision,
    });
    const mark = snap.marks.find((m) => m.kind === 'OUT')!;
    await execute(t, {
      type: 'editMark',
      markId: mark.id,
      excluded: false,
      kind: 'OUT',
      timestamp: bogotaTimestamp('2026-09-24', '16:20'),
      date: '2026-09-24',
      reason: 'Corrección evidencia',
      expectedRevision: mark.revision,
    });
    snap = await snapshot(t);
    expect(snap.marks.find((m) => m.id === mark.id)?.timestamp).toBe(mark.timestamp);
    expect(snap.marks.find((m) => m.id === mark.id)?.effectiveTimestamp).toBe(bogotaTimestamp('2026-09-24', '16:20'));
    expect(snap.attendance[0].status).toBe('PENDING');
    expect(snap.attendance[0].actual.totalMinutes).toBe(440);
  });
});

describe('closing, policy snapshots and demo', () => {
  test('schedule edits invalidate prior review even when actual hours stay unchanged', async () => {
    const t = setup();
    const ids = await fixture(t);
    await execute(t, { type: 'saveSchedule', changes: [change(ids, '2026-09-24')], preview: false });
    await execute(t, {
      type: 'manualMark',
      employeeId: ids.employeeId,
      groupId: ids.groupId,
      date: '2026-09-24',
      kind: 'IN',
      timestamp: bogotaTimestamp('2026-09-24', '08:00'),
      reason: 'Evidencia entrada',
      expectedRevision: 0,
    });
    let day = (await snapshot(t)).attendance[0];
    await execute(t, {
      type: 'manualMark',
      employeeId: ids.employeeId,
      groupId: ids.groupId,
      date: '2026-09-24',
      kind: 'OUT',
      timestamp: bogotaTimestamp('2026-09-24', '16:00'),
      reason: 'Evidencia salida',
      expectedRevision: day.revision,
    });
    day = (await snapshot(t)).attendance[0];
    await execute(t, {
      type: 'reviewAttendance',
      employeeId: ids.employeeId,
      groupId: ids.groupId,
      date: '2026-09-24',
      resolution: 'Asistencia revisada',
      expectedRevision: day.revision,
    });
    const schedule = (await snapshot(t)).schedules[0];
    await execute(t, {
      type: 'saveSchedule',
      changes: [{ ...change(ids, '2026-09-24', '09:00', '17:00'), expectedRevision: schedule.revision }],
      preview: false,
    });
    day = (await snapshot(t)).attendance[0];
    expect(day.status).toBe('PENDING');
    expect(day.incidents).toContain('DIFERENCIA_HORARIO');
    expect(day.actual.totalMinutes).toBe(420);
  });
  test('an overtime incident in the next quincena cannot block GPS by rewriting closed snapshots', async () => {
    const t = setup();
    const ids = await fixture(t);
    now = bogotaTimestamp('2026-10-02', '07:00');
    for (const date of ['2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01']) {
      await execute(t, {
        type: 'manualMark',
        employeeId: ids.employeeId,
        groupId: ids.groupId,
        date,
        kind: 'IN',
        timestamp: bogotaTimestamp(date, '08:00'),
        reason: 'Soporte original',
        expectedRevision: 0,
      });
      let day = (await snapshot(t)).attendance.find((d) => d.date === date)!;
      await execute(t, {
        type: 'manualMark',
        employeeId: ids.employeeId,
        groupId: ids.groupId,
        date,
        kind: 'OUT',
        timestamp: bogotaTimestamp(date, '19:00'),
        reason: 'Soporte original',
        expectedRevision: day.revision,
      });
      day = (await snapshot(t)).attendance.find((d) => d.date === date)!;
      await execute(t, {
        type: 'reviewAttendance',
        employeeId: ids.employeeId,
        groupId: ids.groupId,
        date,
        resolution: 'Jornada verificada con soporte',
        expectedRevision: day.revision,
      });
    }
    await execute(t, {
      type: 'closePeriod',
      groupId: ids.groupId,
      periodStart: '2026-09-16',
      reason: 'Revisar',
      expectedRevision: 0,
    });
    await execute(t, {
      type: 'closePeriod',
      groupId: ids.groupId,
      periodStart: '2026-09-16',
      reason: 'Cerrar',
      expectedRevision: 1,
    });
    const frozen = (await snapshot(t)).attendance.filter((d) => d.date < '2026-10-01');
    now = bogotaTimestamp('2026-10-02', '08:00');
    await execute(t, { type: 'mark', mode: 'self', kind: 'IN', gps: gps(), reason: '', expectedRevision: 0 }, worker);
    const open = (await snapshot(t)).attendance.find((d) => d.date === '2026-10-02')!;
    now = bogotaTimestamp('2026-10-02', '19:00');
    await execute(
      t,
      { type: 'mark', mode: 'self', kind: 'OUT', gps: gps(), reason: '', expectedRevision: open.revision },
      worker,
    );
    const snap = await snapshot(t);
    expect(snap.attendance.filter((d) => d.date < '2026-10-01')).toEqual(frozen);
    const actual = snap.attendance.find((d) => d.date === '2026-10-02')!;
    expect(actual.actual.totalMinutes).toBe(600);
    expect(actual.incidents.some((i) => i.includes('extra'))).toBe(true);
  });
  test('duplicate concurrent entries produce one session and one immutable mark', async () => {
    const t = setup();
    await fixture(t);
    const command: WorkforceCommand = {
      type: 'mark',
      mode: 'self',
      kind: 'IN',
      gps: gps(),
      reason: '',
      expectedRevision: 0,
    };
    const attempts = await Promise.allSettled([execute(t, command, worker), execute(t, command, worker)]);
    expect(attempts.filter((a) => a.status === 'fulfilled')).toHaveLength(1);
    expect((await snapshot(t)).marks).toHaveLength(1);
    expect(await t.run((ctx) => ctx.db.query('wfSessions').take(10))).toHaveLength(1);
  });
  test('closing and a late correction cannot both win the same transaction race', async () => {
    const t = setup();
    const ids = await fixture(t);
    await execute(t, { type: 'saveSchedule', changes: [change(ids, '2026-09-24')], preview: false });
    now = bogotaTimestamp('2026-10-01', '12:00');
    await execute(t, {
      type: 'reviewAttendance',
      employeeId: ids.employeeId,
      groupId: ids.groupId,
      date: '2026-09-24',
      confirmedAbsence: true,
      resolution: 'Ausencia confirmada',
      expectedRevision: 0,
    });
    await execute(t, {
      type: 'closePeriod',
      groupId: ids.groupId,
      periodStart: '2026-09-16',
      reason: 'Revisar',
      expectedRevision: 0,
    });
    const attempts = await Promise.allSettled([
      execute(t, {
        type: 'closePeriod',
        groupId: ids.groupId,
        periodStart: '2026-09-16',
        reason: 'Cerrar',
        expectedRevision: 1,
      }),
      execute(t, {
        type: 'manualMark',
        employeeId: ids.employeeId,
        groupId: ids.groupId,
        date: '2026-09-24',
        kind: 'IN',
        timestamp: bogotaTimestamp('2026-09-24', '08:00'),
        reason: 'Evidencia recibida',
        expectedRevision: 1,
      }),
    ]);
    expect(attempts.filter((a) => a.status === 'fulfilled')).toHaveLength(1);
    const snap = await snapshot(t);
    if (snap.closures[0].state === 'CLOSED')
      expect(snap.attendance.every((d) => d.status === 'REVIEWED' && d.openEntry === undefined)).toBe(true);
  });
  test('ended absent shift can be resolved without invented marks, then closed and reopened', async () => {
    const t = setup();
    const ids = await fixture(t);
    await execute(t, { type: 'saveSchedule', changes: [change(ids, '2026-09-24')], preview: false });
    now = bogotaTimestamp('2026-10-01', '12:00');
    await execute(t, {
      type: 'closePeriod',
      groupId: ids.groupId,
      periodStart: '2026-09-16',
      reason: 'Revisión',
      expectedRevision: 0,
    });
    await expect(
      execute(t, {
        type: 'closePeriod',
        groupId: ids.groupId,
        periodStart: '2026-09-16',
        reason: 'Finalizar',
        expectedRevision: 1,
      }),
    ).rejects.toThrow('sin asistencia');
    await execute(t, {
      type: 'reviewAttendance',
      employeeId: ids.employeeId,
      groupId: ids.groupId,
      date: '2026-09-24',
      resolution: 'Ausencia confirmada con el gestor',
      confirmedAbsence: true,
      expectedRevision: 0,
    });
    expect((await snapshot(t)).marks).toHaveLength(0);
    await execute(t, {
      type: 'closePeriod',
      groupId: ids.groupId,
      periodStart: '2026-09-16',
      reason: 'Conciliado',
      expectedRevision: 1,
    });
    const scheduled = (await snapshot(t)).schedules[0];
    await expect(
      execute(t, {
        type: 'saveSchedule',
        changes: [{ ...change(ids, '2026-09-24'), expectedRevision: scheduled.revision }],
        preview: false,
      }),
    ).rejects.toThrow('cerrada');
    await expect(
      execute(
        t,
        {
          type: 'reopenPeriod',
          groupId: ids.groupId,
          periodStart: '2026-09-16',
          reason: 'Corrección',
          expectedRevision: 2,
        },
        manager,
      ),
    ).rejects.toThrow('Talento humano');
    await execute(t, {
      type: 'reopenPeriod',
      groupId: ids.groupId,
      periodStart: '2026-09-16',
      reason: 'Corrección autorizada',
      expectedRevision: 2,
    });
    expect((await snapshot(t)).closures[0].state).toBe('CORRECTION_TH');
  });
  test('grace expired blocks manager correction but allows HR', async () => {
    const t = setup();
    const ids = await fixture(t);
    now = bogotaTimestamp('2026-10-07', '12:00');
    const command: WorkforceCommand = {
      type: 'manualMark',
      employeeId: ids.employeeId,
      groupId: ids.groupId,
      date: '2026-09-24',
      kind: 'IN',
      timestamp: bogotaTimestamp('2026-09-24', '08:00'),
      reason: 'Solicitud tardía',
      expectedRevision: 0,
    };
    await expect(execute(t, command, manager)).rejects.toThrow('cinco días');
    await execute(t, command);
  });
  test('policy versions are immutable and future Sunday effective only', async () => {
    const t = setup();
    await fixture(t);
    const config = (await snapshot(t)).settings;
    await expect(
      execute(t, {
        type: 'saveSettings',
        hrUserIds: [],
        policy: { ...config.policies[0], mealMinutes: 30 },
        reason: 'Cambio',
        expectedRevision: config.revision,
      }),
    ).rejects.toThrow('inmutables');
    await expect(
      execute(t, {
        type: 'saveSettings',
        hrUserIds: [],
        policy: { ...config.policies[0], version: 'v2', effectiveFrom: '2026-09-28' },
        reason: 'Cambio',
        expectedRevision: config.revision,
      }),
    ).rejects.toThrow('domingo');
    await execute(t, {
      type: 'saveSettings',
      hrUserIds: [],
      policy: { ...config.policies[0], version: 'v2', effectiveFrom: '2026-09-27', mealMinutes: 30 },
      reason: 'Nuevo almuerzo',
      expectedRevision: config.revision,
    });
    expect((await snapshot(t)).settings.policies).toHaveLength(2);
  });
  test('explicit demo is deterministic, fictional and includes incomplete/corrected attendance', async () => {
    const t = setup();
    await execute(t, { type: 'seedDemo' });
    await execute(t, { type: 'seedDemo' });
    const snap = await snapshot(t);
    expect(snap.employees).toHaveLength(4);
    expect(snap.templates).toHaveLength(3);
    expect(snap.marks.every((m) => m.origin === 'DEMO' && m.gps === undefined)).toBe(true);
    expect(snap.attendance.some((a) => a.openEntry !== undefined)).toBe(true);
    expect(snap.marks.some((m) => m.effectiveTimestamp !== undefined)).toBe(true);
  });
});
