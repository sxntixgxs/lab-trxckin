"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ArrowRightLeft, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatCOP } from "@/lib/format";

export type ReembolsoReasignarTarget = {
  _id: Id<"cajasMenoresReembolsos">;
  numeroReembolso?: string;
  valorTotal: number;
  movimientoIds: string[];
  reviewAssignedUserId?: string;
  reviewAssignedNombre?: string;
  contadorAsignadoUserId?: string;
  contadorAsignadoNombre?: string;
  eventosDianAsignadoUserId?: string;
  eventosDianAsignadoNombre?: string;
};

export type ReembolsoReasignarMode = "revision" | "contabilidad" | "eventos_dian";

type DestinoOption = {
  usuarioId: string;
  nombre: string;
  email: string;
  peso?: number;
};

const MODE_META: Record<
  ReembolsoReasignarMode,
  {
    title: string;
    description: string;
    label: string;
    placeholder: string;
  }
> = {
  revision: {
    title: "Mover solicitud de revisión",
    description:
      "Reasigna esta solicitud a otro Revisor Caja Menor. El revisor actual dejará de verla en su cola.",
    label: "Nuevo revisor",
    placeholder: "Seleccionar revisor...",
  },
  contabilidad: {
    title: "Mover solicitud de Contabilidad",
    description:
      "Reasigna esta solicitud a otro contador de Impuestos/Contabilidad. El contador actual dejará de verla en su cola.",
    label: "Nuevo contador",
    placeholder: "Seleccionar contador...",
  },
  eventos_dian: {
    title: "Mover solicitud de Eventos DIAN",
    description:
      "Reasigna esta solicitud a otro responsable de Eventos DIAN. El responsable actual dejará de verla en su cola.",
    label: "Nuevo responsable",
    placeholder: "Seleccionar responsable...",
  },
};

