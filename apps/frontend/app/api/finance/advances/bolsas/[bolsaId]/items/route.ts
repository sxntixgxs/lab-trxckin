import { NextRequest, NextResponse } from "next/server";
import {
  api,
  convexServer,
  getConvexServerSecret,
  parseEmpresasParam,
  requireAnticiposSession,
  resolveEmpresasPermitidas,
} from "../../../_lib";
import type { Id } from "@/convex/_generated/dataModel";

const VALID_ESTADO = new Set(["pending", "overdue", "legalized", "all"]);
const VALID_ORDEN = new Set(["priority", "pending", "recent"]);

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ bolsaId: string }> }
) {
  const auth = await requireAnticiposSession("manage");
  if ("error" in auth) return auth.error;
  const empresas = resolveEmpresasPermitidas(
    auth.session,
    parseEmpresasParam(request.nextUrl.searchParams.get("empresas"))
  );
  if ("error" in empresas) return empresas.error;

  const { bolsaId: rawBolsaId } = await context.params;
  const bolsaId = rawBolsaId?.trim();
  if (!bolsaId || bolsaId.toLowerCase() === "null" || bolsaId.toLowerCase() === "undefined") {
    return NextResponse.json({ error: "Bolsa no indicada" }, { status: 400 });
  }

  const { searchParams } = request.nextUrl;
  const estadoRaw = searchParams.get("estado") ?? "pending";
  const ordenRaw = searchParams.get("orden") ?? "priority";
  if (!VALID_ESTADO.has(estadoRaw)) {
    return NextResponse.json({ error: "Estado inválido" }, { status: 400 });
  }
  if (!VALID_ORDEN.has(ordenRaw)) {
    return NextResponse.json({ error: "Orden inválido" }, { status: 400 });
  }

  const pageSizeRaw = Number(searchParams.get("pageSize") ?? "20");
  const pageSize = pageSizeRaw === 20 ? 20 : 20;

  try {
    const data = await convexServer.query(api.anticiposDashboard.bolsaItems, {
      secret: getConvexServerSecret(),
      bolsaId: bolsaId as Id<"bolsasAnticipos">,
      empresas,
      viewerUserId: auth.session.user.id,
      q: searchParams.get("q") ?? undefined,
      estado: estadoRaw as "pending" | "overdue" | "legalized" | "all",
      orden: ordenRaw as "priority" | "pending" | "recent",
      pageSize,
      cursor: searchParams.get("cursor") ?? undefined,
    });

    if (!data) {
      return NextResponse.json({ error: "Bolsa no encontrada" }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("anticipos bolsa items", error);
    return NextResponse.json({ error: "Error al cargar los anticipos de la bolsa" }, { status: 500 });
  }
}
