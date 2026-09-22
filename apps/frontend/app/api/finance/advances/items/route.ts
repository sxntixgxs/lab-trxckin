import { NextRequest, NextResponse } from "next/server";
import {
  api,
  convexServer,
  getConvexServerSecret,
  parseEmpresasParam,
  requireAnticiposSession,
  resolveEmpresasPermitidas,
} from "../_lib";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const scope = searchParams.get("scope") ?? "visible";
  if (scope !== "buzon" && scope !== "mine" && scope !== "visible") {
    return NextResponse.json({ error: "Alcance inválido" }, { status: 400 });
  }
  const auth = await requireAnticiposSession(scope === "mine" ? "either" : "manage");
  if ("error" in auth) return auth.error;
  const empresas = resolveEmpresasPermitidas(
    auth.session,
    parseEmpresasParam(searchParams.get("empresas"))
  );
  if ("error" in empresas) return empresas.error;
  const pageSizeRaw = Number(searchParams.get("pageSize") ?? "20");
  const pageSize = [20, 50].includes(pageSizeRaw) ? pageSizeRaw : 20;

  try {
    const data = await convexServer.query(api.anticiposDashboard.items, {
      secret: getConvexServerSecret(),
      empresas,
      viewerUserId: auth.session.user.id,
      scope: scope as "buzon" | "mine" | "visible",
      mode:
        searchParams.get("mode") === "flow" || searchParams.get("mode") === "backlog"
          ? (searchParams.get("mode") as "flow" | "backlog")
          : undefined,
      preset: searchParams.get("preset") ?? undefined,
      from: searchParams.get("from") ?? undefined,
      to: searchParams.get("to") ?? undefined,
      busqueda: searchParams.get("q") ?? undefined,
      fase: searchParams.get("fase") ?? undefined,
      urgencia:
        (searchParams.get("urgencia") as
          | "all"
          | "overdue"
          | "due_soon"
          | "returned"
          | "integrity"
          | null) ?? undefined,
      cubreFacturaCompleta:
        searchParams.get("cobertura") === "total"
          ? true
          : searchParams.get("cobertura") === "parcial"
            ? false
            : undefined,
      responsable: searchParams.get("responsable") ?? undefined,
      kpi: searchParams.get("kpi") ?? undefined,
      pageSize,
      cursor: searchParams.get("cursor") ?? undefined,
    });
    return NextResponse.json(data);
  } catch (error) {
    console.error("anticipos items", error);
    return NextResponse.json({ error: "Error al cargar anticipos" }, { status: 500 });
  }
}
