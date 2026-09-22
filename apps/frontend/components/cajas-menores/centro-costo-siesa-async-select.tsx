"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { useConvex } from "convex/react";
import {
  AlertCircle,
  Check,
  ChevronDown,
  RotateCw,
  Search,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { api } from "@/convex/_generated/api";
import type { CentroCostoOption } from "@/lib/centros-costo-siesa";
import {
  isCentroCostoSiesaIdInScope,
  resolveCentroCostoCatalogScope,
} from "@/lib/centro-costo-catalog-scope";
import { cn } from "@/lib/utils";

const SEARCH_MIN_LENGTH = 2;
const SEARCH_DEBOUNCE_MS = 350;

export type CentroCostoSelectedSnapshot = {
  id?: string;
  codigo: string;
  nombre: string;
};

type CentroCostoSiesaAsyncSelectProps = {
  empresa: number | null | undefined;
  value?: CentroCostoSelectedSnapshot | null;
  onValueChange: (value: CentroCostoOption) => void;
  disabled?: boolean;
  className?: string;
  id?: string;
};

type SearchStatus = "idle" | "loading" | "success" | "error";

type CentroCostoSearchResult = {
  id: string;
  codigo: string;
  nombre: string;
  centroOperacion: string | null;
};

function toAppEmpresaArg(
  empresa: number | null | undefined,
): 1 | 2 | 3 | 4 | null {
  if (empresa === 1 || empresa === 2 || empresa === 3 || empresa === 4) {
    return empresa;
  }
  return null;
}

export function CentroCostoSiesaAsyncSelect({
  empresa,
  value,
  onValueChange,
  disabled = false,
  className,
  id,
}: CentroCostoSiesaAsyncSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CentroCostoSearchResult[]>([]);
  const convex = useConvex();
  const [status, setStatus] = useState<SearchStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestSequenceRef = useRef(0);
  const listboxId = `${useId()}-centros-costo`;

  const scope = useMemo(
    () => resolveCentroCostoCatalogScope(empresa),
    [empresa],
  );
  const normalizedQuery = query.trim();
  const canSearch = normalizedQuery.length >= SEARCH_MIN_LENGTH;
  const selectionOutOfScope = Boolean(
    value?.id && !isCentroCostoSiesaIdInScope(value.id, empresa),
  );

  useEffect(() => {
    const requestId = ++requestSequenceRef.current;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    if (!open || !scope || !canSearch) {
      setResults([]);
      setStatus("idle");
      setErrorMessage(null);
      return;
    }

    setResults([]);
    setStatus("loading");
    setErrorMessage(null);

    timeoutId = setTimeout(() => {
      void convex
        .query(api.centrosCosto.buscar, {
          appEmpresa: toAppEmpresaArg(empresa),
          q: normalizedQuery,
        })
        .then((rows) => {
          if (requestId !== requestSequenceRef.current) return;
          setResults(
            rows.filter((row) => isCentroCostoSiesaIdInScope(row.id, empresa)),
          );
          setActiveIndex(0);
          setStatus("success");
        })
        .catch((error: unknown) => {
          if (requestId !== requestSequenceRef.current) return;
          setStatus("error");
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "No se pudo consultar el catálogo de centros de costo.",
          );
        });
    }, retryToken > 0 ? 0 : SEARCH_DEBOUNCE_MS);

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [canSearch, convex, empresa, normalizedQuery, open, retryToken, scope]);

  function selectResult(result: CentroCostoSearchResult) {
    onValueChange({
      id: result.id,
      codigo: result.codigo,
      nombre: result.nombre,
    });
    setOpen(false);
    setQuery("");
    setResults([]);
    setStatus("idle");
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (status !== "success" || results.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % results.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex(
        (current) => (current - 1 + results.length) % results.length,
      );
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const result = results[activeIndex];
      if (result) selectResult(result);
    }
  }

  const selectedLabel = value?.codigo
    ? `${value.codigo} - ${value.nombre || value.codigo}`
    : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          disabled={disabled}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-label={
            selectionOutOfScope
              ? "Centro de costo fuera de la empresa; seleccionar otro"
              : "Seleccionar centro de costo"
          }
          aria-invalid={selectionOutOfScope || undefined}
          className={cn(
            "flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 transition-colors",
            "hover:border-teal-300 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-teal-200",
            open && !selectionOutOfScope && "border-teal-400 ring-2 ring-teal-100",
            selectionOutOfScope &&
              "border-rose-300 bg-rose-50 text-rose-900 hover:border-rose-400 focus-visible:ring-rose-200",
            disabled && "cursor-not-allowed bg-slate-50 opacity-60",
            className,
          )}
        >
          {selectionOutOfScope ? (
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" aria-hidden />
          ) : null}
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-left",
              !selectedLabel && "text-slate-600",
            )}
          >
            {selectionOutOfScope ? "Fuera de empresa · " : null}
            {selectedLabel ?? "Centro de costo"}
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200 motion-reduce:transition-none",
              open && "rotate-180",
            )}
            aria-hidden
          />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={6}
        className="w-[var(--radix-popover-trigger-width)] min-w-[280px] max-w-[min(440px,calc(100vw-2rem))] overflow-hidden p-0"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2.5">
          <Search className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
          <input
            ref={inputRef}
            role="combobox"
            aria-label="Buscar centro de costo"
            aria-autocomplete="list"
            aria-controls={listboxId}
            aria-expanded={open}
            aria-activedescendant={
              status === "success" && results[activeIndex]
                ? `${listboxId}-option-${activeIndex}`
                : undefined
            }
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setRetryToken(0);
            }}
            onKeyDown={handleInputKeyDown}
            placeholder="Código o descripción"
            className="h-8 min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-hidden placeholder:text-slate-600"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Limpiar búsqueda"
              className="rounded-md p-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-teal-200"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          ) : null}
        </div>

        {selectionOutOfScope ? (
          <div
            role="alert"
            className="border-b border-rose-100 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-800"
          >
            El centro guardado no pertenece a esta empresa. Selecciona un
            centro válido para reemplazarlo.
          </div>
        ) : null}

        <div
          id={listboxId}
          role="listbox"
          aria-label="Resultados de centros de costo"
          className="max-h-64 overflow-y-auto overscroll-contain"
        >
          {!scope ? (
            <div className="px-4 py-5 text-center text-sm text-slate-700">
              No hay un catálogo de centros de costo configurado para esta
              empresa.
            </div>
          ) : !canSearch ? (
            <div className="px-4 py-5 text-center">
              <p className="text-sm font-medium text-slate-800">
                Busca por código o descripción
              </p>
              <p className="mt-1 text-xs text-slate-600">
                Escribe al menos {SEARCH_MIN_LENGTH} caracteres.
              </p>
            </div>
          ) : status === "loading" ? (
            <div
              role="status"
              aria-label="Buscando centros de costo"
              className="space-y-2 px-3 py-3"
            >
              {[0, 1, 2].map((item) => (
                <div
                  key={item}
                  className="space-y-1.5 rounded-lg bg-slate-50 px-3 py-2.5 motion-safe:animate-pulse"
                >
                  <div className="h-3 w-24 rounded bg-slate-200" />
                  <div className="h-3 w-4/5 rounded bg-slate-200" />
                </div>
              ))}
            </div>
          ) : status === "error" ? (
            <div role="alert" className="px-4 py-5 text-center">
              <AlertCircle
                className="mx-auto h-5 w-5 text-rose-600"
                aria-hidden
              />
              <p className="mt-2 text-sm font-medium text-slate-900">
                No pudimos buscar los centros de costo
              </p>
              <p className="mx-auto mt-1 max-w-[34ch] text-xs text-slate-600">
                {errorMessage}
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-3"
                onClick={() => setRetryToken((current) => current + 1)}
              >
                <RotateCw className="h-3.5 w-3.5" aria-hidden />
                Reintentar
              </Button>
            </div>
          ) : status === "success" && results.length === 0 ? (
            <div className="px-4 py-5 text-center">
              <p className="text-sm font-medium text-slate-800">
                Sin resultados para “{normalizedQuery}”
              </p>
              <p className="mt-1 text-xs text-slate-600">
                No hay coincidencias en el catálogo de esta empresa. Revisa el
                código o intenta con parte de la descripción.
              </p>
            </div>
          ) : (
            results.map((result, index) => {
              const selected = value?.id === result.id;
              const active = index === activeIndex;
              return (
                <button
                  key={result.id}
                  type="button"
                  id={`${listboxId}-option-${index}`}
                  role="option"
                  aria-selected={selected}
                  onMouseEnter={() => setActiveIndex(index)}
                  onFocus={() => setActiveIndex(index)}
                  onClick={() => selectResult(result)}
                  className={cn(
                    "flex w-full items-start gap-2.5 border-b border-slate-100 px-3 py-2.5 text-left transition-colors last:border-b-0",
                    "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-300",
                    active && "bg-slate-50",
                    selected && "bg-teal-50",
                  )}
                >
                  <Check
                    className={cn(
                      "mt-0.5 h-4 w-4 shrink-0 text-teal-700",
                      !selected && "opacity-0",
                    )}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-slate-950">
                      {result.codigo}
                    </span>
                    <span className="mt-0.5 block text-xs leading-5 text-slate-700">
                      {result.nombre}
                    </span>
                    {result.centroOperacion ? (
                      <span className="mt-1 block text-[11px] text-slate-600">
                        Centro de operación {result.centroOperacion}
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
