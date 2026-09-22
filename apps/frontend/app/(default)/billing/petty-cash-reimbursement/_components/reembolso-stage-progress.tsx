import { cn } from "@/lib/utils";

import type { SolicitudBandejaRow } from "./types";

type ProgresoHit = SolicitudBandejaRow["progreso"][number];

export function ReembolsoStageProgress({
  progreso,
  compact = false,
}: {
  progreso: SolicitudBandejaRow["progreso"];
  compact?: boolean;
}) {
  if (compact) {
    return (
      <div className="flex items-center gap-1.5" aria-label="Progreso del reembolso">
        {progreso.map((hit: ProgresoHit) => (
          <span
            key={hit.etapa}
            title={hit.etapa}
            className={cn(
              "rounded-full",
              hit.estado === "actual" && "h-2.5 w-2.5 bg-slate-900",
              hit.estado === "completada" && "h-2 w-2 bg-emerald-500",
              hit.estado === "omitida" && "h-2 w-2 bg-amber-400",
              hit.estado === "pendiente" && "h-2 w-2 bg-slate-200",
            )}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-1">
      {progreso.map((hit: ProgresoHit) => (
        <span
          key={hit.etapa}
          className={cn(
            "rounded-full px-2 py-0.5 text-[11px] font-medium",
            hit.estado === "actual" && "bg-slate-900 text-white",
            hit.estado === "completada" && "bg-emerald-50 text-emerald-700",
            hit.estado === "omitida" && "bg-amber-50 text-amber-700",
            hit.estado === "pendiente" && "bg-slate-100 text-slate-500",
          )}
        >
          {hit.etapa}
        </span>
      ))}
    </div>
  );
}
