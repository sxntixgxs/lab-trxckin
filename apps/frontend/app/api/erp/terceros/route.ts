import { fetchMutation, fetchQuery } from "convex/nextjs";
import { NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { requireBackendApiSession, userHasAccess } from "@/lib/api-route-auth";
import { getConvexServerSecret } from "@/lib/convexServerClient";
import { errorJson } from "@/lib/erp/bff";
import { fetchBackend } from "@/lib/fetch-backend";
import { crearTerceroEnErp, type ModuloOnboarding } from "./crear-en-erp-route-lib";

const PERMISO_POR_MODULO: Record<ModuloOnboarding, string> = {
  supplier: "suppliers/onboarding",
  customer: "customers/onboarding",
};

/**
 * "Crear en ERP (simulado)" in suppliers Fase VI / customers Fase IV. Body: `{ modulo, inscripcionId }`.
 * Every Convex call carries the user's own token (a fresh client per call, never the shared one),
 * and Nest is called without impersonation so both see the same real user.
 */
export async function POST(request: Request) {
  const auth = await requireBackendApiSession();
  if (!auth.ok) return auth.response;

  const cuerpo = (await request.json().catch(() => null)) as { modulo?: unknown; inscripcionId?: unknown } | null;
  const modulo = cuerpo?.modulo;
  const inscripcionId = cuerpo?.inscripcionId;
  if ((modulo !== "supplier" && modulo !== "customer") || typeof inscripcionId !== "string" || !inscripcionId) {
    return errorJson(400, "Indique el módulo y la inscripción");
  }
  if (!userHasAccess(auth.user, PERMISO_POR_MODULO[modulo])) return errorJson(403, "No autorizado");
  const internalKey = process.env.NEST_INTERNAL_KEY;
  if (!internalKey) return errorJson(500, "NEST_INTERNAL_KEY no está configurada");

  const token = auth.accessToken;
  const resultado = await crearTerceroEnErp({
    obtenerDatos: () => fetchQuery(api.onboarding.erp.datosParaCrearEnErp, { modulo, inscripcionId }, { token }),
    registrarEnErp: (datos) =>
      fetchBackend("/api/v1/erp/terceros", {
        method: "POST",
        body: JSON.stringify(datos),
        headers: { "x-internal-key": internalKey },
        skipImpersonation: true,
      }),
    anotarEnInscripcion: (creado) =>
      fetchMutation(
        api.onboarding.erp.registrarCreacionEnErp,
        {
          modulo,
          inscripcionId,
          erpTerceroId: creado.erpTerceroId,
          sucursalId: creado.sucursalId,
          accion: creado.accion,
          catalogoActualizado: creado.catalogoActualizado,
          secret: getConvexServerSecret(),
        },
        { token },
      ),
  });

  if (!resultado.ok) return errorJson(resultado.status, resultado.error);
  return NextResponse.json({ registroErp: resultado.registroErp, existencia: resultado.existencia });
}
