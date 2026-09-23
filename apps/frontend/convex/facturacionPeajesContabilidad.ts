import { v } from "convex/values";
import {
  query,
} from "./_generated/server";
import { facturaVisibleParaActor } from "./lib/facturacionAccess";

export const obtenerEstadoContableFactura = query({
  args: {
    facturaId: v.id("facturacionFacturas"),
  },
  handler: async (ctx, args) => {
    if (!(await facturaVisibleParaActor(ctx, args.facturaId))) return null;
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
