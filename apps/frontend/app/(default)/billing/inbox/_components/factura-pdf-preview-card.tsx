import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileIcon,
  FileText,
  Maximize2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { BuzonTarea } from "../../components/buzon-row";
import {
  AdjuntosPreviewDialog,
  buildFacturaPdfDocument,
  FACTURA_PDF_DOCUMENT_ID,
  toDocumentoAdjunto,
  type AdjuntoConUrl,
  type DocumentoAdjunto,
} from "../../components/buzon-adjuntos-dialog";

export function FacturaPdfPreviewCard({
  tarea,
  className = "",
  heightClassName = "h-[420px]",
}: {
  tarea: BuzonTarea;
  className?: string;
  heightClassName?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [viewerIds, setViewerIds] = useState<string[]>([FACTURA_PDF_DOCUMENT_ID]);
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);
  const factura = tarea.factura;
  const pdfUrl = tarea.pdfUrl;
  const supportAdjuntos = useQuery(
    api.facturacionAdjuntos.listarPorFactura,
    tarea.facturaId ? { facturaId: tarea.facturaId } : "skip",
  );

  const viewerDocuments = useMemo<DocumentoAdjunto[]>(() => {
    const documents: DocumentoAdjunto[] = [];
    if (pdfUrl) {
      documents.push(
        buildFacturaPdfDocument(
          pdfUrl,
          factura?.numeroFactura,
          factura?.pdfStorageId,
        ),
      );
    }
    if (supportAdjuntos) {
      documents.push(...(supportAdjuntos as AdjuntoConUrl[]).map(toDocumentoAdjunto));
    }
    return documents;
  }, [factura?.numeroFactura, factura?.pdfStorageId, pdfUrl, supportAdjuntos]);

  const previewableDocuments = viewerDocuments.filter(hasDocumentUrl);
  const activeDocument =
    (activeDocumentId
      ? previewableDocuments.find((documento) => documento.id === activeDocumentId)
      : null) ??
    previewableDocuments.find((documento) => documento.id === FACTURA_PDF_DOCUMENT_ID) ??
    previewableDocuments[0] ??
    null;
  const activeDocumentUrl = activeDocument ? getDocumentPreviewUrl(activeDocument) : null;
  const activeDocumentIndex = activeDocument
    ? previewableDocuments.findIndex((documento) => documento.id === activeDocument.id)
    : -1;
  const activeDocumentNumber = activeDocumentIndex >= 0 ? activeDocumentIndex + 1 : 0;
  const activeDocumentIsPdf = activeDocument ? isPdfDocument(activeDocument) : false;
  const activeDocumentIsImage = activeDocument ? isImageDocument(activeDocument) : false;
  const activeViewerUrl =
    activeDocumentUrl && activeDocumentIsPdf ? getPdfViewerUrl(activeDocumentUrl) : null;
  const facturaPdfId =
    previewableDocuments.find((documento) => documento.kind === "factura_pdf")?.id ?? null;
  const title = activeDocument
    ? (activeDocument.kind === "factura_pdf" ? "Representación gráfica" : "Adjunto") +
      " " +
      activeDocument.nombre
    : "Representación gráfica " + (factura?.numeroFactura ?? "factura");

  function navigateDocument(delta: number) {
    if (previewableDocuments.length === 0) return;
    const fallbackIndex = delta > 0 ? -1 : 0;
    const index = activeDocumentIndex >= 0 ? activeDocumentIndex : fallbackIndex;
    const nextIndex = (index + delta + previewableDocuments.length) % previewableDocuments.length;
    const nextDocument = previewableDocuments[nextIndex];
    if (nextDocument) setActiveDocumentId(nextDocument.id);
  }

  function openExpandedViewer() {
    if (!activeDocument) return;
    setViewerIds(
      activeDocument.kind !== "factura_pdf" && facturaPdfId
        ? [facturaPdfId, activeDocument.id]
        : [activeDocument.id],
    );
    setExpanded(true);
  }

  return (
    <>
      <section className={["overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs", className].filter(Boolean).join(" ")}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-semibold text-slate-950">
              {activeDocument?.kind === "soporte" ? (
                <FileIcon className="h-4 w-4 text-slate-500" />
              ) : (
                <FileText className="h-4 w-4 text-slate-500" />
              )}
              {activeDocument?.kind === "soporte" ? "Adjunto" : "Representación gráfica"}
            </p>
            <p className="mt-0.5 truncate text-xs text-slate-500">
              {activeDocument
                ? activeDocument.kind === "factura_pdf"
                  ? "#" + (factura?.numeroFactura ?? "-") + " · " + (factura?.proveedorNombre ?? "Factura")
                  : activeDocument.nombre
                : "#" + (factura?.numeroFactura ?? "-") + " · " + (factura?.proveedorNombre ?? "Factura")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-white px-1 py-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-7 rounded-full p-0"
                disabled={previewableDocuments.length <= 1}
                onClick={() => navigateDocument(-1)}
                title="Documento anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="min-w-16 px-1 text-center text-xs font-semibold tabular-nums text-slate-600">
                {activeDocumentNumber || "-"} de {previewableDocuments.length}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-7 rounded-full p-0"
                disabled={previewableDocuments.length <= 1}
                onClick={() => navigateDocument(1)}
                title="Documento siguiente"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 rounded-lg"
              disabled={!activeDocumentUrl}
              onClick={openExpandedViewer}
            >
              <Maximize2 className="mr-1.5 h-3.5 w-3.5" />
              Expandir
            </Button>
            {activeDocumentUrl ? (
              <Button asChild variant="ghost" size="sm" className="h-8 rounded-lg">
                <a href={activeDocumentUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                  Abrir
                </a>
              </Button>
            ) : null}
          </div>
        </div>

        {activeDocumentUrl && activeViewerUrl ? (
          <div className={"bg-slate-100 " + heightClassName}>
            <iframe
              title={title}
              src={activeViewerUrl}
              className="h-full w-full bg-white"
              loading="lazy"
            />
          </div>
        ) : activeDocumentUrl && activeDocumentIsImage ? (
          <div className={"bg-slate-100 p-3 " + heightClassName}>
            <object
              data={activeDocumentUrl}
              type={activeDocument?.mimeType ?? undefined}
              className="h-full w-full rounded-xs bg-white object-contain shadow-xs"
            >
              <InlineFileFallback url={activeDocumentUrl} name={activeDocument?.nombre} />
            </object>
          </div>
        ) : activeDocumentUrl && activeDocument ? (
          <div className={"bg-slate-100 " + heightClassName}>
            <InlineFileFallback url={activeDocumentUrl} name={activeDocument.nombre} />
          </div>
        ) : (
          <div className={"flex flex-col items-center justify-center gap-2 bg-slate-50 px-4 text-center " + heightClassName}>
            <FileText className="h-8 w-8 text-slate-300" />
            <div>
              <p className="text-sm font-semibold text-slate-700">
                Sin documentos disponibles
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Esta factura no tiene PDF ni adjuntos cargados todavía.
              </p>
            </div>
          </div>
        )}
      </section>

      <AdjuntosPreviewDialog
        open={expanded}
        onOpenChange={setExpanded}
        adjuntos={viewerDocuments}
        selectedIds={viewerIds}
        initialFocusedId={activeDocument?.id ?? FACTURA_PDF_DOCUMENT_ID}
        onSelectedIdsChange={setViewerIds}
      />
    </>
  );
}

function InlineFileFallback({ url, name }: { url: string; name?: string }) {
  return (
    <div className="flex h-full min-h-64 flex-col items-center justify-center gap-3 p-6 text-center">
      <FileIcon className="h-10 w-10 text-slate-300" />
      <div>
        <p className="text-sm font-semibold text-slate-800">{name ?? "Archivo"}</p>
        <p className="mt-1 text-xs text-slate-500">
          Este formato se abre en otra ventana.
        </p>
      </div>
      <Button asChild variant="outline" size="sm">
        <a href={url} target="_blank" rel="noopener noreferrer">
          <ExternalLink className="mr-2 h-4 w-4" />
          Abrir archivo
        </a>
      </Button>
    </div>
  );
}

function hasDocumentUrl(documento: DocumentoAdjunto): documento is DocumentoAdjunto & { url: string } {
  return Boolean(documento.url);
}

function getDocumentPreviewUrl(documento: DocumentoAdjunto & { url: string }) {
  return documento.storageId
    ? "/api/convex/storage/" + encodeURIComponent(String(documento.storageId))
    : documento.url;
}

function getPdfViewerUrl(url: string) {
  return url + (url.includes("#") ? "&" : "#") + "toolbar=0&navpanes=0&view=FitH";
}

function isPdfDocument(documento: DocumentoAdjunto) {
  const mimeType = documento.mimeType?.toLowerCase() ?? "";
  const name = documento.nombre.toLowerCase();
  return mimeType === "application/pdf" || name.endsWith(".pdf");
}

function isImageDocument(documento: DocumentoAdjunto) {
  const mimeType = documento.mimeType?.toLowerCase() ?? "";
  const name = documento.nombre.toLowerCase();
  return (
    mimeType.startsWith("image/") ||
    name.endsWith(".png") ||
    name.endsWith(".jpg") ||
    name.endsWith(".jpeg") ||
    name.endsWith(".webp") ||
    name.endsWith(".gif")
  );
}
