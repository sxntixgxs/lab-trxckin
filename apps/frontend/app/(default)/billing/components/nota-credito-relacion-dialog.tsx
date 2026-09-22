"use client";

import { Loader2, Search } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Id } from "@/convex/_generated/dataModel";
import { formatCurrency, formatDate } from "../lib/utils";

export type NotaCreditoRelacionCandidato = {
  id: string;
  numero: string;
  fechaEmision: string;
  estado?: string;
  proveedorNombre: string;
  proveedorNit: string;
  moneda: string;
  valorBaseFactura: number;
  usaValorXmlComoBase?: boolean;
  totalNotasCreditoActual: number;
  netoActual: number;
  netoProyectado: number;
};

export type NotaCreditoRelacionDialogSource = {
  id: string;
  numero: string;
  total: number;
  moneda: string;
  fechaEmision: string;
  proveedorNombre?: string;
  proveedorNit?: string;
  referenciaXml?: string;
  facturaActual?: {
    id: string;
    numero: string;
    origen: "dian" | "manual";
  };
  origenRelacionEfectiva: "dian" | "manual" | "sin_relacion";
};

type Contexto =
  | { tipo: "detalle_factura" }
  | {
      tipo: "conciliacion_peajes";
      archivoNombre: string;
      documentosArchivo: Array<{
        tipo: "factura" | "nota_credito";
        numero: string;
        numeroNormalizado: string;
        total: number;
        referencia?: string;
        referenciaNormalizada?: string;
        proveedorNit?: string;
        operador?: string;
        placa?: string;
        centroCosto?: string;
        fechaCreacion?: string;
      }>;
    };

export type NotaCreditoRelacionStaged = {
  notaCreditoId: string;
  notaCreditoNumero: string;
  facturaNuevaId: string;
  facturaNuevaNumero: string;
  facturaAnteriorId: string | null;
  facturaAnteriorNumero: string | null;
  origenRelacionAnteriorEsperado: "dian" | "manual" | "sin_relacion";
  motivo: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  notaCreditoId: Id<"facturacionFacturas">;
  source: NotaCreditoRelacionDialogSource;
  contexto: Contexto;
  /** When provided (PEAJES), search is local to these candidates. */
  peajesCandidatos?: NotaCreditoRelacionCandidato[];
  /**
   * When provided, the change is staged in the caller's draft instead of being
   * written immediately. Used by the PEAJES reconciliation, where nothing is
   * persisted until the cruce runs.
   */
  onStage?: (staged: NotaCreditoRelacionStaged) => void;
  onSuccess?: () => void;
};

function normalizeNumero(value: string) {
  return value
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]/g, "");
}

async function readApiJson<T extends { error?: string }>(
  response: Response,
  fallbackError: string
): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error(
      response.status === 404
        ? "La API de relación no está disponible. Reinicia el servidor de desarrollo e inténtalo de nuevo."
        : fallbackError
    );
  }
  return (await response.json()) as T;
}