export function ReembolsoReasignarDialog({
  mode,
  reembolso,
  empresaId,
  actor,
  open,
  onOpenChange,
}: {
  mode: ReembolsoReasignarMode;
  reembolso: ReembolsoReasignarTarget | null;
  empresaId?: number;
  actor: {
    actorUserId: string;
    actorNombre: string;
    actorEmail: string;
    actorRol?: number;
  };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const meta = MODE_META[mode];
  const asignadoActualUserId =
    mode === "revision"
      ? reembolso?.reviewAssignedUserId
      : mode === "contabilidad"
        ? reembolso?.contadorAsignadoUserId
        : reembolso?.eventosDianAsignadoUserId;
  const asignadoActualNombre =
    mode === "revision"
      ? reembolso?.reviewAssignedNombre
      : mode === "contabilidad"
        ? reembolso?.contadorAsignadoNombre
        : reembolso?.eventosDianAsignadoNombre;

  const reasignarRevisor = useMutation(
    api.cajasMenores.reasignarRevisorReembolsoCajaMenor,
  );
  const reasignarContador = useMutation(
    api.cajasMenores.reasignarContadorReembolsoCajaMenor,
  );
  const reasignarEventosDian = useMutation(
    api.cajasMenores.reasignarEventosDianReembolsoCajaMenor,
  );

  const revisores = useQuery(
    api.cajasMenores.listarRevisoresCajaMenorConfigurados,
    mode === "revision" && empresaId !== undefined ? { empresa: empresaId } : "skip",
  );
  const contadores = useQuery(
    api.cajasMenores.listarContadoresImpuestosConfigurados,
    mode === "contabilidad" && empresaId !== undefined ? { empresa: empresaId } : "skip",
  );
  const eventosDianUsuarios = useQuery(
    api.cajasMenores.listarEventosDianConfigurados,
    mode === "eventos_dian" && empresaId !== undefined ? { empresa: empresaId } : "skip",
  );

  const [destinoUserId, setDestinoUserId] = useState("");
  const [comentario, setComentario] = useState("");
  const [loading, setLoading] = useState(false);

  const opciones = useMemo((): DestinoOption[] => {
    const list: DestinoOption[] =
      mode === "revision"
        ? (revisores ?? [])
        : mode === "contabilidad"
          ? (contadores ?? [])
          : (eventosDianUsuarios ?? []);
    return list.filter((opcion) => opcion.usuarioId !== asignadoActualUserId);
  }, [mode, revisores, contadores, eventosDianUsuarios, asignadoActualUserId]);

  useEffect(() => {
    if (!open) {
      setDestinoUserId("");
      setComentario("");
      return;
    }
    if (opciones.length === 1) {
      setDestinoUserId(opciones[0]!.usuarioId);
    }
  }, [open, opciones]);

  async function handleSubmit() {
    if (!reembolso) return;
    if (!destinoUserId) {
      toast.error(
        mode === "revision"
          ? "Selecciona el revisor destino."
          : mode === "contabilidad"
            ? "Selecciona el contador destino."
            : "Selecciona el responsable de Eventos DIAN.",
      );
      return;
    }
    if (!comentario.trim()) {
      toast.error("Indica el motivo de la reasignación.");
      return;
    }

    setLoading(true);
    try {
      if (mode === "revision") {
        await reasignarRevisor({
          reembolsoId: reembolso._id,
          revisorUserId: destinoUserId,
          comentario: comentario.trim(),
          ...actor,
        });
      } else if (mode === "contabilidad") {
        await reasignarContador({
          reembolsoId: reembolso._id,
          contadorUserId: destinoUserId,
          comentario: comentario.trim(),
          ...actor,
        });
      } else {
        await reasignarEventosDian({
          reembolsoId: reembolso._id,
          eventosDianUserId: destinoUserId,
          comentario: comentario.trim(),
          ...actor,
        });
      }
      toast.success("Reembolso reasignado correctamente.");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo reasignar.");
    } finally {
      setLoading(false);
    }
  }

  const destino = opciones.find((opcion) => opcion.usuarioId === destinoUserId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-0 overflow-hidden p-0">
        <div className="border-b border-slate-200 bg-slate-50/80 px-5 py-3.5">
          <DialogHeader className="space-y-1 text-left">
            <DialogTitle className="text-base">{meta.title}</DialogTitle>
            <DialogDescription className="text-xs">{meta.description}</DialogDescription>
          </DialogHeader>
          {reembolso ? (
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600">
              {reembolso.numeroReembolso ? (
                <span className="font-medium text-teal-700">
                  {reembolso.numeroReembolso}
                </span>
              ) : null}
              <span className="font-semibold tabular-nums text-slate-900">
                {formatCOP(reembolso.valorTotal)}
              </span>
              <span>· {reembolso.movimientoIds.length} factura(s)</span>
            </div>
          ) : null}
        </div>

        <div className="space-y-4 px-5 py-4">
          {asignadoActualNombre ? (
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
              Asignado actualmente a{" "}
              <span className="font-semibold text-slate-900">{asignadoActualNombre}</span>
            </p>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="reasignar-destino">{meta.label}</Label>
            <Select value={destinoUserId} onValueChange={setDestinoUserId}>
              <SelectTrigger id="reasignar-destino" className="rounded-lg">
                <SelectValue placeholder={meta.placeholder} />
              </SelectTrigger>
              <SelectContent>
                {opciones.map((opcion) => (
                  <SelectItem key={opcion.usuarioId} value={opcion.usuarioId}>
                    {opcion.nombre}
                    {opcion.peso === 0 ? " (0%)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="comentario-reasignacion">Comentario</Label>
            <Textarea
              id="comentario-reasignacion"
              value={comentario}
              onChange={(event) => setComentario(event.target.value)}
              placeholder="Motivo de la reasignación..."
              className="min-h-24 rounded-lg"
            />
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <p>
              {mode === "revision"
                ? "El revisor actual"
                : mode === "contabilidad"
                  ? "El contador actual"
                  : "El responsable actual"}{" "}
              perderá acceso inmediato
              {destino ? (
                <>
                  {" "}
                  y la solicitud quedará con{" "}
                  <span className="font-semibold">{destino.nombre}</span>
                </>
              ) : null}
              . Esta acción queda registrada en el historial.
            </p>
          </div>
        </div>

        <DialogFooter className="border-t border-slate-200 bg-white px-5 py-3">
          <Button
            type="button"
            variant="outline"
            className="rounded-lg"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            className="rounded-lg"
            onClick={() => void handleSubmit()}
            disabled={loading || opciones.length === 0}
          >
            <ArrowRightLeft className="mr-2 h-4 w-4" aria-hidden />
            Confirmar reasignación
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
