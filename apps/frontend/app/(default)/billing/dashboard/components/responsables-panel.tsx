"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight, Users } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "../../lib/utils";
import { formatAgeMs } from "../lib/format";
import {
  RESPONSABLE_PANEL_GROUP_LABELS,
  normalizeSearchText,
  type DatePreset,
  type ResponsablePanelGroup,
  type ResponsableRow,
  type ResponsablesResponse,
} from "../types";
import { ResponsableFacturasDialog } from "./responsable-facturas-dialog";

const PANEL_GROUPS: ResponsablePanelGroup[] = [
  "lideres",
  "fases_contables",
  "tesoreria",
  "recepcion",
  "gerencia",
];

type SortKey = "nombre" | "invoiceCount" | "warningCount" | "breachedCount" | "oldestPhaseAgeMs";

function montosLabel(montos: Record<string, number>) {
  const entries = Object.entries(montos).filter(([, v]) => v !== 0);
  if (entries.length === 0) return "—";
  return entries.map(([moneda, valor]) => formatCurrency(valor, moneda)).join(" · ");
}

function personKey(row: ResponsableRow) {
  return row.userId ? row.userId : `email:${row.email}`;
}

function SortHeader({
  label,
  sortableKey,
  sortKey,
  sortDir,
  onToggle,
}: {
  label: string;
  sortableKey: SortKey;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onToggle: (key: SortKey) => void;
}) {
  const active = sortKey === sortableKey;
  return (
    <button
      type="button"
      onClick={() => onToggle(sortableKey)}
      className="inline-flex items-center gap-1 rounded-md px-1 py-1 text-xs font-semibold uppercase tracking-[0.06em] text-slate-500 hover:text-slate-900 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
    >
      {label}
      {active ? (
        sortDir === "asc" ? (
          <ArrowUp className="h-3 w-3" />
        ) : (
          <ArrowDown className="h-3 w-3" />
        )
      ) : (
        <ArrowUpDown className="h-3 w-3 opacity-40" />
      )}
    </button>
  );
}

