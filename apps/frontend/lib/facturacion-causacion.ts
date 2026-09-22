import type { Id } from "@/convex/_generated/dataModel";
import {
  deriveCausacionEstado,
  formatCausacionEstadoExport,
  formatCausacionEstadoLabel,
  normalizeNumeroFp,
  type CausacionEstado,
  type CausacionMotivoSoloLectura,
} from "@/convex/lib/facturacionCausacion";

export {
  deriveCausacionEstado,
  formatCausacionEstadoExport,
  formatCausacionEstadoLabel,
  type CausacionEstado,
  type CausacionMotivoSoloLectura,
};

export type CausacionContexto =
  | { tipo: "flujo_factura" }
  | {
      tipo: "reembolso_caja_menor";
      reembolsoId: Id<"cajasMenoresReembolsos">;
      movimientoId: Id<"facturacionCajaMenorMovimientos">;
    };

export type CausacionAuditEvent = {
  id: Id<"facturacionAprobaciones">;
  creadoEn: number;
  actorUserId: string | null;
  actorNombre: string | null;
  actorEmail: string | null;
  comentario: string;
  causacionCambio: {
    causadoAnterior: boolean | null;
    causadoNuevo: boolean;
    numeroFpAnterior: string | null;
    numeroFpNuevo: string | null;
    motivoCambio: string | null;
    versionAnterior: number;
    versionNueva: number;
    contexto: "flujo_factura" | "reembolso_caja_menor";
    faseOperativa: string;
    reembolsoId?: Id<"cajasMenoresReembolsos">;
    movimientoId?: Id<"facturacionCajaMenorMovimientos">;
  } | null;
};

export type CausacionSnapshot = {
  facturaId: Id<"facturacionFacturas">;
  estado: CausacionEstado;
  causado: boolean | null;
  numeroFp: string | null;
  version: number;
  actualizadoEn: number | null;
  actualizadoPor: {
    userId: string | null;
    nombre: string;
    email: string;
  } | null;
  faseOperativa: string | null;
  puedeEditar: boolean;
  motivoSoloLectura: CausacionMotivoSoloLectura | null;
  historial: {
    page: CausacionAuditEvent[];
    isDone: boolean;
    continueCursor: string | null;
  };
};

export type CausacionDraft = {
  causado: boolean;
  numeroFp: string;
  motivoCambio: string;
};

export function formatFpDisplay(
  causado: boolean | null | undefined,
  numeroFp?: string | null
): string {
  if (causado === undefined || causado === null) return "Sin registrar";
  if (!causado) return "No aplica";
  const trimmed = numeroFp?.trim();
  return trimmed ? trimmed : "Sin registrar";
}

export function requiresMotivoCambio(
  causadoAnterior: boolean | null,
  causadoNuevo: boolean,
  fpAnterior: string | null,
  fpNuevoDraft: string
): boolean {
  if (!causadoNuevo) {
    return causadoAnterior === true || causadoAnterior === null;
  }
  const fpNuevo = normalizeNumeroFp(fpNuevoDraft);
  return (
    causadoAnterior === true &&
    fpAnterior != null &&
    fpNuevo != null &&
    fpAnterior !== fpNuevo
  );
}

export function isCausacionDraftNoOp(
  snapshot: Pick<CausacionSnapshot, "causado" | "numeroFp">,
  draft: Pick<CausacionDraft, "causado" | "numeroFp">
): boolean {
  const causadoAnterior = snapshot.causado;
  const numeroFpAnterior =
    snapshot.causado === true ? normalizeNumeroFp(snapshot.numeroFp) : null;

  if (draft.causado) {
    const numeroFpNuevo = normalizeNumeroFp(draft.numeroFp);
    return (
      causadoAnterior === true &&
      numeroFpAnterior != null &&
      numeroFpNuevo != null &&
      numeroFpAnterior === numeroFpNuevo
    );
  }

  return causadoAnterior === false;
}

export function isCausacionDraftDirty(
  snapshot: Pick<CausacionSnapshot, "causado" | "numeroFp">,
  draft: Pick<CausacionDraft, "causado" | "numeroFp" | "motivoCambio">
): boolean {
  if (isCausacionDraftNoOp(snapshot, draft)) {
    return draft.motivoCambio.trim().length > 0;
  }
  const snapshotCausado = snapshot.causado === true;
  if (draft.causado !== snapshotCausado) return true;
  if (!draft.causado) return false;
  const snapshotFp = snapshot.causado === true ? (snapshot.numeroFp ?? "").trim() : "";
  return draft.numeroFp.trim() !== snapshotFp;
}

export function buildCausacionQueryParams(
  contexto: CausacionContexto,
  historialCursor?: string | null
): string {
  const params = new URLSearchParams();
  if (contexto.tipo === "reembolso_caja_menor") {
    params.set("contextoTipo", "reembolso_caja_menor");
    params.set("reembolsoId", contexto.reembolsoId);
    params.set("movimientoId", contexto.movimientoId);
  } else {
    params.set("contextoTipo", "flujo_factura");
  }
  if (historialCursor) params.set("historialCursor", historialCursor);
  return params.toString();
}

export function formatMotivoSoloLectura(
  motivo: CausacionMotivoSoloLectura | null | undefined
): string {
  switch (motivo) {
    case "fase_no_habilitada":
      return "La causación no está habilitada en esta fase.";
    case "no_asignado":
      return "Solo el responsable asignado puede editar la causación.";
    case "sin_workflow":
      return "La factura no tiene un flujo activo para editar causación.";
    case "peajes_solo_consulta":
      return "En peajes la causación es solo consulta.";
    default:
      return "La causación está en solo lectura.";
  }
}

export function getCausacionEstadoTone(estado: CausacionEstado): {
  badgeClass: string;
  dotClass: string;
} {
  switch (estado) {
    case "causado":
      return {
        badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-800",
        dotClass: "bg-emerald-500",
      };
    case "no_causado":
      return {
        badgeClass: "border-amber-200 bg-amber-50 text-amber-800",
        dotClass: "bg-amber-500",
      };
    default:
      return {
        badgeClass: "border-slate-200 bg-slate-50 text-slate-600",
        dotClass: "bg-slate-400",
      };
  }
}
