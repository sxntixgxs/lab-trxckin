import {
  mutation as rawMutation,
  query as rawQuery,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import { requireActor } from "./billingAuth";

/**
 * Legacy modules (cajas menores) receive the acting user as client-provided args
 * (`actorUserId`, `actorNombre`, `actorEmail`, `actorRol`) and authorize with them.
 * These wrappers keep the same public signatures but overwrite those args with values
 * derived from the Convex identity (the caller's `users` row), so a client can no
 * longer impersonate another user or claim an admin role.
 *
 * Functions that declare a `secret` arg are server-to-server calls (Next API routes via
 * ConvexHttpClient, no identity); they are left untouched and must call
 * `requireServerSecret` themselves.
 */

const ACTOR_KEYS = ["actorUserId", "actorNombre", "actorEmail", "actorRol"] as const;
/** Nest role id treated as admin by `isAdminRol` (ADMIN_ROLES = {1, 99}). */
const ADMIN_ROL_ID = 1;

type ArgsDef = Record<string, unknown> | { isConvexValidator: true; fields?: Record<string, unknown> };

function declaredFields(argsDef: unknown): Record<string, unknown> {
  if (!argsDef || typeof argsDef !== "object") return {};
  const def = argsDef as ArgsDef;
  if ("isConvexValidator" in def && def.isConvexValidator === true) {
    return (def as { fields?: Record<string, unknown> }).fields ?? {};
  }
  return def as Record<string, unknown>;
}

async function conActorServidor(
  ctx: QueryCtx | MutationCtx,
  argsDef: unknown,
  args: Record<string, unknown>,
  extraUserIdKeys: readonly string[],
): Promise<Record<string, unknown>> {
  const fields = declaredFields(argsDef);
  if ("secret" in fields) return args;
  const keys = ACTOR_KEYS.filter((key) => key in fields);
  const userIdKeys = extraUserIdKeys.filter((key) => key in fields);
  if (keys.length === 0 && userIdKeys.length === 0) return args;

  const actor = await requireActor(ctx);
  const derived: Record<(typeof ACTOR_KEYS)[number], unknown> = {
    actorUserId: actor.usuarioId,
    actorNombre: actor.nombre,
    actorEmail: actor.email,
    actorRol: actor.hasFullAccess ? ADMIN_ROL_ID : undefined,
  };
  const next: Record<string, unknown> = { ...args };
  for (const key of userIdKeys) next[key] = actor.usuarioId;
  for (const key of keys) {
    if (derived[key] === undefined) delete next[key];
    else next[key] = derived[key];
  }
  return next;
}

type AnyDef = {
  args?: unknown;
  handler: (ctx: QueryCtx | MutationCtx, args: Record<string, unknown>) => unknown;
};

function wrap(def: AnyDef, extraUserIdKeys: readonly string[] = []): AnyDef {
  return {
    ...def,
    handler: async (ctx, args) =>
      def.handler(ctx, await conActorServidor(ctx, def.args, args, extraUserIdKeys)),
  };
}

/** `mutation` whose `actor*` args are always the authenticated caller. */
export const mutationConActor = ((def: AnyDef | AnyDef["handler"]) =>
  typeof def === "function"
    ? (rawMutation as (d: unknown) => unknown)(def)
    : (rawMutation as (d: unknown) => unknown)(wrap(def))) as unknown as typeof rawMutation;

/** `query` whose `actor*` args are always the authenticated caller. */
export const queryConActor = ((def: AnyDef | AnyDef["handler"]) =>
  typeof def === "function"
    ? (rawQuery as (d: unknown) => unknown)(def)
    : (rawQuery as (d: unknown) => unknown)(wrap(def))) as unknown as typeof rawQuery;

/**
 * Like `mutationConActor`, but also overwrites the given "acting user id" args
 * (e.g. `createdById`, `gerenteUserId`) with the caller's Nest user id.
 */
export function mutationConActorIds(userIdKeys: readonly string[]): typeof rawMutation {
  return ((def: AnyDef | AnyDef["handler"]) =>
    typeof def === "function"
      ? (rawMutation as (d: unknown) => unknown)(def)
      : (rawMutation as (d: unknown) => unknown)(wrap(def, userIdKeys))) as unknown as typeof rawMutation;
}
