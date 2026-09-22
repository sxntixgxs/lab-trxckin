"use client";

import { useState } from "react";
import { BadgeCheck, Eye, ArrowRightLeft, ShieldCheck } from "lucide-react";

import {
  ReembolsoQueueCard,
  type ReembolsoQueueItem,
} from "@/components/cajas-menores/reembolso-queue-card";
import { ReembolsoReasignarDialog } from "@/components/cajas-menores/reembolso-reasignar-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type ReembolsoRevisionQueueProps = {
  items: ReembolsoQueueItem[];
  actor: {
    actorUserId: string;
    actorNombre: string;
    actorEmail: string;
    actorRol?: number;
  };
  onReview: (reembolso: ReembolsoQueueItem) => void;
  onOpenDetails?: (reembolso: ReembolsoQueueItem) => void;
};

export function ReembolsoRevisionQueue({
  items,
  actor,
  onReview,
  onOpenDetails,
}: ReembolsoRevisionQueueProps) {
  const [reasignTarget, setReasignTarget] = useState<ReembolsoQueueItem | null>(
    null,
  );

  return (
    <>
      <ReembolsoQueueCard
        title="Revisión Revisor Caja Menor"
        icon={<ShieldCheck className="h-4 w-4" />}
        empty="No hay solicitudes pendientes de revisión."
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
            {reembolso.puedeReasignarRevision ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="rounded-xl"
                onClick={() => setReasignTarget(reembolso)}
              >
                <ArrowRightLeft className="mr-2 h-4 w-4" />
                Mover
              </Button>
            ) : null}
            {reembolso.puedeRevisar ? (
              <Button
                type="button"
                size="sm"
                className="rounded-xl"
                onClick={() => onReview(reembolso)}
              >
                <BadgeCheck className="mr-2 h-4 w-4" />
                Revisar
              </Button>
            ) : (
              <Badge
                variant="outline"
                className="rounded-full border-teal-200 bg-teal-50 text-teal-800"
              >
                Pendiente de Revisor Caja Menor
              </Badge>
            )}
          </>
        )}
      />
      <ReembolsoReasignarDialog
        mode="revision"
        reembolso={reasignTarget}
        empresaId={reasignTarget?.caja?.empresa_id}
        actor={actor}
        open={Boolean(reasignTarget)}
        onOpenChange={(open) => {
          if (!open) setReasignTarget(null);
        }}
      />
    </>
  );
}
