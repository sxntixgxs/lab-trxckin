"use client";

import { ClipboardList, Eye, ShieldCheck } from "lucide-react";

import {
  ReembolsoQueueCard,
  type ReembolsoQueueItem,
} from "@/components/cajas-menores/reembolso-queue-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type ReembolsoAprobacionQueueProps = {
  items: ReembolsoQueueItem[];
  onOpenModal: (reembolso: ReembolsoQueueItem) => void;
  onOpenDetails?: (reembolso: ReembolsoQueueItem) => void;
};

export function ReembolsoAprobacionQueue({
  items,
  onOpenModal,
  onOpenDetails,
}: ReembolsoAprobacionQueueProps) {
  return (
    <ReembolsoQueueCard
      title="Aprobación Gerencia Financiera"
      icon={<ClipboardList className="h-4 w-4" />}
      empty="No hay reembolsos pendientes de aprobación."
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
          {reembolso.puedeAprobar ? (
            <Button
              type="button"
              size="sm"
              className="rounded-xl bg-amber-600 hover:bg-amber-700"
              onClick={() => onOpenModal(reembolso)}
            >
              <ShieldCheck className="mr-2 h-4 w-4" />
              Revisar y decidir
            </Button>
          ) : (
            <Badge
              variant="outline"
              className="rounded-full border-amber-200 bg-amber-50 text-amber-800"
            >
              Pendiente de Gerencia Financiera
            </Badge>
          )}
        </>
      )}
    />
  );
}
