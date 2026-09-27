'use client';

import { Fragment, useMemo, useRef, useState, type FormEvent, type MouseEvent } from 'react';
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Eye,
  Pencil,
  Plus,
  Redo2,
  Save,
  Search,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useWorkforce } from '@/lib/workforce/client';
import { addDays, bogotaDate, bogotaTimestamp, datesBetween, weekStart } from '@/lib/workforce/dates';
import { formatMinutes } from '@/lib/workforce/calculation';
import type {
  CalculationResult,
  CommandResult,
  ScheduleChange,
  ScheduledBlock,
  ShiftTemplate,
  WorkforceSnapshot,
} from '@/lib/workforce/types';
import { cn } from '@/lib/utils';
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
  useUnsavedGuard,
  useWorkforceNow,
  WorkforceShell,
} from './shared';
import { Groups } from './groups';
import { calculateSchedulePreview, selectedRectangle } from './schedule-helpers';

type Api = ReturnType<typeof useWorkforce>;
type Drafts = Record<string, ScheduleChange>;
const cellKey = (employeeId: string, date: string) => `${employeeId}|${date}`;
export default function SchedulingPage() {
  const [week, setWeek] = useState(() => weekStart(bogotaDate(Date.now())));
  const api = useWorkforce(addDays(week, -7), addDays(week, 7));
  return (
    <WorkforceShell
      title="Gestión de turnos"
      description="Organiza los grupos, programa la semana y revisa la distribución de horas antes de guardar."
      data={api.data}
    >
      <DataState loading={api.isLoading} error={api.error} companyId={api.companyId} retry={api.refresh}>
        {api.data && (
          <Scheduling key={`${api.companyId}:${week}`} data={api.data} api={api} week={week} setWeek={setWeek} />
        )}
      </DataState>
    </WorkforceShell>
  );
}
function Scheduling({
  data,
  api,
  week,
  setWeek,
}: {
  data: WorkforceSnapshot;
  api: Api;
  week: string;
  setWeek: (date: string) => void;
}) {
  const days = useMemo(() => datesBetween(week, addDays(week, 6)), [week]);
  const today = bogotaDate(useWorkforceNow());
  const [tab, setTab] = useState('calendar');
  const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Drafts>({});
  const [past, setPast] = useState<Drafts[]>([]);
  const [future, setFuture] = useState<Drafts[]>([]);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const anchor = useRef<string | null>(null);
  const [append, setAppend] = useState(false);
  const [note, setNote] = useState('');
  const [recurrence, setRecurrence] = useState(false);
  const [repeatEnd, setRepeatEnd] = useState(addDays(week, 13));
  const [editingCell, setEditingCell] = useState<ScheduleChange | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<ShiftTemplate | 'new' | null>(null);
  const [preview, setPreview] = useState<CommandResult | null>(null);
  const [error, setError] = useState('');
  const dirty = Object.keys(drafts).length > 0;
  useUnsavedGuard(dirty);
  const allowed = canAdmin(data) || data.capabilities.manage;
  const groups = data.groups.filter(
    (g) =>
      (g.active || data.schedules.some((s) => s.groupId === g.id && s.date >= week && s.date <= days[6])) &&
      (!groupFilter || g.id === groupFilter),
  );
  const visibleEmployees = data.employees.filter(
    (e) =>
      (e.active || data.schedules.some((s) => s.employeeId === e.id && s.date >= week && s.date <= days[6])) &&
      `${e.name} ${e.code}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  );
  function base(employeeId: string, date: string): ScheduleChange | null {
    const existing = data.schedules.find((s) => s.employeeId === employeeId && s.date === date);
    const member = membershipFor(data.memberships, employeeId, date);
    if (!member && !existing) return null;
    return {
      employeeId,
      date,
      groupId: member?.groupId ?? existing!.groupId,
      blocks: existing?.blocks ?? [],
      siteId: existing?.siteId,
      observation: existing?.observation ?? '',
      isRest: existing?.isRest ?? false,
      expectedRevision: existing?.revision ?? 0,
    };
  }
  function current(employeeId: string, date: string) {
    return drafts[cellKey(employeeId, date)] ?? base(employeeId, date);
  }
  function change(next: Drafts) {
    setPast((history) => [...history, drafts].slice(-50));
    setFuture([]);
    setDrafts(next);
    setPreview(null);
    setError('');
  }
  function undo() {
    const previous = past.at(-1);
    if (!previous) return;
    setFuture((f) => [drafts, ...f].slice(0, 50));
    setDrafts(previous);
    setPast((p) => p.slice(0, -1));
    setPreview(null);
  }
  function redo() {
    const next = future[0];
    if (!next) return;
    setPast((p) => [...p, drafts].slice(-50));
    setDrafts(next);
    setFuture((f) => f.slice(1));
    setPreview(null);
  }
  const calculations = useMemo(() => calculateSchedulePreview(data, drafts), [data, drafts]);
  function selectCell(key: string, event: MouseEvent) {
    if (event.shiftKey && anchor.current) {
      const selected = new Set(selection);
      const visibleRowIds = [
        ...new Set(
          groups
            .filter((group) => !collapsed.includes(group.id))
            .flatMap((group) =>
              visibleEmployees
                .filter((employee) => days.some((date) => current(employee.id, date)?.groupId === group.id))
                .map((employee) => employee.id),
            ),
        ),
      ];
      for (const candidate of selectedRectangle(visibleRowIds, days, anchor.current, key)) {
        const [employeeId, date] = candidate.split('|');
        if (groups.some((group) => group.id === base(employeeId, date)?.groupId)) selected.add(candidate);
      }
      setSelection(selected);
    } else {
      setSelection((old) => {
        const next = new Set(event.ctrlKey || event.metaKey ? old : []);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
      anchor.current = key;
    }
  }
  function selectMany(keys: string[]) {
    setSelection((old) => {
      const next = new Set(old);
      const all = keys.every((key) => next.has(key));
      for (const key of keys) {
        if (all) next.delete(key);
        else next.add(key);
      }
      return next;
    });
  }
  function applyTemplate(template: ShiftTemplate) {
    if (!selection.size) {
      toast.info('Selecciona una o más celdas para asignar el turno.');
      return;
    }
    const next = { ...drafts };
    for (const key of selection) {
      const [employeeId, date] = key.split('|');
      const entry = current(employeeId, date);
      if (!entry) continue;
      if (append && entry.blocks.length >= 3) {
        setError('Una jornada admite hasta tres bloques. Edita la celda para reemplazar uno.');
        return;
      }
      const block = templateBlock(template, date);
      next[key] = {
        ...entry,
        blocks: append ? [...entry.blocks, block] : [block],
        isRest: false,
        observation: note || entry.observation,
      };
    }
    change(next);
  }
  function markRest() {
    const next = { ...drafts };
    for (const key of selection) {
      const [employeeId, date] = key.split('|');
      const entry = current(employeeId, date);
      if (entry) next[key] = { ...entry, blocks: [], isRest: true, observation: note || entry.observation };
    }
    change(next);
  }
  function copyPrevious() {
    const next = { ...drafts };
    let count = 0;
    for (const employee of visibleEmployees) {
      for (const date of days) {
        const entry = base(employee.id, date);
        if (!entry || !groups.some((g) => g.id === entry.groupId)) continue;
        const previous = data.schedules.find((s) => s.employeeId === employee.id && s.date === addDays(date, -7));
        if (!previous) continue;
        next[cellKey(employee.id, date)] = {
          ...entry,
          blocks: previous.blocks.map((block) => ({
            ...block,
            start: block.start + 7 * 86400000,
            end: block.end + 7 * 86400000,
          })),
          isRest: previous.isRest,
          observation: previous.observation,
          siteId: previous.siteId,
        };
        count++;
      }
    }
    if (!count) {
      toast.info('La semana anterior no tiene turnos para este equipo.');
      return;
    }
    change(next);
    toast.success(`${count} jornadas copiadas. Revisa y guarda los cambios.`);
  }
  function applyUpdatedTemplate(template: ShiftTemplate) {
    const next = { ...drafts };
    let count = 0;
    for (const day of data.schedules.filter(
      (s) => s.date >= week && s.date <= days[6] && s.date >= bogotaDate(Date.now()),
    )) {
      const entry = current(day.employeeId, day.date)!;
      if (!entry.blocks.some((b) => b.templateId === template.id)) continue;
      next[cellKey(day.employeeId, day.date)] = {
        ...entry,
        blocks: entry.blocks.map((b) => (b.templateId === template.id ? templateBlock(template, day.date) : b)),
      };
      count++;
    }
    if (!count) {
      toast.info('No hay asignaciones futuras de esta plantilla en la semana visible.');
      return;
    }
    change(next);
    setTab('calendar');
    toast.info(`${count} jornadas preparadas. Usa Revisar y guardar para confirmar.`);
  }
  async function requestPreview() {
    setError('');
    try {
      const result = await api.execute({
        type: 'saveSchedule',
        changes: Object.values(drafts),
        preview: true,
        ...(recurrence ? { recurrence: { endDate: repeatEnd, everyWeeks: 1 } } : {}),
      });
      setPreview(result);
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  async function save() {
    setError('');
    try {
      await api.execute({
        type: 'saveSchedule',
        changes: Object.values(drafts),
        preview: false,
        ...(recurrence ? { recurrence: { endDate: repeatEnd, everyWeeks: 1 } } : {}),
      });
      setDrafts({});
      setPast([]);
      setFuture([]);
      setPreview(null);
      setSelection(new Set());
      toast.success('Programación guardada');
    } catch (e) {
      setError(errorMessage(e));
      setPreview(null);
    }
  }
  function navigate(next: string) {
    if (dirty && !window.confirm('Hay cambios sin guardar. ¿Cambiar de semana y descartarlos?')) return;
    setWeek(next);
  }
  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="calendar">Programación semanal</TabsTrigger>
          <TabsTrigger value="groups">Grupos</TabsTrigger>
          <TabsTrigger value="templates">Plantillas</TabsTrigger>
        </TabsList>
        <TabsContent value="calendar" className="mt-4 space-y-4">
          {error && (
            <Notice danger>
              {error}
              <Button size="sm" variant="outline" className="ml-3" onClick={() => api.refresh()}>
                Recargar datos
              </Button>
            </Notice>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                aria-label="Semana anterior"
                variant="outline"
                size="icon"
                onClick={() => navigate(addDays(week, -7))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="min-w-48 text-center">
                <strong className="text-sm">
                  {dateLabel(week)} — {dateLabel(days[6])}
                </strong>
                <div className="text-xs text-muted-foreground">Domingo a sábado · {week.slice(0, 4)}</div>
              </div>
              <Button
                aria-label="Semana siguiente"
                variant="outline"
                size="icon"
                onClick={() => navigate(addDays(week, 7))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => navigate(weekStart(bogotaDate(Date.now())))}>
                Hoy
              </Button>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={!allowed || api.isPending} onClick={copyPrevious}>
                <Copy className="h-4 w-4" />
                Copiar semana anterior
              </Button>
              <Button size="sm" disabled={!dirty || api.isPending} onClick={requestPreview}>
                <Eye className="h-4 w-4" />
                Revisar y guardar{dirty ? ` (${Object.keys(drafts).length})` : ''}
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="relative min-w-48 flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                aria-label="Buscar trabajador"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setSelection(new Set());
                }}
                placeholder="Buscar trabajador o código"
                className="pl-9"
              />
            </div>
            <Select
              aria-label="Filtrar grupo"
              className="w-full sm:w-56"
              value={groupFilter}
              onChange={(e) => {
                setGroupFilter(e.target.value);
                setSelection(new Set());
              }}
            >
              <option value="">Todos los grupos</option>
              {data.groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 text-xs font-semibold text-muted-foreground">ASIGNAR TURNO</span>
              {data.templates
                .filter((t) => t.active)
                .map((template) => (
                  <button
                    key={template.id}
                    disabled={!allowed}
                    onClick={() => applyTemplate(template)}
                    className="inline-flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-xs font-semibold outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                    title={`${template.name} · ${template.startTime}–${template.endTime}`}
                  >
                    <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: template.color }} />
                    {template.code}
                    <span className="font-normal text-muted-foreground">
                      {template.startTime}–{template.endTime}
                    </span>
                  </button>
                ))}
              <Button size="sm" variant="outline" disabled={!selection.size || !allowed} onClick={markRest}>
                Descanso
              </Button>
              {!data.templates.length && (
                <span className="text-xs text-muted-foreground">Crea una plantilla en la pestaña Plantillas.</span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3 border-t pt-3 text-xs">
              <span className="font-medium">{selection.size} celdas seleccionadas</span>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={append} onChange={(e) => setAppend(e.target.checked)} />
                Agregar bloque (máx. 3)
              </label>
              <Input
                aria-label="Observación para asignación"
                className="h-8 min-w-44 flex-1 text-xs"
                placeholder="Observación para bloques adicionales"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <Button variant="ghost" size="sm" disabled={!selection.size} onClick={() => setSelection(new Set())}>
                <X className="h-3.5 w-3.5" />
                Limpiar selección
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label="Deshacer"
                disabled={!past.length}
                onClick={undo}
              >
                <Undo2 className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label="Rehacer"
                disabled={!future.length}
                onClick={redo}
              >
                <Redo2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
          {!groups.length ? (
            <Empty
              title="Crea un grupo para programar"
              description="En Grupos puedes definir responsables, integrantes y sedes habilitadas."
            />
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[1050px] border-collapse text-left text-xs">
                <thead>
                  <tr className="bg-muted/70">
                    <th className="sticky left-0 z-10 min-w-52 bg-muted px-4 py-3 font-semibold">Trabajador</th>
                    {days.map((date) => (
                      <th
                        key={date}
                        className={cn('min-w-28 border-l px-2 py-3 text-center', date === today && 'bg-primary/10')}
                      >
                        <button
                          className="w-full rounded p-1 hover:bg-muted"
                          onClick={() =>
                            selectMany(
                              visibleEmployees
                                .filter(
                                  (e) => base(e.id, date) && groups.some((g) => g.id === base(e.id, date)?.groupId),
                                )
                                .map((e) => cellKey(e.id, date)),
                            )
                          }
                        >
                          {dateLabel(date, true)}
                        </button>
                      </th>
                    ))}
                    <th className="min-w-24 px-3 py-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((group) => {
                    const employees = visibleEmployees.filter((e) =>
                      days.some((date) => current(e.id, date)?.groupId === group.id),
                    );
                    return (
                      <Fragment key={group.id}>
                        <tr className="border-y bg-slate-100/80 dark:bg-slate-800/80">
                          <td colSpan={9} className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <button
                                className="inline-flex flex-1 items-center gap-2 text-left font-semibold"
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
                                <span className="font-normal text-muted-foreground">
                                  {employees.length} trabajadores
                                </span>
                              </button>
                              <button
                                className="rounded px-2 py-1 text-xs hover:bg-background"
                                onClick={() =>
                                  selectMany(
                                    employees.flatMap((e) =>
                                      days
                                        .filter((date) => current(e.id, date)?.groupId === group.id)
                                        .map((date) => cellKey(e.id, date)),
                                    ),
                                  )
                                }
                              >
                                Seleccionar grupo
                              </button>
                            </div>
                          </td>
                        </tr>
                        {!collapsed.includes(group.id) &&
                          employees.map((employee) => (
                            <tr key={employee.id} className="border-b last:border-0">
                              <th className="sticky left-0 z-10 bg-background px-4 py-3 font-normal">
                                <button
                                  onClick={() =>
                                    selectMany(
                                      days
                                        .filter((date) => current(employee.id, date)?.groupId === group.id)
                                        .map((date) => cellKey(employee.id, date)),
                                    )
                                  }
                                  className="text-left"
                                >
                                  <span className="block font-semibold">{employee.name}</span>
                                  <span className="mt-1 block text-muted-foreground">
                                    {employee.code} · {employee.agreement.weeklyMinutes / 60} h / semana
                                  </span>
                                </button>
                              </th>
                              {days.map((date) => {
                                const key = cellKey(employee.id, date);
                                const day = current(employee.id, date);
                                const available = day?.groupId === group.id;
                                const calculation = calculations.get(key);
                                return (
                                  <td
                                    key={date}
                                    className={cn(
                                      'relative border-l p-1 align-top',
                                      selection.has(key) && 'bg-primary/10',
                                      drafts[key] && 'bg-amber-50/50 dark:bg-amber-950/20',
                                    )}
                                  >
                                    <button
                                      disabled={!available}
                                      aria-pressed={selection.has(key)}
                                      aria-label={`${employee.name}, ${dateLabel(date, true)}: ${day?.isRest ? 'Descanso' : day?.blocks.map((b) => b.label).join(', ') || 'Sin turno'}`}
                                      className={cn(
                                        'flex min-h-24 w-full flex-col gap-1 rounded-md p-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                        selection.has(key) && 'ring-2 ring-inset ring-primary',
                                        !available && 'opacity-40',
                                      )}
                                      onClick={(e) => selectCell(key, e)}
                                      onDoubleClick={() => {
                                        if (day && allowed) setEditingCell(day);
                                      }}
                                    >
                                      {!available ? (
                                        <span className="m-auto text-muted-foreground">Otro grupo</span>
                                      ) : day?.isRest ? (
                                        <span className="m-auto rounded bg-muted px-2 py-1 text-muted-foreground">
                                          Descanso
                                        </span>
                                      ) : day?.blocks.length ? (
                                        day.blocks.map((block, index) => (
                                          <span
                                            key={index}
                                            className="block rounded border px-1.5 py-1 text-[11px]"
                                            style={{
                                              backgroundColor: `${block.color}18`,
                                              borderColor: `${block.color}66`,
                                            }}
                                          >
                                            <span className="block font-semibold">{block.label}</span>
                                            <span className="tabular-nums">
                                              {timeLabel(block.start)}–{timeLabel(block.end)}
                                              {bogotaDate(block.end) !== date ? ' +1' : ''}
                                            </span>
                                          </span>
                                        ))
                                      ) : (
                                        <span className="m-auto text-muted-foreground">Sin turno</span>
                                      )}
                                      {calculation && available && (
                                        <span
                                          className={cn(
                                            'mt-auto pt-1 text-[10px] tabular-nums',
                                            calculation.incidents.length
                                              ? 'text-red-700 dark:text-red-300'
                                              : 'text-muted-foreground',
                                          )}
                                        >
                                          {formatMinutes(calculation.totalMinutes)}
                                          {drafts[key] ? ' · editado' : ''}
                                        </span>
                                      )}
                                    </button>
                                  </td>
                                );
                              })}
                              <td className="px-3 text-right font-semibold tabular-nums">
                                {formatMinutes(
                                  days.reduce(
                                    (sum, date) =>
                                      sum + (calculations.get(cellKey(employee.id, date))?.totalMinutes ?? 0),
                                    0,
                                  ),
                                )}
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
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
            <p>
              Clic para seleccionar · Ctrl / ⌘ para sumar · Shift para rango · Doble clic para editar. Horario Bogotá.
            </p>
            {selection.size === 1 && allowed && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const [employeeId, date] = [...selection][0].split('|');
                  setEditingCell(current(employeeId, date));
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
                Editar jornada seleccionada
              </Button>
            )}
          </div>
          {dirty && (
            <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-muted/30 p-3">
              <span className="text-sm font-medium">{Object.keys(drafts).length} cambios sin guardar</span>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={recurrence}
                  onChange={(e) => {
                    setRecurrence(e.target.checked);
                    setPreview(null);
                  }}
                />
                Repetir cada semana
              </label>
              {recurrence && (
                <Field label="Hasta" className="min-w-40">
                  <Input
                    type="date"
                    min={addDays(week, 7)}
                    max={addDays(week, 89)}
                    value={repeatEnd}
                    onChange={(e) => {
                      setRepeatEnd(e.target.value);
                      setPreview(null);
                    }}
                  />
                </Field>
              )}
              <Button className="ml-auto" size="sm" disabled={api.isPending} onClick={requestPreview}>
                <Save className="h-4 w-4" />
                Revisar y guardar
              </Button>
            </div>
          )}
          {selection.size === 1 && calculations.get([...selection][0]) && (
            <div className="rounded-lg border p-4">
              <h3 className="mb-3 text-sm font-semibold">Distribución de la jornada seleccionada</h3>
              <Hours result={calculations.get([...selection][0])} />
              <p className="mt-3 text-xs text-muted-foreground">
                Política {calculations.get([...selection][0])?.policyVersion} · La programación no convierte
                automáticamente las horas extra en ordinarias.
              </p>
            </div>
          )}
        </TabsContent>
        <TabsContent value="groups" className="mt-4">
          <Groups data={data} api={api} />
        </TabsContent>
        <TabsContent value="templates" className="mt-4 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">Editar una plantilla conserva los turnos ya asignados.</p>
            {canAdmin(data) && (
              <Button onClick={() => setEditingTemplate('new')}>
                <Plus className="h-4 w-4" />
                Crear plantilla
              </Button>
            )}
          </div>
          <div className="overflow-x-auto rounded-lg border">
            <table className={tableClass}>
              <thead>
                <tr>
                  <th>Turno</th>
                  <th>Código</th>
                  <th>Horario</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {data.templates.map((template) => (
                  <tr key={template.id}>
                    <td>
                      <span className="flex items-center gap-2 font-medium">
                        <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: template.color }} />
                        {template.name}
                      </span>
                    </td>
                    <td>{template.code}</td>
                    <td>
                      {template.startTime} – {template.endTime}
                      {template.endTime <= template.startTime ? ' (+1 día)' : ''}
                    </td>
                    <td>
                      <Badge variant={template.active ? 'secondary' : 'outline'}>
                        {template.active ? 'Activa' : 'Inactiva'}
                      </Badge>
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-2">
                        {canAdmin(data) && (
                          <Button variant="ghost" size="sm" onClick={() => setEditingTemplate(template)}>
                            <Pencil className="h-4 w-4" />
                            Editar
                          </Button>
                        )}
                        {allowed && template.active && (
                          <Button variant="outline" size="sm" onClick={() => applyUpdatedTemplate(template)}>
                            Aplicar a futuros de esta semana
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>
      {editingCell && (
        <CellForm
          day={editingCell}
          data={data}
          drafts={drafts}
          calculation={calculations.get(cellKey(editingCell.employeeId, editingCell.date))}
          onClose={() => setEditingCell(null)}
          onSave={(entry) => {
            change({ ...drafts, [cellKey(entry.employeeId, entry.date)]: entry });
            setEditingCell(null);
          }}
        />
      )}
      {editingTemplate && (
        <TemplateForm
          template={editingTemplate === 'new' ? undefined : editingTemplate}
          api={api}
          onClose={() => setEditingTemplate(null)}
        />
      )}
      <Modal
        open={!!preview}
        onClose={() => setPreview(null)}
        title="Revisar programación"
        description="El servidor validó el alcance completo, los conflictos y los límites de jornada. Confirma los cambios antes de guardarlos."
        wide
      >
        <div className="max-h-80 overflow-auto rounded border">
          <table className={tableClass}>
            <thead>
              <tr>
                <th>Trabajador</th>
                <th>Fecha</th>
                <th>Trabajo</th>
                <th>Deducción</th>
                <th>Política</th>
              </tr>
            </thead>
            <tbody>
              {preview?.results?.map((result, index) => (
                <tr key={`${result.employeeId}:${result.date}:${index}`}>
                  <td>{data.employees.find((e) => e.id === result.employeeId)?.name ?? 'Trabajador'}</td>
                  <td>{result.date}</td>
                  <td>{formatMinutes(result.planned.totalMinutes)}</td>
                  <td>{formatMinutes(result.planned.mealMinutes)}</td>
                  <td>{result.planned.policyVersion}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {recurrence && (
          <Notice>
            Se repetirá la programación semanal hasta el {repeatEnd}. Las jornadas existentes se validan antes de
            guardar.
          </Notice>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setPreview(null)}>
            Volver a editar
          </Button>
          <Button disabled={api.isPending} onClick={save}>
            <Check className="h-4 w-4" />
            {api.isPending ? 'Guardando…' : 'Confirmar programación'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
function templateBlock(template: ShiftTemplate, date: string): ScheduledBlock {
  return {
    templateId: template.id,
    label: template.code,
    color: template.color,
    start: bogotaTimestamp(date, template.startTime),
    end: bogotaTimestamp(template.endTime <= template.startTime ? addDays(date, 1) : date, template.endTime),
  };
}
function TemplateForm({ template, api, onClose }: { template?: ShiftTemplate; api: Api; onClose: () => void }) {
  const [draft, setDraft] = useState({
    name: template?.name ?? '',
    code: template?.code ?? '',
    color: template?.color ?? '#3b82f6',
    startTime: template?.startTime ?? '07:00',
    endTime: template?.endTime ?? '16:00',
    active: template?.active ?? true,
  });
  const [error, setError] = useState('');
  async function save(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      await api.execute({
        type: 'saveTemplate',
        template: { ...draft, id: template?.id },
        expectedRevision: template?.revision ?? 0,
      });
      toast.success('Plantilla guardada. Las asignaciones existentes se conservan.');
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={template ? 'Editar plantilla de turno' : 'Crear plantilla de turno'}
      description="Si el fin es anterior al inicio, el turno termina al día siguiente."
    >
      <form onSubmit={save} className="space-y-4">
        {error && <Notice danger>{error}</Notice>}
        <Field label="Nombre">
          <Input required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </Field>
        <div className="grid grid-cols-[1fr_100px] gap-4">
          <Field label="Código corto">
            <Input
              required
              maxLength={12}
              value={draft.code}
              onChange={(e) => setDraft({ ...draft, code: e.target.value })}
            />
          </Field>
          <Field label="Color">
            <Input
              type="color"
              className="p-1"
              value={draft.color}
              onChange={(e) => setDraft({ ...draft, color: e.target.value })}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Entrada">
            <Input
              required
              type="time"
              value={draft.startTime}
              onChange={(e) => setDraft({ ...draft, startTime: e.target.value })}
            />
          </Field>
          <Field label="Salida">
            <Input
              required
              type="time"
              value={draft.endTime}
              onChange={(e) => setDraft({ ...draft, endTime: e.target.value })}
            />
          </Field>
        </div>
        {draft.endTime < draft.startTime && <Notice>Este turno cruza medianoche y finaliza al día siguiente.</Notice>}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={draft.active}
            onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
          />
          Plantilla activa
        </label>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={api.isPending}>
            Guardar plantilla
          </Button>
        </div>
      </form>
    </Modal>
  );
}
function CellForm({
  day,
  data,
  drafts,
  calculation,
  onClose,
  onSave,
}: {
  day: ScheduleChange;
  data: WorkforceSnapshot;
  drafts: Drafts;
  calculation?: CalculationResult;
  onClose: () => void;
  onSave: (day: ScheduleChange) => void;
}) {
  const [draft, setDraft] = useState(day);
  const [error, setError] = useState('');
  const employee = data.employees.find((e) => e.id === day.employeeId)!;
  function editTime(index: number, key: 'start' | 'end', time: string) {
    if (!time) return;
    const blocks = [...draft.blocks];
    const block = { ...blocks[index] };
    const startTime = key === 'start' ? time : timeLabel(block.start);
    const endTime = key === 'end' ? time : timeLabel(block.end);
    const startDate = bogotaDate(block.start);
    block.start = bogotaTimestamp(startDate, startTime);
    block.end = bogotaTimestamp(endTime <= startTime ? addDays(startDate, 1) : startDate, endTime);
    blocks[index] = block;
    setDraft({ ...draft, blocks, isRest: false });
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!draft.isRest && !draft.blocks.length) {
      setError('Agrega un bloque o marca descanso.');
      return;
    }
    if (draft.blocks.length > 1 && draft.observation.trim().length < 3) {
      setError('Los bloques adicionales necesitan una observación.');
      return;
    }
    onSave(draft);
  }
  const preview = calculateSchedulePreview(data, { ...drafts, [cellKey(draft.employeeId, draft.date)]: draft }).get(
    cellKey(draft.employeeId, draft.date),
  )!;
  return (
    <Modal
      open
      onClose={onClose}
      title={`${employee.name} · ${dateLabel(day.date, true)}`}
      description="Edita hasta tres bloques. Los conflictos y el acumulado semanal se comprueban al guardar."
      wide
    >
      <form onSubmit={submit} className="space-y-4">
        {error && <Notice danger>{error}</Notice>}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={draft.isRest}
            onChange={(e) =>
              setDraft({ ...draft, isRest: e.target.checked, blocks: e.target.checked ? [] : draft.blocks })
            }
          />
          Día de descanso
        </label>
        {draft.blocks.map((block, index) => (
          <div key={index} className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[1fr_1fr_1fr_1fr_36px]">
            <Field label={`Bloque ${index + 1}`}>
              <Input
                required
                value={block.label}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    blocks: draft.blocks.map((b, i) => (i === index ? { ...b, label: e.target.value } : b)),
                  })
                }
              />
            </Field>
            <Field label="Día de inicio">
              <Select
                value={bogotaDate(block.start) > day.date ? '1' : '0'}
                onChange={(e) => {
                  const offset = (Number(e.target.value) - (bogotaDate(block.start) > day.date ? 1 : 0)) * 86400000;
                  setDraft({
                    ...draft,
                    blocks: draft.blocks.map((item, i) =>
                      i === index ? { ...item, start: item.start + offset, end: item.end + offset } : item,
                    ),
                  });
                }}
              >
                <option value="0">Esta fecha</option>
                <option value="1">Madrugada +1</option>
              </Select>
            </Field>
            <Field label="Entrada">
              <Input
                required
                type="time"
                value={timeLabel(block.start)}
                onChange={(e) => editTime(index, 'start', e.target.value)}
              />
            </Field>
            <Field label={`Salida${bogotaDate(block.end) > day.date ? ' (+1 día)' : ''}`}>
              <Input
                required
                type="time"
                value={timeLabel(block.end)}
                onChange={(e) => editTime(index, 'end', e.target.value)}
              />
            </Field>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Eliminar bloque ${index + 1}`}
              onClick={() => setDraft({ ...draft, blocks: draft.blocks.filter((_, i) => i !== index) })}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        {draft.blocks.length < 3 && !draft.isRest && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setDraft({
                ...draft,
                blocks: [
                  ...draft.blocks,
                  {
                    label: 'Turno',
                    color: '#3b82f6',
                    start: bogotaTimestamp(day.date, '07:00'),
                    end: bogotaTimestamp(day.date, '16:00'),
                  },
                ],
                isRest: false,
              })
            }
          >
            <Plus className="h-4 w-4" />
            Agregar bloque
          </Button>
        )}
        <Field
          label="Sede específica"
          help="Sin restricción permite cualquiera de las sedes habilitadas para el grupo."
        >
          <Select
            value={draft.siteId ?? ''}
            onChange={(e) => setDraft({ ...draft, siteId: e.target.value || undefined })}
          >
            <option value="">Cualquier sede del grupo</option>
            {data.sites
              .filter((s) => s.active && data.groups.find((g) => g.id === day.groupId)?.siteIds.includes(s.id))
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </Select>
        </Field>
        <Field label={`Observación${draft.blocks.length > 1 ? ' (obligatoria)' : ''}`}>
          <Textarea
            required={draft.blocks.length > 1}
            minLength={draft.blocks.length > 1 ? 3 : undefined}
            value={draft.observation}
            onChange={(e) => setDraft({ ...draft, observation: e.target.value })}
          />
        </Field>
        <div className="rounded-lg bg-muted/20 p-3">
          <Hours result={preview} />
          <p className="mt-2 text-xs text-muted-foreground">
            Jornada pactada: {formatMinutes(employee.agreement.dailyMinutes)}. Diferencia:{' '}
            {formatMinutes(preview.totalMinutes - employee.agreement.dailyMinutes)}. Incluye el acumulado de la semana.
            Política {calculation?.policyVersion ?? preview.policyVersion}.
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit">Aplicar a la semana</Button>
        </div>
      </form>
    </Modal>
  );
}
