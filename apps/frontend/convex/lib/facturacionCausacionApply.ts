import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import {
  getCausacionVersion,
  normalizeNumeroFp,
  resolveCausacionTransition,
} from "./facturacionCausacion";
import { refrescarProyeccionFactura } from "./facturacionDashboardProjection";

export const causacionActionValidator = v.object({
  expectedVersion: v.optional(v.number()),
  causado: v.boolean(),
  numeroFp: v.optional(v.string()),
});

export type CausacionActionInput = {
  expectedVersion?: number;
  causado: boolean;
  numeroFp?: string;
};

export type CausacionApplyContext =
  | { tipo: "flujo_factura" }
  | {
      tipo: "reembolso_caja_menor";
      reembolsoId: Id<"cajasMenoresReembolsos">;
      movimientoId: Id<"facturacionCajaMenorMovimientos">;
    };

const FASES_FLUJO_CASACION = new Set(["causacion", "revision_impuestos", "eventos_dian"]);
const FASES_REEMBOLSO_CASACION = new Set([
  "pendiente_revision",
  "pendiente_revision_impuestos",
  "pendiente_eventos_dian",
]);

export async function aplicarCausacionEnFactura(
  ctx: MutationCtx,
  args: {
    factura: Doc<"facturacionFacturas">;
    input?: CausacionActionInput;
    actor: { userId: string; nombre: string; email: string };
    contexto: CausacionApplyContext;
    faseOperativa: string;
    now?: number;
  }
): Promise<NonNullable<Doc<"facturacionAprobaciones">["causacionCambio"]> | undefined> {
  if (!args.input) return undefined;

  const fasesPermitidas =
    args.contexto.tipo === "flujo_factura" ? FASES_FLUJO_CASACION : FASES_REEMBOLSO_CASACION;
  if (!fasesPermitidas.has(args.faseOperativa)) {
    throw new Error("La causación no está habilitada en esta fase.");
  }

  const versionActual = getCausacionVersion(args.factura);
  if (args.input.expectedVersion !== undefined && args.input.expectedVersion !== versionActual) {
    throw new Error(
      "La causación cambió desde que abriste el formulario. Actualiza e intenta de nuevo."
    );
  }

  const causadoAnterior = args.factura.causado === undefined ? null : args.factura.causado;
  const numeroFpAnterior =
    args.factura.causado === true ? normalizeNumeroFp(args.factura.numeroFp) : null;
  const transition = resolveCausacionTransition({
    causadoAnterior,
    numeroFpAnterior,
    causadoNuevo: args.input.causado,
    numeroFpNuevo: args.input.numeroFp,
    requireMotivoCambio: false,
  });

  if (transition.isNoOp) return undefined;

  const now = args.now ?? Date.now();
  await ctx.db.patch("facturacionFacturas", args.factura._id, {
    causado: transition.causadoNuevo,
    numeroFp: transition.causadoNuevo ? (transition.numeroFpNuevo ?? undefined) : undefined,
    causacionVersion: versionActual + 1,
    causacionActualizadaEn: now,
    causacionActualizadaPorUserId: args.actor.userId,
    causacionActualizadaPorNombre: args.actor.nombre,
    causacionActualizadaPorEmail: args.actor.email,
    actualizadoEn: now,
  });
  await refrescarProyeccionFactura(ctx, args.factura._id, now);

  return {
    causadoAnterior,
    causadoNuevo: transition.causadoNuevo,
    numeroFpAnterior,
    numeroFpNuevo: transition.numeroFpNuevo,
    motivoCambio: null,
    versionAnterior: versionActual,
    versionNueva: versionActual + 1,
    contexto: args.contexto.tipo,
    faseOperativa: args.faseOperativa,
    ...(args.contexto.tipo === "reembolso_caja_menor"
      ? {
          reembolsoId: args.contexto.reembolsoId,
          movimientoId: args.contexto.movimientoId,
        }
      : {}),
  };
}
