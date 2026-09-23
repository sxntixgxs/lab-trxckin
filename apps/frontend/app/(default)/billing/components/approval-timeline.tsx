"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import {
  ArrowRight,
  ArrowRightLeft,
  Calculator,
  CheckCircle2,
  CircleDot,
  Clock,
  FilePlus2,
  Inbox,
  MessageSquare,
  Repeat,
  ShieldCheck,
  Sparkles,
  Undo2,
  Wallet,
  WalletCards,
  XCircle,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useFacturacionActorNames } from "../hooks/use-facturacion-actors";
import { formatCurrency, formatDateTime } from "../lib/utils";
import { ValorContableCambioBadge } from "./valor-contable-ui";
import { ExpandableObservation } from "./expandable-observation";
import { FacturacionStatusBadge, FACTURACION_STATUS_LABELS } from "./status-badge";
import { formatFpDisplay } from "@/lib/facturacion-causacion";

type Accion = Doc<"facturacionAprobaciones">["accion"];

const ACTION_META: Record<
  Accion,
  {
    icon: typeof CircleDot;
    label: string;
    bg: string;
    topBorder: string;
  }
> = {
  asignar_recepcion: {
    icon: Inbox,
    label: "Asignó a recepción",
    bg: "bg-slate-500",
    topBorder: "border-t-slate-400",
  },
  asignar_lider: {
    icon: ArrowRight,
    label: "Asignó líder(es)",
    bg: "bg-amber-500",
    topBorder: "border-t-amber-400",
  },
  aceptar: {
    icon: CheckCircle2,
    label: "Aceptó la factura",
    bg: "bg-emerald-500",
    topBorder: "border-t-emerald-400",
  },
  rechazar: {
    icon: XCircle,
    label: "Rechazó la factura",
    bg: "bg-rose-500",
    topBorder: "border-t-rose-400",
  },
  rechazar_dian: {
    icon: XCircle,
    label: "Rechazó DIAN",
    bg: "bg-rose-600",
    topBorder: "border-t-rose-500",
  },
  solicitar_rechazo_dian: {
    icon: XCircle,
    label: "Solicitó rechazo DIAN",
    bg: "bg-orange-600",
    topBorder: "border-t-orange-500",
  },
  confirmar_rechazo_dian: {
    icon: CheckCircle2,
    label: "Confirmó rechazo DIAN",
    bg: "bg-rose-600",
    topBorder: "border-t-rose-500",
  },
  cruzar_nota_credito_rechazo_dian: {
    icon: Sparkles,
    label: "Relacionó nota crédito",
    bg: "bg-cyan-600",
    topBorder: "border-t-cyan-500",
  },
  reasignar_nota_credito: {
    icon: Sparkles,
    label: "Reasignó nota crédito",
    bg: "bg-cyan-700",
    topBorder: "border-t-cyan-600",
  },
  relacionar_nota_credito: {
    icon: Sparkles,
    label: "Relacionó nota crédito",
    bg: "bg-cyan-600",
    topBorder: "border-t-cyan-500",
  },
  cerrar_nota_credito: {
    icon: CheckCircle2,
    label: "Cerró nota crédito",
    bg: "bg-cyan-700",
    topBorder: "border-t-cyan-600",
  },
  cerrar_factura: {
    icon: CheckCircle2,
    label: "Cerró factura",
    bg: "bg-cyan-700",
    topBorder: "border-t-cyan-600",
  },
  migrar_rechazo_dian: {
    icon: Repeat,
    label: "Migró rechazo DIAN",
    bg: "bg-slate-500",
    topBorder: "border-t-slate-400",
  },
  causar: {
    icon: Sparkles,
    label: "Envió a análisis financiero",
    bg: "bg-sky-500",
    topBorder: "border-t-sky-400",
  },
  enviar_impuestos: {
    icon: ShieldCheck,
    label: "Envió a impuestos",
    bg: "bg-cyan-500",
    topBorder: "border-t-cyan-400",
  },
  aprobar_impuestos: {
    icon: CheckCircle2,
    label: "Aprobó impuestos",
    bg: "bg-indigo-500",
    topBorder: "border-t-indigo-400",
  },
  devolver_causacion: {
    icon: Repeat,
    label: "Devolvió a causación",
    bg: "bg-orange-500",
    topBorder: "border-t-orange-400",
  },
  devolver_fase: {
    icon: Repeat,
    label: "Devolvió la factura",
    bg: "bg-orange-500",
    topBorder: "border-t-orange-400",
  },
  reenviar_impuestos: {
    icon: ArrowRight,
    label: "Reenvió a impuestos",
    bg: "bg-cyan-600",
    topBorder: "border-t-cyan-500",
  },
  aprobar_pago: {
    icon: ShieldCheck,
    label: "Envió a tesorería",
    bg: "bg-violet-500",
    topBorder: "border-t-violet-400",
  },
  asignar_jefe_directo: {
    icon: ArrowRight,
    label: "Asignó jefe directo",
    bg: "bg-lime-500",
    topBorder: "border-t-lime-400",
  },
  asignar_lider_horizontal: {
    icon: Repeat,
    label: "Asignó a otro(s) líder(es)",
    bg: "bg-violet-500",
    topBorder: "border-t-violet-400",
  },
  asignar_par: {
    icon: Repeat,
    label: "Asignó a otro par",
    bg: "bg-violet-500",
    topBorder: "border-t-violet-400",
  },
  asignar_eventos_dian: {
    icon: ShieldCheck,
    label: "Asignó Eventos DIAN",
    bg: "bg-teal-500",
    topBorder: "border-t-teal-400",
  },
  asignar_gerencia: {
    icon: ArrowRight,
    label: "Asignó gerencia",
    bg: "bg-fuchsia-500",
    topBorder: "border-t-fuchsia-400",
  },
  legalizar_factura: {
    icon: CheckCircle2,
    label: "Legalizó factura",
    bg: "bg-emerald-600",
    topBorder: "border-t-emerald-500",
  },
  registrar_pago: {
    icon: Wallet,
    label: "Registró el pago",
    bg: "bg-green-600",
    topBorder: "border-t-green-500",
  },
  pago_parcial: {
    icon: Wallet,
    label: "Registró pago parcial",
    bg: "bg-sky-600",
    topBorder: "border-t-sky-500",
  },
  aprobar_gerencia: {
    icon: CheckCircle2,
    label: "Aprobó gerencia",
    bg: "bg-fuchsia-500",
    topBorder: "border-t-fuchsia-400",
  },
  reasignar: {
    icon: Repeat,
    label: "Reasignó la tarea",
    bg: "bg-amber-500",
    topBorder: "border-t-amber-400",
  },
  cancelar: {
    icon: XCircle,
    label: "Canceló la asignación",
    bg: "bg-slate-500",
    topBorder: "border-t-slate-400",
  },
  adjuntar: {
    icon: MessageSquare,
    label: "Adjuntó un soporte",
    bg: "bg-blue-500",
    topBorder: "border-t-blue-400",
  },
  comentar: {
    icon: MessageSquare,
    label: "Dejó un comentario",
    bg: "bg-slate-400",
    topBorder: "border-t-slate-300",
  },
  marcar_causada: {
    icon: Sparkles,
    label: "Actualizó causación",
    bg: "bg-sky-500",
    topBorder: "border-t-sky-400",
  },
  actualizar_causacion: {
    icon: Sparkles,
    label: "Actualizó causación",
    bg: "bg-sky-500",
    topBorder: "border-t-sky-400",
  },
  marcar_anticipo: {
    icon: Sparkles,
    label: "Actualizó anticipo",
    bg: "bg-amber-500",
    topBorder: "border-t-amber-400",
  },
  cambiar_dueno_anticipo: {
    icon: Sparkles,
    label: "Cambió dueño del anticipo",
    bg: "bg-amber-500",
    topBorder: "border-t-amber-400",
  },
  legalizar_anticipo: {
    icon: Sparkles,
    label: "Legalizó anticipo",
    bg: "bg-emerald-500",
    topBorder: "border-t-emerald-400",
  },
  agregar_cruce_documento_interno: {
    icon: FilePlus2,
    label: "Agregó documento interno",
    bg: "bg-emerald-600",
    topBorder: "border-t-emerald-500",
  },
  editar_cruce_documento_interno: {
    icon: ArrowRightLeft,
    label: "Editó documento interno",
    bg: "bg-emerald-600",
    topBorder: "border-t-emerald-500",
  },
  retirar_cruce_documento_interno: {
    icon: Undo2,
    label: "Retiró documento interno",
    bg: "bg-slate-500",
    topBorder: "border-t-slate-400",
  },
  marcar_caja_menor: {
    icon: WalletCards,
    label: "Actualizó Caja Menor",
    bg: "bg-teal-500",
    topBorder: "border-t-teal-400",
  },
  crear_movimiento_caja_menor: {
    icon: WalletCards,
    label: "Creó movimiento Caja Menor",
    bg: "bg-teal-500",
    topBorder: "border-t-teal-400",
  },
  crear_documento_fisico: {
    icon: FilePlus2,
    label: "Creó documento físico",
    bg: "bg-violet-500",
    topBorder: "border-t-violet-400",
  },
  generar_reembolso_caja_menor: {
    icon: WalletCards,
    label: "Generó reembolso Caja Menor",
    bg: "bg-teal-500",
    topBorder: "border-t-teal-400",
  },
  actualizar_centro_costo_caja_menor: {
    icon: WalletCards,
    label: "Actualizó centro de costo Caja Menor",
    bg: "bg-sky-600",
    topBorder: "border-t-sky-500",
  },
  aprobar_lider_reembolso_caja_menor: {
    icon: CheckCircle2,
    label: "Aprobó líder reembolso Caja Menor",
    bg: "bg-emerald-600",
    topBorder: "border-t-emerald-500",
  },
  rechazar_lider_reembolso_caja_menor: {
    icon: XCircle,
    label: "Rechazó líder reembolso Caja Menor",
    bg: "bg-rose-600",
    topBorder: "border-t-rose-500",
  },
  aprobar_reembolso_caja_menor: {
    icon: CheckCircle2,
    label: "Aprobó reembolso Caja Menor",
    bg: "bg-emerald-600",
    topBorder: "border-t-emerald-500",
  },
  rechazar_reembolso_caja_menor: {
    icon: XCircle,
    label: "Rechazó reembolso Caja Menor",
    bg: "bg-rose-600",
    topBorder: "border-t-rose-500",
  },
  confirmar_reembolso_caja_menor: {
    icon: WalletCards,
    label: "Confirmó recibo Caja Menor",
    bg: "bg-emerald-600",
    topBorder: "border-t-emerald-500",
  },
  anular_movimiento_caja_menor: {
    icon: XCircle,
    label: "Anuló movimiento Caja Menor",
    bg: "bg-slate-500",
    topBorder: "border-t-slate-400",
  },
  devolver_buzon: {
    icon: Inbox,
    label: "Devolvió a buzón",
    bg: "bg-amber-600",
    topBorder: "border-t-amber-500",
  },
  reasignar_revisor_caja_menor: {
    icon: ArrowRightLeft,
    label: "Reasignó revisor Caja Menor",
    bg: "bg-sky-600",
    topBorder: "border-t-sky-500",
  },
  legalizar_caja_menor: {
    icon: WalletCards,
    label: "Legalizó Caja Menor",
    bg: "bg-emerald-600",
    topBorder: "border-t-emerald-500",
  },
  enviar_impuestos_reembolso_caja_menor: {
    icon: Calculator,
    label: "Envió a Contabilidad reembolso Caja Menor",
    bg: "bg-sky-600",
    topBorder: "border-t-sky-500",
  },
  aprobar_impuestos_reembolso_caja_menor: {
    icon: CheckCircle2,
    label: "Aprobó Contabilidad reembolso Caja Menor",
    bg: "bg-emerald-600",
    topBorder: "border-t-emerald-500",
  },
  rechazar_impuestos_reembolso_caja_menor: {
    icon: XCircle,
    label: "Rechazó Contabilidad reembolso Caja Menor",
    bg: "bg-rose-600",
    topBorder: "border-t-rose-500",
  },
  devolver_impuestos_reembolso_caja_menor: {
    icon: Undo2,
    label: "Devolvió a Revisor Caja Menor desde Contabilidad",
    bg: "bg-amber-600",
    topBorder: "border-t-amber-500",
  },
  reasignar_contador_reembolso_caja_menor: {
    icon: ArrowRightLeft,
    label: "Reasignó contador reembolso Caja Menor",
    bg: "bg-sky-600",
    topBorder: "border-t-sky-500",
  },
  devolver_gerencia_contabilidad_reembolso_caja_menor: {
    icon: Undo2,
    label: "Devolvió a Contabilidad reembolso Caja Menor",
    bg: "bg-amber-600",
    topBorder: "border-t-amber-500",
  },
  devolver_gerencia_revision_reembolso_caja_menor: {
    icon: Undo2,
    label: "Devolvió a Revisor reembolso Caja Menor",
    bg: "bg-amber-600",
    topBorder: "border-t-amber-500",
  },
  reenviar_gerencia_reembolso_caja_menor: {
    icon: ArrowRightLeft,
    label: "Reenvió a Gerencia reembolso Caja Menor",
    bg: "bg-teal-600",
    topBorder: "border-t-teal-500",
  },
  reasignar_eventos_dian_reembolso_caja_menor: {
    icon: ArrowRightLeft,
    label: "Reasignó Eventos DIAN reembolso Caja Menor",
    bg: "bg-teal-600",
    topBorder: "border-t-teal-500",
  },
  reenviar_gerencia_impuestos_reembolso_caja_menor: {
    icon: ArrowRightLeft,
    label: "Reenvió a Gerencia desde Impuestos reembolso Caja Menor",
    bg: "bg-teal-600",
    topBorder: "border-t-teal-500",
  },
  enviar_eventos_dian_reembolso_caja_menor: {
    icon: ShieldCheck,
    label: "Envió a Eventos DIAN reembolso Caja Menor",
    bg: "bg-teal-500",
    topBorder: "border-t-teal-400",
  },
  rechazar_eventos_dian_reembolso_caja_menor: {
    icon: XCircle,
    label: "Rechazó en Eventos DIAN reembolso Caja Menor",
    bg: "bg-rose-600",
    topBorder: "border-t-rose-500",
  },
  devolver_eventos_dian_reembolso_caja_menor: {
    icon: Repeat,
    label: "Devolvió desde Eventos DIAN reembolso Caja Menor",
    bg: "bg-orange-500",
    topBorder: "border-t-orange-400",
  },
  aprobar_eventos_dian_reembolso_caja_menor: {
    icon: CheckCircle2,
    label: "Aprobó Eventos DIAN reembolso Caja Menor",
    bg: "bg-teal-600",
    topBorder: "border-t-teal-500",
  },
  devolver_gerencia_eventos_dian_reembolso_caja_menor: {
    icon: Repeat,
    label: "Devolvió Gerencia a Eventos DIAN reembolso Caja Menor",
    bg: "bg-orange-500",
    topBorder: "border-t-orange-400",
  },
  asignar_fase_usuario: {
    icon: ArrowRightLeft,
    label: "Asignó fase y usuario",
    bg: "bg-fuchsia-500",
    topBorder: "border-t-fuchsia-400",
  },
};

