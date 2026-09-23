import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  query,
} from "./_generated/server";
import { RUTAS_SISTEMA } from "../lib/rutas-sistema";
import { empresasVisibles, requirePermisoEmpresa } from "./lib/billingAuth";

const adjuntoValidator = v.object({
  graphAttachmentId: v.string(),
  storageId: v.id("_storage"),
  name: v.string(),
  contentType: v.optional(v.union(v.string(), v.null())),
  size: v.optional(v.union(v.number(), v.null())),
  isInline: v.boolean(),
});

const estadoAdjuntosValidator = v.union(
  v.literal("none"),
  v.literal("pending"),
  v.literal("complete"),
  v.literal("partial"),
  v.literal("failed"),
  v.literal("skipped"),
);

export const listar = query({
  args: {
    empresa: v.optional(v.number()),
    limit: v.optional(v.number()),
    procesado: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const actor = await requirePermisoEmpresa(
      ctx,
      RUTAS_SISTEMA.FACTURACION_CORREOS,
      args.empresa,
    );
    const procesado = args.procesado;
    const empresa = args.empresa;
    const visibles = empresasVisibles(actor);

    if (typeof empresa !== "number" && visibles !== "todas") {
      // Company-scoped users read each of their mailboxes through the company index.
      const limit = args.limit ?? 100;
      const porEmpresa = await Promise.all(
        visibles.map((empresaVisible) =>
          procesado !== undefined
            ? ctx.db
                .query("facturacionCorreos")
                .withIndex("by_empresa_procesado", (q) =>
                  q.eq("empresa", empresaVisible).eq("procesado", procesado),
                )
                .order("desc")
                .take(limit)
            : ctx.db
                .query("facturacionCorreos")
                .withIndex("by_empresa", (q) => q.eq("empresa", empresaVisible))
                .order("desc")
                .take(limit),
        ),
      );
      return porEmpresa
        .flat()
        .sort((a, b) => b._creationTime - a._creationTime)
        .slice(0, limit);
    }

    if (typeof empresa === "number" && procesado !== undefined) {
      return await ctx.db
        .query("facturacionCorreos")
        .withIndex("by_empresa_procesado", (q) =>
          q.eq("empresa", empresa).eq("procesado", procesado),
        )
        .order("desc")
        .take(args.limit ?? 100);
    }

    if (typeof empresa === "number") {
      return await ctx.db
        .query("facturacionCorreos")
        .withIndex("by_empresa", (q) => q.eq("empresa", empresa))
        .order("desc")
        .take(args.limit ?? 100);
    }

    if (procesado !== undefined) {
      return await ctx.db
        .query("facturacionCorreos")
        .withIndex("by_procesado", (q) => q.eq("procesado", procesado))
        .order("desc")
        .take(args.limit ?? 100);
    }

    return await ctx.db
      .query("facturacionCorreos")
      .order("desc")
      .take(args.limit ?? 100);
  },
});

export const getByIdInterno = internalQuery({
  args: { correoId: v.id("facturacionCorreos") },
  handler: async (ctx, args) => {
    return await ctx.db.get("facturacionCorreos", args.correoId);
  },
});

export const getByGraphMessageId = internalQuery({
  args: { graphMessageId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("facturacionCorreos")
      .withIndex("by_graphMessageId", (q) =>
        q.eq("graphMessageId", args.graphMessageId),
      )
      .unique();
  },
});

export const upsertCorreo = internalMutation({
  args: {
    empresa: v.optional(v.number()),
    cuentaRecepcionEmail: v.optional(v.string()),
    graphMessageId: v.string(),
    conversationId: v.optional(v.string()),
    subject: v.string(),
    from: v.string(),
    toRecipients: v.array(v.string()),
    bodyPreview: v.string(),
    bodyContent: v.optional(v.string()),
    receivedDateTime: v.string(),
    isRead: v.boolean(),
    hasAttachments: v.boolean(),
    importance: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("facturacionCorreos")
      .withIndex("by_graphMessageId", (q) =>
        q.eq("graphMessageId", args.graphMessageId),
      )
      .unique();

    if (existing) {
      await ctx.db.patch("facturacionCorreos", existing._id, {
        empresa: args.empresa ?? existing.empresa ?? 1,
        cuentaRecepcionEmail:
          args.cuentaRecepcionEmail?.toLowerCase() ??
          existing.cuentaRecepcionEmail,
        subject: args.subject,
        bodyPreview: args.bodyPreview,
        bodyContent: args.bodyContent,
        isRead: args.isRead,
        hasAttachments: args.hasAttachments,
        importance: args.importance,
      });
      return existing._id;
    }

    return await ctx.db.insert("facturacionCorreos", {
      ...args,
      empresa: args.empresa ?? 1,
      ...(args.cuentaRecepcionEmail
        ? { cuentaRecepcionEmail: args.cuentaRecepcionEmail.toLowerCase() }
        : {}),
      procesado: false,
      attachmentImportStatus: args.hasAttachments ? "pending" : "none",
    });
  },
});

