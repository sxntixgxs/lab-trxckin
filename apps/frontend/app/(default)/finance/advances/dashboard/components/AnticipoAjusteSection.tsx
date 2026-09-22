"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  History,
  Loader2,
  Minus,
  Paperclip,
  Plus,
  RotateCcw,
  Scale,
  X,
} from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { getValorContableAnticipo } from "@/app/(default)/finance/advances/lib/valor-contable-anticipo";
import {
  getSaldoPendienteLegalizableAnticipo,
  getValorLegalizableAnticipo,
} from "@/app/(default)/finance/advances/lib/valor-legalizable-anticipo";
import type {
  AnticipoAjusteApplyResponse,
  AnticipoAjustesContextResponse,
} from "@/app/api/finance/advances/_ajustes-lib";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Id } from "@/convex/_generated/dataModel";
import {
  addMoneyAmounts,
  formatMoneyInputPlain,
  moneyGreaterThan,
  normalizeMoneyInput,
  parsePositiveMoneyInput,
  subtractMoneyAmounts,
} from "@/lib/money";
import { cn } from "@/lib/utils";

import type { AnticipoRow } from "../types";

const formatterCOP = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const tipoLabels = {
  CORRECCION_DESEMBOLSO: "Corrección de desembolso",
  REINTEGRO: "Reintegro",
  CUADRE_OTROS_SISTEMAS: "Cuadre con otros sistemas",
  REVERSO: "Reverso",
} as const;

type TipoAjusteAplicacion = "CORRECCION_DESEMBOLSO" | "REINTEGRO" | "CUADRE_OTROS_SISTEMAS";
type OperacionAjuste = "SUMAR" | "RESTAR";

function createOperacionId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function historialAccionLabel(valorAjuste: number) {
  const monto = formatterCOP.format(Math.abs(valorAjuste));
  return valorAjuste >= 0 ? `Sumó ${monto}` : `Restó ${monto}`;
}

function buildAnticipoPatchFromResponse(
  anticipo: AnticipoRow,
  response: AnticipoAjusteApplyResponse
): AnticipoRow {
  return {
    ...anticipo,
    faseActual: response.faseActual as AnticipoRow["faseActual"],
    valorLegalizableActual: response.resumen.valorLegalizable,
    saldoLegalizado: response.resumen.saldoLegalizado,
  };
}

