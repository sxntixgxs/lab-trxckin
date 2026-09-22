import { NextRequest, NextResponse } from "next/server";
import {
  api,
  convexServer,
  getConvexServerSecret,
  parseEmpresasParam,
  requireAnticiposSession,
  resolveEmpresasPermitidas,
} from "../../_lib";

export async function GET(request: NextRequest) {
  const auth = await requireAnticiposSession("manage");
  if ("error" in auth) return auth.error;
  const { searchParams } = request.nextUrl;
  const empresas = resolveEmpresasPermitidas(
    auth.session,
    parseEmpresasParam(searchParams.get("empresas"))
  );
  if ("error" in empresas) return empresas.error;
  try {
    const data = await convexServer.query(api.anticiposDashboard.resumen, {
      secret: getConvexServerSecret(),
      empresas,
      viewerUserId: auth.session.user.id,
      preset: searchParams.get("preset") ?? undefined,
      from: searchParams.get("from") ?? undefined,
      to: searchParams.get("to") ?? undefined,
    });
    return NextResponse.json(data);
  } catch (error) {
    console.error("anticipos dashboard resumen", error);
    return NextResponse.json({ error: "Error al cargar el resumen" }, { status: 500 });
  }
}
