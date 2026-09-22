"use client";

import { ChevronDown, ChevronRight, Loader2, Undo2 } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { formatCOP } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  FacturaCausacionPanel,
  type FacturaCausacionDraft,
} from "@/components/facturacion/factura-causacion-panel";

import {
  type PersistentStageAttachment,
  ReembolsoStageAttachments,
} from "../../reembolso-stage-attachments";
import { ReembolsoTimeline, type ReembolsoTimelineEvento } from "../../reembolso-timeline";

export type DecisionFase =
  | "pendiente_aprobacion_lider"
  | "pendiente_revision"
  | "pendiente_revision_impuestos"
  | "pendiente_eventos_dian"
  | "pendiente_aprobacion"
  | "pendiente_pago_tesoreria";

export type ContadorOption = {
  usuarioId: string;
  nombre: string;
  email: string;
};

export type DestinoDevolucionGerencia = "contabilidad" | "revision" | "eventos_dian";
export type DestinoAprobacionRevision = "contabilidad" | "gerencia";
export type DestinoAprobacionImpuestos = "eventos_dian" | "gerencia";
export type RetornoGerenciaPendienteEn = "revision" | "contabilidad";

const FASE_META: Record<
  DecisionFase,
  {
    title: string;
    approveLabel: string;
    rejectLabel: string;
    faseDestino: string;
    accent: string;
    approveClass: string;
  }
> = {
  pendiente_aprobacion_lider: {
    title: "Aprobación líder",
    approveLabel: "Aprobar",
    rejectLabel: "Rechazar",
    faseDestino: "Revisor Caja Menor",
    accent: "border-amber-100 bg-amber-50/40",
    approveClass: "bg-amber-600 hover:bg-amber-700",
  },
  pendiente_revision: {
    title: "Revisión Caja Menor",
    approveLabel: "Enviar a Contabilidad",
    rejectLabel: "Rechazar",
    faseDestino: "Impuestos/Contabilidad",
    accent: "border-teal-100 bg-teal-50/40",
    approveClass: "bg-teal-700 hover:bg-teal-800",
  },
  pendiente_revision_impuestos: {
    title: "Impuestos/Contabilidad",
    approveLabel: "Enviar a Eventos DIAN",
    rejectLabel: "Rechazar",
    faseDestino: "Eventos DIAN",
    accent: "border-sky-100 bg-sky-50/40",
    approveClass: "bg-sky-700 hover:bg-sky-800",
  },
  pendiente_eventos_dian: {
    title: "Eventos DIAN",
    approveLabel: "Enviar a Gerencia Financiera",
    rejectLabel: "Rechazar",
    faseDestino: "Gerencia Financiera",
    accent: "border-teal-100 bg-teal-50/40",
    approveClass: "bg-teal-700 hover:bg-teal-800",
  },
  pendiente_aprobacion: {
    title: "Gerencia Financiera",
    approveLabel: "Aprobar",
    rejectLabel: "Rechazar",
    faseDestino: "Tesorería",
    accent: "border-amber-100 bg-amber-50/40",
    approveClass: "bg-amber-600 hover:bg-amber-700",
  },
  pendiente_pago_tesoreria: {
    title: "Pago Tesorería",
    approveLabel: "Confirmar pago",
    rejectLabel: "Rechazar",
    faseDestino: "Completado",
    accent: "border-sky-100 bg-sky-50/40",
    approveClass: "bg-sky-600 hover:bg-sky-700",
  },
};

type SaltoFasesConsecutivasMeta = {
  destino: "eventos_dian" | "gerencia";
  fasesSaltadas: Array<"contabilidad" | "eventos_dian">;
  requiereSeleccionEventosDian: boolean;
  motivo: "roles_consecutivos";
};

export function usaRutaSaltoFasesRevisionEnReembolso(options: {
  usaSaltoFases?: boolean;
  saltoFasesConsecutivas?: SaltoFasesConsecutivasMeta | null;
  permiteReenvioDirectoGerencia?: boolean;
}) {
  return Boolean(
    options.usaSaltoFases &&
      options.saltoFasesConsecutivas &&
      !options.permiteReenvioDirectoGerencia,
  );
}

