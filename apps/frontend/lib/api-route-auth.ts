import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { withAuth } from "@workos-inc/authkit-nextjs";
import {
  getCurrentBackendUser,
  userHasPermission,
  type CurrentUser,
} from "@/lib/fetch-backend";
import { toBillingSession, type BillingSession } from "@/lib/billing-session";
import { EMPRESAS_LIST, hasGlobalEmpresaAccess } from "@/lib/empresas";

type AuthFailure = { ok: false; response: NextResponse };

export type ApiSessionResult =
  | { ok: true; session: BillingSession; user: CurrentUser }
  | AuthFailure;

export type BackendApiSessionResult =
  | {
      ok: true;
      session: BillingSession;
      user: CurrentUser;
      accessToken: string;
    }
  | AuthFailure;

const unauthorized = () =>
  NextResponse.json({ error: "No autorizado" }, { status: 401 });

export async function requireApiSession(): Promise<ApiSessionResult> {
  const user = await getCurrentBackendUser();
  if (!user) {
    return { ok: false, response: unauthorized() };
  }
  return { ok: true, session: toBillingSession(user), user };
}

export async function requireBackendApiSession(): Promise<BackendApiSessionResult> {
  const result = await requireApiSession();
  if (!result.ok) return result;

  const { accessToken } = await withAuth();
  if (!accessToken) {
    return { ok: false, response: unauthorized() };
  }

  return {
    ok: true,
    session: result.session,
    user: result.user,
    accessToken,
  };
}

interface InternalSecretOptions {
  envName: string;
  headerName?: string;
  bearer?: boolean;
}

function constantTimeEqual(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }
  return timingSafeEqual(actualBuffer, expectedBuffer);
}

export function requireInternalSecret(
  request: Request,
  options: InternalSecretOptions,
): { ok: true } | AuthFailure {
  const expected = process.env[options.envName];
  if (!expected) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Servicio interno no configurado" },
        { status: 500 },
      ),
    };
  }

  let actual = "";
  if (options.bearer) {
    const authorization = request.headers.get("authorization") ?? "";
    const [scheme, token] = authorization.split(" ", 2);
    if (scheme.toLowerCase() === "bearer") actual = token ?? "";
  } else if (options.headerName) {
    actual = request.headers.get(options.headerName) ?? "";
  }

  if (!actual || !constantTimeEqual(actual, expected)) {
    return { ok: false, response: unauthorized() };
  }

  return { ok: true };
}

/**
 * Accepts either an authenticated staff session or the shared internal secret
 * (Convex → Next). Returns the session when present so callers can check permissions.
 */
export async function requireSessionOrInternalSecret(
  request: Request,
  options: InternalSecretOptions,
): Promise<ApiSessionResult | { ok: true; session: null; user: null }> {
  const secretResult = requireInternalSecret(request, options);
  if (secretResult.ok) return { ok: true, session: null, user: null };
  const sessionResult = await requireApiSession();
  if (sessionResult.ok) return sessionResult;
  return sessionResult;
}

export function requireAuthorizedEmpresa(
  session: BillingSession,
  requestedEmpresa: string | number | null | undefined,
): { ok: true; empresaId: number | null } | AuthFailure {
  if (requestedEmpresa === undefined || requestedEmpresa === null || requestedEmpresa === "") {
    return { ok: true, empresaId: null };
  }

  const empresaId =
    typeof requestedEmpresa === "number"
      ? requestedEmpresa
      : Number.parseInt(requestedEmpresa, 10);

  if (!Number.isInteger(empresaId) || empresaId <= 0) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Empresa inválida" }, { status: 400 }),
    };
  }

  const empresas = session.user.empresas ?? EMPRESAS_LIST.map((empresa) => empresa.id);
  const hasGlobalAccess = hasGlobalEmpresaAccess(
    session.user.id_rol,
    session.user.acceso_todas_empresas,
  );

  if (!hasGlobalAccess && !empresas.includes(empresaId)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Empresa no autorizada" },
        { status: 403 },
      ),
    };
  }

  return { ok: true, empresaId };
}

/**
 * Permission checks against a user the caller already fetched. Route handlers
 * should prefer these over `checkServerAccess`, which refetches `/auth/me` —
 * a full round trip to Postgres — for every permission it is asked about.
 */
export function userHasAccess(user: CurrentUser, ruta: string): boolean {
  return userHasPermission(user, ruta);
}

export function userHasAccessToAny(user: CurrentUser, rutas: string[]): boolean {
  return rutas.some((ruta) => userHasPermission(user, ruta));
}

export async function checkServerAccessToAny(rutas: string[]): Promise<boolean> {
  const user = await getCurrentBackendUser();
  if (!user) return false;
  return userHasAccessToAny(user, rutas);
}
