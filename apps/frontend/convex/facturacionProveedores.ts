"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { isConvexUnreachableUrl } from "./lib/convexOutboundUrl";

export const upsertDesdeFactura = internalAction({
  args: {
    nit: v.string(),
    nombre: v.string(),
    email: v.optional(v.string()),
    telefono: v.optional(v.string()),
    direccion: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (_ctx, args) => {
    const backendUrl = process.env.BACKEND_URL?.replace(/\/$/, "");
    const internalKey = process.env.NEST_INTERNAL_KEY;
    if (!backendUrl || !internalKey || !args.nit.trim()) {
      return null;
    }

    if (isConvexUnreachableUrl(backendUrl)) {
      console.warn(
        "[FACTURACION_PROVEEDORES] BACKEND_URL apunta a localhost; Convex Cloud no puede llegar a Nest. El upsert se omite.",
      );
      return null;
    }

    try {
      const response = await fetch(`${backendUrl}/api/v1/proveedores/upsert-from-invoice`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-key": internalKey,
        },
        body: JSON.stringify({
          nit: args.nit,
          nombre: args.nombre,
          email: args.email,
          telefono: args.telefono,
          direccion: args.direccion,
        }),
      });

      if (!response.ok) {
        console.error(
          "[FACTURACION_PROVEEDORES] upsert failed",
          response.status,
          await response.text().catch(() => ""),
        );
      }
    } catch (error) {
      console.error("[FACTURACION_PROVEEDORES] upsert failed", error);
    }
    return null;
  },
});
