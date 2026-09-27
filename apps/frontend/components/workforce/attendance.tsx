'use client';

import { Fragment, useState, type FormEvent } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  LockKeyhole,
  Pencil,
  Plus,
  Search,
  UnlockKeyhole,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useWorkforce } from '@/lib/workforce/client';
import { addDays, bogotaDate, bogotaTimestamp, periodFor, weekStart } from '@/lib/workforce/dates';
import { formatMinutes } from '@/lib/workforce/calculation';
import type { AttendanceDay, AttendanceMark, ScheduleDay, WorkforceSnapshot } from '@/lib/workforce/types';
import {
  canAdmin,
  DataState,
  dateLabel,
  Empty,
  errorMessage,
  Field,
  Hours,
  membershipFor,
  Modal,
  Notice,
  Select,
  tableClass,
  timeLabel,
  WorkforceShell,
} from './shared';

import { closureLabels, createAttendanceWorkbook, incidentLabel } from './export';

type Api = ReturnType<typeof useWorkforce>;
type Row = {
  employeeId: string;
  groupId: string;
  date: string;
  schedule?: ScheduleDay;
  attendance?: AttendanceDay;
  marks: AttendanceMark[];
};
const origins: Record<AttendanceMark['origin'], string> = {
  SELF_GPS: 'GPS personal',
  SUPERVISOR_GPS: 'GPS del supervisor',
  MANUAL: 'Corrección manual',
  DEMO: 'Simulado',
};
const structuralIncidents = new Set([
  'ENTRADA_SIN_SALIDA',
  'SALIDA_SIN_ENTRADA',
  'ENTRADA_DUPLICADA',
  'SALIDA_ANTERIOR_ENTRADA',
  'JORNADA_SUPERA_24H',
  'SIN_MARCACIONES',
]);
const hasCompleteMarks = (attendance: AttendanceDay) =>
  attendance.openEntry === undefined && !attendance.incidents.some((i) => structuralIncidents.has(i));

