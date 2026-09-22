"use client";

import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronsUpDown,
  History,
  Loader2,
  Sparkles,
  UserRound,
  UsersRound,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ProveedorOrigenInline } from "@/app/(default)/finance/advances/components/proveedor-manual-status";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import type {
  AnticipoManagementContext,
  AnticipoModalItem,
  AnticipoOwnerCandidate,
  AnticipoOwnerSelectionInput,
  AnticipoReversionConflict,
  LegalizacionDetalleItem,
} from "../lib/anticipo-management";
import {
  getPreferredAnticipoOwnerSelectionKey,
  needsAnticipoOwnerSelection,
} from "../lib/anticipo-management";
import { formatCurrency, formatDate } from "../lib/utils";
import { getFacturacionErrorMessage } from "../lib/user-facing-error";
import type { BuzonTarea } from "./buzon-row";

type AnticipoDialogTarget = {
  facturaId: Id<"facturacionFacturas">;
  asignacionId?: Id<"facturacionAsignaciones"> | null;
  titulo?: string;
  subtitulo?: string;
  moneda?: string;
};

export function BuzonAnticipoLegalizacionDialog({
  tarea,
  facturaTarget,
  triggerRef,
  onClose,
  onOwnerChanged,
}: {
  tarea?: BuzonTarea | null;
  facturaTarget?: AnticipoDialogTarget | null;
  triggerRef?: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  onOwnerChanged?: () => void;
}) {
  const target = useMemo<AnticipoDialogTarget | null>(() => {
    if (facturaTarget) return facturaTarget;
    if (!tarea?.facturaId) return null;
    return {
      facturaId: tarea.facturaId,
      asignacionId: tarea.asignacionId,
      titulo: tarea.factura
        ? `${tarea.factura.proveedorNombre} · Factura #${tarea.factura.numeroFactura}`
        : undefined,
      moneda: tarea.factura?.moneda ?? "COP",
    };
  }, [facturaTarget, tarea]);

  const [context, setContext] = useState<AnticipoManagementContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewOwnerSelection, setPreviewOwnerSelection] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Array<Id<"anticipos">>>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isChangingOwner, setIsChangingOwner] = useState(false);
  const [ownerComment, setOwnerComment] = useState("");
  const [showOwnerSelector, setShowOwnerSelector] = useState(false);
  const [pendingOwnerSelection, setPendingOwnerSelection] = useState<string | null>(null);
  const [ownerPickerOpen, setOwnerPickerOpen] = useState(false);
  const [ownerSearch, setOwnerSearch] = useState("");
  const [reversionConflict, setReversionConflict] = useState<AnticipoReversionConflict | null>(
    null
  );
  const successRegionRef = useRef<HTMLDivElement>(null);

  const loadContext = useCallback(
    async (ownerSelection?: string | null, preserveContent = false) => {
      if (!target) return;
      if (preserveContent) setPreviewLoading(true);
      else setLoading(true);
      try {
        const params = new URLSearchParams();
        if (target.asignacionId) params.set("asignacionId", String(target.asignacionId));
        if (ownerSelection) params.set("ownerSelection", ownerSelection);
        const query = params.toString();
        const response = await fetch(
          `/api/billing/facturas/${target.facturaId}/anticipo${query ? `?${query}` : ""}`,
          { cache: "no-store" }
        );
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error ?? "No se pudo cargar el contexto de anticipo.");
        }
        setContext(payload as AnticipoManagementContext);
      } catch (error) {
        toast.error(
          getFacturacionErrorMessage(error, "No pudimos cargar los anticipos. Intenta nuevamente.")
        );
        if (!preserveContent) setContext(null);
      } finally {
        if (preserveContent) setPreviewLoading(false);
        else setLoading(false);
      }
    },
    [target]
  );

  useEffect(() => {
    if (!target) {
      setContext(null);
      setSelectedIds([]);
      setPendingOwnerSelection(null);
      setPreviewOwnerSelection(null);
      setShowOwnerSelector(false);
      setOwnerPickerOpen(false);
      setOwnerSearch("");
      setOwnerComment("");
      return;
    }
    setContext(null);
    setPendingOwnerSelection(null);
    setPreviewOwnerSelection(null);
    setShowOwnerSelector(false);
    setOwnerPickerOpen(false);
    setOwnerSearch("");
    setOwnerComment("");
    void loadContext(null);
  }, [target, loadContext]);

  useEffect(() => {
    if (!context) {
      setSelectedIds([]);
      return;
    }
    if (context.puedeCruzar && context.legalizaciones.length > 0) {
      setSelectedIds(
        context.legalizaciones.map(
          (legalizacion: LegalizacionDetalleItem) => legalizacion.anticipoId
        )
      );
      return;
    }
    setSelectedIds([]);
  }, [context]);

  useEffect(() => {
    if (!context || context.facturaMarcada || !context.puedeCambiarResponsable) return;
    if (context.requiereSeleccionResponsable) {
      setShowOwnerSelector(true);
    }
  }, [context]);

  const preferredOwnerSelectionKey = useMemo(
    () => (context ? getPreferredAnticipoOwnerSelectionKey(context) : null),
    [context]
  );
  const moneda = target?.moneda ?? "COP";
  const canCross = context?.puedeCruzar === true;
  const canManageOwner = context?.puedeCambiarResponsable === true;
  const isLeaderPhase = context?.fase === "revision_lider";
  const isReadOnlyCross = Boolean(context?.conflictoBolsaLider);
  const canEditCross = canCross && !isReadOnlyCross;
  const needsOwnerFirst = Boolean(context && needsAnticipoOwnerSelection(context));

  useEffect(() => {
    if (!context || !needsOwnerFirst || !preferredOwnerSelectionKey) return;
    setPendingOwnerSelection((current) => current ?? preferredOwnerSelectionKey);
    setPreviewOwnerSelection((current) => current ?? preferredOwnerSelectionKey);
  }, [context, needsOwnerFirst, preferredOwnerSelectionKey]);

  useEffect(() => {
    if (!target || !previewOwnerSelection) return;
    void loadContext(previewOwnerSelection, true);
  }, [target, previewOwnerSelection, loadContext]);

  const anticipos = useMemo(
    () => (context?.anticipos ?? []) as AnticipoModalItem[],
    [context?.anticipos]
  );
  const legalizacionesDetalle = useMemo(
    () => (context?.legalizaciones ?? []) as LegalizacionDetalleItem[],
    [context?.legalizaciones]
  );
  const filteredOwnerCandidates = useMemo(() => {
    const candidates = context?.candidatos ?? [];
    const search = normalizeOwnerSearch(ownerSearch);
    if (!search) return candidates.slice(0, 80);
    return candidates
      .filter((candidate) =>
        normalizeOwnerSearch(
          [
            candidate.liderNombre,
            candidate.liderEmail,
            candidate.procesoNombre,
            candidate.procesoId,
          ]
            .filter((value) => value !== undefined)
            .join(" ")
        ).includes(search)
      )
      .slice(0, 80);
  }, [context?.candidatos, ownerSearch]);
  const valorLegalizable = context?.totales.valorFactura ?? 0;
  const resumenContable = context?.resumenContable;
  const baseCero = (resumenContable?.baseCruceAnticipos ?? valorLegalizable) <= 0.001;

  const allocations = useMemo(() => {
    let remaining = Math.max(0, valorLegalizable);
    return selectedIds
      .map((id) => anticipos.find((anticipo) => anticipo._id === id))
      .filter((anticipo): anticipo is AnticipoModalItem => Boolean(anticipo))
      .map((anticipo) => {
        const valorAplicado = Math.min(remaining, Math.max(0, anticipo.disponibleParaFactura));
        remaining = Math.max(0, remaining - valorAplicado);
        return { anticipo, valorAplicado };
      });
  }, [anticipos, selectedIds, valorLegalizable]);

  const valorAplicado = allocations.reduce((total, item) => total + item.valorAplicado, 0);
  const valorAplicadoVista = canEditCross
    ? valorAplicado
    : (context?.totales.valorAplicadoFactura ?? 0);
  const pendienteDisponible = anticipos.reduce(
    (total, anticipo) => total + anticipo.disponibleParaFactura,
    0
  );
  const diferenciaNoCubierta = Math.max(valorLegalizable - valorAplicadoVista, 0);
  const expectedBolsaId = context?.bolsaVista?.bolsaId;
  const selectedOwnerCandidate = context?.candidatos.find(
    (candidate) => candidate.selectionKey === pendingOwnerSelection
  );
  const ownerSelectionChanged = Boolean(selectedOwnerCandidate && !selectedOwnerCandidate.esActual);
  const historicalCandidates = filteredOwnerCandidates.filter(
    (candidate) => candidate.source === "historial"
  );
  const directoryCandidates = filteredOwnerCandidates.filter(
    (candidate) => candidate.source === "directorio_empresa"
  );
  const selectedOwnerSelection = buildOwnerSelectionInput(selectedOwnerCandidate);

  function toggleAnticipo(id: Id<"anticipos">) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }

  async function persistOwnerChange(confirmReversion: boolean) {
    if (!target || !context?.asignacionActivaId || !pendingOwnerSelection) return;
    const candidate = context.candidatos.find((row) => row.selectionKey === pendingOwnerSelection);
    if (!candidate) {
      toast.error("El líder seleccionado ya no está disponible.");
      return;
    }
    const ownerSelection = buildOwnerSelectionInput(candidate);
    if (!ownerSelection) {
      toast.error("La selección del líder no es válida.");
      return;
    }
    setIsChangingOwner(true);
    try {
      const response = await fetch(`/api/billing/facturas/${target.facturaId}/anticipo`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asignacionId: context.asignacionActivaId,
          ownerSelection,
          comentario: ownerComment.trim() || undefined,
          confirmarReversionCruces: confirmReversion,
          expectedLegalizacionIds: context.crucesActivos.ids,
        }),
      });
      const payload = await response.json();
      if (response.status === 409 && payload.code === "CONFIRMAR_REVERSION_CRUCES") {
        setReversionConflict(payload as AnticipoReversionConflict);
        return;
      }
      if (!response.ok) {
        throw new Error(payload.error ?? "No se pudo cambiar el dueño del anticipo.");
      }
      toast.success("Dueño del anticipo actualizado.");
      successRegionRef.current?.focus();
      setReversionConflict(null);
      setShowOwnerSelector(false);
      setPendingOwnerSelection(null);
      setPreviewOwnerSelection(null);
      setOwnerPickerOpen(false);
      setOwnerSearch("");
      setOwnerComment("");
      setSelectedIds([]);
      onOwnerChanged?.();
      await loadContext(null);
    } catch (error) {
      toast.error(
        getFacturacionErrorMessage(error, "No se pudo cambiar el responsable. Intenta nuevamente.")
      );
    } finally {
      setIsChangingOwner(false);
    }
  }

  async function handleSaveCross() {
    if (!target || !context?.asignacionActivaId || !expectedBolsaId || !canEditCross) return;
    if (selectedIds.length === 0) {
      toast.error("Selecciona al menos un anticipo para cruzar.");
      return;
    }
    if (needsOwnerFirst && !selectedOwnerSelection) {
      toast.error("Selecciona el responsable para marcar la factura como anticipo.");
      return;
    }
    const ownerSelection =
      !context.facturaMarcada && selectedOwnerSelection ? selectedOwnerSelection : undefined;
    setIsSaving(true);
    try {
      const response = await fetch(`/api/billing/facturas/${target.facturaId}/anticipo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asignacionId: context.asignacionActivaId,
          anticipoIds: selectedIds,
          expectedBolsaId,
          ...(ownerSelection ? { ownerSelection } : {}),
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "No se pudo guardar el cruce.");
      }
      toast.success("Cruce de anticipos guardado.");
      handleClose();
    } catch (error) {
      toast.error(
        getFacturacionErrorMessage(
          error,
          "No se pudo guardar el cruce. Revisa los valores e intenta nuevamente."
        )
      );
    } finally {
      setIsSaving(false);
    }
  }

  function handleClose() {
    setOwnerPickerOpen(false);
    setOwnerSearch("");
    setPendingOwnerSelection(null);
    setPreviewOwnerSelection(null);
    setOwnerComment("");
    setShowOwnerSelector(false);
    triggerRef?.current?.focus();
    onClose();
  }

  const duenoNombre =
    selectedOwnerCandidate?.liderNombre ??
    context?.duenoActual?.liderNombre ??
    context?.candidatos.find((row) => row.esActual)?.liderNombre ??
    "Sin dueño";
  const duenoProceso =
    selectedOwnerCandidate?.procesoNombre ??
    context?.duenoActual?.procesoNombre ??
    context?.bolsaVista?.procesoNombre ??
    "Sin proceso";
  const bolsaLabel = context?.bolsaVista
    ? `${duenoProceso}${context.bolsaVista.procesoId ? ` · Proceso #${context.bolsaVista.procesoId}` : ""}`
    : duenoProceso;

  return (
    <>
      <Dialog open={Boolean(target)} onOpenChange={(open) => !open && handleClose()}>
        <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 [&>button]:h-11 [&>button]:w-11 sm:max-w-5xl">
          <div className="border-b border-slate-100 px-6 py-5">
            <DialogHeader className="p-0">
              <DialogTitle className="flex items-center gap-2 text-base font-semibold">
                <Sparkles className="h-4 w-4 text-amber-500" />
                {isLeaderPhase
                  ? "Cruce de anticipos"
                  : canEditCross || canManageOwner
                    ? "Dueño y cruce de anticipos"
                    : "Detalle de anticipos"}
              </DialogTitle>
              <DialogDescription>
                {target?.titulo ??
                  (isLeaderPhase
                    ? "Cruza anticipos de tu bolsa asignada."
                    : canEditCross
                      ? "Selecciona el responsable de la bolsa y cruza sus anticipos."
                      : "Consulta el dueño y cruce asociados a esta factura.")}
              </DialogDescription>
            </DialogHeader>
          </div>

          <div
            ref={successRegionRef}
            tabIndex={-1}
            className="min-h-0 flex-1 overflow-y-auto px-6 py-5 outline-none"
            aria-live="polite"
          >
            {loading || !context ? (
              <div className="space-y-4">
                <div className="h-24 animate-pulse rounded-xl bg-slate-100" />
                <div className="h-40 animate-pulse rounded-xl bg-slate-100" />
              </div>
            ) : (
              <div className="space-y-5">
                <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <div className="flex flex-wrap items-start justify-between gap-4 p-5">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
                        <UserRound className="h-5 w-5" />
                      </span>
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-slate-900">
                          Responsable de la bolsa
                        </h3>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-slate-800">{duenoNombre}</span>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                            {bolsaLabel}
                          </span>
                        </div>
                        <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-600">
                          {isLeaderPhase
                            ? context.origenBolsa === "lider_asignado"
                              ? "Tu bolsa asignada define qué anticipos puedes consultar y cruzar."
                              : "El responsable original de la bolsa se conserva aunque la revisión esté contigo."
                            : "Este responsable define qué bolsa se consulta para el cruce. La asignación actual de la factura no cambia."}
                        </p>
                        {context.conflictoBolsaLider ? (
                          <p className="mt-2 flex max-w-2xl items-start gap-2 text-xs font-medium text-amber-800">
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            Esta factura tiene cruces de otra bolsa. Solo puedes consultarlos o
                            cerrar y usar Desmarcar para revertirlos.
                          </p>
                        ) : null}
                        {isLeaderPhase &&
                        context.origenBolsa === "responsable_guardado" &&
                        canEditCross ? (
                          <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-600">
                            Perteneces a la misma bolsa que el responsable original, así que puedes
                            editar el cruce conservando su registro.
                          </p>
                        ) : null}
                        {context.motivoBloqueoCruce && !canEditCross ? (
                          <p className="mt-2 flex max-w-2xl items-start gap-2 text-xs font-medium text-amber-800">
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            {context.motivoBloqueoCruce}
                          </p>
                        ) : null}
                        {context.duenoActual && !context.duenoActual.elegible ? (
                          <p className="mt-2 flex max-w-2xl items-start gap-2 text-xs font-medium text-amber-800">
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            El responsable guardado ya no está disponible entre los líderes activos
                            ni en el historial elegible. Selecciona uno nuevo.
                          </p>
                        ) : null}
                      </div>
                    </div>
                    {canManageOwner ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="h-10 bg-white"
                        aria-expanded={showOwnerSelector}
                        onClick={() => {
                          setShowOwnerSelector((prev) => !prev);
                          setOwnerSearch("");
                        }}
                      >
                        {showOwnerSelector ? "Ocultar cambio" : "Cambiar responsable"}
                        <ChevronDown
                          className={cn(
                            "h-4 w-4 transition-transform duration-200 motion-reduce:transition-none",
                            showOwnerSelector && "rotate-180"
                          )}
                        />
                      </Button>
                    ) : context.motivoBloqueo ? (
                      <p className="max-w-xs text-xs leading-5 text-slate-600">
                        {context.motivoBloqueo}
                      </p>
                    ) : null}
                  </div>

                  {showOwnerSelector && canManageOwner ? (
                    <div className="border-t border-slate-200 bg-slate-50/70 p-5">
                      {needsOwnerFirst ? (
                        <div className="mb-4 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
                          <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
                          Selecciona el responsable para marcar la factura como anticipo y consultar
                          la bolsa correcta.
                        </div>
                      ) : null}

                      {context.candidatos.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-5 text-sm text-slate-600">
                          No encontramos líderes activos con proceso configurado ni líderes válidos
                          en el historial de esta factura.
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="space-y-1.5">
                            <Label htmlFor="anticipo-owner-select">Responsable de la bolsa</Label>
                            <Popover
                              open={ownerPickerOpen}
                              onOpenChange={(open) => {
                                setOwnerPickerOpen(open);
                                if (!open) setOwnerSearch("");
                              }}
                            >
                              <PopoverTrigger asChild>
                                <Button
                                  id="anticipo-owner-select"
                                  type="button"
                                  variant="outline"
                                  role="combobox"
                                  aria-expanded={ownerPickerOpen}
                                  className="h-auto min-h-11 w-full justify-between bg-white px-3 py-2.5 text-left font-normal"
                                >
                                  {selectedOwnerCandidate ? (
                                    <span className="flex min-w-0 items-center gap-3">
                                      <OwnerAvatar candidate={selectedOwnerCandidate} />
                                      <span className="min-w-0">
                                        <span className="block truncate text-sm font-medium text-slate-900">
                                          {selectedOwnerCandidate.liderNombre}
                                        </span>
                                        <span className="block truncate text-xs text-slate-500">
                                          {selectedOwnerCandidate.procesoNombre ??
                                            `Proceso #${selectedOwnerCandidate.procesoId}`}
                                        </span>
                                      </span>
                                    </span>
                                  ) : (
                                    <span className="text-slate-500">
                                      Buscar un líder por nombre o proceso
                                    </span>
                                  )}
                                  {previewLoading ? (
                                    <Loader2 className="ml-3 h-4 w-4 shrink-0 animate-spin text-slate-400" />
                                  ) : (
                                    <ChevronsUpDown className="ml-3 h-4 w-4 shrink-0 text-slate-400" />
                                  )}
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent
                                align="start"
                                className="w-(--radix-popover-trigger-width) p-0"
                              >
                                <Command shouldFilter={false}>
                                  <CommandInput
                                    value={ownerSearch}
                                    onValueChange={setOwnerSearch}
                                    placeholder="Buscar por nombre, correo o proceso…"
                                  />
                                  <CommandList className="max-h-[min(360px,var(--radix-popover-content-available-height))]">
                                    <CommandEmpty>
                                      No encontramos líderes para esta búsqueda.
                                    </CommandEmpty>
                                    {historicalCandidates.length > 0 ? (
                                      <CommandGroup heading="Participaron en esta factura">
                                        {historicalCandidates.map((candidate) => (
                                          <OwnerCandidateItem
                                            key={candidate.selectionKey}
                                            candidate={candidate}
                                            selected={
                                              candidate.selectionKey === pendingOwnerSelection
                                            }
                                            onSelect={() => {
                                              setPendingOwnerSelection(candidate.selectionKey);
                                              setPreviewOwnerSelection(candidate.selectionKey);
                                              setOwnerPickerOpen(false);
                                              setOwnerSearch("");
                                            }}
                                          />
                                        ))}
                                      </CommandGroup>
                                    ) : null}
                                    {directoryCandidates.length > 0 ? (
                                      <CommandGroup heading="Otros líderes activos de la empresa">
                                        {directoryCandidates.map((candidate) => (
                                          <OwnerCandidateItem
                                            key={candidate.selectionKey}
                                            candidate={candidate}
                                            selected={
                                              candidate.selectionKey === pendingOwnerSelection
                                            }
                                            onSelect={() => {
                                              setPendingOwnerSelection(candidate.selectionKey);
                                              setPreviewOwnerSelection(candidate.selectionKey);
                                              setOwnerPickerOpen(false);
                                              setOwnerSearch("");
                                            }}
                                          />
                                        ))}
                                      </CommandGroup>
                                    ) : null}
                                  </CommandList>
                                  <div className="border-t border-slate-100 bg-slate-50/80 px-3 py-2 text-xs text-slate-500">
                                    Primero mostramos el historial; también puedes elegir cualquier
                                    líder activo con proceso configurado.
                                  </div>
                                </Command>
                              </PopoverContent>
                            </Popover>
                          </div>

                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between gap-3">
                              <Label htmlFor="anticipo-owner-comment">Motivo del cambio</Label>
                              <span className="text-xs text-slate-500">Opcional</span>
                            </div>
                            <Textarea
                              id="anticipo-owner-comment"
                              value={ownerComment}
                              onChange={(event) => setOwnerComment(event.target.value)}
                              rows={3}
                              maxLength={500}
                              className="min-h-24 resize-none bg-white placeholder:text-slate-500"
                              placeholder="Ej. La factura regresó a causación y debe cruzarse con la bolsa de este proceso."
                            />
                            <p className="text-right text-xs tabular-nums text-slate-500">
                              {ownerComment.length}/500
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 pt-4">
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={() => {
                                setShowOwnerSelector(false);
                                setOwnerComment("");
                              }}
                            >
                              Cancelar
                            </Button>
                            <Button
                              type="button"
                              disabled={!ownerSelectionChanged || isChangingOwner || previewLoading}
                              onClick={() => void persistOwnerChange(false)}
                            >
                              {isChangingOwner ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <CheckCircle2 className="h-4 w-4" />
                              )}
                              {selectedOwnerCandidate?.esActual
                                ? "Responsable actual"
                                : "Guardar responsable"}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                ) : null}
              </section>

                {canCross || context.facturaMarcada || isReadOnlyCross ? (
                  <>
                    <div className="grid gap-3 md:grid-cols-5">
                      <MetricCard
                        label="Base para cruce de anticipos"
                        value={formatCurrency(
                          resumenContable?.baseCruceAnticipos ?? valorLegalizable,
                          moneda
                        )}
                        tone="slate"
                      />
                      {resumenContable ? (
                        <>
                          <MetricCard
                            label="Documentos internos"
                            value={formatCurrency(resumenContable.valorDocumentosInternos, moneda)}
                            tone="slate"
                          />
                          <MetricCard
                            label="Pagos aplicados"
                            value={formatCurrency(resumenContable.pagosAplicados, moneda)}
                            tone="slate"
                          />
                        </>
                      ) : null}
                      <MetricCard
                        label="Anticipos aplicados"
                        value={formatCurrency(
                          resumenContable?.valorAnticiposAplicados ??
                            context.totales.valorAplicadoFactura,
                          moneda
                        )}
                        tone="emerald"
                      />
                      <MetricCard
                        label="Valor a pagar"
                        value={formatCurrency(
                          resumenContable?.valorAPagar ?? diferenciaNoCubierta,
                          moneda
                        )}
                        tone={
                          (resumenContable?.valorAPagar ?? diferenciaNoCubierta) > 0
                            ? "rose"
                            : "emerald"
                        }
                      />
                    </div>

                    {baseCero && canEditCross ? (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                        La obligación ya está cubierta por documentos internos y/o pagos. No puedes
                        aplicar nuevos anticipos hasta liberar base.
                      </div>
                    ) : null}

                    <div className="rounded-xl border border-slate-200 bg-white">
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            {canEditCross
                              ? "Anticipos pendientes de la bolsa"
                              : "Anticipos relacionados a esta factura"}
                          </p>
                          <p className="text-xs text-slate-500">
                            Bolsa: {bolsaLabel} ·{" "}
                            {canEditCross ? "selección en orden de cruce" : "detalle guardado"}
                          </p>
                        </div>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                          {canEditCross
                            ? `${selectedIds.length} seleccionado(s)`
                            : `${legalizacionesDetalle.length} anticipo(s)`}
                        </span>
                      </div>

                      {canEditCross && anticipos.length === 0 ? (
                        <div className="px-4 py-8 text-center text-sm text-amber-800">
                          Dueño actualizado. Esta bolsa no tiene anticipos pendientes.
                        </div>
                      ) : canEditCross ? (
                        <AnticipoSelectionTable
                          anticipos={anticipos}
                          allocations={allocations}
                          selectedIds={selectedIds}
                          moneda={moneda}
                          disabled={isSaving}
                          onToggle={toggleAnticipo}
                        />
                      ) : legalizacionesDetalle.length === 0 ? (
                        <div className="px-4 py-8 text-center text-sm text-slate-500">
                          No hay legalizaciones de anticipo guardadas para esta factura.
                        </div>
                      ) : (
                        <LegalizacionReadonlyTable
                          legalizaciones={legalizacionesDetalle}
                          moneda={moneda}
                        />
                      )}
                    </div>
                  </>
                ) : null}
              </div>
            )}
          </div>

          <DialogFooter className="border-t border-slate-100 bg-slate-50 px-6 py-4">
            <Button variant="outline" onClick={handleClose} disabled={isSaving || isChangingOwner}>
              {canEditCross ? "Cancelar" : "Cerrar"}
            </Button>
            {canEditCross ? (
              <Button
                onClick={() => void handleSaveCross()}
                disabled={
                  isSaving ||
                  loading ||
                  !expectedBolsaId ||
                  selectedIds.length === 0 ||
                  anticipos.length === 0 ||
                  baseCero ||
                  (needsOwnerFirst && !selectedOwnerSelection)
                }
                className="gap-2"
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                {context?.facturaMarcada ? "Guardar cruce" : "Marcar anticipo y guardar cruce"}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(reversionConflict)} onOpenChange={() => setReversionConflict(null)}>
        <DialogContent className="[&>button]:h-11 [&>button]:w-11 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-700">
              <AlertTriangle className="h-5 w-5" />
              Confirmar reversión de cruces
            </DialogTitle>
            <DialogDescription>
              Cambiar de bolsa revertirá {reversionConflict?.cantidad ?? 0} cruce(s) por un total de{" "}
              {formatCurrency(reversionConflict?.valor ?? 0, moneda)}. Los anticipos recuperarán su
              saldo pendiente.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReversionConflict(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={isChangingOwner}
              onClick={() => void persistOwnerChange(true)}
            >
              {isChangingOwner ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar cambio"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function normalizeOwnerSearch(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function buildOwnerSelectionInput(
  candidate?: AnticipoOwnerCandidate | null
): AnticipoOwnerSelectionInput | null {
  if (!candidate) return null;
  if (candidate.source === "historial" && candidate.liderAsignacionId) {
    return {
      source: "historial",
      liderAsignacionId: candidate.liderAsignacionId,
    };
  }
  if (candidate.source === "directorio_empresa" && candidate.liderUserId) {
    return {
      source: "directorio_empresa",
      liderUserId: candidate.liderUserId,
    };
  }
  return null;
}

function getOwnerInitials(nombre: string) {
  return (
    nombre
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "L"
  );
}

function OwnerAvatar({ candidate }: { candidate: AnticipoOwnerCandidate }) {
  return (
    <span
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
        candidate.source === "historial" ? "bg-amber-100 text-amber-800" : "bg-sky-100 text-sky-700"
      )}
      aria-hidden="true"
    >
      {getOwnerInitials(candidate.liderNombre)}
    </span>
  );
}

