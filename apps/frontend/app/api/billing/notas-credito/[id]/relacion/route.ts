import { NextRequest, NextResponse } from "next/server";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  convexServer,
  getConvexServerSecret,
  requireFacturacionSession,
  RUTAS_SISTEMA,
} from "@/app/api/billing/_lib";
import {
  assertEmpresaAutorizada,
  resolveActorFromSession,
  resolveRelacionErrorStatus,
} from "../../notas-credito-relacion-route-lib";

type RouteParams = { params: Promise<{ id: string }> };

type PeajesDocumentoBody = {
  tipo: "factura" | "nota_credito";
  numero: string;
  numeroNormalizado: string;
  referencia?: string;
  referenciaNormalizada?: string;
  total: number;
  proveedorNit?: string;
  operador?: string;
  placa?: string;
  centroCosto?: string;
  fechaCreacion?: string;
};

type RelacionBody = {
  facturaNuevaId?: string;
  facturaAnteriorEfectivaEsperadaId?: string | null;
  origenRelacionAnteriorEsperado?: "dian" | "manual" | "sin_relacion";
  motivo?: string;
  contexto?:
    | { tipo: "detalle_factura" }
    | {
        tipo: "conciliacion_peajes";
        archivoNombre: string;
        documentosArchivo: PeajesDocumentoBody[];
      };
  actorUserId?: string;
  actorNombre?: string;
  actorEmail?: string;
};

export async function POST(request: NextRequest, { params }: RouteParams) {
  const auth = await requireFacturacionSession(RUTAS_SISTEMA.FACTURACION_FACTURAS);
  if ("error" in auth) return auth.error;

  try {
    const { id } = await params;
    const body = (await request.json()) as RelacionBody;
    const notaCreditoId = id as Id<"facturacionFacturas">;
    const secret = getConvexServerSecret();

    if (!body.facturaNuevaId || typeof body.facturaNuevaId !== "string") {
      return NextResponse.json(
        { error: "Indica la factura destino." },
        { status: 400 }
      );
    }
    if (
      body.origenRelacionAnteriorEsperado !== "dian" &&
      body.origenRelacionAnteriorEsperado !== "manual" &&
      body.origenRelacionAnteriorEsperado !== "sin_relacion"
    ) {
      return NextResponse.json(
        { error: "Origen de relación esperado inválido." },
        { status: 400 }
      );
    }
    if (!body.motivo || !body.motivo.trim()) {
      return NextResponse.json(
        { error: "El motivo es obligatorio." },
        { status: 400 }
      );
    }
    if (body.motivo.trim().length > 500) {
      return NextResponse.json(
        { error: "El motivo no puede superar 500 caracteres." },
        { status: 400 }
      );
    }
    if (!body.contexto || typeof body.contexto !== "object") {
      return NextResponse.json(
        { error: "Indica el contexto de la reasignación." },
        { status: 400 }
      );
    }

    const contexto = await convexServer.query(
      api.facturacionNotaCreditoRelacion.obtenerNotaCreditoParaRelacionDesdeServidor,
      { secret, notaCreditoId }
    );
    assertEmpresaAutorizada(auth.session, contexto.empresa);

    const actor = resolveActorFromSession(auth.session);
    const result = await convexServer.mutation(
      api.facturacionNotaCreditoRelacion.reasignarNotaCreditoDesdeServidor,
      {
        secret,
        notaCreditoId,
        facturaNuevaId: body.facturaNuevaId as Id<"facturacionFacturas">,
        facturaAnteriorEfectivaEsperadaId: body.facturaAnteriorEfectivaEsperadaId
          ? (body.facturaAnteriorEfectivaEsperadaId as Id<"facturacionFacturas">)
          : null,
        origenRelacionAnteriorEsperado: body.origenRelacionAnteriorEsperado,
        motivo: body.motivo,
        contexto: body.contexto,
        ...actor,
      }
    );

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error al reasignar nota crédito";
    console.error("POST notas-credito/[id]/relacion", error);
    return NextResponse.json(
      {
        error: message.replace(
          /^(BLOQUEADO:|CONFLICTO_RELACION:|VALIDACION_PEAJES:)\s*/,
          ""
        ),
      },
      { status: resolveRelacionErrorStatus(message) }
    );
  }
}
