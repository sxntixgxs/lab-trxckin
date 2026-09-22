export type CausacionEstado = "sin_registro" | "causado" | "no_causado";

export type CausacionMotivoSoloLectura =
  | "fase_no_habilitada"
  | "no_asignado"
  | "sin_workflow"
  | "peajes_solo_consulta";

export type CausacionContextoTipo = "flujo_factura" | "reembolso_caja_menor";

const FASES_FLUJO_EDITABLES = new Set(["causacion", "revision_impuestos", "eventos_dian"]);

const FASES_REEMBOLSO_EDITABLES = new Set([
  "pendiente_revision",
  "pendiente_revision_impuestos",
  "pendiente_eventos_dian",
]);

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

export function deriveCausacionEstado(causado?: boolean): CausacionEstado {
  if (causado === undefined) return "sin_registro";
  return causado ? "causado" : "no_causado";
}

export function getCausacionVersion(factura: { causacionVersion?: number }): number {
  return factura.causacionVersion ?? 0;
}

export function normalizeNumeroFp(raw: string | undefined | null): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function validateNumeroFp(raw: string | undefined | null): string {
  const normalized = normalizeNumeroFp(raw);
  if (!normalized) {
    throw new Error("El número FP es obligatorio cuando la factura está causada.");
  }
  if (normalized.length > 64) {
    throw new Error("El número FP no puede superar 64 caracteres.");
  }
  if (CONTROL_CHARS.test(normalized)) {
    throw new Error("El número FP contiene caracteres no permitidos.");
  }
  return normalized;
}

export function validateMotivoCambio(
  raw: string | undefined | null,
  required: boolean
): string | null {
  if (!required) return null;
  const trimmed = (raw ?? "").trim();
  if (trimmed.length < 1) {
    throw new Error("Indica el motivo del cambio.");
  }
  if (trimmed.length > 500) {
    throw new Error("El motivo no puede superar 500 caracteres.");
  }
  return trimmed;
}

export type CausacionTransitionInput = {
  causadoAnterior: boolean | null;
  numeroFpAnterior: string | null;
  causadoNuevo: boolean;
  numeroFpNuevo?: string | null;
  motivoCambio?: string | null;
  /**
   * Legacy direct-edit callers still require a reason. Workflow decisions
   * use the phase observation as their audit context and intentionally omit it.
   */
  requireMotivoCambio?: boolean;
};

export type CausacionTransitionResult = {
  causadoNuevo: boolean;
  numeroFpNuevo: string | null;
  motivoCambio: string | null;
  comentario: string;
  isNoOp: boolean;
};

export function resolveCausacionTransition(
  input: CausacionTransitionInput
): CausacionTransitionResult {
  const { causadoAnterior, numeroFpAnterior, causadoNuevo } = input;

  if (causadoNuevo === false && normalizeNumeroFp(input.numeroFpNuevo ?? undefined)) {
    throw new Error("No se puede registrar un número FP cuando la factura no está causada.");
  }

  if (causadoNuevo === true) {
    const numeroFpNuevo = validateNumeroFp(input.numeroFpNuevo);
    const motivoCambio = validateMotivoCambio(
      input.motivoCambio,
      input.requireMotivoCambio !== false &&
        causadoAnterior === true &&
        numeroFpAnterior !== numeroFpNuevo
    );

    if (causadoAnterior === true && numeroFpAnterior === numeroFpNuevo) {
      return {
        causadoNuevo: true,
        numeroFpNuevo,
        motivoCambio,
        comentario: "Sin cambios en causación.",
        isNoOp: true,
      };
    }

    const comentario =
      causadoAnterior === true && numeroFpAnterior !== numeroFpNuevo
        ? `Actualizó número FP de "${numeroFpAnterior ?? ""}" a "${numeroFpNuevo}".`
        : causadoAnterior === false
          ? "Marcó la factura como causada."
          : "Registró la factura como causada.";

    return {
      causadoNuevo: true,
      numeroFpNuevo,
      motivoCambio,
      comentario,
      isNoOp: false,
    };
  }

  if (causadoAnterior === false) {
    return {
      causadoNuevo: false,
      numeroFpNuevo: null,
      motivoCambio: null,
      comentario: "Sin cambios en causación.",
      isNoOp: true,
    };
  }

  const motivoCambio = validateMotivoCambio(
    input.motivoCambio,
    input.requireMotivoCambio !== false
  );

  const comentario =
    causadoAnterior === true
      ? `Marcó la factura como no causada (FP anterior: ${numeroFpAnterior ?? "—"}).`
      : "Registró la factura como no causada.";

  return {
    causadoNuevo: false,
    numeroFpNuevo: null,
    motivoCambio,
    comentario,
    isNoOp: false,
  };
}

