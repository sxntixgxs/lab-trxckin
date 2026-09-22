import type { BillingSession as Session } from "@/lib/billing-session";
import type {
  AnticipoManagementContext,
  AnticipoOwnerCandidate,
  ChangeAnticipoOwnerInput,
  AnticipoOwnerSelectionInput,
  SaveAnticipoCrossInput,
} from "@/app/(default)/billing/lib/anticipo-management";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { convexServer } from "@/lib/convexServerClient";
import { hasGlobalEmpresaAccess } from "@/lib/empresas";
import { fetchLideresActivosParaEmpresa } from "../devolucion/devolucion-route-lib";

export { fetchLideresActivosParaEmpresa };

type LiderDirectorio = Awaited<ReturnType<typeof fetchLideresActivosParaEmpresa>>[number];

export type AnticipoOwnerDirectorySnapshot = {
  liderUserId: string;
  liderNombre: string;
  liderEmail: string;
  procesoId?: number;
  procesoNombre?: string;
};

const HISTORIAL_PREFIX = "historial:";
const DIRECTORIO_PREFIX = "directorio_empresa:";

function normalizeText(value?: string | null) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function procesoKey(row: { procesoId?: number; procesoNombre?: string }) {
  if (typeof row.procesoId === "number" && Number.isFinite(row.procesoId)) {
    return `id:${row.procesoId}`;
  }
  const nombre = normalizeText(row.procesoNombre);
  return nombre ? `nombre:${nombre}` : null;
}

function sameProceso(
  left: { procesoId?: number; procesoNombre?: string },
  right: { procesoId?: number; procesoNombre?: string }
) {
  if (
    left.procesoId !== undefined &&
    right.procesoId !== undefined &&
    left.procesoId === right.procesoId
  ) {
    return true;
  }
  const leftNombre = normalizeText(left.procesoNombre);
  const rightNombre = normalizeText(right.procesoNombre);
  return Boolean(leftNombre && rightNombre && leftNombre === rightNombre);
}

function sameLeader(
  left: { liderUserId?: string; liderEmail: string },
  right: { liderUserId?: string; liderEmail: string }
) {
  if (left.liderUserId && right.liderUserId) {
    return left.liderUserId === right.liderUserId;
  }
  return normalizeText(left.liderEmail) === normalizeText(right.liderEmail);
}

function ownerMatchesCandidate(
  owner: AnticipoManagementContext["duenoActual"],
  candidate: AnticipoOwnerCandidate
) {
  if (!owner) return false;
  return sameLeader(owner, candidate) && sameProceso(owner, candidate);
}

export function buildAnticipoOwnerSelectionKey(
  source: AnticipoOwnerCandidate["source"],
  id: string
) {
  return `${source === "historial" ? HISTORIAL_PREFIX : DIRECTORIO_PREFIX}${id}`;
}

export function parseAnticipoOwnerSelectionKey(value?: string | null) {
  const key = value?.trim() ?? "";
  if (key.startsWith(HISTORIAL_PREFIX) && key.length > HISTORIAL_PREFIX.length) {
    return {
      source: "historial" as const,
      liderAsignacionId: key.slice(HISTORIAL_PREFIX.length) as Id<"facturacionAsignaciones">,
    };
  }
  if (key.startsWith(DIRECTORIO_PREFIX) && key.length > DIRECTORIO_PREFIX.length) {
    return {
      source: "directorio_empresa" as const,
      liderUserId: key.slice(DIRECTORIO_PREFIX.length),
    };
  }
  return null;
}