function getInitials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function formatDuration(ms: number): string {
  if (ms <= 0) return "0m";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "menos de 1m";
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  if (hours < 24) return remMinutes ? `${hours}h ${remMinutes}m` : `${hours}h`;

  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  if (days < 30) return remHours ? `${days}d ${remHours}h` : `${days}d`;

  const months = Math.floor(days / 30);
  const remDays = days % 30;
  return remDays
    ? `${months}m ${remDays}d`
    : `${months} mes${months > 1 ? "es" : ""}`;
}

type Segment =
  | {
      kind: "event";
      event: Doc<"facturacionAprobaciones">;
      isFirst: boolean;
      isLast: boolean;
    }
  | {
      kind: "stage";
      stageKey: string;
      durationMs: number;
      isInitial?: boolean;
    };

export function FacturacionApprovalTimeline({
  aprobaciones,
  facturaCreadoEn,
}: {
  aprobaciones: Array<Doc<"facturacionAprobaciones">>;
  facturaCreadoEn?: number;
}) {
  const getActorName = useFacturacionActorNames(aprobaciones);
  const sorted = useMemo(
    () => [...aprobaciones].sort((a, b) => a.creadoEn - b.creadoEn),
    [aprobaciones],
  );

  const storageIds = useMemo(() => {
    const ids = new Set<Id<"_storage">>();
    for (const item of sorted) {
      if (item.firmaStorageId) ids.add(item.firmaStorageId);
      if (item.pagoParcial?.comprobanteStorageId) {
        ids.add(item.pagoParcial.comprobanteStorageId);
      }
    }
    return Array.from(ids);
  }, [sorted]);

  const facturaIds = useMemo(
    () => Array.from(new Set(sorted.map((item) => item.facturaId))),
    [sorted],
  );

  const storageUrls = useQuery(
    api.facturacionStorage.getUrls,
    storageIds.length > 0 ? { storageIds, facturaIds } : "skip",
  );

  const storageUrlMap = useMemo(() => {
    const entries = (storageUrls ?? []) as Array<{
      storageId: Id<"_storage">;
      url: string | null;
    }>;
    return new Map(entries.map((item) => [item.storageId, item.url]));
  }, [storageUrls]);

  const segments = useMemo<Segment[]>(() => {
    const out: Segment[] = [];
    if (sorted.length === 0) return out;

    if (facturaCreadoEn && sorted[0].creadoEn > facturaCreadoEn) {
      out.push({
        kind: "stage",
        stageKey: sorted[0].estadoAnterior,
        durationMs: sorted[0].creadoEn - facturaCreadoEn,
        isInitial: true,
      });
    }

    sorted.forEach((event, idx) => {
      out.push({
        kind: "event",
        event,
        isFirst: idx === 0,
        isLast: idx === sorted.length - 1,
      });
      const next = sorted[idx + 1];
      if (next) {
        out.push({
          kind: "stage",
          stageKey: event.estadoNuevo,
          durationMs: next.creadoEn - event.creadoEn,
        });
      }
    });

    return out;
  }, [sorted, facturaCreadoEn]);

  const totalDurationMs = useMemo(() => {
    if (sorted.length === 0) return 0;
    const start = facturaCreadoEn ?? sorted[0].creadoEn;
    const end = sorted[sorted.length - 1].creadoEn;
    return Math.max(0, end - start);
  }, [sorted, facturaCreadoEn]);

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-b from-white to-slate-50/60 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 bg-white/70 px-6 py-4 backdrop-blur-xs">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-900">
            Línea de tiempo del proceso
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Cronología completa de intervenciones. Cada segmento muestra el tiempo vivido en esa etapa.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {totalDurationMs > 0 ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
              <Clock className="h-3.5 w-3.5 text-slate-500" />
              Total: {formatDuration(totalDurationMs)}
            </span>
          ) : null}
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
            {sorted.length} {sorted.length === 1 ? "evento" : "eventos"}
          </span>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="p-8">
          <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
            No se han registrado intervenciones todavía.
          </div>
        </div>
      ) : (
        <div className="relative">
          <div className="pointer-events-none absolute right-0 top-0 bottom-0 z-10 w-10 bg-gradient-to-l from-slate-50/80 to-transparent" />
          <div className="pointer-events-none absolute left-0 top-0 bottom-0 z-10 w-10 bg-gradient-to-r from-white to-transparent" />
          <div className="overflow-x-auto scrollbar-thin px-4 py-6 sm:px-6">
            <ol className="flex min-w-max items-start">
              {segments.map((segment, idx) => {
                if (segment.kind === "stage") {
                  return (
                    <StageConnector
                      key={`stage-${idx}`}
                      stageKey={segment.stageKey}
                      durationMs={segment.durationMs}
                      isInitial={segment.isInitial}
                    />
                  );
                }
                const signatureUrl = segment.event.firmaStorageId
                  ? storageUrlMap.get(segment.event.firmaStorageId) ?? null
                  : null;
                const comprobanteUrl = segment.event.pagoParcial?.comprobanteStorageId
                  ? storageUrlMap.get(segment.event.pagoParcial.comprobanteStorageId) ??
                    null
                  : null;
                return (
                  <EventCard
                    key={segment.event._id}
                    event={segment.event}
                    actorName={getActorName(segment.event)}
                    isFirst={segment.isFirst}
                    isLast={segment.isLast}
                    signatureUrl={signatureUrl}
                    comprobanteUrl={comprobanteUrl}
                  />
                );
              })}
            </ol>
          </div>
        </div>
      )}
    </section>
  );
}

