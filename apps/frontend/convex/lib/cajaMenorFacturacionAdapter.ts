import { v } from "convex/values";
import type { Doc, } from "../_generated/dataModel";
import { diffBusinessDaysBogota } from "./facturacionBusinessTime";
import { CAJA_MENOR_AUDIT_ACTIONS } from "./cajaMenorAuditoria";

export const CAJA_MENOR_PUBLIC_PHASES = [
  "caja_menor_por_generar",
  "caja_menor_aprobacion_lider",
  "caja_menor_revision",
  "caja_menor_contabilidad",
  "caja_menor_eventos_dian",
  "caja_menor_gerencia",
  "caja_menor_tesoreria",
  "caja_menor_reembolsada",
  "caja_menor_tesoreria_pendiente_regularizar",
  "caja_menor_rechazado",
  "caja_menor_anulado",
  "caja_menor_relacion_pendiente",
] as const;

export type CajaMenorPublicPhase = (typeof CAJA_MENOR_PUBLIC_PHASES)[number];

export const CAJA_MENOR_PHASE_LABELS: Record<CajaMenorPublicPhase, string> = {
  caja_menor_por_generar: "Caja menor · Por generar",
  caja_menor_aprobacion_lider: "Caja menor · Aprobación líder",
  caja_menor_revision: "Caja menor · Revisión",
  caja_menor_contabilidad: "Caja menor · Contabilidad",
  caja_menor_eventos_dian: "Caja menor · Eventos DIAN",
  caja_menor_gerencia: "Caja menor · Gerencia",
  caja_menor_tesoreria: "Caja menor · Tesorería",
  caja_menor_reembolsada: "Caja menor · Reembolsada",
  caja_menor_tesoreria_pendiente_regularizar:
    "Caja menor · Tesorería pendiente de regularizar",
  caja_menor_rechazado: "Caja menor · Reembolso rechazado",
  caja_menor_anulado: "Caja menor · Caja Menor anulada",
  caja_menor_relacion_pendiente: "Caja menor · Relación pendiente",
};

export const CAJA_MENOR_TERMINAL_PHASES = new Set<CajaMenorPublicPhase>([
  "caja_menor_reembolsada",
  "caja_menor_rechazado",
  "caja_menor_anulado",
]);

export const UNIFIED_CAJA_MENOR_BAR_STEPS = [
  { key: "recepcion", label: "Recepción" },
  { key: "revision_lider", label: "Revisión líder" },
  { key: "caja_menor_por_generar", label: "Reembolso por generar" },
  { key: "caja_menor_aprobacion_lider", label: "Aprobación líder" },
  { key: "caja_menor_revision", label: "Revisión Caja Menor" },
  { key: "caja_menor_contabilidad", label: "Contabilidad" },
  { key: "caja_menor_eventos_dian", label: "Eventos DIAN" },
  { key: "caja_menor_gerencia", label: "Gerencia" },
  { key: "caja_menor_tesoreria", label: "Tesorería" },
  { key: "caja_menor_reembolsada", label: "Reembolsada" },
] as const;

export const REEMBOLSO_ESTADO_TO_PUBLIC_PHASE: Record<string, CajaMenorPublicPhase> = {
  pendiente_aprobacion_lider: "caja_menor_aprobacion_lider",
  pendiente_revision: "caja_menor_revision",
  pendiente_revision_impuestos: "caja_menor_contabilidad",
  pendiente_eventos_dian: "caja_menor_eventos_dian",
  pendiente_aprobacion: "caja_menor_gerencia",
  pendiente_pago_tesoreria: "caja_menor_tesoreria",
  aprobado_pendiente_recibo: "caja_menor_tesoreria_pendiente_regularizar",
  recibido: "caja_menor_reembolsada",
  rechazado: "caja_menor_rechazado",
  anulado: "caja_menor_anulado",
};

export const GERENCIA_EQUIPO_EMAIL = "equipo.gerencia-financiera@caja-menor";
export const TESORERIA_EQUIPO_EMAIL = "equipo.tesoreria@caja-menor";
export const RESPONSABLE_NO_REGISTRADO = "Responsable no registrado";

const REEMBOLSO_PROGRESS_PHASES = [
  "caja_menor_aprobacion_lider",
  "caja_menor_revision",
  "caja_menor_contabilidad",
  "caja_menor_eventos_dian",
  "caja_menor_gerencia",
  "caja_menor_tesoreria",
] as const;