export function AnticipoAjusteSection({
  anticipo,
  onAnticipoChanged,
}: {
  anticipo: AnticipoRow;
  onAnticipoChanged?: (anticipo: AnticipoRow) => void;
}) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [contexto, setContexto] = useState<AnticipoAjustesContextResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reverseDialogOpen, setReverseDialogOpen] = useState(false);
  const [tipo, setTipo] = useState<TipoAjusteAplicacion>("CORRECCION_DESEMBOLSO");
  const [operacion, setOperacion] = useState<OperacionAjuste>("RESTAR");
  const [montoInput, setMontoInput] = useState("");
  const [motivo, setMotivo] = useState("");
  const [motivoReverso, setMotivoReverso] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [soporteNombre, setSoporteNombre] = useState("");
  const [soporteStorageId, setSoporteStorageId] = useState<Id<"_storage"> | null>(null);
  const [uploading, setUploading] = useState(false);

  const empresa = anticipo.empresa_id ?? anticipo.empresa ?? 1;
  const resumenFallback = useMemo(
    () => ({
      valorSolicitado: anticipo.valorNumerico,
      valorAprobado: getValorContableAnticipo(anticipo),
      valorLegalizable: getValorLegalizableAnticipo(anticipo),
      saldoLegalizado: anticipo.saldoLegalizado ?? 0,
      saldoPendiente: getSaldoPendienteLegalizableAnticipo(anticipo),
    }),
    [anticipo]
  );
  const resumen = contexto?.resumen ?? resumenFallback;
  const limites = contexto?.limites ?? {
    maximoSumar: Math.max(0, subtractMoneyAmounts(resumen.valorAprobado, resumen.valorLegalizable)),
    maximoRestar: Math.max(
      0,
      subtractMoneyAmounts(resumen.valorLegalizable, resumen.saldoLegalizado)
    ),
    puedeSumar: resumen.valorLegalizable < resumen.valorAprobado,
    puedeRestar: resumen.valorLegalizable > resumen.saldoLegalizado,
  };

  const montoAjuste = parsePositiveMoneyInput(montoInput);
  const operacionEfectiva: OperacionAjuste =
    tipo === "REINTEGRO" ? "RESTAR" : tipo === "CUADRE_OTROS_SISTEMAS" ? "SUMAR" : operacion;
  const nuevoLegalizable =
    montoAjuste != null
      ? operacionEfectiva === "SUMAR"
        ? addMoneyAmounts(resumen.valorLegalizable, montoAjuste)
        : subtractMoneyAmounts(resumen.valorLegalizable, montoAjuste)
      : null;
  const pendienteDespues =
    nuevoLegalizable != null
      ? Math.max(0, subtractMoneyAmounts(nuevoLegalizable, resumen.saldoLegalizado))
      : resumen.saldoPendiente;
  const completara = nuevoLegalizable != null && pendienteDespues === 0;

  const invalidateAnticiposQueries = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["anticipos-workspace-items"] }),
      queryClient.invalidateQueries({ queryKey: ["anticipos-dashboard-summary"] }),
      queryClient.invalidateQueries({ queryKey: ["anticipos-bags"] }),
      queryClient.invalidateQueries({ queryKey: ["anticipos-dashboard-workload"] }),
    ]);
  }, [queryClient]);

  const loadContext = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/finance/advances/${anticipo._id}/ajustes`);
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? "No se pudo cargar el contexto de ajustes");
      }
      const data = (await response.json()) as AnticipoAjustesContextResponse;
      setContexto(data);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Error al cargar ajustes");
    } finally {
      setLoading(false);
    }
  }, [anticipo._id]);

  useEffect(() => {
    void loadContext();
  }, [loadContext]);

  useEffect(() => {
    if (tipo === "REINTEGRO" && operacion !== "RESTAR") {
      setOperacion("RESTAR");
    }
    if (tipo === "CUADRE_OTROS_SISTEMAS" && operacion !== "SUMAR") {
      setOperacion("SUMAR");
    }
  }, [tipo, operacion]);

  useEffect(() => {
    if (!dialogOpen) return;
    setFieldError(null);
    setMontoInput("");
    setMotivo("");
    setSoporteNombre("");
    setSoporteStorageId(null);
    setOperacion("RESTAR");
    setTipo("CORRECCION_DESEMBOLSO");
  }, [dialogOpen]);

  const validationError = useMemo(() => {
    if (!montoAjuste) return null;
    if (operacionEfectiva === "SUMAR") {
      if (tipo !== "CUADRE_OTROS_SISTEMAS") {
        if (!limites.puedeSumar) {
          return "El valor legalizable ya coincide con el valor aprobado";
        }
        if (moneyGreaterThan(montoAjuste, limites.maximoSumar)) {
          return `La suma no puede superar ${formatterCOP.format(limites.maximoSumar)}`;
        }
      }
    } else {
      if (!limites.puedeRestar) {
        return "No hay saldo legalizable disponible para restar";
      }
      if (moneyGreaterThan(montoAjuste, limites.maximoRestar)) {
        return `La resta no puede superar ${formatterCOP.format(limites.maximoRestar)}`;
      }
      if (nuevoLegalizable != null && moneyGreaterThan(resumen.saldoLegalizado, nuevoLegalizable)) {
        return "El resultado no puede quedar por debajo de lo legalizado";
      }
    }
    if (nuevoLegalizable != null && nuevoLegalizable <= 0) {
      return "El valor legalizable no puede quedar en cero; usa el flujo de anulación";
    }
    return null;
  }, [
    limites.maximoRestar,
    limites.maximoSumar,
    limites.puedeRestar,
    limites.puedeSumar,
    montoAjuste,
    nuevoLegalizable,
    operacionEfectiva,
    resumen.saldoLegalizado,
    tipo,
  ]);

  const ctaLabel = useMemo(() => {
    if (!montoAjuste || validationError) return "Registrar ajuste";
    const monto = formatterCOP.format(montoAjuste);
    if (operacionEfectiva === "SUMAR") {
      return `Sumar ${monto} al valor legalizable`;
    }
    if (completara) {
      return `Restar ${monto} y completar anticipo`;
    }
    return `Restar ${monto}`;
  }, [completara, montoAjuste, operacionEfectiva, validationError]);

  const puedeAplicar = contexto?.capacidades.puedeAplicar ?? false;
  const puedeReversar = contexto?.capacidades.puedeReversar ?? false;
  const historial = contexto?.historial?.page ?? [];

  function handleMontoChange(rawValue: string) {
    setFieldError(null);
    const normalized = normalizeMoneyInput(rawValue, montoInput || undefined);
    if (normalized === null) return;
    setMontoInput(normalized);
  }

  async function uploadSoporte(file: File) {
    setUploading(true);
    try {
      const urlResponse = await fetch("/api/convex/generate-upload-url", { method: "POST" });
      if (!urlResponse.ok) throw new Error("No se pudo preparar la carga del soporte");
      const { uploadUrl } = (await urlResponse.json()) as { uploadUrl: string };
      const uploadResponse = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!uploadResponse.ok) throw new Error("No se pudo subir el soporte");
      const { storageId } = (await uploadResponse.json()) as { storageId: Id<"_storage"> };
      setSoporteStorageId(storageId);
      setSoporteNombre(file.name);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al subir soporte");
    } finally {
      setUploading(false);
    }
  }

  async function applyServerResponse(response: AnticipoAjusteApplyResponse) {
    setContexto((prev) =>
      prev
        ? {
            ...prev,
            resumen: response.resumen,
            limites: response.limites,
            faseActual: response.faseActual,
          }
        : prev
    );
    onAnticipoChanged?.(buildAnticipoPatchFromResponse(anticipo, response));
    await invalidateAnticiposQueries();
    await loadContext();
  }

  async function confirmarAjuste() {
    setFieldError(null);
    if (!motivo.trim()) {
      setFieldError("El motivo es obligatorio");
      return;
    }
    if (!montoAjuste) {
      setFieldError("Ingresa un valor de ajuste mayor a cero");
      return;
    }
    if (validationError) {
      setFieldError(validationError);
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`/api/finance/advances/${anticipo._id}/ajustes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operacionId: createOperacionId("ajuste"),
          tipo,
          operacion: operacionEfectiva,
          montoAjuste,
          valorEsperado: resumen.valorLegalizable,
          motivo: motivo.trim(),
          empresa,
          soporte:
            soporteStorageId && soporteNombre
              ? { storageId: soporteStorageId, nombre: soporteNombre }
              : undefined,
        }),
      });
      const payload = (await response.json()) as AnticipoAjusteApplyResponse & {
        error?: string;
      };
      if (!response.ok) {
        setFieldError(payload.error ?? "No se pudo registrar el ajuste");
        return;
      }
      toast.success(
        payload.completado
          ? "Ajuste registrado y anticipo completado"
          : "Ajuste registrado correctamente"
      );
      setDialogOpen(false);
      await applyServerResponse(payload);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al registrar ajuste");
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmarReverso() {
    const ultimoId = contexto?.capacidades.ultimoAjusteActivoId;
    if (!ultimoId || !motivoReverso.trim()) {
      toast.error("Indica el motivo del reverso");
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch(
        `/api/finance/advances/${anticipo._id}/ajustes/${ultimoId}/reversar`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            operacionId: createOperacionId("reverso"),
            motivo: motivoReverso.trim(),
            empresa,
          }),
        }
      );
      const payload = (await response.json()) as AnticipoAjusteApplyResponse & {
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? "No se pudo reversar el ajuste");
      toast.success(
        payload.reabierto ? "Ajuste reversado y anticipo reabierto" : "Ajuste reversado"
      );
      setReverseDialogOpen(false);
      setMotivoReverso("");
      await applyServerResponse(payload);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al reversar ajuste");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-w-0 rounded-md border border-slate-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-black text-slate-900">
          <Scale className="h-4 w-4 text-slate-500" />
          Ajustes auditables
        </div>
        <div className="flex flex-wrap gap-2">
          {puedeAplicar ? (
            <Button type="button" size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
              Registrar ajuste
            </Button>
          ) : null}
          {puedeReversar ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-amber-700 hover:bg-amber-50"
              onClick={() => setReverseDialogOpen(true)}
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Reversar último
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-2 text-sm sm:grid-cols-3">
        <ResumenItem
          label="Legalizable actual"
          value={formatterCOP.format(resumen.valorLegalizable)}
          highlight
        />
        <ResumenItem label="Legalizado" value={formatterCOP.format(resumen.saldoLegalizado)} />
        <ResumenItem label="Saldo pendiente" value={formatterCOP.format(resumen.saldoPendiente)} />
      </div>

      {loading ? (
        <div className="mt-4 flex h-16 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        </div>
      ) : historial.length > 0 ? (
        <div className="mt-4 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <History className="h-3.5 w-3.5" />
            Historial
          </div>
          {historial.map((row) => (
            <div
              key={row._id}
              className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold text-slate-900">
                    {tipoLabels[row.tipo]}
                    {row.tipo !== "REVERSO" ? ` · ${historialAccionLabel(row.valorAjuste)}` : null}
                  </p>
                  <p className="text-xs text-slate-500">
                    {row.actorNombre} · {new Date(row.aplicadoEn).toLocaleString("es-CO")}
                  </p>
                </div>
                <Badge variant="outline" className="rounded-full text-[10px]">
                  {formatterCOP.format(row.valorAnterior)} →{" "}
                  {formatterCOP.format(row.valorObjetivo)}
                </Badge>
              </div>
              <p className="mt-2 text-xs text-slate-700">{row.motivo}</p>
              {row.soporte ? (
                <a
                  href={`/api/convex/storage/${row.soporte.storageId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-block text-xs font-medium text-emerald-700 underline-offset-2 hover:underline"
                >
                  {row.soporte.nombre}
                </a>
              ) : null}
              {row.reversadoEn ? <p className="mt-1 text-xs text-amber-700">Reversado</p> : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-slate-500">Sin ajustes registrados.</p>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="flex max-h-[90dvh] max-w-lg flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b border-slate-100 px-6 py-4">
            <DialogTitle>Registrar ajuste</DialogTitle>
            <DialogDescription>
              Ajusta el valor legalizable sin modificar el valor aprobado ni las legalizaciones
              existentes.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
            <div className="grid gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm sm:grid-cols-3">
              <ResumenItem
                label="Legalizable actual"
                value={formatterCOP.format(resumen.valorLegalizable)}
                highlight
              />
              <ResumenItem
                label="Legalizado"
                value={formatterCOP.format(resumen.saldoLegalizado)}
              />
              <ResumenItem
                label="Saldo pendiente"
                value={formatterCOP.format(resumen.saldoPendiente)}
              />
            </div>

            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={tipo} onValueChange={(value) => setTipo(value as typeof tipo)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CORRECCION_DESEMBOLSO">Corrección de desembolso</SelectItem>
                  <SelectItem value="REINTEGRO">Reintegro</SelectItem>
                  <SelectItem value="CUADRE_OTROS_SISTEMAS">Cuadre con otros sistemas</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Operación</Label>
              <div
                className="grid grid-cols-2 gap-2"
                role="group"
                aria-label="Operación del ajuste"
              >
                <OperacionButton
                  active={operacionEfectiva === "RESTAR"}
                  disabled={
                    tipo === "CUADRE_OTROS_SISTEMAS" ||
                    (!limites.puedeRestar && tipo !== "REINTEGRO")
                  }
                  tone="restar"
                  onClick={() => setOperacion("RESTAR")}
                >
                  <Minus className="h-4 w-4" aria-hidden />
                  Restar
                </OperacionButton>
                <OperacionButton
                  active={operacionEfectiva === "SUMAR"}
                  disabled={
                    tipo === "REINTEGRO" ||
                    (tipo !== "CUADRE_OTROS_SISTEMAS" && !limites.puedeSumar)
                  }
                  tone="sumar"
                  onClick={() => setOperacion("SUMAR")}
                >
                  <Plus className="h-4 w-4" aria-hidden />
                  Sumar
                </OperacionButton>
              </div>
              {tipo === "REINTEGRO" ? (
                <p className="text-xs text-amber-800">
                  Los reintegros únicamente disminuyen el valor legalizable.
                </p>
              ) : null}
              {tipo === "CUADRE_OTROS_SISTEMAS" ? (
                <p className="text-xs text-amber-800">
                  Este ajuste aumenta el valor legalizable para cuadrarlo con otros sistemas. Puede
                  superar el valor aprobado y quedará registrado en el historial.
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="monto-ajuste">Valor del ajuste</Label>
              <Input
                id="monto-ajuste"
                inputMode="decimal"
                autoComplete="off"
                value={formatMoneyInputPlain(montoInput)}
                onChange={(event) => handleMontoChange(event.target.value)}
                placeholder="0,00"
                aria-invalid={Boolean(fieldError || validationError)}
                aria-describedby="monto-ajuste-error"
              />
              {(fieldError || validationError) && montoInput ? (
                <p id="monto-ajuste-error" className="text-xs text-rose-700" role="alert">
                  {fieldError ?? validationError}
                </p>
              ) : null}
            </div>

            {montoAjuste && !validationError && nuevoLegalizable != null ? (
              <div
                className={cn(
                  "space-y-2 rounded-md border p-3 text-sm",
                  completara
                    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                    : "border-amber-100 bg-amber-50 text-amber-950"
                )}
              >
                <p className="font-medium">
                  Legalizable actual {formatterCOP.format(resumen.valorLegalizable)}{" "}
                  {operacionEfectiva === "SUMAR" ? "+" : "−"} Ajuste{" "}
                  {formatterCOP.format(montoAjuste)} = Nuevo legalizable{" "}
                  {formatterCOP.format(nuevoLegalizable)}
                </p>
                <p>Legalizado: {formatterCOP.format(resumen.saldoLegalizado)}</p>
                <p>Saldo pendiente después: {formatterCOP.format(pendienteDespues)}</p>
                {completara ? (
                  <p className="flex items-start gap-2 font-medium text-emerald-800">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    El anticipo quedará completado
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="motivo-ajuste">Motivo</Label>
              <Textarea
                id="motivo-ajuste"
                value={motivo}
                onChange={(event) => setMotivo(event.target.value)}
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label>Soporte opcional</Label>
              <input
                ref={fileInputRef}
                type="file"
                className="sr-only"
                disabled={uploading}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void uploadSoporte(file);
                  event.target.value = "";
                }}
              />
              {soporteNombre ? (
                <div className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <Paperclip className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                    <span className="truncate">{soporteNombre}</span>
                    {uploading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" aria-hidden />
                    ) : null}
                  </span>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 shrink-0"
                    aria-label="Quitar soporte"
                    onClick={() => {
                      setSoporteNombre("");
                      setSoporteStorageId(null);
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Paperclip className="mr-2 h-4 w-4" />
                  )}
                  Adjuntar soporte
                </Button>
              )}
            </div>
          </div>

          <DialogFooter className="border-t border-slate-100 px-6 py-4 sm:flex-col sm:space-x-0">
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="button"
                disabled={submitting || Boolean(validationError) || !montoAjuste || !motivo.trim()}
                className={cn(completara && "bg-emerald-700 hover:bg-emerald-800")}
                onClick={() => void confirmarAjuste()}
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : ctaLabel}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reverseDialogOpen} onOpenChange={setReverseDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reversar último ajuste</DialogTitle>
            <DialogDescription>
              Se restaurará el valor legalizable anterior y se registrará un movimiento de reverso
              auditado.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="motivo-reverso">Motivo</Label>
            <Textarea
              id="motivo-reverso"
              value={motivoReverso}
              onChange={(event) => setMotivoReverso(event.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setReverseDialogOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" disabled={submitting} onClick={() => void confirmarReverso()}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar reverso"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function OperacionButton({
  active,
  disabled,
  tone,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  tone: "sumar" | "restar";
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-10 items-center justify-center gap-2 rounded-md border px-3 text-sm font-semibold transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        active && tone === "restar" && "border-rose-200 bg-rose-50 text-rose-800",
        active && tone === "sumar" && "border-emerald-200 bg-emerald-50 text-emerald-800",
        !active && "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
      )}
    >
      {children}
    </button>
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
    <div className="rounded-md border border-slate-100 bg-white px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p
        className={
          highlight ? "text-base font-black text-emerald-700" : "font-semibold text-slate-900"
        }
      >
        {value}
      </p>
    </div>
  );
}
