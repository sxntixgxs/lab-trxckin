import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireIdentity, requireServerSecret } from "./lib/auth";
import { contextoArchivoValidator, storageIdsVisibles } from "./lib/storageAccess";

// ---- Client (ConvexReactClient with a WorkOS identity) ----

export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requireIdentity(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Signed URL of a file that belongs to `contexto` (an invoice or an onboarding inscription)
 * the caller can read; `null` for any other id.
 */
export const getUrl = query({
  args: { storageId: v.id("_storage"), contexto: contextoArchivoValidator },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const permitidos = await storageIdsVisibles(ctx, args.contexto);
    if (!permitidos.has(String(args.storageId))) return null;
    return await ctx.storage.getUrl(args.storageId);
  },
});

/**
 * Signed URLs of invoice files (approval timeline, partial payments, petty cash
 * reimbursements): only ids that belong to one of `facturaIds` the caller can read.
 */
export const getUrls = query({
  args: {
    storageIds: v.array(v.id("_storage")),
    facturaIds: v.array(v.id("facturacionFacturas")),
  },
  returns: v.array(v.object({ storageId: v.id("_storage"), url: v.union(v.string(), v.null()) })),
  handler: async (ctx, args) => {
    const permitidos = new Set<string>();
    for (const facturaId of new Set(args.facturaIds)) {
      for (const storageId of await storageIdsVisibles(ctx, { tipo: "factura", facturaId })) {
        permitidos.add(storageId);
      }
    }
    return await Promise.all(
      args.storageIds.map(async (storageId) => ({
        storageId,
        url: permitidos.has(String(storageId)) ? await ctx.storage.getUrl(storageId) : null,
      })),
    );
  },
});

// ---- Server (Next API routes via ConvexHttpClient, guarded by CONVEX_SERVER_SECRET) ----

export const generateUploadUrlDesdeServidor = mutation({
  args: { secret: v.string() },
  returns: v.string(),
  handler: async (ctx, args) => {
    requireServerSecret(args.secret);
    return await ctx.storage.generateUploadUrl();
  },
});

export const getUrlDesdeServidor = query({
  args: { secret: v.string(), storageId: v.id("_storage") },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    requireServerSecret(args.secret);
    return await ctx.storage.getUrl(args.storageId);
  },
});
