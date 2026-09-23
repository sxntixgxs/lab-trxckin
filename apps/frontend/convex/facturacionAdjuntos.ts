import { v } from "convex/values";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireActor } from "./lib/billingAuth";
import {
  actorPuedeVerFactura,
  actorPuedeVerFacturaCajaMenor,
  actorTieneAsignacionPendiente,
} from "./lib/facturacionAccess";
import { normalizeEmail } from "./lib/normalize";

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
    const actor = await requireActor(ctx);
    const factura = await ctx.db.get("facturacionFacturas", args.facturaId);
    if (!factura || !(await actorPuedeVerFactura(ctx, actor, factura))) {
      return [];
    }

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

/** Used by the petty cash reimbursement dialogs; invoices the caller cannot see come back empty. */
export const listarPorFacturas = query({
  args: { facturaIds: v.array(v.id("facturacionFacturas")) },
  handler: async (
    ctx: QueryCtx,
    args: ListarPorFacturasArgs,
  ): Promise<AdjuntosPorFactura[]> => {
    const actor = await requireActor(ctx);
    const facturaIds = [...new Set(args.facturaIds)];
    return await Promise.all(
      facturaIds.map(async (facturaId) => {
        const factura = await ctx.db.get("facturacionFacturas", facturaId);
        const visible =
          factura !== null &&
          ((await actorPuedeVerFacturaCajaMenor(ctx, actor, factura)) ||
            (await actorPuedeVerFactura(ctx, actor, factura)));
        if (!visible) return { facturaId, adjuntos: [] };

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

/**
 * Support files are added from the inbox by whoever is working the invoice (a pending
 * assignment on it) or by a full-access user. The uploader comes from the caller's identity;
 * the `subidoPor*` args are still accepted for compatibility but ignored.
 */
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
    const actor = await requireActor(ctx);
    const factura = await ctx.db.get("facturacionFacturas", args.facturaId);
    if (!factura) throw new Error("Factura no encontrada");
    if (args.asignacionId) {
      const asignacion = await ctx.db.get("facturacionAsignaciones", args.asignacionId);
      if (!asignacion || asignacion.facturaId !== args.facturaId) {
        throw new Error("La asignación no corresponde a esta factura.");
      }
    }
    if (!actor.hasFullAccess && !(await actorTieneAsignacionPendiente(ctx, actor, args.facturaId))) {
      throw new Error("No tienes asignada esta factura.");
    }
    if (!(await ctx.db.system.get("_storage", args.storageId))) {
      throw new Error("Archivo no encontrado.");
    }

    const subidoPorEmail = normalizeEmail(actor.email);
    const id = await ctx.db.insert("facturacionAdjuntos", {
      facturaId: args.facturaId,
      empresa: factura.empresa ?? 1,
      ...(args.asignacionId ? { asignacionId: args.asignacionId } : {}),
      storageId: args.storageId,
      nombre: args.nombre,
      ...(args.mimeType ? { mimeType: args.mimeType } : {}),
      ...(typeof args.size === "number" ? { size: args.size } : {}),
      subidoPorUserId: actor.usuarioId,
      subidoPorNombre: actor.nombre,
      subidoPorEmail,
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
        actorUserId: actor.usuarioId,
        actorNombre: actor.nombre,
        actorEmail: subidoPorEmail,
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

/** The uploader, anyone currently working the invoice, or a full-access user may delete. */
export const eliminar = mutation({
  args: {
    adjuntoId: v.id("facturacionAdjuntos"),
  },
  handler: async (
    ctx: MutationCtx,
    args: EliminarAdjuntoArgs,
  ): Promise<null> => {
    const actor = await requireActor(ctx);
    const adjunto = await ctx.db.get("facturacionAdjuntos", args.adjuntoId);
    if (!adjunto) throw new Error("Adjunto no encontrado");

    const esAutor =
      (adjunto.subidoPorUserId !== undefined && adjunto.subidoPorUserId === actor.usuarioId) ||
      (normalizeEmail(actor.email) !== "" &&
        normalizeEmail(adjunto.subidoPorEmail) === normalizeEmail(actor.email));
    if (
      !actor.hasFullAccess &&
      !esAutor &&
      !(await actorTieneAsignacionPendiente(ctx, actor, adjunto.facturaId))
    ) {
      throw new Error("No puedes eliminar este adjunto.");
    }

    try {
      await ctx.storage.delete(adjunto.storageId);
    } catch {
      // El blob puede haber sido eliminado previamente; continuamos con el borrado lógico.
    }

    await ctx.db.delete("facturacionAdjuntos", args.adjuntoId);
    return null;
  },
});
