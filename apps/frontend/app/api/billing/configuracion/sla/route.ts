import { NextRequest, NextResponse } from "next/server";
import {
  api,
  convexServer,
  getConvexServerSecret,
  RUTAS_SISTEMA,
  requireFacturacionSession,
  resolveEmpresasPermitidas,
} from "../../_lib";

export async function GET(request: NextRequest) {
  const auth = await requireFacturacionSession(RUTAS_SISTEMA.FACTURACION_CONFIGURACION);
  if ("error" in auth) return auth.error;

  const empresa = Number(request.nextUrl.searchParams.get("empresa"));
  if (!Number.isFinite(empresa)) {
    return NextResponse.json({ error: "empresa requerida" }, { status: 400 });
  }

  const empresasResult = resolveEmpresasPermitidas(auth.session, [empresa]);
  if ("error" in empresasResult) return empresasResult.error;

  try {
    const data = await convexServer.query(api.facturacionSla.getSlaConfig, {
      secret: getConvexServerSecret(),
      empresa,
    });
    return NextResponse.json(data);
  } catch (error) {
    console.error("facturacion sla get", error);
    return NextResponse.json({ error: "Error al cargar SLA" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireFacturacionSession(RUTAS_SISTEMA.FACTURACION_CONFIGURACION);
  if ("error" in auth) return auth.error;

  const body = await request.json();
  const empresa = Number(body.empresa);
  if (!Number.isFinite(empresa)) {
    return NextResponse.json({ error: "empresa requerida" }, { status: 400 });
  }

  const empresasResult = resolveEmpresasPermitidas(auth.session, [empresa]);
  if ("error" in empresasResult) return empresasResult.error;

  try {
    await convexServer.mutation(api.facturacionSla.putSlaConfig, {
      secret: getConvexServerSecret(),
      empresa,
      fases: body.fases ?? [],
      oversightEmails: body.oversightEmails ?? [],
      emailsHabilitados: body.emailsHabilitados,
      actorUserId: auth.session.user.id,
      actorNombre: auth.session.user.nombre,
      actorEmail: auth.session.user.email ?? undefined,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("facturacion sla put", error);
    const message = error instanceof Error ? error.message : "Error al guardar SLA";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