function getFaseMeta(
  fase: DecisionFase,
  options?: {
    esReenvioContabilidad?: boolean;
    destinoAprobacionRevision?: DestinoAprobacionRevision;
    destinoAprobacionImpuestos?: DestinoAprobacionImpuestos;
    retornoGerenciaPendienteEn?: RetornoGerenciaPendienteEn;
    permiteReenvioDirectoGerencia?: boolean;
    usaSaltoFases?: boolean;
    saltoFasesConsecutivas?: SaltoFasesConsecutivasMeta | null;
  }
) {
  const base = FASE_META[fase];
  if (fase === "pendiente_revision" && options?.esReenvioContabilidad) {
    return { ...base, approveLabel: "Reenviar a Contabilidad" };
  }

  if (
    (fase === "pendiente_revision" || fase === "pendiente_revision_impuestos") &&
    options?.usaSaltoFases &&
    options?.saltoFasesConsecutivas &&
    !options?.permiteReenvioDirectoGerencia &&
    options?.retornoGerenciaPendienteEn !== "contabilidad"
  ) {
    if (options.saltoFasesConsecutivas.destino === "gerencia") {
      return {
        ...base,
        approveLabel: "Enviar a Gerencia Financiera",
        faseDestino: "Gerencia Financiera",
        approveClass: "bg-amber-600 hover:bg-amber-700",
      };
    }
    return {
      ...base,
      approveLabel: "Enviar a Eventos DIAN",
      faseDestino: "Eventos DIAN",
    };
  }

  if (
    fase === "pendiente_revision" &&
    options?.permiteReenvioDirectoGerencia &&
    options?.destinoAprobacionRevision === "gerencia"
  ) {
    return {
      ...base,
      approveLabel: "Enviar a Gerencia Financiera",
      faseDestino: "Gerencia Financiera",
      approveClass: "bg-amber-600 hover:bg-amber-700",
    };
  }
  if (
    fase === "pendiente_revision_impuestos" &&
    options?.retornoGerenciaPendienteEn === "contabilidad" &&
    options?.destinoAprobacionImpuestos === "gerencia"
  ) {
    return {
      ...base,
      approveLabel: "Enviar a Gerencia Financiera",
      faseDestino: "Gerencia Financiera",
      approveClass: "bg-amber-600 hover:bg-amber-700",
    };
  }
  return base;
}