export function resolveLiderDirectorioSnapshot(
  lideres: LiderDirectorio[],
  liderUserId: string
): AnticipoOwnerDirectorySnapshot {
  const lider = lideres.find((row) => row.usuarioId === liderUserId);
  if (!lider?.usuarioId) {
    throw new Error("El líder seleccionado ya no está activo o no pertenece a esta empresa.");
  }
  if (!procesoKey({ procesoId: lider.procesoId, procesoNombre: lider.procesoNombre })) {
    throw new Error(
      "El líder seleccionado no tiene un proceso configurado para identificar su bolsa."
    );
  }
  return {
    liderUserId: lider.usuarioId,
    liderNombre: lider.nombre,
    liderEmail: lider.email,
    ...(lider.procesoId !== undefined ? { procesoId: lider.procesoId } : {}),
    ...(lider.procesoNombre ? { procesoNombre: lider.procesoNombre } : {}),
  };
}

export function mergeAnticipoOwnerCandidates(
  context: AnticipoManagementContext,
  lideres: LiderDirectorio[]
): AnticipoManagementContext {
  const historicalCandidates: AnticipoOwnerCandidate[] = context.candidatos.flatMap((candidate) =>
    candidate.liderAsignacionId
      ? [
          {
            ...candidate,
            selectionKey: buildAnticipoOwnerSelectionKey(
              "historial",
              String(candidate.liderAsignacionId)
            ),
            source: "historial" as const,
          },
        ]
      : []
  );
  const directoryCandidates: AnticipoOwnerCandidate[] = [];

  for (const lider of lideres) {
    if (!lider.usuarioId) continue;
    const candidate: AnticipoOwnerCandidate = {
      selectionKey: buildAnticipoOwnerSelectionKey("directorio_empresa", lider.usuarioId),
      source: "directorio_empresa",
      liderUserId: lider.usuarioId,
      liderNombre: lider.nombre,
      liderEmail: lider.email,
      ...(lider.procesoId !== undefined ? { procesoId: lider.procesoId } : {}),
      ...(lider.procesoNombre ? { procesoNombre: lider.procesoNombre } : {}),
      esActual: false,
    };
    if (!procesoKey(candidate)) continue;
    if (
      [...historicalCandidates, ...directoryCandidates].some(
        (existing) => sameLeader(existing, candidate) && sameProceso(existing, candidate)
      )
    ) {
      continue;
    }
    directoryCandidates.push(candidate);
  }

  const candidates = [...historicalCandidates, ...directoryCandidates]
    .map((candidate) => ({
      ...candidate,
      esActual: ownerMatchesCandidate(context.duenoActual, candidate),
    }))
    .sort((left, right) => {
      if (left.esActual !== right.esActual) return left.esActual ? -1 : 1;
      if (left.source !== right.source) return left.source === "historial" ? -1 : 1;
      if (left.source === "historial" && right.source === "historial") {
        return (right.ultimaInteraccionEn ?? 0) - (left.ultimaInteraccionEn ?? 0);
      }
      return left.liderNombre.localeCompare(right.liderNombre, "es", { sensitivity: "base" });
    });

  const ownerEligible = candidates.some((candidate) => candidate.esActual);
  return {
    ...context,
    duenoActual: context.duenoActual ? { ...context.duenoActual, elegible: ownerEligible } : null,
    candidatos: candidates,
  };
}

export function assertEmpresaAutorizada(session: Session, empresaId: number) {
  const canAll = hasGlobalEmpresaAccess(
    session.user.id_rol ?? 0,
    session.user.acceso_todas_empresas
  );
  if (canAll) return;
  const permitted = new Set(session.user.empresas ?? []);
  if (!permitted.has(empresaId)) {
    throw new Error("Empresa no autorizada");
  }
}

export function resolveActorFromSession(session: Session) {
  const actorUserId = session.user.id?.trim();
  const actorNombre = session.user.nombre?.trim() || "Usuario";
  const actorEmail = session.user.email?.trim().toLowerCase() || "";
  if (!actorUserId) {
    throw new Error("No se pudo identificar al usuario de la sesión.");
  }
  return { actorUserId, actorNombre, actorEmail };
}

