import type { Id } from "@/convex/_generated/dataModel";

import type {
  ReembolsoDocument,
  ReembolsoDocumentSource,
  ReembolsoInvoiceItem,
} from "./types";

export function buildFacturaPdfDocumentId(
  facturaId: string,
  storageId?: string | null,
): string {
  return `factura:${facturaId}:pdf:${storageId?.trim() || "primary"}`;
}

export function buildSupportDocumentId(
  facturaId: string,
  key: string,
): string {
  return `factura:${facturaId}:support:${key}`;
}

function isPreviewableUrl(url: string | null | undefined): boolean {
  return Boolean(url?.trim());
}

function isPreviewableMime(nombre: string, mimeType?: string): boolean {
  const mime = mimeType?.toLowerCase() ?? "";
  const name = nombre.toLowerCase();
  if (mime === "application/pdf" || name.endsWith(".pdf")) return true;
  if (mime.startsWith("image/")) return true;
  return (
    name.endsWith(".png") ||
    name.endsWith(".jpg") ||
    name.endsWith(".jpeg") ||
    name.endsWith(".webp") ||
    name.endsWith(".gif")
  );
}

/**
 * Normalize documents for one factura with composite IDs and storage dedupe.
 * Order: primary PDF → legacy support (if unique) → remaining adjuntos newest→oldest.
 */
export function normalizeFacturaDocuments(
  source: ReembolsoDocumentSource,
  urlByStorageId?: Map<string, string>,
): ReembolsoDocument[] {
  const facturaId = String(source.facturaId);
  const documents: ReembolsoDocument[] = [];
  const seenStorageIds = new Set<string>();

  const resolveUrl = (
    storageId: Id<"_storage"> | string | null | undefined,
    fallback?: string | null,
  ) => {
    if (storageId && urlByStorageId?.has(String(storageId))) {
      return urlByStorageId.get(String(storageId)) ?? null;
    }
    return fallback?.trim() || null;
  };

  const pdfStorageId = source.pdfStorageId ?? undefined;
  const pdfUrl = resolveUrl(pdfStorageId, source.pdfUrl);
  if (pdfUrl || pdfStorageId) {
    if (pdfStorageId) seenStorageIds.add(String(pdfStorageId));
    const nombre = source.numeroFactura
      ? `Factura ${source.numeroFactura} · representación gráfica`
      : "Factura · representación gráfica";
    documents.push({
      id: buildFacturaPdfDocumentId(facturaId, pdfStorageId ? String(pdfStorageId) : null),
      facturaId,
      kind: "factura_pdf",
      nombre,
      url: pdfUrl,
      ...(pdfStorageId ? { storageId: pdfStorageId } : {}),
      mimeType: "application/pdf",
      subidoPorNombre: "PDF principal de la factura",
      previewable: isPreviewableUrl(pdfUrl),
    });
  }

  const soporteStorageId = source.soportesStorageId ?? undefined;
  if (soporteStorageId && !seenStorageIds.has(String(soporteStorageId))) {
    seenStorageIds.add(String(soporteStorageId));
    const nombre = source.soportesNombre?.trim() || "Soportes";
    const url = resolveUrl(soporteStorageId);
    documents.push({
      id: buildSupportDocumentId(facturaId, String(soporteStorageId)),
      facturaId,
      kind: "soporte",
      nombre,
      url,
      storageId: soporteStorageId,
      previewable: isPreviewableUrl(url) && isPreviewableMime(nombre),
    });
  }

  const adjuntos = [...(source.adjuntos ?? [])].sort(
    (a, b) => (b.creadoEn ?? 0) - (a.creadoEn ?? 0),
  );

  for (const adjunto of adjuntos) {
    const storageKey = String(adjunto.storageId);
    if (seenStorageIds.has(storageKey)) continue;
    seenStorageIds.add(storageKey);
    const url = resolveUrl(adjunto.storageId, adjunto.url);
    const idKey = adjunto._id ? String(adjunto._id) : storageKey;
    documents.push({
      id: buildSupportDocumentId(facturaId, idKey),
      facturaId,
      kind: "soporte",
      nombre: adjunto.nombre,
      url,
      storageId: adjunto.storageId,
      adjuntoId: adjunto._id,
      mimeType: adjunto.mimeType,
      size: adjunto.size,
      subidoPorNombre: adjunto.subidoPorNombre,
      creadoEn: adjunto.creadoEn,
      previewable:
        isPreviewableUrl(url) &&
        isPreviewableMime(adjunto.nombre, adjunto.mimeType),
    });
  }

  return documents;
}

