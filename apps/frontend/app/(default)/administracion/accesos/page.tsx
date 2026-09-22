import { ProtectedPage } from "@/components/utils/ProtectedPage";
import { fetchBackend } from "@/lib/fetch-backend";
import AccesosClientContent from "./accesos-client-content";
import type { RolConPermisos } from "./accesos-types";

export default function AccesosPage() {
  return (
    <ProtectedPage requiredPermission="administracion/accesos">
      <AccesosPageData />
    </ProtectedPage>
  );
}

async function loadRoles(): Promise<RolConPermisos[] | null> {
  try {
    const response = await fetchBackend("/api/v1/permisos-roles/roles-con-permisos");
    if (!response.ok) return null;
    return (await response.json()) as RolConPermisos[];
  } catch {
    return null;
  }
}

async function AccesosPageData() {
  const roles = await loadRoles();
  if (!roles) {
    return (
      <div className="p-8 text-sm text-slate-600">
        No se pudo cargar la matriz de accesos. Recarga la página o vuelve a iniciar sesión.
      </div>
    );
  }
  return <AccesosClientContent roles={roles} />;
}
