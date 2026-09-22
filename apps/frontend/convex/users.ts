import { v } from "convex/values";
import { internalQuery, mutation, } from "./_generated/server";
import { requireIdentity, requireServerSecret } from "./lib/auth";
import { actorTienePermiso, requireActor as requireBillingActor } from "./lib/billingAuth";

/**
 * Public upsert of the caller's own row. Only identity-derived fields are written:
 * privilege fields (role, permisos, empresas, ...) are NEVER accepted from the client.
 * They are written by `syncPrivileges`, which only trusted server code can call.
 */
export const store = mutation({
  args: {},
  returns: v.id("users"),
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx);
    const email = identity.email ?? "";

    const existing = await ctx.db
      .query("users")
      .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();

    if (existing) {
      if (existing.email !== email && email) {
        await ctx.db.patch("users", existing._id, { email });
      }
      return existing._id;
    }

    return await ctx.db.insert("users", {
      tokenIdentifier: identity.tokenIdentifier,
      workosUserId: identity.subject,
      email,
      name: identity.name ?? identity.email ?? "Usuario",
      role: "member",
    });
  },
});

/**
 * Server-only: called by the Next `/api/me?sync=1` route after it resolved the WorkOS
 * session and loaded the user's profile from the Nest backend. Guarded by
 * CONVEX_SERVER_SECRET; the `workosUserId` comes from the server-side session, not
 * from the browser.
 */
export const syncPrivileges = mutation({
  args: {
    secret: v.string(),
    workosUserId: v.string(),
    nestUserId: v.optional(v.string()),
    name: v.optional(v.string()),
    role: v.union(v.literal("admin"), v.literal("member")),
    permisos: v.array(v.string()),
    hasFullAccess: v.boolean(),
    procesoId: v.optional(v.number()),
    procesoNombre: v.optional(v.string()),
    cargo: v.optional(v.string()),
    jefeDirectoUserId: v.optional(v.string()),
    liderProceso: v.optional(v.boolean()),
    empresas: v.optional(v.array(v.number())),
    accesoTodasEmpresas: v.optional(v.boolean()),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    requireServerSecret(args.secret);
    const { workosUserId, name } = args;
    const privileges = {
      nestUserId: args.nestUserId,
      role: args.role,
      permisos: args.permisos,
      hasFullAccess: args.hasFullAccess,
      procesoId: args.procesoId,
      procesoNombre: args.procesoNombre,
      cargo: args.cargo,
      jefeDirectoUserId: args.jefeDirectoUserId,
      liderProceso: args.liderProceso,
      empresas: args.empresas,
      accesoTodasEmpresas: args.accesoTodasEmpresas,
    };

    const rows = await ctx.db
      .query("users")
      .withIndex("by_workosUserId", (q) => q.eq("workosUserId", workosUserId))
      .take(10);

    for (const row of rows) {
      await ctx.db.patch("users", row._id, {
        ...privileges,
        ...(name ? { name } : {}),
      });
    }
    return rows.length;
  },
});

/**
 * Permission check usable from actions (which have no `ctx.db`): the caller's identity
 * propagates through `ctx.runQuery`, so this loads the caller's own `users` row.
 * Throws unless the caller has at least one of `permisos` (or full access).
 */
export const assertPermisoActor = internalQuery({
  args: { permisos: v.array(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await requireBillingActor(ctx);
    if (!args.permisos.some((permiso) => actorTienePermiso(actor, permiso))) {
      throw new Error("No autorizado");
    }
    return null;
  },
});
