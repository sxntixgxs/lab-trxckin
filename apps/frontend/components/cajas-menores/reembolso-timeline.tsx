"use client";

import {
  ArrowRightLeft,
  Calculator,
  CheckCircle2,
  Clock,
  FileCheck,
  FileText,
  Send,
  ShieldCheck,
  Undo2,
  UserCheck,
  Wallet,
  XCircle,
} from "lucide-react";

import { formatDateTime } from "@/app/(default)/billing/lib/utils";
import { cn } from "@/lib/utils";

import { ReembolsoStageAttachmentsReadonly } from "./reembolso-stage-attachments";

export type ReembolsoTimelineEvento = {
  id: string;
  etapa:
    | "solicitud"
    | "aprobacion_lider"
    | "revision"
    | "contabilidad"
    | "eventos_dian"
    | "aprobacion"
    | "tesoreria"
    | "recibido";
  tipo:
    | "creado"
    | "aprobado"
    | "rechazado"
    | "devuelto"
    | "movido"
    | "comprobante"
    | "recibido";
  titulo: string;
  fecha: number;
  usuarioNombre: string;
  usuarioEmail?: string;
  comentario?: string;
  adjuntos: Array<{ nombre: string; url: string | null; mimeType?: string }>;
};

const ETAPA_STYLES: Record<
  ReembolsoTimelineEvento["etapa"],
  { dot: string; ring: string; badge: string; iconBg: string }
> = {
  solicitud: {
    dot: "bg-slate-500",
    ring: "border-slate-200",
    badge: "bg-slate-100 text-slate-700",
    iconBg: "bg-slate-100 text-slate-600",
  },
  aprobacion_lider: {
    dot: "bg-amber-500",
    ring: "border-amber-200",
    badge: "bg-amber-50 text-amber-800 ring-1 ring-amber-100",
    iconBg: "bg-amber-100 text-amber-700",
  },
  revision: {
    dot: "bg-teal-500",
    ring: "border-teal-200",
    badge: "bg-teal-50 text-teal-800 ring-1 ring-teal-100",
    iconBg: "bg-teal-100 text-teal-700",
  },
  contabilidad: {
    dot: "bg-sky-500",
    ring: "border-sky-200",
    badge: "bg-sky-50 text-sky-800 ring-1 ring-sky-100",
    iconBg: "bg-sky-100 text-sky-700",
  },
  eventos_dian: {
    dot: "bg-indigo-500",
    ring: "border-indigo-200",
    badge: "bg-indigo-50 text-indigo-800 ring-1 ring-indigo-100",
    iconBg: "bg-indigo-100 text-indigo-700",
  },
  aprobacion: {
    dot: "bg-amber-500",
    ring: "border-amber-200",
    badge: "bg-amber-50 text-amber-800 ring-1 ring-amber-100",
    iconBg: "bg-amber-100 text-amber-700",
  },
  tesoreria: {
    dot: "bg-sky-500",
    ring: "border-sky-200",
    badge: "bg-sky-50 text-sky-800 ring-1 ring-sky-100",
    iconBg: "bg-sky-100 text-sky-700",
  },
  recibido: {
    dot: "bg-emerald-500",
    ring: "border-emerald-200",
    badge: "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-100",
    iconBg: "bg-emerald-100 text-emerald-700",
  },
};

function EventNodeIcon({
  etapa,
  tipo,
}: {
  etapa: ReembolsoTimelineEvento["etapa"];
  tipo: ReembolsoTimelineEvento["tipo"];
}) {
  const styles = ETAPA_STYLES[etapa] ?? ETAPA_STYLES.solicitud;
  const iconClass = "h-3.5 w-3.5";

  if (tipo === "rechazado") {
    return (
      <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-rose-200 bg-rose-50 text-rose-600">
        <XCircle className={iconClass} aria-hidden />
      </span>
    );
  }

  if (tipo === "devuelto") {
    return (
      <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-amber-200 bg-amber-50 text-amber-700">
        <Undo2 className={iconClass} aria-hidden />
      </span>
    );
  }

  if (tipo === "movido") {
    return (
      <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-slate-200 bg-slate-50 text-slate-600">
        <ArrowRightLeft className={iconClass} aria-hidden />
      </span>
    );
  }

  let Icon = CheckCircle2;
  if (tipo === "creado" && etapa === "solicitud") Icon = Send;
  else if (etapa === "aprobacion_lider") Icon = UserCheck;
  else if (etapa === "revision") Icon = ShieldCheck;
  else if (etapa === "contabilidad") Icon = Calculator;
  else if (etapa === "eventos_dian") Icon = FileCheck;
  else if (etapa === "tesoreria") Icon = Wallet;
  else if (tipo === "creado") Icon = Clock;

  return (
    <span
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-full border-2 bg-white",
        styles.ring,
      )}
    >
      <span
        className={cn(
          "flex h-6 w-6 items-center justify-center rounded-full",
          styles.iconBg,
        )}
      >
        <Icon className={iconClass} aria-hidden />
      </span>
    </span>
  );
}

export function ReembolsoTimeline({ eventos }: { eventos: ReembolsoTimelineEvento[] }) {
  if (eventos.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
        Sin historial registrado.
      </p>
    );
  }

  return (
    <ol className="relative space-y-0">
      {eventos.map((evento, index) => {
        const styles = ETAPA_STYLES[evento.etapa] ?? ETAPA_STYLES.solicitud;
        const isLast = index === eventos.length - 1;
        const isRejected = evento.tipo === "rechazado";

        return (
          <li key={evento.id} className="relative flex gap-3 pb-6">
            {!isLast ? (
              <span
                className="absolute left-4 top-8 h-[calc(100%-16px)] w-px bg-slate-200"
                aria-hidden
              />
            ) : null}
            <div className="relative z-10 shrink-0">
              <EventNodeIcon etapa={evento.etapa} tipo={evento.tipo} />
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p
                    className={cn(
                      "text-sm font-semibold",
                      isRejected ? "text-rose-800" : "text-slate-900",
                    )}
                  >
                    {evento.titulo}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {evento.usuarioNombre}
                    {evento.usuarioEmail ? (
                      <span className="text-slate-400"> · {evento.usuarioEmail}</span>
                    ) : null}
                  </p>
                </div>
                <time
                  className={cn(
                    "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold tabular-nums",
                    isRejected ? "bg-rose-50 text-rose-700 ring-1 ring-rose-100" : styles.badge,
                  )}
                  dateTime={new Date(evento.fecha).toISOString()}
                >
                  {formatDateTime(evento.fecha)}
                </time>
              </div>
              {evento.comentario ? (
                <blockquote className="mt-2.5 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2.5 text-sm leading-relaxed text-slate-600">
                  {evento.comentario}
                </blockquote>
              ) : null}
              {evento.adjuntos.length > 0 ? (
                <div className="mt-2.5">
                  <p className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    <FileText className="h-3 w-3" aria-hidden />
                    Archivos ({evento.adjuntos.length})
                  </p>
                  <ReembolsoStageAttachmentsReadonly adjuntos={evento.adjuntos} />
                </div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
