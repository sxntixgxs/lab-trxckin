import { cache } from "react";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { IMPERSONATE_HEADER, readImpersonateCookie } from "@/lib/impersonate-cookie";

function resolveBackendUrl(): string {
  const url = process.env.BACKEND_URL;
  if (url) return url;
  if (process.env.NODE_ENV === "production") {
    throw new Error("BACKEND_URL is not set.");
  }
  return "http://localhost:8000";
}

type FetchBackendOptions = RequestInit & {
  skipImpersonation?: boolean;
};

export async function fetchBackend(path: string, options: FetchBackendOptions = {}): Promise<Response> {
  const { skipImpersonation, ...init } = options;
  const { accessToken } = await withAuth();
  if (!accessToken) {
    throw new Error("Not authenticated");
  }

  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  headers.set("Authorization", `Bearer ${accessToken}`);

  if (!skipImpersonation) {
    const impersonation = await readImpersonateCookie();
    if (impersonation) {
      headers.set(IMPERSONATE_HEADER, impersonation.targetUserId);
    }
  }

  return fetch(`${resolveBackendUrl()}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });
}

export type CurrentUser = {
  id: string;
  workosUserId: string;
  email: string;
  nombre: string;
  activo: boolean;
  cargo?: string | null;
  id_proceso?: number | null;
  lider_proceso?: boolean;
  acceso_todas_empresas?: boolean;
  empresas?: number[];
  rol: {
    id: number;
    slug: string;
    nombre: string;
  };
  proceso?: {
    id: number;
    nombre: string;
  } | null;
  jefeDirecto?: {
    id: string;
    nombre: string;
    email: string;
  } | null;
  permisos: string[];
  hasFullAccess: boolean;
  isImpersonating?: boolean;
  originalUser?: {
    id: string;
    nombre: string;
    email: string;
  } | null;
};

/**
 * Deduplicated per request render. The key is a primitive on purpose: `cache()`
 * memoizes on argument identity, so an options object would miss on every call.
 * Outside a render (route handlers) `cache()` is a transparent no-op, so route
 * handlers must still avoid calling this more than once themselves — pass the
 * user around, or use `userHasAccess` from `lib/api-route-auth`.
 */
const loadCurrentBackendUser = cache(
  async (skipImpersonation: boolean): Promise<CurrentUser | null> => {
    const { accessToken } = await withAuth();
    if (!accessToken) {
      return null;
    }

    try {
      const response = await fetchBackend("/api/v1/auth/me", { skipImpersonation });
      if (!response.ok) {
        return null;
      }
      return (await response.json()) as CurrentUser;
    } catch {
      return null;
    }
  },
);

export function getCurrentBackendUser(options: {
  skipImpersonation?: boolean;
} = {}): Promise<CurrentUser | null> {
  return loadCurrentBackendUser(options.skipImpersonation === true);
}

export function userHasPermission(user: CurrentUser, requiredPermission: string): boolean {
  if (user.hasFullAccess || user.permisos.includes("*")) {
    return true;
  }
  return user.permisos.includes(requiredPermission);
}

export async function checkServerAccess(requiredPermission: string): Promise<boolean> {
  const user = await getCurrentBackendUser();
  if (!user) {
    return false;
  }
  return userHasPermission(user, requiredPermission);
}
