"use client";

import NoAutorizado from "@/app/no-autorizado";
import { useSession } from "@/hooks/useCurrentUser";
import { useHasAccess } from "@/hooks/useHasAccess";
import { RUTAS_SISTEMA } from "@/lib/rutas-sistema";
import Loading from "../../loading";
import OnboardingClient from "./_components/onboarding-client";

export default function CustomersOnboardingPage() {
  const { status } = useSession();
  const hasAccess = useHasAccess(RUTAS_SISTEMA.CLIENTES_ONBOARDING);

  if (status === "loading") return <Loading />;
  if (!hasAccess) return <NoAutorizado />;
  return <OnboardingClient />;
}
