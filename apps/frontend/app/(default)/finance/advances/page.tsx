"use client";

import { Suspense } from "react";
import { useSession } from "@/hooks/useCurrentUser";

import Loading from "../../loading";
import NoAutorizado from "@/app/no-autorizado";
import { useHasAccess, useUserPermissions } from "@/hooks/useHasAccess";
import { RUTAS_SISTEMA } from "@/lib/rutas-sistema";
import { AnticiposWorkspace } from "./workspace/anticipos-workspace";

function AnticiposPageContent() {
  const { status } = useSession();
  const { isLoading: permissionsLoading } = useUserPermissions();
  const canManage = useHasAccess(RUTAS_SISTEMA.FINANZAS_ANTICIPOS_DASHBOARD);
  const canRequest = useHasAccess(RUTAS_SISTEMA.FINANZAS_ANTICIPOS_SOLICITAR);

  if (status === "loading" || permissionsLoading) return <Loading />;
  if (status !== "authenticated" || (!canManage && !canRequest)) return <NoAutorizado />;

  return <AnticiposWorkspace canManage={canManage} canRequest={canRequest} />;
}

export default function AnticiposPage() {
  return (
    <Suspense fallback={<Loading />}>
      <AnticiposPageContent />
    </Suspense>
  );
}
