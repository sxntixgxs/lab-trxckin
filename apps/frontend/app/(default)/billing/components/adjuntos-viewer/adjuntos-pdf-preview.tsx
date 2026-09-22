"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist/types/src/display/api";

import { Button } from "@/components/ui/button";
import { ExternalLink, FileIcon } from "lucide-react";

import type { DocumentoAdjuntoPreviewable } from "./adjuntos-viewer-types";
import type { PaneState } from "./adjuntos-viewer-types";
import { computeRenderScale, getPageRotation } from "./adjuntos-viewer-utils";
import { getPreviewUrl, isPdfAttachment, loadPdfDocument } from "./adjuntos-viewer-document-utils";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function PdfCanvasPreview({
  adjunto,
  state,
  onStateChange,
  onTotalPagesChange,
}: {
  adjunto: DocumentoAdjuntoPreviewable;
  state: PaneState;
  onStateChange: (patch: Partial<PaneState>) => void;
  onTotalPagesChange: (id: string, totalPages: number) => void;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [renderedScale, setRenderedScale] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const onTotalPagesChangeRef = useRef(onTotalPagesChange);
  const onStateChangeRef = useRef(onStateChange);
  const renderFrameRef = useRef<number | null>(null);
  const previewUrl = getPreviewUrl(adjunto);
  const pageRotation = getPageRotation(state, state.page);

  useEffect(() => {
    onTotalPagesChangeRef.current = onTotalPagesChange;
    onStateChangeRef.current = onStateChange;
  }, [onStateChange, onTotalPagesChange]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    const observer = new ResizeObserver(([entry]) => {
      setContainerSize({
        width: Math.max(0, entry.contentRect.width),
        height: Math.max(0, entry.contentRect.height),
      });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let loadedDocument: PDFDocumentProxy | null = null;

    void loadPdfDocument(previewUrl)
      .then((document) => {
        loadedDocument = document;
        if (cancelled) {
          void document.loadingTask.destroy();
          return;
        }
        setPdf(document);
        onTotalPagesChangeRef.current(adjunto.id, document.numPages);
      })
      .catch((loadError: unknown) => {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : "No se pudo cargar el PDF.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
      if (loadedDocument) void loadedDocument.loadingTask.destroy();
    };
  }, [adjunto.id, previewUrl]);

  useEffect(() => {
    if (!pdf || !canvasRef.current || containerSize.width <= 0 || containerSize.height <= 0) {
      return;
    }

    let cancelled = false;
    let renderTask: RenderTask | null = null;
    const pageToRender = clamp(state.page, 1, pdf.numPages);

    if (renderFrameRef.current !== null) {
      cancelAnimationFrame(renderFrameRef.current);
    }

    renderFrameRef.current = requestAnimationFrame(() => {
      void pdf
        .getPage(pageToRender)
        .then(async (pdfPage) => {
          if (cancelled || !canvasRef.current || !scrollRef.current) return;

          const nativeRotation = pdfPage.rotate ?? 0;
          const totalRotation = (nativeRotation + pageRotation) % 360;
          const baseViewport = pdfPage.getViewport({ scale: 1, rotation: totalRotation });
          const scale = computeRenderScale({
            zoomMode: state.zoomMode,
            manualZoom: state.manualZoom,
            containerWidth: containerSize.width,
            containerHeight: containerSize.height,
            pageWidth: baseViewport.width,
            pageHeight: baseViewport.height,
            rotation: 0,
          });
          setRenderedScale(scale);

          const viewport = pdfPage.getViewport({ scale, rotation: totalRotation });
          const scrollElement = scrollRef.current;
          const previousCenterX = scrollElement.scrollLeft + scrollElement.clientWidth / 2;
          const previousCenterY = scrollElement.scrollTop + scrollElement.clientHeight / 2;
          const previousWidth = canvasRef.current.width || viewport.width;
          const previousHeight = canvasRef.current.height || viewport.height;
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
          await renderTask.promise;

          if (cancelled || !scrollRef.current) return;

          const widthRatio = viewport.width / Math.max(1, previousWidth);
          const heightRatio = viewport.height / Math.max(1, previousHeight);
          const nextScrollLeft = previousCenterX * widthRatio - scrollElement.clientWidth / 2;
          const nextScrollTop = previousCenterY * heightRatio - scrollElement.clientHeight / 2;
          scrollElement.scrollLeft = Math.max(0, nextScrollLeft);
          scrollElement.scrollTop = Math.max(0, nextScrollTop);
          onStateChangeRef.current({
            scrollLeft: scrollElement.scrollLeft,
            scrollTop: scrollElement.scrollTop,
          });
        })
        .catch((renderError: unknown) => {
          if (
            renderError instanceof Error &&
            renderError.name === "RenderingCancelledException"
          ) {
            return;
          }
          setError(renderError instanceof Error ? renderError.message : "No se pudo renderizar.");
        });
    });

    return () => {
      cancelled = true;
      if (renderFrameRef.current !== null) {
        cancelAnimationFrame(renderFrameRef.current);
      }
      renderTask?.cancel();
    };
  }, [
    containerSize.height,
    containerSize.width,
    pageRotation,
    pdf,
    state.manualZoom,
    state.page,
    state.zoomMode,
  ]);

  return (
    <div
      ref={scrollRef}
      className="relative h-full overflow-auto bg-slate-100 p-3"
      onScroll={(event) => {
        const target = event.currentTarget;
        onStateChange({
          scrollTop: target.scrollTop,
          scrollLeft: target.scrollLeft,
        });
      }}
    >
      {isLoading && <PdfPageSkeleton />}
      {error ? (
        <NativePdfPreview adjunto={adjunto} message={error} />
      ) : (
        <canvas
          ref={canvasRef}
          className="mx-auto block rounded-xs bg-white shadow-xs"
          aria-label={`Vista PDF de ${adjunto.nombre} al ${Math.round(renderedScale * 100)}%`}
        />
      )}
    </div>
  );
}

function NativePdfPreview({
  adjunto,
  message,
}: {
  adjunto: DocumentoAdjuntoPreviewable;
  message: string;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-100 p-3">
      <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        No se pudo preparar la vista optimizada. Se muestra la vista nativa del navegador.
        <span className="sr-only"> {message}</span>
      </div>
      <object
        data={getPreviewUrl(adjunto)}
        type="application/pdf"
        className="min-h-0 flex-1 rounded-xs bg-white shadow-xs"
      >
        <PreviewFallback adjunto={adjunto} message={message} />
      </object>
    </div>
  );
}

export function InlineObjectPreview({ adjunto }: { adjunto: DocumentoAdjuntoPreviewable }) {
  return (
    <div className="h-full overflow-auto bg-slate-100 p-3">
      <object
        data={getPreviewUrl(adjunto)}
        type={adjunto.mimeType ?? undefined}
        className="mx-auto block min-h-full w-full rounded-xs bg-white shadow-xs"
      >
        <PreviewFallback adjunto={adjunto} />
      </object>
    </div>
  );
}

export function PreviewFallback({
  adjunto,
  message,
}: {
  adjunto: DocumentoAdjuntoPreviewable;
  message?: string;
}) {
  return (
    <div className="flex h-full min-h-64 flex-col items-center justify-center gap-3 p-6 text-center">
      <FileIcon className="h-10 w-10 text-slate-300" />
      <div>
        <p className="text-sm font-semibold text-slate-800">{adjunto.nombre}</p>
        <p className="mt-1 text-xs text-slate-500">
          {message ?? "Este formato se abre en otra ventana."}
        </p>
      </div>
      <Button asChild variant="outline" size="sm">
        <a href={adjunto.url} target="_blank" rel="noopener noreferrer">
          <ExternalLink className="mr-2 h-4 w-4" />
          Abrir archivo
        </a>
      </Button>
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
