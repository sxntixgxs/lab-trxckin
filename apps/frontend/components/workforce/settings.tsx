'use client';

import { useState, type FormEvent } from 'react';
import { Database, Save, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useWorkforce, useWorkforceDirectory } from '@/lib/workforce/client';
import { addDays, bogotaDate, weekStart } from '@/lib/workforce/dates';
import { DEFAULT_POLICY } from '@/lib/workforce/calculation';
import type { CalculationPolicy, WorkforceSnapshot } from '@/lib/workforce/types';
import {
  useWorkforceNow,
  canAdmin,
  CheckList,
  DataState,
  dateLabel,
  errorMessage,
  Field,
  Modal,
  Notice,
  tableClass,
  WorkforceShell,
} from './shared';

export default function SettingsPage() {
  const today = bogotaDate(useWorkforceNow());
  const api = useWorkforce(today, today);
  return (
    <WorkforceShell
      title="Configuración de talento humano"
      description="Responsables y reglas de jornada con vigencia. Los cierres anteriores conservan su cálculo."
      data={api.data}
    >
      <DataState loading={api.isLoading} error={api.error} companyId={api.companyId} retry={api.refresh}>
        {api.data && <Settings key={`${api.companyId}:${api.data.settings.revision}`} data={api.data} api={api} />}
      </DataState>
    </WorkforceShell>
  );
}
function Settings({ data, api }: { data: WorkforceSnapshot; api: ReturnType<typeof useWorkforce> }) {
  const latest =
    [...data.settings.policies].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0] ?? DEFAULT_POLICY;
  const [policy, setPolicy] = useState<CalculationPolicy>({
    ...latest,
    version: `v${data.settings.revision + 1}`,
    effectiveFrom: addDays(weekStart(data.from), 7),
  });
  const [hrIds, setHrIds] = useState(data.settings.hrUserIds);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [seed, setSeed] = useState(false);
  const directory = useWorkforceDirectory(data.companyId);
  const allowed = canAdmin(data);
  async function save(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      if (weekStart(policy.effectiveFrom) !== policy.effectiveFrom)
        throw new Error('La vigencia debe comenzar un domingo.');
      await api.execute({
        type: 'saveSettings',
        hrUserIds: hrIds,
        policy,
        reason,
        expectedRevision: data.settings.revision,
      });
      toast.success('Configuración guardada');
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  async function seedDemo() {
    setError('');
    try {
      const result = await api.execute({ type: 'seedDemo' });
      toast.success(result.message);
      setSeed(false);
    } catch (e) {
      setError(errorMessage(e));
      setSeed(false);
    }
  }
  const time = (minutes: number) =>
    `${Math.floor(minutes / 60)
      .toString()
      .padStart(2, '0')}:${(minutes % 60).toString().padStart(2, '0')}`;
  return (
    <div className="space-y-6">
      {error && <Notice danger>{error}</Notice>}
      <form className="grid gap-6 lg:grid-cols-[1fr_360px]" onSubmit={save}>
        <fieldset disabled={!allowed || api.isPending} className="space-y-5 rounded-lg border p-5">
          <div>
            <h2 className="font-semibold">Reglas de jornada</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Zona horaria: America/Bogota. Horas completas al minuto, sin valores monetarios.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Vigencia desde" help="Debe ser domingo de una semana futura.">
              <Input
                required
                type="date"
                min={addDays(weekStart(data.from), 7)}
                value={policy.effectiveFrom}
                onChange={(e) => setPolicy({ ...policy, effectiveFrom: e.target.value })}
              />
            </Field>
            <Field label="Versión">
              <Input
                required
                value={policy.version}
                onChange={(e) => setPolicy({ ...policy, version: e.target.value })}
              />
            </Field>
            <Field label="Ordinarias por día (horas)">
              <Input
                required
                type="number"
                step="0.25"
                min="1"
                max="8"
                value={policy.ordinaryDailyMinutes / 60}
                onChange={(e) =>
                  setPolicy({ ...policy, ordinaryDailyMinutes: Math.round(Number(e.target.value) * 60) })
                }
              />
            </Field>
            <Field label="Ordinarias por semana (horas)">
              <Input
                required
                type="number"
                step="0.25"
                min="1"
                max="42"
                value={policy.ordinaryWeeklyMinutes / 60}
                onChange={(e) =>
                  setPolicy({ ...policy, ordinaryWeeklyMinutes: Math.round(Number(e.target.value) * 60) })
                }
              />
            </Field>
            <Field label="Inicio de nocturnidad" help="Franja legal del régimen soportado.">
              <Input required type="time" value={time(policy.nightStartMinute)} readOnly />
            </Field>
            <Field label="Fin de nocturnidad">
              <Input required type="time" value={time(policy.nightEndMinute)} readOnly />
            </Field>
          </div>
          <div className="border-t pt-4">
            <h3 className="mb-3 text-sm font-semibold">Deducción automática de almuerzo</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Si supera (min)">
                <Input
                  required
                  type="number"
                  min="0"
                  max="600"
                  value={policy.mealAfterMinutes}
                  onChange={(e) => setPolicy({ ...policy, mealAfterMinutes: Number(e.target.value) })}
                />
              </Field>
              <Field label="Deducir (min)">
                <Input
                  required
                  type="number"
                  min="0"
                  max="180"
                  value={policy.mealMinutes}
                  onChange={(e) => setPolicy({ ...policy, mealMinutes: Number(e.target.value) })}
                />
              </Field>
              <Field label="Ubicar después de (min)">
                <Input
                  required
                  type="number"
                  min="0"
                  max="600"
                  value={policy.mealOffsetMinutes}
                  onChange={(e) => setPolicy({ ...policy, mealOffsetMinutes: Number(e.target.value) })}
                />
              </Field>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Se aplica una vez por jornada; los intervalos de descanso superpuestos se deducen una sola vez.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Máximo extra por día (min)">
              <Input
                required
                type="number"
                min="0"
                max="120"
                value={policy.maxExtraDailyMinutes}
                onChange={(e) => setPolicy({ ...policy, maxExtraDailyMinutes: Number(e.target.value) })}
              />
            </Field>
            <Field label="Máximo extra por semana (min)">
              <Input
                required
                type="number"
                min="0"
                max="720"
                value={policy.maxExtraWeeklyMinutes}
                onChange={(e) => setPolicy({ ...policy, maxExtraWeeklyMinutes: Number(e.target.value) })}
              />
            </Field>
          </div>
          <Field label="Motivo del cambio">
            <Textarea
              required
              minLength={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explica por qué cambia la configuración"
            />
          </Field>
        </fieldset>
        <div className="space-y-5">
          <fieldset disabled={!allowed || api.isPending} className="space-y-4 rounded-lg border p-5">
            <h2 className="flex items-center gap-2 font-semibold">
              <ShieldCheck className="h-4 w-4" />
              Responsables de TH
            </h2>
            <p className="text-sm text-muted-foreground">
              Pueden administrar reglas y reabrir cierres. Necesitan también los permisos del módulo en Administración.
            </p>
            <CheckList
              label="Cuentas responsables"
              options={(directory.data ?? []).map((u) => ({ id: u.id, label: `${u.name} · ${u.email}` }))}
              value={hrIds}
              onChange={setHrIds}
            />
            {directory.error && <Notice danger>No se pudo cargar el directorio de cuentas.</Notice>}
          </fieldset>
          {allowed && (
            <Button type="submit" disabled={api.isPending} className="w-full">
              <Save className="h-4 w-4" />
              {api.isPending ? 'Guardando…' : 'Guardar configuración'}
            </Button>
          )}
          <div className="space-y-3 rounded-lg border p-5">
            <h2 className="font-semibold">Datos de demostración</h2>
            <p className="text-sm text-muted-foreground">
              Trabajadores ficticios, grupos, turnos y asistencias simuladas desde la semana de lanzamiento. Si tu
              cuenta no tiene trabajador, se vinculará al primer integrante de la demo. No importa datos reales.
            </p>
            <p className="text-xs text-muted-foreground">Lanzamiento: {dateLabel(data.settings.launchDate)}</p>
            {allowed && (
              <Button type="button" variant="outline" disabled={api.isPending} onClick={() => setSeed(true)}>
                <Database className="h-4 w-4" />
                Cargar demostración
              </Button>
            )}
          </div>
        </div>
      </form>
      <div>
        <h2 className="mb-3 font-semibold">Versiones registradas</h2>
        <div className="overflow-x-auto rounded-lg border">
          <table className={tableClass}>
            <thead>
              <tr>
                <th>Versión</th>
                <th>Vigencia</th>
                <th>Jornada diaria / semanal</th>
                <th>Nocturnidad</th>
                <th>Almuerzo</th>
              </tr>
            </thead>
            <tbody>
              {data.settings.policies.map((p) => (
                <tr key={`${p.version}:${p.effectiveFrom}`}>
                  <td>{p.version}</td>
                  <td>{p.effectiveFrom}</td>
                  <td>
                    {p.ordinaryDailyMinutes / 60} h / {p.ordinaryWeeklyMinutes / 60} h
                  </td>
                  <td>
                    {time(p.nightStartMinute)} – {time(p.nightEndMinute)}
                  </td>
                  <td>
                    {p.mealMinutes} min si supera {p.mealAfterMinutes} min
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <Modal
        open={seed}
        onClose={() => setSeed(false)}
        title="Cargar datos ficticios"
        description="Se crearán registros de demostración identificados como simulados. La operación no modifica ni elimina datos existentes."
      >
        <p className="text-sm text-muted-foreground">
          Las sedes ilustrativas deben ajustarse a tu ubicación antes de probar marcaciones GPS. Vincula tu cuenta a un
          trabajador para probar el flujo personal.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setSeed(false)}>
            Cancelar
          </Button>
          <Button disabled={api.isPending} onClick={seedDemo}>
            {api.isPending ? 'Creando…' : 'Crear demostración'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