export type CajaMenorIntervalEstado =
  | "en_curso"
  | "completada"
  | "devuelta"
  | "rechazada"
  | "reasignada"
  | "anulada";

export type CajaMenorProcesoIntervalo = {
  id: string;
  origen: "facturacion" | "caja_menor";
  intentoId?: string;
  fase: CajaMenorPublicPhase | string;
  faseLabel: string;
  rol?: string;
  estado: CajaMenorIntervalEstado;
  responsableUserId?: string;
  responsableNombre: string;
  responsableEmail?: string;
  inicioEn: number;
  finEn: number;
  duracionMs: number;
  diasLaborales: number;
  enCurso: boolean;
  observacion?: string;
};

export type CajaMenorProcesoOwner = {
  userId?: string;
  nombre: string;
  email?: string;
  rol?: string;
  esEquipo?: boolean;
};

export type CajaMenorProgresoPaso = {
  key: string;
  label: string;
  estado: "completado" | "actual" | "omitida" | "pendiente";
};

export type CajaMenorProceso = {
  aplica: true;
  fasePublica: CajaMenorPublicPhase;
  fasePublicaLabel: string;
  responsableActual?: CajaMenorProcesoOwner;
  intentoVigenteId?: string;
  advertencia?: string;
  pasosProgreso: CajaMenorProgresoPaso[];
  pasosBarraUnificada: CajaMenorProgresoPaso[];
  intervalos: CajaMenorProcesoIntervalo[];
  intentos: Array<{ intentoId: string; reembolsoId: string; intervalos: CajaMenorProcesoIntervalo[] }>;
};

export type CajaMenorFacturaInput = {
  esLegalizacionCajaMenor?: boolean | null;
  cajaMenorMarcadorUserId?: string | null;
  cajaMenorMarcadorNombre?: string | null;
  cajaMenorMarcadorEmail?: string | null;
};

export type CajaMenorAdapterInput = {
  factura: CajaMenorFacturaInput;
  tareaEstado?: string | null;
  movimientos: Array<
    Pick<
      Doc<"facturacionCajaMenorMovimientos">,
      | "_id"
      | "estado"
      | "reembolsoId"
      | "creadoEn"
      | "actualizadoEn"
      | "actorUserId"
      | "actorNombre"
      | "actorEmail"
    >
  >;
  reembolsos: Array<Doc<"cajasMenoresReembolsos">>;
  eventos: Array<Doc<"cajasMenoresReembolsoEventos">>;
  aprobaciones: Array<
    Pick<
      Doc<"facturacionAprobaciones">,
      | "_id"
      | "accion"
      | "creadoEn"
      | "comentario"
      | "estadoAnterior"
      | "estadoNuevo"
      | "actorUserId"
      | "actorNombre"
      | "actorEmail"
      | "cajaMenorContexto"
    >
  >;
  nowMs: number;
};

const cajaMenorAuditActionSet = new Set<string>(CAJA_MENOR_AUDIT_ACTIONS);

function isFiniteMs(value: number | undefined | null): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function safeDuration(start: number, end: number): number {
  if (!isFiniteMs(start) || !isFiniteMs(end) || end <= start) return 0;
  return end - start;
}

function intervalMetrics(inicioEn: number, finEn: number) {
  return {
    duracionMs: safeDuration(inicioEn, finEn),
    diasLaborales: diffBusinessDaysBogota(inicioEn, finEn),
  };
}

export function mapReembolsoEstadoToPublicPhase(estado: string): CajaMenorPublicPhase | null {
  return REEMBOLSO_ESTADO_TO_PUBLIC_PHASE[estado] ?? null;
}

export function resolveMovimientoRelevante(
  movimientos: CajaMenorAdapterInput["movimientos"]
): CajaMenorAdapterInput["movimientos"][number] | null {
  if (movimientos.length === 0) return null;
  const activo = movimientos.find(
    (m) => m.estado === "pendiente_reembolso" || m.estado === "en_reembolso"
  );
  if (activo) return activo;
  return [...movimientos].sort((a, b) => b.actualizadoEn - a.actualizadoEn)[0] ?? null;
}

