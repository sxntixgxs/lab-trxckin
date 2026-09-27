import { describe, expect, it } from 'vitest';
import type { CellValue, Workbook, Worksheet } from 'exceljs';
import JSZip from 'jszip';
import { calculateWeek, CATEGORY_LABELS, DEFAULT_POLICY } from '@/lib/workforce/calculation';
import { bogotaTimestamp } from '@/lib/workforce/dates';
import type { AttendanceDay, AttendanceMark, ScheduleDay, WorkforceSnapshot } from '@/lib/workforce/types';
import { createAttendanceWorkbook, type AttendanceExportRow } from './export';
import { calculateSchedulePreview } from './schedule-helpers';

const period = { start: '2026-09-16', end: '2026-09-30' };
const date = '2026-09-27';

function fixture() {
  const agreement = { dailyMinutes: 480, weeklyMinutes: 2520, restDay: 0 };
  const policy = { ...DEFAULT_POLICY, version: 'server-snapshot-v1' };
  const scheduledBlocks = [
    { start: bogotaTimestamp(date, '05:00'), end: bogotaTimestamp(date, '16:00'), label: 'Festivo', color: '#2563eb' },
  ];
  const actualBlocks = [{ start: bogotaTimestamp(date, '05:00'), end: bogotaTimestamp(date, '18:00') }];
  const planned = calculateWeek([{ id: 's1', date, blocks: scheduledBlocks, agreement, policy }])[0];
  const actual = calculateWeek([{ id: 'a1', date, blocks: actualBlocks, agreement, policy }])[0];
  const schedule: ScheduleDay = {
    id: 's1',
    companyId: 1,
    employeeId: 'e1',
    groupId: 'g1',
    date,
    blocks: scheduledBlocks,
    observation: '',
    isRest: false,
    revision: 2,
    agreement,
    policy,
    planned,
  };
  const attendance: AttendanceDay = {
    id: 'a1',
    companyId: 1,
    employeeId: 'e1',
    groupId: 'g1',
    date,
    scheduleId: 's1',
    blocks: actualBlocks,
    revision: 3,
    status: 'REVIEWED',
    incidents: [],
    resolution: 'Se verificó la extensión de jornada y se documentó el exceso.',
    actual,
    markIds: ['m1'],
  };
  const mark: AttendanceMark = {
    id: 'm1',
    companyId: 1,
    employeeId: 'e1',
    groupId: 'g1',
    date,
    kind: 'IN',
    timestamp: actualBlocks[0].start,
    origin: 'SELF_GPS',
    actorId: 'u1',
    actorName: 'Cuenta ficticia',
    reason: '',
    excluded: false,
    revision: 1,
    gps: {
      latitude: 4.71892347,
      longitude: -74.07319283,
      accuracy: 7.314159,
      timestamp: actualBlocks[0].start,
      siteId: 'private-site-id',
      siteName: 'Sede GPS privada',
      distance: 11.271828,
    },
  };
  const data: WorkforceSnapshot = {
    companyId: 1,
    from: period.start,
    to: period.end,
    employees: [
      {
        id: 'e1',
        companyId: 1,
        code: 'FICT-01',
        name: 'Trabajadora ficticia',
        job: 'Operaria',
        active: true,
        agreement,
        revision: 1,
      },
    ],
    groups: [
      {
        id: 'g1',
        companyId: 1,
        name: 'Operación',
        description: '',
        managerIds: ['u1'],
        siteIds: ['private-site-id'],
        active: true,
        revision: 1,
      },
    ],
    memberships: [],
    sites: [
      {
        id: 'private-site-id',
        companyId: 1,
        name: 'Sede GPS privada',
        latitude: mark.gps!.latitude,
        longitude: mark.gps!.longitude,
        radius: 150,
        tolerance: 30,
        maxAccuracy: 100,
        maxAgeSeconds: 60,
        active: true,
        revision: 1,
      },
    ],
    templates: [],
    schedules: [schedule],
    attendance: [attendance],
    marks: [mark],
    closures: [
      {
        id: 'c1',
        companyId: 1,
        groupId: 'g1',
        periodStart: period.start,
        periodEnd: period.end,
        state: 'CLOSED',
        revision: 2,
      },
    ],
    settings: { companyId: 1, launchDate: '2026-09-20', hrUserIds: ['u1'], policies: [policy], revision: 1 },
    capabilities: { admin: true, hr: true, manage: true, userId: 'u1', userName: 'Cuenta ficticia', permissions: [] },
  };
  const row: AttendanceExportRow = { employeeId: 'e1', groupId: 'g1', date, schedule, attendance };
  return { data, row, mark };
}

async function roundTrip(data: WorkforceSnapshot, rows: AttendanceExportRow[]) {
  const workbook = await createAttendanceWorkbook({ data, rows, period });
  const bytes = await workbook.xlsx.writeBuffer();
  const { default: ExcelJS } = await import('exceljs');
  const parsed = new ExcelJS.Workbook();
  await parsed.xlsx.load(bytes);
  return { parsed, bytes };
}

function record(workbook: Workbook, row: number): Record<string, CellValue> {
  const sheet = workbook.getWorksheet('Detalle quincenal') as Worksheet;
  const values: Record<string, CellValue> = {};
  sheet.getRow(1).eachCell((header, index) => {
    values[String(header.value)] = sheet.getCell(row, index).value;
  });
  return values;
}

