"use client";

import Loading from "../loading";
import NoAutorizado from "@/app/no-autorizado";
import { RUTAS_SISTEMA } from "@/lib/rutas-sistema";
import { useFacturacionPage } from "./hooks/use-facturacion-page";
import { BillingDashboard } from "./dashboard/billing-dashboard";

export default function FacturacionDashboardPage() {
  const { status, hasAccess } = useFacturacionPage(RUTAS_SISTEMA.FACTURACION_DASHBOARD);

  if (status === "loading") return <Loading />;
  if (!hasAccess) return <NoAutorizado />;

  return <BillingDashboard />;
}
