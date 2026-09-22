export type RolConPermisos = {
  id: number;
  slug: string;
  nombre: string;
  activo: boolean;
  permisos: string[];
};

export const SYSTEM_ROLE_SLUGS = ["admin", "member"] as const;

export function isSystemRoleSlug(slug: string): boolean {
  return (SYSTEM_ROLE_SLUGS as readonly string[]).includes(slug);
}

export function isFullAccessRole(slug: string): boolean {
  return slug === "admin";
}