export function resolveReembolsoVigente(args: {
  movimiento: CajaMenorAdapterInput["movimientos"][number] | null;
  reembolsos: Doc<"cajasMenoresReembolsos">[];
}): Doc<"cajasMenoresReembolsos"> | null {
  if (args.movimiento?.reembolsoId) {
    return args.reembolsos.find((r) => r._id === args.movimiento?.reembolsoId) ?? null;
  }
  if (args.reembolsos.length === 0) return null;
  return [...args.reembolsos].sort((a, b) => b.actualizadoEn - a.actualizadoEn)[0] ?? null;
}

export function resolveOwnerForReembolsoPhase(
  reembolso: Doc<"cajasMenoresReembolsos">,
  phase: CajaMenorPublicPhase,
  factura: CajaMenorFacturaInput
): CajaMenorProcesoOwner | undefined {
  switch (phase) {
    case "caja_menor_aprobacion_lider":
      if (reembolso.liderAprobadorNombre) {
        return {
          userId: reembolso.liderAprobadorUserId,
          nombre: reembolso.liderAprobadorNombre,
          email: reembolso.liderAprobadorEmail,
          rol: "lider",
        };
      }
      return undefined;
    case "caja_menor_revision":
      if (reembolso.reviewAssignedNombre) {
        return {
          userId: reembolso.reviewAssignedUserId,
          nombre: reembolso.reviewAssignedNombre,
          email: reembolso.reviewAssignedEmail,
          rol: "revisor",
        };
      }
      return undefined;
    case "caja_menor_contabilidad":
      if (reembolso.contadorAsignadoNombre) {
        return {
          userId: reembolso.contadorAsignadoUserId,
          nombre: reembolso.contadorAsignadoNombre,
          email: reembolso.contadorAsignadoEmail,
          rol: "contabilidad",
        };
      }
      return undefined;
    case "caja_menor_eventos_dian":
      if (reembolso.eventosDianAsignadoNombre) {
        return {
          userId: reembolso.eventosDianAsignadoUserId,
          nombre: reembolso.eventosDianAsignadoNombre,
          email: reembolso.eventosDianAsignadoEmail,
          rol: "eventos_dian",
        };
      }
      return undefined;
    case "caja_menor_gerencia":
      if (reembolso.gfAprobadorNombre) {
        return {
          userId: reembolso.gfAprobadorUserId,
          nombre: reembolso.gfAprobadorNombre,
          email: reembolso.gfAprobadorEmail,
          rol: "gerencia_financiera",
        };
      }
      return {
        nombre: "Gerencia Financiera",
        email: GERENCIA_EQUIPO_EMAIL,
        rol: "gerencia_financiera",
        esEquipo: true,
      };
    case "caja_menor_tesoreria":
    case "caja_menor_tesoreria_pendiente_regularizar":
      if (reembolso.tesoreroNombre) {
        return {
          userId: reembolso.tesoreroUserId,
          nombre: reembolso.tesoreroNombre,
          email: reembolso.tesoreroEmail,
          rol: "tesoreria",
        };
      }
      return {
        nombre: "Tesorería",
        email: TESORERIA_EQUIPO_EMAIL,
        rol: "tesoreria",
        esEquipo: true,
      };
    case "caja_menor_por_generar":
      if (factura.cajaMenorMarcadorNombre || factura.cajaMenorMarcadorEmail) {
        return {
          userId: factura.cajaMenorMarcadorUserId ?? undefined,
          nombre: factura.cajaMenorMarcadorNombre ?? "Custodio Caja Menor",
          email: factura.cajaMenorMarcadorEmail ?? undefined,
          rol: "custodio",
        };
      }
      return undefined;
    default:
      return undefined;
  }
}

export function resolvePublicPhase(args: {
  factura: CajaMenorFacturaInput;
  tareaEstado?: string | null;
  movimiento: CajaMenorAdapterInput["movimientos"][number] | null;
  reembolso: Doc<"cajasMenoresReembolsos"> | null;
}): { fase: CajaMenorPublicPhase; advertencia?: string } {
  const esCajaMenor =
    Boolean(args.factura.esLegalizacionCajaMenor) || args.tareaEstado === "reembolso_caja_menor";

  if (!esCajaMenor && !args.movimiento) {
    return { fase: "caja_menor_relacion_pendiente" };
  }

  if (args.movimiento?.estado === "anulado") {
    return { fase: "caja_menor_anulado" };
  }

  if (args.movimiento?.estado === "reembolsado") {
    return { fase: "caja_menor_reembolsada" };
  }

  if (args.reembolso) {
    const mapped = mapReembolsoEstadoToPublicPhase(args.reembolso.estado);
    if (mapped) return { fase: mapped };
  }

  if (
    args.movimiento?.estado === "pendiente_reembolso" &&
    (!args.reembolso || args.reembolso.estado === "rechazado")
  ) {
    return { fase: "caja_menor_por_generar" };
  }

  if (esCajaMenor && !args.movimiento && !args.reembolso) {
    return {
      fase: "caja_menor_relacion_pendiente",
      advertencia:
        "La factura está marcada como Caja Menor, pero no se encontró el reembolso relacionado.",
    };
  }

  if (esCajaMenor && args.movimiento && !args.reembolso) {
    return {
      fase: "caja_menor_relacion_pendiente",
      advertencia:
        "La factura está marcada como Caja Menor, pero no se encontró el reembolso relacionado.",
    };
  }

  return { fase: "caja_menor_por_generar" };
}

