import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireIdentity, requireServerSecret } from "./lib/auth";

// ---- Client (ConvexReactClient with a WorkOS identity) ----

export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requireIdentity(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const getUrl = query({
  args: { storageId: v.id("_storage") },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    await requireIdentity(ctx);
    return await ctx.storage.getUrl(args.storageId);
  },
});

export const getUrls = query({
  args: { storageIds: v.array(v.id("_storage")) },
  returns: v.array(v.object({ storageId: v.id("_storage"), url: v.union(v.string(), v.null()) })),
  handler: async (ctx, args) => {
    await requireIdentity(ctx);
    return await Promise.all(
      args.storageIds.map(async (storageId) => ({
        storageId,
        url: await ctx.storage.getUrl(storageId),
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
