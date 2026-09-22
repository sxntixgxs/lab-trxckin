import { NextRequest, NextResponse } from "next/server";
import type { Id } from "@/convex/_generated/dataModel";
import {
  api,
  convexServer,
  getConvexServerSecret,
  jsonAjusteError,
  requireAnticiposSession,
  resolveEmpresasPermitidas,
} from "@/app/api/finance/advances/_lib";

type RouteParams = { params: Promise<{ id: string; ajusteId: string }> };

export async function POST(request: NextRequest, { params }: RouteParams) {
  const auth = await requireAnticiposSession("manage");
  if ("error" in auth) return auth.error;

  try {
    const { id, ajusteId } = await params;
    const anticipoId = id as Id<"anticipos">;
    const ajusteDocId = ajusteId as Id<"anticiposAjustes">;
    const body = (await request.json()) as {
      operacionId?: string;
      motivo?: string;
      empresa?: number;
    };

    if (!body.operacionId?.trim()) {
      return NextResponse.json({ error: "operacionId es obligatorio" }, { status: 400 });
    }
    if (!body.motivo?.trim()) {
      return NextResponse.json({ error: "El motivo es obligatorio" }, { status: 400 });
    }
    if (typeof body.empresa !== "number") {
      return NextResponse.json({ error: "Empresa inválida" }, { status: 400 });
    }

    const empresas = resolveEmpresasPermitidas(auth.session, [body.empresa]);
    if ("error" in empresas) return empresas.error;

    const contexto = await convexServer.query(api.financiero.anticiposAjustes.obtenerContextoAjustes, {
      secret: getConvexServerSecret(),
      anticipoId,
      actorUserId: auth.session.user.id,
    });
    if (!contexto.capacidades.puedeReversar || !contexto.actorRol) {
      return NextResponse.json({ error: "Sin permiso para reversar ajustes" }, { status: 403 });
    }
    if (contexto.capacidades.ultimoAjusteActivoId !== ajusteDocId) {
      return NextResponse.json(
        { error: "Solo se puede reversar el último ajuste activo" },
        { status: 409 }
      );
    }

    const result = await convexServer.mutation(api.financiero.anticiposAjustes.reversarAjuste, {
      secret: getConvexServerSecret(),
      anticipoId,
      ajusteId: ajusteDocId,
      empresa: body.empresa,
      operacionId: body.operacionId.trim(),
      motivo: body.motivo.trim(),
      actor: {
        userId: auth.session.user.id,
        nombre: auth.session.user.nombre || auth.session.user.id,
        email: auth.session.user.email ?? "",
        rol: contexto.actorRol,
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("POST finanzas/anticipos/[id]/ajustes/[ajusteId]/reversar", error);
    return jsonAjusteError(error);
  }
}
