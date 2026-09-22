import { v } from "convex/values";
import {
  query,
} from "./_generated/server";

export const obtenerEstadoContableFactura = query({
  args: {
    facturaId: v.id("facturacionFacturas"),
  },
  handler: async (ctx, args) => {
    const proyeccion = await ctx.db
      .query("facturacionPeajesContabilidad")
      .withIndex("by_facturaId", (q) => q.eq("facturaId", args.facturaId))
      .unique();
    if (!proyeccion) return null;
    return {
      estado: proyeccion.estado,
      operacionId: proyeccion.operacionId,
      ultimaContabilizacion: proyeccion.ultimaContabilizacion ?? null,
      cruceAplicadoEn: proyeccion.cruceAplicadoEn,
    };
  },
});
