"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { CheckCircle2, ExternalLink, Loader2, Pencil, Save, ShieldAlert, SlidersHorizontal, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { useArchivoInscripcionUrl } from "@/hooks/useArchivoInscripcionUrl";
import type { Id } from "@/convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useUsuario } from "@/hooks/useUsuariosMap";
import { computeSupplierRisk, SUPPLIER_MONTO_OPTIONS, SUPPLIER_SECTOR_OPTIONS } from "@/lib/onboarding/risk/supplier-matrix";
import { JURISDICCION_INTERNACIONAL_OPTIONS, JURISDICCION_NACIONAL_OPTIONS, TIPO_PERSONA_LABELS } from "@/lib/onboarding/risk/shared";
import { cn } from "@/lib/utils";
import { getOnboardingErrorMessage, InfoItem, RIESGO_BADGE_SOLID } from "./ui-config";

const RIESGO_OPTIONS = ["BAJO", "MEDIO", "ALTO", "SUPERIOR"] as const;
const TIPO_EVAL_OPTIONS = ["SOLO LISTAS", "SIMPLIFICADA", "COMPLETA", "INTENSIFICADA"] as const;
type RiesgoOpt = (typeof RIESGO_OPTIONS)[number];
type TipoEvalOpt = (typeof TIPO_EVAL_OPTIONS)[number];

function EditItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      {children}
    </div>
  );
}

/**
 * Fase I — risk analysis. Only reachable after a phase return: the process starts in Fase II
 * with the risk computed automatically. Lets Cumplimiento adjust the matrix and re-approve.
 */
