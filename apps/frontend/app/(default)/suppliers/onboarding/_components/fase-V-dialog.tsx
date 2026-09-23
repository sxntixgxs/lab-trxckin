"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Check, ClipboardList, ExternalLink, FileText, Loader2, ShoppingCart, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { useArchivoInscripcionUrl } from "@/hooks/useArchivoInscripcionUrl";
import type { Id } from "@/convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SUPPLIER_DOC_LABELS, SUPPLIER_DOCS_COMPRAS } from "@/lib/onboarding/documents/suppliers";
import { calcularEvaluacionCompras, obtenerValoresEvaluacionCompras } from "@/lib/onboarding/evaluacion-compras";
import { cn } from "@/lib/utils";
import { renderFormularioPdfBlob } from "../pdf/formulario-pdf-data";
import ModalEvaluarCompras from "./modal-evaluar-compras";
import { getOnboardingErrorMessage, InfoItem, RIESGO_BADGE_SOLID, RIESGO_CONFIG } from "./ui-config";

const COMPRAS_DOC_KEYS = [...SUPPLIER_DOCS_COMPRAS];

function ComprasDocLink({ label, storageId, inscripcionId }: { label: string; storageId?: Id<"_storage">; inscripcionId: Id<"onboardingProveedores"> }) {
  const url = useArchivoInscripcionUrl("supplier", inscripcionId, storageId);
  if (storageId && url) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 transition-colors hover:bg-slate-50">
        <div className="flex items-center gap-2.5">
          <FileText className="h-4 w-4 shrink-0 text-orange-500" />
          <span className="text-sm font-medium text-slate-700">{label}</span>
        </div>
        <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
      </a>
    );
  }
  return (
    <div className="flex w-full items-center justify-between rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-3.5 py-2.5">
      <div className="flex items-center gap-2.5">
        <FileText className="h-4 w-4 shrink-0 text-slate-300" />
        <span className="text-sm text-slate-400">{label}</span>
      </div>
      <span className="text-[10px] font-medium uppercase tracking-wide text-slate-300">No subido</span>
    </div>
  );
}

