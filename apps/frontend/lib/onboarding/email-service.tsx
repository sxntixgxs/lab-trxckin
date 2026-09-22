import { Buffer } from "node:buffer";
import { render } from "@react-email/render";
import { createElement } from "react";
import type { Resend } from "resend";
import OnboardingEmail from "@/components/emails/onboarding/OnboardingEmail";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getAppUrl, getEmailFrom } from "@/lib/app-env";
import { getFormBranding } from "@/lib/onboarding/branding";
import { convexServer, getConvexServerSecret } from "@/lib/convexServerClient";
import {
  emailTipoConfig,
  esTipoInterno,
  esTipoTercero,
  isEmailTipoDeModulo,
  type DestinatarioTipo,
  type OnboardingEmailProps,
} from "@/lib/onboarding/email-types";
import { buildInternalOnboardingUrl, buildPublicOnboardingUrl } from "@/lib/onboarding/links";
import type { OnboardingModulo } from "@/lib/onboarding/roles";

export type Tercero = { razonSocial: string; tipoDocumento: string; numeroDocumento: string };
export type Destinatario = { nombre: string; email: string };
export type EmailAttachment = { filename: string; content: Buffer };

export type TrackedSendResult =
  | { ok: true; sent: true; correoId: Id<"onboardingCorreos">; estado: string; resendEmailId?: string }
  | { ok: true; sent: false; skipped: true; reason: string; correoId?: Id<"onboardingCorreos">; estado?: string }
  | { ok: false; sent: false; correoId?: Id<"onboardingCorreos">; estado?: string; error: string };

const MAX_ATTACHMENTS_BYTES = 4 * 1024 * 1024;

export function buildSubject(modulo: OnboardingModulo, tipo: string, empresa: number, tipoSolicitud?: string): string {
  const branding = getFormBranding(empresa);
  const tramite = tipoSolicitud === "ACTUALIZACIÓN" ? "[Actualización] " : tipoSolicitud === "INSCRIPCIÓN" ? "[Inscripción] " : "";
  const moduloLabel = modulo === "supplier" ? "Inscripción proveedores" : "Inscripción clientes";
  return `${branding.nombreCorto} · ${moduloLabel} · ${tramite}${emailTipoConfig(modulo, tipo).asunto}`;
}

function tipoTramiteDe(datos?: Record<string, unknown>): "INSCRIPCIÓN" | "ACTUALIZACIÓN" | undefined {
  const raw = datos?.tipoSolicitud;
  return raw === "ACTUALIZACIÓN" || raw === "INSCRIPCIÓN" ? raw : undefined;
}

export function buildEmailProps(args: {
  modulo: OnboardingModulo;
  tipo: string;
  destinatarioNombre: string;
  destinatarioTipo: DestinatarioTipo;
  tercero: Tercero;
  empresa: number;
  inscripcionId: string;
  token?: string;
  datos?: Record<string, unknown>;
}): OnboardingEmailProps {
  const { modulo, tipo, datos } = args;
  const baseUrl = getAppUrl();
  let ctaUrl: string | undefined;
  if (args.destinatarioTipo === "tercero" && args.token) {
    ctaUrl = buildPublicOnboardingUrl(baseUrl, {
      modulo,
      scope: tipo === "PENDIENTE_FIRMA" ? "SIGN" : "FORM",
      inscripcionId: args.inscripcionId,
      token: args.token,
    });
  } else if (args.destinatarioTipo === "interno" && (esTipoInterno(modulo, tipo) || !esTipoTercero(modulo, tipo))) {
    ctaUrl = buildInternalOnboardingUrl(baseUrl, modulo);
  }
  return {
    modulo,
    tipo,
    destinatarioNombre: args.destinatarioNombre,
    razonSocial: args.tercero.razonSocial,
    tipoDocumento: args.tercero.tipoDocumento,
    numeroDocumento: args.tercero.numeroDocumento,
    tipoTramite: tipoTramiteDe(datos),
    ctaUrl,
    destinatarioTipo: args.destinatarioTipo,
    docLabel: typeof datos?.docLabel === "string" ? datos.docLabel : undefined,
    observaciones: typeof datos?.observaciones === "string" ? datos.observaciones : undefined,
    motivoRechazo: typeof datos?.motivoRechazo === "string" ? datos.motivoRechazo : undefined,
    tieneFormularioPdf: datos?.tieneFormularioPdf === true,
    tieneReporteTiemposPdf: datos?.tieneReporteTiemposPdf === true,
    empresa: args.empresa,
  };
}