export async function obtenerContextoAnticipoFactura(args: {
  secret: string;
  facturaId: Id<"facturacionFacturas">;
  actorUserId: string;
  actorEmail: string;
  asignacionId?: Id<"facturacionAsignaciones">;
  liderAsignacionId?: Id<"facturacionAsignaciones">;
  liderDirectorioPreview?: AnticipoOwnerDirectorySnapshot;
}) {
  const result = await convexServer.query(
    api.facturacionTareas.obtenerContextoAnticipoDesdeServidor,
    {
      secret: args.secret,
      facturaId: args.facturaId,
      actorUserId: args.actorUserId,
      actorEmail: args.actorEmail,
      ...(args.asignacionId ? { asignacionId: args.asignacionId } : {}),
      ...(args.liderAsignacionId ? { liderAsignacionId: args.liderAsignacionId } : {}),
      ...(args.liderDirectorioPreview
        ? { liderDirectorioPreview: args.liderDirectorioPreview }
        : {}),
    }
  );
  return result as { empresa: number; contexto: AnticipoManagementContext };
}

export async function cambiarDuenoAnticipoFactura(args: {
  secret: string;
  facturaId: Id<"facturacionFacturas">;
  actorUserId: string;
  actorNombre: string;
  actorEmail: string;
  input: ChangeAnticipoOwnerInput;
  liderDirectorio?: AnticipoOwnerDirectorySnapshot;
}) {
  if (args.input.ownerSelection.source === "directorio_empresa" && !args.liderDirectorio) {
    throw new Error("No se pudo verificar el líder activo seleccionado.");
  }
  return await convexServer.mutation(api.facturacionTareas.cambiarDuenoAnticipoDesdeServidor, {
    secret: args.secret,
    facturaId: args.facturaId,
    asignacionId: args.input.asignacionId,
    ...(args.input.ownerSelection.source === "historial"
      ? { liderAsignacionId: args.input.ownerSelection.liderAsignacionId }
      : args.liderDirectorio
        ? { liderDirectorio: args.liderDirectorio }
        : {}),
    actorUserId: args.actorUserId,
    actorNombre: args.actorNombre,
    actorEmail: args.actorEmail,
    comentario: args.input.comentario,
    confirmarReversionCruces: args.input.confirmarReversionCruces,
    expectedLegalizacionIds: args.input.expectedLegalizacionIds,
  });
}

export async function guardarCruceAnticipoFactura(args: {
  secret: string;
  facturaId: Id<"facturacionFacturas">;
  actorUserId: string;
  actorNombre: string;
  actorEmail: string;
  input: SaveAnticipoCrossInput;
  liderDirectorio?: AnticipoOwnerDirectorySnapshot;
}) {
  if (args.input.ownerSelection?.source === "directorio_empresa" && !args.liderDirectorio) {
    throw new Error("No se pudo verificar el líder activo seleccionado.");
  }
  return await convexServer.mutation(api.facturacionTareas.guardarCruceAnticipoDesdeServidor, {
    secret: args.secret,
    facturaId: args.facturaId,
    asignacionId: args.input.asignacionId,
    anticipoIds: args.input.anticipoIds,
    expectedBolsaId: args.input.expectedBolsaId,
    ...(args.input.ownerSelection ? { ownerSelection: args.input.ownerSelection } : {}),
    ...(args.liderDirectorio ? { liderDirectorio: args.liderDirectorio } : {}),
    actorUserId: args.actorUserId,
    actorNombre: args.actorNombre,
    actorEmail: args.actorEmail,
    comentario: args.input.comentario,
  });
}

