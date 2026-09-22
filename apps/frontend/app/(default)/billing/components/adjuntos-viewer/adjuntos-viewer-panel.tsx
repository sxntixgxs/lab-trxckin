"use client";

import {
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileIcon,
  FileText,
  Maximize2,
  Minimize2,
  Minus,
  MoreHorizontal,
  Plus,
  Printer,
  RotateCw,
  Star,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

import {
  InlineObjectPreview,
  PdfCanvasPreview,
  PreviewFallback,
} from "./adjuntos-pdf-preview";
import {
  formatFileSize,
  getPreviewUrl,
  isImageAttachment,
  isPdfAttachment,
  printFile,
} from "./adjuntos-viewer-document-utils";
import type { DocumentoAdjuntoPreviewable, PaneState, ZoomMode } from "./adjuntos-viewer-types";
import { ZOOM_MODE_LABELS } from "./adjuntos-viewer-types";
import { formatZoomLabel } from "./adjuntos-viewer-utils";

type AdjuntosViewerPanelProps = {
  adjunto: DocumentoAdjuntoPreviewable;
  state: PaneState;
  isActive: boolean;
  isPrimary: boolean;
  isMaximized: boolean;
  narrowToolbar?: boolean;
  canClose: boolean;
  onActivate: () => void;
  onClose: () => void;
  onMakePrimary: () => void;
  onToggleMaximize: () => void;
  onPageChange: (delta: number) => void;
  onZoomStep: (delta: number) => void;
  onZoomModeChange: (mode: ZoomMode) => void;
  onManualZoomChange: (value: number) => void;
  onRotatePage: () => void;
  onStateChange: (patch: Partial<PaneState>) => void;
  onTotalPagesChange: (id: string, totalPages: number) => void;
};

export function AdjuntosViewerPanel({
  adjunto,
  state,
  isActive,
  isPrimary,
  isMaximized,
  narrowToolbar = false,
  canClose,
  onActivate,
  onClose,
  onMakePrimary,
  onToggleMaximize,
  onPageChange,
  onZoomStep,
  onZoomModeChange,
  onManualZoomChange,
  onRotatePage,
  onStateChange,
  onTotalPagesChange,
}: AdjuntosViewerPanelProps) {
  const isPdf = isPdfAttachment(adjunto);
  const isImage = isImageAttachment(adjunto);
  const isFacturaPdf = adjunto.kind === "factura_pdf";
  const zoomLabel =
    state.zoomMode === "manual"
      ? formatZoomLabel(state.manualZoom)
      : ZOOM_MODE_LABELS[state.zoomMode];

  return (
    <article
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-lg border border-slate-200/70 border-t-2 bg-white shadow-xs",
        isActive
          ? isFacturaPdf
            ? "border-t-blue-700 ring-1 ring-blue-200"
            : "border-t-slate-900 ring-1 ring-slate-200"
          : isFacturaPdf
            ? "border-t-blue-300"
            : "border-t-transparent",
      )}
      aria-current={isActive ? "true" : undefined}
      onMouseDown={onActivate}
    >
      <header className="shrink-0 border-b border-slate-200 px-2 py-2">
        <div className="flex items-center gap-1.5">
          {isFacturaPdf ? (
            <FileText className="h-4 w-4 shrink-0 text-blue-700" aria-hidden="true" />
          ) : (
            <FileIcon className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-900" title={adjunto.nombre}>
              {adjunto.nombre}
            </p>
            <p className="truncate text-[11px] text-slate-500">
              {isActive ? "Activo" : "Inactivo"}
              {isPrimary ? " · Principal" : ""}
              {typeof adjunto.size === "number" ? ` · ${formatFileSize(adjunto.size)}` : ""}
            </p>
          </div>
          {canClose ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 shrink-0 rounded-lg p-0"
              onClick={(event) => {
                event.stopPropagation();
                onClose();
              }}
              title="Cerrar documento"
              aria-label="Cerrar documento"
            >
              <X className="h-4 w-4" />
            </Button>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 shrink-0 rounded-lg p-0"
                title="Menú de archivo"
                aria-label="Menú de archivo"
                onClick={(event) => event.stopPropagation()}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
              <DropdownMenuItem
                onClick={() => {
                  onMakePrimary();
                }}
              >
                <Star className="mr-2 h-4 w-4" />
                Hacer principal
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <a href={adjunto.url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Abrir en pestaña
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href={getPreviewUrl(adjunto)} download={adjunto.nombre}>
                  <Download className="mr-2 h-4 w-4" />
                  Descargar
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => printFile(getPreviewUrl(adjunto))}>
                <Printer className="mr-2 h-4 w-4" />
                Imprimir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {isPdf ? (
          <div
            className={cn(
              "mt-2 flex flex-wrap items-center gap-1",
              narrowToolbar && "max-w-full",
            )}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center gap-0.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-7 rounded-md p-0"
                onClick={() => onPageChange(-1)}
                disabled={state.page <= 1}
                title="Página anterior"
                aria-label="Página anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="min-w-14 text-center text-xs tabular-nums text-slate-600">
                {state.page} / {state.totalPages ?? "-"}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-7 rounded-md p-0"
                onClick={() => onPageChange(1)}
                disabled={state.totalPages ? state.page >= state.totalPages : true}
                title="Página siguiente"
                aria-label="Página siguiente"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex items-center gap-0.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-7 rounded-md p-0"
                onClick={() => onZoomStep(-0.1)}
                title="Alejar"
                aria-label="Alejar"
              >
                <Minus className="h-4 w-4" />
              </Button>
              <Select
                value={state.zoomMode === "manual" ? "manual" : state.zoomMode}
                onValueChange={(value) => {
                  if (value === "manual") {
                    onZoomModeChange("manual");
                    return;
                  }
                  onZoomModeChange(value as ZoomMode);
                }}
              >
                <SelectTrigger
                  className="h-7 w-[108px] rounded-md border-slate-200 px-2 text-xs"
                  aria-label="Modo de escala"
                >
                  <SelectValue>{zoomLabel}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fit-page">{ZOOM_MODE_LABELS["fit-page"]}</SelectItem>
                  <SelectItem value="fit-width">{ZOOM_MODE_LABELS["fit-width"]}</SelectItem>
                  <SelectItem value="manual">{formatZoomLabel(state.manualZoom)}</SelectItem>
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-7 rounded-md p-0"
                onClick={() => onZoomStep(0.1)}
                title="Acercar"
                aria-label="Acercar"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex items-center gap-0.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 rounded-md px-2 text-xs"
                onClick={() => onZoomModeChange("fit-page")}
                title="Ajustar página"
              >
                Página
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 rounded-md px-2 text-xs"
                onClick={() => onZoomModeChange("fit-width")}
                title="Ajustar ancho"
              >
                Ancho
              </Button>
              <Select
                value={String(Math.round(state.manualZoom * 100))}
                onValueChange={(value) => {
                  onManualZoomChange(Number(value) / 100);
                }}
              >
                <SelectTrigger
                  className="h-7 w-[72px] rounded-md border-slate-200 px-2 text-xs"
                  aria-label="Escala manual"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[25, 50, 75, 100, 125, 150, 200, 300, 400].map((value) => (
                    <SelectItem key={value} value={String(value)}>
                      {value}%
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-7 rounded-md p-0"
                onClick={onRotatePage}
                title="Girar 90° horario"
                aria-label="Girar 90° horario"
              >
                <RotateCw className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-7 rounded-md p-0"
                onClick={onToggleMaximize}
                title={isMaximized ? "Restaurar distribución" : "Maximizar panel"}
                aria-label={isMaximized ? "Restaurar distribución" : "Maximizar panel"}
              >
                {isMaximized ? (
                  <Minimize2 className="h-4 w-4" />
                ) : (
                  <Maximize2 className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-2 flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 rounded-md p-0"
              onClick={onToggleMaximize}
              title={isMaximized ? "Restaurar distribución" : "Maximizar panel"}
              aria-label={isMaximized ? "Restaurar distribución" : "Maximizar panel"}
            >
              {isMaximized ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )}
            </Button>
          </div>
        )}
      </header>

      <div className="min-h-0 flex-1 bg-slate-100">
        {isPdf ? (
          <PdfCanvasPreview
            adjunto={adjunto}
            state={state}
            onStateChange={onStateChange}
            onTotalPagesChange={onTotalPagesChange}
          />
        ) : isImage ? (
          <InlineObjectPreview adjunto={adjunto} />
        ) : (
          <PreviewFallback adjunto={adjunto} />
        )}
      </div>
    </article>
  );
}
