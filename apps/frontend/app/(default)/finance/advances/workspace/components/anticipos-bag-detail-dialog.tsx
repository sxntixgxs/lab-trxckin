"use client";

import {
  AlertTriangle,
  Building2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  Loader2,
  ReceiptText,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import { useDeferredValue, useEffect, useId, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { getEmpresaNombre } from "@/lib/empresas";
import { cn } from "@/lib/utils";

import { faseLabels, formatterCOP } from "../../dashboard/constants";
import { formatDate, getEstadoClass, normalizeFaseActual } from "../../dashboard/utils";
import { bagWorkspacePageNumber, isBagFilterStateDefault } from "../bag-workspace-utils";
import type {
  AnticiposBagItem,
  AnticiposBagItemsResponse,
  AnticiposBagSort,
  AnticiposBagStatus,
} from "../types";

const STATUS_OPTIONS: Array<{ value: AnticiposBagStatus; label: string }> = [
  { value: "pending", label: "Pendientes" },
  { value: "overdue", label: "Vencidos" },
  { value: "legalized", label: "Legalizados" },
  { value: "all", label: "Todos" },
];

const SORT_OPTIONS: Array<{ value: AnticiposBagSort; label: string }> = [
  { value: "priority", label: "Prioridad operativa" },
  { value: "pending", label: "Mayor saldo" },
  { value: "recent", label: "Más recientes" },
];

function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center rounded-xl border border-slate-200 bg-white px-6 py-10 text-center">
      <FileText className="h-8 w-8 text-slate-300" />
      <p className="mt-3 text-sm font-semibold text-slate-900">{title}</p>
      <p className="mt-1 max-w-md text-sm text-slate-600">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

function InvoicePreview({ item, onNavigate }: { item: AnticiposBagItem; onNavigate: () => void }) {
  if (!item.facturas.length) {
    return (
      <p className="flex items-center gap-2 text-xs text-slate-500">
        <FileText className="h-3.5 w-3.5" />
        Sin facturas cruzadas
      </p>
    );
  }

  return (
    <div className="space-y-1">
      {item.facturas.map((invoice) => (
        <a
          key={invoice.facturaId}
          href={`/billing/invoices/${invoice.facturaId}`}
          onClick={(event) => {
            event.stopPropagation();
            onNavigate();
          }}
          onKeyDown={(event) => event.stopPropagation()}
          className="flex min-w-0 items-center gap-2 text-xs font-medium text-emerald-700 hover:underline"
        >
          <ReceiptText className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">Factura #{invoice.numeroFactura}</span>
          <span className="ml-auto shrink-0 tabular-nums">
            {formatterCOP.format(invoice.valorAplicado)}
          </span>
          <ExternalLink className="h-3.5 w-3.5 shrink-0" />
        </a>
      ))}
      {item.hasMoreInvoices ? (
        <p className="text-[11px] text-slate-500">Más facturas en el detalle</p>
      ) : null}
    </div>
  );
}

function BagItemTableRow({
  item,
  onDetail,
}: {
  item: AnticiposBagItem;
  onDetail: (anticipoId: string) => void;
}) {
  const deadlineLabel =
    item.faseActual === "V_PENDIENTE_LEGALIZACION" ? formatDate(item.maxLegalizacionDate) : null;

  return (
    <tr
      className="border-b border-slate-200 last:border-b-0"
      data-testid={`bag-item-row-${item.anticipoId}`}
    >
      <td className="px-4 py-3 align-top">
        <p className="text-sm font-semibold text-slate-900">
          #{item.consecutivo} · {item.razonSocial}
        </p>
        <p className="mt-0.5 text-xs text-slate-500">NIT {item.nit}</p>
      </td>
      <td className="px-4 py-3 align-top">
        <Badge
          variant="outline"
          className={cn("rounded-full text-[11px]", getEstadoClass(item.faseActual))}
        >
          {faseLabels[normalizeFaseActual(item.faseActual)] ?? item.faseActual}
        </Badge>
        {deadlineLabel ? (
          <p
            className={cn(
              "mt-1 text-xs tabular-nums",
              item.isOverdue ? "font-medium text-rose-700" : "text-slate-500"
            )}
          >
            {item.isOverdue ? "Vencido · " : "Límite · "}
            {deadlineLabel}
          </p>
        ) : null}
      </td>
      <td className="px-4 py-3 align-top text-sm font-semibold tabular-nums text-slate-900">
        {formatterCOP.format(item.valorContable)}
      </td>
      <td className="px-4 py-3 align-top text-sm tabular-nums text-emerald-700">
        {formatterCOP.format(item.saldoLegalizado)}
      </td>
      <td className="px-4 py-3 align-top text-sm tabular-nums text-amber-800">
        {formatterCOP.format(item.saldoPendiente)}
      </td>
      <td className="px-4 py-3 align-top">
        <InvoicePreview item={item} onNavigate={() => onDetail(item.anticipoId)} />
      </td>
      <td className="px-4 py-3 align-top text-right">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 rounded-lg"
          onClick={() => onDetail(item.anticipoId)}
        >
          Ver detalle
        </Button>
      </td>
    </tr>
  );
}

function BagItemMobileCard({
  item,
  onDetail,
}: {
  item: AnticiposBagItem;
  onDetail: (anticipoId: string) => void;
}) {
  const deadlineLabel =
    item.faseActual === "V_PENDIENTE_LEGALIZACION" ? formatDate(item.maxLegalizacionDate) : null;

  return (
    <li
      className="border-b border-slate-200 px-4 py-3 last:border-b-0"
      data-testid={`bag-item-card-${item.anticipoId}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">
            #{item.consecutivo} · {item.razonSocial}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">NIT {item.nit}</p>
          <Badge
            variant="outline"
            className={cn("mt-2 rounded-full text-[11px]", getEstadoClass(item.faseActual))}
          >
            {faseLabels[normalizeFaseActual(item.faseActual)] ?? item.faseActual}
          </Badge>
          {deadlineLabel ? (
            <p
              className={cn(
                "mt-1 text-xs tabular-nums",
                item.isOverdue ? "font-medium text-rose-700" : "text-slate-500"
              )}
            >
              {item.isOverdue ? "Vencido · " : "Límite · "}
              {deadlineLabel}
            </p>
          ) : null}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 shrink-0 rounded-lg"
          onClick={() => onDetail(item.anticipoId)}
        >
          Ver detalle
        </Button>
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-3 text-xs">
        <div>
          <dt className="text-slate-500">Total</dt>
          <dd className="mt-0.5 font-semibold tabular-nums text-slate-900">
            {formatterCOP.format(item.valorContable)}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Legalizado</dt>
          <dd className="mt-0.5 font-semibold tabular-nums text-emerald-700">
            {formatterCOP.format(item.saldoLegalizado)}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Pendiente</dt>
          <dd className="mt-0.5 font-semibold tabular-nums text-amber-800">
            {formatterCOP.format(item.saldoPendiente)}
          </dd>
        </div>
      </dl>
      <div className="mt-3">
        <InvoicePreview item={item} onNavigate={() => onDetail(item.anticipoId)} />
      </div>
    </li>
  );
}

export function AnticiposBagDetailDialog({
  open,
  suspendedForAnticipoDetail,
  onOpenChange,
  data,
  isLoading,
  isFetching,
  error,
  q,
  estado,
  orden,
  canGoBack,
  canGoNext,
  pageNumber,
  onRetry,
  onSearchChange,
  onEstadoChange,
  onOrdenChange,
  onClearFilters,
  onPreviousPage,
  onNextPage,
  onDetail,
}: {
  open: boolean;
  suspendedForAnticipoDetail: boolean;
  onOpenChange: (open: boolean) => void;
  data?: AnticiposBagItemsResponse;
  isLoading: boolean;
  isFetching: boolean;
  error?: string;
  q: string;
  estado: AnticiposBagStatus;
  orden: AnticiposBagSort;
  canGoBack: boolean;
  canGoNext: boolean;
  pageNumber: number;
  onRetry: () => void;
  onSearchChange: (value: string) => void;
  onEstadoChange: (value: AnticiposBagStatus) => void;
  onOrdenChange: (value: AnticiposBagSort) => void;
  onClearFilters: () => void;
  onPreviousPage: () => void;
  onNextPage: () => void;
  onDetail: (anticipoId: string) => void;
}) {
  const searchId = useId();
  const liveRegionId = useId();
  const [liveMessage, setLiveMessage] = useState("");
  const deferredSearch = useDeferredValue(q);
  const summary = data?.summary;
  const rows = data?.page ?? [];
  const filtersDifferFromDefault = !isBagFilterStateDefault({ q, estado, orden });
  const showUpdating = isFetching && !isLoading;
  const resolvedPageNumber = pageNumber || bagWorkspacePageNumber(0);

  useEffect(() => {
    if (!open || isLoading) return;
    const statusLabel = STATUS_OPTIONS.find((option) => option.value === estado)?.label ?? estado;
    const sortLabel = SORT_OPTIONS.find((option) => option.value === orden)?.label ?? orden;
    setLiveMessage(
      `${rows.length} anticipos visibles. Filtro ${statusLabel}. Orden ${sortLabel}. Página ${resolvedPageNumber}.`
    );
  }, [estado, isLoading, open, orden, resolvedPageNumber, rows.length]);

  const progress =
    summary && summary.legalizable > 0
      ? Math.min(100, (summary.legalized / summary.legalizable) * 100)
      : 0;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      data-suspended={suspendedForAnticipoDetail ? "true" : undefined}
    >
      <DialogContent
        className={cn(
          "flex h-[100dvh] max-h-[100dvh] w-[100vw] max-w-[100vw] flex-col gap-0 overflow-hidden rounded-none border-0 p-0",
          "lg:h-[92dvh] lg:max-h-[92dvh] lg:w-[min(98vw,1400px)] lg:max-w-[min(98vw,1400px)] lg:rounded-xl lg:border"
        )}
      >
        <div id={liveRegionId} aria-live="polite" className="sr-only">
          {liveMessage}
        </div>

        {isLoading ? (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-600">
            <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" />
            Cargando anticipos de la bolsa…
          </div>
        ) : error ? (
          <div className="flex flex-1 items-center justify-center p-6">
            <EmptyState
              title="No se pudo cargar la bolsa"
              description={error}
              action={
                <Button type="button" onClick={onRetry}>
                  Reintentar
                </Button>
              }
            />
          </div>
        ) : !summary ? (
          <div className="flex flex-1 items-center justify-center p-6">
            <EmptyState
              title="Bolsa no encontrada"
              description="La bolsa solicitada no existe o ya no está disponible."
            />
          </div>
        ) : (
          <>
            <DialogHeader className="shrink-0 space-y-0 border-b border-slate-200 px-4 py-4 pr-12 text-left sm:px-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <DialogTitle className="text-lg font-semibold text-slate-950">
                      {summary.procesoNombre}
                    </DialogTitle>
                    <Badge variant="outline" className="rounded-full bg-white text-[11px]">
                      {summary.tipoBolsa === "peajes" ? "PEAJES" : "General"}
                    </Badge>
                  </div>
                  <DialogDescription className="mt-1 flex items-center gap-1.5 text-sm text-slate-600">
                    <Building2 className="h-4 w-4" />
                    {getEmpresaNombre(summary.empresa)} · {summary.count} anticipos
                  </DialogDescription>
                  {!summary.summaryComplete ? (
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-800">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Los totales pueden estar incompletos por el volumen de la bolsa.
                    </p>
                  ) : null}
                </div>
                {summary.overdue > 0 ? (
                  <Badge
                    variant="outline"
                    className="w-fit rounded-full border-rose-200 bg-rose-50 text-rose-800"
                  >
                    <AlertTriangle className="mr-1 h-3.5 w-3.5" />
                    {summary.overdue} vencidos
                  </Badge>
                ) : null}
              </div>

              <div className="mt-4 grid gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 sm:grid-cols-2 xl:grid-cols-5">
                {[
                  { label: "Solicitado", value: summary.requested },
                  { label: "Contabilizado", value: summary.accounting },
                  { label: "Legalizado", value: summary.legalized, tone: "text-emerald-700" },
                  { label: "Pendiente", value: summary.pending, tone: "text-amber-800" },
                  { label: "Anticipos", value: summary.count, count: true },
                ].map((item) => (
                  <div key={item.label} className="bg-white px-4 py-3">
                    <p className="text-xs font-medium text-slate-500">{item.label}</p>
                    <p
                      className={cn(
                        "mt-1 text-lg font-semibold tabular-nums text-slate-950",
                        item.tone
                      )}
                    >
                      {item.count ? item.value : formatterCOP.format(item.value)}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-emerald-600 motion-reduce:transition-none"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </DialogHeader>

            <div className="shrink-0 space-y-4 border-b border-slate-200 px-4 py-4 sm:px-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <label htmlFor={searchId} className="relative block min-w-0 flex-1">
                  <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    id={searchId}
                    value={q}
                    onChange={(event) => onSearchChange(event.target.value)}
                    placeholder="Buscar por número, proveedor o NIT"
                    className="h-10 rounded-lg pl-9"
                  />
                </label>
                {filtersDifferFromDefault ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-10 gap-1.5 rounded-lg"
                    onClick={onClearFilters}
                  >
                    <RotateCcw className="h-4 w-4" />
                    Limpiar filtros
                  </Button>
                ) : null}
              </div>

              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex flex-wrap gap-1" role="group" aria-label="Estado de anticipos">
                  {STATUS_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={estado === option.value}
                      onClick={() => onEstadoChange(option.value)}
                      className={cn(
                        "min-h-9 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
                        estado === option.value
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                <label className="flex items-center gap-2 text-xs text-slate-600">
                  <span className="font-medium">Ordenar</span>
                  <select
                    value={orden}
                    onChange={(event) => onOrdenChange(event.target.value as AnticiposBagSort)}
                    className="h-9 min-w-44 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-900 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {SORT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            <div
              className={cn(
                "relative min-h-0 flex-1 overflow-y-auto",
                showUpdating ? "opacity-80" : undefined
              )}
            >
              {showUpdating ? (
                <div className="absolute top-3 right-4 z-10 flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 shadow-sm">
                  <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
                  Actualizando…
                </div>
              ) : null}

              {summary.count === 0 ? (
                <div className="p-4 sm:p-5">
                  <EmptyState
                    title="Bolsa vacía"
                    description="Esta bolsa no tiene anticipos registrados todavía."
                  />
                </div>
              ) : rows.length === 0 ? (
                <div className="p-4 sm:p-5">
                  <EmptyState
                    title={
                      deferredSearch
                        ? "Sin coincidencias"
                        : estado === "pending"
                          ? "No hay anticipos pendientes"
                          : estado === "overdue"
                            ? "No hay anticipos vencidos"
                            : estado === "legalized"
                              ? "No hay anticipos legalizados"
                              : "No hay anticipos para mostrar"
                    }
                    description={
                      deferredSearch
                        ? "Prueba con otro número de anticipo, proveedor o NIT."
                        : "Cambia el filtro de estado o limpia la búsqueda para ver más resultados."
                    }
                    action={
                      filtersDifferFromDefault ? (
                        <Button type="button" variant="outline" onClick={onClearFilters}>
                          <X className="mr-1.5 h-4 w-4" />
                          Restablecer filtros
                        </Button>
                      ) : undefined
                    }
                  />
                </div>
              ) : (
                <>
                  <table className="hidden w-full text-left lg:table">
                    <thead className="sticky top-0 z-[1] border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                      <tr>
                        <th scope="col" className="px-4 py-3">
                          Anticipo
                        </th>
                        <th scope="col" className="px-4 py-3">
                          Estado / fecha límite
                        </th>
                        <th scope="col" className="px-4 py-3">
                          Total
                        </th>
                        <th scope="col" className="px-4 py-3">
                          Legalizado
                        </th>
                        <th scope="col" className="px-4 py-3">
                          Pendiente
                        </th>
                        <th scope="col" className="px-4 py-3">
                          Facturas
                        </th>
                        <th scope="col" className="px-4 py-3 text-right">
                          <span className="sr-only">Acciones</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((item) => (
                        <BagItemTableRow key={item.anticipoId} item={item} onDetail={onDetail} />
                      ))}
                    </tbody>
                  </table>

                  <ul className="lg:hidden">
                    {rows.map((item) => (
                      <BagItemMobileCard key={item.anticipoId} item={item} onDetail={onDetail} />
                    ))}
                  </ul>
                </>
              )}
            </div>

            {rows.length > 0 ? (
              <footer className="flex shrink-0 flex-col gap-3 border-t border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <p className="text-xs text-slate-500">
                  Página {resolvedPageNumber} · 20 por página
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9"
                    onClick={onPreviousPage}
                    disabled={!canGoBack}
                    aria-label="Página anterior"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9"
                    onClick={onNextPage}
                    disabled={!canGoNext}
                    aria-label="Página siguiente"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </footer>
            ) : null}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
