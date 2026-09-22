import type { BuzonTarea } from "../../../components/buzon-row";
import type { FacturacionUsuario } from "../../../hooks/use-facturacion-users";
import { getValorContable, getValorContableNuevoParaAccion } from "../../../lib/valor-contable";
import {
  getTesoreriaPrimaryAction,
  shouldHidePagoParcialTesoreria,
} from "../../../lib/tesoreria-action-utils";
import { getMaxMontoPagoParcial } from "./pago-parcial-utils";
import {
  getActiveStage,
  getAccountingPhaseActions,
  getAccountingSkipAction,
  getPrimaryAction,
  getSecondaryActions,
  isDuplicateGerenciaAction,
  isLegalizeFromAccountingSkip,
  isTerminalFacturacionStage,
  workflowUsersMatchById,
  type WorkflowAction,
} from "../../../lib/workflow-config";
import { getSelectedAssignee } from "../shared";
import type { BatchPlan } from "./types";
import { isDistribucionValid } from "@/lib/cajas-menores/centros-costo-distribucion";
import {
  validatePhaseAssignmentPlan,
} from "./assign-phase-user-utils";

type AccountingSkipContext = {
  contadoresPorEmpresa?: Record<number, FacturacionUsuario[]>;
  eventosDianPorEmpresa?: Record<number, FacturacionUsuario[]>;
  gerenciasPorEmpresa?: Record<number, FacturacionUsuario[]>;
  cruceCoverageByFacturaId?: Record<
    string,
    { cubiertaTotal?: boolean; valorAplicado?: number }
  >;
  pagosByFacturaId?: Record<string, number>;
};

export type { AccountingSkipContext };

function getAnticipoCubiertoTotalForTask(
  tarea: BuzonTarea,
  context: AccountingSkipContext,
) {
  const summary = context.cruceCoverageByFacturaId?.[String(tarea.facturaId)];
  return summary?.cubiertaTotal === true;
}

function isNotaCreditoTarea(tarea: BuzonTarea) {
  const factura = tarea.factura;
  if (!factura) return false;
  if (factura.esPeaje || factura.rolOperacion === "PEAJES") return false;
  const tipo = factura.tipoDocumentoNormalizado ?? factura.tipoDocumento;
  return factura.documentoClase === "nota_credito" || tipo === "91";
}

function getEmpresaTarea(tarea: BuzonTarea) {
  return tarea.empresa ?? tarea.factura?.empresa ?? 1;
}

function getCurrentAssignmentUserId(tarea: BuzonTarea) {
  return (
    tarea.asignacion?.asignadoAUserId?.trim() ??
    tarea.asignadoAUserId?.trim() ??
    ""
  );
}

function getCurrentAssignmentUser(tarea: BuzonTarea) {
  const usuarioId = getCurrentAssignmentUserId(tarea);
  return {
    id: usuarioId,
    usuarioId,
    email: tarea.asignacion?.asignadoAEmail ?? tarea.asignadoAEmail,
  };
}

export { isLegalizeFromAccountingSkip };

export function getSkipResultadoEsperado(action: WorkflowAction) {
  if (isLegalizeFromAccountingSkip(action)) return "legalizada" as const;
  if (action.kind === "skip-accounting-chain") {
    if (action.targetStage === "eventos_dian") return "eventos_dian" as const;
    if (action.targetStage === "gerencia") return "gerencia" as const;
  }
  return undefined;
}

function getAccountingActionsForTask(
  tarea: BuzonTarea,
  context: AccountingSkipContext = {},
) {
  const empresa = getEmpresaTarea(tarea);
  const stage = String(getActiveStage(tarea));
  return getAccountingPhaseActions(stage, {
    currentUser: getCurrentAssignmentUser(tarea),
    contadores: context.contadoresPorEmpresa?.[empresa] ?? [],
    eventosDian: context.eventosDianPorEmpresa?.[empresa] ?? [],
    isCajaMenor: Boolean(tarea.factura?.esLegalizacionCajaMenor),
    isNotaCredito: isNotaCreditoTarea(tarea),
    isAnticipo: Boolean(tarea.factura?.esLegalizacionAnticipo),
    anticipoCubiertoTotal: getAnticipoCubiertoTotalForTask(tarea, context),
    hasPreviousContador: Boolean(tarea.contadorAsignadoAEmail),
  });
}

