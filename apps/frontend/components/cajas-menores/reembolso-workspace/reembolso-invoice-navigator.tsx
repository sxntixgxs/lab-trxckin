"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Search,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCOP } from "@/lib/format";
import { cn } from "@/lib/utils";

import type { ReembolsoInvoiceItem } from "./types";
import {
  getEffectiveValor,
  invoiceTieneBorradorAjustado,
  type ValorContableDraft,
} from "./valor-contable-drafts";

export function ReembolsoInvoiceNavigator({
  invoices,
  activeKey,
  onSelect,
  onPrev,
  onNext,
  compactOnNarrow = false,
  valorContableDrafts,
}: {
  invoices: ReembolsoInvoiceItem[];
  activeKey: string | null;
  onSelect: (key: string) => void;
  onPrev: () => void;
  onNext: () => void;
  /** Horizontal compact toolbar + row below lg; desktop list unchanged. */
  compactOnNarrow?: boolean;
  valorContableDrafts?: Record<string, ValorContableDraft | undefined>;
}) {
  const [query, setQuery] = useState("");
  const showSearch = invoices.length >= 10;
  const itemRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return invoices;
    return invoices.filter((invoice) => {
      return (
        invoice.numeroFactura.toLowerCase().includes(needle) ||
        invoice.proveedorNombre.toLowerCase().includes(needle)
      );
    });
  }, [invoices, query]);

  const activeIndex = invoices.findIndex((invoice) => invoice.key === activeKey);
  const facturaPosition =
    activeIndex >= 0 ? activeIndex + 1 : invoices.length > 0 ? 1 : 0;

  useEffect(() => {
    if (!compactOnNarrow || !activeKey) return;
    const node = itemRefs.current.get(activeKey);
    node?.scrollIntoView({
      behavior: "smooth",
      inline: "nearest",
      block: "nearest",
    });
  }, [activeKey, compactOnNarrow, filtered]);

  const canGoPrev = activeIndex > 0;
  const canGoNext = activeIndex >= 0 && activeIndex < invoices.length - 1;

  function setItemRef(key: string, node: HTMLButtonElement | null) {
    if (node) itemRefs.current.set(key, node);
    else itemRefs.current.delete(key);
  }

  const searchField = showSearch ? (
    <div className="relative">
      <Search
        className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
        aria-hidden
      />
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Buscar por número o proveedor"
        className="h-8 rounded-lg pl-8 text-xs"
      />
    </div>
  ) : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className={cn(
          "shrink-0 border-b border-slate-200 bg-white",
          compactOnNarrow ? "space-y-2 px-2 py-2 lg:px-3 lg:py-3" : "space-y-2 px-3 py-3",
        )}
      >
        {compactOnNarrow ? (
          <>
            <div className="flex items-center gap-2 lg:hidden">
              <p
                className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-900"
                aria-live="polite"
                aria-atomic="true"
              >
                Factura {facturaPosition} de {invoices.length}
              </p>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 rounded-lg p-0"
                  disabled={!canGoPrev}
                  onClick={onPrev}
                  aria-label="Factura anterior"
                >
                  <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 rounded-lg p-0"
                  disabled={!canGoNext}
                  onClick={onNext}
                  aria-label="Factura siguiente"
                >
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                </Button>
              </div>
            </div>

            <div className="hidden space-y-2 lg:block">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Facturas</p>
                  <p
                    className="text-xs text-slate-500"
                    aria-live="polite"
                    aria-atomic="true"
                  >
                    Factura {facturaPosition} de {invoices.length}
                  </p>
                </div>
                <Badge variant="outline" className="tabular-nums">
                  {invoices.length}
                </Badge>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 flex-1 rounded-lg"
                  disabled={!canGoPrev}
                  onClick={onPrev}
                >
                  <ChevronUp className="mr-1 h-3.5 w-3.5" aria-hidden />
                  Anterior
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 flex-1 rounded-lg"
                  disabled={!canGoNext}
                  onClick={onNext}
                >
                  Siguiente
                  <ChevronDown className="ml-1 h-3.5 w-3.5" aria-hidden />
                </Button>
              </div>
            </div>

            {searchField}
          </>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-slate-900">Facturas</p>
                <p
                  className="text-xs text-slate-500"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  Factura {facturaPosition} de {invoices.length}
                </p>
              </div>
              <Badge variant="outline" className="tabular-nums">
                {invoices.length}
              </Badge>
            </div>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 flex-1 rounded-lg"
                disabled={!canGoPrev}
                onClick={onPrev}
              >
                <ChevronUp className="mr-1 h-3.5 w-3.5" aria-hidden />
                Anterior
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 flex-1 rounded-lg"
                disabled={!canGoNext}
                onClick={onNext}
              >
                Siguiente
                <ChevronDown className="ml-1 h-3.5 w-3.5" aria-hidden />
              </Button>
            </div>
            {searchField}
          </>
        )}
      </div>

      <div
        className={cn(
          "min-h-0 flex-1 overscroll-contain p-2",
          compactOnNarrow
            ? "overflow-x-auto overflow-y-hidden lg:overflow-x-hidden lg:overflow-y-auto"
            : "overflow-y-auto",
        )}
        role="listbox"
        aria-label="Lista de facturas del reembolso"
      >
        <div
          className={cn(
            "gap-1.5",
            compactOnNarrow ? "flex flex-row lg:flex-col" : "flex flex-col",
          )}
        >
          {filtered.map((invoice) => {
            const active = invoice.key === activeKey;
            const docCount = invoice.documents.length;
            const draft = valorContableDrafts?.[invoice.movimientoId];
            const adjusted = invoiceTieneBorradorAjustado(invoice, draft);
            const displayValor = valorContableDrafts
              ? getEffectiveValor(invoice, valorContableDrafts)
              : invoice.valor;
            return (
              <button
                key={invoice.key}
                ref={(node) => setItemRef(invoice.key, node)}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => onSelect(invoice.key)}
                className={cn(
                  "rounded-xl border px-3 py-2.5 text-left transition",
                  compactOnNarrow && "w-[200px] shrink-0 lg:w-auto lg:shrink",
                  active
                    ? "border-slate-900 bg-slate-50 shadow-xs ring-2 ring-slate-900/10"
                    : "border-slate-200 bg-white hover:border-slate-300",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-sm font-semibold text-slate-950">
                        #{invoice.numeroFactura}
                      </p>
                      {adjusted ? (
                        <Badge className="h-4 shrink-0 border-0 bg-violet-100 px-1.5 text-[9px] font-semibold text-violet-800 hover:bg-violet-100">
                          Ajustada
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {invoice.proveedorNombre}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs font-semibold tabular-nums text-slate-900">
                      {formatCOP(displayValor)}
                    </p>
                    {adjusted && displayValor !== invoice.valor ? (
                      <p className="text-[10px] tabular-nums text-slate-400 line-through">
                        {formatCOP(invoice.valor)}
                      </p>
                    ) : null}
                    <p className="mt-0.5 text-[10px] tabular-nums text-slate-500">
                      {docCount === 0
                        ? "Sin docs"
                        : `${docCount} doc${docCount === 1 ? "" : "s"}`}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
          {filtered.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-500">
              Sin coincidencias.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