export const setAdjuntos = internalMutation({
  args: {
    graphMessageId: v.string(),
    attachments: v.array(adjuntoValidator),
    attachmentImportStatus: estadoAdjuntosValidator,
  },
  handler: async (ctx, args) => {
    const correo = await ctx.db
      .query("facturacionCorreos")
      .withIndex("by_graphMessageId", (q) =>
        q.eq("graphMessageId", args.graphMessageId),
      )
      .unique();

    if (!correo) return null;

    await ctx.db.patch("facturacionCorreos", correo._id, {
      attachments: args.attachments,
      attachmentImportStatus: args.attachmentImportStatus,
    });

    return correo._id;
  },
});

export const marcarProcesado = internalMutation({
  args: {
    correoId: v.id("facturacionCorreos"),
    facturaId: v.id("facturacionFacturas"),
    facturaIds: v.optional(v.array(v.id("facturacionFacturas"))),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch("facturacionCorreos", args.correoId, {
      procesado: true,
      facturaId: args.facturaId,
      ...(args.facturaIds ? { facturaIds: args.facturaIds } : {}),
      ultimoError: undefined,
      omitidoMotivo: undefined,
    });
  },
});

export const marcarOmitido = internalMutation({
  args: {
    correoId: v.id("facturacionCorreos"),
    motivo: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch("facturacionCorreos", args.correoId, {
      procesado: true,
      ...(args.motivo ? { omitidoMotivo: args.motivo } : {}),
      ultimoError: undefined,
    });
  },
});

export const registrarIntentoProcesamiento = internalMutation({
  args: {
    graphMessageId: v.string(),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const correo = await ctx.db
      .query("facturacionCorreos")
      .withIndex("by_graphMessageId", (q) =>
        q.eq("graphMessageId", args.graphMessageId),
      )
      .unique();
    if (!correo) return null;

    await ctx.db.patch("facturacionCorreos", correo._id, {
      intentosProcesamiento: (correo.intentosProcesamiento ?? 0) + 1,
      ultimoIntentoEn: Date.now(),
      ...(args.error !== undefined ? { ultimoError: args.error } : {}),
    });
    return correo._id;
  },
});

export const reiniciarIntentos = internalMutation({
  args: { correoId: v.id("facturacionCorreos") },
  handler: async (ctx, args) => {
    const correo = await ctx.db.get("facturacionCorreos", args.correoId);
    if (!correo) return;
    await ctx.db.patch("facturacionCorreos", args.correoId, {
      intentosProcesamiento: 0,
      ultimoError: undefined,
      // Reabrir correos omitidos (procesados sin factura) para reintentarlos.
      ...(correo.procesado && !correo.facturaId
        ? { procesado: false, omitidoMotivo: undefined }
        : {}),
    });
  },
});

export const listarPendientesParaReproceso = internalQuery({
  args: {
    max: v.number(),
    maxIntentos: v.number(),
  },
  handler: async (ctx, args) => {
    const pendientes: Array<Doc<"facturacionCorreos">> = [];
    const cursor = ctx.db
      .query("facturacionCorreos")
      .withIndex("by_procesado", (q) => q.eq("procesado", false))
      .order("asc");

    for await (const correo of cursor) {
      if ((correo.intentosProcesamiento ?? 0) >= args.maxIntentos) continue;
      pendientes.push(correo);
      if (pendientes.length >= args.max) break;
    }

    return pendientes;
  },
});

/**
 * Correos sin procesar con más de `edadMinimaMs` de antigüedad (para alertas
 * de salud de la ingesta). Acotado a `max` resultados.
 */
export const listarPendientesViejos = internalQuery({
  args: {
    edadMinimaMs: v.number(),
    ahora: v.number(),
    max: v.number(),
  },
  handler: async (ctx, args) => {
    const viejos: Array<Doc<"facturacionCorreos">> = [];
    const cursor = ctx.db
      .query("facturacionCorreos")
      .withIndex("by_procesado", (q) => q.eq("procesado", false))
      .order("asc");

    for await (const correo of cursor) {
      const recibidoMs = Date.parse(correo.receivedDateTime);
      if (
        Number.isFinite(recibidoMs) &&
        args.ahora - recibidoMs < args.edadMinimaMs
      ) {
        continue;
      }
      viejos.push(correo);
      if (viejos.length >= args.max) break;
    }

    return viejos;
  },
});
