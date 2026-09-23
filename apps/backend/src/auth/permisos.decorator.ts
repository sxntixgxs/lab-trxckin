import { SetMetadata } from "@nestjs/common";

export const PERMISOS_KEY = "permisos";

/**
 * Requires at least one of these route permissions (PermisoRol.ruta, e.g. "suppliers/onboarding").
 * Admins always pass. Use with PermisosGuard, after WorkosGuard.
 */
export const Permisos = (...rutas: string[]) => SetMetadata(PERMISOS_KEY, rutas);
