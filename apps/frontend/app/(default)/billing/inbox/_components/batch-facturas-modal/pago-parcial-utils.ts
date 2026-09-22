import type { Doc } from "@/convex/_generated/dataModel";
import { getValorContable } from "../../../lib/valor-contable";
import { getBasePagoTesoreria } from "../../../lib/valor-a-pagar";
import type { PagoParcialDraft } from "./types";

export const MAX_PAGO_PARCIAL_FILE_BYTES = 25 * 1024 * 1024;

export function getDefaultPagoParcialDraft(): PagoParcialDraft {
  return { monto: null };
}

export function sumPagosParciales(
  aprobaciones: Array<Doc<"facturacionAprobaciones">> | undefined,
) {
  return (aprobaciones ?? [])
    .filter((item) => item.accion === "pago_parcial")
    .reduce((sum, item) => sum + (item.pagoParcial?.monto ?? 0), 0);
}

export function getPagosParcialesFromAprobaciones(
  aprobaciones: Array<Doc<"facturacionAprobaciones">> | undefined,
) {
  return (aprobaciones ?? [])
    .filter((item) => item.accion === "pago_parcial" && item.pagoParcial)
    .map((item) => ({
      id: item._id,
      monto: item.pagoParcial!.monto,
      comprobanteNombre: item.pagoParcial!.comprobanteNombre,
      comprobanteStorageId: item.pagoParcial!.comprobanteStorageId,
      comentario: item.comentario,
      actorNombre: item.actorNombre,
      creadoEn: item.creadoEn,
    }))
    .sort((a, b) => a.creadoEn - b.creadoEn);
}

export function getSaldoPendientePagoParcial(
  factura: Pick<
    Doc<"facturacionFacturas">,
    "total" | "valorContable" | "valorAPagar" | "moneda" | "esLegalizacionAnticipo"
  > | null | undefined,
  totalPagado: number,
) {
  if (!factura) return 0;
  if (factura.esLegalizacionAnticipo && factura.valorAPagar !== undefined) {
    return Math.max(0, factura.valorAPagar);
  }
  const base = getValorContable(factura);
  return Math.max(0, base - totalPagado);
}

/** Máximo permitido para un nuevo pago parcial (saldo pendiente). */
export function getMaxMontoPagoParcial(
  factura: Pick<
    Doc<"facturacionFacturas">,
    "total" | "valorContable" | "valorAPagar" | "moneda" | "esLegalizacionAnticipo"
  >,
  totalPagado: number,
) {
  return getSaldoPendientePagoParcial(factura, totalPagado);
}

export function getValorBasePagoTesoreria(
  factura: Pick<
    Doc<"facturacionFacturas">,
    "total" | "valorContable" | "valorAPagar" | "esLegalizacionAnticipo"
  >,
) {
  return getBasePagoTesoreria(factura);
}
