import type { Doc } from "@/convex/_generated/dataModel";

export function resolveActiveAsignacion(args: {
  asignaciones: Doc<"facturacionAsignaciones">[];
  tarea: Doc<"facturacionTareas"> | null | undefined;
  actorUserId?: string;
  actorEmail?: string;
  fallback?: Doc<"facturacionAsignaciones"> | null;
}): Doc<"facturacionAsignaciones"> | null {
  const { asignaciones, tarea } = args;
  if (!tarea) return args.fallback ?? null;

  const faseActiva = tarea.estado;
  const grupoActivo = tarea.grupoAsignacionActualId;
  const pendientesEnFase = asignaciones.filter(
    (asignacion) =>
      asignacion.tareaId === tarea._id &&
      asignacion.estado === "pendiente" &&
      asignacion.fase === faseActiva &&
      (!grupoActivo || asignacion.grupoId === grupoActivo)
  );

  const current = tarea.currentAsignacionId
    ? asignaciones.find(
        (asignacion) => asignacion._id === tarea.currentAsignacionId
      )
    : null;

  if (
    current &&
    current.estado === "pendiente" &&
    current.fase === faseActiva
  ) {
    return current;
  }

  if (pendientesEnFase.length === 0) {
    return args.fallback ?? current ?? null;
  }

  if (args.actorUserId) {
    const match = pendientesEnFase.find(
      (asignacion) => asignacion.asignadoAUserId === args.actorUserId
    );
    if (match) return match;
  }

  if (args.actorEmail) {
    const normalized = args.actorEmail.trim().toLowerCase();
    const match = pendientesEnFase.find(
      (asignacion) =>
        asignacion.asignadoAEmail.trim().toLowerCase() === normalized
    );
    if (match) return match;
  }

  return (
    [...pendientesEnFase].sort((a, b) => a.creadoEn - b.creadoEn)[0] ??
    args.fallback ??
    null
  );
}
