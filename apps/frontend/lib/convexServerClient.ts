import { ConvexHttpClient } from "convex/browser";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

if (!convexUrl) {
  throw new Error(
    "NEXT_PUBLIC_CONVEX_URL variable de entorno no definida. " +
      "Consigue la URL de despliegue desde el dashboard de Convex.",
  );
}

export const convexServer = new ConvexHttpClient(convexUrl);

/**
 * Shared secret for server-to-server Convex calls. Convex functions that are only
 * meant to be called by trusted Next.js server code verify it with
 * `requireServerSecret` (convex/lib/auth.ts). Must be set to the same value in the
 * Next.js env and in the Convex deployment env (`npx convex env set CONVEX_SERVER_SECRET ...`).
 */
export function getConvexServerSecret(): string {
  const secret = process.env.CONVEX_SERVER_SECRET;
  if (!secret) {
    throw new Error("CONVEX_SERVER_SECRET no está configurada");
  }
  return secret;
}
