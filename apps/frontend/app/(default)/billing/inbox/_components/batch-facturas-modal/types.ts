import type { Id } from "@/convex/_generated/dataModel";
import type { BuzonTarea } from "../../../components/buzon-row";
import type { WorkflowAction } from "../../../lib/workflow-config";

export type BatchMode = "joint" | "individual";

export type GerenciaPhaseTarget =
  | "recepcion"
  | "revision_lider"
  | "causacion"
  | "revision_impuestos"
  | "eventos_dian"
  | "gerencia"
  | "revision_tesoreria";

export type PhaseAssignmentDraft = {
  targetStage: GerenciaPhaseTarget | "";
  assigneeId: string;
};

export type PagoParcialDraft = {
  monto: number | null;
  storageId?: Id<"_storage">;
  nombre?: string;
  mimeType?: string;
  size?: number;
};

/**
 * Per-invoice accounting decision. It travels with the phase action so the
 * backend can record it in the same approval event rather than as a second
 * standalone action.
 */
export type CausacionActionDraft = {
  causado: boolean;
  numeroFp: string;
  expectedVersion?: number;
};

export type BatchActionDraft = {
  action: WorkflowAction;
  observation: string;
  selectedIds: string[];
  phaseAssignment?: {
    targetStage: GerenciaPhaseTarget;
    assigneeId: string;
  };
  cajaMenor?: CajaMenorMovementDraft;
  cajaMenorNombre?: string;
  valorContable?: number;
  pagoParcial?: PagoParcialDraft;
  causacion?: CausacionActionDraft;
};

import type { CentroCostoDistribucionRow } from "@/lib/cajas-menores/centros-costo-distribucion";

export type CajaMenorMovementDraft = {
  centroCostoCodigo: string;
  centroCostoNombre: string;
  centrosCostoDistribucion: CentroCostoDistribucionRow[];
  fechaPago: string;
  concepto: string;
  observaciones: string;
};

export type BatchPlan = BatchActionDraft & {
  tarea: BuzonTarea;
  source: "joint" | "individual";
};
