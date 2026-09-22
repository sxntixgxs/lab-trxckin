"use client";

import { Eye, ShieldCheck, UserCheck } from "lucide-react";

import {
  ReembolsoQueueCard,
  type ReembolsoQueueItem,
} from "@/components/cajas-menores/reembolso-queue-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type ReembolsoLiderQueueProps = {
  items: ReembolsoQueueItem[];
  onOpenModal: (reembolso: ReembolsoQueueItem) => void;
  onOpenDetails?: (reembolso: ReembolsoQueueItem) => void;
};

export function ReembolsoLiderQueue({
  items,
  onOpenModal,
  onOpenDetails,
}: ReembolsoLiderQueueProps) {
  return (
    <ReembolsoQueueCard
      title="Aprobación líder"
      icon={<UserCheck className="h-4 w-4" />}
      empty="No hay solicitudes pendientes de aprobación líder."
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
          {reembolso.puedeAprobarLider ? (
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
              Pendiente de líder
            </Badge>
          )}
        </>
      )}
    />
  );
}
