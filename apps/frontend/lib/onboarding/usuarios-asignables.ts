export interface UsuarioAsignable {
  id: string;
  nombre: string;
  email: string;
}

function normalizeUsuariosPayload(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    if (Array.isArray(record.usuarios)) return record.usuarios;
    if (Array.isArray(record.data)) return record.data;
  }
  return [];
}

function normalizeUsuarioAsignable(usuario: unknown): UsuarioAsignable {
  const u = (usuario ?? {}) as Record<string, unknown>;
  const email = String(u.email ?? u.correo ?? "");
  return {
    id: String(u.id ?? u._id ?? u.userId ?? ""),
    nombre: String(u.nombre ?? u.fullName ?? u.name ?? email),
    email,
  };
}

/**
 * Usuarios asignables a roles del módulo para una empresa: pertenecen a la empresa
 * o tienen acceso a todas las empresas (directorio Nest vía BFF).
 */
export async function fetchUsuariosAsignables(empresaId: number): Promise<UsuarioAsignable[]> {
  try {
    const params = new URLSearchParams({
      empresaId: String(empresaId),
      includeGlobalAccess: "true",
    });
    const response = await fetch(`/api/usuarios/directorio?${params.toString()}`, { cache: "no-store" });
    if (!response.ok) return [];
    const data: unknown = await response.json();
    return normalizeUsuariosPayload(data)
      .map(normalizeUsuarioAsignable)
      .filter((u) => u.id && (u.nombre || u.email));
  } catch {
    return [];
  }
}

export function normalizeForSearch(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s@.]/g, " ");
}

/** Búsqueda multi-token insensible a acentos sobre nombre y email. */
export function matchesUsuario(usuario: UsuarioAsignable, query: string): boolean {
  const tokens = normalizeForSearch(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const haystack = normalizeForSearch(`${usuario.nombre} ${usuario.email}`);
  return tokens.every((token) => haystack.includes(token));
}
