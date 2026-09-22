"use client";

import { useEffect, useMemo, useState } from "react";

export type UsuarioResumen = {
  nombre: string;
  email?: string;
  cargo?: string;
  proceso?: string;
};

// Module-level cache: user ids are stable and names rarely change, so every board,
// dialog and report shares one fetch per id for the lifetime of the tab.
const cache = new Map<string, UsuarioResumen | null>();
const inflight = new Map<string, Promise<UsuarioResumen | null>>();

function readNombre(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value;
  if (value && typeof value === "object" && "nombre" in value) {
    const nombre = (value as { nombre?: unknown }).nombre;
    return typeof nombre === "string" && nombre.trim() ? nombre : undefined;
  }
  return undefined;
}

async function fetchUsuario(id: string): Promise<UsuarioResumen | null> {
  try {
    const res = await fetch(`/api/usuarios/${encodeURIComponent(id)}`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown> | null;
    const nombre = readNombre(data?.nombre) ?? readNombre(data?.name);
    if (!nombre) return null;
    return {
      nombre,
      email: typeof data?.email === "string" ? data.email : undefined,
      cargo: typeof data?.cargo === "string" ? data.cargo : undefined,
      proceso: readNombre(data?.proceso),
    };
  } catch {
    return null;
  }
}

function loadUsuario(id: string): Promise<UsuarioResumen | null> {
  if (cache.has(id)) return Promise.resolve(cache.get(id) ?? null);
  const pending = inflight.get(id);
  if (pending) return pending;
  const promise = fetchUsuario(id).then((result) => {
    cache.set(id, result);
    inflight.delete(id);
    return result;
  });
  inflight.set(id, promise);
  return promise;
}

function esIdResoluble(id: string | undefined | null): id is string {
  return Boolean(id && id !== "—" && !id.includes("@"));
}

/**
 * Resolves internal user ids (Nest) to display names through the BFF, with a shared cache.
 * Ids that look like emails or placeholders are skipped.
 */
export function useUsuariosMap(userIds: ReadonlyArray<string | undefined | null>): Record<string, UsuarioResumen> {
  const unique = useMemo(() => [...new Set(userIds.filter(esIdResoluble))], [userIds]);
  const key = unique.join("|");
  const [map, setMap] = useState<Record<string, UsuarioResumen>>({});

  useEffect(() => {
    if (unique.length === 0) return;
    let cancelled = false;
    Promise.all(unique.map((id) => loadUsuario(id).then((u) => [id, u] as const))).then((entries) => {
      if (cancelled) return;
      setMap((prev) => {
        const next = { ...prev };
        for (const [id, u] of entries) if (u) next[id] = u;
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return map;
}

/** Single-user variant of `useUsuariosMap`. */
export function useUsuario(userId: string | undefined | null): UsuarioResumen | undefined {
  const map = useUsuariosMap(useMemo(() => [userId], [userId]));
  return userId ? map[userId] : undefined;
}