function isSkipEligibleForTask(
  tarea: BuzonTarea,
  context: AccountingSkipContext = {},
) {
  return getAccountingActionsForTask(tarea, context).some(
    (action) =>
      action.kind === "skip-accounting-chain" ||
      isLegalizeFromAccountingSkip(action),
  );
}

export function getGerenciaPeersForTask(
  tarea: BuzonTarea,
  gerenciasPorEmpresa: Record<number, FacturacionUsuario[]>,
) {
  const empresa = getEmpresaTarea(tarea);
  const gerencias = gerenciasPorEmpresa[empresa] ?? [];
  const currentUserId = getCurrentAssignmentUserId(tarea);
  return gerencias.filter(
    (usuario) =>
      !currentUserId ||
      !workflowUsersMatchById({ usuarioId: currentUserId }, { id: usuario.id }),
  );
}

function shouldHideGerenciaHorizontalAction(
  tarea: BuzonTarea,
  action: WorkflowAction,
  context: AccountingSkipContext,
) {
  if (
    action.kind !== "assign-horizontal-par" ||
    action.needsAssignee !== "gerencia"
  ) {
    return false;
  }
  const gerenciasPorEmpresa = context.gerenciasPorEmpresa ?? {};
  return getGerenciaPeersForTask(tarea, gerenciasPorEmpresa).length === 0;
}

export function getAvailableActionsForTask(
  tarea: BuzonTarea,
  context: AccountingSkipContext = {},
) {
  const stage = String(getActiveStage(tarea));
  const isAnticipo = Boolean(tarea.factura?.esLegalizacionAnticipo);
  const isCajaMenor = Boolean(tarea.factura?.esLegalizacionCajaMenor);
  const isNotaCredito = isNotaCreditoTarea(tarea);
  const skipEligible = isSkipEligibleForTask(tarea, context);
  const accountingActions = getAccountingActionsForTask(tarea, context);
  const primary =
    stage === "revision_tesoreria"
      ? getTesoreriaPrimaryAction(
          tarea.factura,
          context.pagosByFacturaId?.[String(tarea.facturaId)] ?? 0,
        )
      : (accountingActions[0] ?? getPrimaryAction(stage, {
          hasPreviousContador: Boolean(tarea.contadorAsignadoAEmail),
        }));
  const secondaryFromAccounting = accountingActions.slice(1);
  const secondary = getSecondaryActions(stage).filter((action) => {
    if (isDuplicateGerenciaAction(action, skipEligible)) return false;
    return true;
  });

  return [primary, ...secondaryFromAccounting, ...secondary].filter((action): action is WorkflowAction => {
    if (!action) return false;
    if (action.kind === "close-nc" && !isNotaCredito) {
      return false;
    }
    if (isNotaCredito) {
      if (
        action.kind === "mark-anticipo" ||
        action.kind === "mark-caja-menor" ||
        action.kind === "legalize" ||
        action.kind === "legalize-caja-menor" ||
        action.kind === "partial-payment" ||
        action.kind === "confirm-paid" ||
        action.kind === "confirm-no-disbursement"
      ) {
        return false;
      }
      if (
        stage === "revision_tesoreria" &&
        action.kind !== "close-nc" &&
        action.kind !== "backward" &&
        action.kind !== "reject-dian"
      ) {
        return false;
      }
      if (
        stage === "gerencia" &&
        action.kind === "forward" &&
        action.targetStage === "revision_tesoreria"
      ) {
        return true;
      }
      if (
        stage !== "gerencia" &&
        stage !== "revision_tesoreria" &&
        action.kind === "forward" &&
        (action.targetStage === "gerencia" ||
          action.targetStage === "revision_tesoreria")
      ) {
        return false;
      }
    }
    if (action.kind === "mark-anticipo" && isCajaMenor) {
      return false;
    }
    if (action.kind === "mark-caja-menor" && (isAnticipo || isCajaMenor)) {
      return false;
    }
    if (action.kind === "legalize-caja-menor" && !isCajaMenor) {
      return false;
    }
    if (action.kind === "legalize" && isCajaMenor) {
      return false;
    }
    if (shouldHideGerenciaHorizontalAction(tarea, action, context)) {
      return false;
    }
    if (
      stage === "revision_tesoreria" &&
      action.kind === "partial-payment" &&
      shouldHidePagoParcialTesoreria(tarea.factura)
    ) {
      return false;
    }
    if (
      isCajaMenor &&
      action.kind === "forward" &&
      (action.targetStage === "gerencia" || action.targetStage === "eventos_dian")
    ) {
      return false;
    }
    return action.kind !== "cross-anticipo";
  });
}

