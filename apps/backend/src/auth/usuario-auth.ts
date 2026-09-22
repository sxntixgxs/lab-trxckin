import { ADMIN_ROLE_SLUG, type AuthenticatedUser } from "./auth.types";

/**
 * Loads everything the guard needs about a usuario in one query. `rol.permisos`
 * is nested here on purpose: fetching it separately cost an extra round trip on
 * every authenticated request, which is ~100 ms against a remote Postgres.
 * `rol` uses `include`, so all its scalars (including `rol.activo`, checked by
 * WorkosGuard) are loaded too.
 */
export const USUARIO_AUTH_INCLUDE = {
  rol: { include: { permisos: { where: { activo: true }, select: { ruta: true } } } },
  proceso: { select: { id: true, nombre: true, lider_user_id: true } },
  jefeDirecto: { select: { id: true, nombre: true, email: true } },
  procesosLider: { select: { id: true } },
  empresas: { select: { id_empresa: true } },
} as const;

export function toAuthenticatedUser<
  T extends {
    rol: { slug: string; permisos: readonly { ruta: string }[] };
  },
>(usuario: T): T & Pick<AuthenticatedUser, "permisos" | "hasFullAccess"> {
  return {
    ...usuario,
    permisos: usuario.rol.permisos.map((row) => row.ruta),
    hasFullAccess: usuario.rol.slug === ADMIN_ROLE_SLUG,
  };
}

export function serializeAuthUser(
  user: AuthenticatedUser,
  extras: {
    isImpersonating?: boolean;
    originalUser?: { id: string; nombre: string; email: string } | null;
  } = {},
) {
  const empresas = (user.empresas ?? []).map((item) => item.id_empresa);
  const liderProceso =
    (user.procesosLider?.length ?? 0) > 0 || user.proceso?.lider_user_id === user.id;

  return {
    id: user.id,
    workosUserId: user.workosUserId,
    email: user.email,
    nombre: user.nombre,
    activo: user.activo,
    cargo: user.cargo ?? null,
    id_proceso: user.proceso?.id ?? user.id_proceso ?? null,
    lider_proceso: liderProceso,
    acceso_todas_empresas: user.acceso_todas_empresas ?? true,
    empresas,
    rol: {
      id: user.rol.id,
      slug: user.rol.slug,
      nombre: user.rol.nombre,
    },
    proceso: user.proceso ? { id: user.proceso.id, nombre: user.proceso.nombre } : null,
    jefeDirecto: user.jefeDirecto ?? null,
    permisos: user.hasFullAccess ? ["*"] : user.permisos,
    hasFullAccess: user.hasFullAccess,
    isImpersonating: extras.isImpersonating === true,
    originalUser: extras.originalUser ?? null,
  };
}
