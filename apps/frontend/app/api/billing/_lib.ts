import { NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { requireApiSession, userHasAccess } from "@/lib/api-route-auth";
import { convexServer, getConvexServerSecret } from "@/lib/convexServerClient";
import { RUTAS_SISTEMA } from "@/lib/rutas-sistema";
import { parseEmpresasParam, resolveEmpresasPermitidas } from "./empresa-scope";

export { getConvexServerSecret };

export async function requireFacturacionSession(ruta: string) {
  const auth = await requireApiSession();
  if (!auth.ok) {
    return { error: auth.response };
  }

  if (!userHasAccess(auth.user, ruta)) {
    return {
      error: NextResponse.json({ error: "Sin permiso" }, { status: 403 }),
    };
  }

  return { session: auth.session, user: auth.user };
}

export { api, convexServer, parseEmpresasParam, RUTAS_SISTEMA, resolveEmpresasPermitidas };
