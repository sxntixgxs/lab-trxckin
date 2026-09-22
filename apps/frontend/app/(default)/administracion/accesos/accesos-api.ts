import type { RolConPermisos } from "./accesos-types";

function nestErrorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "message" in body) {
    const message = (body as { message: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
    if (Array.isArray(message)) {
      return message.filter((item): item is string => typeof item === "string").join(", ") || fallback;
    }
  }
  return fallback;
}

async function parseJson(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

export async function createRol(
  nombre: string,
): Promise<{ ok: true; rol: RolConPermisos } | { ok: false; message: string }> {
  const response = await fetch("/api/roles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nombre }),
  });
  const body = await parseJson(response);
  if (!response.ok) {
    return { ok: false, message: nestErrorMessage(body, "No se pudo crear el rol") };
  }
  const rol = body as RolConPermisos;
  return { ok: true, rol: { ...rol, permisos: rol.permisos ?? [] } };
}

export async function updateRol(
  id: number,
  payload: { nombre?: string; activo?: boolean },
): Promise<{ ok: true; rol: RolConPermisos } | { ok: false; message: string }> {
  const response = await fetch(`/api/roles/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await parseJson(response);
  if (!response.ok) {
    return { ok: false, message: nestErrorMessage(body, "No se pudo actualizar el rol") };
  }
  return { ok: true, rol: body as RolConPermisos };
}

export async function deleteRol(
  id: number,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const response = await fetch(`/api/roles/${id}`, { method: "DELETE" });
  const body = await parseJson(response);
  if (!response.ok) {
    return { ok: false, message: nestErrorMessage(body, "No se pudo eliminar el rol") };
  }
  return { ok: true };
}

export async function savePermisosRol(
  id_rol: number,
  permisos: string[],
): Promise<{ ok: true; rol: RolConPermisos } | { ok: false; message: string }> {
  const response = await fetch("/api/permisos-roles/bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id_rol, permisos }),
  });
  const body = await parseJson(response);
  if (!response.ok) {
    return { ok: false, message: nestErrorMessage(body, "No se pudieron guardar los permisos") };
  }
  return { ok: true, rol: body as RolConPermisos };
}
