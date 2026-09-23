import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { AuthedRequest, AuthenticatedUser } from "./auth.types";
import { PERMISOS_KEY } from "./permisos.decorator";

export function tieneAlgunPermiso(
  user: Pick<AuthenticatedUser, "hasFullAccess" | "permisos">,
  rutas: readonly string[],
): boolean {
  if (rutas.length === 0 || user.hasFullAccess) return true;
  return rutas.some((ruta) => user.permisos.includes(ruta));
}

/**
 * Route-permission check for endpoints behind pages that can be granted to any role (Accesos).
 * Like RolesGuard, it authorizes `request.user`, which is the impersonated user while an admin
 * impersonates. Must run after WorkosGuard.
 */
@Injectable()
export class PermisosGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const rutas = this.reflector.getAllAndOverride<string[]>(PERMISOS_KEY, [context.getHandler(), context.getClass()]);
    if (!rutas || rutas.length === 0) return true;
    const user = context.switchToHttp().getRequest<AuthedRequest>().user;
    if (!user || !tieneAlgunPermiso(user, rutas)) {
      throw new ForbiddenException("No autorizado");
    }
    return true;
  }
}
