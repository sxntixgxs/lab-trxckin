"use client";

import { useQueries } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import type { Doc } from "@/convex/_generated/dataModel";
import { type FacturacionUsuario, normalizarUsuario } from "./use-facturacion-users";

type FacturacionActorRef = Pick<
  Doc<"facturacionAprobaciones">,
  "actorUserId" | "actorNombre" | "actorEmail"
>;

export function resolveFacturacionActorName(
  event: FacturacionActorRef,
  usuariosById: Map<string, FacturacionUsuario>,
  isLoading: boolean
) {
  const actorUserId = event.actorUserId?.trim();
  if (actorUserId) {
    const usuario = usuariosById.get(actorUserId);
    if (usuario) return usuario.nombre;
    if (isLoading) return "Consultando usuario…";
    return `Usuario ${actorUserId}`;
  }

  return (
    event.actorNombre?.trim() || event.actorEmail?.trim().toLowerCase() || "Usuario no disponible"
  );
}

export function useFacturacionActorNames(events: FacturacionActorRef[]) {
  const actorIds = useMemo(
    () =>
      Array.from(
        new Set(
          events.map((event) => event.actorUserId?.trim()).filter((id): id is string => Boolean(id))
        )
      ),
    [events]
  );
  const queries = useQueries({
    queries: actorIds.map((actorUserId) => ({
      queryKey: ["facturacion-actor", actorUserId],
      queryFn: async () => {
        const response = await fetch(`/api/usuarios/${encodeURIComponent(actorUserId)}`, {
          cache: "no-store",
        });
        if (!response.ok) return null;
        return normalizarUsuario(await response.json());
      },
      staleTime: 60_000,
    })),
  });
  const usuariosById = useMemo(
    () =>
      new Map(
        queries
          .map((query) => query.data)
          .filter((usuario): usuario is FacturacionUsuario => Boolean(usuario))
          .map((usuario) => [usuario.id, usuario])
      ),
    [queries]
  );
  const isLoading = queries.some((query) => query.isLoading);

  return useCallback(
    (event: FacturacionActorRef) => resolveFacturacionActorName(event, usuariosById, isLoading),
    [isLoading, usuariosById]
  );
}