export function ReembolsoDecisionPanel({
  fase,
  reembolsoId,
  actor,
  facturaCount,
  valorTotal,
  timeline,
  historialExtras,
  comentario,
  onComentarioChange,
  adjuntos,
  onAttachmentsBusyChange,
  onViewAttachment,
  busy,
  onApprove,
  onReject,
  onDevolver,
  onCancel,
  stacked = false,
  esReenvioContabilidad,
  contadores,
  contadorUserId,
  onContadorChange,
  requiereContador,
  contadorPrevioNombre,
  destinoDevolucionGerencia,
  onDestinoDevolucionGerenciaChange,
  responsablesDestino,
  responsablesLoading,
  responsableDestinoUserId,
  onResponsableDestinoChange,
  responsableDestinoLabel,
  destinoAprobacionRevision,
  onDestinoAprobacionRevisionChange,
  permiteReenvioDirectoGerencia,
  retornoGerenciaPendienteEn,
  destinoAprobacionImpuestos,
  onDestinoAprobacionImpuestosChange,
  eventosDian,
  eventosDianUserId,
  onEventosDianChange,
  requiereEventosDian,
  devolverContadorUserId,
  onDevolverContadorChange,
  requiereContadorDevolucion,
  contadorPrevioNombreDevolucion,
  saltoFasesConsecutivas,
  usaSaltoFases = true,
  onUsaSaltoFasesChange,
  causacionFacturaId,
  causacionMovimientoId,
  causacionNumeroFactura,
  onCausacionDirtyChange,
  causacionDraft,
  onCausacionDraftChange,
}: {
  fase: DecisionFase;
  reembolsoId: Id<"cajasMenoresReembolsos">;
  actor: {
    actorUserId: string;
    actorNombre: string;
    actorEmail: string;
    actorRol?: number;
  };
  facturaCount: number;
  valorTotal: number;
  timeline: ReembolsoTimelineEvento[];
  historialExtras?: ReactNode;
  comentario: string;
  onComentarioChange: (value: string) => void;
  adjuntos: PersistentStageAttachment[];
  onAttachmentsBusyChange?: (busy: boolean) => void;
  onViewAttachment: (attachmentId: Id<"cajasMenoresReembolsoAdjuntos">) => void;
  busy?: boolean;
  onApprove: () => void;
  onReject: () => void;
  onDevolver?: () => void;
  onCancel: () => void;
  /** When true, panel flows in a parent scroll area (e.g. above valor contable editor). */
  stacked?: boolean;
  esReenvioContabilidad?: boolean;
  contadores?: ContadorOption[];
  contadorUserId?: string;
  onContadorChange?: (usuarioId: string) => void;
  requiereContador?: boolean;
  contadorPrevioNombre?: string;
  destinoDevolucionGerencia?: DestinoDevolucionGerencia;
  onDestinoDevolucionGerenciaChange?: (destino: DestinoDevolucionGerencia) => void;
  responsablesDestino?: ContadorOption[];
  responsablesLoading?: boolean;
  responsableDestinoUserId?: string;
  onResponsableDestinoChange?: (usuarioId: string) => void;
  responsableDestinoLabel?: string;
  destinoAprobacionRevision?: DestinoAprobacionRevision;
  onDestinoAprobacionRevisionChange?: (destino: DestinoAprobacionRevision) => void;
  permiteReenvioDirectoGerencia?: boolean;
  retornoGerenciaPendienteEn?: RetornoGerenciaPendienteEn;
  destinoAprobacionImpuestos?: DestinoAprobacionImpuestos;
  onDestinoAprobacionImpuestosChange?: (destino: DestinoAprobacionImpuestos) => void;
  eventosDian?: ContadorOption[];
  eventosDianUserId?: string;
  onEventosDianChange?: (usuarioId: string) => void;
  requiereEventosDian?: boolean;
  devolverContadorUserId?: string;
  onDevolverContadorChange?: (usuarioId: string) => void;
  requiereContadorDevolucion?: boolean;
  contadorPrevioNombreDevolucion?: string;
  saltoFasesConsecutivas?: {
    destino: "eventos_dian" | "gerencia";
    fasesSaltadas: Array<"contabilidad" | "eventos_dian">;
    requiereSeleccionEventosDian: boolean;
    motivo: "roles_consecutivos";
  } | null;
  usaSaltoFases?: boolean;
  onUsaSaltoFasesChange?: (value: boolean) => void;
  causacionFacturaId?: Id<"facturacionFacturas">;
  causacionMovimientoId?: Id<"facturacionCajaMenorMovimientos">;
  causacionNumeroFactura?: string;
  onCausacionDirtyChange?: (dirty: boolean) => void;
  causacionDraft?: FacturaCausacionDraft;
  onCausacionDraftChange?: (draft: FacturaCausacionDraft) => void;
}) {
  const meta = getFaseMeta(fase, {
    esReenvioContabilidad,
    destinoAprobacionRevision,
    destinoAprobacionImpuestos,
    retornoGerenciaPendienteEn,
    permiteReenvioDirectoGerencia,
    usaSaltoFases,
    saltoFasesConsecutivas,
  });
  const isTesoreria = fase === "pendiente_pago_tesoreria";
  const isLider = fase === "pendiente_aprobacion_lider";
  const isRevision = fase === "pendiente_revision";
  const isContabilidad = fase === "pendiente_revision_impuestos";
  const isEventosDian = fase === "pendiente_eventos_dian";
  const isGerencia = fase === "pendiente_aprobacion";
  const [historyOpen, setHistoryOpen] = useState(false);
  const [devolverGerenciaAbierto, setDevolverGerenciaAbierto] = useState(false);
  const [devolverEventosDianAbierto, setDevolverEventosDianAbierto] = useState(false);
  const lastEvent = timeline[0] ?? null;

  const returnMode = (isGerencia && devolverGerenciaAbierto) || (isEventosDian && devolverEventosDianAbierto);

  const enviaAContabilidad =
    !permiteReenvioDirectoGerencia || destinoAprobacionRevision === "contabilidad";
  const usaRutaSaltoRevision = usaRutaSaltoFasesRevisionEnReembolso({
    usaSaltoFases,
    saltoFasesConsecutivas,
    permiteReenvioDirectoGerencia,
  });
  const bloqueadoPorContador =
    isRevision &&
    enviaAContabilidad &&
    !usaRutaSaltoRevision &&
    Boolean(requiereContador) &&
    !contadorUserId;

  const enviaAEventosDian =
    !retornoGerenciaPendienteEn ||
    retornoGerenciaPendienteEn !== "contabilidad" ||
    destinoAprobacionImpuestos !== "gerencia";
  const bloqueadoPorEventosDian =
    ((isContabilidad && enviaAEventosDian) ||
      (isRevision && usaSaltoFases && Boolean(requiereEventosDian))) &&
    !eventosDianUserId;

  const bloqueadoPorContadorDevolucion =
    isEventosDian &&
    devolverEventosDianAbierto &&
    Boolean(requiereContadorDevolucion) &&
    !devolverContadorUserId;

  const {
    faltantes: faltantesDevolucion,
    mensaje: faltanText,
    disabled: devolverGerenciaDisabled,
  } = getDevolucionGerenciaValidation({
    destino: destinoDevolucionGerencia,
    responsableUserId: responsableDestinoUserId,
    comentario,
    loading: responsablesLoading,
    busy,
  });
  const approveDisabled =
    busy ||
    (isTesoreria && adjuntos.length === 0) ||
    bloqueadoPorContador ||
    bloqueadoPorEventosDian ||
    bloqueadoPorContadorDevolucion;

  // biome-ignore lint/correctness/useExhaustiveDependencies: focus the first missing control only when the return composer opens, not on every field change.
  useEffect(() => {
    if (!returnMode) return;
    const raf = requestAnimationFrame(() => {
      const targetId = !destinoDevolucionGerencia
        ? "reembolso-destino-devolucion"
        : !responsableDestinoUserId
          ? "reembolso-responsable-devolucion"
          : "reembolso-decision-comment";
      document.getElementById(targetId)?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [returnMode]);

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col",
        stacked ? "min-h-min" : "h-full",
      )}
    >
      <div className={cn("shrink-0 space-y-2 border-b px-4 py-3", meta.accent)}>
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-slate-950">{meta.title}</p>
          <Badge variant="outline" className="tabular-nums">
            {facturaCount} factura{facturaCount === 1 ? "" : "s"}
          </Badge>
        </div>
        <p className="text-xs text-slate-600">
          Decisión global sobre el reembolso completo ·{" "}
          <span className="font-semibold tabular-nums text-slate-900">
            {formatCOP(valorTotal)}
          </span>
        </p>
        {lastEvent ? (
          <p className="truncate text-[11px] text-slate-500">
            Última actividad: {lastEvent.titulo}
            {lastEvent.usuarioNombre ? ` · ${lastEvent.usuarioNombre}` : ""}
          </p>
        ) : null}
      </div>

      <div
        className={cn(
          "space-y-3 px-4 py-3",
          stacked ? "min-h-0" : "min-h-0 flex-1 overflow-y-auto",
        )}
      >
        <button
          type="button"
          className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-semibold text-slate-700"
          onClick={() => setHistoryOpen((open) => !open)}
        >
          Historial ({timeline.length})
          {historyOpen ? (
            <ChevronDown className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          )}
        </button>
        {historyOpen ? (
          <div className="rounded-lg border border-slate-200 bg-white p-2">
            <ReembolsoTimeline eventos={timeline} />
            {historialExtras}
          </div>
        ) : null}

        {(isRevision || isContabilidad) &&
        saltoFasesConsecutivas &&
        !permiteReenvioDirectoGerencia &&
        retornoGerenciaPendienteEn !== "contabilidad" ? (
          <div className="space-y-1.5">
            <Label htmlFor="reembolso-ruta-salto" className="text-xs">
              Ruta de envío
            </Label>
            <Select
              value={usaSaltoFases ? "salto" : "normal"}
              onValueChange={(value) => onUsaSaltoFasesChange?.(value === "salto")}
            >
              <SelectTrigger
                id="reembolso-ruta-salto"
                className="rounded-lg text-sm"
                disabled={busy}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="salto">
                  {saltoFasesConsecutivas.destino === "gerencia"
                    ? "Enviar a Gerencia Financiera"
                    : "Enviar a Eventos DIAN"}
                </SelectItem>
                <SelectItem value="normal">
                  {isRevision
                    ? "Enviar a Impuestos/Contabilidad"
                    : "Enviar a Eventos DIAN"}
                </SelectItem>
              </SelectContent>
            </Select>
            {usaSaltoFases ? (
              <p className="text-[11px] text-slate-500">
                {saltoFasesConsecutivas.fasesSaltadas.includes("contabilidad") &&
                saltoFasesConsecutivas.fasesSaltadas.includes("eventos_dian")
                  ? "Contabilidad y Eventos DIAN se completarán automáticamente con tu usuario."
                  : saltoFasesConsecutivas.fasesSaltadas.includes("contabilidad")
                    ? "Contabilidad se completará automáticamente con tu usuario."
                    : "Eventos DIAN se completará automáticamente con tu usuario."}
              </p>
            ) : null}
          </div>
        ) : null}

        {isRevision && permiteReenvioDirectoGerencia ? (
          <div className="space-y-1.5">
            <Label htmlFor="reembolso-destino-envio" className="text-xs">
              Destino del envío
            </Label>
            <Select
              value={destinoAprobacionRevision ?? "gerencia"}
              onValueChange={(value) =>
                onDestinoAprobacionRevisionChange?.(value as DestinoAprobacionRevision)
              }
            >
              <SelectTrigger
                id="reembolso-destino-envio"
                className="rounded-lg text-sm"
                disabled={busy}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="gerencia">Gerencia Financiera</SelectItem>
                <SelectItem value="contabilidad">Impuestos/Contabilidad</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ) : null}

        {isRevision && enviaAContabilidad && !usaRutaSaltoRevision ? (
          contadores && contadores.length > 0 ? (
          <div className="space-y-1.5">
            <Label htmlFor="reembolso-contador-destino" className="text-xs">
              Contador Impuestos/Contabilidad {requiereContador ? "(obligatorio)" : "(opcional)"}
            </Label>
            <Select
              value={contadorUserId ?? ""}
              onValueChange={(value) => onContadorChange?.(value)}
            >
              <SelectTrigger
                id="reembolso-contador-destino"
                className="rounded-lg text-sm"
                disabled={busy}
              >
                <SelectValue placeholder="Seleccionar contador..." />
              </SelectTrigger>
              <SelectContent>
                {contadores.map((contador) => (
                  <SelectItem key={contador.usuarioId} value={contador.usuarioId}>
                    {contador.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!requiereContador && contadorPrevioNombre ? (
              <p className="text-[11px] text-slate-500">
                Se reenviará a{" "}
                <span className="font-medium text-slate-700">{contadorPrevioNombre}</span> salvo que
                selecciones otro contador.
              </p>
            ) : null}
          </div>
          ) : (
            <p className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-[11px] text-amber-800">
              No hay contadores de Impuestos/Contabilidad configurados para esta empresa. Configúralos
              en Facturación → Configuración.
            </p>
          )
        ) : null}

        {isContabilidad && retornoGerenciaPendienteEn === "contabilidad" ? (
          <div className="space-y-1.5">
            <Label htmlFor="reembolso-destino-impuestos" className="text-xs">
              Destino del envío
            </Label>
            <Select
              value={destinoAprobacionImpuestos ?? "eventos_dian"}
              onValueChange={(value) =>
                onDestinoAprobacionImpuestosChange?.(value as DestinoAprobacionImpuestos)
              }
            >
              <SelectTrigger
                id="reembolso-destino-impuestos"
                className="rounded-lg text-sm"
                disabled={busy}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="eventos_dian">Eventos DIAN</SelectItem>
                <SelectItem value="gerencia">Gerencia Financiera</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ) : null}

        {(isContabilidad && enviaAEventosDian) ||
        (isRevision && usaSaltoFases && requiereEventosDian) ? (
          eventosDian && eventosDian.length > 0 ? (
            <div className="space-y-1.5">
              <Label htmlFor="reembolso-eventos-dian-destino" className="text-xs">
                Responsable Eventos DIAN {requiereEventosDian ? "(obligatorio)" : "(opcional)"}
              </Label>
              <Select
                value={eventosDianUserId ?? ""}
                onValueChange={(value) => onEventosDianChange?.(value)}
              >
                <SelectTrigger
                  id="reembolso-eventos-dian-destino"
                  className="rounded-lg text-sm"
                  disabled={busy}
                >
                  <SelectValue placeholder="Seleccionar responsable..." />
                </SelectTrigger>
                <SelectContent>
                  {eventosDian.map((persona) => (
                    <SelectItem key={persona.usuarioId} value={persona.usuarioId}>
                      {persona.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <p className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-[11px] text-amber-800">
              No hay usuarios de Eventos DIAN configurados para esta empresa. Configúralos en
              Facturación → Configuración.
            </p>
          )
        ) : null}

        {returnMode && isGerencia ? (
          <div className="space-y-3">
            <div className="space-y-1">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                <Undo2 className="h-4 w-4 text-amber-600" aria-hidden />
                Devolver reembolso
              </p>
              <p className="text-xs text-slate-500">
                El reembolso y sus movimientos siguen agrupados. Elige a qué etapa y responsable
                regresa para aplicar las correcciones.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="reembolso-destino-devolucion" className="text-xs">
                Etapa de destino (obligatorio)
              </Label>
              <Select
                value={destinoDevolucionGerencia ?? ""}
                onValueChange={(value) =>
                  onDestinoDevolucionGerenciaChange?.(value as DestinoDevolucionGerencia)
                }
              >
                <SelectTrigger
                  id="reembolso-destino-devolucion"
                  className="w-full rounded-lg text-sm"
                  disabled={busy}
                >
                  <SelectValue placeholder="Seleccionar etapa..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="contabilidad">Impuestos/Contabilidad</SelectItem>
                  <SelectItem value="eventos_dian">Eventos DIAN</SelectItem>
                  <SelectItem value="revision">Revisor Caja Menor</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="reembolso-responsable-devolucion" className="text-xs">
                {responsableDestinoLabel ?? "Responsable"} (obligatorio)
              </Label>
              {!destinoDevolucionGerencia ? (
                <p className="rounded-lg border border-dashed border-slate-200 px-3 py-2 text-[11px] text-slate-500">
                  Selecciona primero la etapa de destino.
                </p>
              ) : responsablesLoading ? (
                <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-[11px] text-slate-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  Cargando responsables…
                </div>
              ) : !responsablesDestino || responsablesDestino.length === 0 ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-[11px] text-amber-800">
                  No hay usuarios configurados para {responsableDestinoLabel ?? "esta etapa"}.
                  Configúralos en la administración de Facturación o elige otra etapa de destino.
                </p>
              ) : (
                <Select
                  value={responsableDestinoUserId ?? ""}
                  onValueChange={(value) => onResponsableDestinoChange?.(value)}
                >
                  <SelectTrigger
                    id="reembolso-responsable-devolucion"
                    className="w-full rounded-lg text-sm"
                    disabled={busy}
                  >
                    <SelectValue placeholder="Seleccionar responsable..." />
                  </SelectTrigger>
                  <SelectContent>
                    {responsablesDestino.map((persona) => (
                      <SelectItem key={persona.usuarioId} value={persona.usuarioId}>
                        {persona.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
        ) : null}

        {returnMode && isEventosDian ? (
          <div className="space-y-3">
            <div className="space-y-1">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                <Undo2 className="h-4 w-4 text-amber-600" aria-hidden />
                Devolver reembolso
              </p>
              <p className="text-xs text-slate-500">
                El reembolso regresa a Impuestos/Contabilidad para aplicar las correcciones
                indicadas.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="reembolso-contador-devolucion-eventos" className="text-xs">
                Contador Impuestos/Contabilidad{" "}
                {requiereContadorDevolucion ? "(obligatorio)" : "(opcional)"}
              </Label>
              {contadores && contadores.length > 0 ? (
                <>
                  <Select
                    value={devolverContadorUserId ?? ""}
                    onValueChange={(value) => onDevolverContadorChange?.(value)}
                  >
                    <SelectTrigger
                      id="reembolso-contador-devolucion-eventos"
                      className="rounded-lg text-sm"
                      disabled={busy}
                    >
                      <SelectValue placeholder="Seleccionar contador..." />
                    </SelectTrigger>
                    <SelectContent>
                      {contadores.map((contador) => (
                        <SelectItem key={contador.usuarioId} value={contador.usuarioId}>
                          {contador.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!requiereContadorDevolucion && contadorPrevioNombreDevolucion ? (
                    <p className="text-[11px] text-slate-500">
                      Se reenviará a{" "}
                      <span className="font-medium text-slate-700">
                        {contadorPrevioNombreDevolucion}
                      </span>{" "}
                      salvo que selecciones otro contador.
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-[11px] text-amber-800">
                  No hay contadores configurados para Impuestos/Contabilidad.
                </p>
              )}
            </div>
          </div>
        ) : null}

        <div className="space-y-1.5">
          <Label htmlFor="reembolso-decision-comment" className="text-xs">
            {returnMode
              ? "Motivo de devolución (obligatorio)"
              : `Comentario ${
                  isTesoreria
                    ? "(opcional)"
                    : isContabilidad || isEventosDian || isGerencia
                      ? "(obligatorio para rechazar o devolver)"
                      : "(obligatorio para rechazar)"
                }`}
          </Label>
          <Textarea
            id="reembolso-decision-comment"
            rows={3}
            className="resize-y text-sm"
            value={comentario}
            disabled={busy}
            onChange={(event) => onComentarioChange(event.target.value)}
            placeholder={
              returnMode
                ? "Describe las correcciones necesarias antes de reenviar el reembolso."
                : isTesoreria
                  ? "Referencia bancaria u observaciones del pago"
                  : "Observaciones para la siguiente etapa"
            }
          />
        </div>

        {causacionFacturaId && causacionMovimientoId ? (
          <FacturaCausacionPanel
            key={`${causacionFacturaId}:${causacionMovimientoId}`}
            facturaId={causacionFacturaId}
            numeroFactura={causacionNumeroFactura}
            contexto={{
              tipo: "reembolso_caja_menor",
              reembolsoId,
              movimientoId: causacionMovimientoId,
            }}
            compact
            draft={causacionDraft}
            onDraftChange={onCausacionDraftChange}
            onDirtyChange={onCausacionDirtyChange}
          />
        ) : null}

        {!isLider ? (
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              {isTesoreria ? "Comprobante de pago" : "Soportes de esta decisión"}
            </p>
            <ReembolsoStageAttachments
              reembolsoId={reembolsoId}
              actor={actor}
              label={isTesoreria ? "Comprobante de pago" : "Soportes adjuntos"}
              description={
                isTesoreria
                  ? "Obligatorio: un comprobante de transferencia o pago."
                  : "Opcional: archivos añadidos en esta etapa (aparte de los soportes de cada factura)."
              }
              required={isTesoreria}
              disabled={busy}
              attachments={adjuntos}
              maxFiles={isTesoreria ? 1 : undefined}
              emptyLabel={
                isTesoreria ? "Arrastra el comprobante de pago o usa Examinar" : undefined
              }
              onBusyChange={onAttachmentsBusyChange}
              onView={onViewAttachment}
            />
          </div>
        ) : null}
      </div>

      <div className="shrink-0 space-y-2 border-t border-slate-200 bg-white px-4 py-3">
        {returnMode ? (
          <>
            <p className="text-[11px] font-medium text-slate-500">
              Devolución del reembolso completo
              {isGerencia && destinoDevolucionGerencia
                ? ` → ${
                    destinoDevolucionGerencia === "contabilidad"
                      ? "Impuestos/Contabilidad"
                      : destinoDevolucionGerencia === "eventos_dian"
                        ? "Eventos DIAN"
                        : "Revisor Caja Menor"
                  }`
                : isEventosDian
                  ? " → Impuestos/Contabilidad"
                  : ""}
            </p>
            {isGerencia && faltantesDevolucion.length > 0 ? (
              <p className="text-[11px] text-amber-700">Falta: {faltanText}.</p>
            ) : null}
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-lg"
                disabled={busy}
                onClick={() => {
                  if (isGerencia) setDevolverGerenciaAbierto(false);
                  if (isEventosDian) setDevolverEventosDianAbierto(false);
                }}
              >
                Cancelar devolución
              </Button>
              <Button
                type="button"
                size="sm"
                className="rounded-lg bg-amber-600 text-white hover:bg-amber-700"
                disabled={isGerencia ? devolverGerenciaDisabled : approveDisabled}
                onClick={() => onDevolver?.()}
              >
                <Undo2 className="mr-2 h-4 w-4" aria-hidden />
                Revisar devolución
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-[11px] font-medium text-slate-500">
              Acciones del reembolso completo
              {isTesoreria ? "" : ` → ${meta.faseDestino}`}
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-lg"
                disabled={busy}
                onClick={onCancel}
              >
                Cancelar
              </Button>
              {!isTesoreria ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-lg border-rose-200 text-rose-700 hover:bg-rose-50"
                  disabled={busy}
                  onClick={onReject}
                >
                  {meta.rejectLabel}
                </Button>
              ) : null}
              {isContabilidad && onDevolver ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-lg border-amber-200 text-amber-700 hover:bg-amber-50"
                  disabled={busy}
                  onClick={onDevolver}
                >
                  <Undo2 className="mr-2 h-4 w-4" aria-hidden />
                  Devolver a Revisor Caja Menor
                </Button>
              ) : null}
              {isEventosDian && onDevolver ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-lg border-amber-200 text-amber-700 hover:bg-amber-50"
                  disabled={busy}
                  onClick={() => setDevolverEventosDianAbierto(true)}
                >
                  <Undo2 className="mr-2 h-4 w-4" aria-hidden />
                  Devolver a Contabilidad
                </Button>
              ) : null}
              {isGerencia && onDevolver ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-lg border-amber-200 text-amber-700 hover:bg-amber-50"
                  disabled={busy}
                  onClick={() => setDevolverGerenciaAbierto(true)}
                >
                  <Undo2 className="mr-2 h-4 w-4" aria-hidden />
                  Devolver
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                className={cn("rounded-lg text-white", meta.approveClass)}
                disabled={approveDisabled}
                onClick={onApprove}
              >
                {meta.approveLabel}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function getFaseDestinoLabel(
  fase: DecisionFase,
  options?: {
    esReenvioContabilidad?: boolean;
    destinoAprobacionRevision?: DestinoAprobacionRevision;
    destinoAprobacionImpuestos?: DestinoAprobacionImpuestos;
    retornoGerenciaPendienteEn?: RetornoGerenciaPendienteEn;
    permiteReenvioDirectoGerencia?: boolean;
    usaSaltoFases?: boolean;
    saltoFasesConsecutivas?: SaltoFasesConsecutivasMeta | null;
  }
) {
  return getFaseMeta(fase, options).faseDestino;
}

/**
 * Pure validation state for the Gerencia Financiera return composer.
 * Returns which required fields are still missing, a human-readable summary,
 * and whether the "Revisar devolución" action must stay disabled.
 */
export function getDevolucionGerenciaValidation(input: {
  destino?: DestinoDevolucionGerencia | "";
  responsableUserId?: string;
  comentario?: string;
  loading?: boolean;
  busy?: boolean;
}) {
  const faltantes: Array<"destino" | "responsable" | "motivo"> = [];
  if (!input.destino) faltantes.push("destino");
  if (!input.responsableUserId) faltantes.push("responsable");
  if (!input.comentario?.trim()) faltantes.push("motivo");

  const mensaje =
    faltantes.length === 0
      ? ""
      : faltantes.length === 1
        ? faltantes[0]!
        : `${faltantes.slice(0, -1).join(", ")} y ${faltantes[faltantes.length - 1]}`;

  const disabled = Boolean(input.busy) || Boolean(input.loading) || faltantes.length > 0;

  return { faltantes, mensaje, disabled };
}
