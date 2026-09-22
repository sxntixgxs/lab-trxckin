import type { Doc } from "@/convex/_generated/dataModel";
import {
  getPagosAplicadosFromAprobaciones,
  tienePagosMonetarios,
} from "@/convex/lib/valorAPagar";

import type { BuzonTarea } from "../components/buzon-row";
import { tesoreriaSaldoEsCero } from "./valor-a-pagar";
import type { WorkflowAction } from "./workflow-config";

export type TesoreriaOutcome = "sin-desembolso" | "confirm-paid";

export type TesoreriaResumen = {
  saldoCero: boolean;
  pagosAplicados: number;
  tienePagosMonetarios: boolean;
  elegibleSinDesembolso: boolean;
};

export const CONFIRM_NO_DISBURSEMENT_ACTION: WorkflowAction = {
  kind: "confirm-no-disbursement",
  label: "Confirmar sin desembolso",
  targetStage: "revision_tesoreria",
};

export const CONFIRM_PAID_TESORERIA_ACTION: WorkflowAction = {
  kind: "confirm-paid",
  label: "Confirmar factura pagada",
  targetStage: "revision_tesoreria",
};

export function getPagosMonetariosAplicados(
  aprobaciones?: Array<
    Pick<Doc<"facturacionAprobaciones">, "accion" | "pagoParcial" | "pagoFinal">
  >,
) {
  return getPagosAplicadosFromAprobaciones(aprobaciones ?? []);
}

export function getTesoreriaResumen(
  factura: Pick<
    Doc<"facturacionFacturas">,
    "esLegalizacionAnticipo" | "valorAPagar" | "valorContable" | "total"
  > | null | undefined,
  pagosAplicados = 0,
): TesoreriaResumen {
  const saldoCero = factura ? tesoreriaSaldoEsCero(factura) : false;
  const tienePagos = tienePagosMonetarios(pagosAplicados);
  const elegibleSinDesembolso =
    Boolean(factura?.esLegalizacionAnticipo) &&
    factura?.valorAPagar !== undefined &&
    saldoCero &&
    !tienePagos;

  return {
    saldoCero,
    pagosAplicados,
    tienePagosMonetarios: tienePagos,
    elegibleSinDesembolso,
  };
}

export function classifyTesoreriaOutcome(
  factura: Pick<
    Doc<"facturacionFacturas">,
    "esLegalizacionAnticipo" | "valorAPagar" | "valorContable" | "total"
  > | null | undefined,
  pagosAplicados = 0,
): TesoreriaOutcome | null {
  if (!factura) return null;
  if (getTesoreriaResumen(factura, pagosAplicados).elegibleSinDesembolso) {
    return "sin-desembolso";
  }
  return "confirm-paid";
}

export function getTesoreriaPrimaryAction(
  factura: Pick<
    Doc<"facturacionFacturas">,
    "esLegalizacionAnticipo" | "valorAPagar" | "valorContable" | "total"
  > | null | undefined,
  pagosAplicados = 0,
): WorkflowAction | null {
  const outcome = classifyTesoreriaOutcome(factura, pagosAplicados);
  if (!outcome) return null;
  return outcome === "sin-desembolso"
    ? CONFIRM_NO_DISBURSEMENT_ACTION
    : CONFIRM_PAID_TESORERIA_ACTION;
}

export function shouldHidePagoParcialTesoreria(
  factura: Pick<
    Doc<"facturacionFacturas">,
    "esLegalizacionAnticipo" | "valorAPagar" | "valorContable" | "total"
  > | null | undefined,
) {
  return factura ? tesoreriaSaldoEsCero(factura) : false;
}

export function isConfirmarSinDesembolsoAction(action: WorkflowAction | null) {
  return action?.kind === "confirm-no-disbursement";
}

export function explainTesoreriaBatchJointConflict(
  tareas: BuzonTarea[],
  pagosByFacturaId: Record<string, number> = {},
): string | null {
  if (tareas.length === 0) return null;

  const outcomes = tareas.map((tarea) =>
    classifyTesoreriaOutcome(
      tarea.factura,
      pagosByFacturaId[String(tarea.facturaId)] ?? 0,
    ),
  );

  if (outcomes.some((outcome) => outcome === null)) {
    return "Hay facturas sin datos suficientes para confirmar en lote.";
  }

  const unique = new Set(outcomes);
  if (unique.size <= 1) return null;

  return "El lote mezcla facturas con saldo cero cubiertas por anticipos y otras que requieren pago. Usa modo Individual.";
}
