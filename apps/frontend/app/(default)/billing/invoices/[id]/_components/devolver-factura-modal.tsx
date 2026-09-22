"use client";

import { Check, ChevronsUpDown, Loader2, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { FACTURACION_STATUS_LABELS } from "../../../components/status-badge";
import type { DevolucionContexto } from "../../../lib/devolucion-factura";
import { getFacturacionErrorMessage } from "../../../lib/user-facing-error";

type CandidatoDevolucion = NonNullable<
  DevolucionContexto["destinos"][number]["candidatos"]
>[number];

const MAX_RESULTADOS = 50;

function normalizarTexto(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function inicialesDe(nombre: string) {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return `${partes[0][0]}${partes[partes.length - 1][0]}`.toUpperCase();
}

function formatearNombre(nombre: string) {
  return nombre.toLowerCase().replace(/(^|\s|\.)\p{L}/gu, (character) => character.toUpperCase());
}

function filtrarCandidatos(candidatos: CandidatoDevolucion[], query: string) {
  const tokens = normalizarTexto(query.trim()).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return candidatos.slice(0, MAX_RESULTADOS);

  return candidatos
    .map((candidato) => {
      const nombre = normalizarTexto(candidato.nombre);
      const palabrasNombre = nombre.split(/\s+/).filter(Boolean);
      const email = normalizarTexto(candidato.email);
      let score = 0;

      for (const token of tokens) {
        if (palabrasNombre.some((palabra) => palabra === token)) score += 4;
        else if (palabrasNombre.some((palabra) => palabra.startsWith(token))) score += 3;
        else if (nombre.includes(token)) score += 2;
        else if (email.includes(token)) score += 1;
        else return null;
      }

      if (nombre.startsWith(tokens[0])) score += 2;
      return { candidato, nombre, score };
    })
    .filter(
      (
        resultado
      ): resultado is {
        candidato: CandidatoDevolucion;
        nombre: string;
        score: number;
      } => resultado !== null
    )
    .sort((left, right) => right.score - left.score || left.nombre.localeCompare(right.nombre))
    .slice(0, MAX_RESULTADOS)
    .map(({ candidato }) => candidato);
}

type DevolverFacturaModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  facturaId: Id<"facturacionFacturas">;
  numeroFactura: string;
};

export function DevolverFacturaModal({
  open,
  onOpenChange,
  facturaId,
  numeroFactura,
}: DevolverFacturaModalProps) {
  const [contexto, setContexto] = useState<DevolucionContexto | null>(null);
  const [loadingContexto, setLoadingContexto] = useState(false);
  const [contextoError, setContextoError] = useState<string | null>(null);
  const [faseDestino, setFaseDestino] = useState<string>("");
  const [responsableId, setResponsableId] = useState<string>("");
  const [responsableOpen, setResponsableOpen] = useState(false);
  const [responsableSearch, setResponsableSearch] = useState("");
  const [comentario, setComentario] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const responsableSearchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setContexto(null);
      setContextoError(null);
      setFaseDestino("");
      setResponsableId("");
      setResponsableOpen(false);
      setResponsableSearch("");
      setComentario("");
      setConfirmOpen(false);
      return;
    }

    let cancelled = false;
    setLoadingContexto(true);
    setContextoError(null);

    void fetch(`/api/billing/facturas/${facturaId}/devolucion`)
      .then(async (response) => {
        const payload = (await response.json()) as DevolucionContexto & { error?: string };
        if (!response.ok) {
          throw new Error(payload.error ?? "No se pudo cargar el contexto de devolución.");
        }
        if (!cancelled) {
          setContexto(payload);
          setFaseDestino(payload.destinos[0]?.fase ?? "");
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setContextoError(
            getFacturacionErrorMessage(
              error,
              "No se pudo cargar la información de devolución. Intenta nuevamente.",
            ),
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingContexto(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, facturaId]);

  useEffect(() => {
    if (!responsableOpen) return;
    const frame = requestAnimationFrame(() => responsableSearchRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [responsableOpen]);

  const destinoSeleccionado = useMemo(
    () => contexto?.destinos.find((destino) => destino.fase === faseDestino) ?? null,
    [contexto, faseDestino]
  );

  const responsableLabel = useMemo(() => {
    if (!destinoSeleccionado) return null;
    if (destinoSeleccionado.fase === "recepcion") {
      const count = destinoSeleccionado.candidatos?.length ?? 0;
      return count > 1
        ? `Se asignará a ${count} usuarios de recepción configurados.`
        : destinoSeleccionado.responsableHistorico
          ? `${destinoSeleccionado.responsableHistorico.nombre} · ${destinoSeleccionado.responsableHistorico.email}`
          : destinoSeleccionado.candidatos?.[0]
            ? `${destinoSeleccionado.candidatos[0].nombre} · ${destinoSeleccionado.candidatos[0].email}`
            : "Recepción configurada";
    }
    if (destinoSeleccionado.responsableHistorico) {
      const responsable = destinoSeleccionado.responsableHistorico;
      return `${responsable.nombre} · ${responsable.email}`;
    }
    return null;
  }, [destinoSeleccionado]);

  const candidatosResponsable = destinoSeleccionado?.candidatos ?? [];
  const responsableSeleccionado = useMemo(
    () =>
      candidatosResponsable.find(
        (candidato) => (candidato.usuarioId ?? candidato.email) === responsableId
      ) ?? null,
    [candidatosResponsable, responsableId]
  );
  const candidatosFiltrados = useMemo(
    () => filtrarCandidatos(candidatosResponsable, responsableSearch),
    [candidatosResponsable, responsableSearch]
  );

  const canContinue =
    Boolean(destinoSeleccionado) &&
    comentario.trim().length > 0 &&
    (!destinoSeleccionado?.requiereSeleccionResponsable || Boolean(responsableId));

  async function ejecutarDevolucion() {
    if (!destinoSeleccionado || !contexto) return;

    setSubmitting(true);
    try {
      const response = await fetch(`/api/billing/facturas/${facturaId}/devolucion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          faseDestino: destinoSeleccionado.fase,
          comentario: comentario.trim(),
          ...(destinoSeleccionado.requiereSeleccionResponsable ? { responsableId } : {}),
          ...(contexto.asignacionId ? { asignacionId: contexto.asignacionId } : {}),
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "No se pudo devolver la factura.");
      }

      toast.success("Factura devuelta correctamente.");
      setConfirmOpen(false);
      onOpenChange(false);
    } catch (error) {
      toast.error(
        getFacturacionErrorMessage(
          error,
          "No se pudo devolver la factura. Revisa la información e intenta nuevamente.",
        ),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Devolver factura</DialogTitle>
            <DialogDescription>
              Factura {numeroFactura}. La devolución reabrirá el flujo y reasignará la factura al
              destino seleccionado. Los pagos, comprobantes, legalizaciones y demás registros
              financieros se conservarán.
            </DialogDescription>
          </DialogHeader>

          {loadingContexto ? (
            <div className="flex items-center justify-center py-10 text-sm text-slate-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Cargando opciones de devolución…
            </div>
          ) : contextoError ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {contextoError}
            </div>
          ) : contexto ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Estado actual
                </p>
                <p className="mt-1 text-sm font-medium text-slate-900">
                  {FACTURACION_STATUS_LABELS[contexto.estadoActual] ?? contexto.estadoActual}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="devolver-fase-destino">Fase destino</Label>
                <Select
                  value={faseDestino}
                  onValueChange={(value) => {
                    setFaseDestino(value);
                    setResponsableId("");
                    setResponsableOpen(false);
                    setResponsableSearch("");
                  }}
                >
                  <SelectTrigger id="devolver-fase-destino">
                    <SelectValue placeholder="Selecciona una fase" />
                  </SelectTrigger>
                  <SelectContent>
                    {contexto.destinos.map((destino) => (
                      <SelectItem key={destino.fase} value={destino.fase}>
                        {destino.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {destinoSeleccionado?.requiereSeleccionResponsable ? (
                <div className="space-y-2">
                  <Label htmlFor="devolver-responsable">Responsable</Label>
                  <Popover
                    open={responsableOpen}
                    onOpenChange={(nextOpen) => {
                      setResponsableOpen(nextOpen);
                      if (!nextOpen) setResponsableSearch("");
                    }}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        id="devolver-responsable"
                        type="button"
                        variant="outline"
                        role="combobox"
                        aria-expanded={responsableOpen}
                        className="w-full justify-between text-left font-normal"
                      >
                        <span className="truncate">
                          {responsableSeleccionado
                            ? `${formatearNombre(responsableSeleccionado.nombre)} · ${responsableSeleccionado.email}`
                            : "Buscar un responsable"}
                        </span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="start"
                      className="w-[var(--radix-popover-trigger-width)] p-0"
                    >
                      <Command shouldFilter={false}>
                        <CommandInput
                          ref={responsableSearchRef}
                          value={responsableSearch}
                          onValueChange={setResponsableSearch}
                          placeholder="Buscar por nombre o correo…"
                        />
                        <CommandList className="max-h-[min(60vh,420px)]">
                          <CommandEmpty>
                            No se encontraron responsables para «{responsableSearch}».
                          </CommandEmpty>
                          <CommandGroup>
                            {candidatosFiltrados.map((candidato) => {
                              const candidatoId = candidato.usuarioId ?? candidato.email;
                              return (
                                <CommandItem
                                  key={candidatoId}
                                  value={candidatoId}
                                  onSelect={() => {
                                    setResponsableId(candidatoId);
                                    setResponsableOpen(false);
                                    setResponsableSearch("");
                                  }}
                                  className="items-center gap-3 py-2.5"
                                >
                                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-100 text-xs font-semibold text-sky-700">
                                    {inicialesDe(candidato.nombre)}
                                  </span>
                                  <div className="min-w-0 flex-1">
                                    <div className="truncate text-sm font-medium">
                                      {formatearNombre(candidato.nombre)}
                                    </div>
                                    <div className="truncate text-xs text-slate-500">
                                      {candidato.email}
                                    </div>
                                  </div>
                                  <Check
                                    className={cn(
                                      "h-4 w-4 shrink-0",
                                      responsableId === candidatoId ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                </CommandItem>
                              );
                            })}
                          </CommandGroup>
                          {candidatosFiltrados.length === MAX_RESULTADOS ? (
                            <div className="border-t border-slate-100 px-3 py-2 text-center text-[11px] text-slate-400">
                              Mostrando los primeros {MAX_RESULTADOS} resultados — refina la
                              búsqueda para ver más.
                            </div>
                          ) : null}
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
              ) : responsableLabel ? (
                <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Responsable
                  </p>
                  <p className="mt-1 text-sm text-slate-700">{responsableLabel}</p>
                </div>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="devolver-comentario">Observación</Label>
                <Textarea
                  id="devolver-comentario"
                  value={comentario}
                  onChange={(event) => setComentario(event.target.value)}
                  placeholder="Motivo de la devolución (obligatorio)"
                  rows={4}
                />
              </div>
            </div>
          ) : null}

          <DialogFooter className="gap-2 sm:gap-0">
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
              className="bg-amber-600 text-white hover:bg-amber-700"
              disabled={!canContinue || submitting || loadingContexto || Boolean(contextoError)}
              onClick={() => setConfirmOpen(true)}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Continuar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar devolución</AlertDialogTitle>
            <AlertDialogDescription>
              Se devolverá la factura {numeroFactura} desde{" "}
              {contexto
                ? (FACTURACION_STATUS_LABELS[contexto.estadoActual] ?? contexto.estadoActual)
                : "su estado actual"}{" "}
              hacia {destinoSeleccionado?.label ?? "la fase seleccionada"}. El flujo se reabrirá y
              los registros financieros existentes permanecerán intactos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {comentario.trim() ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              {comentario.trim()}
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Volver</AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-600 text-white hover:bg-amber-700"
              disabled={submitting}
              onClick={(event) => {
                event.preventDefault();
                void ejecutarDevolucion();
              }}
            >
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Confirmar devolución
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
