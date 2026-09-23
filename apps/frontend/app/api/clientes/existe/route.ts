import { consultarExistencia } from "@/lib/erp/existencia-route";

/** Is this document a customer of the company in the ERP? (customer onboarding modal) */
export async function GET(request: Request) {
  return consultarExistencia(request, { permiso: "customers/onboarding", rutaBackend: "/api/v1/clientes/existe" });
}
