import type { CreateUsuarioPayload, UsuarioWritePayload } from "./usuarios-types";

export function nestErrorMessage(body: unknown, fallback: string): string {
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

async function parseResult(response: Response, fallback: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    return { ok: false, message: nestErrorMessage(body, fallback) };
  }
  return { ok: true };
}

export async function createUsuario(
  payload: CreateUsuarioPayload,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const response = await fetch("/api/usuarios", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseResult(response, "No se pudo crear el usuario");
}

export async function patchUsuario(
  id: string,
  payload: UsuarioWritePayload,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const response = await fetch(`/api/usuarios/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseResult(response, "No se pudo actualizar el usuario");
}

export async function createProceso(payload: {
  nombre: string;
  lider_user_id?: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const response = await fetch("/api/procesos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseResult(response, "No se pudo crear el proceso");
}

export async function patchProceso(
  id: number,
  payload: { nombre?: string; lider_user_id?: string | null; activo?: boolean },
): Promise<{ ok: true } | { ok: false; message: string }> {
  const response = await fetch(`/api/procesos/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseResult(response, "No se pudo actualizar el proceso");
}

export async function deleteProceso(id: number): Promise<{ ok: true } | { ok: false; message: string }> {
  const response = await fetch(`/api/procesos/${id}`, { method: "DELETE" });
  return parseResult(response, "No se pudo eliminar el proceso");
}
