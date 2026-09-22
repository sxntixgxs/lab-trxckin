import type { Id } from "@/convex/_generated/dataModel";
import type { CentroCostoDistribucionRow } from "@/lib/cajas-menores/centros-costo-distribucion";

export type ReembolsoWorkspaceMode =
  | "generation"
  | "approval"
  | "treasury"
  | "readonly";

export type ReembolsoDocumentKind = "factura_pdf" | "soporte";

export type ReembolsoDocument = {
  /** Composite unique id scoped to the owning factura. */
  id: string;
  facturaId: string;
  kind: ReembolsoDocumentKind;
  nombre: string;
  url: string | null;
  storageId?: Id<"_storage">;
  adjuntoId?: Id<"facturacionAdjuntos">;
  mimeType?: string;
  size?: number;
  subidoPorNombre?: string;
  creadoEn?: number;
  previewable: boolean;
};

export type ReembolsoInvoiceItem = {
  key: string;
  movimientoId: string;
  facturaId: string;
  numeroFactura: string;
  proveedorNombre: string;
  concepto: string;
  observaciones?: string;
  valor: number;
  totalFactura: number;
  valorContable: number;
  moneda: string;
  esReciboFisicoCajaMenor?: boolean;
  centroCostoCodigo: string;
  centroCostoNombre: string;
  centrosCostoDistribucion?: CentroCostoDistribucionRow[];
  fechaPago?: string;
  documents: ReembolsoDocument[];
};

export type ReembolsoViewerSelection = {
  invoiceKey: string | null;
  primaryDocumentId: string | null;
  supportDocumentId: string | null;
  focusedDocumentId: string | null;
};

export type ReembolsoDocumentSource = {
  facturaId: string;
  numeroFactura?: string | null;
  pdfStorageId?: Id<"_storage"> | null;
  pdfUrl?: string | null;
  soportesStorageId?: Id<"_storage"> | null;
  soportesNombre?: string | null;
  adjuntos?: Array<{
    _id: Id<"facturacionAdjuntos">;
    storageId: Id<"_storage">;
    nombre: string;
    url: string | null;
    mimeType?: string;
    size?: number;
    subidoPorNombre?: string;
    creadoEn?: number;
  }>;
};

export type DocumentPaneState = {
  page: number;
  zoom: number;
  totalPages: number | null;
};
