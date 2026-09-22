import { NextRequest, NextResponse } from "next/server";

import { api } from "@/convex/_generated/api";
import { requireBackendApiSession } from "@/lib/api-route-auth";
import {
  convexServer,
  getConvexServerSecret,
  RUTAS_SISTEMA,
  requireFacturacionSession,
} from "../_lib";
import {
  assertEmpresaAutorizada,
  parseCrearDocumentoFisicoBody,
  resolveActorProceso,
} from "./documentos-fisicos-route-lib";

function resolveErrorStatus(message: string) {
  if (message === "Empresa no autorizada") return 403;
  if (message === "No autorizado") return 403;
  if (message.includes("No autenticado") || message.includes("sesión")) return 401;
  if (message.includes("líderes de proceso")) return 403;
  if (message.includes("Ya existe una factura")) return 409;
  if (message.includes("recepción") || message.includes("PEAJES")) return 400;
  if (
    message.includes("Selecciona") ||
    message.includes("Completa") ||
    message.includes("Ingresa") ||
    message.includes("Adjunta") ||
    message.includes("Indica") ||
    message.includes("inválid") ||
    message.includes("Cuerpo") ||
    message.includes("actor") ||
    message.includes("credenciales")
  ) {
    return 400;
  }
  return 500;
}

export async function POST(request: NextRequest) {
  const routeAuth = await requireBackendApiSession();
  if (!routeAuth.ok) return routeAuth.response;

  const auth = await requireFacturacionSession(RUTAS_SISTEMA.FACTURACION_BUZON);
  if ("error" in auth) return auth.error;

  if (auth.session.user.lider_proceso !== true) {
    return NextResponse.json(
      { error: "Solo líderes de proceso pueden crear documentos físicos." },
      { status: 403 },
    );
  }

  try {
    const body = await request.json();
    const input = parseCrearDocumentoFisicoBody(body);
    assertEmpresaAutorizada(auth.session, input.empresa);

    const actorUserId = auth.session.user.id?.trim();
    if (!actorUserId) {
      return NextResponse.json(
        { error: "No se pudo identificar al usuario de la sesión." },
        { status: 401 },
      );
    }

    const { actorProcesoId, actorProcesoNombre } = resolveActorProceso(auth.session);

    const result = await convexServer.mutation(
      api.facturacionFacturas.crearDocumentoFisicoDesdeServidor,
      {
        secret: getConvexServerSecret(),
        ...input,
        actorUserId,
        actorNombre: auth.session.user.nombre || auth.session.user.email || "Usuario",
        actorEmail: auth.session.user.email || "sin-correo@example.com",
        ...(actorProcesoId !== undefined ? { actorProcesoId } : {}),
        ...(actorProcesoNombre ? { actorProcesoNombre } : {}),
      },
    );

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error al crear el documento físico";
    console.error("POST facturacion/documentos-fisicos", error);
    return NextResponse.json({ error: message }, { status: resolveErrorStatus(message) });
  }
}
