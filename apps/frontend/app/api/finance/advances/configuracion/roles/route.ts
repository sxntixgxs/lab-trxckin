import { NextRequest, NextResponse } from "next/server";
import {
  api,
  convexServer,
  getConvexServerSecret,
  requireAnticiposSession,
  resolveEmpresasPermitidas,
} from "../../_lib";

export async function POST(request: NextRequest) {
  const auth = await requireAnticiposSession("manage");
  if ("error" in auth) return auth.error;

  try {
    const body = (await request.json()) as {
      empresa?: number;
      rol?: "GERENCIA" | "TESORERO" | "CONTABILIDAD";
      userId?: string;
      nombre?: string;
      email?: string;
      usuarios?: Array<{ userId: string; nombre: string; email: string }>;
    };

    if (typeof body.empresa !== "number") {
      return NextResponse.json({ error: "Empresa inválida" }, { status: 400 });
    }
    if (body.rol !== "GERENCIA" && body.rol !== "TESORERO" && body.rol !== "CONTABILIDAD") {
      return NextResponse.json({ error: "Rol inválido" }, { status: 400 });
    }

    const empresas = resolveEmpresasPermitidas(auth.session, [body.empresa]);
    if ("error" in empresas) return empresas.error;

    const configId = await convexServer.mutation(api.financiero.anticipos.configurarRol, {
      secret: getConvexServerSecret(),
      empresa: body.empresa,
      rol: body.rol,
      userId: body.userId,
      nombre: body.nombre,
      email: body.email,
      usuarios: body.usuarios,
    });

    return NextResponse.json({ configId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error al guardar configuración";
    console.error("POST finanzas/anticipos/configuracion/roles", error);
    const status = message === "No autorizado" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
