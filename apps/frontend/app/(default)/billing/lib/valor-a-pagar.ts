import type { Doc } from "@/convex/_generated/dataModel";

import { getValorContable } from "./valor-contable";

export const MONEY_TOLERANCE = 0.001;

const FASES_MOSTRAR_VALOR_A_PAGAR = new Set([
  "causacion",
  "revision_impuestos",
  "eventos_dian",
  "gerencia",
  "revision_tesoreria",
  "pagada",
  "legalizada",
  "cerrada",
]);

const FASES_ACTIVAS_CRUCES_INTERNOS = new Set([
  "recepcion",
  "revision_lider",
  "causacion",
  "revision_impuestos",
  "eventos_dian",
  "gerencia",
  "revision_tesoreria",
]);

export function aplicaValorAPagarEnUi(
  factura: Pick<
    Doc<"facturacionFacturas">,
    | "esLegalizacionAnticipo"
    | "esPeaje"
    | "rolOperacion"
    | "esLegalizacionCajaMenor"
    | "valorAPagar"
    | "cantidadCrucesDocumentosInternos"
  > | null | undefined
) {
  if (!factura) return false;
  if (factura.esPeaje || factura.rolOperacion === "PEAJES") return false;
  if (factura.esLegalizacionCajaMenor) return false;
  if ((factura.cantidadCrucesDocumentosInternos ?? 0) > 0) {
    return factura.valorAPagar !== undefined;
  }
  if (!factura.esLegalizacionAnticipo) return false;
  return factura.valorAPagar !== undefined;
}

export function shouldShowValorAPagar(
  fase: string,
  factura: Parameters<typeof aplicaValorAPagarEnUi>[0]
) {
  if (!aplicaValorAPagarEnUi(factura)) return false;
  if ((factura?.cantidadCrucesDocumentosInternos ?? 0) > 0) {
    return FASES_ACTIVAS_CRUCES_INTERNOS.has(fase) || FASES_MOSTRAR_VALOR_A_PAGAR.has(fase);
  }
  return FASES_MOSTRAR_VALOR_A_PAGAR.has(fase);
}

export function computeValorAPagarEstimado(args: {
  valorContable: number;
  valorDocumentosInternos: number;
  valorAnticiposAplicados: number;
  pagosAplicados: number;
}) {
  const saldo =
    args.valorContable -
    args.valorDocumentosInternos -
    args.valorAnticiposAplicados -
    args.pagosAplicados;
  if (Math.abs(saldo) <= MONEY_TOLERANCE) return 0;
  return Math.max(0, saldo);
}

export function computeResumenContableEstimado(args: {
  valorContable: number;
  valorDocumentosInternos: number;
  valorAnticiposAplicados: number;
  pagosAplicados: number;
}) {
  const baseCruceAnticipos = Math.max(
    0,
    args.valorContable - args.valorDocumentosInternos - args.pagosAplicados
  );

  return {
    baseCruceAnticipos:
      Math.abs(baseCruceAnticipos) <= MONEY_TOLERANCE ? 0 : baseCruceAnticipos,
    valorAPagar: computeValorAPagarEstimado(args),
  };
}

export function getValorAPagarDisplay(args: {
  factura: Pick<
    Doc<"facturacionFacturas">,
    | "valorContable"
    | "total"
    | "valorAPagar"
    | "esLegalizacionAnticipo"
    | "valorCrucesDocumentosInternos"
  >;
  fase: string;
  valorContableDraft?: number;
  valorDocumentosInternos?: number;
  valorAnticiposAplicados?: number;
  pagosAplicados?: number;
}): number | null {
  const {
    factura,
    fase,
    valorContableDraft,
    valorDocumentosInternos = factura.valorCrucesDocumentosInternos ?? 0,
    valorAnticiposAplicados = 0,
    pagosAplicados = 0,
  } = args;

  if (!shouldShowValorAPagar(fase, factura)) return null;

  if (
    valorContableDraft !== undefined &&
    Number.isFinite(valorContableDraft) &&
    valorContableDraft !== getValorContable(factura)
  ) {
    return computeValorAPagarEstimado({
      valorContable: valorContableDraft,
      valorDocumentosInternos,
      valorAnticiposAplicados,
      pagosAplicados,
    });
  }

  if (factura.valorAPagar !== undefined) {
    return factura.valorAPagar;
  }

  return computeValorAPagarEstimado({
    valorContable: getValorContable(factura),
    valorDocumentosInternos,
    valorAnticiposAplicados,
    pagosAplicados,
  });
}

export function getBasePagoTesoreria(
  factura: Pick<
    Doc<"facturacionFacturas">,
    | "valorContable"
    | "total"
    | "valorAPagar"
    | "esLegalizacionAnticipo"
    | "cantidadCrucesDocumentosInternos"
  >
) {
  if (
    (factura.esLegalizacionAnticipo ||
      (factura.cantidadCrucesDocumentosInternos ?? 0) > 0) &&
    factura.valorAPagar !== undefined
  ) {
    return factura.valorAPagar;
  }
  return getValorContable(factura);
}

export function tesoreriaSaldoEsCero(
  factura: Pick<
    Doc<"facturacionFacturas">,
    "valorContable" | "total" | "valorAPagar" | "esLegalizacionAnticipo"
  >
) {
  return getBasePagoTesoreria(factura) <= 0.001;
}
