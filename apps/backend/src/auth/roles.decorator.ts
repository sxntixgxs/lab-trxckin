import { SetMetadata } from "@nestjs/common";

export const ROLES_KEY = "roles";
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

export const ROLES_CHECK_ACTOR_KEY = "roles:check-actor";
/**
 * Makes RolesGuard authorize against the real signed-in user (the impersonator)
 * instead of the impersonated target. Use on endpoints that act on the
 * impersonation session itself, e.g. POST /auth/impersonate.
 */
export const RolesCheckActor = () => SetMetadata(ROLES_CHECK_ACTOR_KEY, true);
