"use client";

import { X } from "lucide-react";
import type { FilterChip } from "../types";

export function ActiveFiltersBar({
  chips,
  onRemoveChip,
  onClearAll,
}: {
  chips: FilterChip[];
  onRemoveChip: (chip: FilterChip) => void;
  onClearAll: () => void;
}) {
  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-2.5">
      <span className="text-xs font-medium text-sky-900">Filtros activos</span>
      <div className="flex flex-wrap items-center gap-1.5">
        {chips.map((chip) => (
          <button
            key={chip.id}
            type="button"
            onClick={() => onRemoveChip(chip)}
            className="inline-flex min-h-[28px] items-center gap-1 rounded-full border border-sky-200 bg-white px-2.5 py-1 text-xs font-medium text-sky-900 hover:border-sky-300 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
          >
            {chip.label}
            <X className="h-3 w-3 opacity-60" />
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onClearAll}
        className="ml-auto inline-flex min-h-[28px] items-center rounded-md px-2 py-1 text-xs font-medium text-sky-900 hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
      >
        Limpiar todo
      </button>
    </div>
  );
}
