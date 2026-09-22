import { NextRequest, NextResponse } from "next/server";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { requireBackendApiSession } from "@/lib/api-route-auth";
import {
  convexServer,
  getConvexServerSecret,
  RUTAS_SISTEMA,
  requireFacturacionSession,
} from "../../../_lib";
import {
  assertEmpresaAutorizada,
  obtenerContextoDevolucionFactura,
  resolveResponsableDevolucion,
} from "./devolucion-route-lib";

type RouteParams = { params: Promise<{ id: string }> };

function resolveErrorStatus(message: string) {
  if (message === "Empresa no autorizada") return 403;
  if (message.includes("Factura no encontrada")) return 404;
  if (message.includes("asignación") || message.includes("Asignación")) return 409;
  if (
    message.includes("Selecciona") ||
    message.includes("observación") ||
    message.includes("Destino") ||
    message.includes("Responsable")
  ) {
    return 400;
  }
  return 500;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const routeAuth = await requireBackendApiSession();
  if (!routeAuth.ok) return routeAuth.response;

  const auth = await requireFacturacionSession(RUTAS_SISTEMA.FACTURACION_FACTURAS);
  if ("error" in auth) return auth.error;

  try {
    const { id } = await params;
    const facturaId = id as Id<"facturacionFacturas">;

    const contexto = await obtenerContextoDevolucionFactura({
      secret: getConvexServerSecret(),
      facturaId,
      authorization: `Bearer ${routeAuth.accessToken}`,
    });
    assertEmpresaAutorizada(auth.session, contexto.empresa);

    return NextResponse.json(contexto);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error al cargar devolución";
    console.error("GET facturacion/facturas/[id]/devolucion", error);
    return NextResponse.json({ error: message }, { status: resolveErrorStatus(message) });
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const routeAuth = await requireBackendApiSession();
  if (!routeAuth.ok) return routeAuth.response;

  const auth = await requireFacturacionSession(RUTAS_SISTEMA.FACTURACION_FACTURAS);
  if ("error" in auth) return auth.error;

  try {
    const { id } = await params;
    const facturaId = id as Id<"facturacionFacturas">;
    const body = (await request.json()) as {
      faseDestino?: string;
      comentario?: string;
      responsableId?: string;
      asignacionId?: string;
    };

    if (!body.faseDestino || typeof body.faseDestino !== "string") {
      return NextResponse.json({ error: "Indica la fase destino." }, { status: 400 });
    }
    if (!body.comentario || !body.comentario.trim()) {
      return NextResponse.json({ error: "La observación es obligatoria." }, { status: 400 });
    }

    const contexto = await obtenerContextoDevolucionFactura({
      secret: getConvexServerSecret(),
      facturaId,
      authorization: `Bearer ${routeAuth.accessToken}`,
    });
    assertEmpresaAutorizada(auth.session, contexto.empresa);

    if (!contexto.puedeDevolver) {
      return NextResponse.json({ error: "Esta factura no admite devolución." }, { status: 409 });
    }

    const destino = contexto.destinos.find(
      (row: { fase: string }) => row.fase === body.faseDestino
    );
    if (!destino) {
      return NextResponse.json({ error: "Destino no permitido." }, { status: 400 });
    }

    let responsableOverride;
    if (destino.requiereSeleccionResponsable) {
      if (!body.responsableId?.trim()) {
        return NextResponse.json(
          { error: "Selecciona un responsable para esta devolución." },
          { status: 400 }
        );
      }
      responsableOverride = await resolveResponsableDevolucion({
        responsableId: body.responsableId.trim(),
        faseDestino: body.faseDestino,
        empresaId: contexto.empresa,
        authorization: `Bearer ${routeAuth.accessToken}`,
      });
    } else if (body.responsableId) {
      return NextResponse.json(
        { error: "No debes enviar responsable para este destino." },
        { status: 400 }
      );
    }

    const actorUserId = auth.session.user.id.trim();
    if (!actorUserId) {
      return NextResponse.json(
        { error: "No se pudo identificar al usuario de la sesión." },
        { status: 401 }
      );
    }

    await convexServer.mutation(api.facturacionTareas.ejecutarDevolucionDesdeServidor, {
      secret: getConvexServerSecret(),
      facturaId,
      faseDestino: body.faseDestino as
        | "recepcion"
        | "revision_lider"
        | "causacion"
        | "revision_impuestos"
        | "eventos_dian"
        | "gerencia"
        | "revision_tesoreria",
      actorUserId,
      comentario: body.comentario.trim(),
      asignacionId:
        (body.asignacionId as Id<"facturacionAsignaciones"> | undefined) ??
        (contexto.asignacionId as Id<"facturacionAsignaciones"> | null) ??
        undefined,
      responsableOverride,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error al devolver la factura";
    console.error("POST facturacion/facturas/[id]/devolucion", error);
    return NextResponse.json({ error: message }, { status: resolveErrorStatus(message) });
  }
}
