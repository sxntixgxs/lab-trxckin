/**
 * Canonical current-owner resolution for Facturación dashboard.
 * Pure helpers — no Convex ctx dependency so they are unit-testable.
 */

export type OwnershipAssignment = {
  _id: string;
  tareaId?: string | null;
  estado: string;
  fase: string;
  grupoId: string;
  asignadoAUserId?: string | null;
  asignadoANombre: string;
  asignadoAEmail: string;
  rol: string;
  fechaAsignacion: number;
};

export type OwnershipTask = {
  _id: string;
  estado: string;
  grupoAsignacionActualId?: string | null;
  currentAsignacionId?: string | null;
};

export type OwnershipFactura = {
  _id: string;
  esPeaje?: boolean | null;
  esLegalizacionAnticipo?: boolean | null;
  esLegalizacionCajaMenor?: boolean | null;
  documentoClase?: string | null;
  anticipoLiderUserId?: string | null;
  anticipoLiderNombre?: string | null;
  anticipoLiderEmail?: string | null;
  cajaMenorMarcadorUserId?: string | null;
  cajaMenorMarcadorNombre?: string | null;
  cajaMenorMarcadorEmail?: string | null;
};

export type ValidOwner = {
  userId?: string;
  email: string;
  nombre: string;
  rol: string;
  fase: string;
  fechaAsignacion: number;
  asignacionId: string;
};

export type OwnershipResult = {
  owners: ValidOwner[];
  integrityIssues: Array<"sin_responsable" | "asignacion_inconsistente" | "tarea_faltante">;
  esPeaje: boolean;
  esActiva: boolean;
};

export const TERMINAL_ESTADOS = new Set([
  "pagada",
  "legalizada",
  "cerrada",
  "rechazada",
  "rechazada_dian",
  "nota_credito_cerrada",
]);

export const ACTIVE_STANDARD_PHASES = new Set([
  "recepcion",
  "revision_lider",
  "jefe_directo",
  "aceptada",
  "causacion",
  "revision_impuestos",
  "eventos_dian",
  "pendiente_rechazar_dian",
  "pendiente_nota_credito",
  "reembolso_caja_menor",
  "gerencia",
  "revision_tesoreria",
]);

export function normalizeOwnerEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function ownerIdentityKey(owner: { userId?: string | null; email: string }): string {
  const id = owner.userId?.trim();
  if (id) return `id:${id}`;
  return `email:${normalizeOwnerEmail(owner.email)}`;
}

/**
 * A standard-flow current owner is valid only when:
 * - Assignment is pendiente
 * - Assignment belongs to the invoice's current task
 * - Task is nonterminal
 * - Assignment phase equals task state
 * - Assignment group equals grupoAsignacionActualId when the task has an active group
 */
