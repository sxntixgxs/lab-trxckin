import { NextResponse } from "next/server";
import { Resend } from "resend";
import type { Id } from "@/convex/_generated/dataModel";
import { requireSessionOrInternalSecret, userHasAccess } from "@/lib/api-route-auth";
import { deliverTrackedEmail, sendUntrackedEmails, validateOnboardingNotificationPayload } from "@/lib/onboarding/email-service";
import { ONBOARDING_PERMISO_POR_MODULO, type OnboardingModulo } from "@/lib/onboarding/roles";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

/**
 * Handler compartido de `POST /api/notifications/onboarding/{supplier|customer}`.
 * - `kind: "tracked"`: solo con la clave interna (Convex); renderiza y envía un intento registrado.
 * - `kind: "untracked"`: clave interna o sesión con permiso del módulo; los adjuntos solo con sesión.
 */
export async function handleOnboardingNotificationRequest(request: Request, modulo: OnboardingModulo): Promise<Response> {
  const auth = await requireSessionOrInternalSecret(request, {
    envName: "NOTIFICATIONS_INTERNAL_KEY",
    headerName: "x-notifications-key",
  });
  if (!auth.ok) return auth.response;
  const isSession = auth.user !== null;
  if (isSession && !userHasAccess(auth.user, ONBOARDING_PERMISO_POR_MODULO[modulo])) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = validateOnboardingNotificationPayload(modulo, body, { allowAttachments: isSession });
  if (!parsed.ok) return NextResponse.json({ ok: false, sent: false, error: parsed.error }, { status: 400 });
  const payload = parsed.payload;

  if (payload.kind === "tracked") {
    if (isSession) {
      return NextResponse.json({ error: "El envío rastreado solo lo dispara el servidor" }, { status: 403 });
    }
    const result = await deliverTrackedEmail({
      resend,
      modulo,
      correoId: payload.correoId as Id<"onboardingCorreos">,
      token: payload.token,
    });
    if (!result.ok) {
      return NextResponse.json({ ok: false, sent: false, error: result.error, correoId: result.correoId }, { status: 502 });
    }
    return NextResponse.json(result);
  }

  if (payload.destinatarios.length === 0) {
    return NextResponse.json({ ok: true, sent: false, reason: "no_destinatarios" });
  }
  if (!resend) {
    console.warn("[onboarding notif] RESEND_API_KEY no configurada.");
    return NextResponse.json({ ok: true, sent: false, skipped: true, reason: "resend_not_configured" });
  }

  const { errors } = await sendUntrackedEmails({
    resend,
    modulo,
    tipo: payload.tipo,
    tercero: payload.tercero,
    destinatarios: payload.destinatarios,
    empresa: payload.empresa,
    inscripcionId: payload.inscripcionId,
    token: payload.token,
    datos: payload.datos,
    attachments: payload.attachments,
  });
  if (errors.length > 0) {
    return NextResponse.json({ ok: false, sent: false, errors }, { status: 207 });
  }
  return NextResponse.json({ ok: true, sent: true });
}