function reembolsoPhaseCompleted(
  reembolso: Doc<"cajasMenoresReembolsos">,
  phase: (typeof REEMBOLSO_PROGRESS_PHASES)[number]
): boolean {
  switch (phase) {
    case "caja_menor_aprobacion_lider":
      return Boolean(reembolso.liderDecisionEn);
    case "caja_menor_revision":
      return Boolean(reembolso.reviewerDecisionEn);
    case "caja_menor_contabilidad":
      return Boolean(reembolso.contadorDecisionEn);
    case "caja_menor_eventos_dian":
      return Boolean(reembolso.eventosDianDecisionEn);
    case "caja_menor_gerencia":
      return Boolean(reembolso.gfDecisionEn);
    case "caja_menor_tesoreria":
      return Boolean(reembolso.comprobanteCargadoEn || reembolso.recibidoEn);
    default:
      return false;
  }
}

function buildReembolsoProgressSteps(
  reembolso: Doc<"cajasMenoresReembolsos"> | null,
  fasePublica: CajaMenorPublicPhase
): CajaMenorProgresoPaso[] {
  if (!reembolso) {
    return REEMBOLSO_PROGRESS_PHASES.map((key) => ({
      key,
      label: CAJA_MENOR_PHASE_LABELS[key],
      estado: key === fasePublica ? "actual" : "pendiente",
    }));
  }

  const currentIndex = REEMBOLSO_PROGRESS_PHASES.indexOf(
    fasePublica as (typeof REEMBOLSO_PROGRESS_PHASES)[number]
  );

  return REEMBOLSO_PROGRESS_PHASES.map((key, index) => {
    if (fasePublica === "caja_menor_reembolsada") {
      return { key, label: CAJA_MENOR_PHASE_LABELS[key], estado: "completado" as const };
    }
    if (fasePublica === "caja_menor_rechazado" || fasePublica === "caja_menor_anulado") {
      if (index < currentIndex && currentIndex >= 0) {
        if (reembolsoPhaseCompleted(reembolso, key)) {
          return { key, label: CAJA_MENOR_PHASE_LABELS[key], estado: "completado" as const };
        }
        return { key, label: CAJA_MENOR_PHASE_LABELS[key], estado: "omitida" as const };
      }
      if (index === currentIndex && currentIndex >= 0) {
        return { key, label: CAJA_MENOR_PHASE_LABELS[key], estado: "actual" as const };
      }
      return { key, label: CAJA_MENOR_PHASE_LABELS[key], estado: "pendiente" as const };
    }

    if (index === currentIndex && currentIndex >= 0) {
      return { key, label: CAJA_MENOR_PHASE_LABELS[key], estado: "actual" as const };
    }
    if (currentIndex >= 0 && index < currentIndex) {
      if (reembolsoPhaseCompleted(reembolso, key)) {
        return { key, label: CAJA_MENOR_PHASE_LABELS[key], estado: "completado" as const };
      }
      return { key, label: CAJA_MENOR_PHASE_LABELS[key], estado: "omitida" as const };
    }
    return { key, label: CAJA_MENOR_PHASE_LABELS[key], estado: "pendiente" as const };
  });
}

