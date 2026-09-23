import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { BillingActor } from "./billingAuth";
import { normalizeEmail } from "./normalize";

type Asignable = {
  asignadoAUserId?: string | null;
  asignadoAEmail?: string | null;
};

/**
 * True when `actor` is the assignee: same Nest user id, or the same non-empty email
 * (older assignments sometimes carry only an email).
 */
export function actorEsAsignado(actor: BillingActor, asignable: Asignable): boolean {
  if (asignable.asignadoAUserId && asignable.asignadoAUserId === actor.usuarioId) {
    return true;
  }
  const email = normalizeEmail(asignable.asignadoAEmail);
  return email !== "" && email === normalizeEmail(actor.email);
}

const MAX_ASIGNACIONES_POR_FACTURA = 500;

async function asignacionesDeFactura(
  ctx: QueryCtx | MutationCtx,
  facturaId: Id<"facturacionFacturas">,
): Promise<Doc<"facturacionAsignaciones">[]> {
  return await ctx.db
    .query("facturacionAsignaciones")
    .withIndex("by_facturaId", (q) => q.eq("facturaId", facturaId))
    .take(MAX_ASIGNACIONES_POR_FACTURA);
}

/** Whether the actor has a pending assignment on the invoice (is working it right now). */
export async function actorTieneAsignacionPendiente(
  ctx: QueryCtx | MutationCtx,
  actor: BillingActor,
  facturaId: Id<"facturacionFacturas">,
): Promise<boolean> {
  const asignaciones = await asignacionesDeFactura(ctx, facturaId);
  return asignaciones.some(
    (asignacion) => asignacion.estado === "pendiente" && actorEsAsignado(actor, asignacion),
  );
}
