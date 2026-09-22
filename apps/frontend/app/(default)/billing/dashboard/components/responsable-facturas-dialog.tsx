"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency, formatDate } from "../../lib/utils";
import { formatAgeMs } from "../lib/format";
import {
  PHASE_LABELS,
  SLA_ESTADO_LABELS,
  compareFacturasPorUrgencia,
  type DatePreset,
  type FacturaLedgerRow,
  type FacturasPage,
  type ResponsablePanelGroup,
  type ResponsableRow,
} from "../types";

const LOCAL_PAGE_SIZE = 20;
const API_PAGE_SIZE = 100;

const SLA_BADGE_VARIANT: Record<
  string,
  "success" | "warning" | "destructive" | "secondary" | "outline"
> = {
  healthy: "success",
  warning: "warning",
  breached: "destructive",
  sin_sla: "secondary",
  n_a: "outline",
};

function montosLabel(montos: Record<string, number>) {
  const entries = Object.entries(montos).filter(([, v]) => v !== 0);
  if (entries.length === 0) return "—";
  return entries.map(([moneda, valor]) => formatCurrency(valor, moneda)).join(" · ");
}

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal, cache: "no-store" });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(
      (body && typeof body === "object" && "error" in body
        ? String((body as { error?: string }).error)
        : null) ?? `Error ${response.status}`
    );
  }
  return response.json() as Promise<T>;
}

async function loadAllFacturas(args: {
  empresasParam: string;
  preset: DatePreset;
  from?: string;
  to?: string;
  group: ResponsablePanelGroup;
  person: ResponsableRow;
  signal: AbortSignal;
}): Promise<FacturaLedgerRow[]> {
  const byId = new Map<string, FacturaLedgerRow>();
  let cursor: string | undefined;
  let guard = 0;

  while (guard < 200) {
    guard += 1;
    const params = new URLSearchParams({
      empresas: args.empresasParam,
      preset: args.preset,
      group: args.group,
      pageSize: String(API_PAGE_SIZE),
    });
    if (args.from) params.set("from", args.from);
    if (args.to) params.set("to", args.to);
    if (args.person.userId) {
      params.set("userId", args.person.userId);
    } else {
      params.set("email", args.person.email);
    }
    if (cursor) params.set("cursor", cursor);

    const batch = await fetchJson<FacturasPage>(
      `/api/billing/dashboard/responsables/facturas?${params.toString()}`,
      args.signal
    );

    for (const row of batch.page) {
      if (!byId.has(row.facturaId)) byId.set(row.facturaId, row);
    }

    if (batch.isDone || !batch.continueCursor) break;
    cursor = batch.continueCursor;
  }

  return [...byId.values()].sort(compareFacturasPorUrgencia);
}

function SlaBadge({ estado, umbralDias }: { estado: string; umbralDias: number | null }) {
  return (
    <Badge variant={SLA_BADGE_VARIANT[estado] ?? "outline"} className="whitespace-nowrap">
      {SLA_ESTADO_LABELS[estado] ?? estado}
      {umbralDias != null ? ` · ${umbralDias}d` : ""}
    </Badge>
  );
}

function SkeletonRows() {
  return (
    <div className="space-y-2 p-4" aria-hidden="true">
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={index}
          className="h-14 animate-pulse rounded-xl bg-slate-100 sm:h-11"
          style={{ animationDelay: `${index * 40}ms` }}
        />
      ))}
    </div>
  );
}

