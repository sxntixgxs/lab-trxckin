"use client";

import { AlertCircle, CheckCircle2, CircleDot, Clock, Loader2, MinusCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { getFacturacionErrorMessage } from "@/app/(default)/billing/lib/user-facing-error";
import { formatDateTime } from "@/app/(default)/billing/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { Id } from "@/convex/_generated/dataModel";
import {
  buildCausacionQueryParams,
  type CausacionContexto,
  type CausacionSnapshot,
  formatCausacionEstadoLabel,
  formatFpDisplay,
  formatMotivoSoloLectura,
  getCausacionEstadoTone,
} from "@/lib/facturacion-causacion";
import { cn } from "@/lib/utils";

/**
 * Values staged with the workflow action. This panel deliberately does not
 * persist them: the owning review flow sends them with its phase mutation so
 * causation and the phase action share one audit event.
 */
export type FacturaCausacionDraft = {
  causado: boolean;
  numeroFp: string;
  expectedVersion?: number;
};

export function FacturaCausacionPanel({
  facturaId,
  numeroFactura,
  contexto,
  draft,
  onDraftChange,
  readonly = false,
  compact = false,
  onDirtyChange,
  className,
}: {
  facturaId: Id<"facturacionFacturas">;
  numeroFactura?: string;
  contexto: CausacionContexto;
  draft?: FacturaCausacionDraft;
  onDraftChange?: (draft: FacturaCausacionDraft) => void;
  readonly?: boolean;
  compact?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
  className?: string;
}) {
  const [snapshot, setSnapshot] = useState<CausacionSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [localDraft, setLocalDraft] = useState<FacturaCausacionDraft | null>(null);
  const fetchSeq = useRef(0);

  // Callers commonly construct contexto inline. Derive its request data from
  // scalar values so parent re-renders do not repeatedly reload the snapshot.
  const contextoTipo = contexto.tipo;
  const reembolsoId = contextoTipo === "reembolso_caja_menor" ? contexto.reembolsoId : undefined;
  const movimientoId = contextoTipo === "reembolso_caja_menor" ? contexto.movimientoId : undefined;
  const contextQuery = useMemo(
    () =>
      buildCausacionQueryParams(
        contextoTipo === "reembolso_caja_menor" && reembolsoId && movimientoId
          ? { tipo: contextoTipo, reembolsoId, movimientoId }
          : { tipo: "flujo_factura" }
      ),
    [contextoTipo, movimientoId, reembolsoId]
  );

  useEffect(() => {
    const seq = ++fetchSeq.current;
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    async function loadSnapshot() {
      try {
        const response = await fetch(
          `/api/billing/facturas/${facturaId}/causacion?${contextQuery}`,
          {
            cache: "no-store",
            signal: controller.signal,
          }
        );
        const payload = (await response.json()) as CausacionSnapshot & { error?: string };
        if (!response.ok) {
          throw new Error(payload.error ?? "No se pudo cargar la causación.");
        }
        if (seq !== fetchSeq.current) return;
        setSnapshot(payload);
      } catch (loadError) {
        if (controller.signal.aborted || seq !== fetchSeq.current) return;
        setError(getFacturacionErrorMessage(loadError, "No se pudo cargar la causación."));
      } finally {
        if (seq === fetchSeq.current) setLoading(false);
      }
    }

    void loadSnapshot();
    return () => controller.abort();
  }, [contextQuery, facturaId]);

  const snapshotDraft = useMemo<FacturaCausacionDraft>(
    () => ({
      causado: snapshot?.causado === true,
      numeroFp: snapshot?.causado === true ? (snapshot.numeroFp ?? "") : "",
    }),
    [snapshot]
  );
  useEffect(() => {
    if (snapshot && !draft) setLocalDraft(snapshotDraft);
  }, [draft, snapshot, snapshotDraft]);

  const activeDraft = draft ?? localDraft ?? snapshotDraft;
  const dirty =
    Boolean(snapshot) &&
    (activeDraft.causado !== snapshotDraft.causado ||
      (activeDraft.causado && activeDraft.numeroFp.trim() !== snapshotDraft.numeroFp.trim()));

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const canEdit = Boolean(snapshot?.puedeEditar) && !readonly && Boolean(onDraftChange);
  const estadoTone = snapshot ? getCausacionEstadoTone(snapshot.estado) : null;
  const EstadoIcon =
    snapshot?.estado === "causado"
      ? CheckCircle2
      : snapshot?.estado === "no_causado"
        ? MinusCircle
        : CircleDot;

  function updateDraft(change: Partial<FacturaCausacionDraft>) {
    if (!onDraftChange) return;
    const next = { ...activeDraft, ...change };
    if (!next.causado) next.numeroFp = "";
    setLocalDraft(next);
    onDraftChange({
      ...next,
      expectedVersion: snapshot?.version,
    });
  }

  return (
    <section
      className={cn(
        compact
          ? "border-l border-slate-200 pl-4"
          : "rounded-xl border border-slate-200 bg-white p-4",
        className
      )}
      aria-labelledby={`causacion-panel-title-${facturaId}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p
            id={`causacion-panel-title-${facturaId}`}
            className={cn("font-semibold text-slate-950", compact ? "text-xs" : "text-sm")}
          >
            Causación
          </p>
          {numeroFactura ? (
            <p className="mt-0.5 truncate text-[11px] text-slate-500">Factura #{numeroFactura}</p>
          ) : null}
        </div>
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin text-slate-400" aria-hidden />
        ) : snapshot && estadoTone ? (
          <div className="flex items-center gap-2">
            {dirty ? (
              <span className="text-[10px] font-medium text-slate-500">Listo para aplicar</span>
            ) : null}
            <Badge variant="outline" className={cn("gap-1.5", estadoTone.badgeClass)}>
              <EstadoIcon className="h-3 w-3" aria-hidden />
              {formatCausacionEstadoLabel(snapshot.estado)}
            </Badge>
          </div>
        ) : null}
      </div>

      <div aria-live="polite" className="mt-2 min-h-[1.25rem]">
        {error ? (
          <p className="flex items-start gap-1.5 text-xs text-rose-700">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            {error}
          </p>
        ) : null}
      </div>

      {loading ? (
        <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          Cargando causación…
        </div>
      ) : snapshot ? (
        <div className={cn("space-y-3", compact ? "mt-2" : "mt-3")}>
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Número FP
              </p>
              <p className="mt-0.5 truncate text-sm font-medium text-slate-900">
                {formatFpDisplay(snapshot.causado, snapshot.numeroFp)}
              </p>
            </div>
            {estadoTone ? (
              <span
                className={cn("h-2.5 w-2.5 shrink-0 rounded-full", estadoTone.dotClass)}
                aria-hidden
              />
            ) : null}
          </div>

          {snapshot.actualizadoPor ? (
            <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
              <Clock className="h-3 w-3" aria-hidden />
              {snapshot.actualizadoPor.nombre}
              {snapshot.actualizadoEn ? ` · ${formatDateTime(snapshot.actualizadoEn)}` : ""}
            </p>
          ) : null}

          {!canEdit && snapshot.motivoSoloLectura ? (
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
              {formatMotivoSoloLectura(snapshot.motivoSoloLectura)}
            </p>
          ) : null}

          {canEdit ? (
            <div className="space-y-3 border-t border-slate-200 pt-3">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor={`causado-${facturaId}`} className="text-xs font-medium">
                  Factura causada
                </Label>
                <Switch
                  id={`causado-${facturaId}`}
                  checked={activeDraft.causado}
                  onCheckedChange={(causado) => updateDraft({ causado })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`numero-fp-${facturaId}`} className="text-xs">
                  Número FP {activeDraft.causado ? "(obligatorio)" : ""}
                </Label>
                <Input
                  id={`numero-fp-${facturaId}`}
                  value={activeDraft.numeroFp}
                  disabled={!activeDraft.causado}
                  maxLength={64}
                  className="h-9 rounded-lg text-sm"
                  placeholder={activeDraft.causado ? "Ej. FP-2026-00123" : "No aplica"}
                  onChange={(event) => updateDraft({ numeroFp: event.target.value })}
                  onBlur={() => updateDraft({ numeroFp: activeDraft.numeroFp.trim() })}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      event.currentTarget.blur();
                    }
                  }}
                />
              </div>
              {activeDraft.causado && activeDraft.numeroFp.trim().length === 0 ? (
                <p className="text-[11px] text-amber-700">
                  Ingresa el número FP antes de aplicar la acción.
                </p>
              ) : null}
            </div>
          ) : null}

          {readonly && snapshot.historial.page.length > 0 ? (
            <div className="space-y-2 border-t border-slate-200 pt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Historial de causación
              </p>
              {snapshot.historial.page.map((event) => (
                <div key={event.id} className="rounded-lg bg-slate-50 px-3 py-2 text-[11px]">
                  <div className="flex items-center justify-between gap-2 text-slate-500">
                    <span>{event.actorNombre ?? "Usuario"}</span>
                    <span>{formatDateTime(event.creadoEn)}</span>
                  </div>
                  <p className="mt-1 font-medium text-slate-800">{event.comentario}</p>
                  {event.causacionCambio ? (
                    <p className="mt-1 text-slate-600">
                      {event.causacionCambio.causadoNuevo ? "Causada" : "No causada"} · FP{" "}
                      {formatFpDisplay(
                        event.causacionCambio.causadoNuevo,
                        event.causacionCambio.numeroFpNuevo
                      )}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 text-xs text-slate-500">No hay información de causación disponible.</p>
      )}
    </section>
  );
}

export function CausacionResumenBadge({
  causado,
  numeroFp,
  compact = false,
}: {
  causado?: boolean;
  numeroFp?: string | null;
  compact?: boolean;
}) {
  const estado = causado === undefined ? "sin_registro" : causado ? "causado" : "no_causado";
  const tone = getCausacionEstadoTone(estado);
  return (
    <div className={cn("space-y-0.5", compact ? "text-center" : "")}>
      <Badge variant="outline" className={cn("gap-1", tone.badgeClass)}>
        {formatCausacionEstadoLabel(estado)}
      </Badge>
      {!compact ? (
        <p className="text-[11px] text-slate-500">{formatFpDisplay(causado ?? null, numeroFp)}</p>
      ) : null}
    </div>
  );
}

export function CausacionReembolsoCounts({
  causadas = 0,
  noCausadas = 0,
  sinRegistro = 0,
}: {
  causadas?: number;
  noCausadas?: number;
  sinRegistro?: number;
}) {
  if (causadas + noCausadas + sinRegistro === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 text-[10px] font-medium">
      {causadas > 0 ? (
        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-800">
          {causadas} causada{causadas === 1 ? "" : "s"}
        </span>
      ) : null}
      {noCausadas > 0 ? (
        <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-800">
          {noCausadas} no causada{noCausadas === 1 ? "" : "s"}
        </span>
      ) : null}
      {sinRegistro > 0 ? (
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-600">
          {sinRegistro} sin registro
        </span>
      ) : null}
    </div>
  );
}