describe('attendance XLSX export', () => {
  it('round-trips stored server totals and every category, matching the calculation preview', async () => {
    const { data, row } = fixture();
    const preview = calculateSchedulePreview(data, {}).get(`e1|${date}`)!;
    expect(preview.totals).toEqual(row.schedule!.planned.totals);
    expect(preview.totalMinutes).toBe(row.schedule!.planned.totalMinutes);
    // A later catalog policy must not cause the report to recalculate historical stored results.
    data.settings.policies = [{ ...DEFAULT_POLICY, version: 'later-policy', mealMinutes: 0 }];
    const { parsed } = await roundTrip(data, [row]);
    const exported = record(parsed, 2);
    expect(exported['Programado (min)']).toBe(row.schedule!.planned.totalMinutes);
    expect(exported['Trabajado (min)']).toBe(row.attendance!.actual.totalMinutes);
    expect(exported['Deducción (min)']).toBe(row.attendance!.actual.mealMinutes);
    expect(exported['Diferencia (min)']).toBe(row.attendance!.actual.totalMinutes - row.schedule!.planned.totalMinutes);
    expect(exported['Política']).toBe(row.attendance!.actual.policyVersion);
    expect(exported['Cierre']).toBe('Cerrado');
    expect(parsed.getWorksheet('Información')!.getCell('A1').value).toBe('Empresa (ID)');
    expect(parsed.getWorksheet('Información')!.getCell('B1').value).toBe(data.companyId);
    expect(row.attendance!.incidents).toEqual([]);
    for (const anomaly of row.attendance!.actual.incidents) expect(exported['Incidencias']).toContain(anomaly);
    for (const category of Object.keys(CATEGORY_LABELS) as (keyof typeof CATEGORY_LABELS)[]) {
      expect(exported[`Programado: ${CATEGORY_LABELS[category]} (min)`]).toBe(row.schedule!.planned.totals[category]);
      expect(exported[`Trabajado: ${CATEGORY_LABELS[category]} (min)`]).toBe(row.attendance!.actual.totals[category]);
    }
  });

  it('keeps pending, open and missing attendance actual amounts blank instead of presenting definitive zeroes', async () => {
    const { data, row } = fixture();
    const pending: AttendanceExportRow = {
      ...row,
      attendance: { ...row.attendance!, status: 'PENDING', incidents: ['DIFERENCIA_HORARIO'] },
    };
    const incomplete: AttendanceExportRow = {
      ...row,
      attendance: {
        ...row.attendance!,
        status: 'PENDING',
        openEntry: bogotaTimestamp(date, '05:00'),
        incidents: ['ENTRADA_SIN_SALIDA'],
      },
    };
    const missing: AttendanceExportRow = { ...row, attendance: undefined };
    const { parsed } = await roundTrip(data, [pending, incomplete, missing]);
    for (const rowNumber of [2, 3, 4]) {
      const exported = record(parsed, rowNumber);
      expect(exported['Programado (min)']).toBe(row.schedule!.planned.totalMinutes);
      expect(exported['Estado revisión']).toBe('Pendiente');
      for (const header of [
        'Trabajado (min)',
        'Deducción (min)',
        'Diferencia (min)',
        ...Object.values(CATEGORY_LABELS).map((label) => `Trabajado: ${label} (min)`),
      ]) {
        expect(exported[header]).toBeNull();
      }
    }
    expect(record(parsed, 3)['Incidencias']).toContain('Entrada sin salida');
  });

  it('retains calculation anomalies after review, alongside a deduplicated incident list and the resolution', async () => {
    const { data, row } = fixture();
    expect(row.attendance!.actual.incidents.length).toBeGreaterThan(0);
    const anomaly = row.attendance!.actual.incidents[0];
    row.attendance!.incidents = [anomaly, 'DIFERENCIA_HORARIO'];
    const { parsed } = await roundTrip(data, [row]);
    const exported = record(parsed, 2);
    const incidents = String(exported['Incidencias']);
    expect(incidents.split(anomaly).length - 1).toBe(1);
    expect(incidents).toContain('Diferencia con el horario programado');
    expect(exported['Resolución']).toBe(row.attendance!.resolution);
  });

  it('never writes GPS evidence or private site coordinates anywhere in the XLSX archive', async () => {
    const { data, row, mark } = fixture();
    const { bytes } = await roundTrip(data, [row]);
    const archive = await JSZip.loadAsync(bytes);
    const xml = (
      await Promise.all(
        Object.values(archive.files)
          .filter((file) => !file.dir && file.name.endsWith('.xml'))
          .map((file) => file.async('string')),
      )
    ).join('\n');
    for (const privateValue of [
      mark.gps!.latitude,
      mark.gps!.longitude,
      mark.gps!.accuracy,
      mark.gps!.distance,
      mark.gps!.siteId,
      mark.gps!.siteName,
    ]) {
      expect(xml).not.toContain(String(privateValue));
    }
    const { parsed } = await roundTrip(data, [row]);
    const headers = Object.keys(record(parsed, 2));
    expect(
      headers.some((header) => /latitud|longitud|latitude|longitude|precisión|accuracy|distancia/i.test(header)),
    ).toBe(false);
  });
});