function OwnerCandidateItem({
  candidate,
  selected,
  onSelect,
}: {
  candidate: AnticipoOwnerCandidate;
  selected: boolean;
  onSelect: () => void;
}) {
  const proceso =
    candidate.procesoNombre ??
    (candidate.procesoId !== undefined ? `Proceso #${candidate.procesoId}` : "Sin proceso");
  const sourceLabel =
    candidate.source === "historial"
      ? candidate.ultimaInteraccionEn
        ? `Participó ${formatDate(candidate.ultimaInteraccionEn)}`
        : "Participó en la factura"
      : "Líder activo de la empresa";

  return (
    <CommandItem
      value={candidate.selectionKey}
      onSelect={onSelect}
      className="items-center gap-3 py-2.5"
    >
      <OwnerAvatar candidate={candidate} />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium text-slate-900">
            {candidate.liderNombre}
          </span>
          {candidate.esActual ? (
            <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
              Actual
            </span>
          ) : null}
        </div>
        <p className="truncate text-xs text-slate-600">{proceso}</p>
        <p className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-slate-500">
          {candidate.source === "historial" ? (
            <History className="h-3 w-3 shrink-0" />
          ) : (
            <UsersRound className="h-3 w-3 shrink-0" />
          )}
          {sourceLabel}
        </p>
      </div>
      <Check
        className={cn("h-4 w-4 shrink-0 text-primary", selected ? "opacity-100" : "opacity-0")}
      />
    </CommandItem>
  );
}

