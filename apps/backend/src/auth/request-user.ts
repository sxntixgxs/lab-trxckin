import { UnauthorizedException } from "@nestjs/common";
import type { AuthedRequest, AuthenticatedUser } from "./auth.types";

/** The user WorkosGuard attached (the impersonated one while an admin impersonates). */
export function usuarioDe(request: AuthedRequest): AuthenticatedUser {
  if (!request.user) throw new UnauthorizedException("Not authenticated");
  return request.user;
}