function buildUnifiedBarSteps(args: {
  fasePublica: CajaMenorPublicPhase;
  pasosReembolso: CajaMenorProgresoPaso[];
  tareaEstado?: string | null;
}): CajaMenorProgresoPaso[] {
  const recepcionDone =
    args.tareaEstado != null &&
    args.tareaEstado !== "recepcion" &&
    args.tareaEstado !== "revision_lider";
  const liderDone =
    args.tareaEstado != null &&
    !["recepcion", "revision_lider", "jefe_directo"].includes(args.tareaEstado);

  const porGenerarIndex = 2;
  const reembolsadaIndex = UNIFIED_CAJA_MENOR_BAR_STEPS.length - 1;

  const currentBarIndex = (() => {
    if (args.fasePublica === "caja_menor_por_generar") return porGenerarIndex;
    if (args.fasePublica === "caja_menor_reembolsada") return reembolsadaIndex;
    if (args.fasePublica === "caja_menor_relacion_pendiente") return porGenerarIndex;
    const reimbursementKey = args.fasePublica;
    const idx = UNIFIED_CAJA_MENOR_BAR_STEPS.findIndex((s) => s.key === reimbursementKey);
    return idx >= 0 ? idx : porGenerarIndex;
  })();

  return UNIFIED_CAJA_MENOR_BAR_STEPS.map((step, index) => {
    let estado: CajaMenorProgresoPaso["estado"] = "pendiente";
    if (index < 2) {
      if (index === 0) estado = recepcionDone ? "completado" : index === currentBarIndex ? "actual" : "pendiente";
      if (index === 1) {
        if (liderDone) estado = "completado";
        else if (index === currentBarIndex) estado = "actual";
        else if (recepcionDone) estado = "pendiente";
        else estado = "pendiente";
      }
    } else if (index === porGenerarIndex) {
      if (args.fasePublica === "caja_menor_por_generar") estado = "actual";
      else if (currentBarIndex > porGenerarIndex || args.fasePublica === "caja_menor_reembolsada")
        estado = "completado";
    } else if (index === reembolsadaIndex) {
      if (args.fasePublica === "caja_menor_reembolsada") estado = "completado";
      else if (currentBarIndex === index) estado = "actual";
    } else {
      const reembolsoStep = args.pasosReembolso.find((p) => p.key === step.key);
      if (reembolsoStep) {
        estado =
          reembolsoStep.estado === "completado"
            ? "completado"
            : reembolsoStep.estado === "omitida"
              ? "omitida"
              : reembolsoStep.estado === "actual"
                ? "actual"
                : index < currentBarIndex
                  ? "completado"
                  : "pendiente";
      } else if (index < currentBarIndex) {
        estado = "completado";
      } else if (index === currentBarIndex) {
        estado = "actual";
      }
    }
    return { key: step.key, label: step.label, estado };
  });
}

function ownerFromContext(
  contexto: Doc<"facturacionAprobaciones">["cajaMenorContexto"]
): CajaMenorProcesoOwner | undefined {
  const dest = contexto?.responsableDestino;
  if (!dest?.nombre?.trim()) return undefined;
  return {
    ...(dest.userId ? { userId: dest.userId } : {}),
    nombre: dest.nombre,
    ...(dest.email ? { email: dest.email } : {}),
    ...(dest.tipo ? { rol: dest.tipo } : {}),
  };
}

function intervalEstadoFromAccion(accion: string): CajaMenorIntervalEstado {
  if (accion.startsWith("rechazar_")) return "rechazada";
  if (accion.startsWith("devolver_")) return "devuelta";
  if (accion.startsWith("reasignar_")) return "reasignada";
  if (accion === "anular_movimiento_caja_menor") return "anulada";
  if (accion === "confirmar_reembolso_caja_menor") return "completada";
  return "completada";
}

