"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CalendarRange, RefreshCw, Search, Settings2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FacturacionSyncInboxButton } from "../../components/sync-inbox-button";
import { timeAgo } from "../../lib/utils";
import { DATE_PRESET_LABELS, type DatePreset } from "../types";

const PRESETS: DatePreset[] = ["mes_actual", "mes_anterior", "personalizado", "todas"];

export function CommandHeader({
  empresaNombre,
  preset,
  from,
  to,
  search,
  lastRefreshedAt,
  isRefreshing,
  onPresetChange,
  onCustomRange,
  onSearchChange,
  onRefresh,
}: {
  empresaNombre?: string;
  preset: DatePreset;
  from?: string;
  to?: string;
  search: string;
  lastRefreshedAt: number | null;
  isRefreshing: boolean;
  onPresetChange: (preset: DatePreset) => void;
  onCustomRange: (from: string, to: string) => void;
  onSearchChange: (value: string) => void;
  onRefresh: () => void;
}) {
  const [customOpen, setCustomOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(from ?? "");
  const [draftTo, setDraftTo] = useState(to ?? "");
  const hasInvalidRange = Boolean(draftFrom && draftTo && draftFrom > draftTo);

  useEffect(() => {
    if (!customOpen) return;
    setDraftFrom(from ?? "");
    setDraftTo(to ?? "");
  }, [customOpen, from, to]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold leading-tight text-slate-950 sm:text-xl">
            Facturación
          </h1>
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
            <span>{empresaNombre ?? "Todas las empresas"}</span>
            <span aria-hidden="true">·</span>
            <span>
              {lastRefreshedAt ? `Actualizado ${timeAgo(lastRefreshedAt)}` : "Sin datos aún"}
            </span>
          </p>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 min-w-[44px] rounded-xl bg-white px-3"
            onClick={onRefresh}
            aria-label="Actualizar datos del panel"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
          </Button>
          <FacturacionSyncInboxButton variant="outline" />
          <Button asChild variant="ghost" size="sm" className="h-9 rounded-xl">
            <Link href="/billing/settings#sla">
              <Settings2 className="mr-1.5 h-4 w-4" />
              SLA
            </Link>
          </Button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div
          role="group"
          aria-label="Rango de fechas"
          className="inline-flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1"
        >
          {PRESETS.map((option) => {
            const active = preset === option;
            if (option === "personalizado") {
              return (
                <Popover key={option} open={customOpen} onOpenChange={setCustomOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className={`inline-flex h-9 min-w-[44px] items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring ${
                        active ? "bg-slate-900 text-white" : "text-slate-600 hover:text-slate-900"
                      }`}
                      onClick={() => setCustomOpen(true)}
                    >
                      <CalendarRange className="h-3.5 w-3.5" />
                      {active && from && to ? `${from} → ${to}` : DATE_PRESET_LABELS[option]}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto" align="start">
                    <div className="space-y-3">
                      <p className="text-sm font-medium text-slate-900">Rango personalizado</p>
                      <div className="flex items-center gap-2">
                        <Input
                          type="date"
                          value={draftFrom}
                          onChange={(event) => setDraftFrom(event.target.value)}
                          className="h-10"
                          aria-label="Fecha desde"
                        />
                        <span className="text-slate-400">→</span>
                        <Input
                          type="date"
                          value={draftTo}
                          onChange={(event) => setDraftTo(event.target.value)}
                          className="h-10"
                          aria-label="Fecha hasta"
                        />
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        className="w-full"
                        disabled={!draftFrom || !draftTo || hasInvalidRange}
                        onClick={() => {
                          if (!draftFrom || !draftTo) return;
                          onCustomRange(draftFrom, draftTo);
                          setCustomOpen(false);
                        }}
                      >
                        Aplicar rango
                      </Button>
                      {hasInvalidRange ? (
                        <p className="text-xs text-rose-600">
                          La fecha inicial debe ser anterior o igual a la final.
                        </p>
                      ) : null}
                    </div>
                  </PopoverContent>
                </Popover>
              );
            }
            return (
              <button
                key={option}
                type="button"
                className={`inline-flex h-9 min-w-[44px] items-center rounded-lg px-3 text-xs font-medium transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring ${
                  active ? "bg-slate-900 text-white" : "text-slate-600 hover:text-slate-900"
                }`}
                onClick={() => onPresetChange(option)}
              >
                {DATE_PRESET_LABELS[option]}
              </button>
            );
          })}
        </div>

        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Buscar responsable por nombre o correo..."
            className="h-9 rounded-xl border-slate-200 bg-white pl-9 pr-9"
            aria-label="Buscar responsables por nombre o correo"
          />
          {search ? (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              aria-label="Limpiar búsqueda"
              className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:text-slate-700 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
