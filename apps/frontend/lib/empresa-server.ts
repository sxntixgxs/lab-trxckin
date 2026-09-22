import { cookies } from "next/headers";
import {
  COOKIE_EMPRESA_ACTIVA,
  resolveEmpresaAccess,
  type EmpresaAccessInput,
} from "@/lib/empresas";
import { getCurrentBackendUser } from "@/lib/fetch-backend";

/**
 * Server-side counterpart of `useEmpresaFilter` (port of dev-pc `lib/empresa-server.ts`):
 * reads the `empresa-activa` cookie written by the sidebar switcher and validates it against
 * the companies the current user may access.
 *
 * Nothing consumes it yet: every page still sends `empresa`/`empresas` explicitly and API
 * routes that receive them validate with `resolveEmpresasPermitidas` /
 * `requireAuthorizedEmpresa`. Use these helpers from server components or route handlers
 * that want the sidebar selection without a client-supplied parameter.
 */

export function parseEmpresaCookie(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Companies to filter by: the cookie's company when the user may see it, otherwise every
 * company of a restricted user, or `[]` (no filter) for a user with global scope.
 */
export function resolveServerEmpresaIds(
  cookieValue: string | null | undefined,
  userEmpresas: number[],
  canAccessAll: boolean,
): number[] {
  const fromCookie = parseEmpresaCookie(cookieValue);
  if (fromCookie !== null && (canAccessAll || userEmpresas.includes(fromCookie))) {
    return [fromCookie];
  }
  if (!canAccessAll) return userEmpresas;
  return [];
}

async function readEmpresaCookie(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(COOKIE_EMPRESA_ACTIVA)?.value;
}

export async function getServerEmpresaArray(user: EmpresaAccessInput): Promise<number[]> {
  const access = resolveEmpresaAccess(user);
  return resolveServerEmpresaIds(await readEmpresaCookie(), access.empresas, access.canAccessAllEmpresas);
}

/** Same as `getServerEmpresaArray`, joined with commas ("" = no filter). */
export async function getServerEmpresaIds(user: EmpresaAccessInput): Promise<string> {
  return (await getServerEmpresaArray(user)).join(",");
}

/**
 * Reads the cookie and, when a backend session exists, validates it against that user.
 * Without a session the raw cookie value is returned unchanged.
 */
export async function getEmpresaActivaCookie(): Promise<string> {
  const raw = (await readEmpresaCookie()) ?? "";
  const user = await getCurrentBackendUser();
  if (!user) return raw;
  return getServerEmpresaIds(user);
}
