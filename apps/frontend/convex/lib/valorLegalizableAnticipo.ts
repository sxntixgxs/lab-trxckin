import type { Doc } from "../_generated/dataModel";
import { getValorContableAnticipo } from "./valorContable";

export function getValorLegalizableAnticipo(
  anticipo: Pick<Doc<"anticipos">, "valorContable" | "valorNumerico" | "valorLegalizableActual">
) {
  return anticipo.valorLegalizableActual ?? getValorContableAnticipo(anticipo);
}

export function getSaldoLegalizadoAnticipo(anticipo: Pick<Doc<"anticipos">, "saldoLegalizado">) {
  return Math.max(0, anticipo.saldoLegalizado ?? 0);
}

export function getSaldoPendienteLegalizableAnticipo(
  anticipo: Pick<
    Doc<"anticipos">,
    "valorContable" | "valorNumerico" | "valorLegalizableActual" | "saldoLegalizado"
  >
) {
  return Math.max(0, getValorLegalizableAnticipo(anticipo) - getSaldoLegalizadoAnticipo(anticipo));
}

export { isMontoPositivo } from "./money";
