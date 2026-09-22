import type { BillingSession as Session } from "@/lib/billing-session";
import { env } from "process";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { convexServer } from "@/lib/convexServerClient";
import { hasGlobalEmpresaAccess } from "@/lib/empresas";
import {
  fetchLideresActivosParaEmpresa,
  resolveResponsableDevolucion,
} from "../../facturas/[id]/devolucion/devolucion-route-lib";

export type GerenciaPhaseTarget =
  | "recepcion"
  | "revision_lider"
  | "causacion"
  | "revision_impuestos"
  | "eventos_dian"
  | "gerencia"
  | "revision_tesoreria";

export type AsignarFaseUsuarioAssignmentInput = {
  assignmentId: string;
  targetStage: GerenciaPhaseTarget;
  assigneeId: string;
  observation: string;
};

const GERENCIA_PHASE_TARGETS = new Set<GerenciaPhaseTarget>([
  "recepcion",
  "revision_lider",
  "causacion",
  "revision_impuestos",
  "eventos_dian",
  "gerencia",
  "revision_tesoreria",
]);

async function fetchBackendJson(path: string, authorization?: string) {
  const backendUrl = env.BACKEND_URL;
  if (!backendUrl) {
    throw new Error("BACKEND_URL no configurado");
  }

  const response = await fetch(`${backendUrl}${path}`, {
    headers: authorization ? { Authorization: authorization } : undefined,
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Error al consultar usuarios (${response.status})`);
  }
  return (await response.json()) as unknown;
}

type ConfiguracionUsuariosResponse = Record<
  string,
  Array<{
    usuarioId: string;
    nombre: string;
    email: string;
  }>
>;

async function listarUsuariosConfiguradosPorClave(args: {
  secret: string;
  empresaId: number;
  clave:
    | "recepcion"
    | "analista_causacion"
    | "contadores_impuestos"
    | "eventos_dian"
    | "gerencia"
    | "tesorero"
    | "tesoreria_default";
}) {
  const rows = (await convexServer.query(
    api.facturacionConfiguracion.listarUsuariosPorClave,
    {
      clave: args.clave,
      empresas: [args.empresaId],
    },
  )) as ConfiguracionUsuariosResponse;
  const empresaUsuarios = rows[String(args.empresaId)] ?? [];
  return empresaUsuarios
    .map((usuario) => ({
      usuarioId: usuario.usuarioId,
      nombre: usuario.nombre,
      email: usuario.email.toLowerCase(),
    }))
    .filter((usuario) => Boolean(usuario.usuarioId && usuario.nombre && usuario.email));
}

export function assertEmpresaAutorizada(session: Session, empresaId: number) {
  const canAll = hasGlobalEmpresaAccess(
    session.user?.id_rol ?? 0,
    session.user?.acceso_todas_empresas,
  );
  if (canAll) return;
  const empresas = session.user?.empresas ?? [];
  if (!empresas.includes(empresaId)) {
    throw new Error("Empresa no autorizada");
  }
}

export async function assertActorEnGerenciaEmpresa(args: {
  secret: string;
  actorUserId: string;
  empresaId: number;
}) {
  const actorId = args.actorUserId.trim();
  if (!actorId) {
    throw new Error("No se pudo identificar al usuario de la sesión.");
  }

  const gerencias = await listarUsuariosConfiguradosPorClave({
    secret: args.secret,
    empresaId: args.empresaId,
    clave: "gerencia",
  });
  if (gerencias.length === 0) {
    throw new Error("Gerencia no configurada para esta empresa.");
  }
  const autorizado = gerencias.some((row) => row.usuarioId === actorId);
  if (!autorizado) {
    throw new Error("No tienes permisos de Gerencia para esta empresa.");
  }
}

export function parseGerenciaPhaseTarget(value: unknown): GerenciaPhaseTarget | null {
  if (typeof value !== "string") return null;
  return GERENCIA_PHASE_TARGETS.has(value as GerenciaPhaseTarget)
    ? (value as GerenciaPhaseTarget)
    : null;
}

export async function obtenerAsignacionParaRuta(args: {
  secret: string;
  assignmentId: Id<"facturacionAsignaciones">;
}) {
  const asignacion = await convexServer.query(api.facturacionTareas.obtenerAsignacionParaServidor, {
    secret: args.secret,
    asignacionId: args.assignmentId,
  });
  if (!asignacion) {
    throw new Error("Asignación no encontrada.");
  }
  return asignacion;
}

export async function resolveAssigneeForGerenciaTarget(args: {
  secret: string;
  empresaId: number;
  targetStage: GerenciaPhaseTarget;
  assigneeId: string;
  authorization?: string;
}) {
  const assigneeId = args.assigneeId.trim();
  if (!assigneeId) {
    throw new Error("Selecciona un responsable.");
  }

  if (args.targetStage === "revision_lider") {
    const lideres = await fetchLideresActivosParaEmpresa({
      empresaId: args.empresaId,
      authorization: args.authorization,
    });
    const lider = lideres.find((row) => row.usuarioId === assigneeId);
    if (!lider?.usuarioId) {
      throw new Error("Selecciona un líder de proceso activo para esta empresa.");
    }
    return lider;
  }

  const clavePorFase: Record<
    Exclude<GerenciaPhaseTarget, "revision_lider">,
    | "recepcion"
    | "analista_causacion"
    | "contadores_impuestos"
    | "eventos_dian"
    | "gerencia"
    | "tesorero"
  > = {
    recepcion: "recepcion",
    causacion: "analista_causacion",
    revision_impuestos: "contadores_impuestos",
    eventos_dian: "eventos_dian",
    gerencia: "gerencia",
    revision_tesoreria: "tesorero",
  };

  let candidatos = await listarUsuariosConfiguradosPorClave({
    secret: args.secret,
    empresaId: args.empresaId,
    clave: clavePorFase[args.targetStage],
  });

  if (args.targetStage === "revision_tesoreria" && candidatos.length === 0) {
    candidatos = await listarUsuariosConfiguradosPorClave({
      secret: args.secret,
      empresaId: args.empresaId,
      clave: "tesoreria_default",
    });
  }

  const configurado = candidatos.some(
    (row: { usuarioId: string }) => row.usuarioId === assigneeId,
  );
  if (!configurado) {
    throw new Error("El responsable no pertenece al pool permitido para esta fase.");
  }

  return resolveResponsableDevolucion({
    responsableId: assigneeId,
    faseDestino: args.targetStage,
    empresaId: args.empresaId,
    authorization: args.authorization,
  });
}
