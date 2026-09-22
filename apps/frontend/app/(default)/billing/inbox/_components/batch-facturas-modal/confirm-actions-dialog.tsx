import { AlertTriangle, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import type { Id } from "@/convex/_generated/dataModel";
import type { BuzonTarea } from "../../../components/buzon-row";
import { FacturaPagoAmount } from "../../../components/valor-contable-ui";
import {
  FacturaEmpresaBadge,
  getEmpresaAccentStyle,
  resolveFacturacionEmpresaId,
} from "../../../lib/empresa-ui";
import { formatCurrency } from "../../../lib/utils";
import type { WorkflowAction } from "../../../lib/workflow-config";
import { getActiveStage } from "../../../lib/workflow-config";
import { getTaskKey } from "../helpers";
import type { Actor } from "../types";
import { ActionIcon, getActionResultLabel } from "./action-ui";
import { AnticipoCrucePlanSummary, type AnticipoCrucePlanValidation } from "./anticipo-panels";
import { CajaMenorPlanSummary } from "./caja-menor-panels";
import type { FacturacionUsuario } from "../../../hooks/use-facturacion-users";
import { getPhaseAssignmentSummaryLabel } from "./assign-phase-user-utils";
import type { BatchPlan } from "./types";
import { groupBatchPlans } from "./workflow-plan-utils";

export function ConfirmActionsDialog({
  confirmBatchAction,
  loading,
  isSingle,
  activeTarea,
  effectivePlans,
  totalSeleccionado,
  moneda,
  comment,
  actor,
  usuariosById,
  setConfirmBatchAction,
  executeConfirmedAction,
  onOpenCruce,
}: {
  confirmBatchAction: WorkflowAction | null;
  loading: boolean;
  isSingle: boolean;
  activeTarea: BuzonTarea | null;
  effectivePlans: BatchPlan[];
  totalSeleccionado: number;
  moneda: string;
  comment: string;
  actor: Actor;
  usuariosById: Map<string, FacturacionUsuario>;
  setConfirmBatchAction: (action: WorkflowAction | null) => void;
  executeConfirmedAction: (action: WorkflowAction) => void;
  onOpenCruce: (tarea: BuzonTarea) => void | Promise<void>;
}) {
  const [anticipoValidationByFacturaId, setAnticipoValidationByFacturaId] = useState<
    Record<string, AnticipoCrucePlanValidation>
  >({});

  const handleAnticipoValidationChange = useCallback(
    (facturaId: string, validation: AnticipoCrucePlanValidation | null) => {
      setAnticipoValidationByFacturaId((current) => {
        if (!validation) {
          if (!(facturaId in current)) return current;
          const next = { ...current };
          delete next[facturaId];
          return next;
        }

        const previous = current[facturaId];
        if (
          previous?.state === validation.state &&
          previous.restantePorCruzar === validation.restantePorCruzar &&
          previous.moneda === validation.moneda
        ) {
          return current;
        }
        return { ...current, [facturaId]: validation };
      });
    },
    []
  );

  useEffect(() => {
    if (!confirmBatchAction) setAnticipoValidationByFacturaId({});
  }, [confirmBatchAction]);

  const anticipoPlansToValidate = useMemo(
    () =>
      effectivePlans.filter(
        (plan) =>
          plan.tarea.factura?.esLegalizacionAnticipo === true &&
          (plan.action.kind === "forward" || plan.action.kind === "skip-accounting-chain")
      ),
    [effectivePlans]
  );
  const anticipoValidations = anticipoPlansToValidate.map((plan) =>
    plan.tarea.facturaId ? anticipoValidationByFacturaId[String(plan.tarea.facturaId)] : undefined
  );
  const isCheckingAnticipos = anticipoValidations.some(
    (validation) => !validation || validation.state === "loading"
  );
  const hasUnavailableAnticipos = anticipoValidations.some(
    (validation) => validation?.state === "unavailable"
  );
  const pendingAnticipoPlans = anticipoPlansToValidate.filter((plan) => {
    const validation = plan.tarea.facturaId
      ? anticipoValidationByFacturaId[String(plan.tarea.facturaId)]
      : undefined;
    return validation?.state === "ready" && validation.restantePorCruzar > 0.001;
  });
  const isAnticipoBlocked =
    isCheckingAnticipos || hasUnavailableAnticipos || pendingAnticipoPlans.length > 0;
  const singlePendingAnticipo = pendingAnticipoPlans.length === 1 ? pendingAnticipoPlans[0] : null;
  const pendingAnticipoTotal = pendingAnticipoPlans.reduce((total, plan) => {
    if (!plan.tarea.facturaId) return total;
    return (
      total + (anticipoValidationByFacturaId[String(plan.tarea.facturaId)]?.restantePorCruzar ?? 0)
    );
  }, 0);
  const pendingAnticipoCurrency = singlePendingAnticipo?.tarea.facturaId
    ? (anticipoValidationByFacturaId[String(singlePendingAnticipo.tarea.facturaId)]?.moneda ??
      moneda)
    : moneda;

  const confirmationLabel = isCheckingAnticipos
    ? "Validando anticipos..."
    : isAnticipoBlocked
      ? "Completa el cruce para continuar"
      : "Confirmar y ejecutar";

  return (
    <AlertDialog
      open={confirmBatchAction !== null}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !loading) setConfirmBatchAction(null);
      }}
    >
      <AlertDialogContent className="max-w-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isSingle ? "Confirmar acción" : "Confirmar acciones"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isSingle
              ? `Se aplicará la acción seleccionada a ${activeTarea?.factura?.numeroFactura ?? "esta factura"}.`
              : `Se aplicarán las siguientes acciones a ${effectivePlans.length} factura(s) por un total de ${formatCurrency(totalSeleccionado, moneda)}.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
          {groupBatchPlans(effectivePlans).map((group) => (
            <div
              key={group.key}
              className="rounded-xl border border-slate-200 bg-white p-4 text-sm"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <ActionIcon action={group.action} />
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-950">{group.action.label}</p>
                    <p className="text-xs text-slate-500">{getActionResultLabel(group.action)}</p>
                  </div>
                </div>
                <Badge variant="outline" className="rounded-full tabular-nums">
                  {group.plans.length}
                </Badge>
              </div>
              <div className="mt-3 grid gap-2">
                {group.plans.map((plan) => {
                  const empresaAccent = getEmpresaAccentStyle(
                    resolveFacturacionEmpresaId(plan.tarea)
                  );
                  return (
                    <div key={getTaskKey(plan.tarea)} className="grid gap-2">
                      <div
                        className="flex items-center gap-3 rounded-lg border-l-[3px] px-3 py-2"
                        style={{
                          borderLeftColor: empresaAccent.color,
                          backgroundColor: empresaAccent.rowBackground,
                        }}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-slate-900">
                            {plan.tarea.factura?.proveedorNombre ?? "Sin proveedor"}
                          </p>
                          <p className="text-xs text-slate-500">
                            #{plan.tarea.factura?.numeroFactura ?? "-"} ·{" "}
                            {isSingle
                              ? "Factura"
                              : plan.source === "individual"
                                ? "Individual"
                                : "Conjunta"}
                          </p>
                          {plan.action.kind === "assign-phase-user" && plan.phaseAssignment ? (
                            <p className="mt-1 text-xs font-medium text-slate-700">
                              {getPhaseAssignmentSummaryLabel(
                                plan.tarea,
                                plan.phaseAssignment,
                                usuariosById
                              )}
                            </p>
                          ) : null}
                          {plan.action.kind === "assign-phase-user" ||
                          plan.source === "individual" ? (
                            <p className="mt-1 line-clamp-2 text-xs text-slate-600">
                              {plan.observation}
                            </p>
                          ) : null}
                        </div>
                        <FacturaEmpresaBadge tarea={plan.tarea} compact />
                        <span className="shrink-0 font-semibold tabular-nums text-slate-950">
                          {plan.tarea.factura ? (
                            <FacturaPagoAmount
                              factura={plan.tarea.factura}
                              fase={String(getActiveStage(plan.tarea))}
                              valorContableDraft={plan.valorContable}
                            />
                          ) : (
                            "-"
                          )}
                        </span>
                      </div>
                      {plan.tarea.factura?.esLegalizacionAnticipo ? (
                        <AnticipoCrucePlanSummary
                          tarea={plan.tarea}
                          onValidationChange={handleAnticipoValidationChange}
                        />
                      ) : null}
                      {plan.tarea.factura?.esLegalizacionCajaMenor ||
                      plan.action.kind === "mark-caja-menor" ||
                      plan.action.kind === "legalize-caja-menor" ? (
                        <CajaMenorPlanSummary
                          tarea={plan.tarea}
                          actorUserId={actor.actorUserId}
                          selectedCajaId={plan.selectedIds[0] as Id<"cajasMenores"> | undefined}
                        />
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {comment.trim() && confirmBatchAction?.kind !== "assign-phase-user" ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                {isSingle ? "Observación" : "Observación conjunta"}
              </p>
              <p className="mt-2 text-slate-700">{comment.trim()}</p>
            </div>
          ) : null}
        </div>
        {isCheckingAnticipos ? (
          <div
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
            role="status"
          >
            <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
            Validando que los cruces de anticipos estén completos...
          </div>
        ) : hasUnavailableAnticipos ? (
          <div
            className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-950"
            role="alert"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
            <div>
              <p className="font-semibold">No pudimos validar los cruces</p>
              <p className="mt-1 text-red-800">
                Vuelve a la factura e inténtalo de nuevo antes de continuar.
              </p>
            </div>
          </div>
        ) : pendingAnticipoPlans.length > 0 ? (
          <div
            className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
            role="alert"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div>
              <p className="font-semibold">Falta completar el cruce de anticipos</p>
              <p className="mt-1 text-amber-800">
                {singlePendingAnticipo
                  ? `Quedan ${formatCurrency(pendingAnticipoTotal, pendingAnticipoCurrency)} disponibles por cruzar. Vuelve, abre el cruce y guárdalo antes de continuar.`
                  : `${pendingAnticipoPlans.length} facturas tienen cruces pendientes. Vuelve y completa cada cruce antes de continuar.`}
              </p>
            </div>
          </div>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel
            disabled={loading}
            onClick={() => {
              if (!singlePendingAnticipo) return;
              setConfirmBatchAction(null);
              void Promise.resolve(onOpenCruce(singlePendingAnticipo.tarea));
            }}
          >
            {singlePendingAnticipo
              ? "Volver y abrir cruce"
              : pendingAnticipoPlans.length > 1
                ? "Volver y corregir cruces"
                : "Volver"}
          </AlertDialogCancel>
          <AlertDialogAction
            className="bg-slate-900 text-white hover:bg-slate-800"
            disabled={loading || !confirmBatchAction || isAnticipoBlocked}
            onClick={(event) => {
              event.preventDefault();
              if (confirmBatchAction && !isAnticipoBlocked) {
                void executeConfirmedAction(confirmBatchAction);
              }
            }}
          >
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {confirmationLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