export function resolveValidOwners(args: {
  tarea: OwnershipTask | null | undefined;
  asignaciones: OwnershipAssignment[];
  factura: OwnershipFactura;
}): OwnershipResult {
  const { tarea, asignaciones, factura } = args;
  const esPeaje = Boolean(factura.esPeaje);

  if (esPeaje) {
    return {
      owners: [],
      integrityIssues: [],
      esPeaje: true,
      esActiva: false,
    };
  }

  if (!tarea) {
    return {
      owners: [],
      integrityIssues: ["tarea_faltante"],
      esPeaje: false,
      esActiva: false,
    };
  }

  const esActiva = ACTIVE_STANDARD_PHASES.has(tarea.estado);
  if (!esActiva || TERMINAL_ESTADOS.has(tarea.estado)) {
    return {
      owners: [],
      integrityIssues: [],
      esPeaje: false,
      esActiva: false,
    };
  }

  // Caja menor reimbursement ownership from workflow state / markers
  if (tarea.estado === "reembolso_caja_menor") {
    const owners: ValidOwner[] = [];
    if (factura.cajaMenorMarcadorUserId || factura.cajaMenorMarcadorEmail) {
      owners.push({
        userId: factura.cajaMenorMarcadorUserId ?? undefined,
        email: normalizeOwnerEmail(factura.cajaMenorMarcadorEmail ?? "sin-email@local"),
        nombre: factura.cajaMenorMarcadorNombre ?? "Revisor caja menor",
        rol: "revisor_caja_menor",
        fase: "reembolso_caja_menor",
        fechaAsignacion: 0,
        asignacionId: "caja-menor-marker",
      });
    }
    // Also include pending assignments in this phase if present
    const pendientes = filterValidAssignments(tarea, asignaciones);
    for (const a of pendientes) {
      owners.push(toOwner(a));
    }
    const deduped = dedupeOwners(owners);
    return {
      owners: deduped,
      integrityIssues: deduped.length === 0 ? ["sin_responsable"] : [],
      esPeaje: false,
      esActiva: true,
    };
  }

  const valid = filterValidAssignments(tarea, asignaciones);
  const owners = dedupeOwners(valid.map(toOwner));

  const integrityIssues: OwnershipResult["integrityIssues"] = [];
  if (owners.length === 0) {
    integrityIssues.push("sin_responsable");
  }

  // Stale currentAsignacionId pointing at non-valid row
  if (tarea.currentAsignacionId) {
    const current = asignaciones.find((a) => a._id === tarea.currentAsignacionId);
    if (current && !valid.some((a) => a._id === current._id)) {
      if (
        current.estado === "pendiente" &&
        (current.fase !== tarea.estado ||
          (tarea.grupoAsignacionActualId && current.grupoId !== tarea.grupoAsignacionActualId))
      ) {
        integrityIssues.push("asignacion_inconsistente");
      }
    }
  }

  return {
    owners,
    integrityIssues: [...new Set(integrityIssues)],
    esPeaje: false,
    esActiva: true,
  };
}

function filterValidAssignments(
  tarea: OwnershipTask,
  asignaciones: OwnershipAssignment[]
): OwnershipAssignment[] {
  const grupo = tarea.grupoAsignacionActualId;
  return asignaciones.filter(
    (a) =>
      a.estado === "pendiente" &&
      a.tareaId === tarea._id &&
      a.fase === tarea.estado &&
      (!grupo || a.grupoId === grupo)
  );
}

function toOwner(a: OwnershipAssignment): ValidOwner {
  return {
    userId: a.asignadoAUserId?.trim() || undefined,
    email: normalizeOwnerEmail(a.asignadoAEmail),
    nombre: a.asignadoANombre,
    rol: a.rol,
    fase: a.fase,
    fechaAsignacion: a.fechaAsignacion,
    asignacionId: a._id,
  };
}

function dedupeOwners(owners: ValidOwner[]): ValidOwner[] {
  const byKey = new Map<string, ValidOwner>();
  for (const owner of owners) {
    const key = ownerIdentityKey(owner);
    const existing = byKey.get(key);
    if (!existing || owner.fechaAsignacion < existing.fechaAsignacion) {
      byKey.set(key, owner);
    }
  }
  return Array.from(byKey.values()).sort((a, b) => a.fechaAsignacion - b.fechaAsignacion);
}

export type DashboardTipoFlujo =
  | "normal"
  | "anticipo"
  | "caja_menor"
  | "peaje"
  | "nota_credito"
  | "nota_debito"
  | "otro";

export type DashboardGrupoFase =
  | "lideres"
  | "fases_contables"
  | "tesoreria"
  | "recepcion"
  | "gerencia"
  | "rechazos_dian"
  | "reembolso_caja_menor"
  | "otros_activos"
  | "terminal"
  | "peajes";

export function classifyTipoFlujo(factura: OwnershipFactura): DashboardTipoFlujo {
  if (factura.esPeaje) return "peaje";
  if (factura.esLegalizacionAnticipo) return "anticipo";
  if (factura.esLegalizacionCajaMenor) return "caja_menor";
  if (factura.documentoClase === "nota_credito") return "nota_credito";
  if (factura.documentoClase === "nota_debito") return "nota_debito";
  if (factura.documentoClase === "otro") return "otro";
  return "normal";
}

/** Notes, debit notes and peajes stay searchable but out of headline totals. */
export function incluyeEnTotalesHeadline(tipoFlujo: DashboardTipoFlujo): boolean {
  return tipoFlujo === "normal" || tipoFlujo === "anticipo" || tipoFlujo === "caja_menor";
}

