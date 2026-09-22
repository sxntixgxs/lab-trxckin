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