export default function AttendancePage() {
  const [date, setDate] = useState(() => bogotaDate(Date.now()));
  const period = periodFor(date);
  const api = useWorkforce(weekStart(period.start), addDays(weekStart(period.end), 6));
  return (
    <WorkforceShell
      title="Cuadre de asistencia"
      description="Compara la programación con las marcaciones, resuelve novedades y cierra cada quincena por grupo."
      data={api.data}
    >
      <DataState loading={api.isLoading} error={api.error} companyId={api.companyId} retry={api.refresh}>
        {api.data && (
          <Attendance
            key={`${api.companyId}:${period.start}`}
            data={api.data}
            api={api}
            period={period}
            setDate={setDate}
          />
        )}
      </DataState>
    </WorkforceShell>
  );
}
function buildRows(data: WorkforceSnapshot, from: string, to: string) {
  const map = new Map<string, Row>();
  function row(employeeId: string, groupId: string, date: string) {
    const key = `${employeeId}|${date}`;
    let value = map.get(key);
    if (!value) {
      value = { employeeId, groupId, date, marks: [] };
      map.set(key, value);
    }
    return value;
  }
  for (const s of data.schedules) {
    if (s.date >= from && s.date <= to) row(s.employeeId, s.groupId, s.date).schedule = s;
  }
  for (const a of data.attendance) {
    if (a.date >= from && a.date <= to) row(a.employeeId, a.groupId, a.date).attendance = a;
  }
  for (const m of data.marks) {
    if (m.date >= from && m.date <= to) row(m.employeeId, m.groupId, m.date).marks.push(m);
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date) || a.employeeId.localeCompare(b.employeeId));
}
function Attendance({
  data,
  api,
  period,
  setDate,
}: {
  data: WorkforceSnapshot;
  api: Api;
  period: { start: string; end: string };
  setDate: (date: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [pendingOnly, setPendingOnly] = useState(false);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [selected, setSelected] = useState<Row | null>(null);
  const [manual, setManual] = useState(false);
  const [closing, setClosing] = useState<{ groupId: string; reopen: boolean } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const allRows = buildRows(data, period.start, period.end);
  const rows = allRows.filter((row) => {
    const employee = data.employees.find((e) => e.id === row.employeeId);
    return (
      (!groupFilter || row.groupId === groupFilter) &&
      `${employee?.name} ${employee?.code}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()) &&
      (!pendingOnly || row.attendance?.status !== 'REVIEWED')
    );
  });
  const groups = data.groups.filter((g) => !groupFilter || groupFilter === g.id);
  const actualSelected = selected
    ? (allRows.find((r) => r.employeeId === selected.employeeId && r.date === selected.date) ?? selected)
    : null;
  async function exportExcel() {
    setExporting(true);
    setError('');
    try {
      const workbook = await createAttendanceWorkbook({ data, rows, period });
      const bytes = await workbook.xlsx.writeBuffer();
      const url = URL.createObjectURL(
        new Blob([new Uint8Array(bytes)], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
      );
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `asistencia-${period.start}-${period.end}.xlsx`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success('Reporte Excel descargado');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setExporting(false);
    }
  }
  return (
    <div className="space-y-4">
      {error && <Notice danger>{error}</Notice>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="Quincena anterior"
            onClick={() => setDate(addDays(period.start, -1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <strong className="min-w-48 text-center text-sm">
            {dateLabel(period.start)} — {dateLabel(period.end)}
          </strong>
          <Button
            variant="outline"
            size="icon"
            aria-label="Quincena siguiente"
            onClick={() => setDate(addDays(period.end, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={exportExcel} disabled={exporting || !rows.length}>
            <Download className="h-4 w-4" />
            {exporting ? 'Exportando…' : 'Exportar Excel'}
          </Button>
          {(canAdmin(data) || data.capabilities.manage) && (
            <Button size="sm" onClick={() => setManual(true)}>
              <Plus className="h-4 w-4" />
              Marcación manual
            </Button>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-48 flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            aria-label="Buscar trabajador"
            placeholder="Buscar trabajador o código"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select
          className="w-full sm:w-56"
          aria-label="Filtrar grupo"
          value={groupFilter}
          onChange={(e) => setGroupFilter(e.target.value)}
        >
          <option value="">Todos los grupos</option>
          {data.groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </Select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={pendingOnly} onChange={(e) => setPendingOnly(e.target.checked)} />
          Solo pendientes
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        Ventana de gracia hasta el {addDays(period.end, 5)}. Las jornadas pendientes muestran cifras provisionales; los
        registros incompletos requieren conciliación.
      </p>
      {!groups.length ? (
        <Empty
          title="No hay grupos para revisar"
          description="Crea los grupos y programa sus trabajadores para comenzar el cuadre."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className={tableClass}>
            <thead>
              <tr>
                <th>Trabajador</th>
                <th>Fecha</th>
                <th>Programado</th>
                <th>Trabajado</th>
                <th>Diferencia</th>
                <th>Estado</th>
                <th>Revisar</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => {
                const groupRows = rows.filter((r) => r.groupId === group.id);
                const closure = data.closures.find((c) => c.groupId === group.id && c.periodStart === period.start);
                const closed = closure?.state === 'CLOSED';
                return (
                  <Fragment key={group.id}>
                    <tr className="bg-slate-100/80 dark:bg-slate-800/80">
                      <td colSpan={7}>
                        <div className="flex flex-wrap items-center gap-3">
                          <button
                            className="flex items-center gap-2 font-semibold"
                            aria-expanded={!collapsed.includes(group.id)}
                            onClick={() =>
                              setCollapsed((old) =>
                                old.includes(group.id) ? old.filter((id) => id !== group.id) : [...old, group.id],
                              )
                            }
                          >
                            {collapsed.includes(group.id) ? (
                              <ChevronRight className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                            {group.name}
                          </button>
                          <Badge variant="outline">{closureLabels[closure?.state ?? 'OPEN']}</Badge>
                          <span className="text-xs text-muted-foreground">
                            {groupRows.filter((r) => r.attendance?.status !== 'REVIEWED' && !r.schedule?.isRest).length}{' '}
                            pendientes
                          </span>
                          <div className="ml-auto">
                            {closed
                              ? canAdmin(data) && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setClosing({ groupId: group.id, reopen: true })}
                                  >
                                    <UnlockKeyhole className="h-3.5 w-3.5" />
                                    Reabrir
                                  </Button>
                                )
                              : (canAdmin(data) || data.capabilities.manage) && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setClosing({ groupId: group.id, reopen: false })}
                                  >
                                    <LockKeyhole className="h-3.5 w-3.5" />
                                    {closure?.state === 'CLOSING' || closure?.state === 'CORRECTION_TH'
                                      ? 'Finalizar cierre'
                                      : 'Iniciar cierre'}
                                  </Button>
                                )}
                          </div>
                        </div>
                      </td>
                    </tr>
                    {!collapsed.includes(group.id) &&
                      (groupRows.length ? (
                        groupRows.map((row) => {
                          const employee = data.employees.find((e) => e.id === row.employeeId);
                          const actual = row.attendance;
                          const complete = actual && hasCompleteMarks(actual);
                          return (
                            <tr key={`${row.employeeId}:${row.date}`}>
                              <td>
                                <span className="font-medium">{employee?.name}</span>
                                <p className="mt-0.5 text-xs text-muted-foreground">{employee?.code}</p>
                              </td>
                              <td className="whitespace-nowrap">{dateLabel(row.date, true)}</td>
                              <td className="tabular-nums">
                                {row.schedule?.isRest
                                  ? 'Descanso'
                                  : row.schedule
                                    ? formatMinutes(row.schedule.planned.totalMinutes)
                                    : 'Sin turno'}
                              </td>
                              <td className="tabular-nums">
                                {complete
                                  ? formatMinutes(actual.actual.totalMinutes)
                                  : actual?.openEntry !== undefined
                                    ? 'Salida pendiente'
                                    : actual
                                      ? 'Requiere conciliación'
                                      : 'Sin marcaciones'}
                                {complete && actual.status !== 'REVIEWED' && (
                                  <span className="ml-1 text-xs text-muted-foreground">*</span>
                                )}
                              </td>
                              <td className="tabular-nums">
                                {complete && row.schedule
                                  ? formatMinutes(actual.actual.totalMinutes - row.schedule.planned.totalMinutes)
                                  : '—'}
                              </td>
                              <td>
                                {actual?.status === 'REVIEWED' ? (
                                  <Badge variant="secondary">
                                    <CheckCircle2 className="mr-1 h-3 w-3" />
                                    Revisado
                                  </Badge>
                                ) : (
                                  <Badge variant="outline">
                                    {row.schedule?.isRest && !actual
                                      ? 'Descanso'
                                      : !actual || !row.marks.some((mark) => !mark.excluded)
                                        ? 'Sin marcaciones'
                                        : actual.incidents.length
                                          ? `${actual.incidents.length} novedades`
                                          : 'Pendiente de revisión'}
                                  </Badge>
                                )}
                              </td>
                              <td>
                                <Button size="sm" variant="ghost" onClick={() => setSelected(row)}>
                                  <Eye className="h-4 w-4" />
                                  Detalle
                                </Button>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={7} className="text-center text-muted-foreground">
                            Sin jornadas en este periodo o filtro.
                          </td>
                        </tr>
                      ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {actualSelected && <DayReview row={actualSelected} data={data} api={api} onClose={() => setSelected(null)} />}{' '}
      {manual && <ManualMark data={data} api={api} initialDate={period.start} onClose={() => setManual(false)} />}{' '}
      {closing && (
        <CloseForm
          groupId={closing.groupId}
          reopen={closing.reopen}
          period={period}
          data={data}
          api={api}
          onClose={() => setClosing(null)}
        />
      )}
    </div>
  );
}
function DayReview({ row, data, api, onClose }: { row: Row; data: WorkforceSnapshot; api: Api; onClose: () => void }) {
  const [resolution, setResolution] = useState(row.attendance?.resolution ?? '');
  const [meal, setMeal] = useState(String(row.attendance?.mealOverrideMinutes ?? ''));
  const [editing, setEditing] = useState<AttendanceMark | null>(null);
  const [manual, setManual] = useState(false);
  const [error, setError] = useState('');
  const [confirmedAbsence, setConfirmedAbsence] = useState(false);
  const noMarks = !!row.schedule && !row.schedule.isRest && !row.marks.some((mark) => !mark.excluded);
  const closed = data.closures.some(
    (c) => c.groupId === row.groupId && c.periodStart === periodFor(row.date).start && c.state === 'CLOSED',
  );
  const editable = !closed && (canAdmin(data) || data.capabilities.manage);
  const employee = data.employees.find((e) => e.id === row.employeeId);
  async function review(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api.execute({
        type: 'reviewAttendance',
        employeeId: row.employeeId,
        groupId: row.groupId,
        date: row.date,
        expectedRevision: row.attendance?.revision ?? 0,
        resolution,
        ...(noMarks ? { confirmedAbsence } : {}),
        ...(canAdmin(data) && meal !== '' ? { mealOverrideMinutes: Number(meal) } : {}),
      });
      toast.success('Jornada revisada');
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={`${employee?.name} · ${dateLabel(row.date, true)}`}
      description="Las marcaciones originales son inmutables. Cada corrección exige un motivo y queda registrada."
      wide
    >
      <div className="space-y-5">
        {error && <Notice danger>{error}</Notice>}
        {closed && <Notice>Esta quincena está cerrada. Talento humano debe reabrirla antes de corregir.</Notice>}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-semibold">Programación</h3>
            <p className="mb-2 text-sm text-muted-foreground">
              {row.schedule?.blocks.map((b) => `${timeLabel(b.start)}–${timeLabel(b.end)}`).join(' / ') ||
                (row.schedule?.isRest ? 'Descanso' : 'Sin programación')}
            </p>
            <Hours result={row.schedule?.planned} compact />
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold">Trabajo registrado</h3>
            <p className="mb-2 text-sm text-muted-foreground">
              {row.attendance?.blocks.map((b) => `${timeLabel(b.start)}–${timeLabel(b.end)}`).join(' / ') ||
                'Sin pares completos'}
            </p>
            {row.attendance?.openEntry !== undefined ? (
              <strong className="text-sm text-amber-800 dark:text-amber-200">
                Salida pendiente desde {timeLabel(row.attendance.openEntry)}
              </strong>
            ) : row.attendance && !hasCompleteMarks(row.attendance) ? (
              <span className="text-sm text-muted-foreground">Pendiente de conciliación</span>
            ) : (
              <Hours result={row.attendance?.actual} compact />
            )}
          </div>
        </div>
        {row.attendance?.incidents.length ? (
          <Notice>
            <ul className="list-inside list-disc">
              {row.attendance.incidents.map((incident, index) => (
                <li key={index}>{incidentLabel(incident)}</li>
              ))}
            </ul>
          </Notice>
        ) : null}
        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">Marcaciones originales y efectivas</h3>
            {editable && (
              <Button variant="outline" size="sm" onClick={() => setManual(true)}>
                <Plus className="h-3.5 w-3.5" />
                Agregar
              </Button>
            )}
          </div>
          <div className="overflow-x-auto rounded border">
            <table className={tableClass}>
              <thead>
                <tr>
                  <th>Original</th>
                  <th>Interpretación</th>
                  <th>Origen / autor</th>
                  <th>Motivo</th>
                  <th>Editar</th>
                </tr>
              </thead>
              <tbody>
                {row.marks.map((mark) => (
                  <tr key={mark.id} className={mark.excluded ? 'opacity-60' : ''}>
                    <td className="whitespace-nowrap">
                      {mark.kind === 'IN' ? 'Entrada' : 'Salida'} · {bogotaDate(mark.timestamp)}{' '}
                      {timeLabel(mark.timestamp)}
                    </td>
                    <td>
                      {mark.excluded
                        ? 'Excluida'
                        : `${(mark.effectiveKind ?? mark.kind) === 'IN' ? 'Entrada' : 'Salida'} · ${timeLabel(mark.effectiveTimestamp ?? mark.timestamp)}`}
                    </td>
                    <td>
                      <span className="block">{origins[mark.origin]}</span>
                      <span className="text-xs text-muted-foreground">{mark.actorName}</span>
                      {mark.gps && (
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {mark.gps.siteName} · precisión {Math.round(mark.gps.accuracy)} m
                        </span>
                      )}
                    </td>
                    <td className="max-w-48 text-xs">{mark.reason || '—'}</td>
                    <td>
                      {editable && (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Corregir interpretación de marcación"
                          onClick={() => setEditing(mark)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!row.marks.length && <p className="p-4 text-sm text-muted-foreground">No hay marcaciones.</p>}
          </div>
        </div>
        {row.attendance && hasCompleteMarks(row.attendance) && <Hours result={row.attendance.actual} />}
        <form onSubmit={review} className="space-y-4 border-t pt-4">
          {noMarks && editable && (
            <Notice>
              <label className="flex items-start gap-2">
                <input
                  required
                  type="checkbox"
                  className="mt-1"
                  checked={confirmedAbsence}
                  onChange={(e) => setConfirmedAbsence(e.target.checked)}
                />
                <span>
                  Confirmo que el trabajador no asistió. Registrar ausencia con cero horas, sin crear marcaciones. La
                  jornada debe haber terminado.
                </span>
              </label>
            </Notice>
          )}
          {canAdmin(data) && (
            <Field
              label="Corrección de almuerzo (minutos)"
              help="Vacío conserva la regla automática. Solo TH puede modificar esta deducción."
            >
              <Input
                type="number"
                min="0"
                max="180"
                disabled={!editable}
                value={meal}
                onChange={(e) => setMeal(e.target.value)}
                placeholder="Automático"
              />
            </Field>
          )}
          <Field label="Resolución de la revisión">
            <Textarea
              required
              minLength={3}
              disabled={!editable}
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              placeholder="Explica las diferencias y cómo se resolvieron"
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cerrar detalle
            </Button>
            {editable && (
              <Button type="submit" disabled={api.isPending || (noMarks && !confirmedAbsence)}>
                <CheckCircle2 className="h-4 w-4" />
                {noMarks ? 'Confirmar ausencia' : 'Marcar revisado'}
              </Button>
            )}
          </div>
        </form>
      </div>
      {editing && <EditMark mark={editing} api={api} onClose={() => setEditing(null)} />}{' '}
      {manual && (
        <ManualMark
          data={data}
          api={api}
          initialDate={row.date}
          employeeId={row.employeeId}
          onClose={() => setManual(false)}
        />
      )}
    </Modal>
  );
}
function ManualMark({
  data,
  api,
  initialDate,
  employeeId: initialEmployee,
  onClose,
}: {
  data: WorkforceSnapshot;
  api: Api;
  initialDate: string;
  employeeId?: string;
  onClose: () => void;
}) {
  const [employeeId, setEmployeeId] = useState(initialEmployee ?? '');
  const [date, setDate] = useState(initialDate);
  const [markDate, setMarkDate] = useState(initialDate);
  const [time, setTime] = useState('07:00');
  const [kind, setKind] = useState<'IN' | 'OUT'>('IN');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  async function save(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const schedule = data.schedules.find((s) => s.employeeId === employeeId && s.date === date);
      const attendance = data.attendance.find((a) => a.employeeId === employeeId && a.date === date);
      const groupId =
        attendance?.groupId ?? schedule?.groupId ?? membershipFor(data.memberships, employeeId, date)?.groupId;
      if (!groupId) throw new Error('El trabajador no tiene grupo en la fecha de la jornada.');
      await api.execute({
        type: 'manualMark',
        employeeId,
        groupId,
        date,
        kind,
        timestamp: bogotaTimestamp(markDate, time),
        reason,
        expectedRevision: attendance?.revision ?? 0,
      });
      toast.success('Marcación manual registrada');
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title="Agregar marcación manual"
      description="Usa este flujo para conciliar una marcación faltante o un problema de GPS. Horario Bogotá."
    >
      <form className="space-y-4" onSubmit={save}>
        {error && <Notice danger>{error}</Notice>}
        <Field label="Trabajador">
          <Select
            required
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            disabled={!!initialEmployee}
          >
            <option value="">Seleccionar trabajador</option>
            {data.employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Jornada a la que pertenece">
          <Input
            required
            type="date"
            min={data.settings.launchDate}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Fecha de la marcación">
            <Input required type="date" value={markDate} onChange={(e) => setMarkDate(e.target.value)} />
          </Field>
          <Field label="Hora">
            <Input required type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
        </div>
        <Field label="Tipo">
          <Select value={kind} onChange={(e) => setKind(e.target.value as 'IN' | 'OUT')}>
            <option value="IN">Entrada</option>
            <option value="OUT">Salida</option>
          </Select>
        </Field>
        <Field label="Motivo de la corrección">
          <Textarea required minLength={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={api.isPending}>
            Registrar marcación
          </Button>
        </div>
      </form>
    </Modal>
  );
}
function EditMark({ mark, api, onClose }: { mark: AttendanceMark; api: Api; onClose: () => void }) {
  const [date, setDate] = useState(mark.date);
  const [timestampDate, setTimestampDate] = useState(bogotaDate(mark.effectiveTimestamp ?? mark.timestamp));
  const [time, setTime] = useState(timeLabel(mark.effectiveTimestamp ?? mark.timestamp));
  const [kind, setKind] = useState(mark.effectiveKind ?? mark.kind);
  const [excluded, setExcluded] = useState(mark.excluded);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  async function save(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api.execute({
        type: 'editMark',
        markId: mark.id,
        date,
        kind,
        excluded,
        timestamp: bogotaTimestamp(timestampDate, time),
        reason,
        expectedRevision: mark.revision,
      });
      toast.success('Interpretación corregida');
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title="Corregir interpretación"
      description={`Original: ${mark.kind === 'IN' ? 'Entrada' : 'Salida'} · ${bogotaDate(mark.timestamp)} ${timeLabel(mark.timestamp)}. Este registro original se conserva.`}
    >
      <form className="space-y-4" onSubmit={save}>
        {error && <Notice danger>{error}</Notice>}
        <Field label="Asociar a jornada">
          <Input required type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Fecha efectiva">
            <Input required type="date" value={timestampDate} onChange={(e) => setTimestampDate(e.target.value)} />
          </Field>
          <Field label="Hora efectiva">
            <Input required type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
        </div>
        <Field label="Interpretar como">
          <Select value={kind} onChange={(e) => setKind(e.target.value as 'IN' | 'OUT')}>
            <option value="IN">Entrada</option>
            <option value="OUT">Salida</option>
          </Select>
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={excluded} onChange={(e) => setExcluded(e.target.checked)} />
          Excluir del cálculo (desmarcar para restaurar)
        </label>
        <Field label="Motivo">
          <Textarea required minLength={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={api.isPending}>
            Guardar corrección
          </Button>
        </div>
      </form>
    </Modal>
  );
}
function CloseForm({
  groupId,
  reopen,
  period,
  data,
  api,
  onClose,
}: {
  groupId: string;
  reopen: boolean;
  period: { start: string; end: string };
  data: WorkforceSnapshot;
  api: Api;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const closure = data.closures.find((c) => c.groupId === groupId && c.periodStart === period.start);
  const starting = !closure || closure.state === 'OPEN';
  async function save(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api.execute({
        type: reopen ? 'reopenPeriod' : 'closePeriod',
        groupId,
        periodStart: period.start,
        reason,
        expectedRevision: closure?.revision ?? 0,
      });
      toast.success(reopen ? 'Quincena reabierta para corrección TH' : 'Estado de cierre actualizado');
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={reopen ? 'Reabrir quincena' : starting ? 'Iniciar cierre de quincena' : 'Finalizar cierre de quincena'}
      description={`${data.groups.find((g) => g.id === groupId)?.name} · ${period.start} — ${period.end}`}
    >
      <form onSubmit={save} className="space-y-4">
        {error && <Notice danger>{error}</Notice>}
        <Notice>
          {reopen
            ? 'La quincena pasará a Corrección TH. Cada cambio y la nueva revisión quedarán auditados.'
            : starting
              ? 'La quincena pasará a En cierre. Completa la revisión de todas las jornadas y luego selecciona Finalizar cierre.'
              : 'Se comprobará que todas las jornadas estén resueltas, sin sesiones abiertas ni incidencias pendientes. El cierre bloqueará las modificaciones.'}
        </Notice>
        <Field label={reopen ? 'Motivo de reapertura' : 'Observación del cierre'}>
          <Textarea
            required={reopen}
            minLength={reopen ? 3 : undefined}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={api.isPending}>
            {reopen ? 'Reabrir para TH' : starting ? 'Iniciar cierre' : 'Confirmar cierre'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
