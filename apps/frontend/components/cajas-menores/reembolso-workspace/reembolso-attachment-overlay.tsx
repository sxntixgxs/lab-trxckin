"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { getDocumentNavLabel, navigateInvoiceDocuments } from "./document-model";
import { ReembolsoMediaPreview } from "./media-preview";
import type { DocumentPaneState, ReembolsoDocument } from "./types";

const DEFAULT_PANE: DocumentPaneState = {
  page: 1,
  zoom: 1,
  totalPages: null,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function ReembolsoAttachmentOverlay({
  documents,
  initialDocumentId,
  open,
  onClose,
}: {
  documents: ReembolsoDocument[];
  initialDocumentId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(initialDocumentId);
  const [paneStateById, setPaneStateById] = useState<
    Record<string, DocumentPaneState>
  >({});

  useEffect(() => {
    if (!open) return;
    setActiveId(initialDocumentId);
  }, [initialDocumentId, open]);

  // If the open file is deleted, select adjacent or close.
  useEffect(() => {
    if (!open) return;
    if (documents.length === 0) {
      onClose();
      return;
    }
    if (activeId && documents.some((doc) => doc.id === activeId)) return;
    const fallback = documents[0]?.id ?? null;
    if (!fallback) {
      onClose();
      return;
    }
    setActiveId(fallback);
  }, [activeId, documents, onClose, open]);

  const activeDoc = useMemo(
    () => documents.find((doc) => doc.id === activeId) ?? documents[0] ?? null,
    [activeId, documents],
  );

  const nav = activeDoc
    ? getDocumentNavLabel(documents, activeDoc.id)
    : { label: "0 de 0", index: 0, total: 0 };

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
        [id]: { ...prev, page: clamp(prev.page + delta, 1, max) },
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

  const navigate = useCallback(
    (delta: number) => {
      const nextId = navigateInvoiceDocuments(
        documents,
        activeDoc?.id ?? null,
        delta,
      );
      if (nextId) setActiveId(nextId);
    },
    [activeDoc?.id, documents],
  );

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        navigate(-1);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        navigate(1);
      }
    }
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [navigate, onClose, open]);

  if (!open || !activeDoc || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex flex-col bg-slate-950/70 p-3 backdrop-blur-[1px] sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Visualizador de adjuntos de fase"
    >
      <div className="mx-auto flex h-full w-full max-w-6xl min-h-0 flex-col">
        <ReembolsoMediaPreview
          document={activeDoc}
          state={getPaneState(activeDoc.id)}
          isFocused
          documentNav={{
            label: nav.label,
            canNavigate: documents.length > 1,
          }}
          onFocusToggle={() => onClose()}
          onCloseFocus={onClose}
          onNavigateDocument={navigate}
          onPageChange={changePage}
          onZoomChange={changeZoom}
          onTotalPagesChange={setTotalPages}
        />
      </div>
    </div>,
    document.body,
  );
}
