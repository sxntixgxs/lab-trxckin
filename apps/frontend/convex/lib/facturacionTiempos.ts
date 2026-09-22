import { diffBusinessDaysBogota } from "./facturacionBusinessTime";

export type TimingIntervalType = "asignacion" | "sin_asignar" | "caja_menor";

export const TERMINAL_FACTURACION_ESTADOS = new Set([
  "pagada",
  "legalizada",
  "cerrada",
  "rechazada",
  "rechazada_dian",
  "nota_credito_cerrada",
]);

export type TimingFactura = {
  id?: string;
  creadoEn: number;
  actualizadoEn?: number;
  esPeaje?: boolean;
};

export type TimingTarea = {
  estado?: string;
  finalizadoEn?: number;
  actualizadoEn?: number;
};

export type TimingAsignacion = {
  id?: string;
  tareaId?: string;
  fase?: string;
  estado?: string;
  rol?: string;
  grupoId?: string;
  asignadoAUserId?: string;
  asignadoANombre?: string;
  asignadoAEmail?: string;
  asignadoAProcesoId?: number;
  asignadoAProcesoNombre?: string;
  fechaAsignacion: number;
  fechaCompletado?: number;
  duracionMs?: number;
  comentario?: string;
  actualizadoEn?: number;
};

export type TimingAprobacion = {
  asignacionId?: string;
  creadoEn: number;
};

export type TimingClosure = {
  inicioEn: number;
  finEn: number;
  enCurso: boolean;
  sinWorkflow: boolean;
};

export type TimingMovement = {
  id: string;
  tipoIntervalo: TimingIntervalType;
  esSintetico: boolean;
  fase: string | null;
  rol: string | null;
  estado: string;
  responsableUserId: string | null;
  responsableNombre: string | null;
  responsableEmail: string | null;
  procesoId: number | null;
  procesoNombre: string | null;
  inicioEn: number;
  finEn: number;
  duracionMs: number;
  diasLaborales: number;
  enCurso: boolean;
  comentario: string | null;
};

export type InvoiceTiming = {
  incluidaEnReporte: boolean;
  excluidaPorPeaje: boolean;
  facturaId: string | null;
  inicioEn: number;
  finEn: number;
  enCurso: boolean;
  sinWorkflow: boolean;
  movimientos: TimingMovement[];
  tiempoCalendarioMs: number;
  diasLaborales: number;
  tiempoCalendarioSinAsignarMs: number;
  diasLaboralesSinAsignar: number;
  cantidadMovimientos: number;
};

/** A valid or candidate time interval expressed in epoch milliseconds. */
export type TimingInterval = {
  inicioEn: number;
  finEn: number;
};

export type FacturaTiempoInput = {
  factura: TimingFactura;
  tarea?: TimingTarea | null;
  asignaciones?: TimingAsignacion[];
  aprobaciones?: TimingAprobacion[];
  cajaMenorMovimientos?: TimingMovement[];
  nowMs: number;
};

export type FacturaTiempoResumen = Omit<InvoiceTiming, "movimientos">;

type AssignmentEnd = {
  finEn: number;
  enCurso: boolean;
};

function isFiniteMs(value: number | undefined | null): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function latest(values: Array<number | undefined | null>): number | null {
  const finite = values.filter(isFiniteMs);
  return finite.length > 0 ? Math.max(...finite) : null;
}

function safeDuration(start: number, end: number): number {
  if (!isFiniteMs(start) || !isFiniteMs(end) || end <= start) return 0;
  return end - start;
}

function isTerminal(tarea: TimingTarea | null | undefined): boolean {
  return tarea?.estado != null && TERMINAL_FACTURACION_ESTADOS.has(tarea.estado);
}

/**
 * Resolves the report closing bound without changing source workflow data.
 *
 * The fallback order mirrors the audit requirements: exact task close, latest
 * approval, latest assignment event, task update, invoice update, and finally
 * `nowMs`. Values before ingress are clamped to ingress so a bad historical
 * timestamp can never create a negative report duration.
 */
