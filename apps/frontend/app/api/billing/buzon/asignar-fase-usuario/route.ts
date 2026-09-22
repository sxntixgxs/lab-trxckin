import { NextRequest, NextResponse } from "next/server";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { requireBackendApiSession } from "@/lib/api-route-auth";
import {
  convexServer,
  getConvexServerSecret,
  RUTAS_SISTEMA,
  requireFacturacionSession,
} from "../../_lib";
import {
  assertActorEnGerenciaEmpresa,
  assertEmpresaAutorizada,
  obtenerAsignacionParaRuta,
  parseGerenciaPhaseTarget,
  resolveAssigneeForGerenciaTarget,
  type AsignarFaseUsuarioAssignmentInput,
} from "./asignar-fase-usuario-route-lib";

function resolveErrorStatus(message: string) {
  if (message === "Empresa no autorizada") return 403;
  if (message.includes("No autenticado") || message.includes("sesión")) return 401;
  if (message.includes("No autorizado") || message.includes("permisos de Gerencia")) {
    return 403;
  }
  if (message.includes("Asignación no encontrada")) return 404;
  if (message.includes("asignación") || message.includes("Asignación")) return 409;
  if (
    message.includes("Selecciona") ||
    message.includes("observación") ||
    message.includes("Responsable") ||
    message.includes("pool") ||
    message.includes("empresa")
  ) {
    return 400;
  }
  return 500;
}

function parseAssignments(body: unknown): AsignarFaseUsuarioAssignmentInput[] | null {
  if (!body || typeof body !== "object") return null;
  const assignments = (body as { assignments?: unknown }).assignments;
  if (!Array.isArray(assignments) || assignments.length === 0) return null;

  const parsed: AsignarFaseUsuarioAssignmentInput[] = [];
  for (const item of assignments) {
    if (!item || typeof item !== "object") return null;
    const row = item as Record<string, unknown>;
    const assignmentId =
      typeof row.assignmentId === "string" ? row.assignmentId.trim() : "";
    const targetStage = parseGerenciaPhaseTarget(row.targetStage);
    const assigneeId = typeof row.assigneeId === "string" ? row.assigneeId.trim() : "";
    const observation = typeof row.observation === "string" ? row.observation : "";
    if (!assignmentId || !targetStage || !assigneeId) return null;
    parsed.push({ assignmentId, targetStage, assigneeId, observation });
  }
  return parsed;
}

export async function POST(request: NextRequest) {
  const routeAuth = await requireBackendApiSession();
  if (!routeAuth.ok) return routeAuth.response;

  const auth = await requireFacturacionSession(RUTAS_SISTEMA.FACTURACION_BUZON);
  if ("error" in auth) return auth.error;

  try {
    const body = await request.json();
    const assignments = parseAssignments(body);
    if (!assignments) {
      return NextResponse.json({ error: "Indica al menos una asignación válida." }, { status: 400 });
    }

    const actorUserId = auth.session.user.id?.trim();
    if (!actorUserId) {
      return NextResponse.json(
        { error: "No se pudo identificar al usuario de la sesión." },
        { status: 401 },
      );
    }

    const secret = getConvexServerSecret();
    const authorization = `Bearer ${routeAuth.accessToken}`;

    const resolvedAssignments: Array<{
      asignacionId: Id<"facturacionAsignaciones">;
      targetStage: AsignarFaseUsuarioAssignmentInput["targetStage"];
      assignee: {
        usuarioId?: string;
        nombre: string;
        email: string;
        procesoId?: number;
        procesoNombre?: string;
      };
      observation: string;
    }> = [];

    let empresaComun: number | null = null;

    for (const item of assignments) {
      if (!item.observation.trim()) {
        return NextResponse.json({ error: "La observación es obligatoria." }, { status: 400 });
      }

      const asignacion = await obtenerAsignacionParaRuta({
        secret,
        assignmentId: item.assignmentId as Id<"facturacionAsignaciones">,
      });

      if (empresaComun === null) {
        empresaComun = asignacion.empresa;
      } else if (empresaComun !== asignacion.empresa) {
        return NextResponse.json(
          { error: "Todas las facturas deben pertenecer a la misma empresa." },
          { status: 400 },
        );
      }

      assertEmpresaAutorizada(auth.session, asignacion.empresa);
      await assertActorEnGerenciaEmpresa({
        secret,
        actorUserId,
        empresaId: asignacion.empresa,
      });

      const assignee = await resolveAssigneeForGerenciaTarget({
        secret,
        empresaId: asignacion.empresa,
        targetStage: item.targetStage,
        assigneeId: item.assigneeId,
        authorization,
      });

      const responsableActualId = asignacion.asignadoAUserId?.trim() ?? "";
      if (
        item.targetStage === asignacion.estado &&
        assignee.usuarioId?.trim() === responsableActualId
      ) {
        return NextResponse.json(
          {
            error:
              "La factura ya está en esa fase con el mismo responsable. Elige otro usuario o cambia la fase destino.",
          },
          { status: 400 },
        );
      }

      resolvedAssignments.push({
        asignacionId: item.assignmentId as Id<"facturacionAsignaciones">,
        targetStage: item.targetStage,
        assignee,
        observation: item.observation.trim(),
      });
    }

    const result = await convexServer.mutation(
      api.facturacionTareas.ejecutarAsignarFaseUsuarioDesdeServidor,
      {
        secret,
        actorUserId,
        actorNombre: auth.session.user.nombre || auth.session.user.email || "Usuario",
        actorEmail: auth.session.user.email || "sin-correo@example.com",
        assignments: resolvedAssignments,
      },
    );

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error al asignar fase y usuario";
    console.error("POST facturacion/buzon/asignar-fase-usuario", error);
    return NextResponse.json({ error: message }, { status: resolveErrorStatus(message) });
  }
}
