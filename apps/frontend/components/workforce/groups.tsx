'use client';

import { useState, type FormEvent } from 'react';
import { ArrowRightLeft, Pencil, Plus, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useWorkforce, useWorkforceDirectory } from '@/lib/workforce/client';
import { bogotaDate } from '@/lib/workforce/dates';
import type { Group, WorkforceSnapshot } from '@/lib/workforce/types';
import {
  useWorkforceNow,
  canAdmin,
  CheckList,
  Empty,
  errorMessage,
  Field,
  membershipFor,
  Modal,
  Notice,
  Select,
  tableClass,
} from './shared';

export function Groups({ data, api }: { data: WorkforceSnapshot; api: ReturnType<typeof useWorkforce> }) {
  const [editing, setEditing] = useState<Group | 'new' | null>(null);
  const [transfer, setTransfer] = useState<Group | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const directory = useWorkforceDirectory(data.companyId);
  const today = bogotaDate(useWorkforceNow());
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Cada trabajador pertenece a un grupo a la vez. Los traslados conservan su historia.
        </p>
        {canAdmin(data) && (
          <Button size="sm" onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" />
            Crear grupo
          </Button>
        )}
      </div>
      {!data.groups.length ? (
        <Empty
          title="Organiza tu equipo en grupos"
          description="Define gestores, sedes e integrantes para programar y revisar sus turnos."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className={tableClass}>
            <thead>
              <tr>
                <th>Grupo</th>
                <th>Gestor principal</th>
                <th>Integrantes</th>
                <th>Sedes habilitadas</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {data.groups.map((group) => {
                const members = data.employees.filter(
                  (employee) => membershipFor(data.memberships, employee.id, today)?.groupId === group.id,
                );
                return (
                  <tr key={group.id}>
                    <td>
                      <button
                        className="text-left font-semibold underline-offset-4 hover:underline"
                        onClick={() => setExpanded(expanded === group.id ? null : group.id)}
                      >
                        {group.name}
                      </button>
                      <p className="mt-1 text-xs text-muted-foreground">{group.description}</p>
                    </td>
                    <td>
                      {directory.data?.find((user) => user.id === group.managerIds[0])?.name ??
                        (group.managerIds[0] ? 'Cuenta asignada' : 'Sin gestor')}
                    </td>
                    <td>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setExpanded(expanded === group.id ? null : group.id)}
                      >
                        <Users className="h-4 w-4" />
                        {members.length}
                      </Button>
                    </td>
                    <td>
                      {group.siteIds
                        .map((id) => data.sites.find((s) => s.id === id)?.name)
                        .filter(Boolean)
                        .join(', ') || 'Sin sedes'}
                    </td>
                    <td>
                      <Badge variant={group.active ? 'secondary' : 'outline'}>
                        {group.active ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </td>
                    <td>
                      {canAdmin(data) && (
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Editar ${group.name}`}
                            onClick={() => setEditing(group)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Agregar o trasladar integrantes a ${group.name}`}
                            onClick={() => setTransfer(group)}
                          >
                            <ArrowRightLeft className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {expanded && (
        <div className="space-y-3 rounded-lg border p-4">
          <h3 className="font-semibold">Integrantes de {data.groups.find((g) => g.id === expanded)?.name}</h3>
          <div className="flex flex-wrap gap-2">
            {data.employees
              .filter((e) => membershipFor(data.memberships, e.id, today)?.groupId === expanded)
              .map((e) => (
                <Badge key={e.id} variant="secondary">
                  {e.name} · {e.code}
                </Badge>
              ))}
          </div>
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground">Historial de membresías y traslados</summary>
            <ul className="mt-3 space-y-2">
              {data.memberships
                .filter((m) => m.groupId === expanded)
                .map((m) => (
                  <li key={m.id}>
                    {data.employees.find((e) => e.id === m.employeeId)?.name} · {m.effectiveFrom} —{' '}
                    {m.effectiveTo ?? 'Vigente'}
                  </li>
                ))}
            </ul>
          </details>
        </div>
      )}
      {editing && (
        <GroupForm
          group={editing === 'new' ? undefined : editing}
          data={data}
          api={api}
          directory={directory}
          onClose={() => setEditing(null)}
        />
      )}{' '}
      {transfer && <TransferForm group={transfer} data={data} api={api} onClose={() => setTransfer(null)} />}
    </div>
  );
}
function GroupForm({
  group,
  data,
  api,
  directory,
  onClose,
}: {
  group?: Group;
  data: WorkforceSnapshot;
  api: ReturnType<typeof useWorkforce>;
  directory: ReturnType<typeof useWorkforceDirectory>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState({
    name: group?.name ?? '',
    description: group?.description ?? '',
    primary: group?.managerIds[0] ?? '',
    additional: group?.managerIds.slice(1) ?? [],
    siteIds: group?.siteIds ?? [],
    active: group?.active ?? true,
  });
  const [error, setError] = useState('');
  async function save(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api.execute({
        type: 'saveGroup',
        group: {
          id: group?.id,
          name: draft.name,
          description: draft.description,
          managerIds: [draft.primary, ...draft.additional.filter((id) => id !== draft.primary)],
          siteIds: draft.siteIds,
          active: draft.active,
        },
        expectedRevision: group?.revision ?? 0,
      });
      toast.success('Grupo guardado');
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={group ? 'Editar grupo' : 'Crear grupo'}
      description="El gestor principal y los adicionales pueden programar y revisar este grupo."
    >
      <form className="space-y-4" onSubmit={save}>
        {error && <Notice danger>{error}</Notice>}
        <Field label="Nombre">
          <Input
            required
            maxLength={120}
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </Field>
        <Field label="Descripción">
          <Textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
        </Field>
        <Field label="Gestor principal">
          <Select required value={draft.primary} onChange={(e) => setDraft({ ...draft, primary: e.target.value })}>
            <option value="">Seleccionar cuenta</option>
            {draft.primary && !directory.data?.some((u) => u.id === draft.primary) && (
              <option value={draft.primary}>Gestor asignado actual</option>
            )}
            {directory.data?.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name} · {user.email}
              </option>
            ))}
          </Select>
        </Field>
        <CheckList
          label="Gestores adicionales"
          options={(directory.data ?? [])
            .filter((u) => u.id !== draft.primary)
            .map((u) => ({ id: u.id, label: u.name }))}
          value={draft.additional}
          onChange={(additional) => setDraft({ ...draft, additional })}
        />
        {directory.error && <Notice danger>No se pudo cargar el directorio.</Notice>}
        <CheckList
          label="Sedes habilitadas"
          options={data.sites
            .filter((s) => s.active || draft.siteIds.includes(s.id))
            .map((s) => ({ id: s.id, label: `${s.name}${s.active ? '' : ' (inactiva)'}` }))}
          value={draft.siteIds}
          onChange={(siteIds) => setDraft({ ...draft, siteIds })}
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={draft.active}
            onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
          />
          Grupo activo
        </label>
        <div className="flex justify-end gap-2 border-t pt-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={api.isPending}>
            Guardar grupo
          </Button>
        </div>
      </form>
    </Modal>
  );
}
function TransferForm({
  group,
  data,
  api,
  onClose,
}: {
  group: Group;
  data: WorkforceSnapshot;
  api: ReturnType<typeof useWorkforce>;
  onClose: () => void;
}) {
  const [employeeId, setEmployeeId] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(() => bogotaDate(Date.now()));
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');
  const employee = data.employees.find((e) => e.id === employeeId);
  const existing = membershipFor(data.memberships, employeeId, effectiveFrom);
  const previous = data.groups.find((g) => g.id === existing?.groupId);
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!employee) return;
    setError('');
    try {
      await api.execute({
        type: 'transferMember',
        employeeId,
        groupId: group.id,
        effectiveFrom,
        reason,
        expectedRevision: employee.revision,
      });
      toast.success('Membresía guardada');
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={`Agregar a ${group.name}`}
      description="El traslado tiene fecha efectiva y conserva los registros del grupo anterior."
    >
      <form onSubmit={save} className="space-y-4">
        {error && <Notice danger>{error}</Notice>}
        <Field label="Trabajador">
          <Select
            required
            value={employeeId}
            onChange={(e) => {
              setEmployeeId(e.target.value);
              setConfirmed(false);
            }}
          >
            <option value="">Seleccionar trabajador</option>
            {data.employees
              .filter((e) => e.active)
              .map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} · {e.code}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Fecha efectiva">
          <Input
            required
            type="date"
            min={data.settings.launchDate}
            value={effectiveFrom}
            onChange={(e) => {
              setEffectiveFrom(e.target.value);
              setConfirmed(false);
            }}
          />
        </Field>
        {previous && (
          <Notice>
            {employee?.name} pertenece a {previous.name}. A partir del {effectiveFrom} pertenecerá a {group.name}.
          </Notice>
        )}
        <Field label="Motivo">
          <Textarea required minLength={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <label className="flex items-start gap-2 text-sm">
          <input
            required
            type="checkbox"
            className="mt-1"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          Confirmo el grupo de destino y la fecha efectiva.
        </label>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={api.isPending || !confirmed || previous?.id === group.id} type="submit">
            Confirmar membresía
          </Button>
        </div>
      </form>
    </Modal>
  );
}
