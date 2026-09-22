import type { Id } from "@/convex/_generated/dataModel";

export type DocumentoAdjunto = {
  id: string;
  adjuntoId?: Id<"facturacionAdjuntos">;
  storageId?: Id<"_storage">;
  nombre: string;
  url: string | null;
  mimeType?: string;
  size?: number;
  subidoPorNombre?: string;
  creadoEn?: number;
  kind: "factura_pdf" | "soporte";
};

export type DocumentoAdjuntoPreviewable = DocumentoAdjunto & { url: string };

export type ZoomMode = "fit-page" | "fit-width" | "manual";

export type ThreePanelPreset = "stacked" | "columns";

export type PaneState = {
  page: number;
  zoomMode: ZoomMode;
  manualZoom: number;
  totalPages?: number;
  pageRotations: Record<number, number>;
  scrollTop: number;
  scrollLeft: number;
};

export type ViewerLayoutPreferences = {
  threePanelPreset: ThreePanelPreset;
  twoPanelSizes: [number, number];
  threePanelStackedSizes: {
    main: number;
    secondaryStack: [number, number];
  };
  threePanelColumnSizes: [number, number, number];
};

export type StoredViewerPreferences = ViewerLayoutPreferences;

export const MAX_OPEN_DOCUMENTS = 3;
export const COMPARISON_MIN_WIDTH = 900;
export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 4;
export const VIEWER_PREFERENCES_STORAGE_KEY = "trxckin.adjuntos-viewer.preferences";

export const DEFAULT_PANE_STATE: PaneState = {
  page: 1,
  zoomMode: "fit-width",
  manualZoom: 1,
  pageRotations: {},
  scrollTop: 0,
  scrollLeft: 0,
};

export const DEFAULT_LAYOUT_PREFERENCES: ViewerLayoutPreferences = {
  threePanelPreset: "stacked",
  twoPanelSizes: [50, 50],
  threePanelStackedSizes: {
    main: 62,
    secondaryStack: [50, 50],
  },
  threePanelColumnSizes: [34, 33, 33],
};

export const THREE_PANEL_PRESET_LABELS: Record<ThreePanelPreset, string> = {
  stacked: "Principal + 2 apilados",
  columns: "3 columnas",
};

export const ZOOM_MODE_LABELS: Record<ZoomMode, string> = {
  "fit-page": "Ajustar página",
  "fit-width": "Ajustar ancho",
  manual: "Manual",
};
