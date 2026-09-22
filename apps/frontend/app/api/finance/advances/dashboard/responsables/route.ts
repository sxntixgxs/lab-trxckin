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
  const empresas = resolveEmpresasPermitidas(
    auth.session,
    parseEmpresasParam(request.nextUrl.searchParams.get("empresas"))
  );
  if ("error" in empresas) return empresas.error;
  try {
    const data = await convexServer.query(api.anticiposDashboard.responsables, {
      secret: getConvexServerSecret(),
      empresas,
      viewerUserId: auth.session.user.id,
    });
    return NextResponse.json(data);
  } catch (error) {
    console.error("anticipos dashboard responsables", error);
    return NextResponse.json({ error: "Error al cargar responsables" }, { status: 500 });
  }
}
