import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { isConvexUnreachableUrl } from "./lib/convexOutboundUrl";
import { notificationHeaders } from "./notificationHttp";
import { frontendUrl } from "./lib/env";

const FRONTEND_URL = frontendUrl();

export const enviarNotificacionAnticipo = internalAction({
  args: {
    destinatarios: v.array(
      v.object({
        usuarioId: v.optional(v.string()),
        nombre: v.string(),
        email: v.optional(v.string()),
      })
    ),
    evento: v.string(),
    anticipoId: v.string(),
    consecutivo: v.number(),
    empresa: v.optional(v.number()),
    razonSocial: v.string(),
    nit: v.string(),
    valor: v.number(),
    valorLegalizable: v.optional(v.number()),
    saldoPendiente: v.number(),
    maxLegalizacionDate: v.number(),
    faseActual: v.string(),
    comentario: v.optional(v.string()),
    faseDestino: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    if (isConvexUnreachableUrl(FRONTEND_URL)) {
      console.warn(
        "[ANTICIPOS_NOTIFICACIONES] FRONTEND_URL apunta a localhost; Convex Cloud no puede llamar a Next. El email se omite."
      );
      return { success: false, error: "FRONTEND_URL is localhost" };
    }

    const url = `${FRONTEND_URL}/api/notifications/advances`;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: notificationHeaders(),
        body: JSON.stringify(args),
      });
      const rawBody = await response.text();
      let result: { success?: boolean; error?: string } = {};
      if (rawBody) {
        try {
          result = JSON.parse(rawBody) as { success?: boolean; error?: string };
        } catch {
          result = {};
        }
      }

      if (!response.ok || result.success === false) {
        console.error("[ANTICIPOS_NOTIFICACIONES] Error enviando correo", {
          status: response.status,
          evento: args.evento,
          error: result.error ?? rawBody.slice(0, 500),
        });
        return {
          success: false,
          error: result.error ?? `HTTP ${response.status}`,
        };
      }

      return { success: true, ...result };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Error desconocido enviando email";
      console.error("[ANTICIPOS_NOTIFICACIONES] Error:", message, "url:", url);
      return { success: false, error: message };
    }
  },
});
