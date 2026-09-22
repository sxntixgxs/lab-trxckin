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

export async function GET(request: NextRequest) {
  const auth = await requireFacturacionSession(RUTAS_SISTEMA.FACTURACION_DASHBOARD);
  if ("error" in auth) return auth.error;

  const { searchParams } = request.nextUrl;
  const empresasResult = resolveEmpresasPermitidas(
    auth.session,
    parseEmpresasParam(searchParams.get("empresas"))
  );
  if ("error" in empresasResult) return empresasResult.error;

  const group = searchParams.get("group")?.trim();
  if (!group) {
    return NextResponse.json({ error: "Indica el grupo de responsabilidad." }, { status: 400 });
  }

  const userId = searchParams.get("userId")?.trim() || undefined;
  const email = searchParams.get("email")?.trim() || undefined;
  if (!userId && !email) {
    return NextResponse.json(
      { error: "Indica userId o email del responsable." },
      { status: 400 }
    );
  }

  const pageSizeRaw = Number(searchParams.get("pageSize") ?? "50");
  const pageSize = Number.isFinite(pageSizeRaw)
    ? Math.min(Math.max(Math.trunc(pageSizeRaw), 1), 100)
    : 50;

  try {
    const data = await convexServer.query(api.facturacionDashboard.facturasPorResponsable, {
      secret: getConvexServerSecret(),
      empresas: empresasResult,
      preset: searchParams.get("preset") ?? undefined,
      from: searchParams.get("from") ?? undefined,
      to: searchParams.get("to") ?? undefined,
      group,
      userId,
      email,
      pageSize,
      cursor: searchParams.get("cursor") ?? undefined,
    });
    return NextResponse.json(data);
  } catch (error) {
    console.error("facturacion dashboard responsables facturas", error);
    const message = error instanceof Error ? error.message : "Error al cargar facturas";
    const status =
      message.includes("Grupo") || message.includes("userId") || message.includes("email")
        ? 400
        : 500;
    return NextResponse.json(
      { error: status === 400 ? message : "Error al cargar facturas del responsable" },
      { status }
    );
  }
}
