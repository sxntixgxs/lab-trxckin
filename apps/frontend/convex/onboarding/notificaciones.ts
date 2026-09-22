import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { isConvexUnreachableUrl } from "../lib/convexOutboundUrl";
import { frontendUrl } from "../lib/env";
import { notificationHeaders } from "../notificationHttp";
import { moduloValidator } from "./validators";

/**
 * Referencia explícita: `internal.onboarding.tokens.issueForNotificacion` desde este módulo
 * crea una circularidad de tipos (el objeto `internal` incluye a este archivo).
 */
const issueForNotificacionRef = makeFunctionReference<
  "mutation",
  { modulo: "supplier" | "customer"; inscripcionId: string },
  string | null
>("onboarding/tokens:issueForNotificacion");

function endpoint(modulo: "supplier" | "customer"): string {
  return `${frontendUrl()}/api/notifications/onboarding/${modulo}`;
}

/**
 * Envío rastreado: emite el token del enlace y pide a Next que renderice y envíe el correo.
 * El token en claro solo existe en memoria de esta acción y en el cuerpo de la petición.
 */
export const enviarCorreoRastreado = internalAction({
  args: { correoId: v.id("onboardingCorreos") },
  returns: v.object({ ok: v.boolean(), error: v.optional(v.string()) }),
  handler: async (ctx, args) => {
    const base = frontendUrl();
    if (isConvexUnreachableUrl(base)) {
      const error = "FRONTEND_URL apunta a localhost; Convex Cloud no puede llamar a Next. Use un túnel para probar correos.";
      console.warn("[ONBOARDING_CORREOS]", error);
      await ctx.runMutation(internal.onboarding.correos.marcarFalloCorreo, { correoId: args.correoId, error });
      return { ok: false, error };
    }

    let issued: { token: string; modulo: "supplier" | "customer" };
    try {
      const result: { token: string; modulo: "supplier" | "customer" } = await ctx.runMutation(
        internal.onboarding.tokens.issueForEmail,
        { correoId: args.correoId },
      );
      issued = result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo emitir el enlace.";
      await ctx.runMutation(internal.onboarding.correos.marcarFalloCorreo, { correoId: args.correoId, error: message });
      return { ok: false, error: message };
    }

    try {
      const response = await fetch(endpoint(issued.modulo), {
        method: "POST",
        headers: notificationHeaders(),
        body: JSON.stringify({ kind: "tracked", correoId: args.correoId, token: issued.token }),
      });
      if (!response.ok) {
        const body = (await response.text()).slice(0, 500);
        const error = `Entrega HTTP ${response.status}${body ? `: ${body}` : ""}`;
        await ctx.runMutation(internal.onboarding.correos.marcarFalloCorreo, { correoId: args.correoId, error });
        return { ok: false, error: `HTTP ${response.status}` };
      }
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error de red";
      await ctx.runMutation(internal.onboarding.correos.marcarFalloCorreo, { correoId: args.correoId, error: message });
      return { ok: false, error: message };
    }
  },
});

/** Notificación no rastreada (avisos al tercero o al equipo interno). */
export const notificarEvento = internalAction({
  args: {
    modulo: moduloValidator,
    tipo: v.string(),
    inscripcionId: v.string(),
    empresa: v.number(),
    tercero: v.object({
      razonSocial: v.string(),
      tipoDocumento: v.string(),
      numeroDocumento: v.string(),
      tipoSolicitud: v.optional(v.union(v.literal("INSCRIPCIÓN"), v.literal("ACTUALIZACIÓN"))),
    }),
    destinatarios: v.array(v.object({ nombre: v.string(), email: v.string() })),
    datos: v.optional(v.any()),
    /** true cuando el destinatario es el tercero y el correo lleva enlace al formulario. */
    conEnlaceTercero: v.optional(v.boolean()),
  },
  returns: v.object({ ok: v.boolean(), error: v.optional(v.string()) }),
  handler: async (ctx, args) => {
    const base = frontendUrl();
    if (isConvexUnreachableUrl(base)) {
      console.warn("[ONBOARDING_NOTIFICACIONES] FRONTEND_URL apunta a localhost; el correo se omite.", args.tipo);
      return { ok: false, error: "FRONTEND_URL is localhost" };
    }
    let token: string | null = null;
    if (args.conEnlaceTercero) {
      token = await ctx.runMutation(issueForNotificacionRef, {
        modulo: args.modulo,
        inscripcionId: args.inscripcionId,
      });
    }
    try {
      const response = await fetch(endpoint(args.modulo), {
        method: "POST",
        headers: notificationHeaders(),
        body: JSON.stringify({
          kind: "untracked",
          tipo: args.tipo,
          inscripcionId: args.inscripcionId,
          empresa: args.empresa,
          tercero: args.tercero,
          destinatarios: args.destinatarios,
          token: token ?? undefined,
          datos: { ...(args.datos ?? {}), inscripcionId: args.inscripcionId, tipoSolicitud: args.tercero.tipoSolicitud },
        }),
      });
      if (!response.ok) {
        const text = (await response.text()).slice(0, 500);
        console.error("[ONBOARDING_NOTIFICACIONES] Error", response.status, args.tipo, text);
        return { ok: false, error: `HTTP ${response.status}` };
      }
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error de red";
      console.warn("[ONBOARDING_NOTIFICACIONES] No se pudo notificar:", args.tipo, message);
      return { ok: false, error: message };
    }
  },
});