function buildIntervalsForAttempt(args: {
  intentoId: string;
  reembolso: Doc<"cajasMenoresReembolsos"> | null;
  movimiento: CajaMenorAdapterInput["movimientos"][number] | null;
  factura: CajaMenorFacturaInput;
  aprobaciones: CajaMenorAdapterInput["aprobaciones"];
  linkEn?: number;
  nowMs: number;
}): CajaMenorProcesoIntervalo[] {
  const relevant = args.aprobaciones
    .filter((a) => cajaMenorAuditActionSet.has(a.accion))
    .filter((a) => {
      const ctxId = a.cajaMenorContexto?.intentoId ?? a.cajaMenorContexto?.reembolsoId;
      if (ctxId && ctxId !== args.intentoId) return false;
      if (args.reembolso && a.cajaMenorContexto?.reembolsoId === args.reembolso._id) return true;
      if (!args.reembolso) return !a.cajaMenorContexto?.reembolsoId;
      return true;
    })
    .sort((a, b) => a.creadoEn - b.creadoEn);

  const intervals: CajaMenorProcesoIntervalo[] = [];
  let seq = 0;

  const pushInterval = (partial: Omit<CajaMenorProcesoIntervalo, "id" | "duracionMs" | "diasLaborales">) => {
    const metrics = intervalMetrics(partial.inicioEn, partial.finEn);
    intervals.push({
      id: `${args.intentoId}:${seq++}`,
      ...partial,
      ...metrics,
    });
  };

  if (!args.reembolso && args.movimiento?.estado === "pendiente_reembolso") {
    const owner = resolveOwnerForReembolsoPhase(
      {} as Doc<"cajasMenoresReembolsos">,
      "caja_menor_por_generar",
      args.factura
    );
    pushInterval({
      origen: "caja_menor",
      intentoId: args.intentoId,
      fase: "caja_menor_por_generar",
      faseLabel: CAJA_MENOR_PHASE_LABELS.caja_menor_por_generar,
      rol: owner?.rol,
      estado: "en_curso",
      responsableUserId: owner?.userId,
      responsableNombre: owner?.nombre ?? RESPONSABLE_NO_REGISTRADO,
      responsableEmail: owner?.email,
      inicioEn: args.movimiento.creadoEn,
      finEn: args.nowMs,
      enCurso: true,
    });
    return intervals;
  }

  if (!args.reembolso) return intervals;

  type OpenInterval = {
    fase: CajaMenorPublicPhase;
    inicioEn: number;
    owner?: CajaMenorProcesoOwner;
    observacion?: string;
  };

  // `as` keeps TS from narrowing `open` to `null`: it is reassigned inside closures.
  let open = null as OpenInterval | null;
  const linkStart = args.linkEn ?? args.reembolso.creadoEn;

  const closeOpen = (finEn: number, estado: CajaMenorIntervalEstado, observacion?: string) => {
    if (!open) return;
    pushInterval({
      origen: "caja_menor",
      intentoId: args.intentoId,
      fase: open.fase,
      faseLabel: CAJA_MENOR_PHASE_LABELS[open.fase] ?? open.fase,
      rol: open.owner?.rol,
      estado,
      responsableUserId: open.owner?.userId,
      responsableNombre: open.owner?.nombre ?? RESPONSABLE_NO_REGISTRADO,
      responsableEmail: open.owner?.email,
      inicioEn: open.inicioEn,
      finEn,
      enCurso: false,
      observacion: observacion ?? open.observacion,
    });
    open = null;
  };

  const openPhase = (fase: CajaMenorPublicPhase, inicioEn: number, owner?: CajaMenorProcesoOwner, observacion?: string) => {
    open = { fase, inicioEn, owner, observacion };
  };

  for (const approval of relevant) {
    const ctx = approval.cajaMenorContexto;
    const faseNueva =
      (ctx?.faseNueva && mapReembolsoEstadoToPublicPhase(ctx.faseNueva)) ||
      mapReembolsoEstadoToPublicPhase(approval.estadoNuevo);
    const owner =
      ownerFromContext(ctx) ??
      (faseNueva && args.reembolso
        ? resolveOwnerForReembolsoPhase(args.reembolso, faseNueva, args.factura)
        : undefined);

    if (open && open.fase !== faseNueva) {
      closeOpen(approval.creadoEn, intervalEstadoFromAccion(approval.accion), approval.comentario);
    }

    if (faseNueva && (!open || open.fase !== faseNueva)) {
      if (
        approval.accion.startsWith("reasignar_") &&
        open &&
        open.fase === faseNueva
      ) {
        closeOpen(approval.creadoEn, "reasignada", approval.comentario);
      }
      openPhase(faseNueva, approval.creadoEn, owner, approval.comentario);
      continue;
    }

    if (open && approval.accion.startsWith("reasignar_")) {
      const faseActual = open.fase;
      closeOpen(approval.creadoEn, "reasignada", approval.comentario);
      openPhase(faseActual, approval.creadoEn, owner, approval.comentario);
      continue;
    }

    if (open && (approval.accion.startsWith("devolver_") || approval.accion.startsWith("rechazar_"))) {
      closeOpen(approval.creadoEn, intervalEstadoFromAccion(approval.accion), approval.comentario);
      if (faseNueva) {
        openPhase(faseNueva, approval.creadoEn, owner, approval.comentario);
      }
    }

    if (approval.accion === "confirmar_reembolso_caja_menor" && open) {
      closeOpen(approval.creadoEn, "completada", approval.comentario);
    }
  }

  if (!open) {
    const initialPhase =
      mapReembolsoEstadoToPublicPhase(args.reembolso.estado) ?? "caja_menor_aprobacion_lider";
    const owner = resolveOwnerForReembolsoPhase(args.reembolso, initialPhase, args.factura);
    openPhase(initialPhase, Math.max(linkStart, args.reembolso.creadoEn), owner);
  }

  if (open) {
    const terminal = CAJA_MENOR_TERMINAL_PHASES.has(
      mapReembolsoEstadoToPublicPhase(args.reembolso.estado) ?? "caja_menor_por_generar"
    );
    const finEn = terminal
      ? args.reembolso.recibidoEn ??
        args.reembolso.comprobanteCargadoEn ??
        args.reembolso.actualizadoEn
      : args.nowMs;
    pushInterval({
      origen: "caja_menor",
      intentoId: args.intentoId,
      fase: open.fase,
      faseLabel: CAJA_MENOR_PHASE_LABELS[open.fase] ?? open.fase,
      rol: open.owner?.rol,
      estado: terminal ? "completada" : "en_curso",
      responsableUserId: open.owner?.userId,
      responsableNombre: open.owner?.nombre ?? RESPONSABLE_NO_REGISTRADO,
      responsableEmail: open.owner?.email,
      inicioEn: open.inicioEn,
      finEn: finEn ?? args.nowMs,
      enCurso: !terminal,
      observacion: open.observacion,
    });
  }

  return intervals;
}

