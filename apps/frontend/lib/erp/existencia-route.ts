import { requireApiSession, userHasAccess } from "@/lib/api-route-auth";
import { empresaRequerida, errorJson, reenviarBackend } from "@/lib/erp/bff";

/**
 * Shared handler of /api/proveedores/existe and /api/clientes/existe: does a document exist in
 * the company's ERP catalog? Decides INSCRIPCIÓN vs ACTUALIZACIÓN in the onboarding modals.
 */
export async function consultarExistencia(
  request: Request,
  opciones: { permiso: string; rutaBackend: string },
) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;
  if (!userHasAccess(auth.user, opciones.permiso)) return errorJson(403, "No autorizado");

  const incoming = new URL(request.url).searchParams;
  const empresa = empresaRequerida(auth.session, incoming.get("empresa"));
  if (!empresa.ok) return empresa.response;
  const documento = incoming.get("documento")?.trim();
  if (!documento) return errorJson(400, "Indique el número de documento");

  const params = new URLSearchParams({ empresa: String(empresa.empresa), documento });
  const tipoDocumento = incoming.get("tipoDocumento")?.trim();
  if (tipoDocumento) params.set("tipoDocumento", tipoDocumento);
  return reenviarBackend(`${opciones.rutaBackend}?${params.toString()}`);
}
