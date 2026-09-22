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
    const result = await convexServer.query(api.facturacionReportes.listarPersonas, {
      secret: getConvexServerSecret(),
      empresas,
      tipo: params.get("tipo") === "participante" ? "participante" : "actual",
      busqueda: params.get("q") ?? undefined,
      cursor: params.get("cursor") ?? undefined,
      pageSize: 100,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("facturacion personas", error);
    return NextResponse.json(
      { error: "No se pudo cargar el directorio de responsables." },
      { status: 500 }
    );
  }
}
