"use client";

import { Suspense } from "react";
import Loading from "../../../loading";
import NoAutorizado from "@/app/no-autorizado";
import { useSession } from "@/hooks/useCurrentUser";
import { useHasAccess, useUserPermissions } from "@/hooks/useHasAccess";
import { RUTAS_SISTEMA } from "@/lib/rutas-sistema";
import { SolicitarAnticipoClient } from "./components/SolicitarAnticipoClient";

// Same permission as the "Request" nav entry; `crearAnticipo` enforces it on the server.
function SolicitarAnticipoContent() {
  const { status } = useSession();
  const { isLoading: permissionsLoading } = useUserPermissions();
  const canRequest = useHasAccess(RUTAS_SISTEMA.FINANZAS_ANTICIPOS_SOLICITAR);

  if (status === "loading" || permissionsLoading) return <Loading />;
  if (status !== "authenticated" || !canRequest) return <NoAutorizado />;

  return <SolicitarAnticipoClient />;
}

export default function SolicitarAnticipoPage() {
  return (
    <Suspense fallback={<Loading />}>
      <SolicitarAnticipoContent />
    </Suspense>
  );
}