export function buildCajaMenorProceso(input: CajaMenorAdapterInput): CajaMenorProceso | null {
  const esCajaMenor =
    Boolean(input.factura.esLegalizacionCajaMenor) ||
    input.tareaEstado === "reembolso_caja_menor" ||
    input.movimientos.length > 0;

  if (!esCajaMenor) return null;

  const movimiento = resolveMovimientoRelevante(input.movimientos);
  const reembolsoVigente = resolveReembolsoVigente({
    movimiento,
    reembolsos: input.reembolsos,
  });
  const { fase, advertencia } = resolvePublicPhase({
    factura: input.factura,
    tareaEstado: input.tareaEstado,
    movimiento,
    reembolso: reembolsoVigente,
  });

  const pasosProgreso = buildReembolsoProgressSteps(reembolsoVigente, fase);
  const pasosBarraUnificada = buildUnifiedBarSteps({
    fasePublica: fase,
    pasosReembolso: pasosProgreso,
    tareaEstado: input.tareaEstado,
  });

  const intentosMap = new Map<string, Doc<"cajasMenoresReembolsos">>();
  for (const reembolso of input.reembolsos) {
    intentosMap.set(String(reembolso._id), reembolso);
  }

  const intentos: CajaMenorProceso["intentos"] = [];
  if (intentosMap.size === 0 && movimiento) {
    const intentoId = `mov:${movimiento._id}`;
    const intervalos = buildIntervalsForAttempt({
      intentoId,
      reembolso: null,
      movimiento,
      factura: input.factura,
      aprobaciones: input.aprobaciones,
      nowMs: input.nowMs,
    });
    intentos.push({ intentoId, reembolsoId: intentoId, intervalos });
  } else {
    for (const [reembolsoId, reembolso] of intentosMap) {
      const intervalos = buildIntervalsForAttempt({
        intentoId: reembolsoId,
        reembolso,
        movimiento,
        factura: input.factura,
        aprobaciones: input.aprobaciones,
        linkEn: reembolso.creadoEn,
        nowMs: input.nowMs,
      });
      intentos.push({ intentoId: reembolsoId, reembolsoId, intervalos });
    }
  }

  const intervalos = intentos.flatMap((i) => i.intervalos);
  const intentoVigenteId = reembolsoVigente
    ? String(reembolsoVigente._id)
    : movimiento
      ? `mov:${movimiento._id}`
      : undefined;

  const responsableActual = (() => {
    if (CAJA_MENOR_TERMINAL_PHASES.has(fase)) return undefined;
    if (reembolsoVigente) {
      return resolveOwnerForReembolsoPhase(reembolsoVigente, fase, input.factura);
    }
    return resolveOwnerForReembolsoPhase(
      {} as Doc<"cajasMenoresReembolsos">,
      fase,
      input.factura
    );
  })();

  return {
    aplica: true,
    fasePublica: fase,
    fasePublicaLabel: CAJA_MENOR_PHASE_LABELS[fase],
    ...(responsableActual ? { responsableActual } : {}),
    ...(intentoVigenteId ? { intentoVigenteId } : {}),
    ...(advertencia ? { advertencia } : {}),
    pasosProgreso,
    pasosBarraUnificada,
    intervalos,
    intentos,
  };
}

