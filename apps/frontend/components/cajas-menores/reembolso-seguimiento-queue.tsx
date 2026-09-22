"use client";

import { Eye, ListChecks } from "lucide-react";

import {
  ReembolsoQueueCard,
  type ReembolsoQueueItem,
} from "@/components/cajas-menores/reembolso-queue-card";
import { Button } from "@/components/ui/button";

type ReembolsoSeguimientoQueueProps = {
  items: ReembolsoQueueItem[];
  onOpenDetails: (reembolso: ReembolsoQueueItem) => void;
};

export function ReembolsoSeguimientoQueue({
  items,
  onOpenDetails,
}: ReembolsoSeguimientoQueueProps) {
  if (items.length === 0) return null;

  return (
    <ReembolsoQueueCard
      title="Solicitudes en proceso"
      icon={<ListChecks className="h-4 w-4" />}
      empty="No hay solicitudes adicionales en proceso para seguimiento."
      items={items}
      countLabel="visible(s) sin acciones"
      renderActions={(reembolso) => (
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
      )}
    />
  );
}
