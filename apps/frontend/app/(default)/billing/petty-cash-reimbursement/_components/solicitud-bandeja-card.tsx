"use client";

import { ChevronRight, Download, Loader2, UserCog } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCOP } from "@/lib/format";
import { cn } from "@/lib/utils";
import { EmpresaBadge, EmpresaIconTile, getEmpresaAccentStyle } from "../../lib/empresa-ui";
import { formatElapsed } from "../../lib/utils";

import { ReembolsoStageProgress } from "./reembolso-stage-progress";
import { CausacionReembolsoCounts } from "@/components/facturacion/factura-causacion-panel";
import type { SolicitudBandejaRow } from "./types";

const ESTADO_LABELS: Record<SolicitudBandejaRow["estado"], string> = {
  pendiente_aprobacion_lider: "Aprobación líder",
  pendiente_revision: "Revisión",
  pendiente_revision_impuestos: "Contabilidad",
  pendiente_eventos_dian: "Eventos DIAN",
  pendiente_aprobacion: "Gerencia",
  pendiente_pago_tesoreria: "Tesorería",
};

export function SolicitudBandejaCard({
  row,
  showEmpresaLabel,
  downloadLoading,
  onOpen,
  onReasignar,
  onDownload,
}: {
  row: SolicitudBandejaRow;
  showEmpresaLabel: boolean;
  downloadLoading?: boolean;
  onOpen: () => void;
  onReasignar?: () => void;
  onDownload?: () => void;
}) {
  const empresaAccent = getEmpresaAccentStyle(row.empresaId);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      className="group flex w-full flex-col gap-4 rounded-xl border border-l-[3px] border-slate-200 bg-white p-4 text-left shadow-xs transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 md:flex-row md:items-center"
      style={{ borderLeftColor: empresaAccent.color }}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <EmpresaIconTile empresaId={row.empresaId} className="h-10 w-10 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold text-slate-950">{row.numeroReembolso}</p>
            {showEmpresaLabel ? <EmpresaBadge empresaId={row.empresaId} compact /> : null}
            <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
              {row.cajaNombre}
            </Badge>
            <Badge variant="outline">{ESTADO_LABELS[row.estado]}</Badge>
            <Badge variant={row.puedeActuar ? "default" : "secondary"}>
              {row.puedeActuar ? "Requiere tu acción" : "Sólo seguimiento"}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            Custodio: {row.custodio.nombre} · Responsable: {row.responsableActual.nombre}
          </p>
          <div className="mt-2">
            <ReembolsoStageProgress progreso={row.progreso} compact />
          </div>
          <div className="mt-2">
            <CausacionReembolsoCounts
              causadas={row.causacionCausadasCount ?? 0}
              noCausadas={row.causacionNoCausadasCount ?? 0}
              sinRegistro={row.causacionSinRegistroCount ?? 0}
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {row.puedeReasignar && onReasignar ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="rounded-lg bg-white"
                onClick={(event) => {
                  event.stopPropagation();
                  onReasignar();
                }}
              >
                <UserCog className="mr-1 h-4 w-4" />
                Reasignar
              </Button>
            ) : null}
            {row.puedeDescargarFormato && onDownload ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="rounded-lg bg-white"
                disabled={downloadLoading}
                onClick={(event) => {
                  event.stopPropagation();
                  onDownload();
                }}
              >
                {downloadLoading ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-1 h-4 w-4" />
                )}
                GFN-F006
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-between gap-4 md:flex-col md:items-end md:justify-center">
        <div className="text-left md:text-right">
          <p className="text-lg font-semibold tabular-nums text-slate-950">
            {formatCOP(row.valorTotal)}
          </p>
          <p className="text-sm text-slate-500">
            {row.movimientosCount} movimiento{row.movimientosCount !== 1 ? "s" : ""}
          </p>
          <p className="text-xs text-slate-500">{formatElapsed(row.actualizadoEn)}</p>
        </div>
        <ChevronRight
          className={cn(
            "h-5 w-5 text-slate-400 transition group-hover:text-slate-600",
          )}
          aria-hidden
        />
      </div>
    </div>
  );
}
