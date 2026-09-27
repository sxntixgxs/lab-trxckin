'use client';

import { useEffect, useId, useState, type ReactNode, type SelectHTMLAttributes } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AlertCircle, CalendarClock, ClipboardList, Loader2, MapPin, Settings, Users, Navigation } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { CalculationResult, WorkforceSnapshot, Membership, CalculationPolicy } from '@/lib/workforce/types';
import { CATEGORY_LABELS, formatMinutes } from '@/lib/workforce/calculation';

const sections = [
  ['scheduling', 'Programación', CalendarClock],
  ['attendance', 'Cuadre', ClipboardList],
  ['check-in', 'Marcar asistencia', Navigation],
  ['employees', 'Trabajadores', Users],
  ['locations', 'Sedes', MapPin],
  ['settings', 'Configuración', Settings],
] as const;

export function WorkforceShell({
  title,
  description,
  children,
  actions,
  data,
}: {
  title: string;
  description: string;
  children: ReactNode;
  actions?: ReactNode;
  data?: WorkforceSnapshot;
}) {
  const pathname = usePathname();
  return (
    <section className="mx-auto w-full max-w-[1700px] space-y-5 px-4 py-6 sm:px-6 lg:px-8 selection:bg-primary/15">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
      <nav aria-label="Talento humano" className="flex gap-1 overflow-x-auto border-b pb-2">
        {sections
          .filter(
            ([path]) => !data || data.capabilities.permissions.includes(`workforce/${path}`) || data.capabilities.admin,
          )
          .map(([path, label, Icon]) => (
            <Link
              key={path}
              href={`/workforce/${path}`}
              aria-current={pathname.endsWith(path) ? 'page' : undefined}
              className={cn(
                'inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                pathname.endsWith(path)
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
      </nav>
      {children}
    </section>
  );
}

export function DataState({
  loading,
  error,
  companyId,
  children,
  retry,
}: {
  loading: boolean;
  error: unknown;
  companyId: number | null;
  children: ReactNode;
  retry?: () => void;
}) {
  if (!companyId)
    return (
      <Empty
        title="Selecciona una empresa"
        description="Usa el selector de empresa del encabezado para consultar su equipo y programación."
      />
    );
  if (loading)
    return (
      <div role="status" className="flex min-h-48 items-center justify-center gap-3 text-sm text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        Cargando talento humano…
      </div>
    );
  if (error)
    return (
      <Notice danger>
        <strong>No se pudo cargar el módulo.</strong>
        <p className="mt-1">{errorMessage(error)}</p>
        {retry && (
          <Button variant="outline" size="sm" className="mt-3" onClick={retry}>
            Reintentar
          </Button>
        )}
      </Notice>
    );
  return children;
}
export function Empty({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed px-6 py-12 text-center">
      <Users className="mx-auto mb-3 h-7 w-7 text-muted-foreground" />
      <h2 className="font-medium">{title}</h2>
      <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">{description}</p>
      {children && <div className="mt-5">{children}</div>}
    </div>
  );
}
export function Notice({ children, danger = false }: { children: ReactNode; danger?: boolean }) {
  return (
    <div
      role={danger ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-2 rounded-md border p-3 text-sm',
        danger
          ? 'border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100'
          : 'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100',
      )}
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}
export function Field({
  label,
  children,
  help,
  className,
}: {
  label: string;
  children: ReactNode;
  help?: string;
  className?: string;
}) {
  return (
    <label className={cn('grid content-start gap-1.5 text-sm font-medium', className)}>
      <span>{label}</span>
      {children}
      {help && <span className="text-xs font-normal text-muted-foreground">{help}</span>}
    </label>
  );
}
export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <DialogContent className={cn('max-h-[90dvh] overflow-y-auto', wide && 'sm:max-w-3xl')}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
export function CheckList({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { id: string; label: string }[];
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const id = useId();
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{label}</legend>
      <div className="max-h-40 space-y-1 overflow-auto rounded-md border p-2">
        {options.length === 0 && <p className="p-1 text-xs text-muted-foreground">No hay opciones disponibles.</p>}
        {options.map((option) => (
          <label
            key={option.id}
            htmlFor={`${id}-${option.id}`}
            className="flex cursor-pointer items-center gap-2 rounded p-1.5 text-sm hover:bg-muted"
          >
            <input
              id={`${id}-${option.id}`}
              type="checkbox"
              className="accent-primary"
              checked={value.includes(option.id)}
              onChange={(event) =>
                onChange(event.target.checked ? [...value, option.id] : value.filter((item) => item !== option.id))
              }
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
export function Hours({ result, compact = false }: { result?: CalculationResult; compact?: boolean }) {
  if (!result) return <span className="text-muted-foreground">—</span>;
  if (compact) return <span className="tabular-nums">{formatMinutes(result.totalMinutes)}</span>;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
        <span>
          Trabajo: <strong className="tabular-nums">{formatMinutes(result.totalMinutes)}</strong>
        </span>
        <span className="text-muted-foreground">Deducción: {formatMinutes(result.mealMinutes)}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {Object.entries(result.totals).map(([key, value]) => (
          <div key={key} className="rounded-md bg-muted/60 p-2">
            <div className="text-xs text-muted-foreground">{CATEGORY_LABELS[key as keyof typeof CATEGORY_LABELS]}</div>
            <div className="mt-1 text-sm font-semibold tabular-nums">{formatMinutes(value)}</div>
          </div>
        ))}
      </div>
      {result.incidents.length > 0 && <Notice>{result.incidents.join(' · ')}</Notice>}
    </div>
  );
}
export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
export function useWorkforceNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}
export function timeLabel(timestamp: number) {
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(timestamp);
}
export function dateLabel(date: string, weekday = false) {
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    ...(weekday ? { weekday: 'short' as const } : {}),
  }).format(new Date(`${date}T12:00:00Z`));
}
export function membershipFor(memberships: Membership[], employeeId: string, date: string) {
  return memberships
    .filter((m) => m.employeeId === employeeId && m.effectiveFrom <= date && (!m.effectiveTo || m.effectiveTo >= date))
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
}
export function policyFor(data: WorkforceSnapshot, date: string): CalculationPolicy {
  return (
    [...data.settings.policies]
      .filter((p) => p.effectiveFrom <= date)
      .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0] ?? data.settings.policies[0]
  );
}
export function canAdmin(data: WorkforceSnapshot) {
  return data.capabilities.admin || data.capabilities.hr;
}
export function useUnsavedGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const before = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    const click = (event: MouseEvent) => {
      const link = (event.target as HTMLElement).closest('a[href]');
      if (
        link &&
        link.getAttribute('href') !== window.location.pathname &&
        !window.confirm('Hay cambios sin guardar. ¿Salir y descartarlos?')
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener('beforeunload', before);
    document.addEventListener('click', click, true);
    return () => {
      window.removeEventListener('beforeunload', before);
      document.removeEventListener('click', click, true);
    };
  }, [dirty]);
}
export const tableClass =
  'w-full text-left text-sm [&_th]:whitespace-nowrap [&_th]:bg-muted/60 [&_th]:px-4 [&_th]:py-3 [&_th]:text-xs [&_th]:font-semibold [&_th]:text-muted-foreground [&_td]:px-4 [&_td]:py-3 [&_tr]:border-b [&_tbody_tr:last-child]:border-0 [&_tbody_tr:hover]:bg-muted/30';
