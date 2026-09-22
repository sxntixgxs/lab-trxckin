"use client";

import { useMemo } from "react";
import { AlertTriangle, Settings2 } from "lucide-react";
import Loading from "../../loading";
import NoAutorizado from "@/app/no-autorizado";
import { DashboardHero } from "@/components/dashboard-hero";
import { useEmpresaFilter } from "@/hooks/useEmpresaFilter";
import { RUTAS_SISTEMA } from "@/lib/rutas-sistema";
import { useFacturacionPage } from "../hooks/use-facturacion-page";
import { ConfiguracionGrid } from "./components/configuracion-grid";
import { EmpresaSelectorCard } from "./components/empresa-selector-card";
import { EstadoUsuariosCard } from "./components/estado-usuarios-card";
import { SlaConfigSection } from "./components/sla-config-section";
import { useConfiguracionFacturacion } from "./hooks/use-configuracion-facturacion";

export default function FacturacionConfiguracionPage() {
  const { status, hasAccess, session } = useFacturacionPage(
    RUTAS_SISTEMA.FACTURACION_CONFIGURACION
  );
  const { empresaActiva, empresaActivaInfo, opcionesSelector, setEmpresaActiva } =
    useEmpresaFilter();
  const empresaConfig = typeof empresaActiva === "number" ? empresaActiva : null;

  const actor = useMemo(
    () => ({
      actualizadoPorUserId: session?.user?.id,
      actualizadoPorNombre: session?.user?.nombre,
    }),
    [session?.user]
  );

  const configuracion = useConfiguracionFacturacion(empresaConfig, actor);

  if (status === "loading" || configuracion.isLoading) return <Loading />;
  if (!hasAccess) return <NoAutorizado />;

  return (
    <div className="space-y-6 px-4 py-5 sm:px-6 lg:px-8">
      <DashboardHero
        title="Configuración de Facturación"
        description={
          empresaActivaInfo
            ? `Roles y cuentas para ${empresaActivaInfo.nombre}.`
            : "Selecciona una empresa para editar roles y cuentas del flujo."
        }
        icon={<Settings2 className="h-8 w-8" />}
        gradientClassName="from-slate-950 via-amber-950 to-slate-900"
      />

      <EmpresaSelectorCard
        empresaActiva={empresaActiva}
        opciones={opcionesSelector}
        onSelect={setEmpresaActiva}
      />

      {empresaConfig === null ? (
        <section className="rounded-3xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">Selecciona una empresa concreta.</p>
              <p className="mt-1">
                La configuración de facturación no se edita en la vista global de todas las
                empresas.
              </p>
            </div>
          </div>
        </section>
      ) : configuracion.config === undefined ? (
        <Loading />
      ) : (
        <>
          <ConfiguracionGrid
            usuarios={configuracion.usuarios}
            usuariosFinanzas={configuracion.usuariosFinanzas}
            state={{
              ...configuracion,
              empresaConfig,
              actor,
            }}
          />
          <EstadoUsuariosCard
            totalUsuarios={configuracion.usuarios.length}
            totalUsuariosFinanzas={configuracion.usuariosFinanzas.length}
          />
          <SlaConfigSection empresa={empresaConfig} />
        </>
      )}
    </div>
  );
}
