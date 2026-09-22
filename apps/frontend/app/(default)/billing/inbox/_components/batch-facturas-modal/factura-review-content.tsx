import type { ReactNode, RefObject } from "react";
import {
  ArrowRight,
  Coins,
  ExternalLink,
  FilePlus2,
  FileText,
  Loader2,
  RotateCcw,
  Trash2,
  WalletCards,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Doc } from "@/convex/_generated/dataModel";
import { BuzonAdjuntosPanel } from "../../../components/buzon-adjuntos-dialog";
import type { BuzonTarea } from "../../../components/buzon-row";
import { FacturacionStatusBadge } from "../../../components/status-badge";
import {
  EmpresaIconTile,
  FacturaEmpresaBadge,
  resolveFacturacionEmpresaId,
} from "../../../lib/empresa-ui";
import { FacturaAmountsHeader } from "../../../components/valor-contable-ui";
import { formatCurrency, formatDate } from "../../../lib/utils";
import { getActiveStage, getReturnMetadata } from "../../../lib/workflow-config";
import { FacturaPdfPreviewCard } from "../factura-pdf-preview-card";
import {
  BulkMetaGrid,
  FacturaObservationCard,
  HistoryTimeline,
  LastPhaseObservation,
  StageProgress,
} from "../shared";
import { PagosParcialesSummaryCard } from "./pagos-parciales-summary";
import { FacturaCausacionPanel } from "@/components/facturacion/factura-causacion-panel";
import type { BatchMode, CausacionActionDraft } from "./types";

type SpecialFlagKind = "anticipo" | "caja_menor";

type FacturaData = {
  aprobaciones?: Doc<"facturacionAprobaciones">[];
} | null | undefined;

type NotaCreditoRelacionItem = {
  facturaId: string;
  numeroFactura: string;
  total: number;
  moneda: string;
};