export function classifyGrupoFase(estado: string, esPeaje: boolean): DashboardGrupoFase {
  if (esPeaje) return "peajes";
  if (TERMINAL_ESTADOS.has(estado)) return "terminal";
  if (estado === "revision_lider") return "lideres";
  // Legacy jefe_directo is searchable but excluded from Líder totals
  if (estado === "jefe_directo") return "otros_activos";
  if (estado === "causacion" || estado === "revision_impuestos" || estado === "eventos_dian") {
    return "fases_contables";
  }
  if (estado === "revision_tesoreria") return "tesoreria";
  if (estado === "recepcion") return "recepcion";
  if (estado === "gerencia") return "gerencia";
  if (estado === "pendiente_rechazar_dian") return "rechazos_dian";
  if (estado === "reembolso_caja_menor") return "reembolso_caja_menor";
  if (
    estado === "caja_menor_reembolsada" ||
    estado === "caja_menor_rechazado" ||
    estado === "caja_menor_anulado"
  ) {
    return "terminal";
  }
  if (estado.startsWith("caja_menor_")) return "reembolso_caja_menor";
  return "otros_activos";
}

/**
 * Infer phase start from active assignment group min fechaAsignacion,
 * else latest transition audit, else actualizadoEn (flagged).
 */
export function inferFaseIniciadaEn(args: {
  tarea: {
    estado: string;
    faseIniciadaEn?: number | null;
    actualizadoEn: number;
    creadoEn: number;
    grupoAsignacionActualId?: string | null;
  };
  asignaciones: OwnershipAssignment[];
  aprobaciones?: Array<{
    estadoNuevo: string;
    creadoEn: number;
  }>;
}): { faseIniciadaEn: number; estimado: boolean } {
  if (args.tarea.faseIniciadaEn) {
    return { faseIniciadaEn: args.tarea.faseIniciadaEn, estimado: false };
  }

  const grupo = args.tarea.grupoAsignacionActualId;
  const enGrupo = args.asignaciones.filter(
    (a) => a.fase === args.tarea.estado && (!grupo || a.grupoId === grupo)
  );
  if (enGrupo.length > 0) {
    const min = Math.min(...enGrupo.map((a) => a.fechaAsignacion));
    return { faseIniciadaEn: min, estimado: true };
  }

  const transicion = (args.aprobaciones ?? [])
    .filter((a) => a.estadoNuevo === args.tarea.estado)
    .sort((a, b) => b.creadoEn - a.creadoEn)[0];
  if (transicion) {
    return { faseIniciadaEn: transicion.creadoEn, estimado: true };
  }

  return {
    faseIniciadaEn: args.tarea.actualizadoEn || args.tarea.creadoEn,
    estimado: true,
  };
}

/**
 * Build patch fields when transitioning to a new phase.
 * Reassignment within the same phase does not reset SLA.
 */
export function phaseTransitionPatch(args: {
  estadoAnterior: string;
  estadoNuevo: string;
  nowMs: number;
  existingFaseIniciadaEn?: number | null;
}): {
  estado: string;
  faseIniciadaEn?: number;
  faseIniciadaEnEstimado?: boolean;
  finalizadoEn?: number;
} {
  const samePhase = args.estadoAnterior === args.estadoNuevo;
  const patch: {
    estado: string;
    faseIniciadaEn?: number;
    faseIniciadaEnEstimado?: boolean;
    finalizadoEn?: number;
  } = { estado: args.estadoNuevo };

  if (!samePhase) {
    patch.faseIniciadaEn = args.nowMs;
    patch.faseIniciadaEnEstimado = false;
    if (TERMINAL_ESTADOS.has(args.estadoNuevo)) {
      patch.finalizadoEn = args.nowMs;
    }
  } else if (args.existingFaseIniciadaEn == null && !TERMINAL_ESTADOS.has(args.estadoNuevo)) {
    patch.faseIniciadaEn = args.nowMs;
    patch.faseIniciadaEnEstimado = false;
  }

  return patch;
}