export function getPrimaryActionForTask(
  tarea: BuzonTarea,
  context: AccountingSkipContext = {},
): WorkflowAction | null {
  const stage = String(getActiveStage(tarea));
  if (stage === "revision_tesoreria") {
    if (isNotaCreditoTarea(tarea)) {
      return {
        kind: "close-nc" as const,
        label: "Completar proceso y cerrar NC",
      };
    }
    return getTesoreriaPrimaryAction(
      tarea.factura,
      context.pagosByFacturaId?.[String(tarea.facturaId)] ?? 0,
    );
  }
  const accountingActions = getAccountingActionsForTask(tarea, context);
  return (
    accountingActions[0] ??
    getPrimaryAction(stage, {
      hasPreviousContador: Boolean(tarea.contadorAsignadoAEmail),
    })
  );
}

export function getWorkflowActionKey(action: WorkflowAction) {
  return `${action.kind}:${action.label}:${action.targetStage ?? ""}:${action.needsAssignee ?? ""}:${action.skippedStages?.join(",") ?? ""}`;
}

export function isActionAvailableForTask(
  tarea: BuzonTarea,
  action: WorkflowAction,
  context: AccountingSkipContext = {},
) {
  return getAvailableActionsForTask(tarea, context).some((item) =>
    workflowActionsMatch(item, action),
  );
}

export function getSelectedAssigneeForTask(
  action: WorkflowAction | null,
  selectedIds: string[],
  tarea: BuzonTarea,
  pools: {
    lideres: FacturacionUsuario[];
    lideresPorEmpresa?: Record<number, FacturacionUsuario[]>;
    contadoresPorEmpresa: Record<number, FacturacionUsuario[]>;
    eventosDianPorEmpresa: Record<number, FacturacionUsuario[]>;
    analistasCausacionPorEmpresa: Record<number, FacturacionUsuario[]>;
    rechazosDianPorEmpresa?: Record<number, FacturacionUsuario[]>;
    gerenciasPorEmpresa?: Record<number, FacturacionUsuario[]>;
    usuarios: FacturacionUsuario[];
  },
) {
  const empresa = tarea.empresa ?? tarea.factura?.empresa ?? 1;
  return getSelectedAssignee(action, selectedIds, {
    lideres: pools.lideresPorEmpresa
      ? (pools.lideresPorEmpresa[empresa] ?? [])
      : pools.lideres,
    contadores: pools.contadoresPorEmpresa[empresa] ?? [],
    analistasCausacion: pools.analistasCausacionPorEmpresa[empresa] ?? [],
    eventosDian: pools.eventosDianPorEmpresa[empresa] ?? [],
    rechazosDian: pools.rechazosDianPorEmpresa?.[empresa] ?? [],
    gerencias: pools.gerenciasPorEmpresa?.[empresa] ?? [],
    usuarios: pools.usuarios,
  });
}

export function getValorContablePayloadForPlan(plan: BatchPlan) {
  if (!plan.tarea.factura) return undefined;
  return getValorContableNuevoParaAccion({
    factura: plan.tarea.factura,
    fase: String(getActiveStage(plan.tarea)),
    draft: plan.valorContable,
  });
}

