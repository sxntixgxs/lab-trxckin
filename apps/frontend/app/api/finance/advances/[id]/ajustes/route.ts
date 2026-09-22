import { NextRequest, NextResponse } from "next/server";
import type { Id } from "@/convex/_generated/dataModel";
import { hasAtMostTwoDecimals } from "@/lib/money";
import {
  api,
  convexServer,
  getConvexServerSecret,
  jsonAjusteError,
  requireAnticiposSession,
  resolveEmpresasPermitidas,
} from "../../_lib";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  const auth = await requireAnticiposSession("manage");
  if ("error" in auth) return auth.error;

  try {
    const { id } = await params;
    const anticipoId = id as Id<"anticipos">;
    const { searchParams } = request.nextUrl;
    const historialCursor = searchParams.get("historialCursor");
    const historialNumItems = Number(searchParams.get("historialPageSize") ?? "20");

    const data = await convexServer.query(
      api.financiero.anticiposAjustes.obtenerContextoAjustes,
      {
        secret: getConvexServerSecret(),
        anticipoId,
        actorUserId: auth.session.user.id,
        historialPagination: {
          numItems: Number.isFinite(historialNumItems)
            ? Math.min(50, Math.max(1, historialNumItems))
            : 20,
          cursor: historialCursor,
        },
      }
    );

    const empresas = resolveEmpresasPermitidas(auth.session, [data.empresa]);
    if ("error" in empresas) return empresas.error;

    return NextResponse.json(data);
  } catch (error) {
    console.error("GET finanzas/anticipos/[id]/ajustes", error);
    return jsonAjusteError(error);
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const auth = await requireAnticiposSession("manage");
  if ("error" in auth) return auth.error;

  try {
    const { id } = await params;
    const anticipoId = id as Id<"anticipos">;
    const body = (await request.json()) as {
      operacionId?: string;
      tipo?: "CORRECCION_DESEMBOLSO" | "REINTEGRO" | "CUADRE_OTROS_SISTEMAS";
      operacion?: "SUMAR" | "RESTAR";
      montoAjuste?: number;
      valorEsperado?: number;
      motivo?: string;
      soporte?: { storageId: string; nombre: string };
      empresa?: number;
    };

    if (!body.operacionId?.trim()) {
      return NextResponse.json({ error: "operacionId es obligatorio" }, { status: 400 });
    }
    if (
      body.tipo !== "CORRECCION_DESEMBOLSO" &&
      body.tipo !== "REINTEGRO" &&
      body.tipo !== "CUADRE_OTROS_SISTEMAS"
    ) {
      return NextResponse.json({ error: "tipo inválido" }, { status: 400 });
    }
    if (body.operacion !== "SUMAR" && body.operacion !== "RESTAR") {
      return NextResponse.json({ error: "operacion inválida" }, { status: 400 });
    }
    if (typeof body.montoAjuste !== "number" || typeof body.valorEsperado !== "number") {
      return NextResponse.json({ error: "Indica montoAjuste y valorEsperado" }, { status: 400 });
    }
    if (
      !Number.isFinite(body.montoAjuste) ||
      body.montoAjuste <= 0 ||
      !hasAtMostTwoDecimals(body.montoAjuste)
    ) {
      return NextResponse.json(
        { error: "montoAjuste debe ser mayor a cero y tener máximo dos decimales" },
        { status: 400 }
      );
    }
    if (!body.motivo?.trim()) {
      return NextResponse.json({ error: "El motivo es obligatorio" }, { status: 400 });
    }
    if (typeof body.empresa !== "number") {
      return NextResponse.json({ error: "Empresa inválida" }, { status: 400 });
    }

    const empresas = resolveEmpresasPermitidas(auth.session, [body.empresa]);
    if ("error" in empresas) return empresas.error;

    const contexto = await convexServer.query(
      api.financiero.anticiposAjustes.obtenerContextoAjustes,
      {
        secret: getConvexServerSecret(),
        anticipoId,
        actorUserId: auth.session.user.id,
      }
    );
    if (!contexto.capacidades.puedeAplicar || !contexto.actorRol) {
      return NextResponse.json({ error: "Sin permiso para registrar ajustes" }, { status: 403 });
    }

    const result = await convexServer.mutation(api.financiero.anticiposAjustes.aplicarAjuste, {
      secret: getConvexServerSecret(),
      anticipoId,
      empresa: body.empresa,
      operacionId: body.operacionId.trim(),
      tipo: body.tipo,
      operacion: body.operacion,
      montoAjuste: body.montoAjuste,
      valorEsperado: body.valorEsperado,
      motivo: body.motivo.trim(),
      soporte: body.soporte
        ? {
            storageId: body.soporte.storageId as Id<"_storage">,
            nombre: body.soporte.nombre,
          }
        : undefined,
      actor: {
        userId: auth.session.user.id,
        nombre: auth.session.user.nombre || auth.session.user.id,
        email: auth.session.user.email ?? "",
        rol: contexto.actorRol,
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("POST finanzas/anticipos/[id]/ajustes", error);
    return jsonAjusteError(error);
  }
}
