"use client";

import { Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

import { BuzonAnticipoLegalizacionDialog } from "@/app/(default)/billing/components/buzon-anticipo-legalizacion-dialog";
import { isFacturaEligibleForAnticipoLegalizacion } from "@/app/(default)/billing/lib/anticipo-legalizacion";
import type { AnticipoManagementContext } from "@/app/(default)/billing/lib/anticipo-management";
import { formatCurrency } from "@/app/(default)/billing/lib/utils";
import { Button } from "@/components/ui/button";
import type { Doc, Id } from "@/convex/_generated/dataModel";

export function FacturaAnticipoOwnerSection({
  factura,
  tarea,
}: {
  factura: Doc<"facturacionFacturas">;
  tarea: Doc<"facturacionTareas"> | null;
}) {
  const [open, setOpen] = useState(false);
  const [context, setContext] = useState<AnticipoManagementContext | null>(null);

  const eligible = isFacturaEligibleForAnticipoLegalizacion(factura);
  const asignacionActiva = tarea?.currentAsignacionId ?? null;

  useEffect(() => {
    if (!eligible) return;
    let cancelled = false;
    async function load() {
      try {
        const params = new URLSearchParams();
        if (asignacionActiva) params.set("asignacionId", String(asignacionActiva));
        const response = await fetch(
          `/api/billing/facturas/${factura._id}/anticipo?${params.toString()}`,
          { cache: "no-store" }
        );
        if (!response.ok) return;
        const payload = (await response.json()) as AnticipoManagementContext;
        if (!cancelled) setContext(payload);
      } catch {
        if (!cancelled) setContext(null);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [eligible, factura._id, asignacionActiva, open]);

  if (!eligible) return null;

  const dueno = context?.duenoActual ?? (factura.esLegalizacionAnticipo
    ? {
        liderNombre: factura.anticipoLiderNombre ?? "Sin líder",
        liderEmail: factura.anticipoLiderEmail ?? "",
        procesoNombre: factura.anticipoProcesoNombre,
        procesoId: factura.anticipoProcesoId,
        bolsaId: factura.anticipoBolsaId,
        elegible: true,
      }
    : null);

  const valorCruzado = context?.totales.valorAplicadoFactura ?? 0;
  const porCubrir = context?.totales.diferenciaNoCubierta ?? 0;

  return (
    <>
      <section className="rounded-3xl border border-amber-200 bg-amber-50/50 p-6 shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">
              Dueño y bolsa del anticipo
            </p>
            <h2 className="mt-1 text-base font-semibold text-slate-900">
              {factura.esLegalizacionAnticipo
                ? "Factura marcada como anticipo"
                : "Factura sin marcar como anticipo"}
            </h2>
            {dueno ? (
              <p className="mt-2 text-sm text-slate-700">
                Dueño: <span className="font-semibold">{dueno.liderNombre}</span> · Proceso:{" "}
                <span className="font-semibold">
                  {dueno.procesoNombre ?? "Sin proceso"}
                </span>
              </p>
            ) : (
              <p className="mt-2 text-sm text-slate-600">
                Aún no se ha definido el dueño del anticipo para esta factura.
              </p>
            )}
            {factura.esLegalizacionAnticipo ? (
              <p className="mt-1 text-sm text-slate-600">
                Cruzado: {formatCurrency(valorCruzado, factura.moneda)} · Por cubrir:{" "}
                {formatCurrency(porCubrir, factura.moneda)}
              </p>
            ) : null}
            {context?.motivoBloqueo && !context.puedeEditar ? (
              <p className="mt-2 text-xs text-slate-500">{context.motivoBloqueo}</p>
            ) : null}
          </div>
          <Button
            type="button"
            variant="outline"
            className="border-amber-300 bg-white text-amber-900 hover:bg-amber-100"
            onClick={() => setOpen(true)}
          >
            <Sparkles className="mr-2 h-4 w-4" />
            {context?.puedeEditar ? "Gestionar dueño y cruce" : "Ver cruce"}
          </Button>
        </div>
      </section>

      <BuzonAnticipoLegalizacionDialog
        facturaTarget={
          open
            ? {
                facturaId: factura._id as Id<"facturacionFacturas">,
                asignacionId:
                  (asignacionActiva as Id<"facturacionAsignaciones"> | null) ?? undefined,
                titulo: `${factura.proveedorNombre} · Factura #${factura.numeroFactura}`,
                moneda: factura.moneda,
              }
            : null
        }
        onClose={() => setOpen(false)}
      />
    </>
  );
}
