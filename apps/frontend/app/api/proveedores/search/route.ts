import { requireApiSession, userHasAccessToAny } from "@/lib/api-route-auth";
import { empresaRequerida, errorJson, reenviarBackend } from "@/lib/erp/bff";

/** Screens that look suppliers up in the ERP catalog. */
const RUTAS_CON_BUSQUEDA = ["finance/advances/request", "billing/settings", "suppliers/onboarding"];

/**
 * ERP supplier search (SIESA contract `{ proveedores: [...] }`) for the advance request and the
 * billing settings: one company, active suppliers only.
 */
export async function GET(request: Request) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;
  if (!userHasAccessToAny(auth.user, RUTAS_CON_BUSQUEDA)) return errorJson(403, "No autorizado");

  const incoming = new URL(request.url).searchParams;
  const empresa = empresaRequerida(auth.session, incoming.get("empresa"));
  if (!empresa.ok) return empresa.response;

  const params = new URLSearchParams({ empresa: String(empresa.empresa) });
  const q = (incoming.get("q") ?? incoming.get("nit") ?? "").trim();
  if (q) params.set("q", q);
  const limit = incoming.get("limit")?.trim();
  if (limit) params.set("limit", limit);
  return reenviarBackend(`/api/v1/proveedores/search?${params.toString()}`);
}
