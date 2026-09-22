import { NextResponse } from "next/server";
import { getAppUrl, getEmailFrom } from "@/lib/app-env";
import { render } from "@react-email/render";
import { Resend } from "resend";
import { createElement } from "react";

import AnticipoNotificationEmail, {
  type AnticipoEmailEvento,
  getAnticipoEmailSubject,
} from "@/components/emails/anticipos/AnticipoNotificationEmail";

export const dynamic = "force-dynamic";

type Destinatario = {
  usuarioId?: string;
  nombre: string;
  email: string;
};

type AnticipoNotificationPayload = {
  destinatarios: Array<{
    usuarioId?: string;
    nombre: string;
    email?: string;
  }>;
  evento: AnticipoEmailEvento;
  anticipoId: string;
  consecutivo: number;
  empresa?: number;
  razonSocial: string;
  nit: string;
  valor: number;
  valorLegalizable?: number;
  saldoPendiente: number;
  maxLegalizacionDate: number;
  faseActual: string;
  comentario?: string;
  faseDestino?: string;
};

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const VALID_EVENTS = new Set<AnticipoEmailEvento>([
  "I_SOLICITUD",
  "II_APROBACION_JEFE_DIRECTO",
  "III_REVISION_CONTABILIDAD",
  "IV_APROBACION_GERENCIA",
  "IV_DESEMBOLSO_TESORERIA",
  "V_PENDIENTE_LEGALIZACION",
  "VI_LEGALIZADO",
  "DEVUELTO",
  "RECHAZADO",
  "ANULADO",
  "AJUSTE_APLICADO",
  "AJUSTE_REVERSADO",
]);

function getBaseUrl() {
  return getAppUrl();
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isEmail(email: string) {
  const normalized = normalizeEmail(email);
  const at = normalized.indexOf("@");
  return at > 0 && at < normalized.length - 1 && !normalized.includes(" ");
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function dedupeDestinatarios(
  destinatarios: AnticipoNotificationPayload["destinatarios"]
): Destinatario[] {
  const seen = new Set<string>();
  const out: Destinatario[] = [];

  for (const destinatario of destinatarios) {
    const rawEmail = typeof destinatario.email === "string" ? destinatario.email : "";
    const email = rawEmail ? normalizeEmail(rawEmail) : "";
    if (!isEmail(email) || seen.has(email)) continue;
    seen.add(email);
    out.push({
      usuarioId: destinatario.usuarioId,
      nombre: destinatario.nombre.trim() || "Usuario",
      email,
    });
  }

  return out;
}

export function validateAnticipoNotificationPayload(
  body: unknown
): AnticipoNotificationPayload | null {
  if (!body || typeof body !== "object") return null;
  const payload = body as Partial<AnticipoNotificationPayload>;

  if (!Array.isArray(payload.destinatarios) || payload.destinatarios.length === 0) return null;
  if (!payload.evento || !VALID_EVENTS.has(payload.evento)) return null;
  if (
    !isNonEmptyString(payload.anticipoId) ||
    !isNonEmptyString(payload.razonSocial) ||
    !isNonEmptyString(payload.nit) ||
    !isNonEmptyString(payload.faseActual)
  ) {
    return null;
  }
  if (
    !isFiniteNumber(payload.consecutivo) ||
    !isFiniteNumber(payload.valor) ||
    !isFiniteNumber(payload.saldoPendiente) ||
    !isFiniteNumber(payload.maxLegalizacionDate)
  ) {
    return null;
  }
  if (payload.empresa !== undefined && !isFiniteNumber(payload.empresa)) return null;
  if (payload.valorLegalizable !== undefined && !isFiniteNumber(payload.valorLegalizable)) {
    return null;
  }
  if (payload.comentario !== undefined && typeof payload.comentario !== "string") return null;
  if (payload.faseDestino !== undefined && typeof payload.faseDestino !== "string") return null;

  const destinatarios = payload.destinatarios.filter(
    (destinatario): destinatario is AnticipoNotificationPayload["destinatarios"][number] => {
      if (!destinatario || typeof destinatario !== "object") return false;
      if (typeof destinatario.nombre !== "string") return false;
      if (destinatario.email !== undefined && typeof destinatario.email !== "string") return false;
      if (destinatario.usuarioId !== undefined && typeof destinatario.usuarioId !== "string") {
        return false;
      }
      return true;
    }
  );
  if (destinatarios.length !== payload.destinatarios.length) return null;
  if (dedupeDestinatarios(destinatarios).length === 0) return null;

  return payload as AnticipoNotificationPayload;
}

export async function POST(request: Request) {
  // Server-to-server only (Convex notificacionesAnticipos.ts sends x-notifications-key).
  const { requireInternalSecret } = await import("@/lib/api-route-auth");
  const internalAuth = requireInternalSecret(request, {
    envName: "NOTIFICATIONS_INTERNAL_KEY",
    headerName: "x-notifications-key",
  });
  if (!internalAuth.ok) return internalAuth.response;

  try {
    const payload = validateAnticipoNotificationPayload(await request.json());
    if (!payload) {
      return NextResponse.json(
        { success: false, error: "Payload de notificación inválido." },
        { status: 400 }
      );
    }

    const destinatarios = dedupeDestinatarios(payload.destinatarios);
    if (destinatarios.length === 0) {
      return NextResponse.json({
        success: false,
        error: "No hay destinatarios válidos para notificar.",
      });
    }

    if (!resend) {
      console.error("[ANTICIPOS_NOTIFICACIONES] RESEND_API_KEY no configurada.");
      return NextResponse.json({
        success: false,
        error: "Configuración de Resend no disponible.",
      });
    }

    const link = `${getBaseUrl()}/finance/advances`;
    const subject = getAnticipoEmailSubject(payload.evento, payload.consecutivo);
    const results: Array<{ email: string; success: boolean; error?: string }> = [];

    for (const destinatario of destinatarios) {
      const email = createElement(AnticipoNotificationEmail, {
        userName: destinatario.nombre,
        evento: payload.evento,
        consecutivo: payload.consecutivo,
        empresa: payload.empresa,
        razonSocial: payload.razonSocial,
        nit: payload.nit,
        valor: payload.valor,
        saldoPendiente: payload.saldoPendiente,
        maxLegalizacionDate: payload.maxLegalizacionDate,
        faseActual: payload.faseActual,
        comentario: payload.comentario,
        faseDestino: payload.faseDestino,
        link,
      });

      try {
        const html = await render(email);
        const { error } = await resend.emails.send({
          from: getEmailFrom(),
          to: destinatario.email,
          subject,
          html,
        });

        results.push({
          email: destinatario.email,
          success: !error,
          ...(error ? { error: error.message } : {}),
        });
      } catch (error: unknown) {
        results.push({
          email: destinatario.email,
          success: false,
          error: error instanceof Error ? error.message : "Error enviando email",
        });
      }
    }

    const sent = results.filter((result) => result.success).length;
    return NextResponse.json({
      success: sent > 0,
      total: destinatarios.length,
      sent,
      failed: results.length - sent,
      results,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Error interno enviando notificación";
    console.error("[ANTICIPOS_NOTIFICACIONES] Error crítico:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
