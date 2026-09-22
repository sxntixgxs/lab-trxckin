"use client";

import * as React from "react";
import type { ReactNode } from "react";
import { useMutation } from "convex/react";
import { AlertCircle, CheckCircle2, Clock3, Copy, Loader2, Mail, MailCheck, MailWarning, MinusCircle } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { OnboardingModulo } from "@/lib/onboarding/roles";
import { getOnboardingErrorMessage } from "./ui-config";

export type CorreoEstado = "PENDIENTE" | "ENVIADO" | "ENTREGADO" | "DEMORADO" | "FALLIDO";

export type CorreoResumenItem = {
  correoId: string;
  estado: CorreoEstado;
  email: string;
  numeroIntento: number;
  actualizadoEn: number;
  falloResumen?: string;
};

export type CorreoIntento = {
  _id: string;
  handoff: "FORM" | "SIGN";
  numeroIntento: number;
  estado: CorreoEstado;
  destinatarioEmail: string;
  creadoEn: number;
  detalleFallo?: string;
  origen: string;
};

const ESTADO_PRESENTACION: Record<CorreoEstado | "sin_registro", { label: string; icon: React.ElementType; className: string }> = {
  sin_registro: { label: "Sin registro", icon: MinusCircle, className: "text-slate-500" },
  PENDIENTE: { label: "Preparando", icon: Loader2, className: "text-slate-600" },
  ENVIADO: { label: "Enviado", icon: Mail, className: "text-blue-700" },
  ENTREGADO: { label: "Entregado", icon: MailCheck, className: "text-emerald-700" },
  DEMORADO: { label: "Demorado", icon: Clock3, className: "text-amber-700" },
  FALLIDO: { label: "Fallido", icon: MailWarning, className: "text-red-700" },
};

export function CorreoStatusBadge({
  estado = "sin_registro",
  handoffLabel,
  email,
  failureDetail,
  compact = false,
}: {
  estado?: CorreoEstado | "sin_registro";
  handoffLabel?: string;
  email?: string;
  failureDetail?: string;
  compact?: boolean;
}) {
  const conf = ESTADO_PRESENTACION[estado] ?? ESTADO_PRESENTACION.sin_registro;
  const Icon = conf.icon;
  const titleParts = [handoffLabel, conf.label, email, failureDetail].filter(Boolean);

  return (
    <div className="inline-flex max-w-full flex-col gap-0.5" title={titleParts.join(" · ")}>
      <span className={`inline-flex items-center gap-1.5 ${compact ? "text-[11px]" : "text-xs"} font-medium ${conf.className}`}>
        <Icon className={`h-3.5 w-3.5 shrink-0 ${estado === "PENDIENTE" ? "animate-spin" : ""}`} aria-hidden />
        <span>
          {handoffLabel ? `${handoffLabel}: ` : ""}
          {conf.label}
        </span>
      </span>
      {!compact && email ? <span className="truncate text-[11px] text-slate-500">{email}</span> : null}
      {!compact && failureDetail && estado === "FALLIDO" ? <span className="text-[11px] text-red-600">{failureDetail}</span> : null}
    </div>
  );
}

/** Picks the hand-off whose status is most relevant for the current phase. */
export function pickCorreoResumenVisible(args: {
  faseActual?: string;
  form?: CorreoResumenItem;
  sign?: CorreoResumenItem;
}): { handoffLabel: string; resumen?: CorreoResumenItem } {
  const { faseActual, form, sign } = args;
  if (faseActual === "IIA_PENDIENTE_FIRMA" && sign) return { handoffLabel: "Firma", resumen: sign };
  if (faseActual === "II_PENDIENTE_FORMULARIO" && form) return { handoffLabel: "Formulario", resumen: form };
  const candidates = [
    form ? { handoffLabel: "Formulario", resumen: form, ts: form.actualizadoEn } : null,
    sign ? { handoffLabel: "Firma", resumen: sign, ts: sign.actualizadoEn } : null,
  ].filter(Boolean) as Array<{ handoffLabel: string; resumen: CorreoResumenItem; ts: number }>;
  if (candidates.length === 0) return { handoffLabel: "Correo" };
  candidates.sort((a, b) => b.ts - a.ts);
  return { handoffLabel: candidates[0].handoffLabel, resumen: candidates[0].resumen };
}

/**
 * History of one hand-off email (form invitation or signature request) with resend and
 * copy-link actions. Resends go through Convex, which rotates the access token.
 */
