/**
 * Deployment-level defaults read from Convex environment variables.
 *
 * Set them with `npx convex env set <NAME> <value>`.
 */

const DEFAULT_FRONTEND_URL = "http://localhost:3000";
const DEFAULT_FALLBACK_CONTACT_EMAIL = "sin-correo@example.com";

/** Public URL of the Next.js app (used for links and server-to-server calls). */
export function frontendUrl(): string {
  return process.env.FRONTEND_URL?.trim() || DEFAULT_FRONTEND_URL;
}

/** Placeholder email used when an actor/owner has no email on record. */
export function fallbackContactEmail(): string {
  return process.env.DEFAULT_CONTACT_EMAIL?.trim() || DEFAULT_FALLBACK_CONTACT_EMAIL;
}

/** Recipients of Graph sync alerts (comma-separated `FACTURACION_GRAPH_MAILBOXES`). */
export function facturacionGraphMailboxes(): string[] {
  return (process.env.FACTURACION_GRAPH_MAILBOXES ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

/** Actor email recorded for automated (system) actions. */
export const SYSTEM_ACTOR_EMAIL = "sistema@example.com";
