"use client";

import * as React from "react";
import { Check, X, ChevronDown, ChevronUp, Users, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { matchesSearchText } from "@/lib/search-text";

interface Option {
  label: string;
  value: string;
}

interface MultiSelectProps {
  options: Option[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
  className?: string;
  maxHeight?: string;
}

export function MultiSelect({
  options,
  selected,
  onChange,
  placeholder = "Seleccionar...",
  className,
  maxHeight,
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const listRef = React.useRef<HTMLDivElement>(null);

  const handleSelect = (value: string) => {
    const newSelected = selected.includes(value)
      ? selected.filter((v) => v !== value)
      : [...selected, value];
    onChange(newSelected);
  };

  const handleRemove = (value: string) => {
    onChange(selected.filter((v) => v !== value));
  };

  const selectedLabels = options
    .filter((opt) => selected.includes(opt.value))
    .map((opt) => opt.label);

  const filtered = options.filter((opt) => matchesSearchText(opt.label, search));

  return (
    <div className={cn("space-y-2", className)}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => {
          setOpen(!open);
          setSearch("");
        }}
        className={cn(
          "flex w-full items-center justify-between rounded-md border px-3 min-h-[44px] text-sm transition-colors",
          "bg-background hover:bg-accent/50",
          open
            ? "border-blue-400 ring-2 ring-blue-100"
            : "border-input"
        )}
      >
        <span className="truncate text-left">
          {selected.length === 0 ? (
            <span className="text-muted-foreground">{placeholder}</span>
          ) : (
            <span className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 text-blue-500 shrink-0" />
              {selected.length} seleccionado{selected.length !== 1 ? "s" : ""}
            </span>
          )}
        </span>
        {open ? (
          <ChevronUp className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        ) : (
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        )}
      </button>

      {/* Inline expandable list */}
      {open && (
        <div className="rounded-lg border border-slate-200 bg-white shadow-xs overflow-hidden">
          {/* Search */}
          <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
            <Search className="h-4 w-4 text-slate-400 shrink-0" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar..."
              className="flex-1 text-sm bg-transparent outline-hidden placeholder:text-slate-400"
              autoFocus
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Scrollable option list */}
          <div
            ref={listRef}
            className={cn("max-h-[240px] overflow-y-auto overscroll-contain", maxHeight)}
          >
            {filtered.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">
                No se encontraron resultados
              </p>
            ) : (
              filtered.map((option) => {
                const isSelected = selected.includes(option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleSelect(option.value)}
                    className={cn(
                      "flex w-full items-center gap-3 px-3 py-3 text-sm transition-colors border-b border-slate-50 last:border-0",
                      "active:bg-blue-50",
                      isSelected
                        ? "bg-blue-50/60 hover:bg-blue-50"
                        : "hover:bg-slate-50"
                    )}
                  >
                    <div
                      className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-xs border-2 transition-colors",
                        isSelected
                          ? "border-blue-600 bg-blue-600 text-white"
                          : "border-slate-300"
                      )}
                    >
                      {isSelected && <Check className="h-3 w-3" />}
                    </div>
                    <span className={cn("flex-1 text-left", isSelected && "font-medium text-blue-900")}>
                      {option.label}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          {/* Footer with count */}
          {options.length > 0 && (
            <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2 bg-slate-50/50">
              <span className="text-xs text-slate-500">
                {filtered.length} de {options.length} disponibles
              </span>
              {selected.length > 0 && (
                <button
                  type="button"
                  onClick={() => onChange([])}
                  className="text-xs text-red-500 hover:text-red-700 font-medium"
                >
                  Limpiar todo
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Selected badges */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedLabels.map((label, idx) => (
            <Badge
              key={idx}
              variant="secondary"
              className="gap-1 py-1 px-2 text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200"
            >
              {label}
              <button
                type="button"
                onClick={() => handleRemove(selected[idx])}
                className="ml-0.5 rounded-full hover:bg-blue-200 p-0.5 transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