export function FacturaReviewContent({
  activeTarea,
  data,
  isSingle,
  tareas,
  detachTarea,
  valorContableEditMode,
  activeValorContableDisplay,
  activeValorAPagarEstimado,
  isSavedValorContableDraft,
  valorContableEditorRef,
  adjuntosActor,
  onRequestUnmark,
  unmarkingSpecialFlag,
  canDeleteFactura = false,
  onRequestDelete,
  deletingFactura = false,
  onCausacionDirtyChange,
  onCausacionDraftChange,
  causacionDraft,
}: {
  activeTarea: BuzonTarea | null;
  data: FacturaData;
  isSingle: boolean;
  tareas: BuzonTarea[];
  detachTarea: (tarea: BuzonTarea) => void;
  valorContableEditMode: BatchMode;
  activeValorContableDisplay?: number;
  activeValorAPagarEstimado?: number;
  isSavedValorContableDraft: boolean;
  valorContableEditorRef: RefObject<HTMLDivElement | null>;
  adjuntosActor: {
    userId?: string;
    nombre: string;
    email: string;
  };
  onRequestUnmark: (tarea: BuzonTarea, kind: SpecialFlagKind) => void;
  unmarkingSpecialFlag: boolean;
  canDeleteFactura?: boolean;
  onRequestDelete?: () => void;
  deletingFactura?: boolean;
  onCausacionDirtyChange?: (dirty: boolean) => void;
  onCausacionDraftChange?: (draft: CausacionActionDraft) => void;
  causacionDraft?: CausacionActionDraft;
}) {
  const activeEmpresaId = activeTarea
    ? resolveFacturacionEmpresaId(activeTarea)
    : null;

  return (
            <main className="min-h-0 overflow-y-auto overscroll-contain p-4">
              {activeTarea ? (
                <div className="mx-auto flex max-w-5xl flex-col gap-4">
                  <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
                      <div className="min-w-0 lg:col-start-1 lg:row-start-1">
                        <div className="flex items-center gap-3">
                          <EmpresaIconTile
                            empresaId={activeEmpresaId ?? 1}
                            className="h-10 w-10"
                            iconClassName="h-5 w-5"
                          />
                          <div className="min-w-0">
                            <h3 className="truncate text-lg font-semibold text-slate-950">
                              {activeTarea.factura?.proveedorNombre ?? "Factura"}
                            </h3>
                            <p className="truncate text-xs text-slate-500">
                              #{activeTarea.factura?.numeroFactura ?? "-"} · NIT{" "}
                              {activeTarea.factura?.proveedorNit ?? "-"}
                            </p>
                          </div>
                        </div>
                        <FacturaAmountsHeader
                          factura={activeTarea.factura}
                          fase={String(getActiveStage(activeTarea))}
                          mode={valorContableEditMode}
                          draftValue={activeValorContableDisplay}
                          valorAPagarEstimado={activeValorAPagarEstimado}
                          savedDraft={isSavedValorContableDraft}
                          onFocusEditor={() => {
                            valorContableEditorRef.current?.scrollIntoView({
                              behavior: "smooth",
                              block: "nearest",
                            });
                          }}
                        />
                        <p className="mt-3 text-xs text-slate-500">
                          Emitida{" "}
                          {activeTarea.factura
                            ? formatDate(activeTarea.factura.fechaEmision)
                            : "-"}{" "}
                          · Vence{" "}
                          {activeTarea.factura?.fechaVencimiento
                            ? formatDate(activeTarea.factura.fechaVencimiento)
                            : "-"}
                        </p>
                      </div>
                      <div className="flex flex-wrap content-start justify-start gap-2 lg:col-start-1 lg:row-start-2 lg:justify-start">
                        {activeEmpresaId !== null ? (
                          <FacturaEmpresaBadge tarea={activeTarea} />
                        ) : null}
                        <FacturacionStatusBadge estado={activeTarea.estado} />
                        {activeTarea.factura?.esLegalizacionAnticipo ? (
                          <div className="flex items-center gap-1">
                            <Badge variant="outline" className="border-orange-200 bg-orange-50 text-orange-700">
                              <Coins className="mr-1 h-3 w-3" />
                              Anticipo
                            </Badge>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 rounded-lg border-orange-200 bg-white px-2 text-xs font-semibold text-orange-700 hover:bg-orange-50"
                              disabled={unmarkingSpecialFlag}
                              onClick={() => onRequestUnmark(activeTarea, "anticipo")}
                            >
                              <X className="mr-1 h-3.5 w-3.5" />
                              Desmarcar
                            </Button>
                          </div>
                        ) : null}
                        {activeTarea.factura?.esLegalizacionCajaMenor ? (
                          <div className="flex items-center gap-1">
                            <Badge variant="outline" className="border-teal-200 bg-teal-50 text-teal-700">
                              <WalletCards className="mr-1 h-3 w-3" />
                              Caja Menor
                            </Badge>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 rounded-lg border-teal-200 bg-white px-2 text-xs font-semibold text-teal-700 hover:bg-teal-50"
                              disabled={unmarkingSpecialFlag}
                              onClick={() => onRequestUnmark(activeTarea, "caja_menor")}
                            >
                              <X className="mr-1 h-3.5 w-3.5" />
                              Desmarcar
                            </Button>
                          </div>
                        ) : null}
                        {activeTarea.factura?.isFisico ? (
                          <Badge variant="outline" className="border-violet-200 bg-violet-50 text-violet-700">
                            <FilePlus2 className="mr-1 h-3 w-3" />
                            Documento físico
                          </Badge>
                        ) : null}
                        {activeTarea.notaCreditoRelacion ? (
                          <Badge
                            variant="outline"
                            className="border-cyan-200 bg-cyan-50 text-cyan-700"
                          >
                            <FileText className="mr-1 h-3 w-3" />
                            {activeTarea.notaCreditoRelacion.tipo === "factura"
                              ? `NC ${activeTarea.notaCreditoRelacion.cantidadNotasCredito} · ${formatCurrency(
                                  activeTarea.notaCreditoRelacion
                                    .valorNotasCredito,
                                  activeTarea.notaCreditoRelacion.notasCredito[0]
                                    ?.moneda ??
                                    activeTarea.factura?.moneda ??
                                    "COP",
                                )}`
                              : activeTarea.notaCreditoRelacion.facturaOrigen
                                ? `Cruce NC · #${activeTarea.notaCreditoRelacion.facturaOrigen.numeroFactura}`
                                : "Cruce NC"}
                          </Badge>
                        ) : null}
                        {getReturnMetadata(activeTarea.asignacion) ? (
                          <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                            <RotateCcw className="mr-1 h-3 w-3" />
                            Devuelta
                          </Badge>
                        ) : null}
                        {!isSingle ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 rounded-lg text-slate-500"
                            disabled={tareas.length <= 1}
                            onClick={() => detachTarea(activeTarea)}
                          >
                            <X className="mr-1 h-4 w-4" />
                            Quitar
                          </Button>
                        ) : null}
                        {canDeleteFactura && onRequestDelete ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 rounded-lg border-rose-200 bg-white px-2 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                            disabled={deletingFactura}
                            onClick={onRequestDelete}
                          >
                            {deletingFactura ? (
                              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="mr-1 h-3.5 w-3.5" />
                            )}
                            {isSingle ? "Eliminar factura" : "Eliminar factura activa"}
                          </Button>
                        ) : null}
                      </div>
                      {activeTarea.facturaId ? (
                        <FacturaCausacionPanel
                          key={activeTarea.facturaId}
                          facturaId={activeTarea.facturaId}
                          numeroFactura={activeTarea.factura?.numeroFactura}
                          contexto={{ tipo: "flujo_factura" }}
                          compact
                          draft={causacionDraft}
                          onDraftChange={onCausacionDraftChange}
                          onDirtyChange={onCausacionDirtyChange}
                          className="lg:col-start-2 lg:row-start-1 lg:row-span-2"
                        />
                      ) : null}
                    </div>

                    <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4">
                      <StageProgress
                        stage={String(getActiveStage(activeTarea))}
                        aprobaciones={
                          (data?.aprobaciones ?? []) as Doc<"facturacionAprobaciones">[]
                        }
                      />
                    </div>
                  </section>

                  <NotaCreditoRelacionPanel tarea={activeTarea} />

                  <FacturaPdfPreviewCard
                    tarea={activeTarea}
                    heightClassName="h-[520px]"
                  />

                  <div className="space-y-4">
                    <PagosParcialesSummaryCard
                      factura={activeTarea.factura}
                      aprobaciones={
                        (data?.aprobaciones ?? []) as Doc<"facturacionAprobaciones">[]
                      }
                    />
                    <BulkMetaGrid tarea={activeTarea} />
                    <div className="grid gap-4 md:grid-cols-2">
                      <FacturaObservationCard tarea={activeTarea} />
                      <LastPhaseObservation
                        aprobaciones={
                          (data?.aprobaciones ?? []) as Doc<"facturacionAprobaciones">[]
                        }
                      />
                    </div>
                    <BuzonAdjuntosPanel
                      facturaId={activeTarea.facturaId}
                      asignacionId={activeTarea.asignacionId}
                      facturaPdfUrl={activeTarea.pdfUrl}
                      facturaPdfStorageId={activeTarea.factura?.pdfStorageId}
                      numeroFactura={activeTarea.factura?.numeroFactura}
                      actor={adjuntosActor}
                      compact
                      maxItems={4}
                    />
                    <section className="rounded-xl border border-slate-200 bg-white p-5">
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">Historial</p>
                          <p className="mt-1 text-xs text-slate-500">
                            Trazabilidad completa de la factura.
                          </p>
                        </div>
                        <Badge variant="outline" className="bg-white tabular-nums">
                          {data?.aprobaciones?.length ?? 0}
                        </Badge>
                      </div>
                      <HistoryTimeline
                        aprobaciones={
                          (data?.aprobaciones ?? []) as Doc<"facturacionAprobaciones">[]
                        }
                      />
                    </section>
                  </div>
                </div>
              ) : (
                <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white text-sm text-slate-500">
                  Selecciona una factura para revisar.
                </div>
              )}
            </main>
  );
}

