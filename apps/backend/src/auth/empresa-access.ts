import { ForbiddenException } from "@nestjs/common";
import type { AuthenticatedUser } from "./auth.types";

/** The app's companies (apps/frontend/lib/empresas.ts). Any other id fails closed. */
export const EMPRESAS_APP = [1, 2, 3, 4] as const;

type UsuarioConEmpresas = Pick<AuthenticatedUser, "hasFullAccess" | "acceso_todas_empresas" | "empresas">;

/**
 * Company scope, mirroring the BFF (requireAuthorizedEmpresa in apps/frontend/lib/api-route-auth.ts):
 * users with global access see every company, the rest only their UsuarioEmpresa rows.
 */
export function puedeAccederEmpresa(user: UsuarioConEmpresas, empresa: number): boolean {
  if (!(EMPRESAS_APP as readonly number[]).includes(empresa)) return false;
  if (user.hasFullAccess || user.acceso_todas_empresas === true) return true;
  return (user.empresas ?? []).some((item) => item.id_empresa === empresa);
}

export function assertEmpresaAccesible(user: UsuarioConEmpresas | undefined, empresa: number): void {
  if (!user || !puedeAccederEmpresa(user, empresa)) {
    throw new ForbiddenException("Empresa no autorizada");
  }
}

/** The companies (out of `empresas`) the user may see. */
export function empresasAccesibles(user: UsuarioConEmpresas, empresas: readonly number[] = EMPRESAS_APP): number[] {
  return empresas.filter((empresa) => puedeAccederEmpresa(user, empresa));
}
