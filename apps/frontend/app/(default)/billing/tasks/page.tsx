"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { useSearchParams } from "next/navigation";
import Loading from "../../loading";
import NoAutorizado from "@/app/no-autorizado";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { DashboardHero } from "@/components/dashboard-hero";
import { useEmpresaFilter } from "@/hooks/useEmpresaFilter";
import { RUTAS_SISTEMA } from "@/lib/rutas-sistema";
import { useFacturacionPage } from "../hooks/use-facturacion-page";
import { timeAgo } from "../lib/utils";
import { FacturaPagoAmount } from "../components/valor-contable-ui";
import { FACTURACION_STATUS_LABELS, FacturacionStatusBadge } from "../components/status-badge";

const ESTADOS = [
  "recepcion",
  "revision_lider",
  "jefe_directo",
  "aceptada",
  "causacion",
  "revision_impuestos",
  "eventos_dian",
  "pendiente_rechazar_dian",
  "pendiente_nota_credito",
  "gerencia",
  "revision_tesoreria",
  "pagada",
  "legalizada",
  "cerrada",
  "rechazada",
  "rechazada_dian",
  "nota_credito_cerrada",
] as const;

export default function FacturacionTareasPage() {
  const searchParams = useSearchParams();
  const { status, hasAccess, session } = useFacturacionPage(RUTAS_SISTEMA.FACTURACION_TAREAS);
  const { empresaActiva, empresaActivaInfo } = useEmpresaFilter();
  const [estado, setEstado] = useState<string>(searchParams.get("estado") ?? "");

  const tasks = useQuery(
    api.facturacionTareas.listar,
    {
      ...(estado ? { estado: estado as (typeof ESTADOS)[number] } : {}),
      ...(typeof empresaActiva === "number" ? { empresa: empresaActiva } : {}),
    },
  );

  const tasksData = useMemo(
    () =>
      (tasks ?? []) as Array<
        Doc<"facturacionTareas"> & {
          factura: Doc<"facturacionFacturas"> | null;
        }
      >,
    [tasks],
  );

  const myUserId = session?.user?.id;
  const mineCount = useMemo(
    () =>
      tasksData.filter(
        (task: Doc<"facturacionTareas">) => task.asignadoAUserId === myUserId,
      ).length,
    [myUserId, tasksData],
  );

  if (status === "loading") return <Loading />;
  if (!hasAccess) return <NoAutorizado />;

  return (
    <div className="space-y-6 px-4 py-5 sm:px-6 lg:px-8">
      <DashboardHero
        title="Tareas de Facturación"
        description={
          empresaActivaInfo
            ? `Seguimiento de ${empresaActivaInfo.nombre}. Tienes ${mineCount} tarea(s) asignada(s) a tu usuario.`
            : `Seguimiento operativo del flujo. Tienes ${mineCount} tarea(s) asignada(s) a tu usuario.`
        }
        icon={<svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>}
        gradientClassName="from-slate-950 via-violet-950 to-slate-900"
      />

      <div className="flex flex-wrap gap-2 rounded-3xl border border-slate-200 bg-white p-3 shadow-xs">
        <button
          onClick={() => setEstado("")}
          className={`rounded-2xl px-4 py-2 text-sm ${estado === "" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"}`}
        >
          Todas
        </button>
        {ESTADOS.map((item) => (
          <button
            key={item}
            onClick={() => setEstado(item)}
            className={`rounded-2xl px-4 py-2 text-sm ${estado === item ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"}`}
          >
            {FACTURACION_STATUS_LABELS[item]}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {tasksData.map((task: Doc<"facturacionTareas"> & { factura: Doc<"facturacionFacturas"> | null }) => (
          <Link
            key={task._id}
            href={`/billing/invoices/${task.facturaId}`}
            className="flex flex-col gap-3 rounded-3xl border border-slate-200 bg-white p-5 shadow-xs transition hover:border-slate-300 lg:flex-row lg:items-center"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-sm font-semibold text-slate-900">
                  {task.factura?.proveedorNombre ?? "Factura sin proveedor"}
                </p>
                <FacturacionStatusBadge estado={task.estado} />
              </div>
              <p className="mt-1 text-xs text-slate-500">
                #{task.factura?.numeroFactura ?? "-"} · Asignado a {task.asignadoANombre}
              </p>
            </div>
            <div className="flex items-center gap-4 lg:ml-auto">
              <span className="text-sm font-semibold text-slate-900">
                {task.factura ? (
                  <FacturaPagoAmount
                    factura={task.factura}
                    fase={String(task.estado)}
                  />
                ) : (
                  "-"
                )}
              </span>
              <span className="text-xs text-slate-500">{timeAgo(task.actualizadoEn)}</span>
            </div>
          </Link>
        ))}
        {tasksData.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">
            No hay tareas en este estado.
          </div>
        ) : null}
      </div>
    </div>
  );
}
