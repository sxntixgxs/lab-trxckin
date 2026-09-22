import type { BuzonTarea } from "../../../components/buzon-row";
import type { FacturacionUsuario } from "../../../hooks/use-facturacion-users";
import { STAGE_LABELS, type WorkflowAction } from "../../../lib/workflow-config";
import { getActiveStage } from "../../../lib/workflow-config";
import type { BatchPlan } from "./types";
import type { GerenciaPhaseTarget, PhaseAssignmentDraft } from "./types";

export const ASSIGN_PHASE_USER_ACTION: WorkflowAction = {
  kind: "assign-phase-user",
  label: "Asignar fase y usuario",
};

export const GERENCIA_PHASE_TARGETS: Array<{
  stage: GerenciaPhaseTarget;
  label: string;
}> = [
  { stage: "recepcion", label: STAGE_LABELS.recepcion ?? "Recepción" },
  { stage: "revision_lider", label: STAGE_LABELS.revision_lider ?? "Líder" },
  { stage: "causacion", label: STAGE_LABELS.causacion ?? "Causación" },
  { stage: "revision_impuestos", label: STAGE_LABELS.revision_impuestos ?? "Contabilidad" },
  { stage: "eventos_dian", label: STAGE_LABELS.eventos_dian ?? "Eventos DIAN" },
  { stage: "gerencia", label: STAGE_LABELS.gerencia ?? "Gerencia" },
  { stage: "revision_tesoreria", label: STAGE_LABELS.revision_tesoreria ?? "Tesorería" },
];

export type GerenciaPhasePools = {
  recepcionPorEmpresa: Record<number, FacturacionUsuario[]>;
  lideresPorEmpresa: Record<number, FacturacionUsuario[]>;
  analistasCausacionPorEmpresa: Record<number, FacturacionUsuario[]>;
  contadoresPorEmpresa: Record<number, FacturacionUsuario[]>;
  eventosDianPorEmpresa: Record<number, FacturacionUsuario[]>;
  gerenciasPorEmpresa: Record<number, FacturacionUsuario[]>;
  tesoreriaPorEmpresa: Record<number, FacturacionUsuario[]>;
};

export function createEmptyPhaseAssignment(): PhaseAssignmentDraft {
  return { targetStage: "", assigneeId: "" };
}

export function isActorInGerenciaPool(
  actorUserId: string | undefined,
  empresa: number | null,
  gerenciasPorEmpresa: Record<number, FacturacionUsuario[]>,
) {
  const actorId = actorUserId?.trim();
  if (!actorId || empresa === null) return false;
  return (gerenciasPorEmpresa[empresa] ?? []).some((usuario) => usuario.id === actorId);
}

export function getGerenciaPhaseAssignmentActionIfAllowed(args: {
  actorUserId?: string;
  empresa: number | null;
  gerenciasPorEmpresa: Record<number, FacturacionUsuario[]>;
}): WorkflowAction | null {
  if (!isActorInGerenciaPool(args.actorUserId, args.empresa, args.gerenciasPorEmpresa)) {
    return null;
  }
  return ASSIGN_PHASE_USER_ACTION;
}

export function getUsersForGerenciaTargetStage(
  targetStage: GerenciaPhaseTarget | "",
  empresa: number | null,
  pools: GerenciaPhasePools,
): FacturacionUsuario[] {
  if (!targetStage || empresa === null) return [];

  switch (targetStage) {
    case "recepcion":
      return pools.recepcionPorEmpresa[empresa] ?? [];
    case "revision_lider":
      return pools.lideresPorEmpresa[empresa] ?? [];
    case "causacion":
      return pools.analistasCausacionPorEmpresa[empresa] ?? [];
    case "revision_impuestos":
      return pools.contadoresPorEmpresa[empresa] ?? [];
    case "eventos_dian":
      return pools.eventosDianPorEmpresa[empresa] ?? [];
    case "gerencia":
      return pools.gerenciasPorEmpresa[empresa] ?? [];
    case "revision_tesoreria":
      return pools.tesoreriaPorEmpresa[empresa] ?? [];
    default:
      return [];
  }
}

export function getCurrentAssignmentUserId(tarea: BuzonTarea) {
  return (
    tarea.asignacion?.asignadoAUserId?.trim() ??
    tarea.asignadoAUserId?.trim() ??
    ""
  );
}

export function wouldProduceSamePhaseAndUser(
  tarea: BuzonTarea,
  targetStage: GerenciaPhaseTarget,
  assigneeId: string,
) {
  const currentStage = String(getActiveStage(tarea));
  const currentUserId = getCurrentAssignmentUserId(tarea);
  return currentStage === targetStage && currentUserId === assigneeId.trim();
}

export function validatePhaseAssignmentPlan(
  plan: BatchPlan,
  context: GerenciaPhasePools & {
    usuariosById: Map<string, FacturacionUsuario>;
  },
) {
  const facturaLabel = plan.tarea.factura?.numeroFactura
    ? `Factura ${plan.tarea.factura.numeroFactura}`
    : "Una factura";

  if (plan.action.kind !== "assign-phase-user") return null;

  const empresa = plan.tarea.empresa ?? plan.tarea.factura?.empresa ?? 1;
  const phaseAssignment = plan.phaseAssignment;
  if (!phaseAssignment?.targetStage) {
    return `${facturaLabel}: selecciona la fase destino.`;
  }
  if (!phaseAssignment.assigneeId.trim()) {
    return `${facturaLabel}: selecciona el usuario responsable.`;
  }
  if (!plan.observation.trim()) {
    return `${facturaLabel}: escribe una observación para dejar trazabilidad.`;
  }

  const pool = getUsersForGerenciaTargetStage(
    phaseAssignment.targetStage,
    empresa,
    context,
  );
  if (pool.length === 0) {
    return `${facturaLabel}: la fase seleccionada no tiene usuarios configurados.`;
  }

  const selected = pool.find((usuario) => usuario.id === phaseAssignment.assigneeId.trim());
  if (!selected) {
    return `${facturaLabel}: selecciona un responsable disponible para esta fase.`;
  }

  if (
    wouldProduceSamePhaseAndUser(
      plan.tarea,
      phaseAssignment.targetStage,
      phaseAssignment.assigneeId,
    )
  ) {
    return `${facturaLabel}: ya está en esa fase con el mismo responsable.`;
  }

  return null;
}

export function getPhaseAssignmentSummaryLabel(
  tarea: BuzonTarea,
  phaseAssignment: NonNullable<BatchPlan["phaseAssignment"]>,
  usuariosById: Map<string, FacturacionUsuario>,
) {
  const currentStage = String(getActiveStage(tarea));
  const currentLabel = STAGE_LABELS[currentStage] ?? currentStage;
  const targetLabel =
    STAGE_LABELS[phaseAssignment.targetStage] ?? phaseAssignment.targetStage;
  const assignee =
    usuariosById.get(phaseAssignment.assigneeId)?.nombre ??
    phaseAssignment.assigneeId;
  return `${currentLabel} → ${targetLabel} · ${assignee}`;
}
