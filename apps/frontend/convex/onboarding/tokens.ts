import { v } from "convex/values";
import { internalMutation, mutation } from "../_generated/server";
import { buildPublicOnboardingUrl } from "../../lib/onboarding/links";
import { frontendUrl } from "../lib/env";
import { requireGestionInscripcion } from "../lib/onboarding/access";
import { requireInscripcion, resolveRef } from "../lib/onboarding/refs";
import { issueToken } from "../lib/onboarding/tokens";
import { moduloValidator, scopeValidator } from "./validators";

/** Programado por `issueToken` para materializar la expiración sin leer el reloj en queries. */
export const expireToken = internalMutation({
  args: { tokenId: v.id("onboardingAccessTokens") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("onboardingAccessTokens", args.tokenId);
    if (!row || row.revokedAt !== undefined) return null;
    const now = Date.now();
    if (now < row.expiresAt) return null;
    await ctx.db.patch("onboardingAccessTokens", row._id, { revokedAt: now, revokedReason: "EXPIRED" });
    return null;
  },
});

/** Emite (y rota) el token que viaja en un correo rastreado. El texto en claro solo vive en la acción. */
export const issueForEmail = internalMutation({
  args: { correoId: v.id("onboardingCorreos") },
  returns: v.object({
    token: v.string(),
    expiresAt: v.number(),
    scope: scopeValidator,
    modulo: moduloValidator,
    inscripcionId: v.string(),
  }),
  handler: async (ctx, args) => {
    const correo = await ctx.db.get("onboardingCorreos", args.correoId);
    if (!correo) throw new Error("Correo no encontrado.");
    const ref =
      correo.modulo === "supplier"
        ? ({ modulo: "supplier", inscripcionId: correo.inscripcionId } as const)
        : ({ modulo: "customer", inscripcionId: correo.inscripcionId } as const);
    // Un reenvío (posible corrección de correo) o una restauración de fase invalidan enlaces previos.
    const rotate = correo.origen === "REENVIO" || correo.origen === "RESTAURACION_FASE";
    const issued = await issueToken(ctx, { ...ref, scope: correo.handoff, correoId: correo._id, rotate });
    await ctx.db.patch("onboardingCorreos", correo._id, { tokenId: issued.tokenId });
    return {
      token: issued.token,
      expiresAt: issued.expiresAt,
      scope: correo.handoff,
      modulo: correo.modulo,
      inscripcionId: correo.inscripcionId,
    };
  },
});

/** Token de formulario para el CTA de una notificación no rastreada al tercero (no rota). */
export const issueForNotificacion = internalMutation({
  args: { modulo: moduloValidator, inscripcionId: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const ref = resolveRef(ctx, args.modulo, args.inscripcionId);
    const ins = await requireInscripcion(ctx, ref);
    if (ins.faseActual === "ANULADA") return null;
    const issued = await issueToken(ctx, { ...ref, scope: "FORM" });
    return issued.token;
  },
});

/** Fases en las que el tercero usa cada enlace (las mismas que admite el reenvío). */
const FASES_ENLACE: Record<"FORM" | "SIGN", readonly string[]> = {
  FORM: ["II_PENDIENTE_FORMULARIO", "III_REVISION_DOCUMENTAL"],
  SIGN: ["IIA_PENDIENTE_FIRMA"],
};

/**
 * "Copiar enlace" desde la UI interna. Emite un token nuevo (rota los anteriores del mismo
 * alcance, salvo los de solo lectura) y devuelve la URL pública una única vez.
 */
export const emitirEnlaceAcceso = mutation({
  args: {
    modulo: moduloValidator,
    inscripcionId: v.string(),
    scope: scopeValidator,
    viewOnly: v.optional(v.boolean()),
  },
  returns: v.object({ url: v.string(), expiresAt: v.number() }),
  handler: async (ctx, args) => {
    const ref = resolveRef(ctx, args.modulo, args.inscripcionId);
    const ins = await requireInscripcion(ctx, ref);
    const actor = await requireGestionInscripcion(ctx, args.modulo, ins);

    if (ins.faseActual === "ANULADA") throw new Error("La inscripción está anulada.");
    if (!args.viewOnly && !FASES_ENLACE[args.scope].includes(ins.faseActual)) {
      throw new Error(
        args.scope === "SIGN"
          ? "El enlace de firma solo está disponible mientras el formulario esté pendiente de firma."
          : "El enlace del formulario solo está disponible mientras el tercero diligencia o corrige el formulario.",
      );
    }

    // Copiar un enlace nuevo invalida los anteriores del mismo paso (como el reenvío); los
    // enlaces de solo lectura no rotan (issueToken ignora `rotate` para ellos).
    const issued = await issueToken(ctx, {
      ...ref,
      scope: args.scope,
      issuedByUserId: actor.usuarioId,
      viewOnly: args.viewOnly === true,
      rotate: true,
    });
    const url = buildPublicOnboardingUrl(frontendUrl(), {
      modulo: args.modulo,
      scope: args.scope,
      inscripcionId: ref.inscripcionId,
      token: issued.token,
    });
    return { url, expiresAt: issued.expiresAt };
  },
});
