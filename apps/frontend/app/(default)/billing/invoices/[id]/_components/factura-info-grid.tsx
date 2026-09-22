import { Building2, CalendarDays, Landmark, UserRoundCheck } from "lucide-react";

import type { Doc } from "@/convex/_generated/dataModel";
import { EmpresaBadge, resolveFacturacionEmpresaId } from "../../../lib/empresa-ui";
import { FacturacionStatusBadge, resolveFacturaEstado } from "../../../components/status-badge";
import { FacturacionWorkflowPanel } from "../../../components/workflow-panel";
import { formatDate, formatDateTime } from "../../../lib/utils";
import { Detail } from "./shared-ui";

const ORIGEN_LABELS: Record<string, string> = {
  correo: "Correo electrónico",
  carga_manual: "Carga manual",
  recibo_fisico: "Recibo físico",
  documento_fisico: "Documento físico",
};

export function FacturaInfoGrid({
  factura,
  tarea,
  asignacionesCount,
  sessionUser,
  estadoResuelto,
}: {
  factura: Doc<"facturacionFacturas">;
  tarea: Doc<"facturacionTareas"> | null;
  asignacionesCount: number;
  sessionUser: Record<string, unknown> | object;
  estadoResuelto?: string | null;
}) {
  const empresaId = resolveFacturacionEmpresaId({ factura });
  const estado = resolveFacturaEstado({
    factura,
    tareaEstado: tarea?.estado,
    estadoResuelto,
  });

  return (
    <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-4">
          <Building2 className="h-4 w-4 text-slate-500" />
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
            Información del documento
          </h2>
        </div>
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <Detail label="Proveedor" value={factura.proveedorNombre} />
          <Detail label="NIT proveedor" value={factura.proveedorNit} />
          <Detail label="Empresa receptora">
            <EmpresaBadge empresaId={empresaId} />
          </Detail>
          <Detail
            label="Origen"
            value={
              factura.origen
                ? (ORIGEN_LABELS[factura.origen] ?? factura.origen)
                : "-"
            }
          />
          <Detail
            label="Fecha de emisión"
            value={formatDate(factura.fechaEmision)}
          />
          <Detail
            label="Fecha de vencimiento"
            value={
              factura.fechaVencimiento
                ? formatDate(factura.fechaVencimiento)
                : "-"
            }
          />
          <Detail label="Moneda" value={factura.moneda} />
          <Detail label="Forma de pago" value={factura.formaPago ?? "-"} />
          <Detail label="Tipo documento" value={factura.tipoDocumento ?? "-"} />
          <Detail label="CUFE" value={factura.cufe ?? "-"} className="md:col-span-2" />
          {factura.centroCostoCodigo || factura.centroCostoNombre ? (
            <Detail
              label="Centro de costo"
              value={`${factura.centroCostoCodigo ?? "-"} · ${factura.centroCostoNombre ?? "-"}`}
              className="md:col-span-2"
            />
          ) : null}
          {factura.esPeaje ? (
            <>
              <Detail label="Placa peaje" value={factura.peajePlaca ?? "-"} />
              <Detail
                label="Centro costo peaje"
                value={factura.peajeCentroCosto ?? "-"}
              />
              <Detail label="Operador peaje" value={factura.peajeOperador ?? "-"} />
              <Detail
                label="Proceso anticipo"
                value={factura.anticipoProcesoNombre ?? "PEAJES"}
              />
            </>
          ) : null}
          <Detail
            label="Registrada"
            value={formatDateTime(factura.creadoEn)}
          />
          <Detail
            label="Última actualización"
            value={formatDateTime(factura.actualizadoEn)}
          />
          <Detail
            label="Descripción"
            value={factura.descripcion}
            className="md:col-span-2"
          />
        </div>
      </section>

      <div className="space-y-6">
        {(tarea || factura.esPeaje) && (
          <section className="rounded-3xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-6 shadow-xs">
            <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
              Estado actual
            </h2>
            <div className="mt-4 space-y-3 text-sm text-slate-700">
              {estado ? (
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-3">
                  <span className="flex items-center gap-2 text-slate-500">
                    <CalendarDays className="h-4 w-4 text-slate-400" /> Estado
                  </span>
                  <FacturacionStatusBadge estado={estado} />
                </div>
              ) : null}
              {tarea ? (
                <>
                  <div className="flex items-start justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-3">
                    <span className="flex items-center gap-2 text-slate-500">
                      <UserRoundCheck className="h-4 w-4 text-slate-400" /> Asignado a
                    </span>
                    <span className="text-right font-semibold text-slate-900">
                      {tarea.asignadoANombre}
                    </span>
                  </div>
                  <div className="flex items-start justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-3">
                    <span className="flex items-center gap-2 text-slate-500">
                      <Landmark className="h-4 w-4 text-slate-400" /> Líder del proceso
                    </span>
                    <span className="text-right font-semibold text-slate-900">
                      {tarea.liderProcesoNombre}
                    </span>
                  </div>
                </>
              ) : factura.esPeaje ? (
                <p className="rounded-2xl border border-teal-100 bg-teal-50/60 p-3 text-sm text-teal-900">
                  Esta factura de peajes no tiene flujo de aprobación. Su estado depende
                  del cruce masivo en el módulo de peajes.
                </p>
              ) : null}
            </div>
          </section>
        )}

        {tarea && asignacionesCount === 0 ? (
          <FacturacionWorkflowPanel tarea={tarea} currentUser={sessionUser} />
        ) : tarea ? (
          <section className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-xs">
            Gestiona la acción pendiente desde Mi Buzón. Esta vista conserva el historial
            completo, tiempos por asignación y devoluciones.
          </section>
        ) : null}
      </div>
    </div>
  );
}
