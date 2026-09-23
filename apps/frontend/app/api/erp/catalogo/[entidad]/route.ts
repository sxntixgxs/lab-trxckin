import { requireApiSession, userHasAccess } from "@/lib/api-route-auth";
import { empresaRequerida, errorJson, paramsPermitidos, PERMISO_TERCEROS_ERP, reenviarBackend } from "@/lib/erp/bff";

const ENTIDADES = new Set(["proveedores", "clientes"]);

/** Catalog browser of Administración → Terceros ERP: terceros of one company with their branches. */
export async function GET(request: Request, context: { params: Promise<{ entidad: string }> }) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;
  if (!userHasAccess(auth.user, PERMISO_TERCEROS_ERP)) return errorJson(403, "No autorizado");

  const { entidad } = await context.params;
  if (!ENTIDADES.has(entidad)) return errorJson(404, "Catálogo no encontrado");
  const incoming = new URL(request.url).searchParams;
  const empresa = empresaRequerida(auth.session, incoming.get("empresa"));
  if (!empresa.ok) return empresa.response;

  const params = paramsPermitidos(incoming, ["q", "page", "pageSize"]);
  params.set("empresa", String(empresa.empresa));
  return reenviarBackend(`/api/v1/erp/catalogo/${entidad}?${params.toString()}`);
}
