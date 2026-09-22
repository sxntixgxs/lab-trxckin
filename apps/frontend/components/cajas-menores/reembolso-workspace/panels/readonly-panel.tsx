"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCOP } from "@/lib/format";
import type { Id } from "@/convex/_generated/dataModel";
import { FacturaCausacionPanel } from "@/components/facturacion/factura-causacion-panel";

import { ReembolsoTimeline, type ReembolsoTimelineEvento } from "../../reembolso-timeline";

export function ReembolsoReadonlyPanel({
  facturaCount,
  valorTotal,
  timeline,
  reembolsoId,
  facturaId,
  movimientoId,
  numeroFactura,
  stageAttachments,
  onClose,
}: {
  facturaCount: number;
  valorTotal: number;
  timeline: ReembolsoTimelineEvento[];
  reembolsoId?: Id<"cajasMenoresReembolsos">;
  facturaId?: Id<"facturacionFacturas">;
  movimientoId?: Id<"facturacionCajaMenorMovimientos">;
  numeroFactura?: string;
  stageAttachments?: ReactNode;
  onClose: () => void;
}) {
  const [historyOpen, setHistoryOpen] = useState(true);
  const lastEvent = timeline[0] ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 space-y-2 border-b border-slate-100 bg-slate-50/70 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-slate-950">Consulta</p>
          <Badge variant="outline" className="tabular-nums">
            {facturaCount} factura{facturaCount === 1 ? "" : "s"}
          </Badge>
        </div>
        <p className="text-xs text-slate-600">
          Solo lectura ·{" "}
          <span className="font-semibold tabular-nums text-slate-900">
            {formatCOP(valorTotal)}
          </span>
        </p>
        {lastEvent ? (
          <p className="truncate text-[11px] text-slate-500">
            Última actividad: {lastEvent.titulo}
          </p>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {reembolsoId && facturaId && movimientoId ? (
          <FacturaCausacionPanel
            facturaId={facturaId}
            numeroFactura={numeroFactura}
            contexto={{ tipo: "reembolso_caja_menor", reembolsoId, movimientoId }}
            readonly
          />
        ) : null}
        <button
          type="button"
          className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs font-semibold text-slate-700"
          onClick={() => setHistoryOpen((open) => !open)}
        >
          Historial ({timeline.length})
          {historyOpen ? (
            <ChevronDown className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          )}
        </button>
        {historyOpen ? (
          <div className="rounded-lg border border-slate-200 bg-white p-2">
            <ReembolsoTimeline eventos={timeline} />
          </div>
        ) : null}

        {stageAttachments ? (
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Adjuntos de etapas
            </p>
            {stageAttachments}
          </div>
        ) : null}
      </div>

      <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-3">
        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-lg"
            onClick={onClose}
          >
            Cerrar
          </Button>
        </div>
      </div>
    </div>
  );
}
