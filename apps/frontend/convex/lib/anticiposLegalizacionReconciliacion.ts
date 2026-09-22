import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { refreshAnticipoDashboardProjection } from "./anticiposDashboardProjection";
import { scheduleAnticipoPhaseNotification } from "./anticiposNotifications";
import { fromMoneyCents, moneyGreaterThanOrEqual, toMoneyCents } from "./money";
import {
  getSaldoLegalizadoAnticipo,
  getValorLegalizableAnticipo,
} from "./valorLegalizableAnticipo";

function getResponsableLegalizacionAnticipo(anticipo: Doc<"anticipos">) {
  return anticipo.responsableUserId || anticipo.createdById;
}

async function asegurarFaseLegalizacionAnticipo(
  ctx: MutationCtx,
  anticipo: Doc<"anticipos">,
  saldoLegalizado: number,
  actorUserId: string,
  now: number,
  observaciones?: string
) {
  const valorLegalizable = getValorLegalizableAnticipo(anticipo);
  const fase = await ctx.db
    .query("anticiposFases")
    .withIndex("by_anticipoId_fase", (q) =>
      q.eq("anticipoId", anticipo._id).eq("fase", "V_PENDIENTE_LEGALIZACION")
    )
    .first();
  const completado = moneyGreaterThanOrEqual(saldoLegalizado, valorLegalizable);

  if (fase) {
    await ctx.db.patch("anticiposFases", fase._id, {
      estado: completado ? "COMPLETADO" : "EN_PROGRESO",
      asignadoA: getResponsableLegalizacionAnticipo(anticipo),
      ...(fase.fechaInicio ? {} : { fechaInicio: now }),
      fechaCompletado: completado ? now : undefined,
      completadoPor: completado ? actorUserId : undefined,
      observaciones: observaciones?.trim() || fase.observaciones,
      payload: completado ? { origen: "facturacion", saldoLegalizado } : undefined,
    });
    return;
  }

  await ctx.db.insert("anticiposFases", {
    anticipoId: anticipo._id,
    fase: "V_PENDIENTE_LEGALIZACION",
    estado: completado ? "COMPLETADO" : "EN_PROGRESO",
    asignadoA: getResponsableLegalizacionAnticipo(anticipo),
    fechaInicio: now,
    fechaCompletado: completado ? now : undefined,
    completadoPor: completado ? actorUserId : undefined,
    observaciones: observaciones?.trim() || undefined,
    payload: completado ? { origen: "facturacion", saldoLegalizado } : undefined,
  });
}

export async function reconciliarEstadoLegalizacionAnticipo(
  ctx: MutationCtx,
  anticipo: Doc<"anticipos">,
  saldoLegalizadoInput: number,
  actorUserId: string,
  now: number,
  options?: {
    legalizacion?: Doc<"anticipos">["legalizacion"];
    observaciones?: string;
    skipNotification?: boolean;
  }
) {
  const valorLegalizable = getValorLegalizableAnticipo(anticipo);
  const saldo = fromMoneyCents(
    Math.max(0, Math.min(toMoneyCents(saldoLegalizadoInput), toMoneyCents(valorLegalizable)))
  );
  const faseDestino: "COMPLETADO" | "V_PENDIENTE_LEGALIZACION" = moneyGreaterThanOrEqual(saldo, valorLegalizable)
    ? "COMPLETADO"
    : "V_PENDIENTE_LEGALIZACION";
  const faseCambio = anticipo.faseActual !== faseDestino;

  await asegurarFaseLegalizacionAnticipo(
    ctx,
    anticipo,
    saldo,
    actorUserId,
    now,
    options?.observaciones
  );

  const patch: Partial<Doc<"anticipos">> = {
    saldoLegalizado: saldo,
    faseActual: faseDestino,
    updatedAt: now,
  };
  if (anticipo.tipoBolsa !== "peajes" && options?.legalizacion !== undefined) {
    patch.legalizacion = options.legalizacion;
  }
  await ctx.db.patch("anticipos", anticipo._id, patch);
  await refreshAnticipoDashboardProjection(ctx, anticipo._id, now);

  if (faseCambio && !options?.skipNotification) {
    const actualizado = await ctx.db.get("anticipos", anticipo._id);
    if (actualizado) {
      await scheduleAnticipoPhaseNotification(
        ctx,
        actualizado,
        faseDestino === "COMPLETADO" ? "VI_LEGALIZADO" : "V_PENDIENTE_LEGALIZACION",
        options?.observaciones
      );
    }
  }

  return { faseDestino, saldo, faseCambio };
}

export async function reconciliarEstadoTrasAjusteValorLegalizable(
  ctx: MutationCtx,
  anticipo: Doc<"anticipos">,
  actorUserId: string,
  now: number,
  observaciones?: string
) {
  const saldo = getSaldoLegalizadoAnticipo(anticipo);
  return await reconciliarEstadoLegalizacionAnticipo(ctx, anticipo, saldo, actorUserId, now, {
    observaciones,
    skipNotification: true,
  });
}
