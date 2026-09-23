/**
 * convex-test helper. Workflow mutations derive the acting user from the Convex identity
 * (see convex/lib/serverActor.ts) instead of trusting args such as `actorUserId` or
 * `gerenteUserId`. Tests keep passing those args; this proxy runs each such call as that
 * user: it seeds a synced `users` row (nestUserId = the id) and calls `withIdentity`.
 *
 * Deliberately structural (no `convex-test` import) so the app typecheck does not depend
 * on test-only packages.
 */

export const DEFAULT_ACTOR_ID_KEYS = [
  "actorUserId",
  "createdById",
  "jefeDirectoUserId",
  "contadorUserId",
  "gerenteUserId",
  "tesoreroUserId",
  "rechazadoPorUserId",
  "anuladoPorUserId",
] as const;

const ADMIN_ROLES = new Set([1, 99]);

type Call = (fn: unknown, args?: Record<string, unknown>) => Promise<unknown>;

type UsersDb = {
  db: {
    query: (table: "users") => {
      withIndex: (
        index: "by_tokenIdentifier",
        range: (q: { eq: (field: "tokenIdentifier", value: string) => unknown }) => unknown,
      ) => { unique: () => Promise<{ _id: unknown } | null> };
    };
    patch: (id: never, value: Record<string, unknown>) => Promise<void>;
    insert: (table: "users", value: Record<string, unknown>) => Promise<unknown>;
  };
};

type TestConvexLike = {
  mutation: Call;
  query: Call;
  action: Call;
  run: (fn: (ctx: never) => Promise<unknown>) => Promise<unknown>;
  withIdentity: (identity: Record<string, unknown>) => unknown;
};

/**
 * Privileges given to every user the proxy seeds (route permissions, companies). Existing
 * rows keep privileges seeded elsewhere (e.g. with `asUser`) unless these are given.
 */
export type ActingPrivilegios = { permisos?: string[]; empresas?: number[] };

export function actingAsActorArgs<T extends object>(
  t: T,
  actorIdKeys: readonly string[] = DEFAULT_ACTOR_ID_KEYS,
  privilegios: ActingPrivilegios = {},
): T {
  const client = t as unknown as TestConvexLike;
  const seeded = new Set<string>();

  const asActor = async (actorUserId: string, args: Record<string, unknown>) => {
    const tokenIdentifier = `test|${actorUserId}`;
    const email =
      typeof args.actorEmail === "string" ? args.actorEmail : `${actorUserId}@example.com`;
    const name = typeof args.actorNombre === "string" ? args.actorNombre : actorUserId;
    const isAdmin = typeof args.actorRol === "number" && ADMIN_ROLES.has(args.actorRol);
    const key = `${actorUserId}|${isAdmin}|${email}|${name}`;
    if (!seeded.has(key)) {
      seeded.add(key);
      await client.run(async (rawCtx) => {
        const ctx = rawCtx as UsersDb;
        const existing = await ctx.db
          .query("users")
          .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", tokenIdentifier))
          .unique();
        const row = {
          tokenIdentifier,
          workosUserId: actorUserId,
          email,
          name,
          nestUserId: actorUserId,
          ...(privilegios.permisos ? { permisos: privilegios.permisos } : {}),
          ...(privilegios.empresas ? { empresas: privilegios.empresas } : {}),
          role: isAdmin ? "admin" : "member",
          hasFullAccess: isAdmin,
        };
        if (existing) await ctx.db.patch(existing._id as never, row);
        else await ctx.db.insert("users", row);
      });
    }
    return client.withIdentity({ tokenIdentifier, subject: actorUserId, email, name }) as Record<
      "mutation" | "query" | "action",
      Call
    >;
  };

  return new Proxy(t, {
    get(target, prop, receiver) {
      if (prop === "mutation" || prop === "query" || prop === "action") {
        return async (fn: unknown, args?: Record<string, unknown>) => {
          const idKey = args ? actorIdKeys.find((k) => typeof args[k] === "string") : undefined;
          if (args && idKey) {
            const acting = await asActor(args[idKey] as string, args);
            return acting[prop](fn, args);
          }
          return (Reflect.get(target, prop, receiver) as Call).call(target, fn, args);
        };
      }
      const value: unknown = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(target) : value;
    },
  });
}
