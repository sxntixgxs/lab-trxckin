import { NextRequest, NextResponse } from "next/server";
import {
  api,
  convexServer,
  getConvexServerSecret,
  parseEmpresasParam,
  RUTAS_SISTEMA,
  requireFacturacionSession,
  resolveEmpresasPermitidas,
} from "../../../_lib";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ facturaId: string }> }
) {
  const auth = await requireFacturacionSession(RUTAS_SISTEMA.FACTURACION_FACTURAS);
  if ("error" in auth) return auth.error;
  const { facturaId } = await context.params;
  const empresas = resolveEmpresasPermitidas(
    auth.session,
    parseEmpresasParam(request.nextUrl.searchParams.get("empresas"))
  );
  if ("error" in empresas) return empresas.error;
  try {
    const result = await convexServer.query(api.facturacionReportes.obtenerDetalleTiempo, {
      secret: getConvexServerSecret(),
      facturaId: facturaId as never,
      empresas,
      nowMs: request.nextUrl.searchParams.get("nowMs")
        ? Number(request.nextUrl.searchParams.get("nowMs"))
        : undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("facturacion tiempos detalle", error);
    return NextResponse.json(
      { error: "No se pudo cargar el detalle de tiempos." },
      { status: 500 }
    );
  }
}
