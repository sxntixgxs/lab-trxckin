import type { CurrentUser } from "@/lib/fetch-backend";

/** Trusted Nest profile projection shared by session sync and assistant coordination. */
export function toConvexPrivileges(user: CurrentUser) {
  return {
    nestUserId: user.id,
    actorEmail: user.email,
    name: user.nombre,
    role: user.rol.slug === "admin" ? ("admin" as const) : ("member" as const),
    permisos: user.permisos,
    hasFullAccess: user.hasFullAccess,
    procesoId: user.proceso?.id,
    procesoNombre: user.proceso?.nombre,
    cargo: user.cargo ?? undefined,
    jefeDirectoUserId: user.jefeDirecto?.id,
    liderProceso: user.lider_proceso,
    empresas: user.empresas,
    accesoTodasEmpresas: user.acceso_todas_empresas ?? user.hasFullAccess,
  };
}
