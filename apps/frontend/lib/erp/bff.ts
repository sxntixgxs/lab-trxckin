import { NextResponse } from "next/server";
import { requireAuthorizedEmpresa } from "@/lib/api-route-auth";
import type { BillingSession } from "@/lib/billing-session";
import { fetchBackend } from "@/lib/fetch-backend";

type Fallo = { ok: false; response: NextResponse };

export function errorJson(status: number, error: string): NextResponse {
  return NextResponse.json({ error }, { status });
}

/**
 * Company for ERP catalog routes: always required (the catalog is per company) and one the user
 * can access. `requireAuthorizedEmpresa` alone accepts a missing company, so check it first.
 */
export function empresaRequerida(
  session: BillingSession,
  valor: string | number | null | undefined,
): { ok: true; empresa: number } | Fallo {
  if (valor === null || valor === undefined || String(valor).trim() === "") {
    return { ok: false, response: errorJson(400, "Indique la empresa") };
  }
  const resultado = requireAuthorizedEmpresa(session, valor);
  if (!resultado.ok) return resultado;
  if (resultado.empresaId === null) return { ok: false, response: errorJson(400, "Indique la empresa") };
  return { ok: true, empresa: resultado.empresaId };
}

/** Calls Nest and passes its JSON body and status through; a backend that cannot be reached is a 502. */
export async function reenviarBackend(ruta: string, init: Parameters<typeof fetchBackend>[1] = {}): Promise<NextResponse> {
  let respuesta: Response;
  try {
    respuesta = await fetchBackend(ruta, init);
  } catch {
    return errorJson(502, "No se pudo conectar con el backend.");
  }
  const cuerpo: unknown = await respuesta.json().catch(() => null);
  return NextResponse.json(cuerpo, { status: respuesta.status });
}
