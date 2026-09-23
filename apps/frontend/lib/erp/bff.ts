import { NextResponse } from "next/server";
import { requireAuthorizedEmpresa } from "@/lib/api-route-auth";
import type { BillingSession } from "@/lib/billing-session";
import { fetchBackend } from "@/lib/fetch-backend";

/** Route permission of Administración → Terceros ERP. */
export const PERMISO_TERCEROS_ERP = "administracion/terceros-erp";

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

/** Company is optional here, but when present it must be one the user can access. */
export function empresaOpcional(
  session: BillingSession,
  valor: string | number | null | undefined,
): { ok: true; empresa: number | null } | Fallo {
  if (valor === null || valor === undefined || String(valor).trim() === "") return { ok: true, empresa: null };
  const resultado = empresaRequerida(session, valor);
  return resultado.ok ? { ok: true, empresa: resultado.empresa } : resultado;
}

/** Copies only the listed, non-empty query params (Nest rejects unknown ones). */
export function paramsPermitidos(origen: URLSearchParams, claves: readonly string[]): URLSearchParams {
  const destino = new URLSearchParams();
  for (const clave of claves) {
    const valor = origen.get(clave)?.trim();
    if (valor) destino.set(clave, valor);
  }
  return destino;
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
