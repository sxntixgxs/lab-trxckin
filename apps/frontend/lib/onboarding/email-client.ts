// Cliente (navegador) de la ruta de notificaciones de onboarding. Solo para los correos
// que necesitan adjuntos generados en el navegador (cierre con PDFs); el resto los
// dispara Convex desde las mutaciones.
import type { OnboardingModulo } from "./roles";

export interface OnboardingEmailAttachment {
  filename: string;
  /** Base64 sin prefijo data: */
  contentBase64: string;
}

export interface NotificarOnboardingOptions {
  modulo: OnboardingModulo;
  tipo: string;
  inscripcionId: string;
  empresa: number;
  tercero: { razonSocial: string; tipoDocumento: string; numeroDocumento: string };
  destinatarios: Array<{ nombre: string; email: string }>;
  datos?: Record<string, unknown>;
  attachments?: OnboardingEmailAttachment[];
}

export type NotificarOnboardingResult =
  | { ok: true; sent: true }
  | { ok: true; sent: false; skipped?: boolean; reason?: string }
  | { ok: false; sent: false; status: number; errors?: string[]; message?: string };

export async function notificarOnboarding(opts: NotificarOnboardingOptions): Promise<NotificarOnboardingResult> {
  try {
    const res = await fetch(`/api/notifications/onboarding/${opts.modulo}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "untracked",
        tipo: opts.tipo,
        inscripcionId: opts.inscripcionId,
        empresa: opts.empresa,
        tercero: opts.tercero,
        destinatarios: opts.destinatarios,
        datos: opts.datos,
        attachments: opts.attachments,
      }),
    });
    let data: Record<string, unknown> = {};
    try {
      data = (await res.json()) as Record<string, unknown>;
    } catch {
      /* cuerpo vacío */
    }
    const message = typeof data.error === "string" ? data.error : typeof data.message === "string" ? data.message : undefined;
    if (data.ok === false || !res.ok) {
      return {
        ok: false,
        sent: false,
        status: res.status,
        errors: Array.isArray(data.errors) ? (data.errors as string[]) : undefined,
        message,
      };
    }
    if (data.sent === false || data.skipped === true) {
      return {
        ok: true,
        sent: false,
        skipped: data.skipped === true,
        reason: typeof data.reason === "string" ? data.reason : "not_sent",
      };
    }
    return { ok: true, sent: true };
  } catch (err) {
    return { ok: false, sent: false, status: 0, message: err instanceof Error ? err.message : "network_error" };
  }
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
