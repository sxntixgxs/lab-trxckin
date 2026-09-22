import { Badge } from "@/components/ui/badge";

import type { CajaRow } from "./types";

export function CajaStatus({ row }: { row: CajaRow }) {
  if (row.estado === "anulado") {
    return (
      <Badge
        variant="outline"
        className="border-rose-200 bg-rose-50 text-rose-700"
      >
        Anulada
      </Badge>
    );
  }
  if (row.estado === "cerrada") {
    return <Badge variant="outline">Cerrada</Badge>;
  }
  if (row.refillPendiente) {
    return (
      <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
        Bloqueada por refill
      </Badge>
    );
  }
  return <Badge className="bg-emerald-100 text-emerald-700">Activa</Badge>;
}