export function puedeEditarCausacionFlujo(args: {
  esPeaje: boolean;
  tieneTarea: boolean;
  faseActual: string | null;
  asignadoAUserId: string | null | undefined;
  actorUserId: string;
}): { puedeEditar: boolean; motivoSoloLectura: CausacionMotivoSoloLectura | null } {
  if (args.esPeaje) {
    return { puedeEditar: false, motivoSoloLectura: "peajes_solo_consulta" };
  }
  if (!args.tieneTarea || !args.faseActual) {
    return { puedeEditar: false, motivoSoloLectura: "sin_workflow" };
  }
  if (!FASES_FLUJO_EDITABLES.has(args.faseActual)) {
    return { puedeEditar: false, motivoSoloLectura: "fase_no_habilitada" };
  }
  if (!args.asignadoAUserId || args.asignadoAUserId !== args.actorUserId) {
    return { puedeEditar: false, motivoSoloLectura: "no_asignado" };
  }
  return { puedeEditar: true, motivoSoloLectura: null };
}

export function puedeEditarCausacionReembolso(args: {
  estadoReembolso: string;
  responsableActualUserId: string | null | undefined;
  actorUserId: string;
  reviewAssignedUserId?: string | null;
  contadorAsignadoUserId?: string | null;
  eventosDianAsignadoUserId?: string | null;
}): {
  puedeEditar: boolean;
  motivoSoloLectura: CausacionMotivoSoloLectura | null;
  faseOperativa: string | null;
} {
  if (!FASES_REEMBOLSO_EDITABLES.has(args.estadoReembolso)) {
    return {
      puedeEditar: false,
      motivoSoloLectura: "fase_no_habilitada",
      faseOperativa: args.estadoReembolso,
    };
  }

  if (args.responsableActualUserId !== args.actorUserId) {
    return {
      puedeEditar: false,
      motivoSoloLectura: "no_asignado",
      faseOperativa: args.estadoReembolso,
    };
  }

  const faseUserId =
    args.estadoReembolso === "pendiente_revision"
      ? args.reviewAssignedUserId
      : args.estadoReembolso === "pendiente_revision_impuestos"
        ? args.contadorAsignadoUserId
        : args.eventosDianAsignadoUserId;

  if (!faseUserId || faseUserId !== args.actorUserId) {
    return {
      puedeEditar: false,
      motivoSoloLectura: "no_asignado",
      faseOperativa: args.estadoReembolso,
    };
  }

  return {
    puedeEditar: true,
    motivoSoloLectura: null,
    faseOperativa: args.estadoReembolso,
  };
}

export function matchesCausacionEstadoFilter(
  causado: boolean | undefined,
  filter: "causado" | "no_causado" | "sin_registro"
): boolean {
  return deriveCausacionEstado(causado) === filter;
}

export function formatCausacionEstadoLabel(estado: CausacionEstado): string {
  switch (estado) {
    case "causado":
      return "Causado";
    case "no_causado":
      return "No causado";
    default:
      return "Sin registro";
  }
}

export function formatCausacionEstadoExport(causado: boolean | null | undefined): string {
  if (causado === true) return "Sí";
  if (causado === false) return "No";
  return "Sin registro";
}
