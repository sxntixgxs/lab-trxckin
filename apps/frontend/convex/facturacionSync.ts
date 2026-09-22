import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { advanceWatermark, SYNC_LEASE_MS } from "./lib/facturacionGraphSync";

const resultadoCuentaValidator = v.object({
  synced: v.number(),
  processed: v.number(),
  failed: v.number(),
  total: v.number(),
  error: v.optional(v.string()),
});

const cuentaRunValidator = v.object({
  email: v.string(),
  empresa: v.number(),
  synced: v.number(),
  processed: v.number(),
  failed: v.number(),
  total: v.number(),
  error: v.optional(v.string()),
  hayMasTrabajo: v.optional(v.boolean()),
  leaseOcupado: v.optional(v.boolean()),
});

/**
 * Toma el lease de sincronización de una cuenta. Devuelve el watermark actual
 * si el lease se obtuvo; si otra corrida lo tiene, devuelve ok=false.
 */
export const tomarLease = internalMutation({
  args: {
    email: v.string(),
    empresa: v.number(),
  },
  returns: v.object({
    ok: v.boolean(),
    watermarkReceivedDateTime: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const email = args.email.toLowerCase();
    const existing = await ctx.db
      .query("facturacionSyncCuentas")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();

    if (!existing) {
      await ctx.db.insert("facturacionSyncCuentas", {
        empresa: args.empresa,
        email,
        leaseHasta: now + SYNC_LEASE_MS,
      });
      return { ok: true };
    }

    if (typeof existing.leaseHasta === "number" && existing.leaseHasta > now) {
      return { ok: false };
    }

    await ctx.db.patch("facturacionSyncCuentas", existing._id, {
      empresa: args.empresa,
      leaseHasta: now + SYNC_LEASE_MS,
    });
    return {
      ok: true,
      ...(existing.watermarkReceivedDateTime
        ? { watermarkReceivedDateTime: existing.watermarkReceivedDateTime }
        : {}),
    };
  },
});

/**
 * Libera el lease y avanza el watermark (solo hacia adelante) junto con el
 * resultado de la corrida.
 */
export const liberarLease = internalMutation({
  args: {
    email: v.string(),
    watermarkReceivedDateTime: v.optional(v.string()),
    resultado: v.optional(resultadoCuentaValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const email = args.email.toLowerCase();
    const existing = await ctx.db
      .query("facturacionSyncCuentas")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (!existing) return null;

    const watermark = advanceWatermark(
      existing.watermarkReceivedDateTime,
      args.watermarkReceivedDateTime
    );

    await ctx.db.patch("facturacionSyncCuentas", existing._id, {
      leaseHasta: undefined,
      ultimaCorridaEn: Date.now(),
      ...(watermark ? { watermarkReceivedDateTime: watermark } : {}),
      ...(args.resultado ? { ultimoResultado: args.resultado } : {}),
    });
    return null;
  },
});

export const registrarRun = internalMutation({
  args: {
    origen: v.union(
      v.literal("cron"),
      v.literal("manual"),
      v.literal("continuacion"),
      v.literal("reproceso"),
      v.literal("backfill")
    ),
    inicioEn: v.number(),
    cuentas: v.array(cuentaRunValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("facturacionSyncRuns", {
      origen: args.origen,
      inicioEn: args.inicioEn,
      finEn: Date.now(),
      synced: args.cuentas.reduce((total, item) => total + item.synced, 0),
      processed: args.cuentas.reduce((total, item) => total + item.processed, 0),
      failed: args.cuentas.reduce((total, item) => total + item.failed, 0),
      total: args.cuentas.reduce((total, item) => total + item.total, 0),
      cuentas: args.cuentas,
    });
    return null;
  },
});

/**
 * Marca que se envió una alerta de salud para una cuenta (para no alertar en
 * cada corrida del cron de reproceso).
 */
export const marcarAlertaEnviada = internalMutation({
  args: { email: v.string(), empresa: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const email = args.email.toLowerCase();
    const existing = await ctx.db
      .query("facturacionSyncCuentas")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (existing) {
      await ctx.db.patch("facturacionSyncCuentas", existing._id, { ultimaAlertaEn: Date.now() });
    } else {
      await ctx.db.insert("facturacionSyncCuentas", {
        empresa: args.empresa,
        email,
        ultimaAlertaEn: Date.now(),
      });
    }
    return null;
  },
});

export const getCuentaSync = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("facturacionSyncCuentas")
      .withIndex("by_email", (q) => q.eq("email", args.email.toLowerCase()))
      .unique();
  },
});
