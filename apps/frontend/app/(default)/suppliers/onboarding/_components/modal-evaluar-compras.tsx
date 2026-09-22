"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { AlertTriangle, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { calcularEvaluacionCompras, CRITERIOS_COMPRAS, NO_APLICA_SELECT_VALUE, type SeleccionesEvaluacionCompras } from "@/lib/onboarding/evaluacion-compras";
import { getOnboardingErrorMessage } from "./ui-config";

interface ModalEvaluarComprasProps {
  inscripcionId: Id<"onboardingProveedores">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

/** Compras rubric (8 criteria, NO APLICA excluded from the score). */
export default function ModalEvaluarCompras({ inscripcionId, open, onOpenChange, onSuccess }: ModalEvaluarComprasProps) {
  const [selecciones, setSelecciones] = useState<SeleccionesEvaluacionCompras>({});
  const [loading, setLoading] = useState(false);

  const inscripcion = useQuery(api.onboarding.suppliers.obtenerInscripcionPorId, { inscripcionId });
  const evaluacionExistente = useQuery(api.onboarding.suppliersEvaluar.obtenerEvaluacionPorInscripcion, open ? { inscripcionId } : "skip");
  const evaluarProveedor = useMutation(api.onboarding.suppliersEvaluar.evaluarProveedor);

  useEffect(() => {
    if (evaluacionExistente && open) {
      setSelecciones({
        experiencia: evaluacionExistente.experiencia,
        referencias: evaluacionExistente.referencias,
        portfolio: evaluacionExistente.portfolio,
        certificados: evaluacionExistente.certificados,
        garantias: evaluacionExistente.garantias,
        fichasTecnicas: evaluacionExistente.fichasTecnicas,
        formaPago: evaluacionExistente.formaPago,
        sstAmbiental: evaluacionExistente.sstAmbiental,
      });
    } else if (open) {
      setSelecciones({});
    }
  }, [evaluacionExistente, open]);

  const calculo = useMemo(() => calcularEvaluacionCompras(CRITERIOS_COMPRAS.map(({ key }) => selecciones[key])), [selecciones]);

  async function handleSubmit() {
    if (!calculo.estaCompleta) {
      toast.error("Completa todos los criterios antes de enviar.");
      return;
    }
    if (!calculo.tieneCriteriosAplicables) {
      toast.error("Selecciona al menos un criterio aplicable para calcular la evaluación.");
      return;
    }
    setLoading(true);
    try {
      await evaluarProveedor({
        inscripcionId,
        experiencia: selecciones.experiencia!,
        referencias: selecciones.referencias!,
        portfolio: selecciones.portfolio!,
        certificados: selecciones.certificados!,
        garantias: selecciones.garantias!,
        fichasTecnicas: selecciones.fichasTecnicas!,
        formaPago: selecciones.formaPago!,
        sstAmbiental: selecciones.sstAmbiental!,
        calificacionGeneral: calculo.calificacionGeneral,
        isAprobado: calculo.isAprobado,
      });
      toast.success(calculo.isAprobado ? "Evaluación registrada. Proveedor aceptable." : `Evaluación registrada. Proveedor: ${calculo.proveedorStatus}.`);
      onOpenChange(false);
      onSuccess?.();
    } catch (e) {
      toast.error(getOnboardingErrorMessage(e, "Error al guardar la evaluación"));
    } finally {
      setLoading(false);
    }
  }

  const datos = inscripcion?.datos_generales_01;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Evaluación de Proveedor — Compras</DialogTitle>
          <DialogDescription>
            {datos?.razonSocial} · {datos?.tipoDocumento} {datos?.numeroDocumento}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Criterios a evaluar para la inscripción</p>
            <p className="mb-4 text-xs text-slate-600">Marca NO APLICA cuando un criterio no corresponda al proveedor. Ese criterio no se incluirá en la calificación.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              {CRITERIOS_COMPRAS.map((criterio) => {
                const value = selecciones[criterio.key];
                const selectValue = value === undefined ? "" : value === null ? NO_APLICA_SELECT_VALUE : String(value);
                return (
                  <div key={criterio.key} className="space-y-2">
                    <Label className="text-sm">{criterio.label}</Label>
                    <Select
                      value={selectValue}
                      onValueChange={(nextValue) =>
                        setSelecciones((current) => ({ ...current, [criterio.key]: nextValue === NO_APLICA_SELECT_VALUE ? null : Number(nextValue) }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccione..." />
                      </SelectTrigger>
                      <SelectContent>
                        {criterio.options.map((option) => (
                          <SelectItem key={option.value} value={String(option.value)}>
                            {option.label} — {option.value} pts
                          </SelectItem>
                        ))}
                        <SelectItem value={NO_APLICA_SELECT_VALUE}>NO APLICA</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 rounded-lg border border-slate-200 bg-white p-4">
            <div>
              <span className="text-sm text-slate-500">CALIFICACIÓN (escala 0-5): </span>
              <span className="text-lg font-bold text-slate-800">{calculo.puedeCalcular ? calculo.calificacionGeneral.toFixed(2) : "—"}</span>
            </div>
            <div>
              <span className="text-sm text-slate-500">Porcentaje: </span>
              <span className="text-sm font-medium">{calculo.puedeCalcular ? `${calculo.resultadoPorcentaje}%` : "—"}</span>
            </div>
            <div>
              <span className="text-sm text-slate-500">Puntos suma: </span>
              <span className="text-sm font-medium">{calculo.puedeCalcular ? `${calculo.sumaPuntos} / ${calculo.maximoPosible}` : "—"}</span>
            </div>
            <div>
              <span className="text-sm text-slate-500">Criterios aplicables: </span>
              <span className="text-sm font-medium">{calculo.estaCompleta ? `${calculo.cantidadAplicables} de 8` : "—"}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-500">EL PROVEEDOR ES:</span>
              <Badge
                variant="outline"
                className={
                  calculo.proveedorStatus === "ACEPTABLE"
                    ? "border-green-300 bg-green-50 text-green-800"
                    : calculo.proveedorStatus === "PROVEEDOR EN RESERVA"
                      ? "border-amber-300 bg-amber-50 text-amber-800"
                      : calculo.proveedorStatus === "NO ACEPTABLE"
                        ? "border-red-300 bg-red-50 text-red-800"
                        : "border-slate-200 bg-slate-50 text-slate-600"
                }
              >
                {calculo.proveedorStatus ?? "—"}
              </Badge>
            </div>
          </div>

          {calculo.estaCompleta && !calculo.tieneCriteriosAplicables ? (
            <p className="text-sm font-medium text-red-700">Selecciona al menos un criterio aplicable para registrar la evaluación.</p>
          ) : null}

          <p className="flex items-start gap-2 rounded-xs border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            Un puntaje de 0 en cualquier criterio aplicable califica al proveedor como PROVEEDOR EN RESERVA en proveedores críticos o considerados urgentes para
            ejecución. Los criterios NO APLICA se excluyen de esta regla.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!calculo.puedeCalcular || loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Guardando...
              </>
            ) : (
              <>
                <Check className="mr-2 h-4 w-4" />
                Registrar evaluación
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