export function NotaCreditoRelacionDialog({
  open,
  onOpenChange,
  notaCreditoId,
  source,
  contexto,
  peajesCandidatos,
  onStage,
  onSuccess,
}: Props) {
  const motivoId = useId();
  const searchId = useId();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [candidatos, setCandidatos] = useState<NotaCreditoRelacionCandidato[]>(
    []
  );
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [selected, setSelected] =
    useState<NotaCreditoRelacionCandidato | null>(null);
  const [motivo, setMotivo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setDebouncedQuery("");
    setCandidatos([]);
    setSelected(null);
    setMotivo("");
    setError(null);
  }, [open]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!open || selected) return;

    if (contexto.tipo === "conciliacion_peajes") {
      const normalized = normalizeNumero(debouncedQuery);
      if (normalized.length < 2) {
        setCandidatos([]);
        return;
      }
      const filtered = (peajesCandidatos ?? []).filter((item) =>
        normalizeNumero(item.numero).startsWith(normalized)
      );
      setCandidatos(filtered.slice(0, 20));
      return;
    }

    const normalized = normalizeNumero(debouncedQuery);
    if (normalized.length < 2) {
      setCandidatos([]);
      return;
    }

    let cancelled = false;
    setLoadingSearch(true);
    void (async () => {
      try {
        const response = await fetch(
          `/api/billing/notas-credito/${notaCreditoId}/facturas-candidatas?q=${encodeURIComponent(debouncedQuery)}`
        );
        const payload = await readApiJson<{
          error?: string;
          candidatos?: NotaCreditoRelacionCandidato[];
        }>(response, "No se pudieron buscar facturas.");
        if (!response.ok) {
          throw new Error(payload.error ?? "No se pudieron buscar facturas.");
        }
        if (!cancelled) setCandidatos(payload.candidatos ?? []);
      } catch (err) {
        if (!cancelled) {
          setCandidatos([]);
          setError(err instanceof Error ? err.message : "Error de búsqueda");
        }
      } finally {
        if (!cancelled) setLoadingSearch(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    open,
    selected,
    debouncedQuery,
    notaCreditoId,
    contexto.tipo,
    peajesCandidatos,
  ]);

  async function handleConfirm() {
    if (!selected) return;
    const motivoTrim = motivo.trim();
    if (!motivoTrim) {
      setError("El motivo es obligatorio.");
      return;
    }
    if (onStage) {
      onStage({
        notaCreditoId: String(notaCreditoId),
        notaCreditoNumero: source.numero,
        facturaNuevaId: selected.id,
        facturaNuevaNumero: selected.numero,
        facturaAnteriorId: source.facturaActual?.id ?? null,
        facturaAnteriorNumero: source.facturaActual?.numero ?? null,
        origenRelacionAnteriorEsperado: source.origenRelacionEfectiva,
        motivo: motivoTrim,
      });
      toast.success(
        "Cambio pendiente. Se aplicará solo al ejecutar el cruce."
      );
      onOpenChange(false);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/billing/notas-credito/${notaCreditoId}/relacion`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            facturaNuevaId: selected.id,
            facturaAnteriorEfectivaEsperadaId: source.facturaActual?.id ?? null,
            origenRelacionAnteriorEsperado: source.origenRelacionEfectiva,
            motivo: motivoTrim,
            contexto,
          }),
        }
      );
      const payload = await readApiJson<{ error?: string }>(
        response,
        "No se pudo reasignar la nota crédito."
      );
      if (!response.ok) {
        throw new Error(payload.error ?? "No se pudo reasignar la nota crédito.");
      }
      toast.success("Relación de nota crédito actualizada.");
      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al confirmar");
    } finally {
      setSubmitting(false);
    }
  }

  const xmlDiffers =
    selected &&
    source.referenciaXml &&
    normalizeNumero(source.referenciaXml) !== normalizeNumero(selected.numero);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {source.facturaActual
              ? "Cambiar factura relacionada"
              : "Aplicar a otra factura"}
          </DialogTitle>
          <DialogDescription>
            La referencia XML original permanece inmutable. Solo se actualiza la
            relación manual efectiva.
            {onStage
              ? " El cambio queda pendiente y se aplica al ejecutar el cruce."
              : null}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
          <div className="flex flex-wrap justify-between gap-2">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                Nota crédito
              </p>
              <p className="font-semibold text-slate-900">{source.numero}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                Valor
              </p>
              <p className="font-semibold text-slate-900">
                {formatCurrency(source.total, source.moneda)}
              </p>
            </div>
          </div>
          <p className="text-slate-600">
            Emisión {formatDate(source.fechaEmision)}
            {source.proveedorNombre
              ? ` · ${source.proveedorNombre}`
              : null}
            {source.referenciaXml
              ? ` · Ref. XML ${source.referenciaXml}`
              : null}
          </p>
          <p className="text-slate-600">
            Factura efectiva actual:{" "}
            <span className="font-semibold text-slate-900">
              {source.facturaActual?.numero ?? "Sin relación"}
            </span>
            {source.facturaActual ? (
              <Badge variant="outline" className="ml-2">
                {source.facturaActual.origen}
              </Badge>
            ) : null}
          </p>
        </div>

        {!selected ? (
          <div className="space-y-3">
            <Label htmlFor={searchId}>Buscar factura</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                id={searchId}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Escribe al menos 2 caracteres del número"
                className="w-full rounded-md border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-cyan-400"
                autoFocus
              />
            </div>
            {loadingSearch ? (
              <p className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Buscando…
              </p>
            ) : null}
            <ul className="max-h-64 space-y-2 overflow-auto">
              {candidatos.map((candidato) => (
                <li key={candidato.id}>
                  <button
                    type="button"
                    className="w-full rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-cyan-300 hover:bg-cyan-50/40"
                    onClick={() => setSelected(candidato)}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-slate-900">
                          {candidato.numero}
                        </p>
                        <p className="text-xs text-slate-500">
                          {formatDate(candidato.fechaEmision)}
                          {candidato.estado ? ` · ${candidato.estado}` : ""}
                        </p>
                      </div>
                      <div className="text-right text-xs text-slate-600">
                        <p>
                          Base{" "}
                          {formatCurrency(
                            candidato.valorBaseFactura,
                            candidato.moneda
                          )}
                        </p>
                        <p>
                          NC{" "}
                          {formatCurrency(
                            candidato.totalNotasCreditoActual,
                            candidato.moneda
                          )}
                        </p>
                        <p>
                          Neto actual{" "}
                          {formatCurrency(candidato.netoActual, candidato.moneda)}
                        </p>
                        <p className="font-semibold text-cyan-800">
                          Neto proyectado{" "}
                          {formatCurrency(
                            candidato.netoProyectado,
                            candidato.moneda
                          )}
                        </p>
                      </div>
                    </div>
                    {candidato.usaValorXmlComoBase ? (
                      <p className="mt-1 text-[11px] text-amber-700">
                        Base = total XML (sin valor contable)
                      </p>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
            {!loadingSearch &&
            normalizeNumero(debouncedQuery).length >= 2 &&
            candidatos.length === 0 ? (
              <p className="text-sm text-slate-500">
                No hay facturas elegibles para este prefijo.
              </p>
            ) : null}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-cyan-200 bg-cyan-50/50 p-4 text-sm">
              <p className="font-semibold text-slate-900">
                {source.facturaActual?.numero ?? "Sin relación"} →{" "}
                {selected.numero}
              </p>
              {source.referenciaXml ? (
                <p className="mt-1 text-slate-600">
                  Referencia XML original: {source.referenciaXml}
                </p>
              ) : null}
              {xmlDiffers ? (
                <p className="mt-2 text-amber-800">
                  La factura seleccionada difiere de la referencia XML original.
                </p>
              ) : null}
              {source.facturaActual ? (
                <p className="mt-2 text-slate-700">
                  Factura anterior: neto actual se recalculará al quitar esta NC.
                </p>
              ) : null}
              <p className="mt-1 text-slate-700">
                Factura nueva:{" "}
                {formatCurrency(selected.valorBaseFactura, selected.moneda)} − NC{" "}
                {formatCurrency(
                  selected.totalNotasCreditoActual + source.total,
                  selected.moneda
                )}{" "}
                = neto proyectado{" "}
                {formatCurrency(selected.netoProyectado, selected.moneda)}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor={motivoId}>Motivo del cambio</Label>
              <Textarea
                id={motivoId}
                value={motivo}
                maxLength={500}
                onChange={(event) => setMotivo(event.target.value)}
                placeholder="Explica por qué se reasigna esta nota crédito"
                rows={3}
              />
              <p className="text-xs text-slate-500">{motivo.length}/500</p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => setSelected(null)}
              disabled={submitting}
            >
              Elegir otra factura
            </Button>
          </div>
        )}

        {error ? (
          <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={!selected || submitting}
            className="gap-2"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {onStage ? "Dejar cambio pendiente" : "Confirmar cambio de factura"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
