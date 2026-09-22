"use client";

import { useState } from "react";
import { BadgeCheck, Eye, ArrowRightLeft, Calculator } from "lucide-react";

import {
  ReembolsoQueueCard,
  type ReembolsoQueueItem,
} from "@/components/cajas-menores/reembolso-queue-card";
import { ReembolsoReasignarDialog } from "@/components/cajas-menores/reembolso-reasignar-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type ReembolsoContabilidadQueueProps = {
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

export function ReembolsoContabilidadQueue({
  items,
  actor,
  onReview,
  onOpenDetails,
}: ReembolsoContabilidadQueueProps) {
  const [reasignTarget, setReasignTarget] = useState<ReembolsoQueueItem | null>(
    null,
  );

  return (
    <>
      <ReembolsoQueueCard
        title="Revisión de Impuestos/Contabilidad"
        icon={<Calculator className="h-4 w-4" />}
        empty="No hay solicitudes pendientes de revisión de Impuestos/Contabilidad."
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
            {reembolso.puedeReasignarContabilidad ? (
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
            {reembolso.puedeDecidirContabilidad ? (
              <Button
                type="button"
                size="sm"
                className="rounded-xl bg-sky-700 hover:bg-sky-800"
                onClick={() => onReview(reembolso)}
              >
                <BadgeCheck className="mr-2 h-4 w-4" />
                Revisar y decidir
              </Button>
            ) : (
              <Badge
                variant="outline"
                className="rounded-full border-sky-200 bg-sky-50 text-sky-800"
              >
                Pendiente de Contabilidad
              </Badge>
            )}
          </>
        )}
      />
      <ReembolsoReasignarDialog
        mode="contabilidad"
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
