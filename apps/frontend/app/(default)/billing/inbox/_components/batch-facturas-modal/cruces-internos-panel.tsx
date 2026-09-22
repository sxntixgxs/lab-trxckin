"use client";

import { ChevronDown, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import type { BuzonTarea } from "../../../components/buzon-row";
import type {
  CruceDocumentoInternoItem,
  CruceDocumentoInternoResumen,
} from "../../../lib/cruces-documentos-internos";
import {
  formatMoneyInputPlain,
  normalizeMoneyInput,
  parsePositiveMoneyInput,
} from "../../../lib/money";
import { getFacturacionErrorMessage } from "../../../lib/user-facing-error";
import { formatCurrency } from "../../../lib/utils";
import { computeResumenContableEstimado } from "../../../lib/valor-a-pagar";

const FASES_CRUCES_INTERNOS = new Set([
  "recepcion",
  "revision_lider",
  "causacion",
  "revision_impuestos",
  "eventos_dian",
  "gerencia",
  "revision_tesoreria",
]);

function isFacturaElegibleCruceInterno(tarea: BuzonTarea) {
  const factura = tarea.factura;
  if (!factura) return false;
  if (factura.esPeaje || factura.rolOperacion === "PEAJES") return false;
  if (factura.esLegalizacionCajaMenor) return false;
  if (
    factura.documentoClase === "nota_credito" ||
    factura.documentoClase === "nota_debito" ||
    factura.tipoDocumentoNormalizado === "91" ||
    factura.tipoDocumentoNormalizado === "92" ||
    factura.tipoDocumento === "91" ||
    factura.tipoDocumento === "92"
  ) {
    return false;
  }
  const fase = String(tarea.faseAsignacion ?? tarea.estado);
  return FASES_CRUCES_INTERNOS.has(fase);
}

function ResumenContableCompacto({
  resumen,
  moneda,
}: {
  resumen: CruceDocumentoInternoResumen["resumen"];
  moneda: string;
}) {
  return (
    <dl className="grid grid-cols-2 divide-x divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white">
      <ResumenItem
        label="Base para anticipos"
        value={formatCurrency(resumen.baseCruceAnticipos, moneda)}
      />
      <ResumenItem
        label="Valor a pagar"
        value={formatCurrency(resumen.valorAPagar, moneda)}
        highlight
      />
    </dl>
  );
}

function ResumenItem({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="min-w-0 px-3 py-2.5">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd
        className={cn(
          "mt-0.5 truncate text-sm font-semibold tabular-nums",
          highlight ? "text-emerald-700" : "text-slate-900"
        )}
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}

export function CrucesDocumentosInternosPanel({
  tarea,
  enabled,
  valorContableDraft,
}: {
  tarea: BuzonTarea;
  enabled: boolean;
  valorContableDraft?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [data, setData] = useState<CruceDocumentoInternoResumen | null>(null);
  const [numeroDocumento, setNumeroDocumento] = useState("");
  const [valorAplicado, setValorAplicado] = useState("");
  const [comentario, setComentario] = useState("");
  const [editingId, setEditingId] = useState<Id<"facturacionCrucesDocumentosInternos"> | null>(
    null
  );

  const moneda = tarea.factura?.moneda ?? "COP";
  const elegible = isFacturaElegibleCruceInterno(tarea);

  const loadData = useCallback(
    async (cursor?: string) => {
      if (!tarea.facturaId || !tarea.asignacionId) return;
      const append = Boolean(cursor);
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      setLoadError(null);
      try {
        const params = new URLSearchParams({
          asignacionId: String(tarea.asignacionId),
          limit: "50",
        });
        if (cursor) params.set("cursor", cursor);
        const response = await fetch(
          `/api/billing/facturas/${tarea.facturaId}/cruces-internos?${params}`,
          { cache: "no-store" }
        );
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error ?? "No se pudieron cargar los cruces internos.");
        }
        const next = payload as CruceDocumentoInternoResumen;
        setData((previous) =>
          append && previous
            ? {
                ...next,
                documentos: {
                  ...next.documentos,
                  page: [...previous.documentos.page, ...next.documentos.page],
                },
              }
            : next
        );
      } catch (error) {
        setLoadError(
          getFacturacionErrorMessage(error, "No pudimos cargar los cruces. Intenta nuevamente.")
        );
        if (!append) setData(null);
      } finally {
        if (append) {
          setLoadingMore(false);
        } else {
          setLoading(false);
        }
      }
    },
    [tarea.asignacionId, tarea.facturaId]
  );

  useEffect(() => {
    if (!enabled || !elegible || !expanded) return;
    void loadData();
  }, [enabled, elegible, expanded, loadData]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: estos ids reinician el borrador al cambiar de asignación activa.
  useEffect(() => {
    setData(null);
    setLoadError(null);
    setEditingId(null);
    setNumeroDocumento("");
    setValorAplicado("");
    setComentario("");
  }, [tarea.facturaId, tarea.asignacionId]);

  if (!enabled || !elegible || !tarea.facturaId || !tarea.asignacionId) {
    return null;
  }

  async function persistDocumento(
    mode: "add" | "edit" | "remove",
    row?: CruceDocumentoInternoItem
  ) {
    if (!tarea.facturaId || !tarea.asignacionId) return;
    const rowKey = row?._id ?? "new";
    setSavingId(String(rowKey));
    try {
      if (mode === "remove" && row) {
        const confirmed = window.confirm(
          `¿Retirar el documento ${row.numeroDocumento} por ${formatCurrency(row.valorAplicado, moneda)}?`
        );
        if (!confirmed) return;
        const response = await fetch(
          `/api/billing/facturas/${tarea.facturaId}/cruces-internos`,
          {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              asignacionId: tarea.asignacionId,
              cruceId: row._id,
              expectedActualizadoEn: row.actualizadoEn,
              comentario: comentario.trim() || undefined,
            }),
          }
        );
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "No se pudo retirar el documento.");
        toast.success("Documento interno retirado.");
        setComentario("");
        setEditingId(null);
        setData((prev) =>
          prev
            ? {
                ...prev,
                resumen: payload.resumen,
                totales: {
                  cantidad: Math.max(0, prev.totales.cantidad - 1),
                  valorAplicado: payload.resumen.valorDocumentosInternos,
                },
                documentos: {
                  ...prev.documentos,
                  page: prev.documentos.page.filter((item) => item._id !== row._id),
                },
              }
            : prev
        );
        await loadData();
        return;
      }

      if (!numeroDocumento.trim()) {
        throw new Error("Indica el número de la factura o cuenta de cobro.");
      }
      const valor = parsePositiveMoneyInput(valorAplicado);
      if (valor === null) throw new Error("Indica un valor aplicado mayor que cero.");

      const body =
        mode === "edit" && row
          ? {
              asignacionId: tarea.asignacionId,
              cruceId: row._id,
              expectedActualizadoEn: row.actualizadoEn,
              numeroDocumento,
              valorAplicado: valor,
              comentario: comentario.trim() || undefined,
            }
          : {
              asignacionId: tarea.asignacionId,
              numeroDocumento,
              valorAplicado: valor,
              comentario: comentario.trim() || undefined,
            };

      const response = await fetch(`/api/billing/facturas/${tarea.facturaId}/cruces-internos`, {
        method: mode === "edit" ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "No se pudo guardar el documento.");
      toast.success(mode === "edit" ? "Documento actualizado." : "Documento agregado.");
      setNumeroDocumento("");
      setValorAplicado("");
      setComentario("");
      setEditingId(null);
      await loadData();
    } catch (error) {
      toast.error(
        getFacturacionErrorMessage(
          error,
          "No se pudo guardar el documento. Revisa los datos e intenta nuevamente."
        )
      );
    } finally {
      setSavingId(null);
    }
  }

  const resumenCerrado =
    data?.totales ??
    ({
      cantidad: tarea.factura?.cantidadCrucesDocumentosInternos ?? 0,
      valorAplicado: tarea.factura?.valorCrucesDocumentosInternos ?? 0,
    } as const);
  const resumenVisible = data?.resumen
    ? (() => {
        const valorContable =
          valorContableDraft !== undefined && Number.isFinite(valorContableDraft)
            ? valorContableDraft
            : data.resumen.valorContable;
        const estimado = computeResumenContableEstimado({
          valorContable,
          valorDocumentosInternos: data.resumen.valorDocumentosInternos,
          valorAnticiposAplicados: data.resumen.valorAnticiposAplicados,
          pagosAplicados: data.resumen.pagosAplicados,
        });

        return {
          ...data.resumen,
          valorContable,
          ...estimado,
        };
      })()
    : null;

  return (
    <section className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
      <button
        type="button"
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-slate-50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-400"
        onClick={() => setExpanded((prev) => !prev)}
      >
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-5 text-slate-900">
            Cruzar con factura o cuenta de cobro
          </p>
          <p className="mt-0.5 text-xs leading-4 text-slate-500">
            {resumenCerrado.cantidad > 0
              ? `${resumenCerrado.cantidad} ${resumenCerrado.cantidad === 1 ? "documento" : "documentos"} · ${formatCurrency(resumenCerrado.valorAplicado, moneda)}`
              : "Resta documentos emitidos por la empresa del saldo por pagar."}
          </p>
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200",
            expanded && "rotate-180"
          )}
        />
      </button>

      {expanded ? (
        <div className="border-t border-slate-200 bg-slate-50/60 p-3">
          {loading && !data ? (
            <div className="space-y-2" aria-label="Cargando cruces internos">
              <div className="h-14 animate-pulse rounded-lg bg-slate-200/80" />
              <div className="h-9 animate-pulse rounded-md bg-slate-200/70" />
            </div>
          ) : loadError && !data ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3" role="alert">
              <p className="text-sm font-medium text-rose-900">
                No se pudo cargar esta información
              </p>
              <p className="mt-1 text-xs leading-4 text-rose-700">{loadError}</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-3 border-rose-200 bg-white text-rose-800 hover:bg-rose-100"
                onClick={() => void loadData()}
              >
                Reintentar
              </Button>
            </div>
          ) : (
            <>
              {resumenVisible ? (
                <ResumenContableCompacto resumen={resumenVisible} moneda={moneda} />
              ) : null}

              {loadError ? (
                <p className="mt-3 text-xs text-rose-700" role="alert">
                  {loadError}
                </p>
              ) : null}

              {(data?.documentos.page.length ?? 0) > 0 ? (
                <div className="mt-3 divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white">
                  {data?.documentos.page.map((row) => (
                    <div
                      key={row._id}
                      className={cn("p-3", savingId === String(row._id) && "opacity-60")}
                    >
                      {editingId === row._id ? (
                        <DocumentoForm
                          idPrefix={`editar-${row._id}`}
                          moneda={moneda}
                          numeroDocumento={numeroDocumento}
                          valorAplicado={valorAplicado}
                          comentario={comentario}
                          onNumeroChange={setNumeroDocumento}
                          onValorChange={setValorAplicado}
                          onComentarioChange={setComentario}
                        />
                      ) : (
                        <div className="flex items-center gap-2">
                          <div className="min-w-0 flex-1">
                            <p
                              className="truncate text-sm font-semibold text-slate-900"
                              title={row.numeroDocumento}
                            >
                              {row.numeroDocumento}
                            </p>
                            <p className="truncate text-xs tabular-nums text-slate-500">
                              {formatCurrency(row.valorAplicado, row.moneda)}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="text-slate-600 hover:text-slate-900"
                              aria-label={`Editar ${row.numeroDocumento}`}
                              title="Editar documento"
                              disabled={Boolean(savingId)}
                              onClick={() => {
                                setEditingId(row._id);
                                setNumeroDocumento(row.numeroDocumento);
                                setValorAplicado(String(row.valorAplicado));
                                setComentario("");
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                              aria-label={`Retirar ${row.numeroDocumento}`}
                              title="Retirar documento"
                              disabled={Boolean(savingId)}
                              onClick={() => void persistDocumento("remove", row)}
                            >
                              {savingId === String(row._id) ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </div>
                      )}
                      {editingId === row._id ? (
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <Button
                            type="button"
                            size="sm"
                            className="bg-slate-900 hover:bg-slate-800"
                            disabled={savingId === String(row._id)}
                            onClick={() => void persistDocumento("edit", row)}
                          >
                            {savingId === String(row._id) ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : null}
                            Guardar
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="bg-white"
                            disabled={savingId === String(row._id)}
                            onClick={() => {
                              setEditingId(null);
                              setNumeroDocumento("");
                              setValorAplicado("");
                              setComentario("");
                            }}
                          >
                            Cancelar
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}

              {data && !data.documentos.isDone ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="mt-2 w-full text-slate-600"
                  disabled={loadingMore}
                  onClick={() => void loadData(data.documentos.continueCursor)}
                >
                  {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Cargar más documentos
                </Button>
              ) : null}

              {data && editingId === null ? (
                <div
                  className={cn(
                    "space-y-3",
                    data.documentos.page.length > 0 && "mt-3 border-t border-slate-200 pt-3"
                  )}
                >
                  <p className="text-xs font-medium text-slate-700">
                    {data.documentos.page.length > 0 ? "Agregar otro documento" : "Nuevo documento"}
                  </p>
                  <DocumentoForm
                    idPrefix="nuevo"
                    moneda={moneda}
                    numeroDocumento={numeroDocumento}
                    valorAplicado={valorAplicado}
                    comentario={comentario}
                    onNumeroChange={setNumeroDocumento}
                    onValorChange={setValorAplicado}
                    onComentarioChange={setComentario}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="w-full bg-white"
                    disabled={savingId === "new"}
                    onClick={() => void persistDocumento("add")}
                  >
                    {savingId === "new" ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    Agregar
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}

function DocumentoForm({
  idPrefix,
  moneda,
  numeroDocumento,
  valorAplicado,
  comentario,
  onNumeroChange,
  onValorChange,
  onComentarioChange,
}: {
  idPrefix: string;
  moneda: string;
  numeroDocumento: string;
  valorAplicado: string;
  comentario: string;
  onNumeroChange: (value: string) => void;
  onValorChange: (value: string) => void;
  onComentarioChange: (value: string) => void;
}) {
  const numeroId = `${idPrefix}-numero-documento-interno`;
  const valorId = `${idPrefix}-valor-aplicado-interno`;
  const comentarioId = `${idPrefix}-comentario-cruce-interno`;

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor={numeroId} className="text-xs text-slate-700">
          Número del documento
        </Label>
        <Input
          id={numeroId}
          value={numeroDocumento}
          maxLength={120}
          onChange={(event) => onNumeroChange(event.target.value)}
          placeholder="Ej. FE-12345"
          autoComplete="off"
          className="h-9 bg-white"
        />
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor={valorId} className="text-xs text-slate-700">
            Valor aplicado
          </Label>
          <span className="text-xs font-medium text-slate-500">{moneda}</span>
        </div>
        <Input
          id={valorId}
          inputMode="decimal"
          autoComplete="off"
          value={formatMoneyInputPlain(valorAplicado)}
          onChange={(event) => {
            const normalized = normalizeMoneyInput(event.target.value, valorAplicado || undefined);
            if (normalized !== null) onValorChange(normalized);
          }}
          placeholder="0,00"
          className="h-9 bg-white tabular-nums"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={comentarioId} className="text-xs text-slate-700">
          Comentario <span className="font-normal text-slate-500">(opcional)</span>
        </Label>
        <Input
          id={comentarioId}
          value={comentario}
          maxLength={500}
          onChange={(event) => onComentarioChange(event.target.value)}
          placeholder="Detalle para auditoría"
          className="h-9 bg-white"
        />
      </div>
    </div>
  );
}