export async function renderOnboardingEmail(props: OnboardingEmailProps): Promise<string> {
  return await render(createElement(OnboardingEmail, props));
}

/** Envío rastreado de un intento ya registrado en Convex (llamado por la acción de Convex). */
export async function deliverTrackedEmail(args: {
  resend: Resend | null;
  modulo: OnboardingModulo;
  correoId: Id<"onboardingCorreos">;
  token: string;
}): Promise<TrackedSendResult> {
  const secret = getConvexServerSecret();
  const payload = await convexServer.query(api.onboarding.correos.obtenerCorreoParaEnvio, {
    secret,
    correoId: args.correoId,
  });
  if (!payload) return { ok: true, sent: false, skipped: true, reason: "already_sent_or_missing" };
  if (payload.inscripcion.modulo !== args.modulo) {
    return { ok: false, sent: false, correoId: args.correoId, error: "El correo no pertenece a este módulo." };
  }
  const { correo, inscripcion } = payload;

  if (!args.resend) {
    const result = await convexServer.mutation(api.onboarding.correos.registrarResultadoResendApi, {
      secret,
      correoId: correo._id,
      error: "RESEND_API_KEY no configurada.",
    });
    return { ok: true, sent: false, skipped: true, reason: "resend_not_configured", correoId: correo._id, estado: result.estado };
  }

  const props = buildEmailProps({
    modulo: args.modulo,
    tipo: correo.tipoNotificacion,
    destinatarioNombre: correo.destinatarioNombre,
    destinatarioTipo: "tercero",
    tercero: inscripcion,
    empresa: inscripcion.empresa,
    inscripcionId: inscripcion._id,
    token: args.token,
    datos: { tipoSolicitud: inscripcion.tipoSolicitud },
  });

  try {
    const html = await renderOnboardingEmail(props);
    const { data, error } = await args.resend.emails.send(
      {
        from: getEmailFrom(),
        to: correo.destinatarioEmail,
        subject: buildSubject(args.modulo, correo.tipoNotificacion, inscripcion.empresa, inscripcion.tipoSolicitud),
        html,
        tags: [
          { name: "workflow", value: "onboarding" },
          { name: "modulo", value: args.modulo },
          { name: "correoId", value: correo._id },
          { name: "handoff", value: correo.handoff },
        ],
      },
      { idempotencyKey: `onboarding-${correo._id}-${correo.numeroIntento}` },
    );
    if (error) {
      const result = await convexServer.mutation(api.onboarding.correos.registrarResultadoResendApi, {
        secret,
        correoId: correo._id,
        error: error.message,
      });
      return { ok: false, sent: false, correoId: correo._id, estado: result.estado, error: error.message };
    }
    const result = await convexServer.mutation(api.onboarding.correos.registrarResultadoResendApi, {
      secret,
      correoId: correo._id,
      resendEmailId: data?.id,
    });
    return { ok: true, sent: true, correoId: correo._id, estado: result.estado, resendEmailId: data?.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error inesperado al enviar correo.";
    const result = await convexServer.mutation(api.onboarding.correos.registrarResultadoResendApi, {
      secret,
      correoId: correo._id,
      error: message,
    });
    return { ok: false, sent: false, correoId: correo._id, estado: result.estado, error: message };
  }
}

/** Envío no rastreado a varios destinatarios (avisos al tercero o al equipo interno). */
export async function sendUntrackedEmails(args: {
  resend: Resend;
  modulo: OnboardingModulo;
  tipo: string;
  tercero: Tercero;
  destinatarios: Destinatario[];
  empresa: number;
  inscripcionId: string;
  token?: string;
  datos?: Record<string, unknown>;
  attachments?: EmailAttachment[];
}): Promise<{ errors: string[] }> {
  const errors: string[] = [];
  const destinatarioTipo: DestinatarioTipo = esTipoTercero(args.modulo, args.tipo)
    ? args.datos?.destinatarioTipo === "interno"
      ? "interno"
      : "tercero"
    : args.datos?.destinatarioTipo === "tercero"
      ? "tercero"
      : "interno";
  const subject = buildSubject(args.modulo, args.tipo, args.empresa, tipoTramiteDe(args.datos));
  for (const dest of args.destinatarios) {
    try {
      const props = buildEmailProps({
        modulo: args.modulo,
        tipo: args.tipo,
        destinatarioNombre: dest.nombre,
        destinatarioTipo,
        tercero: args.tercero,
        empresa: args.empresa,
        inscripcionId: args.inscripcionId,
        token: destinatarioTipo === "tercero" ? args.token : undefined,
        datos: args.datos,
      });
      const html = await renderOnboardingEmail(props);
      const { error } = await args.resend.emails.send({
        from: getEmailFrom(),
        to: dest.email,
        subject,
        html,
        ...(args.attachments && args.attachments.length > 0 ? { attachments: args.attachments } : {}),
      });
      if (error) errors.push(dest.email);
    } catch (err) {
      console.error("[onboarding notif] Error enviando a", dest.email, err);
      errors.push(dest.email);
    }
  }
  return { errors };
}

// ─── Validación del payload de la ruta ───────────────────────────────────────

export type TrackedPayload = { kind: "tracked"; correoId: string; token: string };
export type UntrackedPayload = {
  kind: "untracked";
  tipo: string;
  inscripcionId: string;
  empresa: number;
  tercero: Tercero;
  destinatarios: Destinatario[];
  token?: string;
  datos?: Record<string, unknown>;
  attachments?: EmailAttachment[];
};
export type OnboardingNotificationPayload = TrackedPayload | UntrackedPayload;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
function isEmail(value: unknown): value is string {
  if (!isNonEmptyString(value)) return false;
  const at = value.indexOf("@");
  return at > 0 && at < value.length - 1 && !value.includes(" ");
}

export function validateOnboardingNotificationPayload(
  modulo: OnboardingModulo,
  body: unknown,
  options: { allowAttachments: boolean },
): { ok: true; payload: OnboardingNotificationPayload } | { ok: false; error: string } {
  if (!isRecord(body)) return { ok: false, error: "Payload inválido" };
  if (body.kind === "tracked") {
    if (!isNonEmptyString(body.correoId) || !isNonEmptyString(body.token)) {
      return { ok: false, error: "correoId y token son requeridos" };
    }
    return { ok: true, payload: { kind: "tracked", correoId: body.correoId, token: body.token } };
  }
  if (body.kind !== "untracked") return { ok: false, error: "kind inválido" };
  if (!isNonEmptyString(body.tipo) || !isEmailTipoDeModulo(modulo, body.tipo)) {
    return { ok: false, error: "tipo de notificación inválido" };
  }
  if (!isNonEmptyString(body.inscripcionId)) return { ok: false, error: "inscripcionId requerido" };
  if (typeof body.empresa !== "number" || !Number.isInteger(body.empresa)) return { ok: false, error: "empresa inválida" };
  const t = body.tercero;
  if (!isRecord(t) || !isNonEmptyString(t.razonSocial) || !isNonEmptyString(t.tipoDocumento) || !isNonEmptyString(t.numeroDocumento)) {
    return { ok: false, error: "tercero inválido" };
  }
  if (!Array.isArray(body.destinatarios)) return { ok: false, error: "destinatarios requeridos" };
  const destinatarios: Destinatario[] = [];
  const seen = new Set<string>();
  for (const d of body.destinatarios) {
    if (!isRecord(d) || !isEmail(d.email)) continue;
    const email = d.email.trim().toLowerCase();
    if (seen.has(email)) continue;
    seen.add(email);
    destinatarios.push({ email, nombre: isNonEmptyString(d.nombre) ? d.nombre.trim() : email });
  }
  let attachments: EmailAttachment[] | undefined;
  if (Array.isArray(body.attachments) && body.attachments.length > 0) {
    if (!options.allowAttachments) return { ok: false, error: "Los adjuntos solo se aceptan con sesión de usuario" };
    attachments = [];
    let total = 0;
    for (const a of body.attachments) {
      if (!isRecord(a) || !isNonEmptyString(a.filename) || !isNonEmptyString(a.contentBase64)) continue;
      if (!/\.pdf$/i.test(a.filename)) return { ok: false, error: "Solo se aceptan adjuntos PDF" };
      const content = Buffer.from(a.contentBase64, "base64");
      total += content.byteLength;
      if (total > MAX_ATTACHMENTS_BYTES) return { ok: false, error: "Los adjuntos exceden 4 MB" };
      attachments.push({ filename: a.filename, content });
    }
  }
  return {
    ok: true,
    payload: {
      kind: "untracked",
      tipo: body.tipo,
      inscripcionId: body.inscripcionId,
      empresa: body.empresa,
      tercero: { razonSocial: t.razonSocial, tipoDocumento: t.tipoDocumento, numeroDocumento: t.numeroDocumento },
      destinatarios,
      token: isNonEmptyString(body.token) ? body.token : undefined,
      datos: isRecord(body.datos) ? body.datos : undefined,
      attachments,
    },
  };
}
