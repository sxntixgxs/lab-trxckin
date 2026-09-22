import { useQuery } from "convex/react";
import { Loader2, Sparkles } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { BuzonTarea } from "../../../components/buzon-row";
import {
  type AnticipoLegalizacionPanelMode,
  getAnticipoCruceSummary,
  getAnticipoPanelHelperText,
  getAnticipoPlanSummaryHelperText,
} from "../../../lib/anticipo-legalizacion";
import { formatCurrency } from "../../../lib/utils";

export function AnticipoCruceQuickAccess({
  tarea,
  panelMode,
  onOpen,
  onMarkAndOpen,
  isSaving = false,
}: {
  tarea: BuzonTarea;
  panelMode: AnticipoLegalizacionPanelMode;
  onOpen: () => void;
  onMarkAndOpen?: () => void;
  isSaving?: boolean;
}) {
  const stage = String(tarea.faseAsignacion ?? tarea.estado);
  const isMarked = tarea.factura?.esLegalizacionAnticipo === true;
  const data = useQuery(
    api.facturacionTareas.obtenerLegalizacionAnticiposFactura,
    isMarked && tarea.facturaId ? { facturaId: tarea.facturaId } : "skip"
  );
  const summary = isMarked ? getAnticipoCruceSummary(data) : null;

  const helperText = getAnticipoPanelHelperText(stage);
  const actionLabel = getAnticipoPanelActionLabel(panelMode);

  return (
    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
      <div className="flex items-start gap-2">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Legalización de anticipo</p>
          <p className="mt-1 text-xs text-amber-800">{helperText}</p>
          {isMarked && tarea.factura ? (
            <p className="mt-2 text-xs text-amber-900">
              Dueño: {tarea.factura.anticipoLiderNombre ?? "Sin líder"} ·{" "}
              {tarea.factura.anticipoProcesoNombre ?? "Sin proceso"}
            </p>
          ) : null}
          {!isMarked ? (
            <p className="mt-2 text-xs text-amber-900">
              Selecciona el dueño histórico antes de cruzar anticipos.
            </p>
          ) : null}
          {summary ? (
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <AnticipoMiniMetric
                label="Cruzado"
                value={formatCurrency(summary.valorAplicado, summary.moneda)}
              />
              <AnticipoMiniMetric
                label="Disponible"
                value={formatCurrency(summary.pendienteDisponible, summary.moneda)}
              />
              <AnticipoMiniMetric
                label="Por cubrir"
                value={formatCurrency(summary.restantePorCruzar, summary.moneda)}
              />
              <AnticipoMiniMetric label="Cruces" value={`${summary.legalizacionesCount}`} />
            </div>
          ) : null}
          <Button
            type="button"
            variant="outline"
            className="mt-3 h-9 rounded-lg border-amber-300 bg-white text-amber-900 hover:bg-amber-100"
            disabled={isSaving}
            onClick={() => {
              if (panelMode === "mark-and-cross") {
                onMarkAndOpen?.();
                return;
              }
              onOpen();
            }}
          >
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Preparando cruce...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                {actionLabel}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

export type AnticipoCrucePlanValidation = {
  state: "loading" | "ready" | "unavailable";
  restantePorCruzar: number;
  moneda: string;
};

export function AnticipoCrucePlanSummary({
  tarea,
  onValidationChange,
}: {
  tarea: BuzonTarea;
  onValidationChange?: (facturaId: string, validation: AnticipoCrucePlanValidation | null) => void;
}) {
  const stage = String(tarea.faseAsignacion ?? tarea.estado);
  const facturaId = String(tarea.facturaId);
  const data = useQuery(
    api.facturacionTareas.obtenerLegalizacionAnticiposFactura,
    tarea.facturaId ? { facturaId: tarea.facturaId } : "skip"
  );
  const summary = getAnticipoCruceSummary(data);
  const validationState = data === undefined ? "loading" : summary ? "ready" : "unavailable";
  const restantePorCruzar = summary?.restantePorCruzar ?? 0;
  const moneda = summary?.moneda ?? tarea.factura?.moneda ?? "COP";

  useEffect(() => {
    onValidationChange?.(facturaId, {
      state: validationState,
      restantePorCruzar,
      moneda,
    });
  }, [facturaId, moneda, onValidationChange, restantePorCruzar, validationState]);

  useEffect(
    () => () => {
      onValidationChange?.(facturaId, null);
    },
    [facturaId, onValidationChange]
  );

  if (data === undefined) {
    return (
      <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        Cargando resumen de anticipos...
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        No se encontró información de cruce para esta factura.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-950">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold">Cruce de anticipos</span>
        <span
          className={`rounded-full px-2 py-0.5 font-semibold ${
            summary.restantePorCruzar > 0
              ? "bg-amber-100 text-amber-800"
              : "bg-emerald-100 text-emerald-700"
          }`}
        >
          {summary.restantePorCruzar > 0 ? "Pendiente" : "Completo"}
        </span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
        <AnticipoMiniMetric
          label="Factura"
          value={formatCurrency(summary.valorFactura, summary.moneda)}
        />
        <AnticipoMiniMetric
          label="Legalizado"
          value={formatCurrency(summary.valorAplicado, summary.moneda)}
        />
        <AnticipoMiniMetric
          label="Saldo pendiente"
          value={formatCurrency(summary.pendienteDisponible, summary.moneda)}
        />
        <AnticipoMiniMetric
          label="Por cruzar"
          value={formatCurrency(summary.restantePorCruzar, summary.moneda)}
        />
        <AnticipoMiniMetric
          label="Anticipos"
          value={formatCurrency(summary.valorSolicitado, summary.moneda)}
        />
        <AnticipoMiniMetric
          label="Total legalizado"
          value={formatCurrency(summary.valorLegalizado, summary.moneda)}
        />
        <AnticipoMiniMetric
          label="Restante factura"
          value={formatCurrency(summary.diferenciaNoCubierta, summary.moneda)}
        />
        <AnticipoMiniMetric label="Cruces" value={`${summary.legalizacionesCount}`} />
      </div>
      <p className="mt-2 text-[11px] text-amber-800">
        {getAnticipoPlanSummaryHelperText(stage, summary.restantePorCruzar)}
      </p>
    </div>
  );
}

export function AnticipoMiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/80 px-2 py-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 font-semibold tabular-nums text-slate-950">{value}</p>
    </div>
  );
}

function getAnticipoPanelActionLabel(mode: AnticipoLegalizacionPanelMode) {
  switch (mode) {
    case "mark-and-cross":
      return "Marcar y cruzar anticipos";
    case "correct":
      return "Corregir cruce de anticipos";
    default:
      return "Abrir cruce de anticipos";
  }
}
