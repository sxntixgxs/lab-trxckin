import type { Doc, Id } from "@/convex/_generated/dataModel";

import type { ResumenContableCruce } from "./cruces-documentos-internos";

export type AnticipoOwnerSnapshot = {
  source?: "historial" | "directorio_empresa";
  liderUserId?: string;
  liderNombre: string;
  liderEmail: string;
  procesoId?: number;
  procesoNombre?: string;
  bolsaId?: Id<"bolsasAnticipos">;
  liderAsignacionId?: Id<"facturacionAsignaciones">;
  elegible: boolean;
};

export type AnticipoOwnerCandidate = {
  selectionKey: string;
  source: "historial" | "directorio_empresa";
  liderAsignacionId?: Id<"facturacionAsignaciones">;
  liderUserId?: string;
  liderNombre: string;
  liderEmail: string;
  procesoId?: number;
  procesoNombre?: string;
  ultimaInteraccionEn?: number;
  estadoAsignacion?: string;
  esActual: boolean;
};

export type AnticipoBagPreview = {
  bolsaId?: Id<"bolsasAnticipos">;
  procesoId?: number;
  procesoNombre?: string;
  anticiposDisponibles: number;
  pendienteTotal: number;
};

export type AnticipoModalItem = Doc<"anticipos"> & {
  valorLegalizado: number;
  pendienteLegalizar: number;
  aplicadoEnFactura: number;
  disponibleParaFactura: number;
};

export type LegalizacionDetalleItem = Doc<"facturacionAnticipoLegalizaciones"> & {
  anticipo: Doc<"anticipos"> | null;
};

export type AnticipoTotals = {
  valorFactura: number;
  valorBrutoFactura: number;
  valorNotasCredito: number;
  valorAplicadoFactura: number;
  pendienteDisponible: number;
  diferenciaNoCubierta: number;
  valorSolicitado: number;
  valorLegalizado: number;
};

export type AnticipoBolsaConflicto = {
  responsableGuardado: AnticipoOwnerSnapshot;
  liderActual: AnticipoOwnerSnapshot;
  bolsaGuardadaId?: Id<"bolsasAnticipos">;
  bolsaLiderId?: Id<"bolsasAnticipos">;
};

export type AnticipoOwnerSelectionInput =
  | {
      source: "historial";
      liderAsignacionId: Id<"facturacionAsignaciones">;
    }
  | {
      source: "directorio_empresa";
      liderUserId: string;
    };

export type AnticipoManagementContext = {
  facturaId: Id<"facturacionFacturas">;
  fase: string;
  asignacionActivaId: Id<"facturacionAsignaciones"> | null;
  puedeCruzar: boolean;
  puedeCambiarResponsable: boolean;
  requiereSeleccionResponsable: boolean;
  motivoBloqueoCruce: string | null;
  origenBolsa: "lider_asignado" | "responsable_guardado";
  conflictoBolsaLider: AnticipoBolsaConflicto | null;
  /** Compatibilidad: equivale a `puedeCambiarResponsable`. */
  puedeEditar: boolean;
  motivoBloqueo: string | null;
  facturaMarcada: boolean;
  duenoActual: AnticipoOwnerSnapshot | null;
  candidatos: AnticipoOwnerCandidate[];
  bolsaVista: AnticipoBagPreview | null;
  crucesActivos: {
    ids: Id<"facturacionAnticipoLegalizaciones">[];
    cantidad: number;
    valorAplicado: number;
    bolsaId?: Id<"bolsasAnticipos">;
  };
  requiereConfirmarReversion: boolean;
  anticipos: AnticipoModalItem[];
  legalizaciones: LegalizacionDetalleItem[];
  totales: AnticipoTotals;
  resumenContable: ResumenContableCruce;
};

export type ChangeAnticipoOwnerInput = {
  asignacionId: Id<"facturacionAsignaciones">;
  ownerSelection: AnticipoOwnerSelectionInput;
  comentario?: string;
  confirmarReversionCruces: boolean;
  expectedLegalizacionIds: Id<"facturacionAnticipoLegalizaciones">[];
};

export type SaveAnticipoCrossInput = {
  asignacionId: Id<"facturacionAsignaciones">;
  anticipoIds: Id<"anticipos">[];
  expectedBolsaId: Id<"bolsasAnticipos">;
  ownerSelection?: AnticipoOwnerSelectionInput;
  comentario?: string;
};

export type AnticipoReversionConflict = {
  code: "CONFIRMAR_REVERSION_CRUCES";
  cantidad: number;
  valor: number;
  bolsaAnteriorId?: Id<"bolsasAnticipos">;
  bolsaNuevaId?: Id<"bolsasAnticipos">;
};

export function parseAnticipoReversionConflict(error: unknown): AnticipoReversionConflict | null {
  if (!error || typeof error !== "object") return null;
  const data = (error as { data?: AnticipoReversionConflict }).data;
  if (data?.code === "CONFIRMAR_REVERSION_CRUCES") return data;
  if (
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message?: string }).message === "string"
  ) {
    try {
      const parsed = JSON.parse(
        (error as { message: string }).message
      ) as AnticipoReversionConflict;
      if (parsed.code === "CONFIRMAR_REVERSION_CRUCES") return parsed;
    } catch {
      return null;
    }
  }
  return null;
}

export function needsAnticipoOwnerSelection(context: AnticipoManagementContext) {
  return (
    context.puedeCambiarResponsable &&
    context.requiereSeleccionResponsable &&
    !context.facturaMarcada &&
    context.candidatos.length > 0
  );
}

export function getPreferredAnticipoOwnerSelectionKey(context: AnticipoManagementContext) {
  const historialPreferido = context.candidatos
    .filter((candidate) => candidate.source === "historial")
    .reduce<AnticipoOwnerCandidate | null>((selected, candidate) => {
      if (!selected) return candidate;
      return (candidate.ultimaInteraccionEn ?? 0) > (selected.ultimaInteraccionEn ?? 0)
        ? candidate
        : selected;
    }, null);
  return historialPreferido?.selectionKey ?? context.candidatos[0]?.selectionKey ?? null;
}

export function bolsaChangedForPreview(
  context: AnticipoManagementContext,
  previewSelectionKey?: string | null
) {
  if (!previewSelectionKey || !context.duenoActual?.bolsaId || !context.bolsaVista?.bolsaId) {
    return false;
  }
  const candidate = context.candidatos.find((row) => row.selectionKey === previewSelectionKey);
  if (!candidate || candidate.esActual) return false;
  return context.bolsaVista.bolsaId !== context.duenoActual.bolsaId;
}
