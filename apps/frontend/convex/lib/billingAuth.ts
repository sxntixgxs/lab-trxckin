import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { requireCurrentUser } from "./auth";

export type BillingActor = {
  usuarioId: string;
  nombre: string;
  email: string;
  nestUserId: string;
  hasFullAccess: boolean;
  permisos: string[];
  procesoId?: number;
  procesoNombre?: string;
  cargo?: string;
  jefeDirectoUserId?: string;
  liderProceso: boolean;
  empresas: number[];
  accesoTodasEmpresas: boolean;
};

function toActor(user: Doc<"users">): BillingActor {
  const nestUserId = user.nestUserId;
  if (!nestUserId) {
    throw new Error("El usuario de Convex no está sincronizado con Nest");
  }
  return {
    usuarioId: nestUserId,
    nestUserId,
    nombre: user.name,
    email: user.email,
    hasFullAccess: user.hasFullAccess === true || user.role === "admin",
    permisos: user.permisos ?? [],
    procesoId: user.procesoId,
    procesoNombre: user.procesoNombre,
    cargo: user.cargo,
    jefeDirectoUserId: user.jefeDirectoUserId,
    liderProceso: user.liderProceso === true,
    empresas: user.empresas ?? [],
    accesoTodasEmpresas: user.accesoTodasEmpresas === true || user.hasFullAccess === true,
  };
}

export async function requireActor(ctx: QueryCtx | MutationCtx): Promise<BillingActor> {
  const user = await requireCurrentUser(ctx);
  return toActor(user);
}

export async function requireAdmin(ctx: QueryCtx | MutationCtx): Promise<BillingActor> {
  const actor = await requireActor(ctx);
  if (!actor.hasFullAccess && actor.permisos.includes("*") === false) {
    throw new Error("Unauthorized: Admin access required");
  }
  return actor;
}

export async function requirePermiso(
  ctx: QueryCtx | MutationCtx,
  permiso: string,
): Promise<BillingActor> {
  const actor = await requireActor(ctx);
  if (actor.hasFullAccess || actor.permisos.includes("*") || actor.permisos.includes(permiso)) {
    return actor;
  }
  throw new Error(`Unauthorized: se requiere ${permiso}`);
}

export function actorTienePermiso(actor: BillingActor, permiso: string): boolean {
  return actor.hasFullAccess || actor.permisos.includes("*") || actor.permisos.includes(permiso);
}

/** Empresa scope: full-access / all-companies actors see everything, others only their empresas. */
export function actorPuedeVerEmpresa(actor: BillingActor, empresa: number | undefined | null): boolean {
  if (actor.hasFullAccess || actor.accesoTodasEmpresas) {
    return true;
  }
  return typeof empresa === "number" && actor.empresas.includes(empresa);
}
