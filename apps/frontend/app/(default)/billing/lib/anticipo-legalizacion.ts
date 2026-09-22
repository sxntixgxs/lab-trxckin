import type { Doc } from "@/convex/_generated/dataModel";

import type { BuzonTarea } from "../components/buzon-row";
import type { WorkflowActionKind } from "./workflow-config";

type FacturaAnticipoRef = Pick<
  Doc<"facturacionFacturas">,
  | "esLegalizacionAnticipo"
  | "esLegalizacionCajaMenor"
  | "esPeaje"
  | "rolOperacion"
  | "documentoClase"
  | "tipoDocumento"
  | "tipoDocumentoNormalizado"
>;

export type AnticipoLegalizacionPanelMode = "mark-and-cross" | "cross" | "correct" | "view";

export type AnticipoLegalizacionPanelContext = {
  actionKind?: WorkflowActionKind | null;
};

const FASES_CONTABLES_ANTICIPO = new Set(["causacion", "revision_impuestos", "eventos_dian"]);

export function isFacturaEligibleForAnticipoLegalizacion(
  factura: FacturaAnticipoRef | null | undefined
) {
  if (!factura) return false;
  if (factura.esLegalizacionCajaMenor) return false;
  if (factura.esPeaje || factura.rolOperacion === "PEAJES") return false;
  const tipo = factura.tipoDocumentoNormalizado ?? factura.tipoDocumento;
  if (factura.documentoClase === "nota_credito" || tipo === "91") return false;
  return true;
}

export function getAnticipoLegalizacionPanelMode(
  tarea: BuzonTarea,
  context?: AnticipoLegalizacionPanelContext
): AnticipoLegalizacionPanelMode | null {
  if (!isFacturaEligibleForAnticipoLegalizacion(tarea.factura)) return null;

  const stage = String(tarea.faseAsignacion ?? tarea.estado);
  const isMarked = tarea.factura?.esLegalizacionAnticipo === true;
  const isActiveAssignment =
    tarea.asignacion?.estado === "pendiente" && tarea.asignacion.fase === stage;

  if (FASES_CONTABLES_ANTICIPO.has(stage) && isActiveAssignment) {
    if (!isMarked) return "mark-and-cross";
    if (stage === "revision_impuestos") return "correct";
    return "cross";
  }

  if (stage === "revision_lider" && isActiveAssignment) {
    return "cross";
  }

  if (isMarked) return "view";
  return null;
}

export function shouldShowAnticipoLegalizacionPanel(
  tarea: BuzonTarea,
  context?: AnticipoLegalizacionPanelContext
) {
  return getAnticipoLegalizacionPanelMode(tarea, context) !== null;
}

export function getAnticipoPanelHelperText(stage: string) {
  switch (stage) {
    case "revision_impuestos":
      return "Revisa o corrige el dueño y cruce de anticipos antes de avanzar.";
    case "eventos_dian":
      return "Confirma el dueño y cruza anticipos antes de avanzar.";
    case "causacion":
      return "Selecciona el dueño histórico y cruza anticipos de su bolsa.";
    case "revision_lider":
      return "Revisa y cruza anticipos de tu bolsa antes de enviar a causación.";
    default:
      return "Consulta el dueño y cruce de anticipos asociado a esta factura.";
  }
}

export function getAnticipoPlanSummaryHelperText(stage: string, restantePorCruzar: number) {
  if (restantePorCruzar > 0) {
    if (stage === "revision_impuestos" || stage === "eventos_dian" || stage === "causacion") {
      return "Antes de avanzar, abre el cruce y cubre el saldo pendiente disponible.";
    }
    return "Antes de avanzar a Contador, abre el cruce y cubre el saldo pendiente disponible.";
  }
  return "El cruce guardado cubre el saldo disponible para esta factura.";
}

export type AnticipoCruceSummary = {
  moneda: string;
  valorFactura: number;
  valorAplicado: number;
  pendienteDisponible: number;
  restantePorCruzar: number;
  diferenciaNoCubierta: number;
  valorSolicitado: number;
  valorLegalizado: number;
  legalizacionesCount: number;
};

export function getAnticipoCruceSummary(data: unknown): AnticipoCruceSummary | null {
  if (!data || typeof data !== "object") return null;
  const row = data as {
    factura?: { total?: number; moneda?: string } | null;
    legalizaciones?: unknown[];
    totales?: {
      valorFactura?: number;
      valorAplicadoFactura?: number;
      pendienteDisponible?: number;
      diferenciaNoCubierta?: number;
      valorSolicitado?: number;
      valorLegalizado?: number;
    };
  };
  const valorFactura = row.totales?.valorFactura ?? row.factura?.total ?? 0;
  const valorAplicado = row.totales?.valorAplicadoFactura ?? 0;
  const pendienteDisponible = row.totales?.pendienteDisponible ?? 0;
  const requerido = Math.min(valorFactura, valorAplicado + pendienteDisponible);

  return {
    moneda: row.factura?.moneda ?? "COP",
    valorFactura,
    valorAplicado,
    pendienteDisponible,
    restantePorCruzar: Math.max(0, requerido - valorAplicado),
    diferenciaNoCubierta:
      row.totales?.diferenciaNoCubierta ?? Math.max(0, valorFactura - valorAplicado),
    valorSolicitado: row.totales?.valorSolicitado ?? 0,
    valorLegalizado: row.totales?.valorLegalizado ?? 0,
    legalizacionesCount: row.legalizaciones?.length ?? 0,
  };
}
