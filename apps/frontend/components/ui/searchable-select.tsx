"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";
import { matchesSearchText } from "@/lib/search-text";
import { cn } from "@/lib/utils";

interface Option {
  label: string;
  value: string;
}

interface SearchableSelectProps {
  options: Option[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  emptyMessage?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
  filterOptions?: (
    options: Option[],
    search: string,
    selectedValue: string,
  ) => Option[];
  totalOptionsCount?: number;
}

export function SearchableSelect({
  options,
  value,
  onValueChange,
  placeholder = "Seleccionar...",
  emptyMessage = "No se encontraron resultados",
  className,
  disabled = false,
  id,
  filterOptions,
  totalOptionsCount,
}: SearchableSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const containerRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const selectedOption = React.useMemo(() => {
    const fromOptions = options.find((opt) => opt.value === value);
    if (fromOptions) return fromOptions;
    if (filterOptions && value) {
      return filterOptions(options, "", value).find((opt) => opt.value === value);
    }
    return undefined;
  }, [filterOptions, options, value]);

  const filtered = React.useMemo(() => {
    if (filterOptions) {
      return filterOptions(options, search, value);
    }
    if (!search.trim()) return options;
    return options.filter((opt) => matchesSearchText(opt.label, search));
  }, [filterOptions, options, search, value]);

  const availableCount = totalOptionsCount ?? options.length;

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
        setSearch("");
      }
    };
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  React.useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => {
          setOpen(!open);
          setSearch("");
        }}
        className={cn(
          "flex w-full items-center justify-between rounded-md border px-3 h-10 text-sm transition-colors",
          "bg-background hover:bg-accent/50",
          open
            ? "border-blue-400 ring-2 ring-blue-100"
            : "border-input",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        <span className="truncate text-left">
          {selectedOption ? (
            selectedOption.label
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
        </span>
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </button>

      {open && (
        <div className="absolute z-50 left-0 mt-1 min-w-full w-max max-w-[min(420px,calc(100vw-2rem))] rounded-lg border border-slate-200 bg-white shadow-lg overflow-hidden">
          <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
            <Search className="h-4 w-4 text-slate-400 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar..."
              className="flex-1 text-sm bg-transparent outline-hidden placeholder:text-slate-400"
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

          <div className="max-h-[240px] overflow-y-auto overscroll-contain">
            {filtered.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">
                {emptyMessage}
              </p>
            ) : (
              filtered.map((option) => {
                const isSelected = option.value === value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      onValueChange(option.value);
                      setOpen(false);
                      setSearch("");
                    }}
                    className={cn(
                      "flex w-full items-center gap-3 px-3 py-2.5 text-sm transition-colors border-b border-slate-50 last:border-0",
                      "active:bg-blue-50",
                      isSelected
                        ? "bg-blue-50/60 hover:bg-blue-50"
                        : "hover:bg-slate-50"
                    )}
                  >
                    <Check
                      className={cn(
                        "h-4 w-4 shrink-0",
                        isSelected ? "opacity-100 text-blue-600" : "opacity-0"
                      )}
                    />
                    <span
                      className={cn(
                        "min-w-0 flex-1 text-left wrap-break-word whitespace-normal",
                        isSelected && "font-medium text-blue-900"
                      )}
                    >
                      {option.label}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          <div className="flex items-center justify-between border-t border-slate-100 px-3 py-1.5 bg-slate-50/50">
            <span className="text-xs text-slate-500">
              {filtered.length} de {availableCount} disponibles
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
