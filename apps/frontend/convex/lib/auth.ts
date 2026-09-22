import type { UserIdentity } from "convex/server";
import type { Doc } from "../_generated/dataModel";
import { env, type ActionCtx, type MutationCtx, type QueryCtx } from "../_generated/server";

/** Returns the WorkOS identity of the caller or throws. */
export async function requireIdentity(
  ctx: QueryCtx | MutationCtx | ActionCtx,
): Promise<UserIdentity> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("No autenticado");
  }
  return identity;
}

export async function getCurrentUser(
  ctx: QueryCtx | MutationCtx,
): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    return null;
  }

  return await ctx.db
    .query("users")
    .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
}

/**
 * Loads the `users` row of the authenticated caller (identity-derived, never from args).
 * Throws "No autenticado" when there is no identity or no synced user row.
 */
export async function requireActor(ctx: QueryCtx | MutationCtx): Promise<Doc<"users">> {
  const user = await getCurrentUser(ctx);
  if (!user) {
    throw new Error("No autenticado");
  }
  return user;
}

/** @deprecated alias kept for existing callers; prefer `requireActor`. */
export const requireCurrentUser = requireActor;

export async function requireRole(
  ctx: QueryCtx | MutationCtx,
  role: "admin" | "member",
): Promise<Doc<"users">> {
  const user = await requireActor(ctx);
  if (role === "admin" && user.role !== "admin") {
    throw new Error("Unauthorized: Admin access required");
  }
  return user;
}

/**
 * Constant-time string comparison. The default Convex runtime has no `node:crypto`,
 * so `timingSafeEqual` is implemented by hand: XOR every char code and OR the result
 * together so the loop always runs over the full expected length.
 */
function constantTimeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) {
    const ca = i < a.length ? a.charCodeAt(i) : 0;
    const cb = i < b.length ? b.charCodeAt(i) : 0;
    diff |= ca ^ cb;
  }
  return diff === 0;
}

/**
 * Guards functions called server-to-server (Next API routes via the unauthenticated
 * ConvexHttpClient). The caller must pass `CONVEX_SERVER_SECRET`, which has to be set
 * both in the Next.js environment and in the Convex deployment environment.
 */
export function requireServerSecret(secret: string | undefined): void {
  const expected = env.CONVEX_SERVER_SECRET;
  if (!expected || !secret || !constantTimeEqual(secret, expected)) {
    throw new Error("No autorizado");
  }
}

/** Non-throwing variant, for functions that also accept an authenticated client call. */
export function isValidServerSecret(secret: string | undefined): boolean {
  const expected = env.CONVEX_SERVER_SECRET;
  return Boolean(expected && secret && constantTimeEqual(secret, expected));
}