export function validatePlan(
  plan: BatchPlan,
  context: {
    lideres: FacturacionUsuario[];
    lideresPorEmpresa?: Record<number, FacturacionUsuario[]>;
    contadoresPorEmpresa: Record<number, FacturacionUsuario[]>;
    eventosDianPorEmpresa: Record<number, FacturacionUsuario[]>;
    analistasCausacionPorEmpresa: Record<number, FacturacionUsuario[]>;
    rechazosDianPorEmpresa?: Record<number, FacturacionUsuario[]>;
    gerenciasPorEmpresa?: Record<number, FacturacionUsuario[]>;
    tesoreriaPorEmpresa?: Record<number, FacturacionUsuario[]>;
    recepcionPorEmpresa?: Record<number, FacturacionUsuario[]>;
    usuarios: FacturacionUsuario[];
    usuariosById: Map<string, FacturacionUsuario>;
    totalPagadoParcial?: number;
  } & AccountingSkipContext,
) {
  const facturaLabel = plan.tarea.factura?.numeroFactura
    ? `Factura ${plan.tarea.factura.numeroFactura}`
    : "Una factura";
  if (plan.action.kind === "assign-phase-user") {
    return validatePhaseAssignmentPlan(plan, {
      recepcionPorEmpresa: context.recepcionPorEmpresa ?? {},
      lideresPorEmpresa: context.lideresPorEmpresa ?? {},
      analistasCausacionPorEmpresa: context.analistasCausacionPorEmpresa,
      contadoresPorEmpresa: context.contadoresPorEmpresa,
      eventosDianPorEmpresa: context.eventosDianPorEmpresa,
      gerenciasPorEmpresa: context.gerenciasPorEmpresa ?? {},
      tesoreriaPorEmpresa: context.tesoreriaPorEmpresa ?? {},
      usuariosById: context.usuariosById,
    });
  }
  if (isTerminalFacturacionStage(String(getActiveStage(plan.tarea)))) {
    return `${facturaLabel} ya está cerrada.`;
  }
  if (!isActionAvailableForTask(plan.tarea, plan.action, context)) {
    return `${facturaLabel} no permite la acción "${plan.action.label}" desde su fase actual.`;
  }
  if (!plan.observation.trim()) {
    return `${facturaLabel}: escribe una observación para dejar trazabilidad.`;
  }
  try {
    const valorContableNuevo = getValorContablePayloadForPlan(plan);
    if (
      valorContableNuevo !== undefined &&
      plan.tarea.factura &&
      valorContableNuevo !== getValorContable(plan.tarea.factura) &&
      !plan.observation.trim()
    ) {
      return `${facturaLabel}: agrega una observación al cambiar el valor contable.`;
    }
  } catch (error) {
    return `${facturaLabel}: valor contable inválido.`;
  }
  if (plan.action.kind === "partial-payment") {
    const draft = plan.pagoParcial;
    if (!draft?.storageId || !draft.nombre?.trim()) {
      return `${facturaLabel}: adjunta el comprobante del pago parcial.`;
    }
    if (!draft.monto || draft.monto <= 0) {
      return `${facturaLabel}: ingresa un monto mayor a cero.`;
    }
    if (plan.tarea.factura) {
      const maxMonto = getMaxMontoPagoParcial(
        plan.tarea.factura,
        context.totalPagadoParcial ?? 0,
      );
      if (maxMonto <= 0) {
        return `${facturaLabel}: no queda saldo pendiente para otro pago parcial.`;
      }
      if (draft.monto > maxMonto) {
        return `${facturaLabel}: el monto no puede superar el saldo pendiente (${maxMonto}).`;
      }
    }
  }
  if (plan.action.kind === "mark-caja-menor" && !plan.selectedIds[0]) {
    return `${facturaLabel}: selecciona una Caja Menor.`;
  }
  if (plan.action.kind === "mark-caja-menor") {
    const movimiento = plan.cajaMenor;
    if (
      !movimiento?.centrosCostoDistribucion?.length ||
      !isDistribucionValid(plan.tarea.factura?.total ?? 0, movimiento.centrosCostoDistribucion)
    ) {
      return `${facturaLabel}: completa la distribución de centros de costo.`;
    }
    if (!movimiento.fechaPago) {
      return `${facturaLabel}: ingresa la fecha de pago.`;
    }
    if (!movimiento.concepto.trim()) {
      return `${facturaLabel}: ingresa el concepto.`;
    }
  }
  const assigneeSelectedIds =
    plan.action.kind === "mark-caja-menor"
      ? plan.selectedIds.slice(1)
      : plan.selectedIds;
  if (
    (plan.action.needsAssignee === "lideres" ||
      plan.action.kind === "assign-horizontal-lider") &&
    plan.selectedIds.length === 0
  ) {
    return `${facturaLabel}: selecciona al menos un líder.`;
  }
  if (
    (plan.action.needsAssignee === "lideres" ||
      plan.action.kind === "assign-horizontal-lider") &&
    plan.selectedIds.length > 0
  ) {
    const empresa = plan.tarea.empresa ?? plan.tarea.factura?.empresa ?? 1;
    const lideresDisponibles = context.lideresPorEmpresa
      ? (context.lideresPorEmpresa[empresa] ?? [])
      : context.lideres;
    const todosDisponibles = plan.selectedIds.every((id) =>
      lideresDisponibles.some((usuario) => usuario.id === id),
    );
    if (!todosDisponibles) {
      return `${facturaLabel}: selecciona un líder disponible para esta empresa.`;
    }
  }
  if (plan.action.needsAssignee === "jefe_directo") {
    const auto = getJefeDirectoAutoForTask(plan.tarea, context.usuariosById);
    const selected = getSelectedAssigneeForTask(
      plan.action,
      assigneeSelectedIds,
      plan.tarea,
      context,
    );
    if (!auto && !selected) {
      return `${facturaLabel}: selecciona el jefe directo.`;
    }
  }
  if (
    plan.action.needsAssignee &&
    plan.action.needsAssignee !== "lideres" &&
    plan.action.needsAssignee !== "jefe_directo"
  ) {
    const selected = getSelectedAssigneeForTask(
      plan.action,
      assigneeSelectedIds,
      plan.tarea,
      context,
    );
    if (!selected) return `${facturaLabel}: selecciona el responsable.`;
  }
  return null;
}

