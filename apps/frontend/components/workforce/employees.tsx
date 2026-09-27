'use client';

import { useState, type FormEvent } from 'react';
import { Pencil, Plus, Search, UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useWorkforce, useWorkforceDirectory } from '@/lib/workforce/client';
import { bogotaDate } from '@/lib/workforce/dates';
import type { Employee, WorkforceSnapshot } from '@/lib/workforce/types';
import {
  useWorkforceNow,
  canAdmin,
  DataState,
  Empty,
  errorMessage,
  Field,
  membershipFor,
  Modal,
  Notice,
  Select,
  tableClass,
  WorkforceShell,
} from './shared';

type Api = ReturnType<typeof useWorkforce>;
const restDays = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
export default function EmployeesPage() {
  const today = bogotaDate(useWorkforceNow());
  const api = useWorkforce(today, today);
  return (
    <WorkforceShell
      title="Trabajadores"
      description="Catálogo de la empresa y vinculación con cuentas para marcar asistencia."
      data={api.data}
    >
      <DataState loading={api.isLoading} error={api.error} companyId={api.companyId} retry={api.refresh}>
        {api.data && <Employees key={api.companyId} api={api} data={api.data} />}
      </DataState>
    </WorkforceShell>
  );
}
function Employees({ data, api }: { data: WorkforceSnapshot; api: Api }) {
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<Employee | 'new' | null>(null);
  const directory = useWorkforceDirectory(data.companyId);
  const employees = data.employees.filter(
    (e) =>
      (showInactive || e.active) &&
      `${e.name} ${e.code} ${e.job}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  );
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            aria-label="Buscar trabajador"
            placeholder="Nombre, código o cargo"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Mostrar inactivos
        </label>
        {canAdmin(data) && (
          <Button onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" />
            Crear trabajador
          </Button>
        )}
      </div>
      {!data.employees.length ? (
        <Empty
          title="El equipo aún está vacío"
          description="Crea trabajadores ficticios y asígnalos a un grupo para comenzar a programar. También puedes cargar la demostración desde Configuración."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className={tableClass}>
            <thead>
              <tr>
                <th>Trabajador</th>
                <th>Grupo actual</th>
                <th>Jornada pactada</th>
                <th>Descanso</th>
                <th>Cuenta</th>
                <th>Estado</th>
                <th>
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {employees.map((employee) => {
                const member = membershipFor(data.memberships, employee.id, data.from);
                const user = directory.data?.find((u) => u.id === employee.linkedUserId);
                return (
                  <tr key={employee.id}>
                    <td>
                      <div className="font-medium">{employee.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {employee.code} · {employee.job}
                      </div>
                    </td>
                    <td>{data.groups.find((g) => g.id === member?.groupId)?.name ?? 'Sin grupo'}</td>
                    <td className="tabular-nums">
                      {employee.agreement.dailyMinutes / 60} h / día · {employee.agreement.weeklyMinutes / 60} h /
                      semana
                    </td>
                    <td>{restDays[employee.agreement.restDay]}</td>
                    <td>
                      {employee.linkedUserId ? (
                        <span className="inline-flex items-center gap-2">
                          <UserCheck className="h-4 w-4 text-emerald-600" />
                          {user?.name ?? 'Cuenta vinculada'}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Sin vincular</span>
                      )}
                    </td>
                    <td>
                      <Badge variant={employee.active ? 'secondary' : 'outline'}>
                        {employee.active ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </td>
                    <td>
                      {canAdmin(data) && (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Editar ${employee.name}`}
                          onClick={() => setEditing(employee)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {employees.length === 0 && (
            <p className="p-8 text-center text-sm text-muted-foreground">No hay trabajadores con ese filtro.</p>
          )}
        </div>
      )}
      {editing && (
        <EmployeeForm
          key={editing === 'new' ? 'new' : editing.id}
          employee={editing === 'new' ? undefined : editing}
          data={data}
          api={api}
          directory={directory}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
function EmployeeForm({
  employee,
  data,
  api,
  directory,
  onClose,
}: {
  employee?: Employee;
  data: WorkforceSnapshot;
  api: Api;
  directory: ReturnType<typeof useWorkforceDirectory>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState({
    code: employee?.code ?? '',
    name: employee?.name ?? '',
    job: employee?.job ?? '',
    active: employee?.active ?? true,
    linkedUserId: employee?.linkedUserId ?? '',
    daily: employee ? employee.agreement.dailyMinutes / 60 : 8,
    weekly: employee ? employee.agreement.weeklyMinutes / 60 : 42,
    rest: employee?.agreement.restDay ?? 0,
  });
  const [error, setError] = useState('');
  async function save(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      await api.execute({
        type: 'saveEmployee',
        employee: {
          id: employee?.id,
          code: draft.code.trim(),
          name: draft.name.trim(),
          job: draft.job.trim(),
          active: draft.active,
          linkedUserId: draft.linkedUserId || undefined,
          agreement: {
            dailyMinutes: Math.round(draft.daily * 60),
            weeklyMinutes: Math.round(draft.weekly * 60),
            restDay: draft.rest,
          },
        },
        expectedRevision: employee?.revision ?? 0,
      });
      toast.success('Trabajador guardado');
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={employee ? 'Editar trabajador' : 'Crear trabajador ficticio'}
      description="La jornada pactada define las horas ordinarias. Desactivar conserva el historial."
    >
      <form onSubmit={save} className="space-y-4">
        {error && <Notice danger>{error}</Notice>}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Código">
            <Input
              required
              maxLength={30}
              value={draft.code}
              onChange={(e) => setDraft({ ...draft, code: e.target.value })}
            />
          </Field>
          <Field label="Nombre completo">
            <Input
              required
              maxLength={120}
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </Field>
        </div>
        <Field label="Cargo">
          <Input
            required
            maxLength={120}
            value={draft.job}
            onChange={(e) => setDraft({ ...draft, job: e.target.value })}
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Horas ordinarias / día">
            <Input
              required
              type="number"
              step="0.25"
              min="1"
              max="8"
              value={draft.daily}
              onChange={(e) => setDraft({ ...draft, daily: Number(e.target.value) })}
            />
          </Field>
          <Field label="Horas ordinarias / semana">
            <Input
              required
              type="number"
              step="0.25"
              min="1"
              max="42"
              value={draft.weekly}
              onChange={(e) => setDraft({ ...draft, weekly: Number(e.target.value) })}
            />
          </Field>
        </div>
        <Field label="Descanso semanal pactado">
          <Select value={draft.rest} onChange={(e) => setDraft({ ...draft, rest: Number(e.target.value) })}>
            {restDays.map((day, index) => (
              <option key={day} value={index}>
                {day}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Cuenta para marcación personal"
          help="Una cuenta solo puede vincularse con un trabajador activo de esta empresa."
        >
          <Select
            value={draft.linkedUserId}
            onChange={(e) => setDraft({ ...draft, linkedUserId: e.target.value })}
            disabled={directory.isLoading}
          >
            <option value="">Sin cuenta vinculada</option>
            {employee?.linkedUserId && !directory.data?.some((u) => u.id === employee.linkedUserId) && (
              <option value={employee.linkedUserId}>Cuenta vinculada actual</option>
            )}
            {directory.data
              ?.filter(
                (user) =>
                  user.id === employee?.linkedUserId ||
                  !data.employees.some((e) => e.active && e.linkedUserId === user.id),
              )
              .map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name} · {user.email}
                </option>
              ))}
          </Select>
        </Field>
        {directory.error && (
          <Notice danger>
            No se pudo cargar el directorio. Puedes guardar el trabajador sin una vinculación nueva.
          </Notice>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={draft.active}
            onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
          />
          Trabajador activo
        </label>
        <div className="flex justify-end gap-2 border-t pt-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={api.isPending} type="submit">
            {api.isPending ? 'Guardando…' : 'Guardar trabajador'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
