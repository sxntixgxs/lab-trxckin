import type { Dispatch, SetStateAction } from "react";
import { FileText, MoreHorizontal, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { BuzonTarea } from "../../../components/buzon-row";
import { FacturaPagoAmount } from "../../../components/valor-contable-ui";
import {
  FacturaEmpresaBadge,
  getEmpresaAccentStyle,
  resolveFacturacionEmpresaId,
} from "../../../lib/empresa-ui";
import { formatCurrency } from "../../../lib/utils";
import { getActiveStage } from "../../../lib/workflow-config";
import { getTaskKey } from "../helpers";
import { ActionChip } from "./action-ui";
import type { BatchActionDraft } from "./types";

type NotaCreditoRelacionItem = {
  numeroFactura: string;
};

export function BatchSelectionSidebar({
  tareas,
  activeTarea,
  pendingByKey,
  pendingCount,
  selectTarea,
  detachTarea,
  setPendingByKey,
}: {
  tareas: BuzonTarea[];
  activeTarea: BuzonTarea | null;
  pendingByKey: Record<string, BatchActionDraft>;
  pendingCount: number;
  selectTarea: (tarea: BuzonTarea) => void;
  detachTarea: (tarea: BuzonTarea) => void;
  setPendingByKey: Dispatch<SetStateAction<Record<string, BatchActionDraft>>>;
}) {
  return (
            <aside className="flex h-full min-h-0 flex-col overflow-hidden border-b border-slate-200 bg-white lg:border-b-0 lg:border-r">
              <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Selección</p>
                  <p className="text-xs text-slate-500">
                    {pendingCount > 0
                      ? `${pendingCount} con acción definida`
                      : "Click para revisar una factura"}
                  </p>
                </div>
                <Badge variant="outline" className="tabular-nums">
                  {tareas.length}
                </Badge>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
                <div className="flex flex-col gap-2">
                {tareas.map((tarea) => {
                  const factura = tarea.factura;
                  const active = activeTarea && getTaskKey(activeTarea) === getTaskKey(tarea);
                  const draft = pendingByKey[getTaskKey(tarea)];
                  const notaCreditoSummary = getNotaCreditoSidebarSummary(tarea);
                  const empresaAccent = getEmpresaAccentStyle(
                    resolveFacturacionEmpresaId(tarea),
                  );
                  return (
                    <div
                      key={getTaskKey(tarea)}
                      role="button"
                      tabIndex={0}
                      onClick={() => selectTarea(tarea)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          selectTarea(tarea);
                        }
                      }}
                      className={`group relative shrink-0 overflow-hidden rounded-xl border border-l-[3px] p-3 text-left transition ${
                        active
                          ? notaCreditoSummary
                            ? "border-cyan-500 bg-cyan-50/70 shadow-xs ring-2 ring-slate-900/10"
                            : "border-slate-900 bg-slate-50 shadow-xs ring-2 ring-slate-900/10"
                          : notaCreditoSummary
                            ? "border-cyan-200 bg-cyan-50/30 hover:border-cyan-300 hover:bg-cyan-50/50"
                            : "border-slate-200 bg-white hover:border-slate-300"
                      }`}
                      style={{ borderLeftColor: empresaAccent.color }}
                    >
                      {notaCreditoSummary ? (
                        <span className="absolute inset-y-3 left-0 w-1 rounded-r-full bg-cyan-500" />
                      ) : null}
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-semibold text-slate-950">
                              {factura?.proveedorNombre ?? "Sin proveedor"}
                            </p>
                            <FacturaEmpresaBadge tarea={tarea} compact />
                          </div>
                          <p className="mt-1 truncate text-xs text-slate-500">
                            #{factura?.numeroFactura ?? "-"} · NIT {factura?.proveedorNit ?? "-"}
                          </p>
                          {notaCreditoSummary ? (
                            <div className="mt-2 rounded-lg border border-cyan-200 bg-white/85 px-2.5 py-2 text-cyan-950 shadow-xs">
                              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-cyan-700">
                                <FileText className="h-3 w-3 shrink-0" />
                                Cruce nota crédito
                              </div>
                              <p className="mt-1 truncate text-xs font-semibold">
                                {notaCreditoSummary.primary}
                              </p>
                              <p className="mt-0.5 truncate text-[11px] font-medium text-cyan-700">
                                {notaCreditoSummary.secondary}
                              </p>
                            </div>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          className="rounded-lg p-1 text-slate-300 opacity-0 transition hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100"
                          onClick={(event) => {
                            event.stopPropagation();
                            detachTarea(tarea);
                          }}
                          disabled={tareas.length <= 1}
                          aria-label="Quitar factura de la selección"
                        >
                          <XCircle className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="mt-3 flex items-center gap-2">
                        <ActionChip action={draft?.action ?? null} />
                        <span className="ml-auto shrink-0 text-sm font-semibold tabular-nums text-slate-950">
                          {factura ? (
                            <FacturaPagoAmount
                              factura={factura}
                              fase={String(getActiveStage(tarea))}
                              valorContableDraft={draft?.valorContable}
                            />
                          ) : (
                            "-"
                          )}
                        </span>
                      </div>
                      <div
                        className="mt-2 flex justify-end opacity-0 transition group-hover:opacity-100"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 rounded-lg px-2 text-slate-500"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                              <span className="sr-only">Más acciones</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem
                              disabled={!draft}
                              onSelect={() => {
                                setPendingByKey((current) => {
                                  const nextDrafts = { ...current };
                                  delete nextDrafts[getTaskKey(tarea)];
                                  return nextDrafts;
                                });
                              }}
                            >
                              Limpiar acción
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              disabled={tareas.length <= 1}
                              className="text-rose-600 focus:text-rose-700"
                              onSelect={() => detachTarea(tarea)}
                            >
                              <XCircle className="h-4 w-4" />
                              Quitar del lote
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  );
                })}
                </div>
              </div>
            </aside>
  );
}

function getNotaCreditoSidebarSummary(tarea: BuzonTarea) {
  const relacion = tarea.notaCreditoRelacion;
  if (!relacion) return null;

  const factura = tarea.factura;
  const moneda =
    relacion.notasCredito[0]?.moneda ??
    relacion.facturaOrigen?.moneda ??
    factura?.moneda ??
    "COP";
  const valorNotas = formatCurrency(Math.abs(relacion.valorNotasCredito), moneda);

  if (relacion.tipo === "factura") {
    const numeros = relacion.notasCredito
      .slice(0, 2)
      .map((nota: NotaCreditoRelacionItem) => `#${nota.numeroFactura}`)
      .join(", ");
    const restante = relacion.notasCredito.length > 2
      ? ` +${relacion.notasCredito.length - 2}`
      : "";

    return {
      primary: `${relacion.cantidadNotasCredito} ${pluralizeNotaCredito(
        relacion.cantidadNotasCredito,
      )} · ${valorNotas}`,
      secondary: numeros ? `${numeros}${restante}` : "Notas crédito relacionadas",
    };
  }

  return {
    primary: relacion.facturaOrigen
      ? `Ligada a factura #${relacion.facturaOrigen.numeroFactura}`
      : "Factura origen sin enlace único",
    secondary: `Valor NC ${valorNotas}`,
  };
}

function pluralizeNotaCredito(count: number) {
  return count === 1 ? "nota crédito" : "notas crédito";
}
