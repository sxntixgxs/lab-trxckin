"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileText } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import {
  getDefaultViewerSelection,
  getDocumentNavLabel,
  navigateInvoiceDocuments,
} from "./document-model";
import { ReembolsoMediaPreview } from "./media-preview";
import type {
  DocumentPaneState,
  ReembolsoDocument,
  ReembolsoInvoiceItem,
} from "./types";

const DEFAULT_PANE: DocumentPaneState = {
  page: 1,
  zoom: 1,
  totalPages: null,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function ReembolsoDocumentViewer({
  invoice,
  documentsLoading,
  onFocusModeChange,
}: {
  invoice: ReembolsoInvoiceItem | null;
  documentsLoading?: boolean;
  onFocusModeChange?: (focused: boolean) => void;
}) {
  const documents = invoice?.documents ?? [];
  const [primaryId, setPrimaryId] = useState<string | null>(null);
  const [supportId, setSupportId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [paneStateById, setPaneStateById] = useState<
    Record<string, DocumentPaneState>
  >({});

  useEffect(() => {
    if (!invoice) {
      setPrimaryId(null);
      setSupportId(null);
      setFocusedId(null);
      return;
    }
    const selection = getDefaultViewerSelection(invoice.documents);
    setPrimaryId(selection.primaryDocumentId);
    setSupportId(selection.supportDocumentId);
    setFocusedId(null);
  }, [invoice]);

  useEffect(() => {
    onFocusModeChange?.(Boolean(focusedId));
  }, [focusedId, onFocusModeChange]);

  // Keep focusedId valid if the active invoice's document list changes.
  useEffect(() => {
    if (!focusedId) return;
    if (!documents.some((doc) => doc.id === focusedId)) {
      setFocusedId(null);
    }
  }, [documents, focusedId]);

  const documentById = useMemo(() => {
    const map = new Map<string, ReembolsoDocument>();
    for (const document of documents) map.set(document.id, document);
    return map;
  }, [documents]);

  const primaryDoc = primaryId ? documentById.get(primaryId) ?? null : null;
  const supportDoc = supportId ? documentById.get(supportId) ?? null : null;
  const focusedDoc = focusedId ? documentById.get(focusedId) ?? null : null;

  const getPaneState = useCallback(
    (id: string) => paneStateById[id] ?? DEFAULT_PANE,
    [paneStateById],
  );

  const changePage = useCallback((id: string, delta: number) => {
    setPaneStateById((current) => {
      const prev = current[id] ?? DEFAULT_PANE;
      const max = prev.totalPages ?? prev.page + Math.max(0, delta);
      return {
        ...current,
        [id]: {
          ...prev,
          page: clamp(prev.page + delta, 1, max),
        },
      };
    });
  }, []);

  const changeZoom = useCallback((id: string, delta: number) => {
    setPaneStateById((current) => {
      const prev = current[id] ?? DEFAULT_PANE;
      return {
        ...current,
        [id]: {
          ...prev,
          zoom: clamp(Number((prev.zoom + delta).toFixed(2)), 0.5, 2.5),
        },
      };
    });
  }, []);

  const setTotalPages = useCallback((id: string, totalPages: number) => {
    setPaneStateById((current) => {
      const prev = current[id] ?? DEFAULT_PANE;
      return {
        ...current,
        [id]: {
          ...prev,
          totalPages,
          page: clamp(prev.page, 1, totalPages),
        },
      };
    });
  }, []);

  const toggleFocus = useCallback((id: string) => {
    setFocusedId((current) => (current === id ? null : id));
  }, []);

  const selectSupport = useCallback(
    (documentId: string) => {
      const doc = documentById.get(documentId);
      if (!doc) return;
      if (focusedId) {
        setFocusedId(documentId);
      }
      if (doc.kind === "factura_pdf") {
        setPrimaryId(documentId);
        return;
      }
      if (!primaryDoc || primaryDoc.kind !== "factura_pdf") {
        setPrimaryId(documentId);
        setSupportId(null);
        return;
      }
      setSupportId(documentId);
    },
    [documentById, focusedId, primaryDoc],
  );

  const navigateFocusedDocument = useCallback(
    (delta: number) => {
      const nextId = navigateInvoiceDocuments(documents, focusedId, delta);
      if (!nextId) return;
      const next = documentById.get(nextId);
      if (!next) return;
      setFocusedId(nextId);
      if (next.kind === "factura_pdf") {
        setPrimaryId(nextId);
      } else {
        setSupportId(nextId);
      }
    },
    [documentById, documents, focusedId],
  );

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
      ) {
        return;
      }
      if (event.key === "Escape" && focusedId) {
        event.preventDefault();
        event.stopPropagation();
        setFocusedId(null);
        return;
      }
      // Document arrows only while expanded — never change factura.
      if (!focusedId) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        navigateFocusedDocument(-1);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        navigateFocusedDocument(1);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [focusedId, navigateFocusedDocument]);

  if (!invoice) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-500">
        Selecciona una factura para revisar documentos.
      </div>
    );
  }

  if (documentsLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-500">
        Cargando documentos…
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <FileText className="h-8 w-8 text-slate-300" aria-hidden />
        <p className="text-sm font-semibold text-slate-800">Sin documentos</p>
        <p className="text-xs text-slate-500">
          Esta factura no tiene PDF ni soportes adjuntos.
        </p>
      </div>
    );
  }

  const showSideBySide =
    Boolean(primaryDoc?.previewable) &&
    Boolean(supportDoc?.previewable) &&
    !focusedDoc;
  const activePaneDoc = focusedDoc ?? primaryDoc;
  const focusedNav = focusedDoc
    ? getDocumentNavLabel(documents, focusedDoc.id)
    : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-slate-200 bg-white px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-slate-900">
            #{invoice.numeroFactura}
          </p>
          <span className="text-xs text-slate-500">{invoice.proveedorNombre}</span>
          {!documents.some((doc) => doc.kind === "factura_pdf" && doc.previewable) ? (
            <Badge
              variant="outline"
              className="border-amber-200 bg-amber-50 text-[10px] text-amber-800"
            >
              Sin representación gráfica
            </Badge>
          ) : null}
        </div>
        <div className="mt-2 flex gap-1.5 overflow-x-auto pb-0.5">
          {documents.map((document) => {
            const selected =
              document.id === primaryId ||
              document.id === supportId ||
              document.id === focusedId;
            return (
              <Button
                key={document.id}
                type="button"
                size="sm"
                variant={selected ? "default" : "outline"}
                className={cn(
                  "h-7 shrink-0 rounded-lg px-2 text-[11px]",
                  document.kind === "factura_pdf" &&
                    selected &&
                    "bg-blue-700 hover:bg-blue-800",
                )}
                disabled={!document.previewable && !document.url}
                onClick={() => selectSupport(document.id)}
              >
                {document.kind === "factura_pdf" ? "PDF" : document.nombre}
              </Button>
            );
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden p-3">
        {focusedDoc ? (
          <div className="h-full min-h-0">
            <ReembolsoMediaPreview
              document={focusedDoc}
              state={getPaneState(focusedDoc.id)}
              isFocused
              documentNav={
                focusedNav
                  ? {
                      label: focusedNav.label,
                      canNavigate: documents.length > 1,
                    }
                  : undefined
              }
              onFocusToggle={toggleFocus}
              onCloseFocus={() => setFocusedId(null)}
              onNavigateDocument={navigateFocusedDocument}
              onPageChange={changePage}
              onZoomChange={changeZoom}
              onTotalPagesChange={setTotalPages}
            />
          </div>
        ) : showSideBySide && primaryDoc && supportDoc ? (
          <div className="grid h-full min-h-0 gap-3 lg:grid-cols-2">
            <ReembolsoMediaPreview
              document={primaryDoc}
              state={getPaneState(primaryDoc.id)}
              onFocusToggle={toggleFocus}
              onPageChange={changePage}
              onZoomChange={changeZoom}
              onTotalPagesChange={setTotalPages}
            />
            <ReembolsoMediaPreview
              document={supportDoc}
              state={getPaneState(supportDoc.id)}
              onFocusToggle={toggleFocus}
              onPageChange={changePage}
              onZoomChange={changeZoom}
              onTotalPagesChange={setTotalPages}
            />
          </div>
        ) : activePaneDoc ? (
          <div className="h-full min-h-0">
            <ReembolsoMediaPreview
              document={activePaneDoc}
              state={getPaneState(activePaneDoc.id)}
              onFocusToggle={toggleFocus}
              onPageChange={changePage}
              onZoomChange={changeZoom}
              onTotalPagesChange={setTotalPages}
            />
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-500">
            No hay documento previsualizable.
          </div>
        )}
      </div>
    </div>
  );
}