export function CorreoHistorialPanel({
  modulo,
  titulo,
  faseActual,
  fasesActivas,
  emailCanonico,
  resumen,
  intentos,
  puedeGestionar,
  handoff,
  inscripcionId,
}: {
  modulo: OnboardingModulo;
  titulo: string;
  faseActual?: string;
  /** Phases in which the hand-off can be resent / its link copied. */
  fasesActivas: readonly string[];
  emailCanonico?: string;
  resumen?: CorreoResumenItem;
  intentos: CorreoIntento[];
  puedeGestionar: boolean;
  handoff: "FORM" | "SIGN";
  inscripcionId: string;
}) {
  const solicitarReenvio = useMutation(api.onboarding.correos.solicitarReenvio);
  const emitirEnlace = useMutation(api.onboarding.tokens.emitirEnlaceAcceso);
  const activo = fasesActivas.includes(faseActual ?? "");
  const estado = resumen?.estado ?? (intentos.length === 0 ? "sin_registro" : undefined);
  const [email, setEmail] = React.useState(emailCanonico ?? "");
  const [sending, setSending] = React.useState(false);
  const [copying, setCopying] = React.useState(false);
  const [feedback, setFeedback] = React.useState<{ ok: boolean; text: string } | null>(null);

  React.useEffect(() => {
    setEmail(emailCanonico ?? "");
  }, [emailCanonico]);

  async function handleSend(useEditedEmail: boolean) {
    const targetEmail = (useEditedEmail ? email : emailCanonico)?.trim();
    if (!targetEmail) {
      setFeedback({ ok: false, text: "Ingresa un correo válido." });
      return;
    }
    setSending(true);
    setFeedback(null);
    try {
      const result = await solicitarReenvio({
        modulo,
        inscripcionId,
        handoff,
        email: useEditedEmail ? targetEmail : undefined,
      });
      setFeedback({ ok: true, text: `Correo programado (intento #${result.numeroIntento}). El estado se actualizará en unos segundos.` });
    } catch (err) {
      setFeedback({ ok: false, text: getOnboardingErrorMessage(err, "No se pudo enviar el correo.") });
    } finally {
      setSending(false);
    }
  }

  async function handleCopiarEnlace() {
    setCopying(true);
    try {
      const { url } = await emitirEnlace({ modulo, inscripcionId, scope: handoff });
      await navigator.clipboard.writeText(url);
      toast.success("Enlace copiado. Los enlaces anteriores de este paso dejan de ser válidos.");
    } catch (err) {
      toast.error(getOnboardingErrorMessage(err, "No se pudo generar el enlace."));
    } finally {
      setCopying(false);
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-white/80 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{titulo}</p>
          <div className="mt-1">
            <CorreoStatusBadge estado={estado ?? "sin_registro"} email={resumen?.email ?? emailCanonico} failureDetail={resumen?.falloResumen} />
          </div>
          {resumen ? (
            <p className="mt-1 text-[11px] text-slate-500">
              Intento {resumen.numeroIntento}
              {resumen.actualizadoEn ? ` · actualizado ${new Date(resumen.actualizadoEn).toLocaleString("es-CO")}` : ""}
            </p>
          ) : null}
        </div>
        {activo && puedeGestionar ? (
          <div className="flex flex-wrap gap-1.5">
            {!resumen ? (
              <button
                type="button"
                disabled={sending}
                onClick={() => handleSend(false)}
                className="rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-60"
              >
                {sending ? "Enviando..." : "Enviar ahora"}
              </button>
            ) : null}
            <button
              type="button"
              disabled={copying}
              onClick={handleCopiarEnlace}
              title="Genera un enlace nuevo y lo copia al portapapeles"
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              {copying ? <Loader2 className="h-3 w-3 animate-spin" /> : <Copy className="h-3 w-3" />}
              Copiar enlace
            </button>
          </div>
        ) : null}
      </div>

      {intentos.length > 0 ? (
        <ul className="mt-3 space-y-1.5 border-t border-slate-100 pt-2">
          {intentos.map((item) => (
            <li key={item._id} className="flex items-center justify-between gap-2 text-[11px] text-slate-600">
              <span>
                #{item.numeroIntento} · {item.destinatarioEmail}
                <span className="ml-1 text-slate-400">· {new Date(item.creadoEn).toLocaleString("es-CO")}</span>
              </span>
              <CorreoStatusBadge estado={item.estado} failureDetail={item.detalleFallo} compact />
            </li>
          ))}
        </ul>
      ) : null}

      {activo && puedeGestionar ? (
        <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
          <label className="block text-[11px] font-medium text-slate-600" htmlFor={`${handoff}-email-${inscripcionId}`}>
            Correo destinatario
          </label>
          <input
            id={`${handoff}-email-${inscripcionId}`}
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-sm"
            disabled={sending}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={sending}
              onClick={() => handleSend(false)}
              className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              Reenviar
            </button>
            <button
              type="button"
              disabled={sending || email.trim().toLowerCase() === (emailCanonico ?? "").trim().toLowerCase()}
              onClick={() => handleSend(true)}
              className="rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-60"
            >
              Cambiar correo y reenviar
            </button>
          </div>
        </div>
      ) : null}

      {feedback ? (
        <p className={`mt-2 flex items-center gap-1 text-xs ${feedback.ok ? "text-emerald-700" : "text-red-600"}`} role="status">
          {feedback.ok ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> : <AlertCircle className="h-3.5 w-3.5" aria-hidden />}
          {feedback.text}
        </p>
      ) : null}
    </div>
  );
}

export function renderFaseIHistorialDetalle(
  fase: { observaciones?: string; completadoPor?: string; payload?: unknown; fechaCompletado?: number },
  auditName?: string,
): ReactNode {
  const payload = fase.payload as Record<string, unknown> | undefined;
  const automatico = payload?.automatico === true;
  return (
    <div className="mt-2 rounded-md border border-slate-200 bg-white/70 px-3 py-2 text-xs text-slate-700">
      <p>
        {automatico ? "Completado automáticamente" : "Completado manualmente"}
        {auditName || fase.completadoPor ? ` por ${auditName ?? fase.completadoPor}` : ""}
        {fase.fechaCompletado ? ` · ${new Date(fase.fechaCompletado).toLocaleString("es-CO")}` : ""}
      </p>
      {fase.observaciones ? <p className="mt-1">{fase.observaciones}</p> : null}
    </div>
  );
}
