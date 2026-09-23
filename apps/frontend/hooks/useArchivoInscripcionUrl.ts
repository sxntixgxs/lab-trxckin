"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

/**
 * Signed URL of a file of an onboarding inscription. Convex only serves ids that belong to
 * that inscription and only to users who may see its attachments; `null` otherwise.
 */
export function useArchivoInscripcionUrl(
  modulo: "supplier" | "customer",
  inscripcionId: string | null | undefined,
  storageId: Id<"_storage"> | null | undefined,
) {
  return useQuery(
    api.facturacionStorage.getUrl,
    storageId && inscripcionId
      ? { storageId, contexto: { tipo: "inscripcion", modulo, inscripcionId } }
      : "skip",
  );
}
