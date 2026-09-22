import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";

export const peajesCentroCostoRefValidator = v.object({
  id: v.string(),
  codigo: v.string(),
  nombre: v.string(),
});

export const peajesCentroCostoEntradaValidator = v.union(
  v.literal("excel_validado"),
  v.literal("manual"),
  v.literal("conservado"),
  v.literal("sin_centro"),
  v.literal("correccion_contable"),
);

export const peajesCentroCostoCanalValidator = v.union(
  v.literal("conciliacion"),
  v.literal("contabilidad"),
);

export const peajesCentroCostoDecisionValidator = v.object({
  centroCosto: v.union(peajesCentroCostoRefValidator, v.null()),
  confirmadoPorUserId: v.optional(v.string()),
  confirmadoPorNombre: v.string(),
  confirmadoPorEmail: v.string(),
  confirmadoEn: v.number(),
  operacionId: v.id("facturacionPeajesOperaciones"),
  canal: peajesCentroCostoCanalValidator,
  entrada: peajesCentroCostoEntradaValidator,
});

export const peajesCentroCostoAsignacionValidator = v.object({
  conciliacion: v.optional(peajesCentroCostoDecisionValidator),
  actual: peajesCentroCostoDecisionValidator,
  version: v.number(),
});

export type PeajesCentroCostoRef = {
  id: string;
  codigo: string;
  nombre: string;
};

export type PeajesCentroCostoEntrada =
  | "excel_validado"
  | "manual"
  | "conservado"
  | "sin_centro"
  | "correccion_contable";

export type PeajesCentroCostoCanal = "conciliacion" | "contabilidad";

export type PeajesCentroCostoDecision = {
  centroCosto: PeajesCentroCostoRef | null;
  confirmadoPorUserId?: string;
  confirmadoPorNombre: string;
  confirmadoPorEmail: string;
  confirmadoEn: number;
  operacionId: Id<"facturacionPeajesOperaciones">;
  canal: PeajesCentroCostoCanal;
  entrada: PeajesCentroCostoEntrada;
};

export type PeajesCentroCostoAsignacion = {
  conciliacion?: PeajesCentroCostoDecision;
  actual: PeajesCentroCostoDecision;
  version: number;
};

export function centroCostoRefsEqual(
  left: PeajesCentroCostoRef | null | undefined,
  right: PeajesCentroCostoRef | null | undefined,
) {
  if (!left && !right) return true;
  if (!left || !right) return false;
  return left.id === right.id;
}
