import type { Id } from "@/convex/_generated/dataModel";
import { PDFJS_WASM_URL } from "@/lib/pdfjs-assets";

import type { DocumentoAdjunto, DocumentoAdjuntoPreviewable } from "./adjuntos-viewer-types";

export function getPreviewUrl(adjunto: DocumentoAdjuntoPreviewable) {
  return adjunto.storageId
    ? `/api/convex/storage/${encodeURIComponent(adjunto.storageId)}`
    : adjunto.url;
}

export function isPdfAttachment(adjunto: DocumentoAdjunto) {
  const mimeType = adjunto.mimeType?.toLowerCase() ?? "";
  const name = adjunto.nombre.toLowerCase();
  return mimeType === "application/pdf" || name.endsWith(".pdf");
}

export function isImageAttachment(adjunto: DocumentoAdjunto) {
  const mimeType = adjunto.mimeType?.toLowerCase() ?? "";
  const name = adjunto.nombre.toLowerCase();
  return (
    mimeType.startsWith("image/") ||
    name.endsWith(".png") ||
    name.endsWith(".jpg") ||
    name.endsWith(".jpeg") ||
    name.endsWith(".webp") ||
    name.endsWith(".gif")
  );
}

export function hasPreviewUrl(
  adjunto: DocumentoAdjunto,
): adjunto is DocumentoAdjuntoPreviewable {
  return Boolean(adjunto.url);
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

let pdfWorkerConfigured = false;

export async function loadPdfDocument(url: string) {
  const pdfjs = await import("pdfjs-dist");
  if (!pdfWorkerConfigured) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
    pdfWorkerConfigured = true;
  }
  return await pdfjs.getDocument({
    url,
    // Sin `wasmUrl` pdf.js no puede decodificar imágenes JBIG2/JPEG2000 (lo que
    // producen los escáneres) y renderiza la página en blanco sin lanzar error.
    // Los binarios los copia scripts/copy-pdfjs-assets.mjs a public/pdfjs.
    wasmUrl: PDFJS_WASM_URL,
    disableAutoFetch: true,
    disableRange: true,
    disableStream: true,
  }).promise;
}

export function printFile(url: string) {
  const printWindow = window.open(url, "_blank", "noopener,noreferrer");
  printWindow?.addEventListener("load", () => {
    printWindow.print();
  });
}

export function buildFacturaPdfDocument(
  url: string,
  numeroFactura?: string | null,
  storageId?: Id<"_storage"> | null,
): DocumentoAdjunto {
  return {
    id: "factura-pdf",
    nombre: numeroFactura
      ? `Factura ${numeroFactura} · representación gráfica`
      : "Factura · representación gráfica",
    url,
    ...(storageId ? { storageId } : {}),
    mimeType: "application/pdf",
    subidoPorNombre: "PDF principal de la factura",
    kind: "factura_pdf",
  };
}

export const FACTURA_PDF_DOCUMENT_ID = "factura-pdf";