export function resolveInvoiceClosure(args: {
  factura: TimingFactura;
  tarea?: TimingTarea | null;
  asignaciones?: TimingAsignacion[];
  aprobaciones?: TimingAprobacion[];
  nowMs: number;
}): TimingClosure {
  const inicioEn = isFiniteMs(args.factura.creadoEn) ? args.factura.creadoEn : args.nowMs;
  const tarea = args.tarea ?? null;

  if (!tarea) {
    const finEn = Math.max(inicioEn, args.nowMs);
    return {
      inicioEn,
      finEn,
      enCurso: true,
      sinWorkflow: true,
    };
  }

  if (!isTerminal(tarea)) {
    const finEn = Math.max(inicioEn, args.nowMs);
    return {
      inicioEn,
      finEn,
      enCurso: true,
      sinWorkflow: false,
    };
  }

  if (isFiniteMs(tarea.finalizadoEn)) {
    const finEn = Math.max(inicioEn, tarea.finalizadoEn);
    return {
      inicioEn,
      finEn,
      enCurso: false,
      sinWorkflow: false,
    };
  }

  const latestApproval = latest((args.aprobaciones ?? []).map((approval) => approval.creadoEn));
  if (latestApproval != null) {
    return {
      inicioEn,
      finEn: Math.max(inicioEn, latestApproval),
      enCurso: false,
      sinWorkflow: false,
    };
  }

  const latestAssignmentEvent = latest(
    (args.asignaciones ?? []).flatMap((assignment) => [
      assignment.fechaCompletado,
      assignment.fechaAsignacion,
    ])
  );
  if (latestAssignmentEvent != null) {
    return {
      inicioEn,
      finEn: Math.max(inicioEn, latestAssignmentEvent),
      enCurso: false,
      sinWorkflow: false,
    };
  }

  if (isFiniteMs(tarea.actualizadoEn)) {
    return {
      inicioEn,
      finEn: Math.max(inicioEn, tarea.actualizadoEn),
      enCurso: false,
      sinWorkflow: false,
    };
  }

  if (isFiniteMs(args.factura.actualizadoEn)) {
    return {
      inicioEn,
      finEn: Math.max(inicioEn, args.factura.actualizadoEn),
      enCurso: false,
      sinWorkflow: false,
    };
  }

  return {
    inicioEn,
    finEn: Math.max(inicioEn, args.nowMs),
    enCurso: false,
    sinWorkflow: false,
  };
}

function resolveAssignmentEnd(args: {
  assignment: TimingAsignacion;
  approvals: TimingAprobacion[];
  nowMs: number;
}): AssignmentEnd {
  const assignment = args.assignment;

  // A pending task is measured as open at query time, even if an old audit row
  // happens to contain a completion timestamp.
  if (assignment.estado === "pendiente") {
    return { finEn: args.nowMs, enCurso: true };
  }

  if (isFiniteMs(assignment.fechaCompletado)) {
    return { finEn: assignment.fechaCompletado, enCurso: false };
  }

  if (isFiniteMs(assignment.duracionMs) && assignment.duracionMs >= 0) {
    return {
      finEn: assignment.fechaAsignacion + assignment.duracionMs,
      enCurso: false,
    };
  }

  const approvalEnd = latest(
    args.approvals
      .filter((approval) => approval.asignacionId === assignment.id)
      .map((approval) => approval.creadoEn)
  );
  if (approvalEnd != null) {
    return { finEn: approvalEnd, enCurso: false };
  }

  if (isFiniteMs(assignment.actualizadoEn)) {
    return { finEn: assignment.actualizadoEn, enCurso: false };
  }

  // The schema normally always has actualizadoEn. Keep the movement visible if
  // a legacy row does not, but do not expose a data-quality classification.
  return { finEn: args.nowMs, enCurso: false };
}

