import { requireInternalSecret } from "@/lib/api-route-auth";
import { getAppUrl, getEmailFrom } from "@/lib/app-env";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { render } from "@react-email/render";
import { Resend } from "resend";
import { createElement } from "react";

import FacturacionFaseNotificationEmail, {
  type FacturacionEmailFase,
  getFacturacionFaseEmailSubject,
} from "@/components/emails/facturacion/FacturacionFaseNotificationEmail";

type Destinatario = {
  usuarioId?: string;
  nombre: string;
  email: string;
};

type FacturacionNotificationPayload = {
  destinatarios: Destinatario[];
  fase: FacturacionEmailFase;
  facturaId: string;
  tareaId?: string;
  empresa?: number;
  facturaNumero: string;
  proveedorNombre: string;
  proveedorNit?: string;
  total: number;
  moneda: string;
  fechaEmision: string;
  fechaVencimiento?: string;
  comentario?: string;
};

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const VALID_PHASES = new Set<FacturacionEmailFase>([
  "recepcion",
  "revision_lider",
  "jefe_directo",
  "causacion",
  "revision_impuestos",
  "eventos_dian",
  "gerencia",
  "revision_tesoreria",
  "pagada",
  "legalizada",
  "cerrada",
  "rechazada_dian",
]);

const TERMINAL_PHASES = new Set<FacturacionEmailFase>([
  "pagada",
  "legalizada",
  "cerrada",
  "rechazada_dian",
]);

function getBaseUrl() {
  return getAppUrl();
}

function getNotificationLink(fase: FacturacionEmailFase, facturaId: string) {
  const baseUrl = getBaseUrl();
  if (TERMINAL_PHASES.has(fase)) {
    return `${baseUrl}/billing/invoices/${facturaId}`;
  }
  return `${baseUrl}/billing/inbox`;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function dedupeDestinatarios(destinatarios: Destinatario[]) {
  const seen = new Set<string>();
  const out: Destinatario[] = [];

  for (const destinatario of destinatarios) {
    const email = normalizeEmail(destinatario.email ?? "");
    if (!email || seen.has(email)) continue;
    seen.add(email);
    out.push({
      usuarioId: destinatario.usuarioId,
      nombre: destinatario.nombre || "Usuario",
      email,
    });
  }

  return out;
}

function validatePayload(body: unknown): FacturacionNotificationPayload | null {
  if (!body || typeof body !== "object") return null;
  const payload = body as Partial<FacturacionNotificationPayload>;
  if (!Array.isArray(payload.destinatarios)) return null;
  if (!payload.fase || !VALID_PHASES.has(payload.fase)) return null;
  if (!payload.facturaId || !payload.facturaNumero || !payload.proveedorNombre) {
    return null;
  }
  if (payload.empresa !== undefined && !Number.isFinite(payload.empresa)) {
    return null;
  }
  if (!Number.isFinite(payload.total) || !payload.moneda || !payload.fechaEmision) {
    return null;
  }
  return payload as FacturacionNotificationPayload;
}

export async function POST(request: Request) {
  // Server-to-server only (Convex notificacionesFacturacion.ts sends x-notifications-key).
  const internalAuth = requireInternalSecret(request, {
    envName: "NOTIFICATIONS_INTERNAL_KEY",
    headerName: "x-notifications-key",
  });
  if (!internalAuth.ok) return internalAuth.response;

  try {
    const payload = validatePayload(await request.json());
    if (!payload) {
      return NextResponse.json(
        { success: false, error: "Payload de notificación inválido." },
        { status: 400 },
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
      console.error("[FACTURACION_NOTIFICACIONES] RESEND_API_KEY no configurada.");
      return NextResponse.json({
        success: false,
        error: "Configuración de Resend no disponible.",
      });
    }

    const link = getNotificationLink(payload.fase, payload.facturaId);
    const subject = getFacturacionFaseEmailSubject(
      payload.fase,
      payload.facturaNumero,
    );
    const results: Array<{ email: string; success: boolean; error?: string }> = [];

    for (const destinatario of destinatarios) {
      const email = createElement(FacturacionFaseNotificationEmail, {
        userName: destinatario.nombre,
        fase: payload.fase,
        facturaNumero: payload.facturaNumero,
        proveedorNombre: payload.proveedorNombre,
        proveedorNit: payload.proveedorNit,
        total: payload.total,
        moneda: payload.moneda,
        fechaEmision: payload.fechaEmision,
        fechaVencimiento: payload.fechaVencimiento,
        link,
        comentario: payload.comentario,
        empresa: payload.empresa,
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
    console.error("[FACTURACION_NOTIFICACIONES] Error crítico:", message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