export function ResponsableFacturasDialog({
  open,
  onOpenChange,
  person,
  group,
  empresasParam,
  preset,
  from,
  to,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  person: ResponsableRow | null;
  group: ResponsablePanelGroup;
  empresasParam: string;
  preset: DatePreset;
  from?: string;
  to?: string;
}) {
  const [rows, setRows] = useState<FacturaLedgerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [reloadToken, setReloadToken] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadToken forces a manual retry.
  useEffect(() => {
    if (!open || !person) {
      setRows([]);
      setError(null);
      setLoading(false);
      setPageIndex(0);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setPageIndex(0);
    setRows([]);

    loadAllFacturas({
      empresasParam,
      preset,
      from,
      to,
      group,
      person,
      signal: controller.signal,
    })
      .then((data) => {
        if (controller.signal.aborted) return;
        setRows(data);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "No se pudieron cargar las facturas.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [open, person, group, empresasParam, preset, from, to, reloadToken]);

  const totalPages = Math.max(1, Math.ceil(rows.length / LOCAL_PAGE_SIZE));
  const safePage = Math.min(pageIndex, totalPages - 1);

  useEffect(() => {
    if (pageIndex !== safePage) setPageIndex(safePage);
  }, [pageIndex, safePage]);

  const pageRows = useMemo(() => {
    const start = safePage * LOCAL_PAGE_SIZE;
    return rows.slice(start, start + LOCAL_PAGE_SIZE);
  }, [rows, safePage]);

  const countMismatch =
    person != null && !loading && !error && rows.length !== person.invoiceCount;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92dvh] max-w-5xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-slate-200 px-5 py-4 pr-12 text-left">
          <DialogTitle className="text-base text-slate-950">
            Facturas de {person?.nombre ?? "responsable"}
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            {person?.email ?? ""} · Solo facturas activas incluidas en el conteo de esta fila.
          </DialogDescription>
        </DialogHeader>

        {person ? (
          <div className="grid gap-2 border-b border-slate-200 bg-slate-50 px-5 py-3 sm:grid-cols-2 lg:grid-cols-5">
            <SummaryStat label="Total" value={String(person.invoiceCount)} />
            <SummaryStat
              label="Por vencer"
              value={String(person.warningCount)}
              tone="warning"
            />
            <SummaryStat
              label="Vencidas"
              value={String(person.breachedCount)}
              tone="danger"
            />
            <SummaryStat label="Mayor antigüedad" value={formatAgeMs(person.oldestPhaseAgeMs)} />
            <SummaryStat label="Montos" value={montosLabel(person.montosPorMoneda)} />
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {error ? (
            <div className="flex flex-col items-center gap-3 px-5 py-12 text-center">
              <p className="text-sm text-rose-600">{error}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setReloadToken((n) => n + 1)}
              >
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                Reintentar
              </Button>
            </div>
          ) : loading ? (
            <SkeletonRows />
          ) : rows.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-slate-500">
              No hay facturas activas para {person?.nombre ?? "este responsable"} en el período y
              grupo seleccionados.
            </div>
          ) : (
            <>
              {countMismatch ? (
                <p className="border-b border-amber-200 bg-amber-50 px-5 py-2 text-xs text-amber-900">
                  Se cargaron {rows.length} facturas; el panel muestra {person?.invoiceCount}. El
                  listado refleja el estado actual.
                </p>
              ) : null}

              {/* Desktop table */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50 hover:bg-slate-50">
                      <TableHead>Factura</TableHead>
                      <TableHead>Proveedor / NIT</TableHead>
                      <TableHead>Emisión</TableHead>
                      <TableHead>Fase</TableHead>
                      <TableHead>SLA / antigüedad</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                      <TableHead className="w-[1%]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageRows.map((row) => (
                      <TableRow key={row.facturaId} className="hover:bg-slate-50">
                        <TableCell className="font-medium text-slate-900">
                          {row.numeroFactura}
                        </TableCell>
                        <TableCell className="max-w-[220px]">
                          <div className="truncate text-sm text-slate-900">
                            {row.proveedorNombre}
                          </div>
                          <div className="truncate text-xs text-slate-500">{row.proveedorNit}</div>
                        </TableCell>
                        <TableCell className="text-xs tabular-nums text-slate-600">
                          {formatDate(row.fechaEmision)}
                        </TableCell>
                        <TableCell className="text-sm text-slate-700">
                          {PHASE_LABELS[row.faseActual] ?? row.faseActual}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col items-start gap-1">
                            <SlaBadge estado={row.slaEstado} umbralDias={row.slaUmbralDias} />
                            <span className="text-xs tabular-nums text-slate-500">
                              {formatAgeMs(row.phaseAgeMs)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums text-slate-900">
                          {formatCurrency(row.valorContable, row.moneda)}
                        </TableCell>
                        <TableCell>
                          <OpenFacturaLink facturaId={row.facturaId} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile stacked cards */}
              <div className="flex flex-col gap-2 p-3 md:hidden">
                {pageRows.map((row) => (
                  <article
                    key={row.facturaId}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {row.numeroFactura}
                        </p>
                        <p className="truncate text-xs text-slate-500">
                          {row.proveedorNombre} · {row.proveedorNit}
                        </p>
                      </div>
                      <OpenFacturaLink facturaId={row.facturaId} />
                    </div>
                    <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                      <div>
                        <dt className="text-slate-500">Emisión</dt>
                        <dd className="tabular-nums text-slate-800">
                          {formatDate(row.fechaEmision)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">Monto</dt>
                        <dd className="tabular-nums text-slate-800">
                          {formatCurrency(row.valorContable, row.moneda)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">Fase</dt>
                        <dd className="text-slate-800">
                          {PHASE_LABELS[row.faseActual] ?? row.faseActual}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">SLA / antigüedad</dt>
                        <dd className="flex flex-col items-start gap-1">
                          <SlaBadge estado={row.slaEstado} umbralDias={row.slaUmbralDias} />
                          <span className="tabular-nums text-slate-600">
                            {formatAgeMs(row.phaseAgeMs)}
                          </span>
                        </dd>
                      </div>
                    </dl>
                  </article>
                ))}
              </div>
            </>
          )}
        </div>

        {!loading && !error && rows.length > 0 ? (
          <div className="flex items-center justify-between gap-2 border-t border-slate-200 px-4 py-3">
            <p className="text-xs text-slate-500">
              {rows.length} factura{rows.length === 1 ? "" : "s"} · página {safePage + 1} de{" "}
              {totalPages}
            </p>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 min-w-[44px]"
                disabled={safePage <= 0}
                onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
                aria-label="Página anterior"
              >
                <ChevronLeft className="h-4 w-4" />
                <span className="sr-only sm:not-sr-only sm:ml-1">Anterior</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 min-w-[44px]"
                disabled={safePage >= totalPages - 1}
                onClick={() => setPageIndex((p) => Math.min(totalPages - 1, p + 1))}
                aria-label="Página siguiente"
              >
                <span className="sr-only sm:not-sr-only sm:mr-1">Siguiente</span>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function SummaryStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "warning" | "danger";
}) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500">
        {label}
      </p>
      <p
        className={`truncate text-sm font-semibold tabular-nums ${
          tone === "danger"
            ? "text-rose-600"
            : tone === "warning"
              ? "text-amber-600"
              : "text-slate-900"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function OpenFacturaLink({ facturaId }: { facturaId: string }) {
  return (
    <a
      href={`/billing/invoices/${facturaId}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
    >
      Abrir
      <ExternalLink className="h-3 w-3 opacity-60" aria-hidden="true" />
      <span className="sr-only">factura en una pestaña nueva</span>
    </a>
  );
}
