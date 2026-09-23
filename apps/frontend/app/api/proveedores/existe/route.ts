import { consultarExistencia } from "@/lib/erp/existencia-route";

/** Is this document a supplier of the company in the ERP? (supplier onboarding modal) */
export async function GET(request: Request) {
  return consultarExistencia(request, { permiso: "suppliers/onboarding", rutaBackend: "/api/v1/proveedores/existe" });
}
