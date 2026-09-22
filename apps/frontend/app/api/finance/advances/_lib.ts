import "server-only";

import { NextResponse } from "next/server";
import { parseEmpresasParam, resolveEmpresasPermitidas } from "@/app/api/billing/empresa-scope";
import { api } from "@/convex/_generated/api";
import { requireApiSession, userHasAccess, userHasAccessToAny } from "@/lib/api-route-auth";
import { convexServer, getConvexServerSecret } from "@/lib/convexServerClient";
import { RUTAS_SISTEMA } from "@/lib/rutas-sistema";

export { getConvexServerSecret };

export async function requireAnticiposSession(scope: "manage" | "request" | "either") {
  const auth = await requireApiSession();
  if (!auth.ok) {
    return { error: auth.response };
  }

  const hasAccess =
    scope === "manage"
      ? userHasAccess(auth.user, RUTAS_SISTEMA.FINANZAS_ANTICIPOS_DASHBOARD)
      : scope === "request"
        ? userHasAccess(auth.user, RUTAS_SISTEMA.FINANZAS_ANTICIPOS_SOLICITAR)
        : userHasAccessToAny(auth.user, [
            RUTAS_SISTEMA.FINANZAS_ANTICIPOS_DASHBOARD,
            RUTAS_SISTEMA.FINANZAS_ANTICIPOS_SOLICITAR,
          ]);
  if (!hasAccess) {
    return { error: NextResponse.json({ error: "Sin permiso" }, { status: 403 }) };
  }
  return { session: auth.session, user: auth.user };
}

export {
  api,
  convexServer,
  parseEmpresasParam,
  resolveEmpresasPermitidas,
  RUTAS_SISTEMA,
};

export { jsonAjusteError, resolveAjusteErrorStatus } from "./_ajustes-lib";
