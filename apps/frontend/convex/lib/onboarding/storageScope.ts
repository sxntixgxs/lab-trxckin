import type { Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { documentosCargadosDe, esSupplierDoc, type InscripcionDoc, type InscripcionRef } from "./refs";

/** Ids de storage que pertenecen a una inscripción (adjuntos propios + filas de revisión). */
export async function collectStorageIdsDeInscripcion(
  ctx: QueryCtx | MutationCtx,
  ref: InscripcionRef,
  ins: InscripcionDoc,
): Promise<Set<Id<"_storage">>> {
  const ids = new Set<Id<"_storage">>();
  if (ins.matriz_00.rutStorageId) ids.add(ins.matriz_00.rutStorageId);
  if (!esSupplierDoc(ins) && ins.matriz_00.cotizacionStorageId) ids.add(ins.matriz_00.cotizacionStorageId);
  for (const id of Object.values(documentosCargadosDe(ins))) ids.add(id);
  if (esSupplierDoc(ins)) {
    for (const f of ins.notasContabilidadFaseVI?.archivosSoporte ?? []) ids.add(f.storageId);
  }
  const docs =
    ref.modulo === "supplier"
      ? await ctx.db
          .query("onboardingProveedoresDocumentos")
          .withIndex("by_inscripcionId", (q) => q.eq("inscripcionId", ref.inscripcionId))
          .take(200)
      : await ctx.db
          .query("onboardingClientesDocumentos")
          .withIndex("by_inscripcionId", (q) => q.eq("inscripcionId", ref.inscripcionId))
          .take(200);
  for (const doc of docs) if (doc.storageId) ids.add(doc.storageId);
  return ids;
}

/** URLs firmadas solo para ids que pertenecen a la inscripción; `null` para los demás. */
export async function urlsDeInscripcion(
  ctx: QueryCtx | MutationCtx,
  ref: InscripcionRef,
  ins: InscripcionDoc,
  storageIds: readonly Id<"_storage">[],
): Promise<Array<{ storageId: Id<"_storage">; url: string | null }>> {
  const owned = await collectStorageIdsDeInscripcion(ctx, ref, ins);
  return await Promise.all(
    storageIds.map(async (storageId) => ({
      storageId,
      url: owned.has(storageId) ? await ctx.storage.getUrl(storageId) : null,
    })),
  );
}