export function getDocumentPreviewUrl(document: ReembolsoDocument): string | null {
  if (!document.url && !document.storageId) return null;
  if (document.storageId) {
    return `/api/convex/storage/${encodeURIComponent(String(document.storageId))}`;
  }
  return document.url;
}

export function getPrimaryDocument(
  documents: ReembolsoDocument[],
): ReembolsoDocument | null {
  return documents.find((doc) => doc.kind === "factura_pdf") ?? null;
}

export function getDefaultSupportDocument(
  documents: ReembolsoDocument[],
): ReembolsoDocument | null {
  return (
    documents.find((doc) => doc.kind === "soporte" && doc.previewable) ??
    documents.find((doc) => doc.kind === "soporte") ??
    null
  );
}

export function getDefaultViewerSelection(documents: ReembolsoDocument[]): {
  primaryDocumentId: string | null;
  supportDocumentId: string | null;
} {
  const primary = getPrimaryDocument(documents);
  const support = getDefaultSupportDocument(documents);

  if (primary?.previewable) {
    return {
      primaryDocumentId: primary.id,
      supportDocumentId: support?.previewable ? support.id : null,
    };
  }

  const firstPreviewable =
    documents.find((doc) => doc.previewable) ?? documents[0] ?? null;
  return {
    primaryDocumentId: firstPreviewable?.id ?? null,
    supportDocumentId: null,
  };
}

export type NormalizeInvoiceInput = {
  key: string;
  movimientoId: string;
  facturaId: string;
  numeroFactura?: string | null;
  proveedorNombre: string;
  concepto: string;
  observaciones?: string;
  valor: number;
  totalFactura?: number;
  valorContable?: number;
  moneda?: string;
  esReciboFisicoCajaMenor?: boolean;
  centroCostoCodigo: string;
  centroCostoNombre: string;
  centrosCostoDistribucion?: ReembolsoInvoiceItem["centrosCostoDistribucion"];
  fechaPago?: string;
  pdfStorageId?: Id<"_storage"> | null;
  soportesStorageId?: Id<"_storage"> | null;
  soportesNombre?: string | null;
  pdfUrl?: string | null;
  adjuntos?: ReembolsoDocumentSource["adjuntos"];
};

export function normalizeInvoiceItem(
  input: NormalizeInvoiceInput,
  urlByStorageId?: Map<string, string>,
): ReembolsoInvoiceItem {
  const facturaId = String(input.facturaId);
  const documents = normalizeFacturaDocuments(
    {
      facturaId,
      numeroFactura: input.numeroFactura,
      pdfStorageId: input.pdfStorageId,
      pdfUrl: input.pdfUrl,
      soportesStorageId: input.soportesStorageId,
      soportesNombre: input.soportesNombre,
      adjuntos: input.adjuntos,
    },
    urlByStorageId,
  );

  return {
    key: input.key,
    movimientoId: input.movimientoId,
    facturaId,
    numeroFactura: input.numeroFactura?.trim() || facturaId.slice(-6),
    proveedorNombre: input.proveedorNombre,
    concepto: input.concepto,
    ...(input.observaciones ? { observaciones: input.observaciones } : {}),
    valor: input.valor,
    totalFactura: input.totalFactura ?? input.valor,
    valorContable: input.valorContable ?? input.valor,
    moneda: input.moneda ?? "COP",
    ...(input.esReciboFisicoCajaMenor !== undefined
      ? { esReciboFisicoCajaMenor: input.esReciboFisicoCajaMenor }
      : {}),
    centroCostoCodigo: input.centroCostoCodigo,
    centroCostoNombre: input.centroCostoNombre,
    ...(input.centrosCostoDistribucion
      ? { centrosCostoDistribucion: input.centrosCostoDistribucion }
      : {}),
    ...(input.fechaPago ? { fechaPago: input.fechaPago } : {}),
    documents,
  };
}

/** Circular navigation across documents of the active invoice only. */
export function navigateInvoiceDocuments(
  documents: ReembolsoDocument[],
  currentId: string | null,
  delta: number,
): string | null {
  if (documents.length === 0) return null;
  const index = documents.findIndex((doc) => doc.id === currentId);
  const base = index >= 0 ? index : delta > 0 ? -1 : 0;
  const nextIndex = (base + delta + documents.length) % documents.length;
  return documents[nextIndex]?.id ?? null;
}

export function getDocumentNavLabel(
  documents: ReembolsoDocument[],
  currentId: string | null,
): { index: number; total: number; label: string } {
  const total = documents.length;
  const index = documents.findIndex((doc) => doc.id === currentId);
  const displayIndex = index >= 0 ? index + 1 : total > 0 ? 1 : 0;
  return {
    index: displayIndex,
    total,
    label: total > 0 ? `${displayIndex} de ${total}` : "0 de 0",
  };
}
