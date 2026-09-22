"use client";

import { ChevronLeft, ChevronRight, FileText, Paperclip } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ReembolsoMediaPreview } from "@/components/cajas-menores/reembolso-workspace/media-preview";
import type { DocumentPaneState } from "@/components/cajas-menores/reembolso-workspace/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import {
  getDefaultAnticipoDocumentId,
  navigateAnticipoDocuments,
} from "../anticipos-document-model";
import type { AnticipoReviewDocument } from "../types";

const DEFAULT_PANE: DocumentPaneState = {
  page: 1,
  zoom: 1,
  totalPages: null,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function AnticiposDocumentViewer({
  documents,
  loading,
}: {
  documents: AnticipoReviewDocument[];
  loading: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [paneStateById, setPaneStateById] = useState<Record<string, DocumentPaneState>>({});

  useEffect(() => {
    setSelectedId(getDefaultAnticipoDocumentId(documents));
    setFocused(false);
  }, [documents]);

  const selectedDocument = useMemo(
    () => documents.find((document) => document.id === selectedId) ?? null,
    [documents, selectedId]
  );
  const selectedIndex = documents.findIndex((document) => document.id === selectedId);

  const getPaneState = useCallback(
    (id: string) => paneStateById[id] ?? DEFAULT_PANE,
    [paneStateById]
  );

  const changePage = useCallback((id: string, delta: number) => {
    setPaneStateById((current) => {
      const previous = current[id] ?? DEFAULT_PANE;
      const maximum = previous.totalPages ?? previous.page;
      return {
        ...current,
        [id]: {
          ...previous,
          page: clamp(previous.page + delta, 1, maximum),
        },
      };
    });
  }, []);

  const changeZoom = useCallback((id: string, delta: number) => {
    setPaneStateById((current) => {
      const previous = current[id] ?? DEFAULT_PANE;
      return {
        ...current,
        [id]: {
          ...previous,
          zoom: clamp(Number((previous.zoom + delta).toFixed(2)), 0.5, 2.5),
        },
      };
    });
  }, []);

  const setTotalPages = useCallback((id: string, totalPages: number) => {
    setPaneStateById((current) => {
      const previous = current[id] ?? DEFAULT_PANE;
      return {
        ...current,
        [id]: {
          ...previous,
          totalPages,
          page: clamp(previous.page, 1, totalPages),
        },
      };
    });
  }, []);

  const navigate = useCallback(
    (delta: number) => {
      const next = navigateAnticipoDocuments(documents, selectedId, delta);
      if (next) setSelectedId(next);
    },
    [documents, selectedId]
  );

  if (loading && documents.length === 0) {
    return (
      <div className="flex h-full min-h-64 items-center justify-center text-sm text-slate-500">
        Cargando soportes…
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <div className="flex h-full min-h-64 flex-col items-center justify-center gap-2 p-6 text-center">
        <FileText className="h-9 w-9 text-slate-300" aria-hidden />
        <p className="text-sm font-semibold text-slate-900">Sin soportes</p>
        <p className="max-w-sm text-xs leading-5 text-slate-500">
          Esta solicitud no tiene archivos adjuntos en la creación ni en sus fases.
        </p>
      </div>
    );
  }

  return (
    <div
      className="flex h-full min-h-0 flex-col bg-slate-50"
      tabIndex={0}
      onKeyDown={(event) => {
        const target = event.target as HTMLElement;
        if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          navigate(-1);
        }
        if (event.key === "ArrowRight") {
          event.preventDefault();
          navigate(1);
        }
        if (event.key === "Escape" && focused) {
          event.preventDefault();
          setFocused(false);
        }
      }}
      aria-label="Visor de soportes del anticipo"
    >
      <header className="shrink-0 border-b border-slate-200 bg-white px-3 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Paperclip className="h-4 w-4 text-slate-500" aria-hidden />
              Soportes
            </p>
            <p className="mt-0.5 truncate text-xs text-slate-500">
              {selectedDocument?.sourceLabel}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => navigate(-1)}
              disabled={documents.length < 2}
              aria-label="Soporte anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span
              className="min-w-12 text-center text-xs tabular-nums text-slate-600"
              aria-live="polite"
            >
              {selectedIndex >= 0 ? selectedIndex + 1 : 0} de {documents.length}
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => navigate(1)}
              disabled={documents.length < 2}
              aria-label="Soporte siguiente"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="mt-2 flex gap-1.5 overflow-x-auto pb-0.5">
          {documents.map((document) => (
            <button
              key={document.id}
              type="button"
              onClick={() => setSelectedId(document.id)}
              className={cn(
                "flex min-h-8 max-w-56 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-left text-[11px] font-medium transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-600",
                document.id === selectedId
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
              )}
            >
              <span className="truncate">{document.nombre}</span>
              {document.source === "solicitud" ? (
                <Badge className="shrink-0 rounded-full bg-emerald-100 px-1.5 text-[9px] text-emerald-800 hover:bg-emerald-100">
                  Solicitud
                </Badge>
              ) : null}
            </button>
          ))}
        </div>
      </header>

      <div className="min-h-0 flex-1 p-3">
        {selectedDocument ? (
          <ReembolsoMediaPreview
            document={selectedDocument}
            state={getPaneState(selectedDocument.id)}
            isFocused={focused}
            documentNav={{
              label: `${selectedIndex + 1} de ${documents.length}`,
              canNavigate: documents.length > 1,
            }}
            onFocusToggle={() => setFocused(true)}
            onCloseFocus={() => setFocused(false)}
            onNavigateDocument={navigate}
            onPageChange={changePage}
            onZoomChange={changeZoom}
            onTotalPagesChange={setTotalPages}
          />
        ) : null}
      </div>
    </div>
  );
}