function buildAssignmentMovement(args: {
  assignment: TimingAsignacion;
  approvals: TimingAprobacion[];
  nowMs: number;
  facturaInicioEn: number;
}): TimingMovement {
  const assignment = args.assignment;
  const tieneInicioValido = isFiniteMs(assignment.fechaAsignacion);
  const start = tieneInicioValido ? assignment.fechaAsignacion : args.facturaInicioEn;
  const end = resolveAssignmentEnd({
    assignment,
    approvals: args.approvals,
    nowMs: args.nowMs,
  });
  // Keep malformed legacy rows visible, but never let their fallback start
  // participate in total/gap calculations.
  const duration = tieneInicioValido ? safeDuration(start, end.finEn) : 0;

  return {
    id: assignment.id ?? `asignacion-${start}`,
    tipoIntervalo: "asignacion",
    esSintetico: false,
    fase: assignment.fase ?? null,
    rol: assignment.rol ?? null,
    estado: assignment.estado ?? "desconocido",
    responsableUserId: assignment.asignadoAUserId ?? null,
    responsableNombre: assignment.asignadoANombre ?? null,
    responsableEmail: assignment.asignadoAEmail ?? null,
    procesoId: assignment.asignadoAProcesoId ?? null,
    procesoNombre: assignment.asignadoAProcesoNombre ?? null,
    inicioEn: start,
    finEn: end.finEn,
    duracionMs: duration,
    diasLaborales: duration > 0 ? diffBusinessDaysBogota(start, end.finEn) : 0,
    enCurso: end.enCurso,
    comentario: assignment.comentario ?? null,
  };
}

type EffectiveInterval = TimingInterval;

function effectiveIntervals(args: {
  movements: TimingMovement[];
  inicioEn: number;
  finEn: number;
}): EffectiveInterval[] {
  const intervals: EffectiveInterval[] = [];
  for (const movement of args.movements) {
    if (
      (movement.tipoIntervalo !== "asignacion" &&
        movement.tipoIntervalo !== "caja_menor") ||
      movement.duracionMs <= 0 ||
      movement.finEn <= movement.inicioEn
    )
      continue;
    const inicioEn = Math.max(args.inicioEn, movement.inicioEn);
    const finEn = Math.min(args.finEn, movement.finEn);
    if (finEn > inicioEn) intervals.push({ inicioEn, finEn });
  }
  return intervals.sort((a, b) => a.inicioEn - b.inicioEn || a.finEn - b.finEn);
}

function mergeIntervals(intervals: EffectiveInterval[]): EffectiveInterval[] {
  const merged: EffectiveInterval[] = [];
  for (const interval of intervals) {
    const current = merged.at(-1);
    if (!current || interval.inicioEn > current.finEn) {
      merged.push({ ...interval });
      continue;
    }
    current.finEn = Math.max(current.finEn, interval.finEn);
  }
  return merged;
}

function buildUnassignedMovements(args: {
  intervals: EffectiveInterval[];
  inicioEn: number;
  finEn: number;
  closureEnCurso: boolean;
}): TimingMovement[] {
  const gaps: TimingMovement[] = [];
  let cursor = args.inicioEn;
  const addGap = (start: number, end: number, index: number) => {
    if (end <= start) return;
    const duration = safeDuration(start, end);
    gaps.push({
      id: `sin-asignar-${index}`,
      tipoIntervalo: "sin_asignar",
      esSintetico: true,
      fase: null,
      rol: null,
      estado: "sin_asignar",
      responsableUserId: null,
      responsableNombre: null,
      responsableEmail: null,
      procesoId: null,
      procesoNombre: null,
      inicioEn: start,
      finEn: end,
      duracionMs: duration,
      diasLaborales: diffBusinessDaysBogota(start, end),
      enCurso: args.closureEnCurso && end === args.finEn,
      comentario: null,
    });
  };

  for (const interval of args.intervals) {
    addGap(cursor, interval.inicioEn, gaps.length);
    cursor = Math.max(cursor, interval.finEn);
  }
  addGap(cursor, args.finEn, gaps.length);
  return gaps;
}

