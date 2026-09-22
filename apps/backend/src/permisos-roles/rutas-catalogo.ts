export const SYSTEM_ROLE_SLUGS = ["admin", "member"] as const;

export const ALLOWED_RUTAS = [
  "dashboard",
  "administracion/usuarios",
  "administracion/accesos",
  "administracion/centro-costo",
  "perfil",
  "billing/dashboard",
  "billing/inbox",
  "billing/invoices",
  "billing/emails",
  "billing/tasks",
  "billing/settings",
  "billing/petty-cash-reimbursement",
  "finance/petty-cash",
  "finance/advances",
  "finance/advances/request",
  "suppliers/onboarding",
  "customers/onboarding",
] as const;

export type AllowedRuta = (typeof ALLOWED_RUTAS)[number];

export function isAllowedRuta(ruta: string): ruta is AllowedRuta {
  return (ALLOWED_RUTAS as readonly string[]).includes(ruta);
}

export function isSystemRoleSlug(slug: string): boolean {
  return (SYSTEM_ROLE_SLUGS as readonly string[]).includes(slug);
}

export function slugifyNombre(nombre: string): string {
  const slug = nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug;
}