export function ResponsablesPanel({
  data,
  isLoading,
  error,
  activeGroup,
  search,
  empresasParam,
  preset,
  from,
  to,
  onGroupChange,
}: {
  data: ResponsablesResponse | undefined;
  isLoading: boolean;
  error: string | null;
  activeGroup: ResponsablePanelGroup;
  search: string;
  empresasParam: string;
  preset: DatePreset;
  from?: string;
  to?: string;
  onGroupChange: (group: ResponsablePanelGroup) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("breachedCount");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selectedPerson, setSelectedPerson] = useState<ResponsableRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const groupCounts = useMemo(() => {
    const counts = new Map<ResponsablePanelGroup, number>();
    for (const group of data?.groups ?? []) {
      counts.set(
        group.group,
        group.people.reduce((sum, person) => sum + person.invoiceCount, 0)
      );
    }
    return counts;
  }, [data?.groups]);

  const activePeople = useMemo(() => {
    const group = data?.groups.find((entry) => entry.group === activeGroup);
    const needle = normalizeSearchText(search);
    const rows = [...(group?.people ?? [])].filter((person) => {
      if (!needle) return true;
      const haystack = normalizeSearchText(`${person.nombre} ${person.email}`);
      return haystack.includes(needle);
    });
    rows.sort((a, b) => {
      let diff = 0;
      if (sortKey === "nombre") {
        diff = a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" });
      } else if (sortKey === "oldestPhaseAgeMs") {
        diff = (a.oldestPhaseAgeMs ?? -Infinity) - (b.oldestPhaseAgeMs ?? -Infinity);
      } else {
        diff = a[sortKey] - b[sortKey];
      }
      return sortDir === "asc" ? diff : -diff;
    });
    return rows;
  }, [activeGroup, data?.groups, search, sortDir, sortKey]);

  const totalInGroup = useMemo(() => {
    const group = data?.groups.find((entry) => entry.group === activeGroup);
    return group?.people.length ?? 0;
  }, [activeGroup, data?.groups]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function openPerson(person: ResponsableRow) {
    setSelectedPerson(person);
    setDialogOpen(true);
  }

  const sortProps = { sortKey, sortDir, onToggle: toggleSort };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-3">
        <Users className="h-4 w-4 text-slate-500" />
        <h2 className="text-sm font-semibold text-slate-900">Carga por responsable</h2>
        {search.trim() && totalInGroup > 0 ? (
          <span className="text-xs text-slate-500">
            Mostrando {activePeople.length} de {totalInGroup}
          </span>
        ) : null}
      </div>

      <div
        role="tablist"
        aria-label="Grupos de responsables"
        className="flex flex-wrap gap-1 border-b border-slate-200 px-3 py-2"
      >
        {PANEL_GROUPS.map((group) => {
          const isActive = activeGroup === group;
          const count = groupCounts.get(group) ?? 0;
          return (
            <button
              key={group}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onGroupChange(group)}
              className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring ${
                isActive
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
              }`}
            >
              {RESPONSABLE_PANEL_GROUP_LABELS[group]}
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${
                  isActive ? "bg-white/15 text-white" : "bg-slate-100 text-slate-600"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {error ? (
        <div className="px-4 py-8 text-center text-sm text-rose-600">{error}</div>
      ) : isLoading && !data ? (
        <div className="space-y-2 px-4 py-4" aria-busy="true" aria-label="Cargando responsables">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="h-12 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      ) : activePeople.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-slate-500">
          {search.trim()
            ? `Ningún responsable coincide con “${search.trim()}” en este grupo.`
            : "No hay responsables con carga activa en este grupo."}
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 hover:bg-slate-50">
                  <TableHead>
                    <SortHeader {...sortProps} label="Responsable" sortableKey="nombre" />
                  </TableHead>
                  <TableHead className="text-right">
                    <SortHeader {...sortProps} label="Facturas" sortableKey="invoiceCount" />
                  </TableHead>
                  <TableHead className="text-right">
                    <SortHeader {...sortProps} label="Alertas" sortableKey="warningCount" />
                  </TableHead>
                  <TableHead className="text-right">
                    <SortHeader {...sortProps} label="Vencidas" sortableKey="breachedCount" />
                  </TableHead>
                  <TableHead className="text-right">
                    <SortHeader {...sortProps} label="Más antigua" sortableKey="oldestPhaseAgeMs" />
                  </TableHead>
                  <TableHead className="text-right text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">
                    Monto
                  </TableHead>
                  <TableHead className="w-[1%]">
                    <span className="sr-only">Ver facturas</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activePeople.map((person) => {
                  const key = personKey(person);
                  return (
                    <TableRow key={key} className="group hover:bg-slate-50">
                      <TableCell className="max-w-[280px]">
                        <button
                          type="button"
                          onClick={() => openPerson(person)}
                          className="-my-2 flex min-h-[44px] w-full flex-col justify-center rounded-md py-2 text-left focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                          aria-label={`Ver facturas de ${person.nombre}`}
                        >
                          <span className="truncate text-sm font-medium text-slate-900">
                            {person.nombre}
                          </span>
                          <span className="truncate text-xs text-slate-500">
                            {person.email}
                            {person.sharedInvoiceCount > 0 ? (
                              <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium">
                                {person.sharedInvoiceCount} compartida(s)
                              </span>
                            ) : null}
                          </span>
                        </button>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-slate-900">
                        {person.invoiceCount}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-amber-600">
                        {person.warningCount}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-rose-600">
                        {person.breachedCount}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums text-slate-500">
                        {formatAgeMs(person.oldestPhaseAgeMs)}
                      </TableCell>
                      <TableCell className="text-right text-xs text-slate-500">
                        {montosLabel(person.montosPorMoneda)}
                      </TableCell>
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => openPerson(person)}
                          className="inline-flex min-h-[36px] items-center gap-0.5 rounded-lg px-2 text-xs font-medium text-slate-500 opacity-70 transition-opacity hover:bg-slate-100 hover:text-slate-900 hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
                          aria-label={`Consultar facturas de ${person.nombre}`}
                        >
                          Ver
                          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Mobile stacked rows */}
          <div className="flex flex-col gap-2 p-3 md:hidden">
            {activePeople.map((person) => (
              <button
                key={personKey(person)}
                type="button"
                onClick={() => openPerson(person)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-left transition-colors hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Ver facturas de ${person.nombre}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{person.nombre}</p>
                    <p className="truncate text-xs text-slate-500">{person.email}</p>
                  </div>
                  <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs sm:grid-cols-4">
                  <div>
                    <dt className="text-slate-500">Facturas</dt>
                    <dd className="font-medium tabular-nums text-slate-900">{person.invoiceCount}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Alertas</dt>
                    <dd className="font-medium tabular-nums text-amber-600">{person.warningCount}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Vencidas</dt>
                    <dd className="font-medium tabular-nums text-rose-600">{person.breachedCount}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Más antigua</dt>
                    <dd className="tabular-nums text-slate-700">
                      {formatAgeMs(person.oldestPhaseAgeMs)}
                    </dd>
                  </div>
                </dl>
                <p className="mt-2 text-xs text-slate-500">{montosLabel(person.montosPorMoneda)}</p>
              </button>
            ))}
          </div>
        </>
      )}

      <ResponsableFacturasDialog
        open={dialogOpen}
        onOpenChange={(next) => {
          setDialogOpen(next);
          if (!next) setSelectedPerson(null);
        }}
        person={selectedPerson}
        group={activeGroup}
        empresasParam={empresasParam}
        preset={preset}
        from={from}
        to={to}
      />
    </div>
  );
}