/** Fase V — Compras evaluation (rubric) and confirmation. */
export default function FaseVDialog({
  inscripcionId,
  open,
  onOpenChange,
}: {
  inscripcionId: Id<"onboardingProveedores">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const inscripcion = useQuery(api.onboarding.suppliers.obtenerInscripcionPorId, { inscripcionId });
  const evaluacion = useQuery(api.onboarding.suppliersEvaluar.obtenerEvaluacionPorInscripcion, open ? { inscripcionId } : "skip");
  const completarFaseV = useMutation(api.onboarding.suppliers.completarFaseV);
  const rechazarCompras = useMutation(api.onboarding.suppliers.rechazarCompras);

  const [motivoProveedor, setMotivoProveedor] = useState("");
  const [motivoInterno, setMotivoInterno] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingFormulario, setLoadingFormulario] = useState(false);
  const [showRechazo, setShowRechazo] = useState(false);
  const [evaluarModalOpen, setEvaluarModalOpen] = useState(false);

  if (!inscripcion) return null;

  const datos = inscripcion.datos_generales_01;
  const riesgo = inscripcion.matriz_00.riesgo ?? "INDEFINIDO";
  const riesgoConfig = RIESGO_CONFIG[riesgo] ?? RIESGO_CONFIG.INDEFINIDO;
  const docs15 = inscripcion.documentos_15 ?? {};
  const evalCalculo = evaluacion ? calcularEvaluacionCompras(obtenerValoresEvaluacionCompras(evaluacion)) : null;
  const evalStatus = evalCalculo?.proveedorStatus ?? null;

  async function handleVerFormulario() {
    if (!inscripcion) return;
    setLoadingFormulario(true);
    try {
      const blob = await renderFormularioPdfBlob(inscripcion);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 15000);
    } catch (e) {
      console.error(e);
      toast.error("Error al generar el formulario de inscripción");
    } finally {
      setLoadingFormulario(false);
    }
  }

  async function handleAprobar() {
    setLoading(true);
    try {
      await completarFaseV({ inscripcionId });
      toast.success("Evaluación de Compras confirmada. Pasa a Creación en el sistema contable.");
      onOpenChange(false);
    } catch (e) {
      toast.error(getOnboardingErrorMessage(e, "Error al confirmar Fase V"));
    } finally {
      setLoading(false);
    }
  }

  async function handleRechazar() {
    if (!motivoProveedor.trim()) {
      toast.error("Ingresa el motivo de rechazo que verá el proveedor.");
      return;
    }
    if (!motivoInterno.trim()) {
      toast.error("Ingresa el motivo de rechazo interno.");
      return;
    }
    setLoading(true);
    try {
      await rechazarCompras({ inscripcionId, motivoProveedor: motivoProveedor.trim(), motivoInterno: motivoInterno.trim() });
      toast.success("Inscripción rechazada por Compras. El proveedor fue notificado.");
      onOpenChange(false);
    } catch (e) {
      toast.error(getOnboardingErrorMessage(e, "Error al rechazar"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[90vh] max-w-xl flex-col gap-0 p-0">
          <DialogHeader className="shrink-0 border-b border-slate-100 px-6 py-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-50">
                <ShoppingCart className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <DialogTitle className="text-base font-semibold text-slate-900">Fase V — Evaluación de Compras</DialogTitle>
                <p className="mt-0.5 text-xs text-slate-500">
                  {datos.razonSocial} · {datos.tipoDocumento} {datos.numeroDocumento}
                </p>
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Resumen de inscripción</p>
              <div className="grid grid-cols-2 gap-2">
                <InfoItem label="Tipo de persona">{datos.tipoPersona === "PERSONA_NATURAL" ? "Natural" : "Jurídica"}</InfoItem>
                <InfoItem label="Nivel de riesgo">
                  <Badge variant="outline" className={cn("font-semibold", RIESGO_BADGE_SOLID[riesgo])}>
                    {riesgoConfig.label}
                  </Badge>
                </InfoItem>
                <InfoItem label="Servicio suministrado">
                  <span className="line-clamp-2">{inscripcion.matriz_00.servicioSuministrado || "—"}</span>
                </InfoItem>
                <InfoItem label="Monto anual estimado">{inscripcion.matriz_00.montoAnual || "—"}</InfoItem>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Documentos del proveedor</p>
              <button
                type="button"
                onClick={handleVerFormulario}
                disabled={loadingFormulario}
                className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-left transition-colors hover:bg-slate-50 disabled:opacity-60"
              >
                <div className="flex items-center gap-2.5">
                  <FileText className="h-4 w-4 shrink-0 text-green-600" />
                  <span className="text-sm font-medium text-slate-700">Formulario de inscripción</span>
                </div>
                {loadingFormulario ? <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" /> : <ExternalLink className="h-3.5 w-3.5 text-slate-400" />}
              </button>
              {COMPRAS_DOC_KEYS.map((key) => (
                <ComprasDocLink key={key} label={SUPPLIER_DOC_LABELS[key] ?? key} storageId={docs15[key]} inscripcionId={inscripcionId} />
              ))}
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Evaluación con rúbrica</p>
              {evaluacion ? (
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-slate-200 bg-white px-4 py-3">
                  <div>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Calificación </span>
                    <span className="text-lg font-bold text-slate-800">{evalCalculo?.calificacionGeneral.toFixed(2)}</span>
                    <span className="text-xs text-slate-400"> / 5</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Porcentaje </span>
                    <span className="text-sm font-semibold text-slate-700">{evalCalculo?.resultadoPorcentaje}%</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Puntos </span>
                    <span className="text-sm font-semibold text-slate-700">
                      {evalCalculo?.sumaPuntos} / {evalCalculo?.maximoPosible}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Aplicables </span>
                    <span className="text-sm font-semibold text-slate-700">{evalCalculo?.cantidadAplicables} de 8</span>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-xs font-semibold",
                      evalStatus === "ACEPTABLE"
                        ? "border-green-200 bg-green-50 text-green-700"
                        : evalStatus === "PROVEEDOR EN RESERVA"
                          ? "border-amber-200 bg-amber-50 text-amber-700"
                          : evalStatus === "NO ACEPTABLE"
                            ? "border-red-200 bg-red-50 text-red-700"
                            : "border-slate-200 bg-slate-50 text-slate-600",
                    )}
                  >
                    {evalStatus}
                  </Badge>
                  <Button type="button" variant="ghost" size="sm" className="ml-auto h-7 text-xs text-slate-500 hover:text-orange-600" onClick={() => setEvaluarModalOpen(true)}>
                    <ClipboardList className="mr-1 h-3.5 w-3.5" />
                    Reevaluar
                  </Button>
                </div>
              ) : (
                <Button type="button" variant="outline" className="w-full rounded-lg border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100" onClick={() => setEvaluarModalOpen(true)}>
                  <ClipboardList className="mr-2 h-4 w-4" />
                  Realizar evaluación con rúbrica
                </Button>
              )}
            </div>

            <div className="border-t border-dashed border-slate-200" />

            {!showRechazo ? (
              <div className="rounded-xl border border-orange-100 bg-orange-50/60 p-4">
                <p className="text-sm leading-relaxed text-orange-700">
                  Revisa los documentos y el resultado de la evaluación antes de tomar una decisión. Al confirmar, el proceso pasará a Contabilidad para su creación en el sistema.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Motivos de rechazo</p>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="motivoProveedorV">
                    Motivo para el proveedor
                    <span className="ml-1 text-[10px] font-normal normal-case text-slate-400">(visible externamente)</span>
                  </Label>
                  <Textarea id="motivoProveedorV" value={motivoProveedor} onChange={(e) => setMotivoProveedor(e.target.value)} placeholder="Explica al proveedor el motivo del rechazo..." rows={3} className="resize-none border-slate-200 bg-slate-50" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="motivoInternoV">
                    Motivo interno
                    <span className="ml-1 text-[10px] font-normal normal-case text-slate-400">(solo uso interno)</span>
                  </Label>
                  <Textarea id="motivoInternoV" value={motivoInterno} onChange={(e) => setMotivoInterno(e.target.value)} placeholder="Detalla el motivo interno del rechazo..." rows={3} className="resize-none border-slate-200 bg-slate-50" />
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="shrink-0 gap-2 border-t border-slate-100 bg-slate-50/60 px-6 py-4">
            {!showRechazo ? (
              <>
                <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading} className="rounded-lg">
                  Cancelar
                </Button>
                <Button variant="outline" className="rounded-lg border-red-200 text-red-700 hover:bg-red-50" onClick={() => setShowRechazo(true)} disabled={loading}>
                  <X className="mr-1 h-4 w-4" />
                  Rechazar
                </Button>
                <Button onClick={handleAprobar} disabled={loading || !evaluacion} title={!evaluacion ? "Registra la evaluación con rúbrica primero" : undefined} className="gap-2 rounded-lg bg-orange-600 text-white hover:bg-orange-700">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Confirmar evaluación
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setShowRechazo(false)} disabled={loading} className="rounded-lg">
                  Volver
                </Button>
                <Button variant="outline" className="rounded-lg border-red-200 bg-red-50 text-red-700 hover:bg-red-100" onClick={handleRechazar} disabled={loading}>
                  {loading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <X className="mr-1 h-4 w-4" />}
                  Confirmar rechazo
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ModalEvaluarCompras inscripcionId={inscripcionId} open={evaluarModalOpen} onOpenChange={setEvaluarModalOpen} />
    </>
  );
}