export function validateChangeAnticipoOwnerInput(body: unknown): ChangeAnticipoOwnerInput {
  if (!body || typeof body !== "object") {
    throw new Error("Cuerpo de solicitud inválido.");
  }
  const row = body as Record<string, unknown>;
  if (typeof row.asignacionId !== "string" || !row.asignacionId.trim()) {
    throw new Error("Indica la asignación activa.");
  }
  if (!row.ownerSelection || typeof row.ownerSelection !== "object") {
    throw new Error("Selecciona un líder para la bolsa del anticipo.");
  }
  const ownerSelection = row.ownerSelection as Record<string, unknown>;
  let parsedOwnerSelection: ChangeAnticipoOwnerInput["ownerSelection"];
  if (
    ownerSelection.source === "historial" &&
    typeof ownerSelection.liderAsignacionId === "string" &&
    ownerSelection.liderAsignacionId.trim()
  ) {
    parsedOwnerSelection = {
      source: "historial",
      liderAsignacionId: ownerSelection.liderAsignacionId as Id<"facturacionAsignaciones">,
    };
  } else if (
    ownerSelection.source === "directorio_empresa" &&
    typeof ownerSelection.liderUserId === "string" &&
    ownerSelection.liderUserId.trim()
  ) {
    parsedOwnerSelection = {
      source: "directorio_empresa",
      liderUserId: ownerSelection.liderUserId.trim(),
    };
  } else {
    throw new Error("La selección del líder no es válida.");
  }
  const expectedLegalizacionIds = Array.isArray(row.expectedLegalizacionIds)
    ? row.expectedLegalizacionIds.filter((id): id is string => typeof id === "string")
    : [];
  return {
    asignacionId: row.asignacionId as Id<"facturacionAsignaciones">,
    ownerSelection: parsedOwnerSelection,
    comentario: typeof row.comentario === "string" ? row.comentario : undefined,
    confirmarReversionCruces: row.confirmarReversionCruces === true,
    expectedLegalizacionIds: expectedLegalizacionIds as Id<"facturacionAnticipoLegalizaciones">[],
  };
}

export function validateSaveAnticipoCrossInput(body: unknown): SaveAnticipoCrossInput {
  if (!body || typeof body !== "object") {
    throw new Error("Cuerpo de solicitud inválido.");
  }
  const row = body as Record<string, unknown>;
  if (typeof row.asignacionId !== "string" || !row.asignacionId.trim()) {
    throw new Error("Indica la asignación activa.");
  }
  if (typeof row.expectedBolsaId !== "string" || !row.expectedBolsaId.trim()) {
    throw new Error("Indica la bolsa esperada.");
  }
  const anticipoIds = Array.isArray(row.anticipoIds)
    ? row.anticipoIds.filter((id): id is string => typeof id === "string")
    : [];
  if (anticipoIds.length === 0) {
    throw new Error("Selecciona al menos un anticipo para cruzar.");
  }
  return {
    asignacionId: row.asignacionId as Id<"facturacionAsignaciones">,
    anticipoIds: anticipoIds as Id<"anticipos">[],
    expectedBolsaId: row.expectedBolsaId as Id<"bolsasAnticipos">,
    ...(row.ownerSelection && typeof row.ownerSelection === "object"
      ? {
          ownerSelection: validateAnticipoOwnerSelectionInput(
            row.ownerSelection as Record<string, unknown>
          ),
        }
      : {}),
    comentario: typeof row.comentario === "string" ? row.comentario : undefined,
  };
}

function validateAnticipoOwnerSelectionInput(
  ownerSelection: Record<string, unknown>
): AnticipoOwnerSelectionInput {
  if (
    ownerSelection.source === "historial" &&
    typeof ownerSelection.liderAsignacionId === "string" &&
    ownerSelection.liderAsignacionId.trim()
  ) {
    return {
      source: "historial",
      liderAsignacionId: ownerSelection.liderAsignacionId as Id<"facturacionAsignaciones">,
    };
  }
  if (
    ownerSelection.source === "directorio_empresa" &&
    typeof ownerSelection.liderUserId === "string" &&
    ownerSelection.liderUserId.trim()
  ) {
    return {
      source: "directorio_empresa",
      liderUserId: ownerSelection.liderUserId.trim(),
    };
  }
  throw new Error("La selección del líder no es válida.");
}
