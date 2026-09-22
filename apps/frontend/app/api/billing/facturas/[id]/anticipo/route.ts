import { NextRequest, NextResponse } from "next/server";

import type { Id } from "@/convex/_generated/dataModel";
import { requireBackendApiSession, userHasAccessToAny } from "@/lib/api-route-auth";
import { getConvexServerSecret, RUTAS_SISTEMA } from "../../../_lib";
import {
  assertEmpresaAutorizada,
  cambiarDuenoAnticipoFactura,
  fetchLideresActivosParaEmpresa,
  guardarCruceAnticipoFactura,
  mergeAnticipoOwnerCandidates,
  obtenerContextoAnticipoFactura,
  parseAnticipoOwnerSelectionKey,
  resolveActorFromSession,
  resolveLiderDirectorioSnapshot,
  validateChangeAnticipoOwnerInput,
  validateSaveAnticipoCrossInput,
} from "./anticipo-route-lib";

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
    accessToken: routeAuth.accessToken,
    session: routeAuth.session,
    actor,
  };
}

function resolveErrorStatus(message: string) {
  if (message === "Empresa no autorizada") return 403;
  if (message.includes("Factura no encontrada")) return 404;
  if (
    message.includes("asignación") ||
    message.includes("Asignación") ||
    message.includes("cruces activos cambiaron") ||
    message.includes("bolsa del anticipo cambió")
  ) {
    return 409;
  }
  if (
    message.includes("Selecciona") ||
    message.includes("Indica") ||
    message.includes("Cuerpo") ||
    message.toLowerCase().includes("líder")
  ) {
    return 400;
  }
  if (message.includes("No se pudo identificar")) return 401;
  if (message.includes("Sólo el usuario asignado")) return 403;
  return 500;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const auth = await requireFacturacionBuzonOrFacturasSession();
  if ("error" in auth) return auth.error;

  try {
    const { id } = await params;
    const facturaId = id as Id<"facturacionFacturas">;
    const asignacionId = request.nextUrl.searchParams.get("asignacionId");
    const ownerSelection = parseAnticipoOwnerSelectionKey(
      request.nextUrl.searchParams.get("ownerSelection")
    );

    let result = await obtenerContextoAnticipoFactura({
      secret: getConvexServerSecret(),
      facturaId,
      actorUserId: auth.actor.actorUserId,
      actorEmail: auth.actor.actorEmail,
      ...(asignacionId ? { asignacionId: asignacionId as Id<"facturacionAsignaciones"> } : {}),
      ...(ownerSelection?.source === "historial"
        ? { liderAsignacionId: ownerSelection.liderAsignacionId }
        : {}),
    });
    assertEmpresaAutorizada(auth.session, result.empresa);

    if (result.contexto.puedeCambiarResponsable) {
      const lideres = await fetchLideresActivosParaEmpresa({
        empresaId: result.empresa,
        authorization: `Bearer ${auth.accessToken}`,
      });
      if (ownerSelection?.source === "directorio_empresa") {
        const liderDirectorioPreview = resolveLiderDirectorioSnapshot(
          lideres,
          ownerSelection.liderUserId
        );
        result = await obtenerContextoAnticipoFactura({
          secret: getConvexServerSecret(),
          facturaId,
          actorUserId: auth.actor.actorUserId,
          actorEmail: auth.actor.actorEmail,
          ...(asignacionId ? { asignacionId: asignacionId as Id<"facturacionAsignaciones"> } : {}),
          liderDirectorioPreview,
        });
      }
      return NextResponse.json(mergeAnticipoOwnerCandidates(result.contexto, lideres));
    }

    return NextResponse.json(result.contexto);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error al cargar anticipo";
    console.error("GET facturacion/facturas/[id]/anticipo", error);
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
    const input = validateChangeAnticipoOwnerInput(body);

    const preview = await obtenerContextoAnticipoFactura({
      secret: getConvexServerSecret(),
      facturaId,
      actorUserId: auth.actor.actorUserId,
      actorEmail: auth.actor.actorEmail,
      asignacionId: input.asignacionId,
    });
    assertEmpresaAutorizada(auth.session, preview.empresa);

    let liderDirectorio: ReturnType<typeof resolveLiderDirectorioSnapshot> | undefined;
    if (input.ownerSelection.source === "directorio_empresa") {
      const lideres = await fetchLideresActivosParaEmpresa({
        empresaId: preview.empresa,
        authorization: `Bearer ${auth.accessToken}`,
      });
      liderDirectorio = resolveLiderDirectorioSnapshot(lideres, input.ownerSelection.liderUserId);
    }

    const result = await cambiarDuenoAnticipoFactura({
      secret: getConvexServerSecret(),
      facturaId,
      ...auth.actor,
      input,
      ...(liderDirectorio ? { liderDirectorio } : {}),
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const convexData =
      error &&
      typeof error === "object" &&
      "data" in error &&
      (error as { data?: { code?: string } }).data?.code === "CONFIRMAR_REVERSION_CRUCES"
        ? (error as { data: unknown }).data
        : null;
    if (convexData) {
      return NextResponse.json(convexData, { status: 409 });
    }
    const message = error instanceof Error ? error.message : "Error al cambiar dueño del anticipo";
    console.error("PATCH facturacion/facturas/[id]/anticipo", error);
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
    const input = validateSaveAnticipoCrossInput(body);

    const preview = await obtenerContextoAnticipoFactura({
      secret: getConvexServerSecret(),
      facturaId,
      actorUserId: auth.actor.actorUserId,
      actorEmail: auth.actor.actorEmail,
      asignacionId: input.asignacionId,
    });
    assertEmpresaAutorizada(auth.session, preview.empresa);

    let liderDirectorio: ReturnType<typeof resolveLiderDirectorioSnapshot> | undefined;
    if (input.ownerSelection?.source === "directorio_empresa") {
      const lideres = await fetchLideresActivosParaEmpresa({
        empresaId: preview.empresa,
        authorization: `Bearer ${auth.accessToken}`,
      });
      liderDirectorio = resolveLiderDirectorioSnapshot(lideres, input.ownerSelection.liderUserId);
    }

    const result = await guardarCruceAnticipoFactura({
      secret: getConvexServerSecret(),
      facturaId,
      ...auth.actor,
      input,
      ...(liderDirectorio ? { liderDirectorio } : {}),
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error al guardar cruce de anticipos";
    console.error("POST facturacion/facturas/[id]/anticipo", error);
    return NextResponse.json({ error: message }, { status: resolveErrorStatus(message) });
  }
}