function EventCard({
  event,
  actorName,
  isFirst,
  isLast,
  signatureUrl,
  comprobanteUrl,
}: {
  event: Doc<"facturacionAprobaciones">;
  actorName: string;
  isFirst: boolean;
  isLast: boolean;
  signatureUrl: string | null;
  comprobanteUrl?: string | null;
}) {
  const meta = ACTION_META[event.accion] ?? ACTION_META.comentar;
  const Icon = meta.icon;
  const stateChanged = event.estadoAnterior !== event.estadoNuevo;
  const actionLabel =
    event.accion === "asignar_fase_usuario" && event.estadoNuevo
      ? (FACTURACION_STATUS_LABELS[event.estadoNuevo] ?? event.estadoNuevo)
      : meta.label;

  return (
    <li className="flex w-[210px] shrink-0 flex-col">
      <div className="relative flex h-11 items-center justify-center">
        <div
          className={`absolute top-1/2 h-px bg-slate-200 ${
            isFirst ? "left-1/2 right-0" : isLast ? "left-0 right-1/2" : "left-0 right-0"
          }`}
        />
        <div
          className={`relative z-10 flex h-11 w-11 items-center justify-center rounded-full shadow-md ring-4 ring-white ${meta.bg}`}
        >
          <Icon className="h-4 w-4 text-white" />
        </div>
      </div>

      <div
        className={`mt-3 flex flex-1 flex-col rounded-2xl border border-slate-200 border-t-[3px] bg-white p-3 shadow-xs ${meta.topBorder}`}
      >
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[10px] font-semibold text-white">
            {getInitials(actorName)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-slate-900">
              {actorName}
            </p>
            <p className="truncate text-[10px] text-slate-500">
              {formatDateTime(event.creadoEn)}
            </p>
          </div>
        </div>

        <p className="mt-2.5 text-xs font-semibold text-slate-800">{actionLabel}</p>

        {stateChanged ? (
          <div className="mt-2 flex flex-wrap items-center gap-1">
            <FacturacionStatusBadge estado={event.estadoAnterior} />
            <ArrowRight className="h-3 w-3 text-slate-400" />
            <FacturacionStatusBadge estado={event.estadoNuevo} />
          </div>
        ) : null}

        {event.comentario ? (
          <div className="mt-2 rounded-lg bg-slate-50 p-2">
            <ExpandableObservation
              text={event.comentario}
              collapsedLines={3}
              className="text-[11px] leading-snug text-slate-600"
            />
          </div>
        ) : null}

        {event.valorContableCambio ? (
          <ValorContableCambioBadge cambio={event.valorContableCambio} />
        ) : null}

        {event.causacionCambio ? (
          <div className="mt-2 rounded-lg border border-cyan-200 bg-cyan-50/60 p-2 text-[11px] text-cyan-950">
            <p className="font-semibold">Causación actualizada</p>
            <p className="mt-0.5">
              {event.causacionCambio.causadoNuevo ? "Causada" : "No causada"} · FP{" "}
              {formatFpDisplay(
                event.causacionCambio.causadoNuevo,
                event.causacionCambio.numeroFpNuevo
              )}
            </p>
          </div>
        ) : null}

        {event.cruceDocumentoInternoCambio ? (
          <div className="mt-2 space-y-1 rounded-lg bg-emerald-50 p-2 text-[11px] text-emerald-950">
            {event.cruceDocumentoInternoCambio.anterior &&
            event.cruceDocumentoInternoCambio.nuevo ? (
              <p className="font-semibold">
                {event.cruceDocumentoInternoCambio.anterior.numeroDocumento} ·{" "}
                {formatCurrency(
                  event.cruceDocumentoInternoCambio.anterior.valorAplicado,
                  event.cruceDocumentoInternoCambio.resumenContable.moneda,
                )}{" "}
                → {event.cruceDocumentoInternoCambio.nuevo.numeroDocumento} ·{" "}
                {formatCurrency(
                  event.cruceDocumentoInternoCambio.nuevo.valorAplicado,
                  event.cruceDocumentoInternoCambio.resumenContable.moneda,
                )}
              </p>
            ) : event.cruceDocumentoInternoCambio.nuevo ? (
              <p className="font-semibold">
                {event.cruceDocumentoInternoCambio.nuevo.numeroDocumento} ·{" "}
                {formatCurrency(
                  event.cruceDocumentoInternoCambio.nuevo.valorAplicado,
                  event.cruceDocumentoInternoCambio.resumenContable.moneda,
                )}
              </p>
            ) : event.cruceDocumentoInternoCambio.anterior ? (
              <p className="font-semibold">
                Retirado: {event.cruceDocumentoInternoCambio.anterior.numeroDocumento} ·{" "}
                {formatCurrency(
                  event.cruceDocumentoInternoCambio.anterior.valorAplicado,
                  event.cruceDocumentoInternoCambio.resumenContable.moneda,
                )}
              </p>
            ) : null}
            <p>
              Valor a pagar:{" "}
              {formatCurrency(
                event.cruceDocumentoInternoCambio.resumenContable.valorAPagar,
                event.cruceDocumentoInternoCambio.resumenContable.moneda,
              )}
            </p>
          </div>
        ) : null}

        {event.anticipoDuenoCambio ? (
          <div className="mt-2 space-y-1 rounded-lg bg-amber-50 p-2 text-[11px] text-amber-950">
            <p className="font-semibold">
              {(event.anticipoDuenoCambio.anterior?.liderNombre ?? "Sin dueño") +
                " → " +
                event.anticipoDuenoCambio.nuevo.liderNombre}
            </p>
            <p>
              {(event.anticipoDuenoCambio.anterior?.procesoNombre ?? "Sin proceso") +
                " → " +
                (event.anticipoDuenoCambio.nuevo.procesoNombre ?? "Sin proceso")}
            </p>
            {event.anticipoDuenoCambio.crucesRevertidos ? (
              <p>
                Revirtió {event.anticipoDuenoCambio.crucesRevertidos.cantidad} cruce(s) ·{" "}
                {formatCurrency(event.anticipoDuenoCambio.crucesRevertidos.valor, "COP")}
              </p>
            ) : null}
          </div>
        ) : null}

        {event.notaCreditoRelacionCambio ? (
          <div className="mt-2 space-y-1 rounded-lg bg-cyan-50 p-2 text-[11px] text-cyan-950">
            <p className="font-semibold">
              {(event.notaCreditoRelacionCambio.facturaAnteriorNumero ??
                "Sin relación") +
                " → " +
                event.notaCreditoRelacionCambio.facturaNuevaNumero}
            </p>
            <p>
              NC {event.notaCreditoRelacionCambio.notaCreditoNumero} ·{" "}
              {event.notaCreditoRelacionCambio.contexto.replace(/_/g, " ")} ·
              origen {event.notaCreditoRelacionCambio.origenRelacionAnterior}
            </p>
          </div>
        ) : null}

        {event.pagoParcial ? (
          <div className="mt-2 space-y-1 rounded-lg bg-sky-50 p-2 text-[11px] text-sky-900">
            <p className="font-semibold tabular-nums">
              Monto: {formatCurrency(event.pagoParcial.monto, "COP")}
            </p>
            {comprobanteUrl ? (
              <a
                href={comprobanteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-sky-700 underline-offset-2 hover:underline"
              >
                {event.pagoParcial.comprobanteNombre}
              </a>
            ) : (
              <p className="text-sky-800">{event.pagoParcial.comprobanteNombre}</p>
            )}
          </div>
        ) : null}

        {signatureUrl ? (
          <div className="mt-2 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1">
            <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              Firma
            </span>
            <img
              src={signatureUrl}
              alt="Firma registrada"
              className="h-6 rounded-xs border border-slate-100 bg-white px-1"
            />
          </div>
        ) : null}
      </div>
    </li>
  );
}
function StageConnector({
  stageKey,
  durationMs,
  isInitial,
}: {
  stageKey: string;
  durationMs: number;
  isInitial?: boolean;
}) {
  return (
    <li className="flex w-[120px] shrink-0 flex-col sm:w-[140px]">
      <div className="relative flex h-11 items-center">
        <div className="h-px w-full bg-slate-200" />
        <div className="absolute left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700 shadow-xs">
          <Clock className="h-3 w-3 text-slate-500" />
          {formatDuration(durationMs)}
        </div>
      </div>
      <div className="mt-3 flex flex-col items-center gap-1 px-1 text-center">
        <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-400">
          {isInitial ? "Recibida en" : "En"}
        </span>
        <FacturacionStatusBadge estado={stageKey} />
        {isInitial ? (
          <span className="mt-1 inline-flex items-center gap-1 text-[9px] text-slate-500">
            <Inbox className="h-2.5 w-2.5" />
            Desde captura
          </span>
        ) : null}
      </div>
    </li>
  );
}