export const cajaMenorProcesoOwnerValidator = v.object({
  userId: v.optional(v.string()),
  nombre: v.string(),
  email: v.optional(v.string()),
  rol: v.optional(v.string()),
  esEquipo: v.optional(v.boolean()),
});

export const cajaMenorProgresoPasoValidator = v.object({
  key: v.string(),
  label: v.string(),
  estado: v.union(
    v.literal("completado"),
    v.literal("actual"),
    v.literal("omitida"),
    v.literal("pendiente")
  ),
});

export const cajaMenorProcesoIntervaloValidator = v.object({
  id: v.string(),
  origen: v.union(v.literal("facturacion"), v.literal("caja_menor")),
  intentoId: v.optional(v.string()),
  fase: v.string(),
  faseLabel: v.string(),
  rol: v.optional(v.string()),
  estado: v.union(
    v.literal("en_curso"),
    v.literal("completada"),
    v.literal("devuelta"),
    v.literal("rechazada"),
    v.literal("reasignada"),
    v.literal("anulada")
  ),
  responsableUserId: v.optional(v.string()),
  responsableNombre: v.string(),
  responsableEmail: v.optional(v.string()),
  inicioEn: v.number(),
  finEn: v.number(),
  duracionMs: v.number(),
  diasLaborales: v.number(),
  enCurso: v.boolean(),
  observacion: v.optional(v.string()),
});

export const cajaMenorProcesoValidator = v.object({
  aplica: v.literal(true),
  fasePublica: v.string(),
  fasePublicaLabel: v.string(),
  responsableActual: v.optional(cajaMenorProcesoOwnerValidator),
  intentoVigenteId: v.optional(v.string()),
  advertencia: v.optional(v.string()),
  pasosProgreso: v.array(cajaMenorProgresoPasoValidator),
  pasosBarraUnificada: v.array(cajaMenorProgresoPasoValidator),
  intervalos: v.array(cajaMenorProcesoIntervaloValidator),
  intentos: v.array(
    v.object({
      intentoId: v.string(),
      reembolsoId: v.string(),
      intervalos: v.array(cajaMenorProcesoIntervaloValidator),
    })
  ),
});

export function cajaMenorProcesoToTimingMovements(
  intervalos: CajaMenorProcesoIntervalo[],
  nowMs: number
) {
  return intervalos.map((intervalo) => ({
    id: intervalo.id,
    tipoIntervalo: "caja_menor" as const,
    esSintetico: false,
    fase: intervalo.fase,
    rol: intervalo.rol ?? null,
    estado: intervalo.estado,
    responsableUserId: intervalo.responsableUserId ?? null,
    responsableNombre: intervalo.responsableNombre,
    responsableEmail: intervalo.responsableEmail ?? null,
    procesoId: null,
    procesoNombre: null,
    inicioEn: intervalo.inicioEn,
    finEn: intervalo.enCurso ? nowMs : intervalo.finEn,
    duracionMs: intervalo.enCurso
      ? safeDuration(intervalo.inicioEn, nowMs)
      : intervalo.duracionMs,
    diasLaborales: intervalo.enCurso
      ? diffBusinessDaysBogota(intervalo.inicioEn, nowMs)
      : intervalo.diasLaborales,
    enCurso: intervalo.enCurso,
    comentario: intervalo.observacion ?? null,
  }));
}

export function cajaMenorOwnerToValidOwner(
  owner: CajaMenorProcesoOwner,
  fase: string,
  fechaAsignacion: number
) {
  return {
    userId: owner.userId,
    email: owner.email ?? (owner.esEquipo ? owner.email! : "sin-email@local"),
    nombre: owner.nombre,
    rol: owner.rol ?? "caja_menor",
    fase,
    fechaAsignacion,
    asignacionId: owner.esEquipo ? `equipo-${fase}` : `caja-menor-${fase}`,
  };
}
