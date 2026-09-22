import { Suspense } from "react";
import { ProtectedPage } from "@/components/utils/ProtectedPage";
import { fetchBackend, getCurrentBackendUser } from "@/lib/fetch-backend";
import UsuariosClientContent, { LoadingUsuarios } from "./usuarios-client-content";
import type { ProcesoOption, RolOption, UsuarioDirectory } from "./usuarios-types";

export const dynamic = "force-dynamic";

export default function UsuariosPage() {
  return (
    <ProtectedPage requiredPermission="administracion/usuarios">
      <Suspense fallback={<LoadingUsuarios />}>
        <UsuariosPageData />
      </Suspense>
    </ProtectedPage>
  );
}

async function loadUsuariosData() {
  try {
    const [currentUser, usuariosResponse, rolesResponse, procesosResponse] =
      await Promise.all([
        getCurrentBackendUser(),
        fetchBackend("/api/v1/usuarios"),
        fetchBackend("/api/v1/roles"),
        fetchBackend("/api/v1/procesos"),
      ]);

    if (!currentUser || !usuariosResponse.ok || !rolesResponse.ok || !procesosResponse.ok) {
      return null;
    }

    const listaUsuarios = (await usuariosResponse.json()) as UsuarioDirectory[];
    const roles = (await rolesResponse.json()) as RolOption[];
    const procesos = (await procesosResponse.json()) as ProcesoOption[];

    return { listaUsuarios, roles, procesos, currentUserId: currentUser.id };
  } catch {
    return null;
  }
}

async function UsuariosPageData() {
  const data = await loadUsuariosData();
  if (!data) {
    return (
      <div className="p-8 text-sm text-slate-600">
        No se pudo cargar el directorio de usuarios. Recarga la página o vuelve a iniciar sesión.
      </div>
    );
  }

  return (
    <UsuariosClientContent
      listaUsuarios={data.listaUsuarios}
      roles={data.roles}
      procesos={data.procesos}
      currentUserId={data.currentUserId}
    />
  );
}
