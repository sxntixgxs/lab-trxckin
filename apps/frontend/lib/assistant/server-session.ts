import { withAuth } from '@workos-inc/authkit-nextjs';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '@/convex/_generated/api';
import { getConvexServerSecret } from '@/lib/convexServerClient';
import { toConvexPrivileges } from '@/lib/convex-privileges';
import { fetchBackend, type CurrentUser } from '@/lib/fetch-backend';
import { EMPRESAS_LIST } from '@/lib/empresas';

export class AssistantHttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function assistantCompanyIds(user: CurrentUser, selected: number | null): number[] {
  const global = user.hasFullAccess || user.acceso_todas_empresas === true;
  const available = global ? EMPRESAS_LIST.map(({ id }) => id) : [...new Set(user.empresas ?? [])];
  if (selected !== null) {
    if (!available.includes(selected)) throw new AssistantHttpError(403, 'Empresa no autorizada.');
    return [selected];
  }
  if (!global) throw new AssistantHttpError(403, 'Selecciona una empresa para iniciar la conversación.');
  return available.sort((a, b) => a - b);
}

/** A new authenticated client per request; never changes auth on the shared server client. */
export async function assistantSession(signal?: AbortSignal) {
  const session = await withAuth();
  if (!session.user || !session.accessToken) throw new AssistantHttpError(401, 'Inicia sesión para usar el asistente.');
  const response = await fetchBackend('/api/v1/auth/me', { signal });
  if (!response.ok)
    throw new AssistantHttpError(response.status === 401 ? 401 : 403, 'No se pudo verificar tu acceso.');
  const user = (await response.json()) as CurrentUser;
  if (!user.activo) throw new AssistantHttpError(403, 'Tu cuenta no está activa.');
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new AssistantHttpError(503, 'El asistente todavía no está configurado.');
  const client = new ConvexHttpClient(url);
  client.setAuth(session.accessToken);
  const secret = getConvexServerSecret();
  await client.mutation(api.users.store, {});
  await client.mutation(api.users.syncPrivileges, {
    secret,
    workosUserId: session.user.id,
    ...toConvexPrivileges(user),
  });
  return { client, secret, user, realUserId: session.user.id, expectedActingUserId: user.id };
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get('origin');
  if (!origin) return;
  // Behind Coolify, request.url can contain the container's bind address.
  // Use the configured public URL, never client-supplied forwarding headers.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  let expectedUrl: URL;
  try {
    expectedUrl = new URL(appUrl || request.url);
  } catch {
    throw new AssistantHttpError(503, 'La URL del asistente no está configurada correctamente.');
  }
  if (expectedUrl.protocol !== 'https:' && expectedUrl.protocol !== 'http:') {
    throw new AssistantHttpError(503, 'La URL del asistente no está configurada correctamente.');
  }
  if (origin !== expectedUrl.origin) {
    throw new AssistantHttpError(403, 'Origen no autorizado.');
  }
}

export function assistantErrorResponse(error: unknown): Response {
  if (error && typeof error === 'object' && 'data' in error && error.data && typeof error.data === 'object') {
    const data = error.data as Record<string, unknown>;
    if (data.code === 'RATE_LIMIT') {
      const retryAfter = typeof data.retryAfter === 'number' ? Math.max(1, Math.ceil(data.retryAfter / 1000)) : 60;
      return Response.json(
        {
          error: typeof data.message === 'string' ? data.message : 'Alcanzaste el límite de uso. Inténtalo más tarde.',
          retryAfter,
        },
        {
          status: 429,
          headers: { 'Cache-Control': 'no-store', 'Retry-After': String(retryAfter) },
        },
      );
    }
  }
  const status = error instanceof AssistantHttpError ? error.status : 500;
  const message =
    error instanceof AssistantHttpError ? error.message : 'No se pudo completar la solicitud. Inténtalo de nuevo.';
  return Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
}
