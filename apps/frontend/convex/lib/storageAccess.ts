import { v, type Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { requireActor } from "./billingAuth";
import { actorPuedeVerFactura, actorPuedeVerFacturaCajaMenor } from "./facturacionAccess";
import { puedeVerInscripcion, resolveOnboardingAccess } from "./onboarding/access";
import { getInscripcion, resolveRef } from "./onboarding/refs";
import { collectStorageIdsDeInscripcion } from "./onboarding/storageScope";

/**
 * The record a stored file is requested for. Convex storage has no owner, so signed URLs
 * are only handed out for ids that belong to a record the caller can read.
 */
export const contextoArchivoValidator = v.union(
  v.object({ tipo: v.literal("factura"), facturaId: v.id("facturacionFacturas") }),
  v.object({
    tipo: v.literal("inscripcion"),
    modulo: v.union(v.literal("supplier"), v.literal("customer")),
    inscripcionId: v.string(),
  }),
);

export type ContextoArchivo = Infer<typeof contextoArchivoValidator>;

const MAX_FILAS_POR_FACTURA = 500;

/** Invoice files: XML / PDF / supports, payment proofs, approval signatures and attachments. */
async function storageIdsDeFactura(
  ctx: QueryCtx,
  factura: Doc<"facturacionFacturas">,
): Promise<Set<string>> {
  const ids = new Set<string>();
  const agregar = (id?: Id<"_storage"> | null) => {
    if (id) ids.add(String(id));
  };
  agregar(factura.xmlStorageId);
  agregar(factura.pdfStorageId);
  agregar(factura.soportesStorageId);

  const tarea = await ctx.db
    .query("facturacionTareas")
    .withIndex("by_facturaId", (q) => q.eq("facturaId", factura._id))
    .first();
  agregar(tarea?.comprobantePagoStorageId);

  const aprobaciones = await ctx.db
    .query("facturacionAprobaciones")
    .withIndex("by_facturaId", (q) => q.eq("facturaId", factura._id))
    .take(MAX_FILAS_POR_FACTURA);
  for (const aprobacion of aprobaciones) {
    agregar(aprobacion.firmaStorageId);
    agregar(aprobacion.pagoParcial?.comprobanteStorageId);
  }

  const adjuntos = await ctx.db
    .query("facturacionAdjuntos")
    .withIndex("by_facturaId", (q) => q.eq("facturaId", factura._id))
    .take(MAX_FILAS_POR_FACTURA);
  for (const adjunto of adjuntos) agregar(adjunto.storageId);
  return ids;
}

/**
 * Storage ids the caller may open for `contexto`; empty when they cannot read the record.
 * Invoices follow the invoice read rule (invoices permission in the company, workflow
 * participant, or petty cash screens for petty cash invoices); inscriptions follow the
 * onboarding rule for attachments (full module access, or the process owner).
 */
export async function storageIdsVisibles(
  ctx: QueryCtx,
  contexto: ContextoArchivo,
): Promise<Set<string>> {
  const actor = await requireActor(ctx);

  if (contexto.tipo === "factura") {
    const factura = await ctx.db.get("facturacionFacturas", contexto.facturaId);
    if (!factura) return new Set();
    const visible =
      (await actorPuedeVerFactura(ctx, actor, factura)) ||
      (await actorPuedeVerFacturaCajaMenor(ctx, actor, factura));
    return visible ? await storageIdsDeFactura(ctx, factura) : new Set();
  }

  const id =
    contexto.modulo === "supplier"
      ? ctx.db.normalizeId("onboardingProveedores", contexto.inscripcionId)
      : ctx.db.normalizeId("onboardingClientes", contexto.inscripcionId);
  if (!id) return new Set();
  const ref = resolveRef(ctx, contexto.modulo, id);
  const ins = await getInscripcion(ctx, ref);
  if (!ins) return new Set();
  let puedeVerAdjuntos = false;
  try {
    const { access } = await resolveOnboardingAccess(ctx, contexto.modulo, ins.empresa);
    puedeVerAdjuntos =
      puedeVerInscripcion(access, ins) && (access.nivel === "full" || access.nivel === "responsable");
  } catch {
    // Without the module permission or the company the caller simply gets no URL.
  }
  if (!puedeVerAdjuntos) return new Set();
  const ids = await collectStorageIdsDeInscripcion(ctx, ref, ins);
  return new Set([...ids].map(String));
}
