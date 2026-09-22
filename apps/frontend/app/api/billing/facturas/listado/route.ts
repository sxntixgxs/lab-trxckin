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
import { fillTimingPage } from "../tiempos/tiempos-route-lib";

function list(value: string | null) {
  if (!value) return undefined;
  const values = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return values.length ? values : undefined;
}

function parseCausacionEstado(
  value: string | null
): "causado" | "no_causado" | "sin_registro" | undefined {
  if (value === "causado" || value === "no_causado" || value === "sin_registro") {
    return value;
  }
  return undefined;
}

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
    const pageSize = [20, 50, 100].includes(Number(params.get("pageSize")))
      ? Number(params.get("pageSize"))
      : 20;
    const queryArgs = {
      secret: getConvexServerSecret(),
      empresas,
      busqueda: params.get("q") ?? undefined,
      documentoClase: params.get("documentoClase") ?? undefined,
      estados: list(params.get("estados")),
      soloRechazos: params.get("soloRechazos") === "true" ? true : undefined,
      fechaEmisionDesde: params.get("desde") ?? undefined,
      fechaEmisionHasta: params.get("hasta") ?? undefined,
      montoMin: params.get("montoMin") ? Number(params.get("montoMin")) : undefined,
      montoMax: params.get("montoMax") ? Number(params.get("montoMax")) : undefined,
      origen: params.get("origen") ?? undefined,
      tipoFlujoListado: params.get("tipoFlujo") ?? undefined,
      causacionEstado: parseCausacionEstado(params.get("causacionEstado")),
      responsableUserIds: list(params.get("responsableUserIds")),
      responsableEmails: list(params.get("responsableEmails")),
      incluirSinResponsable: params.get("sinResponsable") === "true" ? true : undefined,
    };

    const result = queryArgs.causacionEstado
      ? await fillTimingPage({
          pageSize,
          cursor: params.get("cursor") ?? undefined,
          fetchPage: ({ cursor, pageSize: requestedPageSize }) =>
            convexServer.query(api.facturacionReportes.listarListado, {
              ...queryArgs,
              cursor,
              pageSize: requestedPageSize,
            }),
        })
      : await convexServer.query(api.facturacionReportes.listarListado, {
          ...queryArgs,
          cursor: params.get("cursor") ?? undefined,
          pageSize,
        });
    return NextResponse.json(result);
  } catch (error) {
    console.error("facturacion listado", error);
    return NextResponse.json(
      { error: "No se pudo cargar el listado de facturas." },
      { status: 500 }
    );
  }
}
