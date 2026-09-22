import type { Doc } from "@/convex/_generated/dataModel";

export type EstadoTarea = Doc<"facturacionTareas">["estado"];

export type AdvanceActionDescriptor = {
  /** Etiqueta legible para el botón / tooltip */
  label: string;
  /** Si el avance requiere seleccionar un responsable de destino */
  needsAssignee: boolean;
  /** Pool del que se debe elegir el responsable */
  pool: "lideres" | "finanzas" | "rechazos_dian";
  /** Identificador interno de la mutación a invocar */
  mutation:
    | "asignarLideres"
    | "completarRevisionLider"
    | "completarCausacion"
    | "reenviarAImpuestos"
    | "completarRevisionImpuestos"
    | "aprobarGerencia"
    | "registrarPagoAsignacion"
    | "aceptarFactura"
    | "enviarACausacion"
    | "enviarATesoreria"
    | "registrarPago"
    | "confirmarRechazoDianAsignacion";
};

/**
 * Devuelve la siguiente acción que debe ejecutar el botón verde "aprobar"
 * para una tarea en el estado dado. Si la tarea está cerrada o en un estado
 * sin transición disponible, retorna null.
 */
export function getNextActionForState(
  estado: EstadoTarea,
  faseAsignacion?: string,
  hasContadorPrevio?: boolean,
): AdvanceActionDescriptor | null {
  switch (faseAsignacion) {
    case "recepcion":
      return {
        label: "Asignar líderes",
        needsAssignee: true,
        pool: "lideres",
        mutation: "asignarLideres",
      };
    case "revision_lider":
      return {
        label: "Aprobar revisión",
        needsAssignee: false,
        pool: "finanzas",
        mutation: "completarRevisionLider",
      };
    case "causacion":
      return {
        label: hasContadorPrevio ? "Reenviar a contabilidad" : "Enviar a contabilidad",
        needsAssignee: !hasContadorPrevio,
        pool: "finanzas",
        mutation: hasContadorPrevio ? "reenviarAImpuestos" : "completarCausacion",
      };
    case "revision_impuestos":
      return {
        label: "Aprobar impuestos",
        needsAssignee: false,
        pool: "finanzas",
        mutation: "completarRevisionImpuestos",
      };
    case "gerencia":
      return {
        label: "Aprobar gerencia",
        needsAssignee: false,
        pool: "finanzas",
        mutation: "aprobarGerencia",
      };
    case "revision_tesoreria":
      return {
        label: "Registrar pago",
        needsAssignee: false,
        pool: "finanzas",
        mutation: "registrarPagoAsignacion",
      };
    case "pendiente_rechazar_dian":
      return {
        label: "Confirmar rechazo DIAN",
        needsAssignee: false,
        pool: "rechazos_dian",
        mutation: "confirmarRechazoDianAsignacion",
      };
  }

  switch (estado) {
    case "revision_lider":
      return {
        label: "Aceptar",
        needsAssignee: false,
        pool: "finanzas",
        mutation: "aceptarFactura",
      };
    case "aceptada":
      return {
        label: "Enviar a análisis",
        needsAssignee: false,
        pool: "finanzas",
        mutation: "enviarACausacion",
      };
    case "causacion":
      return {
        label: "Enviar a tesorería",
        needsAssignee: true,
        pool: "finanzas",
        mutation: "enviarATesoreria",
      };
    case "revision_tesoreria":
      return {
        label: "Registrar pago",
        needsAssignee: false,
        pool: "finanzas",
        mutation: "registrarPago",
      };
    default:
      return null;
  }
}

/** El check rojo rechaza desde líder y devuelve desde revisión de impuestos. */
export function canReject(estado: EstadoTarea, faseAsignacion?: string): boolean {
  return (
    faseAsignacion === "revision_lider" ||
    faseAsignacion === "revision_impuestos" ||
    estado === "revision_lider" ||
    estado === "revision_impuestos"
  );
}

/** Determina si la tarea ya cerró su ciclo (no admite acciones inline). */
export function isClosed(estado: EstadoTarea): boolean {
  return (
    estado === "pagada" ||
    estado === "legalizada" ||
    estado === "cerrada" ||
    estado === "rechazada" ||
    estado === "rechazada_dian" ||
    estado === "nota_credito_cerrada"
  );
}
