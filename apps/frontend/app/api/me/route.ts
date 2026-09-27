import { NextResponse } from 'next/server';
import { withAuth } from '@workos-inc/authkit-nextjs';
import { api } from '@/convex/_generated/api';
import { convexServer, getConvexServerSecret } from '@/lib/convexServerClient';
import { getCurrentBackendUser } from '@/lib/fetch-backend';
import { toConvexPrivileges } from '@/lib/convex-privileges';

export async function GET() {
  const user = await getCurrentBackendUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  return NextResponse.json(user);
}
/**
 * Syncs the caller's privileges (role, permisos, empresas, ...) into their Convex
 * `users` row. The privileges come from the Nest backend (trusted) and the WorkOS user
 * id from the server-side session; nothing is taken from the request body. Convex only
 * accepts this write with CONVEX_SERVER_SECRET (`users.syncPrivileges`).
 */
export async function POST() {
  const { user: sessionUser } = await withAuth();
  const user = sessionUser ? await getCurrentBackendUser() : null;
  if (!sessionUser || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    await convexServer.mutation(api.users.syncPrivileges, {
      secret: getConvexServerSecret(),
      workosUserId: sessionUser.id,
      ...toConvexPrivileges(user),
    });
  } catch (error) {
    console.error('No se pudieron sincronizar los permisos en Convex', error);
    return NextResponse.json({ error: 'No se pudo sincronizar el usuario' }, { status: 500 });
  }

  return NextResponse.json(user);
}
