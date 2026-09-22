"use client";

import { FileIcon, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import { formatFileSize } from "./adjuntos-viewer-document-utils";
import type { DocumentoAdjunto } from "./adjuntos-viewer-types";
import { MAX_OPEN_DOCUMENTS } from "./adjuntos-viewer-types";

type AdjuntosViewerSidebarProps = {
  adjuntos: DocumentoAdjunto[];
  selectedIds: string[];
  activeId: string | null;
  overlay?: boolean;
  onToggleDocument: (id: string) => void;
};

export function AdjuntosViewerSidebar({
  adjuntos,
  selectedIds,
  activeId,
  overlay = false,
  onToggleDocument,
}: AdjuntosViewerSidebarProps) {
  const atMax = selectedIds.length >= MAX_OPEN_DOCUMENTS;

  return (
    <aside
      className={cn(
        "overflow-y-auto rounded-lg border border-slate-200 bg-white p-3 shadow-xs",
        overlay ? "absolute inset-y-0 left-0 z-20 w-72 shadow-lg" : "mr-4 w-72 shrink-0"
      )}
      aria-label="Lista de documentos"
    >
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <p className="text-xs font-semibold uppercase text-slate-500">Documentos</p>
        <Badge variant="outline" className="bg-white tabular-nums">
          Máx. {MAX_OPEN_DOCUMENTS}
        </Badge>
      </div>
      {atMax ? (
        <p className="mb-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
          Cierra un documento para abrir otro.
        </p>
      ) : null}
      <div className="space-y-2">
        {adjuntos.map((adjunto) => {
          const selected = selectedIds.includes(adjunto.id);
          const isActive = activeId === adjunto.id;
          const isFacturaPdf = adjunto.kind === "factura_pdf";
          const disabled = !adjunto.url || (!selected && atMax);

          return (
            <button
              key={adjunto.id}
              type="button"
              disabled={disabled}
              aria-pressed={selected}
              aria-current={isActive ? "true" : undefined}
              onClick={() => onToggleDocument(adjunto.id)}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg border bg-white px-3 py-2 text-left text-sm transition",
                isFacturaPdf
                  ? "border-blue-200 bg-blue-50/70"
                  : "border-slate-200 hover:border-slate-300",
                selected &&
                  (isFacturaPdf
                    ? "border-blue-700 ring-1 ring-blue-700"
                    : "border-slate-900 ring-1 ring-slate-900"),
                isActive && "outline outline-2 outline-offset-1 outline-blue-500",
                disabled && "cursor-not-allowed opacity-50"
              )}
            >
              {isFacturaPdf ? (
                <FileText className="h-4 w-4 shrink-0 text-blue-700" aria-hidden="true" />
              ) : (
                <FileIcon className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-slate-900">{adjunto.nombre}</span>
                <span
                  className={cn(
                    "block truncate text-xs",
                    isFacturaPdf ? "font-medium text-blue-700" : "text-slate-500"
                  )}
                >
                  {isFacturaPdf
                    ? "Visualización en PDF de la factura"
                    : typeof adjunto.size === "number"
                      ? formatFileSize(adjunto.size)
                      : "Archivo"}
                </span>
              </span>
              <span
                className={cn(
                  "h-2.5 w-2.5 rounded-full",
                  selected ? (isFacturaPdf ? "bg-blue-700" : "bg-slate-900") : "bg-slate-200"
                )}
                aria-hidden="true"
              />
            </button>
          );
        })}
      </div>
    </aside>
  );
}
