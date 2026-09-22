import type { Doc } from "@/convex/_generated/dataModel";

export type AnticipoValorContableInput = {
  valorNumerico: number;
  valorContable?: number;
};

export function getValorContableAnticipo(anticipo: AnticipoValorContableInput) {
  return anticipo.valorContable ?? anticipo.valorNumerico;
}

export function valorContableAnticipoDiffiereDelSolicitado(
  anticipo: AnticipoValorContableInput | null | undefined
) {
  if (!anticipo) return false;
  return getValorContableAnticipo(anticipo) !== anticipo.valorNumerico;
}

export function getValorContableNuevoParaAprobacionContabilidad(args: {
  anticipo: Doc<"anticipos"> | null | undefined;
  draft?: number;
}) {
  if (!args.anticipo) return undefined;
  const actual = getValorContableAnticipo(args.anticipo);
  const draft = args.draft ?? actual;
  if (!Number.isFinite(draft) || draft < 0) {
    throw new Error("El valor contable debe ser un número válido mayor o igual a cero.");
  }
  if (draft === actual) return undefined;
  return draft;
}

export function parseValorContableInput(value: string) {
  const normalized = value.replace(/[^\d.,-]/g, "").replace(/\./g, "").replace(",", ".");
  if (!normalized.trim()) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

export function formatValorContableInput(value: number) {
  return String(Math.round(value));
}