export function groupBatchPlans(plans: BatchPlan[]) {
  const groups = new Map<
    string,
    { key: string; action: WorkflowAction; plans: BatchPlan[] }
  >();
  for (const plan of plans) {
    const key = getWorkflowActionKey(plan.action);
    const group = groups.get(key);
    if (group) {
      group.plans.push(plan);
    } else {
      groups.set(key, { key, action: plan.action, plans: [plan] });
    }
  }
  return Array.from(groups.values());
}

export function getCommonStage(tareas: BuzonTarea[]) {
  if (tareas.length === 0) return null;
  const first = String(getActiveStage(tareas[0]));
  return tareas.every((tarea) => String(getActiveStage(tarea)) === first)
    ? first
    : null;
}

export function getCommonEmpresa(tareas: BuzonTarea[]) {
  if (tareas.length === 0) return null;
  const first = tareas[0].empresa ?? tareas[0].factura?.empresa ?? 1;
  return tareas.every((tarea) => (tarea.empresa ?? tarea.factura?.empresa ?? 1) === first)
    ? first
    : null;
}

export function getFacturaShortLabel(tarea: BuzonTarea) {
  const numero = tarea.factura?.numeroFactura
    ? `#${tarea.factura.numeroFactura}`
    : "Factura";
  const proveedor = tarea.factura?.proveedorNombre ?? tarea.asignadoANombre;
  return `${numero} · ${proveedor}`;
}

export function getBatchPrimaryAction(
  tareas: BuzonTarea[],
  context: AccountingSkipContext = {},
): WorkflowAction | null {
  const actions = tareas.map((tarea) => getPrimaryActionForTask(tarea, context));
  const first = actions[0];
  if (!first || actions.some((action) => !workflowActionsMatch(first, action))) {
    return null;
  }
  return first;
}

export function workflowActionsMatch(
  left: WorkflowAction | null,
  right: WorkflowAction | null,
) {
  return (
    left?.kind === right?.kind &&
    left?.label === right?.label &&
    left?.targetStage === right?.targetStage &&
    left?.needsAssignee === right?.needsAssignee &&
    (left?.skippedStages?.join(",") ?? "") ===
      (right?.skippedStages?.join(",") ?? "")
  );
}

export function getJefeDirectoAutoForTask(
  tarea: BuzonTarea,
  usuariosById: Map<string, FacturacionUsuario>,
) {
  const currentLeader = tarea.asignacion?.asignadoAUserId
    ? usuariosById.get(tarea.asignacion.asignadoAUserId)
    : tarea.liderProcesoUserId
      ? usuariosById.get(tarea.liderProcesoUserId)
      : null;
  return currentLeader?.id_jefe_directo
    ? usuariosById.get(currentLeader.id_jefe_directo) ?? null
    : null;
}
