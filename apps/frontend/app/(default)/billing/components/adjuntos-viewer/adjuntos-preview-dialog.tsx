"use client";

import { ChevronLeft, ChevronRight, Eye, Menu, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { hasPreviewUrl } from "./adjuntos-viewer-document-utils";
import { AdjuntosViewerCompactLayout, AdjuntosViewerLayout } from "./adjuntos-viewer-layout";
import { AdjuntosViewerSidebar } from "./adjuntos-viewer-sidebar";
import type { DocumentoAdjunto, ThreePanelPreset } from "./adjuntos-viewer-types";
import {
  DEFAULT_PANE_STATE,
  MAX_OPEN_DOCUMENTS,
  THREE_PANEL_PRESET_LABELS,
} from "./adjuntos-viewer-types";
import {
  changePanePage,
  changeThreePanelPreset,
  clampZoom,
  closeDocument,
  getComparisonViewportWidth,
  loadViewerPreferences,
  mergePaneState,
  openDocumentsLabel,
  resetLayoutPreferences,
  rotatePageClockwise,
  saveViewerPreferences,
  setPrimaryDocument,
  setZoomMode,
  shouldUseCompactViewer,
  shouldUseSidebarOverlay,
  stepManualZoom,
  toggleDocumentSelection,
  updateThreePanelColumnSizes,
  updateThreePanelStackedSizes,
  updateTwoPanelSizes,
  type ViewerLayoutPreferences,
} from "./adjuntos-viewer-utils";

export function AdjuntosPreviewDialog({
  open,
  onOpenChange,
  adjuntos,
  selectedIds,
  initialFocusedId,
  onSelectedIdsChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  adjuntos: DocumentoAdjunto[];
  selectedIds: string[];
  initialFocusedId?: string | null;
  onSelectedIdsChange: (ids: string[]) => void;
}) {
  const previewable = useMemo(() => adjuntos.filter(hasPreviewUrl), [adjuntos]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [primaryId, setPrimaryId] = useState<string | null>(null);
  const [maximizedId, setMaximizedId] = useState<string | null>(null);
  const [paneStates, setPaneStates] = useState<Record<string, typeof DEFAULT_PANE_STATE>>({});
  const [preferences, setPreferences] = useState<ViewerLayoutPreferences>(() =>
    loadViewerPreferences()
  );
  const [layoutVersion, setLayoutVersion] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState({ width: 1200, height: 800 });

  const selectedAdjuntos = selectedIds
    .map((id) => previewable.find((adjunto) => adjunto.id === id))
    .filter((adjunto): adjunto is NonNullable<typeof adjunto> => Boolean(adjunto));

  const facturaPdfId = previewable.find((adjunto) => adjunto.kind === "factura_pdf")?.id ?? null;

  const resolvedActiveId =
    activeId && selectedIds.includes(activeId)
      ? activeId
      : initialFocusedId && selectedIds.includes(initialFocusedId)
        ? initialFocusedId
        : (selectedAdjuntos[0]?.id ?? null);

  const resolvedPrimaryId =
    primaryId && selectedIds.includes(primaryId)
      ? primaryId
      : facturaPdfId && selectedIds.includes(facturaPdfId)
        ? facturaPdfId
        : (selectedAdjuntos[0]?.id ?? null);

  const sidebarOverlay = shouldUseSidebarOverlay(viewport.width, sidebarOpen);
  const comparisonWidth = getComparisonViewportWidth({ containerWidth: viewport.width });
  const compactMode = shouldUseCompactViewer(comparisonWidth, viewport.height);

  useEffect(() => {
    if (!open) {
      setSidebarOpen(false);
      return;
    }
    setPreferences(loadViewerPreferences());
  }, [open]);

  useEffect(() => {
    saveViewerPreferences(preferences);
  }, [preferences]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element || !open) return;

    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setViewport((current) =>
        current.width === width && current.height === height ? current : { width, height }
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) {
        return;
      }

      if (event.key === "Escape") {
        if (maximizedId) {
          event.preventDefault();
          setMaximizedId(null);
          return;
        }
        onOpenChange(false);
        return;
      }

      if (event.key === "1" || event.key === "2" || event.key === "3") {
        const index = Number(event.key) - 1;
        const nextFocus = selectedAdjuntos[index]?.id;
        if (nextFocus) {
          event.preventDefault();
          setActiveId(nextFocus);
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  function getPaneState(id: string) {
    return paneStates[id] ?? DEFAULT_PANE_STATE;
  }

  function patchPaneState(id: string, patch: Partial<typeof DEFAULT_PANE_STATE>) {
    setPaneStates((current) => ({
      ...current,
      [id]: mergePaneState(current[id], patch),
    }));
  }

  function handleToggleDocument(id: string) {
    const result = toggleDocumentSelection({
      selectedIds,
      activeId: resolvedActiveId,
      primaryId: resolvedPrimaryId,
      documentId: id,
    });

    if (!result.ok) {
      if (result.reason === "max_reached") {
        toast.error("Cierra un documento para abrir otro.");
      }
      return;
    }

    onSelectedIdsChange(result.selectedIds);
    setActiveId(result.activeId);
    setPrimaryId(result.primaryId);
  }

  function handleCloseDocument(id: string) {
    const result = closeDocument({
      selectedIds,
      activeId: resolvedActiveId,
      primaryId: resolvedPrimaryId,
      documentId: id,
    });
    if (!result.ok) return;
    onSelectedIdsChange(result.selectedIds);
    setActiveId(result.activeId);
    setPrimaryId(result.primaryId);
    if (maximizedId === id) setMaximizedId(null);
  }

  function handleMakePrimary(id: string) {
    const next = setPrimaryDocument({
      selectedIds,
      activeId: resolvedActiveId,
      primaryId: resolvedPrimaryId,
      documentId: id,
    });
    onSelectedIdsChange(next.selectedIds);
    setPrimaryId(next.primaryId);
    setActiveId(next.activeId);
  }

  function handleToggleMaximize(id: string) {
    setMaximizedId((current) => (current === id ? null : id));
  }

  function handleResetLayout() {
    const next = resetLayoutPreferences();
    setPreferences(next);
    setLayoutVersion((value) => value + 1);
    setMaximizedId(null);
  }

  function navigateCompactDocument(delta: number) {
    if (selectedAdjuntos.length <= 1) return;
    const currentIndex = selectedAdjuntos.findIndex((doc) => doc.id === resolvedActiveId);
    const index = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex = (index + delta + selectedAdjuntos.length) % selectedAdjuntos.length;
    setActiveId(selectedAdjuntos[nextIndex]?.id ?? resolvedActiveId);
  }

  const layoutKey = `${layoutVersion}-${preferences.threePanelPreset}-${preferences.twoPanelSizes.join("-")}-${preferences.threePanelColumnSizes.join("-")}-${preferences.threePanelStackedSizes.main}-${preferences.threePanelStackedSizes.secondaryStack.join("-")}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[96vh] max-h-[96vh] w-[96vw] max-w-[1800px] flex-col gap-0 overflow-hidden p-0">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-3 pr-12">
          <DialogHeader className="p-0">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Eye className="h-4 w-4 text-slate-500" aria-hidden="true" />
              Comparación de adjuntos
            </DialogTitle>
            <DialogDescription className="sr-only">
              Workspace para validar la factura principal contra sus soportes.
            </DialogDescription>
          </DialogHeader>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="bg-white tabular-nums">
              {openDocumentsLabel(selectedAdjuntos.length, MAX_OPEN_DOCUMENTS)}
            </Badge>

            {selectedAdjuntos.length === 3 && !compactMode && !maximizedId ? (
              <Select
                value={preferences.threePanelPreset}
                onValueChange={(value) => {
                  setPreferences((current) =>
                    changeThreePanelPreset(current, value as ThreePanelPreset)
                  );
                  setLayoutVersion((v) => v + 1);
                }}
              >
                <SelectTrigger className="h-8 w-[220px]" aria-label="Distribución de paneles">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(THREE_PANEL_PRESET_LABELS) as ThreePanelPreset[]).map((preset) => (
                    <SelectItem key={preset} value={preset}>
                      {THREE_PANEL_PRESET_LABELS[preset]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 rounded-lg"
              onClick={handleResetLayout}
              title="Restablecer distribución"
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Restablecer distribución
            </Button>

            <Button
              type="button"
              variant={sidebarOpen ? "default" : "outline"}
              size="sm"
              className="h-8 rounded-lg"
              aria-pressed={sidebarOpen}
              onClick={() => setSidebarOpen((current) => !current)}
            >
              <Menu className="mr-2 h-4 w-4" />
              {sidebarOpen ? "Ocultar documentos" : "Documentos"}
            </Button>
          </div>
        </div>

        <div ref={containerRef} className="relative flex min-h-0 flex-1 bg-slate-100 p-4">
          {sidebarOpen && sidebarOverlay ? (
            <button
              type="button"
              className="absolute inset-0 z-10 bg-slate-900/20"
              aria-label="Cerrar lista de documentos"
              onClick={() => setSidebarOpen(false)}
            />
          ) : null}

          {sidebarOpen ? (
            <AdjuntosViewerSidebar
              adjuntos={adjuntos}
              selectedIds={selectedIds}
              activeId={resolvedActiveId}
              overlay={sidebarOverlay}
              onToggleDocument={handleToggleDocument}
            />
          ) : null}

          <main className="relative min-h-0 min-w-0 flex-1">
            {compactMode ? (
              <div className="flex h-full min-h-0 flex-col gap-2">
                <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 rounded-full p-0"
                      disabled={selectedAdjuntos.length <= 1}
                      onClick={() => navigateCompactDocument(-1)}
                      title="Documento anterior"
                      aria-label="Documento anterior"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="min-w-28 text-center text-xs font-semibold tabular-nums text-slate-600">
                      {selectedAdjuntos.findIndex((doc) => doc.id === resolvedActiveId) + 1 || 1} de{" "}
                      {selectedAdjuntos.length}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 rounded-full p-0"
                      disabled={selectedAdjuntos.length <= 1}
                      onClick={() => navigateCompactDocument(1)}
                      title="Documento siguiente"
                      aria-label="Documento siguiente"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                  <Select
                    value={resolvedActiveId ?? undefined}
                    onValueChange={(value) => setActiveId(value)}
                  >
                    <SelectTrigger className="h-8 max-w-[240px]" aria-label="Documento activo">
                      <SelectValue placeholder="Seleccionar documento" />
                    </SelectTrigger>
                    <SelectContent>
                      {selectedAdjuntos.map((doc) => (
                        <SelectItem key={doc.id} value={doc.id}>
                          {doc.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="min-h-0 flex-1">
                  <AdjuntosViewerCompactLayout
                    documents={selectedAdjuntos}
                    activeId={resolvedActiveId}
                    primaryId={resolvedPrimaryId}
                    maximizedId={maximizedId}
                    narrowToolbar
                    getPaneState={getPaneState}
                    onActivate={setActiveId}
                    onClose={handleCloseDocument}
                    onMakePrimary={handleMakePrimary}
                    onToggleMaximize={handleToggleMaximize}
                    onPageChange={(id, delta) =>
                      patchPaneState(id, changePanePage(getPaneState(id), delta))
                    }
                    onZoomStep={(id, delta) =>
                      patchPaneState(id, stepManualZoom(getPaneState(id), delta))
                    }
                    onZoomModeChange={(id, mode) =>
                      patchPaneState(id, setZoomMode(getPaneState(id), mode))
                    }
                    onManualZoomChange={(id, value) =>
                      patchPaneState(id, {
                        zoomMode: "manual",
                        manualZoom: clampZoom(value),
                      })
                    }
                    onRotatePage={(id) =>
                      patchPaneState(
                        id,
                        rotatePageClockwise(getPaneState(id), getPaneState(id).page)
                      )
                    }
                    onStateChange={patchPaneState}
                    onTotalPagesChange={(id, totalPages) =>
                      patchPaneState(id, { totalPages, page: getPaneState(id).page })
                    }
                  />
                </div>
              </div>
            ) : (
              <div key={layoutKey} className={cn("h-full min-h-0", sidebarOverlay && "pl-0")}>
                <AdjuntosViewerLayout
                  documents={selectedAdjuntos}
                  primaryId={resolvedPrimaryId}
                  activeId={resolvedActiveId}
                  maximizedId={maximizedId}
                  preferences={preferences}
                  narrowToolbar={comparisonWidth < 1100}
                  getPaneState={getPaneState}
                  onActivate={setActiveId}
                  onClose={handleCloseDocument}
                  onMakePrimary={handleMakePrimary}
                  onToggleMaximize={handleToggleMaximize}
                  onPageChange={(id, delta) =>
                    patchPaneState(id, changePanePage(getPaneState(id), delta))
                  }
                  onZoomStep={(id, delta) =>
                    patchPaneState(id, stepManualZoom(getPaneState(id), delta))
                  }
                  onZoomModeChange={(id, mode) =>
                    patchPaneState(id, setZoomMode(getPaneState(id), mode))
                  }
                  onManualZoomChange={(id, value) =>
                    patchPaneState(id, {
                      zoomMode: "manual",
                      manualZoom: clampZoom(value),
                    })
                  }
                  onRotatePage={(id) =>
                    patchPaneState(id, rotatePageClockwise(getPaneState(id), getPaneState(id).page))
                  }
                  onStateChange={patchPaneState}
                  onTotalPagesChange={(id, totalPages) =>
                    patchPaneState(id, { totalPages, page: getPaneState(id).page })
                  }
                  onTwoPanelLayoutChange={(sizes) =>
                    setPreferences((current) => updateTwoPanelSizes(current, sizes))
                  }
                  onThreePanelStackedLayoutChange={(patch) =>
                    setPreferences((current) => updateThreePanelStackedSizes(current, patch))
                  }
                  onThreePanelColumnsLayoutChange={(sizes) =>
                    setPreferences((current) => updateThreePanelColumnSizes(current, sizes))
                  }
                />
              </div>
            )}
          </main>
        </div>
      </DialogContent>
    </Dialog>
  );
}
