import type { Doc } from "@/convex/_generated/dataModel";

import { getValorContableAnticipo } from "./valor-contable-anticipo";

export type AnticipoValorLegalizableInput = {
  valorNumerico: number;
  valorContable?: number;
  valorLegalizableActual?: number;
  saldoLegalizado?: number;
};

export function getValorLegalizableAnticipo(anticipo: AnticipoValorLegalizableInput) {
  return anticipo.valorLegalizableActual ?? getValorContableAnticipo(anticipo);
}

export function getSaldoLegalizadoAnticipo(anticipo: Pick<AnticipoValorLegalizableInput, "saldoLegalizado">) {
  return Math.max(0, anticipo.saldoLegalizado ?? 0);
}

export function getSaldoPendienteLegalizableAnticipo(anticipo: AnticipoValorLegalizableInput) {
  return Math.max(
    0,
    getValorLegalizableAnticipo(anticipo) - getSaldoLegalizadoAnticipo(anticipo)
  );
}

export function valorLegalizableDiffiereDelAprobado(
  anticipo: AnticipoValorLegalizableInput | null | undefined
) {
  if (!anticipo) return false;
  return getValorLegalizableAnticipo(anticipo) !== getValorContableAnticipo(anticipo);
}

export type AnticipoWithLegalizable = Doc<"anticipos">;
