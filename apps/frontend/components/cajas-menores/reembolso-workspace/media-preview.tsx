"use client";

import { useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileIcon,
  FileText,
  Maximize2,
  Minus,
  MoreHorizontal,
  Plus,
  Printer,
  X,
} from "lucide-react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist/types/src/display/api";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PDFJS_WASM_URL } from "@/lib/pdfjs-assets";
import { cn } from "@/lib/utils";

import { getDocumentPreviewUrl } from "./document-model";
import type { DocumentPaneState, ReembolsoDocument } from "./types";

let pdfWorkerConfigured = false;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function isPdfDocument(document: ReembolsoDocument) {
  const mimeType = document.mimeType?.toLowerCase() ?? "";
  const name = document.nombre.toLowerCase();
  return mimeType === "application/pdf" || name.endsWith(".pdf");
}

function isImageDocument(document: ReembolsoDocument) {
  const mimeType = document.mimeType?.toLowerCase() ?? "";
  const name = document.nombre.toLowerCase();
  return (
    mimeType.startsWith("image/") ||
    name.endsWith(".png") ||
    name.endsWith(".jpg") ||
    name.endsWith(".jpeg") ||
    name.endsWith(".webp") ||
    name.endsWith(".gif")
  );
}

async function loadPdfDocument(url: string): Promise<PDFDocumentProxy> {
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

function printFile(url: string) {
  const printWindow = window.open(url, "_blank", "noopener,noreferrer");
  printWindow?.addEventListener("load", () => {
    printWindow.print();
  });
}

function PreviewFallback({
  document,
  message,
}: {
  document: ReembolsoDocument;
  message?: string;
}) {
  const previewUrl = getDocumentPreviewUrl(document);
  return (
    <div className="flex h-full min-h-64 flex-col items-center justify-center gap-3 p-6 text-center">
      <FileIcon className="h-10 w-10 text-slate-300" aria-hidden />
      <div>
        <p className="text-sm font-semibold text-slate-800">{document.nombre}</p>
        <p className="mt-1 text-xs text-slate-500">
          {message ?? "Este formato se abre en otra ventana."}
        </p>
      </div>
      {previewUrl ? (
        <Button asChild variant="outline" size="sm">
          <a href={previewUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="mr-2 h-4 w-4" aria-hidden />
            Abrir archivo
          </a>
        </Button>
      ) : null}
    </div>
  );
}

function NativePdfPreview({
  document,
  message,
}: {
  document: ReembolsoDocument;
  message: string;
}) {
  const previewUrl = getDocumentPreviewUrl(document);
  if (!previewUrl) {
    return <PreviewFallback document={document} message={message} />;
  }
  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-100 p-3">
      <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        No se pudo preparar la vista optimizada. Se muestra la vista nativa del navegador.
        <span className="sr-only"> {message}</span>
      </div>
      <object
        data={previewUrl}
        type="application/pdf"
        className="min-h-0 flex-1 rounded-xs bg-white shadow-xs"
      >
        <PreviewFallback document={document} message={message} />
      </object>
    </div>
  );
}

function PdfPageSkeleton() {
  return (
    <div className="pointer-events-none absolute inset-3 flex items-center justify-center">
      <div className="h-[78%] w-[72%] animate-pulse rounded-xs bg-white shadow-xs">
        <div className="m-8 h-3 rounded-xs bg-slate-100" />
        <div className="mx-8 mt-4 h-3 rounded-xs bg-slate-100" />
        <div className="mx-8 mt-4 h-3 w-2/3 rounded-xs bg-slate-100" />
      </div>
    </div>
  );
}

function PdfCanvasPreview({
  document,
  page,
  zoom,
  onTotalPagesChange,
}: {
  document: ReembolsoDocument;
  page: number;
  zoom: number;
  onTotalPagesChange: (id: string, totalPages: number) => void;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const onTotalPagesChangeRef = useRef(onTotalPagesChange);
  const previewUrl = getDocumentPreviewUrl(document);
  const scrollResetKey = `${document.id}:${page}`;

  useEffect(() => {
    onTotalPagesChangeRef.current = onTotalPagesChange;
  }, [onTotalPagesChange]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setContainerWidth(Math.max(0, entry.contentRect.width - 24));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!previewUrl) {
      setIsLoading(false);
      setError("Documento sin URL de preview.");
      return;
    }

    let cancelled = false;
    let loadedDocument: PDFDocumentProxy | null = null;
    setIsLoading(true);
    setError(null);
    setPdf(null);

    void loadPdfDocument(previewUrl)
      .then((loaded) => {
        loadedDocument = loaded;
        if (cancelled) {
          void loaded.loadingTask.destroy();
          return;
        }
        setPdf(loaded);
        onTotalPagesChangeRef.current(document.id, loaded.numPages);
      })
      .catch((loadError: unknown) => {
        if (cancelled) return;
        setError(
          loadError instanceof Error ? loadError.message : "No se pudo cargar el PDF.",
        );
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
      if (loadedDocument) void loadedDocument.loadingTask.destroy();
    };
  }, [document.id, previewUrl]);

  useEffect(() => {
    if (!pdf || !canvasRef.current || containerWidth <= 0) return;

    let cancelled = false;
    let renderTask: RenderTask | null = null;
    const pageToRender = clamp(page, 1, pdf.numPages);

    void pdf
      .getPage(pageToRender)
      .then((pdfPage) => {
        if (cancelled || !canvasRef.current) return;
        const baseViewport = pdfPage.getViewport({ scale: 1 });
        const fitScale = Math.max(0.1, containerWidth / baseViewport.width);
        const viewport = pdfPage.getViewport({ scale: fitScale * zoom });
        const pixelRatio = window.devicePixelRatio || 1;
        const canvas = canvasRef.current;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("No se pudo preparar el canvas.");

        canvas.width = Math.floor(viewport.width * pixelRatio);
        canvas.height = Math.floor(viewport.height * pixelRatio);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        renderTask = pdfPage.render({
          canvas,
          canvasContext: context,
          viewport,
        });
        return renderTask.promise;
      })
      .catch((renderError: unknown) => {
        if (
          renderError instanceof Error &&
          renderError.name === "RenderingCancelledException"
        ) {
          return;
        }
        setError(
          renderError instanceof Error
            ? renderError.message
            : "No se pudo renderizar.",
        );
      });

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [containerWidth, page, pdf, zoom]);

  // Reset scroll to origin when document or page changes.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.dataset.scrollResetKey === scrollResetKey) return;
    el.dataset.scrollResetKey = scrollResetKey;
    el.scrollTop = 0;
    el.scrollLeft = 0;
  }, [scrollResetKey]);

  return (
    <div
      ref={scrollRef}
      className="relative h-full min-h-0 overflow-auto overscroll-contain bg-slate-100 p-3"
    >
      {isLoading ? <PdfPageSkeleton /> : null}
      {error ? (
        <NativePdfPreview document={document} message={error} />
      ) : (
        <canvas
          ref={canvasRef}
          className="mx-auto block max-w-none rounded-xs bg-white shadow-xs"
          role="img"
          aria-label={`${document.nombre}${
            pdf ? `, página ${page} de ${pdf.numPages}` : ""
          }`}
        />
      )}
    </div>
  );
}

