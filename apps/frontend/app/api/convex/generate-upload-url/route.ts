import { NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { requireApiSession, userHasAccessToAny } from "@/lib/api-route-auth";
import { convexServer, getConvexServerSecret } from "@/lib/convexServerClient";
import { RUTAS_SISTEMA } from "@/lib/rutas-sistema";

export const dynamic = "force-dynamic";

/** Uploads are only needed by the billing and finance modules (every system route). */
const RUTAS_CON_CARGA: string[] = Object.values(RUTAS_SISTEMA);

export async function POST() {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;
  if (!userHasAccessToAny(auth.user, RUTAS_CON_CARGA)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  try {
    const uploadUrl = await convexServer.mutation(
      api.facturacionStorage.generateUploadUrlDesdeServidor,
      { secret: getConvexServerSecret() },
    );
    return NextResponse.json({ uploadUrl });
  } catch (error) {
    console.error("Error al solicitar uploadUrl a Convex:", error);
    return NextResponse.json(
      { error: "No se pudo contactar con Convex para generar la URL de carga." },
      { status: 502 },
    );
  }
}
