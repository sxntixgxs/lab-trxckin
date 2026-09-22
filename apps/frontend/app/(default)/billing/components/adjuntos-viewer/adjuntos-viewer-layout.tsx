"use client";

import { useMemo } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";

import { cn } from "@/lib/utils";

import { AdjuntosViewerPanel } from "./adjuntos-viewer-panel";
import type { DocumentoAdjuntoPreviewable, PaneState, ZoomMode } from "./adjuntos-viewer-types";
import type { ViewerLayoutPreferences } from "./adjuntos-viewer-types";
import { orderDocumentsForLayout } from "./adjuntos-viewer-utils";

const separatorClassName =
  "relative z-10 flex w-6 min-w-6 shrink-0 items-stretch bg-transparent before:absolute before:inset-y-0 before:left-1/2 before:w-px before:-translate-x-1/2 before:bg-slate-300 hover:before:bg-blue-500 data-[separator=active]:before:bg-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600";

const verticalSeparatorClassName =
  "relative z-10 flex h-6 min-h-6 shrink-0 items-stretch bg-transparent before:absolute before:inset-x-0 before:top-1/2 before:h-px before:-translate-y-1/2 before:bg-slate-300 hover:before:bg-blue-500 data-[separator=active]:before:bg-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600";

type PanelHandlers = {
  getPaneState: (id: string) => PaneState;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  onMakePrimary: (id: string) => void;
  onToggleMaximize: (id: string) => void;
  onPageChange: (id: string, delta: number) => void;
  onZoomStep: (id: string, delta: number) => void;
  onZoomModeChange: (id: string, mode: ZoomMode) => void;
  onManualZoomChange: (id: string, value: number) => void;
  onRotatePage: (id: string) => void;
  onStateChange: (id: string, patch: Partial<PaneState>) => void;
  onTotalPagesChange: (id: string, totalPages: number) => void;
};

type AdjuntosViewerLayoutProps = PanelHandlers & {
  documents: DocumentoAdjuntoPreviewable[];
  primaryId: string | null;
  activeId: string | null;
  maximizedId: string | null;
  preferences: ViewerLayoutPreferences;
  narrowToolbar?: boolean;
  onTwoPanelLayoutChange: (sizes: [number, number]) => void;
  onThreePanelStackedLayoutChange: (patch: {
    main?: number;
    secondaryStack?: [number, number];
  }) => void;
  onThreePanelColumnsLayoutChange: (sizes: [number, number, number]) => void;
};

