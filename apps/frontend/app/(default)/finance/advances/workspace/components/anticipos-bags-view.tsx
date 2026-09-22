"use client";

import {
  AlertTriangle,
  ArrowRight,
  Building2,
  ChevronDown,
  ExternalLink,
  FileText,
  Loader2,
  ReceiptText,
  WalletCards,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getEmpresaNombre } from "@/lib/empresas";
import { cn } from "@/lib/utils";

import { faseLabels, formatterCOP } from "../../dashboard/constants";
import { getEstadoClass, normalizeFaseActual } from "../../dashboard/utils";
import type { AnticiposBagSummary } from "../types";

export function AnticiposBagsView({
  bags,
  isLoading,
  error,
  onDetail,
  onOpenBag,
}: {
  bags: AnticiposBagSummary[];
  isLoading: boolean;
  error?: string;
  onDetail: (anticipoId: string) => void;
  onOpenBag: (bag: AnticiposBagSummary, trigger: HTMLButtonElement | null) => void;
}) {
  const totals = bags.reduce(
    (result, bag) => ({
      requested: result.requested + bag.requested,
      accounting: result.accounting + bag.accounting,
      legalizable: result.legalizable + bag.legalizable,
      legalized: result.legalized + bag.legalized,
      pending: result.pending + bag.pending,
      overdue: result.overdue + bag.overdue,
    }),
    { requested: 0, accounting: 0, legalizable: 0, legalized: 0, pending: 0, overdue: 0 }
  );

  if (isLoading) {
    return (
      <div className="flex min-h-72 items-center justify-center rounded-xl border border-slate-200 bg-white text-sm text-slate-600">
        <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" />
        Consolidando bolsas por empresa y proceso…
      </div>
    );
  }

  if (error) {
    return <div className="rounded-xl bg-rose-50 px-5 py-4 text-sm text-rose-800">{error}</div>;
  }

  return (
    <section className="space-y-4" aria-labelledby="bags-title">
      <header className="rounded-xl border border-slate-200 bg-white px-5 py-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
            <WalletCards className="h-5 w-5" />
          </span>
          <div>
            <h2 id="bags-title" className="text-base font-semibold text-slate-950">
              Bolsas de anticipos
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-600">
              Seguimiento del dinero contabilizado, cruzado y pendiente por empresa y proceso. Una
              bolsa no representa un cupo presupuestal nuevo.
            </p>
          </div>
        </div>
      </header>

      <div className="grid gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 sm:grid-cols-2 xl:grid-cols-6">
        {[
          { label: "Valor solicitado", value: totals.requested },
          { label: "Valor contabilizado", value: totals.accounting },
          { label: "Legalizable", value: totals.legalizable },
          { label: "Legalizado", value: totals.legalized },
          { label: "Saldo pendiente", value: totals.pending },
          { label: "Anticipos vencidos", value: totals.overdue, count: true },
        ].map((item) => (
          <div key={item.label} className="bg-white px-5 py-4">
            <p className="text-xs font-medium text-slate-500">{item.label}</p>
            <p className="mt-2 text-xl font-semibold tabular-nums text-slate-950">
              {item.count ? item.value : formatterCOP.format(item.value)}
            </p>
          </div>
        ))}
      </div>

      {bags.length === 0 ? (
        <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-slate-200 bg-white px-6 text-center">
          <WalletCards className="h-8 w-8 text-slate-300" />
          <p className="mt-3 text-sm font-semibold text-slate-900">
            No hay bolsas para este alcance
          </p>
          <p className="mt-1 text-sm text-slate-600">
            Las bolsas se crean al registrar solicitudes por empresa y proceso.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          {bags.map((bag) => {
            const progress =
              bag.legalizable > 0
                ? Math.min(100, (bag.legalized / bag.legalizable) * 100)
                : 0;
            return (
              <details
                key={bag.key}
                className="group border-b border-slate-200 transition-colors last:border-b-0 open:bg-emerald-50/40 open:ring-2 open:ring-inset open:ring-emerald-500/50"
              >
                <summary className="grid cursor-pointer list-none gap-4 border-l-2 border-l-transparent px-5 py-4 transition-[background-color,border-color,box-shadow] hover:border-l-emerald-500 hover:bg-slate-50 focus-visible:border-l-emerald-600 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600 group-open:border-l-emerald-600 group-open:bg-emerald-50/70 lg:grid-cols-[minmax(220px,1fr)_150px_150px_150px_150px_auto] lg:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold text-slate-950">
                        {bag.procesoNombre}
                      </p>
                      <Badge variant="outline" className="rounded-full bg-white text-[11px]">
                        {bag.tipoBolsa === "peajes" ? "PEAJES" : "General"}
                      </Badge>
                    </div>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                      <Building2 className="h-3.5 w-3.5" />
                      {getEmpresaNombre(bag.empresa)} · {bag.count} anticipos
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Solicitado</p>
                    <p className="mt-1 text-sm font-semibold tabular-nums text-slate-900">
                      {formatterCOP.format(bag.requested)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Contabilizado</p>
                    <p className="mt-1 text-sm font-semibold tabular-nums text-slate-900">
                      {formatterCOP.format(bag.accounting)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Legalizado</p>
                    <p className="mt-1 text-sm font-semibold tabular-nums text-emerald-700">
                      {formatterCOP.format(bag.legalized)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Pendiente</p>
                    <p className="mt-1 text-sm font-semibold tabular-nums text-amber-800">
                      {formatterCOP.format(bag.pending)}
                    </p>
                  </div>
                  <div className="flex items-center justify-end gap-3">
                    {bag.overdue > 0 ? (
                      <Badge
                        variant="outline"
                        className="rounded-full border-rose-200 bg-rose-50 text-rose-800"
                      >
                        <AlertTriangle className="mr-1 h-3.5 w-3.5" />
                        {bag.overdue} vencidos
                      </Badge>
                    ) : null}
                    <ChevronDown className="h-4 w-4 text-slate-400 transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none" />
                  </div>
                  <div className="lg:col-span-6">
                    <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-emerald-600"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                </summary>
                <div className="border-t border-emerald-200 bg-emerald-50/30 px-5 py-4">
                  <p className="text-xs font-semibold text-slate-700">Últimos 5 anticipos</p>
                  <div className="mt-3 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
                    {bag.recentItems.map((item) => (
                      <div
                        key={item.anticipoId}
                        role="button"
                        tabIndex={0}
                        aria-label={`Abrir anticipo #${item.consecutivo}`}
                        onClick={() => onDetail(item.anticipoId)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            onDetail(item.anticipoId);
                          }
                        }}
                        className="grid cursor-pointer gap-3 px-4 py-3 transition-colors hover:bg-slate-50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600 lg:grid-cols-[minmax(0,1fr)_180px_minmax(220px,.8fr)] lg:items-center"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900">
                            #{item.consecutivo} · {item.razonSocial}
                          </p>
                          <Badge
                            variant="outline"
                            className={cn(
                              "mt-1 rounded-full text-[11px]",
                              getEstadoClass(item.faseActual)
                            )}
                          >
                            {faseLabels[normalizeFaseActual(item.faseActual)] ?? item.faseActual}
                          </Badge>
                        </div>
                        <div className="text-sm tabular-nums text-slate-700">
                          {item.faseActual === "V_PENDIENTE_LEGALIZACION" ? (
                            <>
                              <p className="font-semibold text-amber-900">
                                {formatterCOP.format(item.saldoPendiente)}
                              </p>
                              <p className="text-xs text-slate-500">
                                Saldo pendiente · Legalizado{" "}
                                {formatterCOP.format(item.saldoLegalizado)} de{" "}
                                {formatterCOP.format(item.valorLegalizable)}
                              </p>
                            </>
                          ) : (
                            <>
                              <p className="font-semibold">
                                {formatterCOP.format(item.valorContable)}
                              </p>
                              <p className="text-xs text-slate-500">
                                Legalizado {formatterCOP.format(item.saldoLegalizado)}
                              </p>
                            </>
                          )}
                        </div>
                        <div className="min-w-0">
                          {item.facturas.length ? (
                            <div className="space-y-1">
                              {item.facturas.map((invoice) => (
                                <a
                                  key={invoice.facturaId}
                                  href={`/billing/invoices/${invoice.facturaId}`}
                                  onClick={(event) => event.stopPropagation()}
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
                            </div>
                          ) : (
                            <p className="flex items-center gap-2 text-xs text-slate-500">
                              <FileText className="h-3.5 w-3.5" />
                              Sin facturas cruzadas
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4">
                    {bag.bolsaId ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="h-9 gap-2 rounded-lg border-emerald-200 bg-white text-emerald-800 hover:bg-emerald-50"
                        onClick={(event) => onOpenBag(bag, event.currentTarget)}
                      >
                        Ver los {bag.count} anticipos
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    ) : (
                      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        <p>
                          Esta bolsa aún no tiene un identificador sincronizado. Espera la
                          reconciliación antes de abrir el detalle completo.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </details>
            );
          })}
        </div>
      )}
    </section>
  );
}
