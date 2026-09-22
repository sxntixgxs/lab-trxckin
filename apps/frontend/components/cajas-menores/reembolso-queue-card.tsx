import type { ReactNode } from "react";

import { EstadoBadge } from "@/components/cajas-menores/estado-badge";
import type { Id } from "@/convex/_generated/dataModel";
import { formatCOP } from "@/lib/format";
import { getEmpresaNombre } from "@/lib/empresas";

export type ReembolsoQueueItem = {
  _id: Id<"cajasMenoresReembolsos">;
  valorTotal: number;
  estado: string;
  movimientoIds: string[];
  numeroReembolso?: string;
  custodioNombre: string;
  custodioUserId?: string;
  reviewerNombre?: string;
  reviewAssignedNombre?: string;
  reviewAssignedUserId?: string;
  puedeAprobar?: boolean;
  puedeConfirmar?: boolean;
  puedeCargarComprobante?: boolean;
  puedeRevisar?: boolean;
  puedeReasignarRevision?: boolean;
  puedeAprobarLider?: boolean;
  liderAprobadorNombre?: string;
  puedeDecidirContabilidad?: boolean;
  puedeReasignarContabilidad?: boolean;
  contadorAsignadoNombre?: string;
  contadorAsignadoUserId?: string;
  eventosDianAsignadoNombre?: string;
  eventosDianAsignadoUserId?: string;
  puedeDecidirEventosDian?: boolean;
  puedeReasignarEventosDian?: boolean;
  formatoSnapshot?: {
    numeroReembolso: string;
    empresaNombre: string;
    cajaNombre: string;
    custodioNombre: string;
    custodioEmail: string;
    generadoEn: number;
    valorTotal: number;
    solicitudComentario?: string;
    movimientos: Array<{
      numeroFactura: string;
      proveedorNombre: string;
      proveedorNit?: string;
      concepto: string;
      fechaPago: string;
      centroCostoCodigo: string;
      centroCostoNombre: string;
      valor: number;
    }>;
  } | null;
  movimientos?: Array<{
    _id: string;
    valor: number;
    nombreEmpresa?: string;
    concepto: string;
    centroCostoCodigo?: string;
    centroCostoNombre?: string;
    fechaPago?: string;
    estado?: string;
    facturaId: string;
    factura?: {
      numeroFactura?: string;
      proveedorNombre?: string;
      proveedorNit?: string;
      fechaEmision?: string;
    } | null;
  }>;
  caja?: {
    nombre: string;
    empresa_id?: number;
  } | null;
};

export function ReembolsoQueueCard({
  title,
  icon,
  empty,
  items,
  countLabel = "pendiente(s)",
  renderActions,
}: {
  title: string;
  icon: ReactNode;
  empty: string;
  items: ReembolsoQueueItem[];
  countLabel?: string;
  renderActions: (item: ReembolsoQueueItem) => ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
      <div className="mb-4 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
          {icon}
        </span>
        <div>
          <h2 className="text-base font-semibold text-slate-950">{title}</h2>
          <p className="text-xs text-slate-500">{items.length} {countLabel}</p>
        </div>
      </div>
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500">
          {empty}
        </p>
      ) : (
        <div className="space-y-3">
          {items.map((reembolso) => (
            <article
              key={String(reembolso._id)}
              className="rounded-xl border border-slate-200 p-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-950">
                    {reembolso.caja?.nombre ?? "Caja Menor"}
                  </p>
                  {reembolso.numeroReembolso ? (
                    <p className="mt-0.5 text-xs font-medium text-teal-700">
                      {reembolso.numeroReembolso}
                    </p>
                  ) : null}
                  {reembolso.caja?.empresa_id ? (
                    <p className="mt-0.5 text-xs text-slate-500">
                      {getEmpresaNombre(reembolso.caja.empresa_id)}
                    </p>
                  ) : null}
                  <p className="mt-1 text-sm text-slate-500">
                    {reembolso.movimientoIds.length} movimiento(s) · custodio{" "}
                    {reembolso.custodioNombre}
                    {reembolso.reviewAssignedNombre
                      ? ` · asignado a ${reembolso.reviewAssignedNombre}`
                      : reembolso.eventosDianAsignadoNombre
                        ? ` · asignado a ${reembolso.eventosDianAsignadoNombre}`
                        : reembolso.contadorAsignadoNombre
                          ? ` · asignado a ${reembolso.contadorAsignadoNombre}`
                          : reembolso.reviewerNombre
                            ? ` · revisado por ${reembolso.reviewerNombre}`
                            : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold tabular-nums text-slate-950">
                    {formatCOP(reembolso.valorTotal)}
                  </p>
                  <EstadoBadge
                    kind="reembolso"
                    estado={reembolso.estado}
                    className="mt-1"
                  />
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {renderActions(reembolso)}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
