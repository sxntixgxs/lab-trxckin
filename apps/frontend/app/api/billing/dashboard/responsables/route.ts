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
  const auth = await requireFacturacionSession(RUTAS_SISTEMA.FACTURACION_DASHBOARD);
  if ("error" in auth) return auth.error;

  const { searchParams } = request.nextUrl;
  const empresasResult = resolveEmpresasPermitidas(
    auth.session,
    parseEmpresasParam(searchParams.get("empresas"))
  );
  if ("error" in empresasResult) return empresasResult.error;

  try {
    const data = await convexServer.query(api.facturacionDashboard.responsables, {
      secret: getConvexServerSecret(),
      empresas: empresasResult,
      preset: searchParams.get("preset") ?? undefined,
      from: searchParams.get("from") ?? undefined,
      to: searchParams.get("to") ?? undefined,
    });
    return NextResponse.json(data);
  } catch (error) {
    console.error("facturacion dashboard responsables", error);
    return NextResponse.json({ error: "Error al cargar responsables" }, { status: 500 });
  }
}
