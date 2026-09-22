import type { Id } from "@/convex/_generated/dataModel";

export type ResumenContableCruce = {
  valorContable: number;
  valorDocumentosInternos: number;
  pagosAplicados: number;
  baseCruceAnticipos: number;
  valorAnticiposAplicados: number;
  valorAPagar: number;
  moneda: string;
};

export type CruceDocumentoInternoItem = {
  _id: Id<"facturacionCrucesDocumentosInternos">;
  _creationTime: number;
  facturaId: Id<"facturacionFacturas">;
  empresa: number;
  numeroDocumento: string;
  numeroDocumentoNormalizado: string;
  valorAplicado: number;
  moneda: string;
  estado: "activo" | "retirado";
  actorUserId?: string;
  actorNombre: string;
  actorEmail: string;
  comentario?: string;
  actualizadoPorUserId?: string;
  actualizadoPorNombre?: string;
  actualizadoPorEmail?: string;
  actualizadoComentario?: string;
  creadoEn: number;
  actualizadoEn: number;
};

export type CruceDocumentoInternoInput = {
  asignacionId: Id<"facturacionAsignaciones">;
  numeroDocumento: string;
  valorAplicado: number;
  comentario?: string;
};

export type EditCruceDocumentoInternoInput = CruceDocumentoInternoInput & {
  cruceId: Id<"facturacionCrucesDocumentosInternos">;
  expectedActualizadoEn: number;
};

export type RetirarCruceDocumentoInternoInput = {
  asignacionId: Id<"facturacionAsignaciones">;
  cruceId: Id<"facturacionCrucesDocumentosInternos">;
  expectedActualizadoEn: number;
  comentario?: string;
};

export type CruceDocumentoInternoResumen = {
  resumen: ResumenContableCruce;
  documentos: {
    page: CruceDocumentoInternoItem[];
    isDone: boolean;
    continueCursor: string;
    splitCursor?: string | null;
    pageStatus?: "SplitRecommended" | "SplitRequired" | null;
  };
  totales: {
    cantidad: number;
    valorAplicado: number;
  };
  puedeEditar: boolean;
  fase: string;
};
