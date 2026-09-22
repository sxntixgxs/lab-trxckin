"use client";

import { CheckCircle2 } from "lucide-react";

import Loading from "../../../loading";
import {
  EstadoBadge,
  KpiTile,
  type ReembolsoModalTarget,
} from "@/components/cajas-menores";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Id } from "@/convex/_generated/dataModel";
import { getSaldoDisponibleTone } from "@/lib/cajas-menores";
import { formatCOP } from "@/lib/format";
import type { FacturacionUsuario } from "@/app/(default)/billing/hooks/use-facturacion-users";
import { formatDateTime } from "@/app/(default)/billing/lib/utils";

import type { CajaRow } from "./types";

type MovimientoPendiente = {
  _id: string;
  nombreEmpresa: string;
  centroCostoCodigo: string;
  fechaPago: string;
  valor: number;
  origen?: string;
  factura?: { numeroFactura?: string } | null;
  facturaId?: string;
};

type ReembolsoHistorialRow = {
  _id: string;
  valorTotal: number;
  estado: string;
  custodioNombre: string;
  movimientoIds: string[];
};

type CajaDetalle = {
  caja: {
    saldoActual: number;
    saldoDisponible: number;
    totalRefills: number;
    totalReembolsado?: number;
    totalLegalizado: number;
  };
  pendientesReembolso: MovimientoPendiente[];
  reembolsos: ReembolsoHistorialRow[];
  refills: Array<{
    _id: Id<"cajasMenoresRefills">;
    refillValue: number;
    refillToUserId: string;
    refillDate: number;
    receiptConfirmed: boolean;
  }>;
  movimientos: Array<{
    _id: string;
    valor: number;
    nombreEmpresa: string;
    centroCostoCodigo: string;
    centroCostoNombre: string;
    facturaId?: string;
    factura?: { numeroFactura?: string } | null;
    estado: string;
  }>;
};

type CajaDetailDialogProps = {
  detailFor: CajaRow | null;
  detail: CajaDetalle | undefined | null;
  actorUserId: string;
  usuariosById: Map<string, FacturacionUsuario>;
  onSelectReembolso: (reembolso: ReembolsoModalTarget) => void;
  onConfirmRefill: (refillId: Id<"cajasMenoresRefills">) => void | Promise<void>;
  onClose: () => void;
};