export default function FaseIDialog({
  inscripcionId,
  open,
  onOpenChange,
}: {
  inscripcionId: Id<"onboardingProveedores">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const inscripcion = useQuery(api.onboarding.suppliers.obtenerInscripcionPorId, { inscripcionId });
  const completarFaseI = useMutation(api.onboarding.suppliers.completarFaseI);
  const actualizarCamposFaseI = useMutation(api.onboarding.suppliers.actualizarCamposFaseI);
  const rutStorageId = inscripcion?.matriz_00.rutStorageId;
  const rutUrl = useArchivoInscripcionUrl("supplier", inscripcionId, rutStorageId);
  const responsable = useUsuario(inscripcion?.matriz_00.responsableId);

  const [observaciones, setObservaciones] = useState("");
  const [listas, setListas] = useState("");
  const [riesgoFinal, setRiesgoFinal] = useState<RiesgoOpt | "">("");
  const [tipoEvaluacion, setTipoEvaluacion] = useState<TipoEvalOpt | "">("");
  const [loading, setLoading] = useState(false);

  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [edit, setEdit] = useState({
    contactoNombre: "",
    contactoEmail: "",
    contactoCelular: "",
    codigoCiiuSecundario: "",
    actividadEconomicaPrincipal: "",
    actividadEconomicaSecundaria: "",
    sectorEconomico: "",
    servicioSuministrado: "",
    montoAnual: "",
    jurisdiccionNacional: "",
    jurisdiccionInternacional: "",
    listas: "",
    isPep: false,
  });

  useEffect(() => {
    if (!editMode || !inscripcion) return;
    const dg = inscripcion.datos_generales_01;
    const m = inscripcion.matriz_00;
    setEdit({
      contactoNombre: dg.contactoNombre ?? "",
      contactoEmail: dg.contactoEmail ?? "",
      contactoCelular: dg.contactoCelular ?? "",
      codigoCiiuSecundario: m.codigoCiiuSecundario ?? "",
      actividadEconomicaPrincipal: m.actividadEconomicaPrincipal ?? "",
      actividadEconomicaSecundaria: m.actividadEconomicaSecundaria ?? "",
      sectorEconomico: m.sectorEconomico ?? "",
      servicioSuministrado: m.servicioSuministrado ?? "",
      montoAnual: m.montoAnual ?? "",
      jurisdiccionNacional: m.jurisdiccionNacional ?? "",
      jurisdiccionInternacional: m.jurisdiccionInternacional ?? "",
      listas: m.listas ?? "",
      isPep: m.isPep ?? false,
    });
  }, [editMode, inscripcion]);

  if (!inscripcion) return null;

  const matriz = inscripcion.matriz_00;
  const datosGenerales = inscripcion.datos_generales_01;
  const riesgoActual = matriz.riesgo ?? "INDEFINIDO";
  const tipoActual = inscripcion.tipoEvaluacion_14 ?? "INDEFINIDO";
  const previewRisk = editMode ? computeSupplierRisk(edit) : null;

  async function handleCompletar() {
    setLoading(true);
    try {
      await completarFaseI({
        inscripcionId,
        observaciones: observaciones || undefined,
        listas: listas || undefined,
        riesgoFinal: riesgoFinal || undefined,
        tipoEvaluacion: tipoEvaluacion || undefined,
      });
      toast.success("Fase I completada. Se envió la invitación al formulario al proveedor.");
      onOpenChange(false);
    } catch (e) {
      toast.error(getOnboardingErrorMessage(e, "Error al completar Fase I"));
    } finally {
      setLoading(false);
    }
  }

  async function handleGuardarEdicion() {
    setSaving(true);
    try {
      const result = await actualizarCamposFaseI({
        inscripcionId,
        contactoNombre: edit.contactoNombre || undefined,
        contactoEmail: edit.contactoEmail || undefined,
        contactoCelular: edit.contactoCelular || undefined,
        codigoCiiuSecundario: edit.codigoCiiuSecundario,
        actividadEconomicaPrincipal: edit.actividadEconomicaPrincipal || undefined,
        actividadEconomicaSecundaria: edit.actividadEconomicaSecundaria,
        sectorEconomico: edit.sectorEconomico || undefined,
        servicioSuministrado: edit.servicioSuministrado || undefined,
        montoAnual: edit.montoAnual || undefined,
        jurisdiccionNacional: edit.jurisdiccionNacional,
        jurisdiccionInternacional: edit.jurisdiccionInternacional,
        listas: edit.listas || undefined,
        isPep: edit.isPep,
      });
      toast.success(`Campos actualizados. Riesgo ${result.riesgo} · ${result.tipoEvaluacion}.`);
      setEditMode(false);
    } catch (e) {
      toast.error(getOnboardingErrorMessage(e, "Error al guardar cambios"));
    } finally {
      setSaving(false);
    }
  }

  const inputCls = "h-8 border-slate-200 bg-white text-sm";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl gap-0 overflow-y-auto p-0">
        <DialogHeader className="border-b border-slate-100 px-6 py-5 pr-14 sm:pr-16">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50">
              <ShieldAlert className="h-5 w-5 text-blue-600" />
            </div>
            <div className="flex-1">
              <DialogTitle className="text-base font-semibold text-slate-900">Fase I — Análisis de Riesgo</DialogTitle>
              <p className="mt-0.5 text-xs text-slate-500">
                {datosGenerales.razonSocial} · {datosGenerales.tipoDocumento} {datosGenerales.numeroDocumento}
                {datosGenerales.tipoPersona ? ` · Persona ${TIPO_PERSONA_LABELS[datosGenerales.tipoPersona]?.toLowerCase() ?? ""}` : ""}
              </p>
            </div>
            {!editMode ? (
              <Button variant="outline" size="sm" onClick={() => setEditMode(true)} className="shrink-0 gap-1.5 rounded-lg text-slate-600">
                <Pencil className="h-3.5 w-3.5" />
                Editar
              </Button>
            ) : (
              <div className="flex shrink-0 gap-2">
                <Button variant="outline" size="sm" onClick={() => setEditMode(false)} disabled={saving} className="gap-1.5 rounded-lg text-slate-600">
                  <X className="h-3.5 w-3.5" />
                  Cancelar
                </Button>
                <Button size="sm" onClick={handleGuardarEdicion} disabled={saving} className="gap-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700">
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Guardar
                </Button>
              </div>
            )}
          </div>
        </DialogHeader>

        <div className="space-y-6 px-6 py-5">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Contacto del proveedor</p>
            <div className="grid grid-cols-2 gap-2">
              {editMode ? (
                <>
                  <EditItem label="Nombre contacto">
                    <Input value={edit.contactoNombre} onChange={(e) => setEdit((s) => ({ ...s, contactoNombre: e.target.value }))} className={inputCls} />
                  </EditItem>
                  <EditItem label="Email">
                    <Input type="email" value={edit.contactoEmail} onChange={(e) => setEdit((s) => ({ ...s, contactoEmail: e.target.value }))} className={inputCls} />
                  </EditItem>
                  <EditItem label="Celular">
                    <Input value={edit.contactoCelular} onChange={(e) => setEdit((s) => ({ ...s, contactoCelular: e.target.value }))} className={inputCls} />
                  </EditItem>
                </>
              ) : (
                <>
                  <InfoItem label="Nombre contacto">{datosGenerales.contactoNombre || "—"}</InfoItem>
                  <InfoItem label="Email">{datosGenerales.contactoEmail || "—"}</InfoItem>
                  <InfoItem label="Celular">{datosGenerales.contactoCelular || "—"}</InfoItem>
                </>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Responsable</p>
            <div className="grid grid-cols-2 gap-2">
              <InfoItem label="Nombre">{responsable?.nombre || "—"}</InfoItem>
              <InfoItem label="Cargo">{responsable?.cargo || "—"}</InfoItem>
              <InfoItem label="Proceso">{responsable?.proceso || "—"}</InfoItem>
            </div>
          </div>

          <div className="border-t border-dashed border-slate-200" />

          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Datos de la matriz</p>
            <div className="grid grid-cols-2 gap-2">
              {editMode ? (
                <>
                  <EditItem label="CIIU secundario">
                    <Input value={edit.codigoCiiuSecundario} onChange={(e) => setEdit((s) => ({ ...s, codigoCiiuSecundario: e.target.value }))} className={inputCls} />
                  </EditItem>
                  <EditItem label="Actividad económica principal">
                    <Input value={edit.actividadEconomicaPrincipal} onChange={(e) => setEdit((s) => ({ ...s, actividadEconomicaPrincipal: e.target.value }))} className={inputCls} />
                  </EditItem>
                  <EditItem label="Actividad económica secundaria">
                    <Input value={edit.actividadEconomicaSecundaria} onChange={(e) => setEdit((s) => ({ ...s, actividadEconomicaSecundaria: e.target.value }))} className={inputCls} />
                  </EditItem>
                  <EditItem label="Sector económico">
                    <Select value={edit.sectorEconomico} onValueChange={(v) => setEdit((s) => ({ ...s, sectorEconomico: v }))}>
                      <SelectTrigger className={inputCls}>
                        <SelectValue placeholder="Seleccionar" />
                      </SelectTrigger>
                      <SelectContent>
                        {SUPPLIER_SECTOR_OPTIONS.map((opt) => (
                          <SelectItem key={opt} value={opt}>
                            <span className="line-clamp-2 text-xs">{opt}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </EditItem>
                  <InfoItem label="RUT">
                    {rutUrl ? (
                      <a href={rutUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline">
                        Ver RUT <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    ) : rutStorageId ? (
                      <span className="text-sm text-slate-400">Cargando...</span>
                    ) : (
                      "—"
                    )}
                  </InfoItem>
                  <EditItem label="Servicio suministrado">
                    <Input value={edit.servicioSuministrado} onChange={(e) => setEdit((s) => ({ ...s, servicioSuministrado: e.target.value }))} className={inputCls} />
                  </EditItem>
                  <EditItem label="Monto anual">
                    <Select value={edit.montoAnual} onValueChange={(v) => setEdit((s) => ({ ...s, montoAnual: v }))}>
                      <SelectTrigger className={inputCls}>
                        <SelectValue placeholder="Seleccionar" />
                      </SelectTrigger>
                      <SelectContent>
                        {SUPPLIER_MONTO_OPTIONS.map((opt) => (
                          <SelectItem key={opt} value={opt}>
                            {opt}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </EditItem>
                  <EditItem label="Jurisdicción nacional">
                    <Select
                      value={edit.jurisdiccionNacional}
                      onValueChange={(v) => setEdit((s) => ({ ...s, jurisdiccionNacional: v, jurisdiccionInternacional: "" }))}
                      disabled={!!edit.jurisdiccionInternacional}
                    >
                      <SelectTrigger className={inputCls}>
                        <SelectValue placeholder="Seleccionar" />
                      </SelectTrigger>
                      <SelectContent>
                        {JURISDICCION_NACIONAL_OPTIONS.map((opt) => (
                          <SelectItem key={opt} value={opt}>
                            {opt}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </EditItem>
                  <EditItem label="Jurisdicción internacional">
                    <Select
                      value={edit.jurisdiccionInternacional}
                      onValueChange={(v) => setEdit((s) => ({ ...s, jurisdiccionInternacional: v, jurisdiccionNacional: "" }))}
                      disabled={!!edit.jurisdiccionNacional}
                    >
                      <SelectTrigger className={inputCls}>
                        <SelectValue placeholder="Seleccionar" />
                      </SelectTrigger>
                      <SelectContent>
                        {JURISDICCION_INTERNACIONAL_OPTIONS.map((opt) => (
                          <SelectItem key={opt} value={opt}>
                            {opt}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </EditItem>
                  <EditItem label="Listas restrictivas">
                    <Input value={edit.listas} onChange={(e) => setEdit((s) => ({ ...s, listas: e.target.value }))} className={inputCls} />
                  </EditItem>
                  <EditItem label="PEP">
                    <Select value={edit.isPep ? "true" : "false"} onValueChange={(v) => setEdit((s) => ({ ...s, isPep: v === "true" }))}>
                      <SelectTrigger className={inputCls}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="false">No</SelectItem>
                        <SelectItem value="true">Sí — PEP</SelectItem>
                      </SelectContent>
                    </Select>
                  </EditItem>
                  <InfoItem label="Riesgo recalculado">
                    <Badge variant="outline" className={cn("font-semibold", RIESGO_BADGE_SOLID[previewRisk?.riesgo ?? "INDEFINIDO"])}>
                      {previewRisk?.riesgo ?? "INDEFINIDO"}
                    </Badge>
                  </InfoItem>
                  <InfoItem label="Tipo de evaluación recalculado">
                    <Badge variant="outline" className={cn("font-semibold", RIESGO_BADGE_SOLID[previewRisk?.tipoEvaluacion ?? "INDEFINIDO"])}>
                      {previewRisk?.tipoEvaluacion ?? "INDEFINIDO"}
                    </Badge>
                  </InfoItem>
                </>
              ) : (
                <>
                  <InfoItem label="CIIU principal">{inscripcion.actividadPrincipal_02?.codigoCiiu || "—"}</InfoItem>
                  <InfoItem label="Actividad económica">{matriz.actividadEconomicaPrincipal || "—"}</InfoItem>
                  <InfoItem label="CIIU secundario">{matriz.codigoCiiuSecundario || "—"}</InfoItem>
                  <InfoItem label="Sector económico">{matriz.sectorEconomico || "—"}</InfoItem>
                  <InfoItem label="RUT">
                    {rutUrl ? (
                      <a href={rutUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline">
                        Ver RUT <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    ) : rutStorageId ? (
                      <span className="text-sm text-slate-400">Cargando...</span>
                    ) : (
                      "—"
                    )}
                  </InfoItem>
                  <InfoItem label="Servicio suministrado">{matriz.servicioSuministrado || "—"}</InfoItem>
                  <InfoItem label="Monto anual">{matriz.montoAnual || "—"}</InfoItem>
                  <InfoItem label="Jurisdicción nacional">{matriz.jurisdiccionNacional || "—"}</InfoItem>
                  <InfoItem label="Jurisdicción internacional">{matriz.jurisdiccionInternacional || "—"}</InfoItem>
                  <InfoItem label="Listas restrictivas">{matriz.listas || "—"}</InfoItem>
                  <InfoItem label="PEP">
                    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold", matriz.isPep ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700")}>
                      {matriz.isPep ? "Sí — PEP" : "No"}
                    </span>
                  </InfoItem>
                  <InfoItem label="Riesgo calculado">
                    <Badge variant="outline" className={cn("font-semibold", RIESGO_BADGE_SOLID[riesgoActual])}>
                      {riesgoActual}
                    </Badge>
                  </InfoItem>
                  <InfoItem label="Tipo de evaluación">
                    <Badge variant="outline" className={cn("font-semibold", RIESGO_BADGE_SOLID[tipoActual])}>
                      {tipoActual}
                    </Badge>
                  </InfoItem>
                </>
              )}
            </div>
          </div>

          <div className="border-t border-dashed border-slate-200" />

          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100">
                <SlidersHorizontal className="h-3.5 w-3.5 text-slate-500" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Ajustes opcionales</p>
                <p className="text-[11px] text-slate-400">Corrige los valores si es necesario antes de aprobar</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="listas">
                Resultado de consulta de listas
              </Label>
              <Input
                id="listas"
                value={listas}
                onChange={(e) => setListas(e.target.value)}
                placeholder={matriz.listas || "Ej: Sin coincidencias en listas restrictivas"}
                className="border-slate-200 bg-slate-50"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Riesgo final (override)</Label>
                <Select value={riesgoFinal} onValueChange={(v) => setRiesgoFinal(v as RiesgoOpt)}>
                  <SelectTrigger className="border-slate-200 bg-slate-50">
                    <SelectValue placeholder={`Actual: ${riesgoActual}`} />
                  </SelectTrigger>
                  <SelectContent>
                    {RIESGO_OPTIONS.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tipo evaluación (override)</Label>
                <Select value={tipoEvaluacion} onValueChange={(v) => setTipoEvaluacion(v as TipoEvalOpt)}>
                  <SelectTrigger className="border-slate-200 bg-slate-50">
                    <SelectValue placeholder={`Actual: ${tipoActual}`} />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPO_EVAL_OPTIONS.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="observaciones">
                Observaciones
              </Label>
              <Textarea
                id="observaciones"
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                placeholder="Observaciones sobre el análisis de riesgo..."
                rows={3}
                className="resize-none border-slate-200 bg-slate-50"
              />
            </div>
          </div>
        </div>

        <DialogFooter className="border-t border-slate-100 bg-slate-50/60 px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading} className="rounded-lg">
            Cancelar
          </Button>
          <Button onClick={handleCompletar} disabled={loading || editMode} className="gap-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Aprobar y continuar a Fase II
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
