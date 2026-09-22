import { faseLabels } from "../dashboard/constants";
import type { AnticipoFase, AnticipoRow } from "../dashboard/types";
import type { AnticipoReviewDocument } from "./types";

function inferMimeType(name: string) {
  const normalized = name.toLowerCase();
  if (normalized.endsWith(".pdf")) return "application/pdf";
  if (normalized.endsWith(".png")) return "image/png";
  if (normalized.endsWith(".jpg") || normalized.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (normalized.endsWith(".webp")) return "image/webp";
  if (normalized.endsWith(".gif")) return "image/gif";
  return undefined;
}

function isPreviewable(name: string, mimeType?: string) {
  const mime = mimeType?.toLowerCase() ?? "";
  return mime === "application/pdf" || mime.startsWith("image/");
}

export function normalizeAnticipoDocuments(
  anticipo: AnticipoRow,
  phases: AnticipoFase[] | undefined
): AnticipoReviewDocument[] {
  const documents: AnticipoReviewDocument[] = [];
  const seen = new Set<string>();

  for (const support of anticipo.soportesSolicitud ?? []) {
    const storageKey = String(support.storageId);
    if (seen.has(storageKey)) continue;
    seen.add(storageKey);
    const mimeType = inferMimeType(support.nombre);
    documents.push({
      id: `anticipo:${anticipo._id}:solicitud:${storageKey}`,
      facturaId: String(anticipo._id),
      kind: "soporte",
      storageId: support.storageId,
      nombre: support.nombre,
      url: `/api/convex/storage/${encodeURIComponent(storageKey)}`,
      source: "solicitud",
      sourceLabel: "Soporte de la solicitud",
      mimeType,
      previewable: isPreviewable(support.nombre, mimeType),
    });
  }

  const orderedPhases = [...(phases ?? [])].sort(
    (a, b) => (a.fechaInicio ?? a._creationTime) - (b.fechaInicio ?? b._creationTime)
  );
  for (const phase of orderedPhases) {
    for (const attachment of phase.adjuntos ?? []) {
      const storageKey = String(attachment.storageId);
      if (seen.has(storageKey)) continue;
      seen.add(storageKey);
      const mimeType = inferMimeType(attachment.nombre);
      documents.push({
        id: `anticipo:${anticipo._id}:fase:${phase._id}:${storageKey}`,
        facturaId: String(anticipo._id),
        kind: "soporte",
        storageId: attachment.storageId,
        nombre: attachment.nombre,
        url: `/api/convex/storage/${encodeURIComponent(storageKey)}`,
        source: "fase",
        sourceLabel: faseLabels[phase.fase] ?? phase.fase,
        phase: phase.fase,
        mimeType,
        createdAt: phase.fechaInicio ?? phase._creationTime,
        previewable: isPreviewable(attachment.nombre, mimeType),
      });
    }
  }

  return documents;
}

export function getDefaultAnticipoDocumentId(documents: AnticipoReviewDocument[]) {
  return (
    documents.find((document) => document.source === "solicitud")?.id ?? documents[0]?.id ?? null
  );
}

export function navigateAnticipoDocuments(
  documents: AnticipoReviewDocument[],
  currentId: string | null,
  delta: number
) {
  if (documents.length === 0) return null;
  const currentIndex = documents.findIndex((document) => document.id === currentId);
  const base = currentIndex >= 0 ? currentIndex : delta > 0 ? -1 : 0;
  return documents[(base + delta + documents.length) % documents.length]?.id ?? null;
}
