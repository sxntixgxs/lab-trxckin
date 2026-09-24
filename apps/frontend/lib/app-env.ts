/**
 * App-level settings read from Next.js environment variables.
 * Defaults are safe placeholders for local development.
 */

const DEFAULT_APP_URL = "http://localhost:3000";
const DEFAULT_EMAIL_FROM = "Notificaciones <notificaciones@example.com>";

/** Public base URL of the app (NEXT_PUBLIC_APP_URL). */
export function getAppUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL?.trim() || DEFAULT_APP_URL).replace(/\/+$/, "");
}

/** Sender used for transactional emails (RESEND_FROM_EMAIL). */
export function getEmailFrom(): string {
  return process.env.RESEND_FROM_EMAIL?.trim() || DEFAULT_EMAIL_FROM;
}

/**
 * Where "Request access" sends people who want modules turned on (NEXT_PUBLIC_ACCESS_REQUEST_URL),
 * e.g. the owner's LinkedIn profile. Only https URLs without credentials; null hides the link.
 * Referenced literally so Next inlines it at build time, client pages included.
 */
export function getAccessRequestUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_ACCESS_REQUEST_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}
