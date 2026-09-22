import { NextRequest, NextResponse } from "next/server";

import type { Id } from "@/convex/_generated/dataModel";
import { requireBackendApiSession, userHasAccessToAny } from "@/lib/api-route-auth";
import { getConvexServerSecret, RUTAS_SISTEMA } from "../../../_lib";
import {
  agregarCruceDocumentoInternoFactura,
  assertEmpresaAutorizada,
  editarCruceDocumentoInternoFactura,
  obtenerResumenCrucesInternosFactura,
  resolveActorFromSession,
  retirarCruceDocumentoInternoFactura,
  validateAgregarCruceDocumentoInternoInput,
  validateEditarCruceDocumentoInternoInput,
  validateRetirarCruceDocumentoInternoInput,
} from "./cruces-internos-route-lib";

type RouteParams = { params: Promise<{ id: string }> };

async function requireFacturacionBuzonOrFacturasSession() {
  const routeAuth = await requireBackendApiSession();
  if (!routeAuth.ok) return { error: routeAuth.response as NextResponse };

  const hasAccess = userHasAccessToAny(routeAuth.user, [
    RUTAS_SISTEMA.FACTURACION_BUZON,
    RUTAS_SISTEMA.FACTURACION_FACTURAS,
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

function resolveErrorStatus(message: string) {
  if (message === "Empresa no autorizada") return 403;
  if (message.includes("Factura no encontrada") || message.includes("no encontrado")) {
    return 404;
  }
  if (
    message.includes("asignación") ||
    message.includes("Asignación") ||
    message.includes("cambió") ||
    message.includes("Recarga")
  ) {
    return 409;
  }
  if (
    message.includes("Indica") ||
    message.includes("Cuerpo") ||
    message.includes("obligatorio") ||
    message.includes("debe") ||
    message.includes("admite") ||
    message.includes("superar") ||
    message.includes("Ya existe")
  ) {
    return 400;
  }
  if (message.includes("No se pudo identificar")) return 401;
  if (message.includes("Sólo el usuario asignado") || message.includes("Sin permiso")) return 403;
  return 500;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const auth = await requireFacturacionBuzonOrFacturasSession();
  if ("error" in auth) return auth.error;

  try {
    const { id } = await params;
    const facturaId = id as Id<"facturacionFacturas">;
    const asignacionId = request.nextUrl.searchParams.get("asignacionId");
    const cursor = request.nextUrl.searchParams.get("cursor");
    const limitRaw = request.nextUrl.searchParams.get("limit");
    const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 50;

    const result = await obtenerResumenCrucesInternosFactura({
      secret: getConvexServerSecret(),
      facturaId,
      actorUserId: auth.actor.actorUserId,
      actorEmail: auth.actor.actorEmail,
      ...(asignacionId ? { asignacionId: asignacionId as Id<"facturacionAsignaciones"> } : {}),
      cursor,
      limit: Number.isFinite(limit) ? Math.min(limit, 50) : 50,
    });
    assertEmpresaAutorizada(auth.session, result.empresa);

    const { empresa: _empresa, ...payload } = result;
    return NextResponse.json(payload);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error al cargar cruces internos";
    console.error("GET facturacion/facturas/[id]/cruces-internos", error);
    return NextResponse.json({ error: message }, { status: resolveErrorStatus(message) });
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const auth = await requireFacturacionBuzonOrFacturasSession();
  if ("error" in auth) return auth.error;

  try {
    const { id } = await params;
    const facturaId = id as Id<"facturacionFacturas">;
    const body = await request.json();
    const input = validateAgregarCruceDocumentoInternoInput(body);

    const preview = await obtenerResumenCrucesInternosFactura({
      secret: getConvexServerSecret(),
      facturaId,
      actorUserId: auth.actor.actorUserId,
      actorEmail: auth.actor.actorEmail,
      asignacionId: input.asignacionId,
      limit: 1,
    });
    assertEmpresaAutorizada(auth.session, preview.empresa);

    const result = await agregarCruceDocumentoInternoFactura({
      secret: getConvexServerSecret(),
      facturaId,
      ...auth.actor,
      input,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error al agregar documento interno";
    console.error("POST facturacion/facturas/[id]/cruces-internos", error);
    return NextResponse.json({ error: message }, { status: resolveErrorStatus(message) });
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const auth = await requireFacturacionBuzonOrFacturasSession();
  if ("error" in auth) return auth.error;

  try {
    const { id } = await params;
    const facturaId = id as Id<"facturacionFacturas">;
    const body = await request.json();
    const input = validateEditarCruceDocumentoInternoInput(body);

    const preview = await obtenerResumenCrucesInternosFactura({
      secret: getConvexServerSecret(),
      facturaId,
      actorUserId: auth.actor.actorUserId,
      actorEmail: auth.actor.actorEmail,
      asignacionId: input.asignacionId,
      limit: 1,
    });
    assertEmpresaAutorizada(auth.session, preview.empresa);

    const result = await editarCruceDocumentoInternoFactura({
      secret: getConvexServerSecret(),
      facturaId,
      ...auth.actor,
      input,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error al editar documento interno";
    console.error("PATCH facturacion/facturas/[id]/cruces-internos", error);
    return NextResponse.json({ error: message }, { status: resolveErrorStatus(message) });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const auth = await requireFacturacionBuzonOrFacturasSession();
  if ("error" in auth) return auth.error;

  try {
    const { id } = await params;
    const facturaId = id as Id<"facturacionFacturas">;
    const body = await request.json();
    const input = validateRetirarCruceDocumentoInternoInput(body);

    const preview = await obtenerResumenCrucesInternosFactura({
      secret: getConvexServerSecret(),
      facturaId,
      actorUserId: auth.actor.actorUserId,
      actorEmail: auth.actor.actorEmail,
      asignacionId: input.asignacionId,
      limit: 1,
    });
    assertEmpresaAutorizada(auth.session, preview.empresa);

    const result = await retirarCruceDocumentoInternoFactura({
      secret: getConvexServerSecret(),
      facturaId,
      ...auth.actor,
      input,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error al retirar documento interno";
    console.error("DELETE facturacion/facturas/[id]/cruces-internos", error);
    return NextResponse.json({ error: message }, { status: resolveErrorStatus(message) });
  }
}
