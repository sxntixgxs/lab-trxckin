import { NextRequest, NextResponse } from "next/server";
import {
  api,
  convexServer,
  getConvexServerSecret,
  parseEmpresasParam,
  RUTAS_SISTEMA,
  requireFacturacionSession,
  resolveEmpresasPermitidas,
} from "../../_lib";
import { fillTimingPage, parseTimingQueryFilters } from "./tiempos-route-lib";

export async function GET(request: NextRequest) {
  const auth = await requireFacturacionSession(RUTAS_SISTEMA.FACTURACION_FACTURAS);
  if ("error" in auth) return auth.error;
  const params = request.nextUrl.searchParams;
  const empresas = resolveEmpresasPermitidas(
    auth.session,
    parseEmpresasParam(params.get("empresas"))
  );
  if ("error" in empresas) return empresas.error;
  try {
    const secret = getConvexServerSecret();
    const filters = parseTimingQueryFilters(params, Date.now());
    const requestedPageSize = Number(params.get("pageSize"));
    const pageSize = [20, 50, 100].includes(requestedPageSize) ? requestedPageSize : 20;
    const result = await fillTimingPage({
      pageSize,
      cursor: params.get("cursor") || undefined,
      fetchPage: ({ cursor, pageSize: remainingPageSize }) =>
        convexServer.query(api.facturacionReportes.listarTiempos, {
          secret,
          empresas,
          ...filters,
          cursor,
          pageSize: remainingPageSize,
        }),
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("facturacion tiempos", error);
    return NextResponse.json(
      { error: "No se pudo cargar el reporte de tiempos." },
      { status: 500 }
    );
  }
}
