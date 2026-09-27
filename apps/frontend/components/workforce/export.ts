import { CATEGORY_LABELS } from '@/lib/workforce/calculation';
import type { AttendanceDay, Closure, ScheduleDay, WorkforceSnapshot } from '@/lib/workforce/types';

export type AttendanceExportRow = {
  employeeId: string;
  groupId: string;
  date: string;
  schedule?: ScheduleDay;
  attendance?: AttendanceDay;
};

export const closureLabels: Record<Closure['state'], string> = {
  OPEN: 'Abierto',
  CLOSING: 'En cierre',
  CLOSED: 'Cerrado',
  CORRECTION_TH: 'Corrección TH',
};

const incidentLabels: Record<string, string> = {
  ENTRADA_SIN_SALIDA: 'Entrada sin salida',
  SALIDA_SIN_ENTRADA: 'Salida sin entrada',
  ENTRADA_DUPLICADA: 'Entrada duplicada',
  SALIDA_ANTERIOR_ENTRADA: 'La salida es anterior a la entrada',
  JORNADA_SUPERA_24H: 'La jornada supera 24 horas',
  SIN_MARCACIONES: 'Sin marcaciones',
  SIN_PROGRAMACION: 'Sin programación',
  DIFERENCIA_HORARIO: 'Diferencia con el horario programado',
};
export const incidentLabel = (value: string) => incidentLabels[value] ?? value;

/** Export only stored server calculations. Pending records deliberately have blank actual amounts. */
export async function createAttendanceWorkbook({
  data,
  rows,
  period,
}: {
  data: WorkforceSnapshot;
  rows: AttendanceExportRow[];
  period: { start: string; end: string };
}) {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Talento humano';
  const sheet = workbook.addWorksheet('Detalle quincenal');
  const categories = Object.keys(CATEGORY_LABELS) as (keyof typeof CATEGORY_LABELS)[];
  sheet.addRow([
    'Código',
    'Trabajador',
    'Grupo',
    'Fecha',
    'Programado (min)',
    'Trabajado (min)',
    'Deducción (min)',
    'Diferencia (min)',
    'Estado revisión',
    'Cierre',
    'Incidencias',
    'Resolución',
    'Política',
    ...categories.map((c) => `Programado: ${CATEGORY_LABELS[c]} (min)`),
    ...categories.map((c) => `Trabajado: ${CATEGORY_LABELS[c]} (min)`),
  ]);
  for (const row of rows) {
    const employee = data.employees.find((e) => e.id === row.employeeId);
    const closure = data.closures.find((c) => c.groupId === row.groupId && c.periodStart === period.start);
    const definitive = row.attendance?.status === 'REVIEWED' && row.attendance.openEntry === undefined;
    sheet.addRow([
      employee?.code,
      employee?.name,
      data.groups.find((g) => g.id === row.groupId)?.name,
      row.date,
      row.schedule?.planned.totalMinutes ?? 0,
      definitive ? row.attendance?.actual.totalMinutes : null,
      definitive ? row.attendance?.actual.mealMinutes : null,
      definitive ? (row.attendance?.actual.totalMinutes ?? 0) - (row.schedule?.planned.totalMinutes ?? 0) : null,
      row.attendance?.status === 'REVIEWED' ? 'Revisado' : 'Pendiente',
      closureLabels[closure?.state ?? 'OPEN'],
      [...new Set([...(row.attendance?.incidents ?? []), ...(row.attendance?.actual.incidents ?? [])])]
        .map(incidentLabel)
        .join('; '),
      row.attendance?.resolution ?? '',
      row.attendance?.actual.policyVersion ?? row.schedule?.policy.version ?? '',
      ...categories.map((c) => row.schedule?.planned.totals[c] ?? 0),
      ...categories.map((c) => (definitive ? (row.attendance?.actual.totals[c] ?? 0) : null)),
    ]);
  }
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: 'A1', to: { row: 1, column: sheet.columnCount } };
  sheet.columns.forEach((column, index) => {
    column.width = index === 1 || index === 10 || index === 11 ? 30 : 22;
  });
  const info = workbook.addWorksheet('Información');
  info.addRows([
    ['Empresa (ID)', data.companyId],
    ['Periodo', `${period.start} a ${period.end}`],
    ['Zona horaria', 'America/Bogota'],
    ['Unidad', 'Minutos completos, sin liquidación monetaria'],
    ['Pendientes', 'Las horas trabajadas y categorías quedan vacías hasta que la jornada esté revisada.'],
    ['Privacidad', 'Este reporte no incluye coordenadas GPS.'],
    ['Generado', new Date().toISOString()],
  ]);
  info.columns = [{ width: 22 }, { width: 95 }];
  return workbook;
}