function InlineObjectPreview({
  document,
}: {
  document: ReembolsoDocument;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const previewUrl = getDocumentPreviewUrl(document);
  const scrollResetKey = document.id;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.dataset.scrollResetKey === scrollResetKey) return;
    el.dataset.scrollResetKey = scrollResetKey;
    el.scrollTop = 0;
    el.scrollLeft = 0;
  }, [scrollResetKey]);

  if (!previewUrl) {
    return <PreviewFallback document={document} />;
  }

  return (
    <div
      ref={scrollRef}
      className="h-full min-h-0 overflow-auto overscroll-contain bg-slate-100 p-3"
    >
      <object
        data={previewUrl}
        type={document.mimeType ?? undefined}
        className="mx-auto block min-h-full w-full max-w-none rounded-xs bg-white shadow-xs"
      >
        <PreviewFallback document={document} />
      </object>
    </div>
  );
}

export function ReembolsoMediaPreview({
  document,
  state,
  isFocused = false,
  compact = false,
  documentNav,
  onFocusToggle,
  onPageChange,
  onZoomChange,
  onTotalPagesChange,
  onNavigateDocument,
  onCloseFocus,
}: {
  document: ReembolsoDocument;
  state: DocumentPaneState;
  isFocused?: boolean;
  compact?: boolean;
  documentNav?: { label: string; canNavigate: boolean };
  onFocusToggle: (id: string) => void;
  onPageChange: (id: string, delta: number) => void;
  onZoomChange: (id: string, delta: number) => void;
  onTotalPagesChange: (id: string, totalPages: number) => void;
  onNavigateDocument?: (delta: number) => void;
  onCloseFocus?: () => void;
}) {
  const isPdf = isPdfDocument(document);
  const isImage = isImageDocument(document);
  const isFacturaPdf = document.kind === "factura_pdf";
  const previewUrl = getDocumentPreviewUrl(document);

  if (!document.previewable || !previewUrl) {
    return (
      <article className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-dashed border-slate-200 bg-white">
        <PreviewFallback
          document={document}
          message={
            document.kind === "factura_pdf"
              ? "Esta factura no tiene representación gráfica disponible."
              : "Documento no disponible para previsualizar."
          }
        />
      </article>
    );
  }

  return (
    <article
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-slate-200/70 border-t-2 bg-white shadow-xs",
        isFocused
          ? isFacturaPdf
            ? "border-t-blue-700"
            : "border-t-slate-900"
          : isFacturaPdf
            ? "border-t-blue-300"
            : "border-t-transparent",
      )}
    >
      <header
        className="flex h-10 shrink-0 items-center gap-2 border-b border-slate-200 px-3"
      >
        {isFacturaPdf ? (
          <FileText className="h-4 w-4 shrink-0 text-blue-700" aria-hidden />
        ) : (
          <FileIcon className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
        )}
        <div className="min-w-0 flex-1 text-sm">
          <p
            className="flex min-w-0 items-center gap-2 truncate font-medium text-slate-900"
            title={document.nombre}
          >
            <span className="truncate">{document.nombre}</span>
            {isFacturaPdf ? (
              <span className="hidden shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-blue-700 md:inline">
                PDF factura
              </span>
            ) : null}
          </p>
        </div>
        {isFocused && documentNav && onNavigateDocument ? (
          <div className="flex items-center gap-1 text-xs tabular-nums text-slate-600">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 rounded-md p-0"
              disabled={!documentNav.canNavigate}
              onClick={() => onNavigateDocument(-1)}
              title="Documento anterior"
              aria-label="Documento anterior"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </Button>
            <span className="min-w-12 text-center" aria-live="polite">
              {documentNav.label}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 rounded-md p-0"
              disabled={!documentNav.canNavigate}
              onClick={() => onNavigateDocument(1)}
              title="Documento siguiente"
              aria-label="Documento siguiente"
            >
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        ) : null}
        {isPdf ? (
          <div
            className={cn(
              "hidden items-center gap-1 text-xs tabular-nums text-slate-600",
              !compact && "md:flex",
            )}
          >
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 rounded-md p-0"
              onClick={() => onPageChange(document.id, -1)}
              disabled={state.page <= 1}
              title="Página anterior"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </Button>
            <span className="min-w-24 text-center">
              Página {state.page} de {state.totalPages ?? "-"}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 rounded-md p-0"
              onClick={() => onPageChange(document.id, 1)}
              disabled={state.totalPages ? state.page >= state.totalPages : true}
              title="Página siguiente"
            >
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 rounded-md p-0"
              onClick={() => onZoomChange(document.id, -0.1)}
              title="Alejar"
            >
              <Minus className="h-4 w-4" aria-hidden />
            </Button>
            <span className="min-w-10 text-center">
              {Math.round(state.zoom * 100)}%
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 rounded-md p-0"
              onClick={() => onZoomChange(document.id, 0.1)}
              title="Acercar"
            >
              <Plus className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        ) : null}
        {isFocused && onCloseFocus ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 rounded-lg p-0"
            onClick={onCloseFocus}
            title="Salir de pantalla completa"
            aria-label="Salir de pantalla completa"
          >
            <X className="h-4 w-4" aria-hidden />
          </Button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 rounded-lg p-0"
            onClick={() => onFocusToggle(document.id)}
            title="Enfocar"
            aria-label={`Enfocar ${document.nombre}`}
          >
            <Maximize2 className="h-4 w-4" aria-hidden />
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 rounded-lg p-0"
              title="Más acciones"
            >
              <MoreHorizontal className="h-4 w-4" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <a href={previewUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-2 h-4 w-4" aria-hidden />
                Abrir en pestaña
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a
                href={previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                download={document.nombre}
              >
                <Download className="mr-2 h-4 w-4" aria-hidden />
                Descargar
              </a>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => printFile(previewUrl)}>
              <Printer className="mr-2 h-4 w-4" aria-hidden />
              Imprimir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>
      <div className="min-h-0 flex-1 overflow-hidden bg-slate-100">
        {isPdf ? (
          <PdfCanvasPreview
            document={document}
            page={state.page}
            zoom={state.zoom}
            onTotalPagesChange={onTotalPagesChange}
          />
        ) : isImage ? (
          <InlineObjectPreview document={document} />
        ) : (
          <PreviewFallback document={document} />
        )}
      </div>
    </article>
  );
}
