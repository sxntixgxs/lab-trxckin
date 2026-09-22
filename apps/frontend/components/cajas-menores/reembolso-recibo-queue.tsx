"use client";

import { CheckCircle2, Download, Eye, Loader2, Upload } from "lucide-react";

import {
  ReembolsoQueueCard,
  type ReembolsoQueueItem,
} from "@/components/cajas-menores/reembolso-queue-card";
import { Button } from "@/components/ui/button";
import type { Id } from "@/convex/_generated/dataModel";
import { getReembolsoEstadoLabel } from "@/lib/cajas-menores";

type ReembolsoReciboQueueProps = {
  items: ReembolsoQueueItem[];
  loadingKey: string | null;
  onConfirm: (reembolsoId: Id<"cajasMenoresReembolsos">) => void;
  onOpenModal?: (reembolso: ReembolsoQueueItem) => void;
  onDownloadFormato?: (reembolso: ReembolsoQueueItem) => void;
  onOpenDetails?: (reembolso: ReembolsoQueueItem) => void;
};

export function ReembolsoReciboQueue({
  items,
  loadingKey,
  onConfirm,
  onOpenModal,
  onDownloadFormato,
  onOpenDetails,
}: ReembolsoReciboQueueProps) {
  return (
    <ReembolsoQueueCard
      title="Pendiente pago Tesorería / recibos legacy"
      icon={<CheckCircle2 className="h-4 w-4" />}
      empty="No hay reembolsos pendientes de pago o recibo."
      countLabel="asignada(s) para actuar"
      items={items}
      renderActions={(reembolso) => (
        <>
          {onOpenDetails ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="rounded-xl"
              onClick={() => onOpenDetails(reembolso)}
            >
              <Eye className="mr-2 h-4 w-4" />
              Ver detalle
            </Button>
          ) : null}
          {onDownloadFormato && reembolso.formatoSnapshot ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="rounded-xl"
              onClick={() => onDownloadFormato(reembolso)}
            >
              <Download className="mr-2 h-4 w-4" />
              Formato GFN-F006
            </Button>
          ) : null}
          {reembolso.estado === "pendiente_pago_tesoreria" &&
          reembolso.puedeCargarComprobante &&
          onOpenModal ? (
            <Button
              type="button"
              size="sm"
              className="rounded-xl bg-sky-600 hover:bg-sky-700"
              onClick={() => onOpenModal(reembolso)}
            >
              <Upload className="mr-2 h-4 w-4" />
              Cargar comprobante de pago
            </Button>
          ) : null}
          {reembolso.estado === "aprobado_pendiente_recibo" &&
          reembolso.puedeConfirmar ? (
            <Button
              type="button"
              size="sm"
              className="rounded-xl"
              disabled={loadingKey === `confirm:${reembolso._id}`}
              onClick={() =>
                onConfirm(reembolso._id as Id<"cajasMenoresReembolsos">)
              }
            >
              {loadingKey === `confirm:${reembolso._id}` ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-2 h-4 w-4" />
              )}
              Confirmar recibo (legacy)
            </Button>
          ) : null}
          {!reembolso.puedeConfirmar && !reembolso.puedeCargarComprobante ? (
            <p className="text-xs text-slate-500">
              {getReembolsoEstadoLabel(reembolso.estado)} · custodio{" "}
              {reembolso.custodioNombre}
            </p>
          ) : null}
        </>
      )}
    />
  );
}
