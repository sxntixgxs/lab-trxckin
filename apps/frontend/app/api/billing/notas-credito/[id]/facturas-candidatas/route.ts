import { NextRequest, NextResponse } from "next/server";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  convexServer,
  getConvexServerSecret,
  requireFacturacionSession,
  RUTAS_SISTEMA,
} from "@/app/api/billing/_lib";
import {
  assertEmpresaAutorizada,
  resolveRelacionErrorStatus,
} from "../../notas-credito-relacion-route-lib";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  const auth = await requireFacturacionSession(RUTAS_SISTEMA.FACTURACION_FACTURAS);
  if ("error" in auth) return auth.error;

  try {
    const { id } = await params;
    const q = request.nextUrl.searchParams.get("q") ?? "";
    const secret = getConvexServerSecret();
    const notaCreditoId = id as Id<"facturacionFacturas">;

    const contexto = await convexServer.query(
      api.facturacionNotaCreditoRelacion.obtenerNotaCreditoParaRelacionDesdeServidor,
      { secret, notaCreditoId }
    );
    assertEmpresaAutorizada(auth.session, contexto.empresa);

    const result = await convexServer.query(
      api.facturacionNotaCreditoRelacion.buscarFacturasCandidatasDesdeServidor,
      { secret, notaCreditoId, q }
    );
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error al buscar candidatas";
    console.error("GET notas-credito/[id]/facturas-candidatas", error);
    return NextResponse.json(
      { error: message },
      { status: resolveRelacionErrorStatus(message) }
    );
  }
}
