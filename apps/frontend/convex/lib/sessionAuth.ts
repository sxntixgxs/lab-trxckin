import type { QueryCtx, MutationCtx } from "../_generated/server";
import { requireActor, type BillingActor } from "./billingAuth";

export type SessionActor = {
  userId: string;
  name?: string;
  email?: string;
  role?: number;
  empresas: number[];
  isAdmin: boolean;
  hasAllCompanies: boolean;
  aliases: Set<string>;
};

function toSessionActor(actor: BillingActor): SessionActor {
  const aliases = new Set<string>([actor.usuarioId, actor.email].filter(Boolean));
  return {
    userId: actor.usuarioId,
    name: actor.nombre,
    email: actor.email,
    role: actor.hasFullAccess ? 1 : undefined,
    empresas: actor.empresas,
    isAdmin: actor.hasFullAccess,
    hasAllCompanies: actor.hasFullAccess || actor.accesoTodasEmpresas,
    aliases,
  };
}

/** Session actor derived from the WorkOS identity (the caller's synced `users` row). */
export async function getAuthenticatedSessionActor(
  ctx: QueryCtx | MutationCtx,
): Promise<SessionActor> {
  return toSessionActor(await requireActor(ctx));
}