/**
 * Builds the invoice-level time summary and its movement detail.
 *
 * The total is calculated directly from invoice ingress to the resolved close
 * bound. It is deliberately not the sum of assignments, because assignments
 * may run in parallel. Synthetic `sin_asignar` movements are the complement
 * of the union of valid assignment intervals in that same total window.
 */
export function buildInvoiceTiming(args: {
  factura: TimingFactura;
  tarea?: TimingTarea | null;
  asignaciones?: TimingAsignacion[];
  aprobaciones?: TimingAprobacion[];
  /** Pre-built Caja Menor movements (see loadCajaMenorTimingMovements). */
  cajaMenorMovimientos?: TimingMovement[];
  nowMs: number;
}): InvoiceTiming {
  const closure = resolveInvoiceClosure(args);
  const facturaId = args.factura.id ?? null;

  if (args.factura.esPeaje) {
    return {
      incluidaEnReporte: false,
      excluidaPorPeaje: true,
      facturaId,
      inicioEn: closure.inicioEn,
      finEn: closure.finEn,
      enCurso: closure.enCurso,
      sinWorkflow: closure.sinWorkflow,
      movimientos: [],
      tiempoCalendarioMs: 0,
      diasLaborales: 0,
      tiempoCalendarioSinAsignarMs: 0,
      diasLaboralesSinAsignar: 0,
      cantidadMovimientos: 0,
    };
  }

  const assignmentMovements = (args.asignaciones ?? []).map((assignment) =>
    buildAssignmentMovement({
      assignment,
      approvals: args.aprobaciones ?? [],
      nowMs: args.nowMs,
      facturaInicioEn: closure.inicioEn,
    })
  );
  const cajaMenorMovements = args.cajaMenorMovimientos ?? [];
  const coveredMovements = [...assignmentMovements, ...cajaMenorMovements];
  const intervals = mergeIntervals(
    effectiveIntervals({
      movements: coveredMovements,
      inicioEn: closure.inicioEn,
      finEn: closure.finEn,
    })
  );
  const syntheticMovements = buildUnassignedMovements({
    intervals,
    inicioEn: closure.inicioEn,
    finEn: closure.finEn,
    closureEnCurso: closure.enCurso,
  });
  const movimientos = [...coveredMovements, ...syntheticMovements].sort(
    (a, b) => a.inicioEn - b.inicioEn || a.finEn - b.finEn || a.id.localeCompare(b.id)
  );
  const totalDuration = safeDuration(closure.inicioEn, closure.finEn);
  const sinAsignarMs = syntheticMovements.reduce((sum, movement) => sum + movement.duracionMs, 0);
  const sinAsignarLaborales = syntheticMovements.reduce(
    (sum, movement) => sum + movement.diasLaborales,
    0
  );

  return {
    incluidaEnReporte: true,
    excluidaPorPeaje: false,
    facturaId,
    inicioEn: closure.inicioEn,
    finEn: closure.finEn,
    enCurso: closure.enCurso,
    sinWorkflow: closure.sinWorkflow,
    movimientos,
    tiempoCalendarioMs: totalDuration,
    diasLaborales: totalDuration > 0 ? diffBusinessDaysBogota(closure.inicioEn, closure.finEn) : 0,
    tiempoCalendarioSinAsignarMs: sinAsignarMs,
    diasLaboralesSinAsignar: sinAsignarLaborales,
    cantidadMovimientos: coveredMovements.length,
  };
}

/**
 * Query-facing alias for the invoice summary. The returned summary intentionally
 * keeps the total independent from assignment movement durations.
 */
export function buildFacturaTiempoResumen(args: FacturaTiempoInput): FacturaTiempoResumen {
  const { movimientos: _movimientos, ...summary } = buildInvoiceTiming(args);
  return summary;
}

/** Query-facing alias for on-demand movement detail. */
export function buildFacturaTiempoMovimientos(args: FacturaTiempoInput): TimingMovement[] {
  return buildInvoiceTiming(args).movimientos;
}
