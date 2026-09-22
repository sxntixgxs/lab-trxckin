import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { isConvexUnreachableUrl } from "./lib/convexOutboundUrl";
import { notificationHeaders } from "./notificationHttp";
import { frontendUrl } from "./lib/env";

const FRONTEND_URL = frontendUrl();

const destinatarioValidator = v.object({
  usuarioId: v.optional(v.string()),
  nombre: v.string(),
  email: v.string(),
});

export const enviarNotificacion = internalAction({
  args: {
    destinatarios: v.array(destinatarioValidator),
    fase: v.string(),
    facturaId: v.string(),
    tareaId: v.optional(v.string()),
    empresa: v.optional(v.number()),
    facturaNumero: v.string(),
    proveedorNombre: v.string(),
    proveedorNit: v.optional(v.string()),
    total: v.number(),
    moneda: v.string(),
    fechaEmision: v.string(),
    fechaVencimiento: v.optional(v.string()),
    comentario: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    if (isConvexUnreachableUrl(FRONTEND_URL)) {
      console.warn(
        "[FACTURACION_NOTIFICACIONES] FRONTEND_URL apunta a localhost; Convex Cloud no puede llamar a Next. El email se omite.",
      );
      return { success: false, error: "FRONTEND_URL is localhost" };
    }

    try {
      const response = await fetch(`${FRONTEND_URL}/api/notifications/billing`, {
        method: "POST",
        headers: notificationHeaders(),
        body: JSON.stringify(args),
      });

      if (!response.ok) {
        console.error("[FACTURACION_NOTIFICACIONES] Error HTTP:", response.status);
        return { success: false, error: `HTTP ${response.status}` };
      }

      const result = await response.json().catch(() => ({ success: true }));
      return { success: true, ...result };
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Error desconocido enviando email";
      console.error("[FACTURACION_NOTIFICACIONES] Error:", message);
      return { success: false, error: message };
    }
  },
});
