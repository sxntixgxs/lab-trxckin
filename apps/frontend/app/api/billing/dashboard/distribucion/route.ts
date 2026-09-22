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

function parseListParam(value: string | null) {
  if (!value) return undefined;
  const items = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
}

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
    const data = await convexServer.query(api.facturacionDashboard.distribucion, {
      secret: getConvexServerSecret(),
      empresas: empresasResult,
      preset: searchParams.get("preset") ?? undefined,
      from: searchParams.get("from") ?? undefined,
      to: searchParams.get("to") ?? undefined,
      busqueda: searchParams.get("q") ?? undefined,
      grupoFase: searchParams.get("grupoFase") ?? undefined,
      fase: searchParams.get("fase") ?? undefined,
      responsableUserIds: parseListParam(searchParams.get("responsableUserIds")),
      responsableEmails: parseListParam(searchParams.get("responsableEmails")),
      slaEstado: searchParams.get("slaEstado") ?? undefined,
      tipoFlujo: searchParams.get("tipoFlujo") ?? undefined,
      documentoClase: searchParams.get("documentoClase") ?? undefined,
      moneda: searchParams.get("moneda") ?? undefined,
      soloActivas: searchParams.get("soloActivas") !== "false",
      ignoreDateRange: searchParams.get("ignoreDateRange") === "true",
    });
    return NextResponse.json(data);
  } catch (error) {
    console.error("facturacion dashboard distribucion", error);
    return NextResponse.json({ error: "Error al cargar distribución" }, { status: 500 });
  }
}
