import { NextRequest, NextResponse } from "next/server";

import type { Id } from "@/convex/_generated/dataModel";
import { requireBackendApiSession, userHasAccessToAny } from "@/lib/api-route-auth";
import { getConvexServerSecret, RUTAS_SISTEMA } from "../../../_lib";
import {
  actualizarCausacionFactura,
  mapConvexCausacionError,
  obtenerCausacionFactura,
  parseCausacionContexto,
  parseCausacionPatchBody,
  resolveActorFromSession,
  resolveEmpresasAutorizadas,
} from "./causacion-route-lib";

type RouteParams = { params: Promise<{ id: string }> };

async function requireFacturacionCausacionSession() {
  const routeAuth = await requireBackendApiSession();
  if (!routeAuth.ok) return { error: routeAuth.response as NextResponse };

  const hasAccess = userHasAccessToAny(routeAuth.user, [
    RUTAS_SISTEMA.FACTURACION_BUZON,
    RUTAS_SISTEMA.FACTURACION_FACTURAS,
    RUTAS_SISTEMA.FACTURACION_REEMBOLSO_CAJA_MENOR,
  ]);

  if (!hasAccess) {
    return {
      error: NextResponse.json({ error: "Sin permiso" }, { status: 403 }),
    };
  }

  const actor = resolveActorFromSession(routeAuth.session);
  return {
    session: routeAuth.session,
    actor,
  };
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const auth = await requireFacturacionCausacionSession();
  if ("error" in auth) return auth.error;

  try {
    const { id } = await params;
    const facturaId = id as Id<"facturacionFacturas">;
    const contexto = parseCausacionContexto(request.nextUrl.searchParams);
    const historialCursor = request.nextUrl.searchParams.get("historialCursor") ?? undefined;

    const result = await obtenerCausacionFactura({
      secret: getConvexServerSecret(),
      facturaId,
      actorUserId: auth.actor.actorUserId,
      empresasAutorizadas: resolveEmpresasAutorizadas(auth.session),
      contexto,
      historialCursor,
    });

    return NextResponse.json(result);
  } catch (error) {
    const mapped = mapConvexCausacionError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const auth = await requireFacturacionCausacionSession();
  if ("error" in auth) return auth.error;

  try {
    const { id } = await params;
    const facturaId = id as Id<"facturacionFacturas">;
    const body = await request.json();
    const payload = parseCausacionPatchBody(body);

    const result = await actualizarCausacionFactura({
      secret: getConvexServerSecret(),
      facturaId,
      actor: {
        userId: auth.actor.actorUserId,
        nombre: auth.actor.actorNombre,
        email: auth.actor.actorEmail,
      },
      empresasAutorizadas: resolveEmpresasAutorizadas(auth.session),
      payload,
    });

    return NextResponse.json(result);
  } catch (error) {
    const mapped = mapConvexCausacionError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
