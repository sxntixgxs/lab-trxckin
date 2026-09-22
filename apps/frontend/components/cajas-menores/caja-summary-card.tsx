import type { ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getSaldoDisponibleTextClass } from "@/lib/cajas-menores";
import { formatCOP } from "@/lib/format";

export type CajaSummaryData = {
  _id: string;
  nombre: string;
  empresa_id: number;
  assignedValue: number;
  totalRefills?: number;
  saldoDisponible: number;
  saldoActual?: number;
  totalLegalizado?: number;
  estado?: "activa" | "cerrada";
  refillPendiente?: boolean;
  pendientes?: unknown[];
};

export function CajaSummaryCard({
  caja,
  empresaNombre,
  headerExtra,
  children,
}: {
  caja: CajaSummaryData;
  empresaNombre?: string;
  headerExtra?: ReactNode;
  children?: ReactNode;
}) {
  const pendientesCount = caja.pendientes?.length ?? 0;
  const asignadoTotal = caja.assignedValue + (caja.totalRefills ?? 0);

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {empresaNombre ? (
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              {empresaNombre}
            </p>
          ) : null}
          <h2 className="text-base font-semibold text-slate-950">{caja.nombre}</h2>
          <p className="mt-1 text-sm text-slate-500">
            Asignado {formatCOP(asignadoTotal)} · disponible{" "}
            <span className={getSaldoDisponibleTextClass(caja.saldoDisponible)}>
              {formatCOP(caja.saldoDisponible)}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {caja.estado === "cerrada" ? (
            <Badge variant="outline">Cerrada</Badge>
          ) : caja.refillPendiente ? (
            <Badge
              variant="outline"
              className="border-amber-200 bg-amber-50 text-amber-700"
            >
              Bloqueada por refill
            </Badge>
          ) : (
            <Badge className="bg-emerald-100 text-emerald-700">Activa</Badge>
          )}
          {pendientesCount > 0 ? (
            <Badge variant="outline" className="rounded-full bg-teal-50 text-teal-700">
              {pendientesCount} pendiente(s)
            </Badge>
          ) : null}
          {headerExtra}
        </div>
      </div>
      {children ? <div className="mt-4">{children}</div> : null}
    </article>
  );
}

export function MovimientoSelectableRow({
  movimiento,
  checked,
  onCheckedChange,
  secondaryAction,
  menuDisabled,
  onDevolverABuzon,
}: {
  movimiento: {
    _id: string;
    nombreEmpresa: string;
    centroCostoCodigo: string;
    concepto: string;
    valor: number;
    fechaPago: string;
    origen?: string;
    factura?: { numeroFactura?: string } | null;
  };
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  secondaryAction?: ReactNode;
  menuDisabled?: boolean;
  onDevolverABuzon?: () => void;
}) {
  const showMenu = Boolean(onDevolverABuzon) || Boolean(secondaryAction);

  return (
    <div className="flex gap-3 rounded-xl border border-slate-200 p-3 text-sm transition hover:border-teal-200 hover:bg-teal-50/30">
      <label className="flex min-w-0 flex-1 cursor-pointer gap-3">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 accent-teal-600"
          checked={checked}
          onChange={(event) => onCheckedChange(event.target.checked)}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-semibold text-slate-900">
                {movimiento.nombreEmpresa}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                {movimiento.centroCostoCodigo} · {movimiento.concepto}
              </p>
            </div>
            <span className="font-semibold tabular-nums text-slate-950">
              {formatCOP(movimiento.valor)}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {movimiento.factura?.numeroFactura ?? "Recibo físico"} ·{" "}
            {movimiento.fechaPago}
          </p>
        </div>
      </label>
      {showMenu ? (
        <div className="shrink-0 self-start">
          {secondaryAction ?? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-lg text-slate-500"
                  disabled={menuDisabled}
                  aria-label="Acciones del movimiento"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  disabled={menuDisabled}
                  onSelect={() => onDevolverABuzon?.()}
                >
                  Devolver a Buzón
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      ) : null}
    </div>
  );
}
