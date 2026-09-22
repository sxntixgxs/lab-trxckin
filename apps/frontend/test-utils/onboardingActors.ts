/**
 * convex-test helper for the onboarding modules. Their functions derive the actor from
 * the Convex identity and declare no `actor*` args, so `actingAsActorArgs` does not apply.
 * `asUser` seeds a synced `users` row with the given privileges and returns a client that
 * runs every call under that identity.
 *
 * Deliberately structural (no `convex-test` import) so the app typecheck does not depend
 * on test-only packages.
 */

type Call = (fn: unknown, args?: Record<string, unknown>) => Promise<unknown>;

type UsersDb = {
  db: {
    query: (table: "users") => {
      withIndex: (
        index: "by_tokenIdentifier",
        range: (q: { eq: (field: "tokenIdentifier", value: string) => unknown }) => unknown,
      ) => { unique: () => Promise<{ _id: unknown } | null> };
    };
    patch: (table: "users", id: never, value: Record<string, unknown>) => Promise<void>;
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

export type TestUser = {
  id: string;
  nombre?: string;
  email?: string;
  permisos?: string[];
  empresas?: number[];
  hasFullAccess?: boolean;
  accesoTodasEmpresas?: boolean;
};

export type ActingClient = { mutation: Call; query: Call; action: Call };

export async function asUser<T extends object>(t: T, user: TestUser): Promise<ActingClient> {
  const client = t as unknown as TestConvexLike;
  const tokenIdentifier = `test|${user.id}`;
  const email = user.email ?? `${user.id}@example.com`;
  const name = user.nombre ?? user.id;
  const row = {
    tokenIdentifier,
    workosUserId: user.id,
    email,
    name,
    nestUserId: user.id,
    role: user.hasFullAccess ? "admin" : "member",
    hasFullAccess: user.hasFullAccess === true,
    permisos: user.permisos ?? [],
    empresas: user.empresas ?? [],
    accesoTodasEmpresas: user.accesoTodasEmpresas === true,
  };
  await client.run(async (rawCtx) => {
    const ctx = rawCtx as UsersDb;
    const existing = await ctx.db
      .query("users")
      .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", tokenIdentifier))
      .unique();
    if (existing) await ctx.db.patch("users", existing._id as never, row);
    else await ctx.db.insert("users", row);
  });
  return client.withIdentity({ tokenIdentifier, subject: user.id, email, name }) as ActingClient;
}