function AnticipoSelectionTable({
  anticipos,
  allocations,
  selectedIds,
  moneda,
  disabled,
  onToggle,
}: {
  anticipos: AnticipoModalItem[];
  allocations: Array<{ anticipo: AnticipoModalItem; valorAplicado: number }>;
  selectedIds: Id<"anticipos">[];
  moneda: string;
  disabled: boolean;
  onToggle: (id: Id<"anticipos">) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">Cruzar</th>
            <th className="px-4 py-3">Anticipo</th>
            <th className="px-4 py-3 text-right">Solicitado</th>
            <th className="px-4 py-3 text-right">Legalizado</th>
            <th className="px-4 py-3 text-right">Disponible</th>
            <th className="px-4 py-3 text-right">Aplicará</th>
            <th className="px-4 py-3">Fecha máx.</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {anticipos.map((anticipo) => {
            const checked = selectedIds.includes(anticipo._id);
            const allocation =
              allocations.find((item) => item.anticipo._id === anticipo._id)?.valorAplicado ?? 0;
            return (
              <tr key={anticipo._id} className={checked ? "bg-amber-50/40" : "bg-white"}>
                <td className="px-4 py-3">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => onToggle(anticipo._id)}
                    disabled={disabled}
                    aria-label={`Seleccionar anticipo ${anticipo.consecutivo}`}
                  />
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-slate-900">
                      #{anticipo.consecutivo} · {anticipo.razonSocial}
                    </p>
                    <ProveedorOrigenInline origen={anticipo.proveedorOrigen} />
                  </div>
                  <p className="text-xs text-slate-500">
                    NIT {anticipo.nit} · {anticipo.faseActual}
                  </p>
                </td>
                <td className="px-4 py-3 text-right font-medium tabular-nums">
                  {formatCurrency(anticipo.valorNumerico, moneda)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                  {formatCurrency(anticipo.valorLegalizado, moneda)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                  {formatCurrency(anticipo.disponibleParaFactura, moneda)}
                </td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums text-emerald-700">
                  {formatCurrency(allocation, moneda)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                  {formatDate(anticipo.maxLegalizacionDate)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function LegalizacionReadonlyTable({
  legalizaciones,
  moneda,
}: {
  legalizaciones: LegalizacionDetalleItem[];
  moneda: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">Anticipo</th>
            <th className="px-4 py-3 text-right">Aplicado</th>
            <th className="px-4 py-3">Líder</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {legalizaciones.map((legalizacion) => (
            <tr key={legalizacion._id}>
              <td className="px-4 py-3">
                <p className="font-semibold text-slate-900">
                  {legalizacion.anticipo
                    ? `#${legalizacion.anticipo.consecutivo} · ${legalizacion.anticipo.razonSocial}`
                    : String(legalizacion.anticipoId)}
                </p>
              </td>
              <td className="px-4 py-3 text-right font-semibold text-emerald-700">
                {formatCurrency(legalizacion.valorAplicado, moneda)}
              </td>
              <td className="px-4 py-3 text-slate-600">{legalizacion.liderNombre}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "slate" | "amber" | "emerald" | "indigo" | "rose";
}) {
  const styles = {
    slate: "border-slate-200 bg-slate-50 text-slate-900",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-900",
    indigo: "border-indigo-200 bg-indigo-50 text-indigo-900",
    rose: "border-rose-200 bg-rose-50 text-rose-900",
  }[tone];

  return (
    <div className={`rounded-xl border px-4 py-3 ${styles}`}>
      <p className="text-[10px] font-black uppercase tracking-wide opacity-70">{label}</p>
      <p className="mt-1 text-sm font-black tabular-nums">{value}</p>
    </div>
  );
}