export function CajaDetailDialog({
  detailFor,
  detail,
  actorUserId,
  usuariosById,
  onSelectReembolso,
  onConfirmRefill,
  onClose,
}: CajaDetailDialogProps) {
  return (
    <Dialog open={Boolean(detailFor)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{detailFor?.nombre ?? "Caja Menor"}</DialogTitle>
          <DialogDescription>
            Refills, legalizaciones y saldos en tiempo real.
          </DialogDescription>
        </DialogHeader>
        {detail === undefined ? (
          <Loading />
        ) : detail ? (
          <div className="space-y-5">
            <div className="grid gap-3 md:grid-cols-4">
              <KpiTile
                label="Saldo actual"
                value={formatCOP(detail.caja.saldoActual)}
                tone={getSaldoDisponibleTone(detail.caja.saldoActual)}
              />
              <KpiTile
                label="Disponible"
                value={formatCOP(detail.caja.saldoDisponible)}
                tone={getSaldoDisponibleTone(detail.caja.saldoDisponible)}
              />
              <KpiTile label="Refills" value={formatCOP(detail.caja.totalRefills)} />
              <KpiTile
                label="Reembolsado"
                value={formatCOP(detail.caja.totalReembolsado ?? 0)}
              />
              <KpiTile
                label="Legalizado"
                value={formatCOP(detail.caja.totalLegalizado)}
              />
            </div>
            <section className="rounded-xl border border-slate-200">
              <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold">
                Pendientes por reembolso
              </div>
              <div className="divide-y divide-slate-100">
                {detail.pendientesReembolso.length === 0 ? (
                  <p className="px-4 py-6 text-sm text-slate-500">
                    Sin movimientos pendientes.
                  </p>
                ) : (
                  detail.pendientesReembolso.map((movimiento) => (
                    <MovimientoCajaMenorRow key={movimiento._id} movimiento={movimiento} />
                  ))
                )}
              </div>
            </section>
            <section className="rounded-xl border border-slate-200">
              <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold">
                Historial de reembolsos
              </div>
              <div className="divide-y divide-slate-100">
                {detail.reembolsos.length === 0 ? (
                  <p className="px-4 py-6 text-sm text-slate-500">
                    Sin reembolsos generados.
                  </p>
                ) : (
                  detail.reembolsos.map((reembolso) => (
                    <button
                      key={reembolso._id}
                      type="button"
                      onClick={() => onSelectReembolso(reembolso)}
                      className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-left text-sm transition hover:bg-slate-50"
                    >
                      <div>
                        <p className="font-semibold text-slate-950">
                          {formatCOP(reembolso.valorTotal)}
                        </p>
                        <p className="text-xs text-slate-500">
                          {reembolso.movimientoIds.length} movimiento(s) · custodio{" "}
                          {reembolso.custodioNombre}
                        </p>
                      </div>
                      <EstadoBadge kind="reembolso" estado={reembolso.estado} />
                    </button>
                  ))
                )}
              </div>
            </section>
            <section className="rounded-xl border border-slate-200">
              <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold">
                Refills manuales
              </div>
              <div className="divide-y divide-slate-100">
                {detail.refills.length === 0 ? (
                  <p className="px-4 py-6 text-sm text-slate-500">Sin refills.</p>
                ) : (
                  detail.refills.map((refill) => (
                    <div
                      key={refill._id}
                      className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-slate-950">
                          {formatCOP(refill.refillValue)}
                        </p>
                        <p className="text-xs text-slate-500">
                          Para{" "}
                          {usuariosById.get(refill.refillToUserId)?.nombre ??
                            refill.refillToUserId}{" "}
                          · {formatDateTime(refill.refillDate)}
                        </p>
                      </div>
                      {refill.receiptConfirmed ? (
                        <Badge className="bg-emerald-100 text-emerald-700">
                          Confirmado
                        </Badge>
                      ) : detailFor?.canManage || refill.refillToUserId === actorUserId ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-lg bg-white"
                          onClick={() => void onConfirmRefill(refill._id)}
                        >
                          <CheckCircle2 className="mr-2 h-4 w-4" />
                          Confirmar recibo
                        </Button>
                      ) : (
                        <Badge variant="outline" className="bg-amber-50 text-amber-700">
                          Pendiente de confirmación
                        </Badge>
                      )}
                    </div>
                  ))
                )}
              </div>
            </section>
            <section className="rounded-xl border border-slate-200">
              <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold">
                Movimientos Caja Menor
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Factura / recibo</th>
                      <th className="px-4 py-3">Centro costo</th>
                      <th className="px-4 py-3 text-right">Valor</th>
                      <th className="px-4 py-3">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {detail.movimientos.map((movimiento) => (
                      <tr key={movimiento._id}>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-950">
                            #{movimiento.factura?.numeroFactura ?? movimiento.facturaId}
                          </p>
                          <p className="text-xs text-slate-500">{movimiento.nombreEmpresa}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p>{movimiento.centroCostoCodigo}</p>
                          <p className="text-xs text-slate-500">
                            {movimiento.centroCostoNombre}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-emerald-700">
                          {formatCOP(movimiento.valor)}
                        </td>
                        <td className="px-4 py-3">
                          <EstadoBadge kind="movimiento" estado={movimiento.estado} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function MovimientoCajaMenorRow({
  movimiento,
}: {
  movimiento: MovimientoPendiente;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
      <div className="min-w-0">
        <p className="truncate font-semibold text-slate-950">
          {movimiento.nombreEmpresa}
        </p>
        <p className="text-xs text-slate-500">
          #{movimiento.factura?.numeroFactura ?? movimiento.facturaId} ·{" "}
          {movimiento.centroCostoCodigo} · {movimiento.fechaPago}
        </p>
      </div>
      <div className="text-right">
        <p className="font-semibold tabular-nums text-slate-950">
          {formatCOP(movimiento.valor)}
        </p>
        <Badge variant="outline" className="mt-1 bg-teal-50 text-teal-700">
          {movimiento.origen === "recibo_fisico" ? "Recibo físico" : "Factura"}
        </Badge>
      </div>
    </div>
  );
}
