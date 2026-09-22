import type { Doc, Id } from "../_generated/dataModel";
import { fallbackContactEmail } from "./env";

export type AnticipoOwnerSnapshot = {
  source?: "historial" | "directorio_empresa";
  liderUserId?: string;
  liderNombre: string;
  liderEmail: string;
  procesoId?: number;
  procesoNombre?: string;
  bolsaId?: Id<"bolsasAnticipos">;
  liderAsignacionId?: Id<"facturacionAsignaciones">;
  elegible: boolean;
};

export type AnticipoOwnerCandidate = {
  liderAsignacionId: Id<"facturacionAsignaciones">;
  liderUserId?: string;
  liderNombre: string;
  liderEmail: string;
  procesoId?: number;
  procesoNombre?: string;
  ultimaInteraccionEn: number;
  estadoAsignacion: Doc<"facturacionAsignaciones">["estado"];
  esActual: boolean;
};

export const FASES_ANTICIPO_CRUCE = [
  "revision_lider",
  "causacion",
  "revision_impuestos",
  "eventos_dian",
] as const;

export const FASES_ANTICIPO_EDITABLES = [
  "revision_lider",
  "causacion",
  "revision_impuestos",
  "eventos_dian",
] as const;

export type FaseAnticipoCruce = (typeof FASES_ANTICIPO_CRUCE)[number];
export type FaseAnticipoEditable = (typeof FASES_ANTICIPO_EDITABLES)[number];
export type PermisoAnticipo = "consulta" | "cruce" | "cambiar_responsable";

export function normalizeAnticipoEmail(email: string) {
  return email.trim().toLowerCase();
}

export function sanitizeAnticipoProcesoNombre(nombre?: string | null) {
  const trimmed = nombre?.trim().replace(/\s+/g, " ");
  return trimmed || undefined;
}

export function getAnticipoProcesoSnapshot(row: { procesoId?: number; procesoNombre?: string }) {
  return {
    procesoId:
      typeof row.procesoId === "number" && Number.isFinite(row.procesoId)
        ? row.procesoId
        : undefined,
    procesoNombre: sanitizeAnticipoProcesoNombre(row.procesoNombre),
  };
}

export function hasAnticipoProcesoSnapshot(row: { procesoId?: number; procesoNombre?: string }) {
  const snapshot = getAnticipoProcesoSnapshot(row);
  return snapshot.procesoId !== undefined || Boolean(snapshot.procesoNombre);
}

