"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatCOP } from "@/lib/format";

export type ReembolsoConfirmAction = "aprobar" | "rechazar" | "devolver" | "pago" | "generar";

export function ReembolsoConfirmDialog({
  open,
  action,
  faseDestino,
  devolverDestinoLabel,
  responsableNombre,
  facturaCount,
  valorTotal,
  valorTotalAnterior,
  facturasAjustadas,
  incluyeAjustesContables,
  comentario,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  action: ReembolsoConfirmAction | null;
  faseDestino?: string;
  devolverDestinoLabel?: string;
  responsableNombre?: string;
  facturaCount: number;
  valorTotal: number;
  valorTotalAnterior?: number;
  facturasAjustadas?: number;
  incluyeAjustesContables?: boolean;
  comentario?: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  if (!action) return null;

  const title =
    action === "rechazar"
      ? "Confirmar rechazo"
      : action === "devolver"
        ? "Confirmar devolución"
        : action === "pago"
          ? "Confirmar pago"
          : action === "generar"
            ? "Confirmar generación"
            : "Confirmar aprobación";

  const totalLabel =
    incluyeAjustesContables &&
    valorTotalAnterior !== undefined &&
    valorTotalAnterior !== valorTotal
      ? `${formatCOP(valorTotalAnterior)} → ${formatCOP(valorTotal)}`
      : formatCOP(valorTotal);

  const ajusteNotice =
    incluyeAjustesContables && (facturasAjustadas ?? 0) > 0
      ? `Se guardarán ajustes contables en ${facturasAjustadas} factura(s).`
      : null;

  const rechazoDevolucionAviso =
    incluyeAjustesContables && (action === "rechazar" || action === "devolver")
      ? "Los ajustes contables también se guardarán junto con esta decisión."
      : null;

  const description =
    action === "rechazar"
      ? `Se rechazará el reembolso completo (${facturaCount} factura(s) · ${totalLabel}).`
      : action === "devolver"
        ? `Se devolverá el reembolso completo (${facturaCount} factura(s) · ${totalLabel})${
            devolverDestinoLabel
              ? ` a ${devolverDestinoLabel}${responsableNombre ? ` · ${responsableNombre}` : ""}.`
              : " a Revisor Caja Menor."
          }`
        : action === "pago"
          ? `Se cerrará el reembolso (${facturaCount} factura(s) · ${totalLabel}) con el comprobante cargado.`
          : action === "generar"
            ? `Se generará la solicitud con ${facturaCount} factura(s) por ${totalLabel}${
                faseDestino ? ` y pasará a ${faseDestino}` : ""
              }.`
            : `Se aprobará el reembolso completo (${facturaCount} factura(s) · ${totalLabel})${
                faseDestino ? ` y pasará a ${faseDestino}` : ""
              }`;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <span className="block">{description}</span>
            {ajusteNotice ? (
              <span className="block text-xs font-medium text-violet-700">{ajusteNotice}</span>
            ) : null}
            {rechazoDevolucionAviso ? (
              <span className="block text-xs font-medium text-amber-700">
                {rechazoDevolucionAviso}
              </span>
            ) : null}
            {comentario?.trim() ? (
              <span className="block rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700">
                {action === "devolver" ? "Motivo" : "Comentario"}: {comentario.trim()}
              </span>
            ) : null}
            <span className="block text-xs font-medium text-slate-600">
              Esta acción aplica a todo el reembolso, no a facturas individuales.
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            {action === "devolver" ? "Confirmar devolución" : "Confirmar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