export function AdjuntosViewerLayout({
  documents,
  primaryId,
  activeId,
  maximizedId,
  preferences,
  narrowToolbar = false,
  getPaneState,
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
  onTwoPanelLayoutChange,
  onThreePanelStackedLayoutChange,
  onThreePanelColumnsLayoutChange,
}: AdjuntosViewerLayoutProps) {
  const orderedDocuments = useMemo(
    () => orderDocumentsForLayout({ selectedAdjuntos: documents, primaryId }),
    [documents, primaryId],
  );

  const visibleDocuments = maximizedId
    ? orderedDocuments.filter((doc) => doc.id === maximizedId)
    : orderedDocuments;

  const canClose = documents.length > 1;

  const renderPanel = (adjunto: DocumentoAdjuntoPreviewable) => (
    <AdjuntosViewerPanel
      key={adjunto.id}
      adjunto={adjunto}
      state={getPaneState(adjunto.id)}
      isActive={activeId === adjunto.id}
      isPrimary={primaryId === adjunto.id}
      isMaximized={maximizedId === adjunto.id}
      narrowToolbar={narrowToolbar}
      canClose={canClose}
      onActivate={() => onActivate(adjunto.id)}
      onClose={() => onClose(adjunto.id)}
      onMakePrimary={() => onMakePrimary(adjunto.id)}
      onToggleMaximize={() => onToggleMaximize(adjunto.id)}
      onPageChange={(delta) => onPageChange(adjunto.id, delta)}
      onZoomStep={(delta) => onZoomStep(adjunto.id, delta)}
      onZoomModeChange={(mode) => onZoomModeChange(adjunto.id, mode)}
      onManualZoomChange={(value) => onManualZoomChange(adjunto.id, value)}
      onRotatePage={() => onRotatePage(adjunto.id)}
      onStateChange={(patch) => onStateChange(adjunto.id, patch)}
      onTotalPagesChange={onTotalPagesChange}
    />
  );

  if (visibleDocuments.length === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white text-sm text-slate-500">
        Sin documento seleccionado.
      </div>
    );
  }

  if (visibleDocuments.length === 1) {
    return <div className="h-full min-h-0">{renderPanel(visibleDocuments[0])}</div>;
  }

  if (visibleDocuments.length === 2) {
    const [firstSize, secondSize] = preferences.twoPanelSizes;
    return (
      <Group
        orientation="horizontal"
        className="h-full min-h-0"
        defaultLayout={{ first: firstSize, second: secondSize }}
        onLayoutChanged={(layout) => {
          onTwoPanelLayoutChange([
            Math.round(layout.first ?? firstSize),
            Math.round(layout.second ?? secondSize),
          ] as [number, number]);
        }}
      >
        <Panel id="first" defaultSize={firstSize} minSize={20} className="min-h-0 min-w-0">
          {renderPanel(visibleDocuments[0])}
        </Panel>
        <Separator className={separatorClassName} />
        <Panel id="second" defaultSize={secondSize} minSize={20} className="min-h-0 min-w-0">
          {renderPanel(visibleDocuments[1])}
        </Panel>
      </Group>
    );
  }

  if (preferences.threePanelPreset === "columns") {
    const [firstSize, secondSize, thirdSize] = preferences.threePanelColumnSizes;
    return (
      <Group
        orientation="horizontal"
        className="h-full min-h-0"
        defaultLayout={{
          col1: firstSize,
          col2: secondSize,
          col3: thirdSize,
        }}
        onLayoutChanged={(layout) => {
          onThreePanelColumnsLayoutChange([
            Math.round(layout.col1 ?? firstSize),
            Math.round(layout.col2 ?? secondSize),
            Math.round(layout.col3 ?? thirdSize),
          ] as [number, number, number]);
        }}
      >
        <Panel id="col1" defaultSize={firstSize} minSize={15} className="min-h-0 min-w-0">
          {renderPanel(visibleDocuments[0])}
        </Panel>
        <Separator className={separatorClassName} />
        <Panel id="col2" defaultSize={secondSize} minSize={15} className="min-h-0 min-w-0">
          {renderPanel(visibleDocuments[1])}
        </Panel>
        <Separator className={separatorClassName} />
        <Panel id="col3" defaultSize={thirdSize} minSize={15} className="min-h-0 min-w-0">
          {renderPanel(visibleDocuments[2])}
        </Panel>
      </Group>
    );
  }

  const mainSize = preferences.threePanelStackedSizes.main;
  const secondarySize = 100 - mainSize;
  const [topSecondary, bottomSecondary] = preferences.threePanelStackedSizes.secondaryStack;

  return (
    <Group
      orientation="horizontal"
      className="h-full min-h-0"
      defaultLayout={{ main: mainSize, secondary: secondarySize }}
      onLayoutChanged={(layout) => {
        onThreePanelStackedLayoutChange({
          main: Math.round(layout.main ?? mainSize),
        });
      }}
    >
      <Panel id="main" defaultSize={mainSize} minSize={30} className="min-h-0 min-w-0">
        {renderPanel(visibleDocuments[0])}
      </Panel>
      <Separator className={separatorClassName} />
      <Panel
        id="secondary"
        defaultSize={secondarySize}
        minSize={20}
        className="min-h-0 min-w-0"
      >
        <Group
          orientation="vertical"
          className="h-full min-h-0"
          defaultLayout={{ top: topSecondary, bottom: bottomSecondary }}
          onLayoutChanged={(layout) => {
            onThreePanelStackedLayoutChange({
              secondaryStack: [
                Math.round(layout.top ?? topSecondary),
                Math.round(layout.bottom ?? bottomSecondary),
              ] as [number, number],
            });
          }}
        >
          <Panel id="top" defaultSize={topSecondary} minSize={20} className="min-h-0 min-w-0">
            {renderPanel(visibleDocuments[1])}
          </Panel>
          <Separator className={verticalSeparatorClassName} />
          <Panel
            id="bottom"
            defaultSize={bottomSecondary}
            minSize={20}
            className="min-h-0 min-w-0"
          >
            {renderPanel(visibleDocuments[2])}
          </Panel>
        </Group>
      </Panel>
    </Group>
  );
}

export function AdjuntosViewerCompactLayout({
  documents,
  activeId,
  primaryId,
  maximizedId,
  narrowToolbar,
  getPaneState,
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
}: PanelHandlers & {
  documents: DocumentoAdjuntoPreviewable[];
  activeId: string | null;
  primaryId: string | null;
  maximizedId: string | null;
  narrowToolbar?: boolean;
}) {
  const activeDocument =
    documents.find((doc) => doc.id === (maximizedId ?? activeId)) ?? documents[0];

  if (!activeDocument) {
    return (
      <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white text-sm text-slate-500">
        Sin documento seleccionado.
      </div>
    );
  }

  return (
    <div className={cn("h-full min-h-0")}>
      <AdjuntosViewerPanel
        adjunto={activeDocument}
        state={getPaneState(activeDocument.id)}
        isActive
        isPrimary={primaryId === activeDocument.id}
        isMaximized={maximizedId === activeDocument.id}
        narrowToolbar={narrowToolbar}
        canClose={documents.length > 1}
        onActivate={() => onActivate(activeDocument.id)}
        onClose={() => onClose(activeDocument.id)}
        onMakePrimary={() => onMakePrimary(activeDocument.id)}
        onToggleMaximize={() => onToggleMaximize(activeDocument.id)}
        onPageChange={(delta) => onPageChange(activeDocument.id, delta)}
        onZoomStep={(delta) => onZoomStep(activeDocument.id, delta)}
        onZoomModeChange={(mode) => onZoomModeChange(activeDocument.id, mode)}
        onManualZoomChange={(value) => onManualZoomChange(activeDocument.id, value)}
        onRotatePage={() => onRotatePage(activeDocument.id)}
        onStateChange={(patch) => onStateChange(activeDocument.id, patch)}
        onTotalPagesChange={onTotalPagesChange}
      />
    </div>
  );
}
