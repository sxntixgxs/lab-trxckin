"use client";

import { useState } from "react";
import { FilePlus2, Route, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Doc } from "@/convex/_generated/dataModel";
import {
  EmpresaBadge,
  EmpresaIconTile,
  getEmpresaAccentStyle,
  resolveFacturacionEmpresaId,
} from "../../../lib/empresa-ui";
import {
  FacturacionStatusBadge,
  resolveFacturaEstado,
} from "../../../components/status-badge";
import { formatCurrency, formatDate } from "../../../lib/utils";
import {
  getDocumentoLabel,
  getValorContable,
  valorContableDiffiereDelTotal,
} from "../../../lib/valor-contable";
import { puedeMostrarDevolverFactura } from "../../../lib/devolucion-factura";
import { DevolverFacturaModal } from "./devolver-factura-modal";

const ORIGEN_LABELS: Record<string, string> = {
  correo: "Correo",
  carga_manual: "Carga manual",
  recibo_fisico: "Recibo físico",
  documento_fisico: "Documento físico",
};

export function FacturaHero({
  factura,
  tarea,
  tareaEstado,
  estadoResuelto,
}: {
  factura: Doc<"facturacionFacturas">;
  tarea?: Doc<"facturacionTareas"> | null;
  tareaEstado?: string | null;
  estadoResuelto?: string | null;
}) {
  const [devolverOpen, setDevolverOpen] = useState(false);
  const empresaId = resolveFacturacionEmpresaId({ factura });
  const accent = getEmpresaAccentStyle(empresaId);
  const estado = resolveFacturaEstado({
    factura,
    tareaEstado: tarea?.estado ?? tareaEstado,
    estadoResuelto,
  });
  const valorContable = getValorContable(factura);
  const mostrarDevolver = puedeMostrarDevolverFactura({
    factura,
    tarea: tarea ?? null,
    estadoResuelto,
  });

  return (
    <section
      className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xs"
      style={{ borderLeftWidth: 4, borderLeftColor: accent.color }}
    >
      <div className="flex flex-col gap-5 p-6 sm:p-8">
        <div className="flex flex-wrap items-start gap-4">
          <EmpresaIconTile empresaId={empresaId} className="h-12 w-12" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <EmpresaBadge empresaId={empresaId} />
              {estado ? <FacturacionStatusBadge estado={estado} /> : null}
              {mostrarDevolver ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 hover:text-amber-900"
                  onClick={() => setDevolverOpen(true)}
                >
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                  Devolver factura
                </Button>
              ) : null}
              {factura.esPeaje ? (
                <Badge
                  variant="outline"
                  className="border-teal-200 bg-teal-50 text-teal-700"
                >
                  <Route className="mr-1 h-3 w-3" />
                  Peajes
                </Badge>
              ) : null}
              {factura.isFisico ? (
                <Badge
                  variant="outline"
                  className="border-violet-200 bg-violet-50 text-violet-700"
                >
                  <FilePlus2 className="mr-1 h-3 w-3" />
                  Documento físico
                </Badge>
              ) : null}
              <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
                {getDocumentoLabel(factura)}
              </Badge>
              {factura.origen ? (
                <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
                  {ORIGEN_LABELS[factura.origen] ?? factura.origen}
                </Badge>
              ) : null}
            </div>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
              Factura {factura.numeroFactura}
            </h1>
            <p className="mt-1 text-base font-medium text-slate-800">
              {factura.proveedorNombre}
            </p>
            <p className="mt-0.5 text-sm text-slate-500">
              NIT {factura.proveedorNit} · emitida {formatDate(factura.fechaEmision)}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-right">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Valor contable
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-slate-950">
              {formatCurrency(valorContable, factura.moneda)}
            </p>
            {valorContableDiffiereDelTotal(factura) ? (
              <p className="mt-1 text-xs text-slate-500">
                Total {formatCurrency(factura.total, factura.moneda)}
              </p>
            ) : null}
          </div>
        </div>
      </div>
      {mostrarDevolver ? (
        <DevolverFacturaModal
          open={devolverOpen}
          onOpenChange={setDevolverOpen}
          facturaId={factura._id}
          numeroFactura={factura.numeroFactura}
        />
      ) : null}
    </section>
  );
}
