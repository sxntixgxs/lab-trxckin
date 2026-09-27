'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Loader2, LogIn, LogOut, MapPin, Navigation, RefreshCw, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useWorkforce, WorkforceClientError } from '@/lib/workforce/client';
import { addDays, bogotaDate } from '@/lib/workforce/dates';
import type { GpsFix, WorkforceCommand, WorkforceSnapshot } from '@/lib/workforce/types';
import {
  useWorkforceNow,
  canAdmin,
  DataState,
  dateLabel,
  errorMessage,
  Field,
  membershipFor,
  Notice,
  Select,
  timeLabel,
  WorkforceShell,
} from './shared';

export default function CheckInPage() {
  const today = bogotaDate(useWorkforceNow());
  const api = useWorkforce(addDays(today, -2), addDays(today, 1));
  return (
    <WorkforceShell
      title="Marcar asistencia"
      description="Registra entrada o salida con una ubicación nueva desde tu dispositivo. Horario de Bogotá."
      data={api.data}
    >
      <DataState loading={api.isLoading} error={api.error} companyId={api.companyId} retry={api.refresh}>
        {api.data && <CheckIn key={api.companyId} data={api.data} api={api} />}
      </DataState>
    </WorkforceShell>
  );
}
function CheckIn({ data, api }: { data: WorkforceSnapshot; api: ReturnType<typeof useWorkforce> }) {
  const [mode, setMode] = useState<'self' | 'supervisor'>('self');
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [reason, setReason] = useState('');
  const [fix, setFix] = useState<GpsFix | null>(null);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState<{ command: WorkforceCommand; requestId: string } | null>(null);
  const now = useWorkforceNow();
  const today = bogotaDate(now);
  const employeeId = mode === 'self' ? data.capabilities.selfEmployeeId : selectedEmployee;
  const employee = data.employees.find((e) => e.id === employeeId);
  const attendance = data.attendance.filter((a) => a.employeeId === employeeId);
  const open = attendance
    .filter((a) => a.openEntry !== undefined)
    .sort((a, b) => (b.openEntry ?? 0) - (a.openEntry ?? 0))[0];
  const kind = open ? 'OUT' : 'IN';
  const currentSchedule = data.schedules.find(
    (s) => s.employeeId === employeeId && s.blocks.some((b) => b.start <= now && b.end > now),
  );
  const effectiveDate = open?.date ?? currentSchedule?.date ?? today;
  const member = membershipFor(data.memberships, employeeId ?? '', effectiveDate);
  const group = data.groups.find((g) => g.id === member?.groupId);
  const schedule = data.schedules.find((s) => s.employeeId === employeeId && s.date === effectiveDate);
  const sites = data.sites.filter(
    (s) => s.active && (schedule?.siteId ? s.id === schedule.siteId : group?.siteIds.includes(s.id)),
  );
  const marks = data.marks.filter((m) => m.employeeId === employeeId).sort((a, b) => b.timestamp - a.timestamp);
  const busy = api.isPending || locating;
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  async function send(command: WorkforceCommand, requestId: string) {
    try {
      const result = await api.execute(command, requestId);
      setPending(null);
      setSuccess(result.message);
      setReason('');
      await api.refresh();
    } catch (e) {
      if (e instanceof WorkforceClientError && e.uncertain) {
        setPending({ command, requestId });
      } else {
        setPending(null);
      }
      setError(errorMessage(e));
    }
  }
  async function mark() {
    setError('');
    setSuccess('');
    if (!navigator.onLine) {
      setError('No hay conexión. Conéctate y vuelve a intentar; la marcación no se guarda sin conexión.');
      return;
    }
    if (pending) {
      await send(pending.command, pending.requestId);
      return;
    }
    if (!employeeId) {
      setError('Selecciona un trabajador o solicita la vinculación de tu cuenta.');
      return;
    }
    if (mode === 'supervisor' && reason.trim().length < 3) {
      setError('Explica el motivo de la marcación por supervisor.');
      return;
    }
    if (!window.isSecureContext) {
      setError('El GPS requiere una conexión HTTPS. Abre la aplicación desde su dirección segura.');
      return;
    }
    if (!navigator.geolocation) {
      setError('Este navegador no permite geolocalización. Usa otro dispositivo o solicita una corrección al gestor.');
      return;
    }
    setLocating(true);
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 20000,
        }),
      );
      const gps = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        timestamp: position.timestamp,
      };
      setFix(gps);
      const command: WorkforceCommand = {
        type: 'mark',
        mode,
        employeeId: mode === 'supervisor' ? employeeId : undefined,
        kind,
        gps,
        reason,
        expectedRevision: open?.revision ?? attendance.find((a) => a.date === effectiveDate)?.revision ?? 0,
      };
      setLocating(false);
      await send(command, crypto.randomUUID());
    } catch (e) {
      const geo = e as GeolocationPositionError;
      setError(
        geo.code === 1
          ? 'Permiso de ubicación denegado. Actívalo en los ajustes del navegador y vuelve a intentar.'
          : geo.code === 2
            ? 'No se pudo obtener tu ubicación. Activa el GPS y prueba en un lugar con mejor señal.'
            : geo.code === 3
              ? 'El GPS tardó demasiado. Vuelve a intentar para obtener una ubicación nueva.'
              : errorMessage(e),
      );
    } finally {
      setLocating(false);
    }
  }
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(300px,560px)_1fr]">
      <div className="space-y-4 rounded-lg border p-5 sm:p-6">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-semibold">
            <Navigation className="h-5 w-5" />
            Registro GPS
          </h2>
          <Badge variant="outline">{dateLabel(today, true)}</Badge>
        </div>
        {(data.capabilities.manage || canAdmin(data)) && (
          <Field label="Modo de marcación">
            <Select
              disabled={busy || !!pending}
              value={mode}
              onChange={(e) => {
                setMode(e.target.value as 'self' | 'supervisor');
                setError('');
                setSuccess('');
                setFix(null);
              }}
            >
              <option value="self">Mi asistencia</option>
              <option value="supervisor">Por supervisor</option>
            </Select>
          </Field>
        )}
        {mode === 'supervisor' ? (
          <>
            <Field label="Trabajador">
              <Select
                disabled={busy || !!pending}
                required
                value={selectedEmployee}
                onChange={(e) => {
                  setSelectedEmployee(e.target.value);
                  setError('');
                  setSuccess('');
                  setFix(null);
                }}
              >
                <option value="">Seleccionar trabajador del grupo</option>
                {data.employees
                  .filter((e) => {
                    if (!e.active) return false;
                    if (canAdmin(data)) return true;
                    const entry = data.attendance.find((day) => day.employeeId === e.id && day.openEntry !== undefined);
                    const employeeGroupId = entry?.groupId ?? membershipFor(data.memberships, e.id, today)?.groupId;
                    return data.groups.some(
                      (group) => group.id === employeeGroupId && group.managerIds.includes(data.capabilities.userId),
                    );
                  })
                  .map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name} · {e.code}
                    </option>
                  ))}
              </Select>
            </Field>
            <Notice>
              Las coordenadas corresponden al dispositivo del supervisor {data.capabilities.userName}. La marcación
              identifica a ambos.
            </Notice>
            <Field label="Motivo de la marcación">
              <Textarea
                disabled={busy || !!pending}
                required
                minLength={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Por qué registras la asistencia de este trabajador"
              />
            </Field>
          </>
        ) : employee ? (
          <div className="border-b py-3">
            <h3 className="text-lg font-semibold">{employee.name}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {employee.code} · {employee.job}
            </p>
          </div>
        ) : (
          <Notice>
            Tu cuenta aún no está vinculada a un trabajador activo de esta empresa. Solicita a Talento humano que
            complete la vinculación en Trabajadores.
          </Notice>
        )}
        {employee && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{group?.name ?? 'Sin grupo asignado'}</p>
            <div className="flex items-center gap-3 rounded-lg bg-muted/60 p-4">
              {open ? <LogOut className="h-6 w-6 text-primary" /> : <LogIn className="h-6 w-6 text-primary" />}
              <div>
                <p className="font-semibold">Próxima marcación: {open ? 'Salida' : 'Entrada'}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {open
                    ? `Entrada abierta desde ${timeLabel(open.openEntry!)} del ${dateLabel(open.date)}.`
                    : 'No tienes una entrada abierta.'}
                </p>
              </div>
            </div>
            {schedule ? (
              <p className="text-xs text-muted-foreground">
                Programación:{' '}
                {schedule.isRest
                  ? 'Día de descanso'
                  : schedule.blocks.map((b) => `${timeLabel(b.start)}–${timeLabel(b.end)}`).join(' / ')}
              </p>
            ) : (
              <Notice>Sin turno programado. La marcación se conservará para que el gestor la concilie.</Notice>
            )}
          </div>
        )}
        {!online && (
          <Notice danger>
            <span className="flex items-center gap-2">
              <WifiOff className="h-4 w-4" />
              Sin conexión. No se envían marcaciones hasta reconectar.
            </span>
          </Notice>
        )}
        {error && <Notice danger>{error}</Notice>}
        {pending && (
          <Notice>
            No se recibió confirmación. Reintenta esta misma solicitud para recuperar el resultado sin duplicar la
            marcación.
          </Notice>
        )}
        {success && (
          <div
            role="status"
            className="flex items-start gap-2 rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100"
          >
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            {success}
          </div>
        )}
        <Button
          size="lg"
          className="w-full"
          disabled={
            busy ||
            !online ||
            (!pending && (!employee || !sites.length || (mode === 'supervisor' && reason.trim().length < 3)))
          }
          onClick={mark}
        >
          {busy ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : pending ? (
            <RefreshCw className="h-5 w-5" />
          ) : open ? (
            <LogOut className="h-5 w-5" />
          ) : (
            <LogIn className="h-5 w-5" />
          )}
          {locating
            ? 'Obteniendo ubicación nueva…'
            : api.isPending
              ? 'Registrando…'
              : pending
                ? 'Reintentar misma solicitud'
                : `Marcar ${open ? 'salida' : 'entrada'}`}
        </Button>
        {fix && (
          <p className="text-xs text-muted-foreground">
            Última ubicación obtenida: precisión {Math.round(fix.accuracy)} m · {timeLabel(fix.timestamp)}. La hora de
            asistencia la confirma el servidor.
          </p>
        )}
        {error && (
          <p className="text-sm text-muted-foreground">
            Si el problema continúa, solicita una corrección manual al gestor.
            {data.capabilities.permissions.includes('workforce/attendance') && (
              <>
                {' '}
                <Link href="/workforce/attendance" className="font-medium text-primary underline underline-offset-4">
                  Abrir cuadre
                </Link>
              </>
            )}
          </p>
        )}
      </div>
      <div className="space-y-6">
        <section className="space-y-3">
          <h2 className="font-semibold">Sedes habilitadas</h2>
          {!sites.length ? (
            <p className="text-sm text-muted-foreground">
              {employee
                ? 'El trabajador no tiene una sede activa habilitada. El gestor debe asignarla a su grupo.'
                : 'Selecciona un trabajador para consultar sus sedes.'}
            </p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {sites.map((site) => (
                <li key={site.id} className="flex items-start gap-3 p-4">
                  <MapPin className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  <div>
                    <h3 className="text-sm font-medium">{site.name}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Radio {site.radius} m + tolerancia {site.tolerance} m · precisión máx. {site.maxAccuracy} m ·
                      ubicación hasta {site.maxAgeSeconds} s
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="space-y-3">
          <h2 className="font-semibold">Marcaciones recientes</h2>
          {!marks.length ? (
            <p className="text-sm text-muted-foreground">Las marcaciones aparecerán aquí después de registrarse.</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {marks.slice(0, 8).map((mark) => (
                <li key={mark.id} className="flex items-center justify-between gap-3 p-4">
                  <div>
                    <span className="text-sm font-medium">
                      {(mark.effectiveKind ?? mark.kind) === 'IN' ? 'Entrada' : 'Salida'}
                    </span>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {mark.origin === 'DEMO'
                        ? 'Simulado'
                        : mark.origin === 'SUPERVISOR_GPS'
                          ? `Supervisor: ${mark.actorName}`
                          : mark.origin === 'MANUAL'
                            ? 'Corrección manual'
                            : 'GPS personal'}
                      {mark.excluded ? ' · Excluida' : ''}
                    </p>
                  </div>
                  <div className="text-right text-sm tabular-nums">
                    {timeLabel(mark.effectiveTimestamp ?? mark.timestamp)}
                    <p className="mt-1 text-xs text-muted-foreground">{dateLabel(mark.date)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
