import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ROLES_CHECK_ACTOR_KEY, ROLES_KEY } from "./roles.decorator";
import type { AuthedRequest } from "./auth.types";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    const roles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, targets);
    if (!roles || roles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const checkActor = this.reflector.getAllAndOverride<boolean>(ROLES_CHECK_ACTOR_KEY, targets);
    // While impersonating, request.user is the target. Endpoints flagged with
    // @RolesCheckActor() are authorized against the admin who is impersonating.
    const user = checkActor ? (request.impersonator ?? request.user) : request.user;
    if (!user) {
      throw new ForbiddenException("No autorizado");
    }
    if (user.hasFullAccess) {
      return true;
    }
    if (!roles.includes(user.rol.slug)) {
      throw new ForbiddenException("No autorizado");
    }
    return true;
  }
}
