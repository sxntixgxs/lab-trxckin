import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { RUTAS_SISTEMA } from "../../lib/rutas-sistema";
import {
  actorPuedeVerEmpresa,
  actorTieneAlgunPermiso,
  actorTienePermiso,
  requireActor,
  type BillingActor,
} from "./billingAuth";
import { normalizeEmail, normalizeEmpresa } from "./normalize";

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

/**
 * Whether the actor took part in the invoice workflow: assignee of any of its assignments
 * (any state) or the current owner of its task (tasks created before assignments existed).
 */
export async function actorParticipaEnFactura(
  ctx: QueryCtx | MutationCtx,
  actor: BillingActor,
  facturaId: Id<"facturacionFacturas">,
): Promise<boolean> {
  const asignaciones = await asignacionesDeFactura(ctx, facturaId);
  if (asignaciones.some((asignacion) => actorEsAsignado(actor, asignacion))) {
    return true;
  }
  const tarea = await ctx.db
    .query("facturacionTareas")
    .withIndex("by_facturaId", (q) => q.eq("facturaId", facturaId))
    .first();
  return tarea !== null && actorEsAsignado(actor, tarea);
}

/**
 * Read access to one invoice: full access; the invoices permission within the invoice's
 * company (invoice list and detail); or having taken part in its workflow (the inbox shows
 * every invoice assigned to the user, whatever the company).
 */
export async function actorPuedeVerFactura(
  ctx: QueryCtx | MutationCtx,
  actor: BillingActor,
  factura: Doc<"facturacionFacturas">,
): Promise<boolean> {
  if (actor.hasFullAccess) return true;
  if (
    actorTienePermiso(actor, RUTAS_SISTEMA.FACTURACION_FACTURAS) &&
    actorPuedeVerEmpresa(actor, normalizeEmpresa(factura.empresa))
  ) {
    return true;
  }
  return await actorParticipaEnFactura(ctx, actor, factura._id);
}

/** The invoice when the authenticated caller may read it (see `actorPuedeVerFactura`), else null. */
export async function facturaVisibleParaActor(
  ctx: QueryCtx | MutationCtx,
  facturaId: Id<"facturacionFacturas">,
): Promise<Doc<"facturacionFacturas"> | null> {
  const actor = await requireActor(ctx);
  const factura = await ctx.db.get("facturacionFacturas", facturaId);
  if (!factura || !(await actorPuedeVerFactura(ctx, actor, factura))) return null;
  return factura;
}

const PERMISOS_CAJA_MENOR = [
  RUTAS_SISTEMA.FACTURACION_REEMBOLSO_CAJA_MENOR,
  RUTAS_SISTEMA.FINANZAS_CAJAS_MENORES,
] as const;

/**
 * The petty cash screens (reimbursement inbox, petty cash) show the invoices booked against
 * a petty cash fund of the user's companies.
 */
export async function actorPuedeVerFacturaCajaMenor(
  ctx: QueryCtx | MutationCtx,
  actor: BillingActor,
  factura: Doc<"facturacionFacturas">,
): Promise<boolean> {
  if (
    !actorTieneAlgunPermiso(actor, PERMISOS_CAJA_MENOR) ||
    !actorPuedeVerEmpresa(actor, normalizeEmpresa(factura.empresa))
  ) {
    return false;
  }
  if (factura.esLegalizacionCajaMenor === true) return true;
  const movimiento = await ctx.db
    .query("facturacionCajaMenorMovimientos")
    .withIndex("by_facturaId", (q) => q.eq("facturaId", factura._id))
    .first();
  return movimiento !== null;
}
