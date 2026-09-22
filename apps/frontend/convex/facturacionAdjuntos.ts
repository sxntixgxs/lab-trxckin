import { v } from "convex/values";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

type AdjuntoConUrl = Doc<"facturacionAdjuntos"> & { url: string | null };

type ListarPorFacturaArgs = {
  facturaId: Id<"facturacionFacturas">;
};

type ListarPorFacturasArgs = {
  facturaIds: Array<Id<"facturacionFacturas">>;
};

type AdjuntosPorFactura = {
  facturaId: Id<"facturacionFacturas">;
  adjuntos: AdjuntoConUrl[];
};

type CrearAdjuntoArgs = {
  facturaId: Id<"facturacionFacturas">;
  asignacionId?: Id<"facturacionAsignaciones">;
  storageId: Id<"_storage">;
  nombre: string;
  mimeType?: string;
  size?: number;
  subidoPorUserId?: string;
  subidoPorNombre: string;
  subidoPorEmail: string;
};

type EliminarAdjuntoArgs = {
  adjuntoId: Id<"facturacionAdjuntos">;
};

export const listarPorFactura = query({
  args: { facturaId: v.id("facturacionFacturas") },
  handler: async (
    ctx: QueryCtx,
    args: ListarPorFacturaArgs,
  ): Promise<AdjuntoConUrl[]> => {
    const adjuntos = await ctx.db
      .query("facturacionAdjuntos")
      .withIndex("by_facturaId", (q) => q.eq("facturaId", args.facturaId))
      .order("desc")
      .collect();

    return await Promise.all(
      adjuntos.map(async (adjunto) => ({
        ...adjunto,
        url: await ctx.storage.getUrl(adjunto.storageId),
      })),
    );
  },
});

export const listarPorFacturas = query({
  args: { facturaIds: v.array(v.id("facturacionFacturas")) },
  handler: async (
    ctx: QueryCtx,
    args: ListarPorFacturasArgs,
  ): Promise<AdjuntosPorFactura[]> => {
    const facturaIds = [...new Set(args.facturaIds)];
    return await Promise.all(
      facturaIds.map(async (facturaId) => {
        const adjuntos = await ctx.db
          .query("facturacionAdjuntos")
          .withIndex("by_facturaId", (q) => q.eq("facturaId", facturaId))
          .order("desc")
          .take(50);
        return {
          facturaId,
          adjuntos: await Promise.all(
            adjuntos.map(async (adjunto) => ({
              ...adjunto,
              url: await ctx.storage.getUrl(adjunto.storageId),
            })),
          ),
        };
      }),
    );
  },
});

export const crear = mutation({
  args: {
    facturaId: v.id("facturacionFacturas"),
    asignacionId: v.optional(v.id("facturacionAsignaciones")),
    storageId: v.id("_storage"),
    nombre: v.string(),
    mimeType: v.optional(v.string()),
    size: v.optional(v.number()),
    subidoPorUserId: v.optional(v.string()),
    subidoPorNombre: v.string(),
    subidoPorEmail: v.string(),
  },
  handler: async (
    ctx: MutationCtx,
    args: CrearAdjuntoArgs,
  ): Promise<Id<"facturacionAdjuntos">> => {
    const factura = await ctx.db.get("facturacionFacturas", args.facturaId);
    if (!factura) throw new Error("Factura no encontrada");

    const id = await ctx.db.insert("facturacionAdjuntos", {
      facturaId: args.facturaId,
      empresa: factura.empresa ?? 1,
      ...(args.asignacionId ? { asignacionId: args.asignacionId } : {}),
      storageId: args.storageId,
      nombre: args.nombre,
      ...(args.mimeType ? { mimeType: args.mimeType } : {}),
      ...(typeof args.size === "number" ? { size: args.size } : {}),
      ...(args.subidoPorUserId ? { subidoPorUserId: args.subidoPorUserId } : {}),
      subidoPorNombre: args.subidoPorNombre,
      subidoPorEmail: args.subidoPorEmail.toLowerCase(),
      creadoEn: Date.now(),
    });

    const tarea = await ctx.db
      .query("facturacionTareas")
      .withIndex("by_facturaId", (q) => q.eq("facturaId", args.facturaId))
      .first();
    if (tarea) {
      await ctx.db.insert("facturacionAprobaciones", {
        tareaId: tarea._id,
        facturaId: args.facturaId,
        ...(args.asignacionId ? { asignacionId: args.asignacionId } : {}),
        empresa: factura.empresa ?? 1,
        ...(args.subidoPorUserId ? { actorUserId: args.subidoPorUserId } : {}),
        actorNombre: args.subidoPorNombre,
        actorEmail: args.subidoPorEmail.toLowerCase(),
        accion: "adjuntar",
        comentario: `Adjuntó ${args.nombre}`,
        estadoAnterior: tarea.estado,
        estadoNuevo: tarea.estado,
        creadoEn: Date.now(),
      });
    }

    return id;
  },
});

export const eliminar = mutation({
  args: {
    adjuntoId: v.id("facturacionAdjuntos"),
  },
  handler: async (
    ctx: MutationCtx,
    args: EliminarAdjuntoArgs,
  ): Promise<null> => {
    const adjunto = await ctx.db.get("facturacionAdjuntos", args.adjuntoId);
    if (!adjunto) throw new Error("Adjunto no encontrado");

    try {
      await ctx.storage.delete(adjunto.storageId);
    } catch {
      // El blob puede haber sido eliminado previamente; continuamos con el borrado lógico.
    }

    await ctx.db.delete("facturacionAdjuntos", args.adjuntoId);
    return null;
  },
});
