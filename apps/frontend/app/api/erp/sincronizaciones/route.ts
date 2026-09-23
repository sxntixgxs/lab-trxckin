import { requireApiSession, userHasAccess } from "@/lib/api-route-auth";
import { empresaOpcional, errorJson, PERMISO_TERCEROS_ERP, reenviarBackend } from "@/lib/erp/bff";

const ENTIDADES = new Set(["PROVEEDORES", "CLIENTES"]);

/** ERP sync runs of the companies the user can see (Administración → Terceros ERP). */
export async function GET(request: Request) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;
  if (!userHasAccess(auth.user, PERMISO_TERCEROS_ERP)) return errorJson(403, "No autorizado");

  const incoming = new URL(request.url).searchParams;
  const empresa = empresaOpcional(auth.session, incoming.get("empresa"));
  if (!empresa.ok) return empresa.response;
  const params = new URLSearchParams();
  if (empresa.empresa !== null) params.set("empresa", String(empresa.empresa));
  const limit = incoming.get("limit")?.trim();
  if (limit) params.set("limit", limit);
  return reenviarBackend(`/api/v1/erp/sincronizaciones?${params.toString()}`);
}

/** "Sincronizar ahora": starts the runs and answers 202 at once; poll GET to follow them. */
export async function POST(request: Request) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;
  if (!userHasAccess(auth.user, PERMISO_TERCEROS_ERP)) return errorJson(403, "No autorizado");

  const cuerpo = (await request.json().catch(() => ({}))) as { entidad?: unknown; empresa?: unknown };
  const empresa = empresaOpcional(auth.session, typeof cuerpo.empresa === "number" || typeof cuerpo.empresa === "string" ? cuerpo.empresa : null);
  if (!empresa.ok) return empresa.response;
  if (cuerpo.entidad !== undefined && (typeof cuerpo.entidad !== "string" || !ENTIDADES.has(cuerpo.entidad))) {
    return errorJson(400, "Entidad inválida");
  }
  return reenviarBackend("/api/v1/erp/sincronizaciones", {
    method: "POST",
    body: JSON.stringify({
      ...(cuerpo.entidad ? { entidad: cuerpo.entidad } : {}),
      ...(empresa.empresa !== null ? { empresa: empresa.empresa } : {}),
    }),
  });
}