function normalizeProcesoNombreKey(nombre?: string) {
  return (nombre ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

export function sameAnticipoProcesoSnapshot(
  left: { procesoId?: number; procesoNombre?: string },
  right: { procesoId?: number; procesoNombre?: string }
) {
  const leftProceso = getAnticipoProcesoSnapshot(left);
  const rightProceso = getAnticipoProcesoSnapshot(right);
  if (
    leftProceso.procesoId !== undefined &&
    rightProceso.procesoId !== undefined &&
    leftProceso.procesoId === rightProceso.procesoId
  ) {
    return true;
  }
  const leftNombre = normalizeProcesoNombreKey(leftProceso.procesoNombre);
  const rightNombre = normalizeProcesoNombreKey(rightProceso.procesoNombre);
  return Boolean(leftNombre && rightNombre && leftNombre === rightNombre);
}

function resolveLeaderIdentity(asignacion: Doc<"facturacionAsignaciones">) {
  const userId = asignacion.asignadoAUserId?.trim();
  const email = normalizeAnticipoEmail(asignacion.asignadoAEmail ?? "");
  const nombre = asignacion.asignadoANombre?.trim() ?? "";
  return {
    userId: userId || undefined,
    email,
    nombre,
    identityKey: userId ? `id:${userId}` : email ? `email:${email}` : null,
  };
}

function resolveCandidateKey(
  asignacion: Doc<"facturacionAsignaciones">,
  proceso: { procesoId?: number; procesoNombre?: string }
) {
  const leader = resolveLeaderIdentity(asignacion);
  if (!leader.identityKey) return null;
  const procesoKey =
    proceso.procesoId !== undefined
      ? `procesoId:${proceso.procesoId}`
      : `procesoNombre:${normalizeProcesoNombreKey(proceso.procesoNombre)}`;
  return `${leader.identityKey}|${procesoKey}`;
}

function getUltimaInteraccionEn(asignacion: Doc<"facturacionAsignaciones">) {
  return Math.max(
    asignacion.actualizadoEn ?? 0,
    asignacion.fechaCompletado ?? 0,
    asignacion.fechaAsignacion ?? 0,
    asignacion.creadoEn ?? 0
  );
}

function buildOwnerSnapshotFromFactura(
  factura: Doc<"facturacionFacturas">,
  elegible: boolean
): AnticipoOwnerSnapshot | null {
  if (
    !factura.anticipoLiderNombre &&
    !factura.anticipoLiderUserId &&
    !factura.anticipoLiderEmail &&
    !hasAnticipoProcesoSnapshot({
      procesoId: factura.anticipoProcesoId,
      procesoNombre: factura.anticipoProcesoNombre,
    })
  ) {
    return null;
  }
  return {
    liderUserId: factura.anticipoLiderUserId,
    liderNombre:
      factura.anticipoLiderNombre ??
      factura.anticipoLiderUserId ??
      factura.anticipoProcesoNombre ??
      "Sin líder",
    liderEmail: normalizeAnticipoEmail(factura.anticipoLiderEmail ?? fallbackContactEmail()),
    procesoId: factura.anticipoProcesoId,
    procesoNombre: sanitizeAnticipoProcesoNombre(factura.anticipoProcesoNombre),
    bolsaId: factura.anticipoBolsaId,
    elegible,
  };
}

function ownerMatchesCandidate(
  owner: AnticipoOwnerSnapshot | null,
  candidate: AnticipoOwnerCandidate
) {
  if (!owner) return false;
  if (owner.liderUserId && candidate.liderUserId) {
    return (
      owner.liderUserId === candidate.liderUserId && sameAnticipoProcesoSnapshot(owner, candidate)
    );
  }
  return (
    normalizeAnticipoEmail(owner.liderEmail) === normalizeAnticipoEmail(candidate.liderEmail) &&
    sameAnticipoProcesoSnapshot(owner, candidate)
  );
}

export function buildAnticipoOwnerCandidates(args: {
  asignaciones: Doc<"facturacionAsignaciones">[];
  factura: Doc<"facturacionFacturas">;
}): { candidatos: AnticipoOwnerCandidate[]; duenoActual: AnticipoOwnerSnapshot | null } {
  const liderAsignaciones = args.asignaciones.filter(
    (row) => row.fase === "revision_lider" && row.estado !== "cancelada"
  );

  const byKey = new Map<
    string,
    { asignacion: Doc<"facturacionAsignaciones">; interaccion: number }
  >();

  for (const asignacion of liderAsignaciones) {
    const proceso = getAnticipoProcesoSnapshot({
      procesoId: asignacion.asignadoAProcesoId,
      procesoNombre: asignacion.asignadoAProcesoNombre,
    });
    if (!hasAnticipoProcesoSnapshot(proceso)) continue;

    const leader = resolveLeaderIdentity(asignacion);
    if (!leader.identityKey || !leader.nombre) continue;

    const key = resolveCandidateKey(asignacion, proceso);
    if (!key) continue;

    const interaccion = getUltimaInteraccionEn(asignacion);
    const existing = byKey.get(key);
    if (!existing || interaccion >= existing.interaccion) {
      byKey.set(key, { asignacion, interaccion });
    }
  }

  const candidatosBase: AnticipoOwnerCandidate[] = [...byKey.values()].map(
    ({ asignacion, interaccion }) => {
      const proceso = getAnticipoProcesoSnapshot({
        procesoId: asignacion.asignadoAProcesoId,
        procesoNombre: asignacion.asignadoAProcesoNombre,
      });
      const leader = resolveLeaderIdentity(asignacion);
      return {
        liderAsignacionId: asignacion._id,
        liderUserId: leader.userId,
        liderNombre: leader.nombre,
        liderEmail: leader.email,
        procesoId: proceso.procesoId,
        procesoNombre: proceso.procesoNombre,
        ultimaInteraccionEn: interaccion,
        estadoAsignacion: asignacion.estado,
        esActual: false,
      };
    }
  );

  const duenoSnapshot = buildOwnerSnapshotFromFactura(args.factura, false);
  const duenoEsElegible = duenoSnapshot
    ? candidatosBase.some((candidate) => ownerMatchesCandidate(duenoSnapshot, candidate))
    : false;

  const duenoActual = duenoSnapshot ? { ...duenoSnapshot, elegible: duenoEsElegible } : null;

  const candidatos = candidatosBase
    .map((candidate) => ({
      ...candidate,
      esActual: ownerMatchesCandidate(duenoActual, candidate),
    }))
    .sort((left, right) => {
      if (left.esActual !== right.esActual) return left.esActual ? -1 : 1;
      return right.ultimaInteraccionEn - left.ultimaInteraccionEn;
    });

  return { candidatos, duenoActual };
}

export function isFaseAnticipoEditable(fase: string): fase is FaseAnticipoEditable {
  return (FASES_ANTICIPO_EDITABLES as readonly string[]).includes(fase);
}

export function isFaseAnticipoCruce(fase: string): fase is FaseAnticipoCruce {
  return (FASES_ANTICIPO_CRUCE as readonly string[]).includes(fase);
}

export function isFaseAnticipoCambiarResponsable(fase: string): fase is FaseAnticipoEditable {
  return isFaseAnticipoEditable(fase);
}

export function fasePermitePermisoAnticipo(fase: string, permiso: PermisoAnticipo) {
  switch (permiso) {
    case "consulta":
      return isFaseAnticipoCruce(fase);
    case "cruce":
      return isFaseAnticipoCruce(fase);
    case "cambiar_responsable":
      return isFaseAnticipoCambiarResponsable(fase);
  }
}

export function sameAnticipoBolsaSnapshot(
  left: {
    bolsaId?: Id<"bolsasAnticipos">;
    procesoId?: number;
    procesoNombre?: string;
  },
  right: {
    bolsaId?: Id<"bolsasAnticipos">;
    procesoId?: number;
    procesoNombre?: string;
  }
) {
  if (left.bolsaId && right.bolsaId) {
    return left.bolsaId === right.bolsaId;
  }
  return sameAnticipoProcesoSnapshot(left, right);
}

export function buildLiderAsignadoSnapshot(
  asignacion: Doc<"facturacionAsignaciones">
): AnticipoOwnerSnapshot | null {
  const userId = asignacion.asignadoAUserId?.trim();
  const email = normalizeAnticipoEmail(asignacion.asignadoAEmail ?? "");
  const nombre = asignacion.asignadoANombre?.trim() ?? "";
  if (!nombre && !userId && !email) return null;

  const proceso = getAnticipoProcesoSnapshot({
    procesoId: asignacion.asignadoAProcesoId,
    procesoNombre: asignacion.asignadoAProcesoNombre,
  });

  return {
    liderUserId: userId || undefined,
    liderNombre: nombre || userId || proceso.procesoNombre || "Sin líder",
    liderEmail: email || fallbackContactEmail(),
    procesoId: proceso.procesoId,
    procesoNombre: proceso.procesoNombre,
    elegible: hasAnticipoProcesoSnapshot(proceso),
  };
}

export function sessionMatchesAsignacion(args: {
  sessionUserId: string;
  sessionEmail: string;
  asignacion: Doc<"facturacionAsignaciones">;
}) {
  const sessionUserId = args.sessionUserId.trim();
  const sessionEmail = normalizeAnticipoEmail(args.sessionEmail);
  if (sessionUserId && args.asignacion.asignadoAUserId) {
    return args.asignacion.asignadoAUserId === sessionUserId;
  }
  return (
    Boolean(sessionEmail) && normalizeAnticipoEmail(args.asignacion.asignadoAEmail) === sessionEmail
  );
}

export function buildAnticipoDuenoCambioComentario(args: {
  anterior: AnticipoOwnerSnapshot | null;
  nuevo: AnticipoOwnerSnapshot;
  crucesRevertidos?: { cantidad: number; valor: number };
}) {
  const formatOwner = (owner: AnticipoOwnerSnapshot | null) => {
    if (!owner) return "Sin dueño";
    const proceso =
      owner.procesoNombre ?? (owner.procesoId ? `Proceso #${owner.procesoId}` : "Sin proceso");
    return `${owner.liderNombre} · ${proceso}`;
  };
  let comentario = `Cambió dueño del anticipo: ${formatOwner(args.anterior)} → ${formatOwner(args.nuevo)}`;
  if (args.crucesRevertidos && args.crucesRevertidos.cantidad > 0) {
    comentario += `. Revirtió ${args.crucesRevertidos.cantidad} cruce(s) por ${args.crucesRevertidos.valor.toFixed(2)}.`;
  }
  return comentario;
}