function NotaCreditoRelacionPanel({ tarea }: { tarea: BuzonTarea }) {
  const relacion = tarea.notaCreditoRelacion;
  if (!relacion) return null;

  const factura = tarea.factura;
  const moneda =
    relacion.notasCredito[0]?.moneda ??
    relacion.facturaOrigen?.moneda ??
    factura?.moneda ??
    "COP";
  const valorNotas = Math.abs(relacion.valorNotasCredito);

  if (relacion.tipo === "factura") {
    const facturaTotal = factura?.total ?? relacion.facturaOrigen?.total ?? null;
    const saldoEstimado =
      typeof facturaTotal === "number" ? Math.max(facturaTotal - valorNotas, 0) : null;
    const notasVisibles = relacion.notasCredito.slice(0, 3);
    const notasOcultas = Math.max(0, relacion.notasCredito.length - notasVisibles.length);

    return (
      <section className="overflow-hidden rounded-2xl border border-cyan-300 bg-white shadow-xs">
        <NotaCreditoRelacionHeader
          title={`Factura #${factura?.numeroFactura ?? "-"} con NC relacionada`}
          subtitle={`${relacion.cantidadNotasCredito} ${pluralizeNotaCredito(
            relacion.cantidadNotasCredito,
          )} por ${formatCurrency(valorNotas, moneda)}`}
        />
        <div className="space-y-3 p-4">
          <div className="grid gap-3 md:grid-cols-3">
            <NotaCreditoMetric
              label="Total factura"
              value={
                typeof facturaTotal === "number"
                  ? formatCurrency(facturaTotal, moneda)
                  : "-"
              }
            />
            <NotaCreditoMetric
              label="Valor NC"
              value={formatCurrency(valorNotas, moneda)}
              highlight
            />
            <NotaCreditoMetric
              label="Saldo estimado"
              value={
                saldoEstimado !== null
                  ? formatCurrency(saldoEstimado, moneda)
                  : "-"
              }
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {notasVisibles.map((nota: NotaCreditoRelacionItem) => (
              <DetalleDocumentoLink
                key={String(nota.facturaId)}
                facturaId={nota.facturaId}
                className="inline-flex max-w-full items-center gap-2 rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs font-semibold text-cyan-900 transition hover:border-cyan-300 hover:bg-cyan-100"
              >
                <FileText className="h-3.5 w-3.5 shrink-0 text-cyan-700" />
                <span className="truncate">NC #{nota.numeroFactura}</span>
                <span className="shrink-0 text-cyan-700">
                  {formatCurrency(Math.abs(nota.total), nota.moneda)}
                </span>
              </DetalleDocumentoLink>
            ))}
            {notasOcultas > 0 ? (
              <span className="inline-flex items-center rounded-xl border border-cyan-200 bg-white px-3 py-2 text-xs font-semibold text-cyan-700">
                +{notasOcultas} más
              </span>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            <DetalleDocumentoLink
              facturaId={tarea.facturaId}
              label="Ver factura"
            />
          </div>
        </div>
      </section>
    );
  }

  const facturaOrigen = relacion.facturaOrigen;
  const facturaOrigenTotal = facturaOrigen?.total ?? null;
  const saldoEstimado =
    typeof facturaOrigenTotal === "number"
      ? Math.max(facturaOrigenTotal - valorNotas, 0)
      : null;

  return (
    <section className="overflow-hidden rounded-2xl border border-cyan-300 bg-white shadow-xs">
      <NotaCreditoRelacionHeader
        title={
          facturaOrigen
            ? `NC #${factura?.numeroFactura ?? "-"} ligada a factura #${facturaOrigen.numeroFactura}`
            : `NC #${factura?.numeroFactura ?? "-"} con referencia pendiente`
        }
        subtitle={
          facturaOrigen
            ? `${facturaOrigen.numeroFactura} · ${formatCurrency(
                facturaOrigen.total,
                facturaOrigen.moneda,
              )}`
            : `Referencia ${factura?.referenciaDocumento ?? "-"}`
        }
      />
      <div className="space-y-3 p-4">
        <div className="grid gap-3 md:grid-cols-3">
          <NotaCreditoMetric
            label="Valor NC"
            value={formatCurrency(valorNotas, moneda)}
            highlight
          />
          <NotaCreditoMetric
            label="Total factura origen"
            value={
              typeof facturaOrigenTotal === "number"
                ? formatCurrency(facturaOrigenTotal, facturaOrigen?.moneda ?? moneda)
                : "-"
            }
          />
          <NotaCreditoMetric
            label="Saldo estimado"
            value={
              saldoEstimado !== null
                ? formatCurrency(saldoEstimado, facturaOrigen?.moneda ?? moneda)
                : "-"
            }
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-cyan-100 bg-cyan-50/70 px-3 py-3 text-sm">
          <DocumentNode
            label="Nota crédito"
            number={factura?.numeroFactura ?? "-"}
            amount={formatCurrency(valorNotas, moneda)}
          />
          <ArrowRight className="h-4 w-4 shrink-0 text-cyan-600" />
          <DocumentNode
            label="Factura origen"
            number={facturaOrigen?.numeroFactura ?? factura?.referenciaDocumento ?? "-"}
            amount={
              typeof facturaOrigenTotal === "number"
                ? formatCurrency(facturaOrigenTotal, facturaOrigen?.moneda ?? moneda)
                : "Sin enlace único"
            }
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <DetalleDocumentoLink
            facturaId={tarea.facturaId}
            label="Ver nota crédito"
          />
          {facturaOrigen ? (
            <DetalleDocumentoLink
              facturaId={facturaOrigen.facturaId}
              label="Ver factura origen"
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}

function NotaCreditoRelacionHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="border-b border-cyan-100 bg-cyan-50/80 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-600 text-white">
            <FileText className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wide text-cyan-700">
              Cruce nota crédito
            </p>
            <h3 className="truncate text-base font-semibold text-slate-950">
              {title}
            </h3>
            <p className="mt-0.5 truncate text-xs font-medium text-cyan-800">
              {subtitle}
            </p>
          </div>
        </div>
        <Badge
          variant="outline"
          className="border-cyan-300 bg-white text-cyan-800"
        >
          Relación activa
        </Badge>
      </div>
    </div>
  );
}

function NotaCreditoMetric({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border px-4 py-3 ${
        highlight
          ? "border-cyan-300 bg-cyan-50 text-cyan-950"
          : "border-slate-200 bg-slate-50/70 text-slate-950"
      }`}
    >
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-lg font-black tabular-nums">{value}</p>
    </div>
  );
}

function DocumentNode({
  label,
  number,
  amount,
}: {
  label: string;
  number: string;
  amount: string;
}) {
  return (
    <div className="min-w-[180px] flex-1">
      <p className="text-[10px] font-bold uppercase tracking-wide text-cyan-700">
        {label}
      </p>
      <p className="mt-0.5 truncate font-semibold text-slate-950">#{number}</p>
      <p className="mt-0.5 text-xs font-medium text-slate-600">{amount}</p>
    </div>
  );
}

function DetalleDocumentoLink({
  facturaId,
  label,
  className,
  children,
}: {
  facturaId: string;
  label?: string;
  className?: string;
  children?: ReactNode;
}) {
  const href = `/billing/invoices/${facturaId}`;

  if (children) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
        title="Abrir detalle en nueva pestaña"
      >
        {children}
        <ExternalLink className="h-3 w-3 shrink-0 text-cyan-600" />
      </a>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={
        className ??
        "inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-200 bg-white px-3 py-2 text-xs font-bold text-cyan-800 transition hover:bg-cyan-50"
      }
      title="Abrir detalle en nueva pestaña"
    >
      <ExternalLink className="h-3.5 w-3.5" />
      {label}
    </a>
  );
}

function pluralizeNotaCredito(count: number) {
  return count === 1 ? "nota crédito" : "notas crédito";
}
