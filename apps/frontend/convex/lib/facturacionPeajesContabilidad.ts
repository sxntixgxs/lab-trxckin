import type { Id } from "../_generated/dataModel";
import { normalizePeajesDocumentNumber } from "./peajes";

export type PeajesEstadoContable =
  | "pendiente_contabilidad"
  | "contabilizada";

export const PEAJES_CONTADORES_CLAVE = "contadores_peajes" as const;
export const PEAJES_GLOBAL_ADMIN_ROLES = new Set([1, 99]);

export function buildSearchText(args: {
  numeroFactura: string;
  proveedorNombre?: string;
  archivoNombre?: string;
  operacionId?: string;
  centroCostoCodigo?: string;
  centroCostoNombre?: string;
}) {
  return [
    args.numeroFactura,
    normalizePeajesDocumentNumber(args.numeroFactura),
    args.proveedorNombre,
    args.archivoNombre,
    args.operacionId,
    args.centroCostoCodigo,
    args.centroCostoNombre,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function empresaScopeKey(empresa: number) {
  return `empresa:${empresa}`;
}

export function operacionScopeKey(
  operacionId: Id<"facturacionPeajesOperaciones">
) {
  return `operacion:${operacionId}`;
}

export function resolvePeajesEstadoPublico(args: {
  esPeaje?: boolean;
  peajesCruce?: unknown;
  estadoContable?: PeajesEstadoContable | null;
}): string | null {
  if (!args.esPeaje) return null;
  if (args.estadoContable === "contabilizada") return "peajes_contabilizada";
  if (args.estadoContable === "pendiente_contabilidad") {
    return "peajes_pendiente_contabilidad";
  }
  if (args.peajesCruce) return "peajes_cubierta";
  return "recepcion_peajes";
}
