"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Check, ExternalLink, FileText, FolderOpen, Loader2, Lock, ShieldCheck, SlidersHorizontal, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { computeCustomerRisk } from "@/lib/onboarding/risk/customer-matrix";
import { ROLES_CUMPLIMIENTO } from "@/lib/onboarding/roles";
import { cn } from "@/lib/utils";
import { CUSTOMER_MODULO, getOnboardingErrorMessage } from "./ui-config";

type RevDoc = Doc<"onboardingClientesDocumentos">;

const ESTADO_CONFIG: Record<string, { label: string; badgeClass: string; borderClass: string }> = {
  PENDIENTE: { label: "Pendiente", badgeClass: "bg-amber-50 text-amber-700 border-amber-200", borderClass: "border-l-amber-300" },
  EN_REVISION: { label: "En revisión", badgeClass: "bg-blue-50 text-blue-700 border-blue-200", borderClass: "border-l-blue-400" },
  APROBADO: { label: "Aprobado", badgeClass: "bg-green-50 text-green-700 border-green-200", borderClass: "border-l-green-500" },
  RECHAZADO: { label: "Rechazado", badgeClass: "bg-red-50 text-red-700 border-red-200", borderClass: "border-l-red-500" },
};

function DocRow({ doc, inscripcionId, canAct, canReplace }: { doc: RevDoc; inscripcionId: Id<"onboardingClientes">; canAct: boolean; canReplace: boolean }) {
  const revisarDoc = useMutation(api.onboarding.customers.revisarDocumento);
  const cargarInterno = useMutation(api.onboarding.customers.cargarDocumentoRevisionInterno);
  const generateUploadUrl = useMutation(api.facturacionStorage.generateUploadUrl);
  const storageUrl = useQuery(api.facturacionStorage.getUrl, doc.storageId ? { storageId: doc.storageId } : "skip");
  const [observaciones, setObservaciones] = useState(doc.observaciones ?? "");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const cfg = ESTADO_CONFIG[doc.estado] ?? { label: doc.estado, badgeClass: "", borderClass: "" };

  async function handleDecision(decision: "APROBADO" | "RECHAZADO") {
    setLoading(true);
    try {
      const result = await revisarDoc({ inscripcionId, docKey: doc.docKey, decision, observaciones: observaciones || undefined });
      toast.success(
        result.faseIIIAAbierta
          ? "Documento aprobado. Todos los documentos están revisados: el proceso pasó a Fase IIIA."
          : `Documento ${decision === "APROBADO" ? "aprobado" : "rechazado"}`,
      );
    } catch (e) {
      toast.error(getOnboardingErrorMessage(e, "Error al revisar documento"));
    } finally {
      setLoading(false);
    }
  }

  async function handleReplace(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("El archivo excede 10 MB");
      return;
    }
    setUploading(true);
    try {
      const uploadUrl = await generateUploadUrl();
      const res = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file });
      if (!res.ok) throw new Error("Error al subir el archivo");
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
      await cargarInterno({ inscripcionId, docKey: doc.docKey, storageId });
      toast.success("Documento reemplazado. Queda en revisión.");
    } catch (err) {
      toast.error(getOnboardingErrorMessage(err, "No se pudo reemplazar el documento"));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className={cn("overflow-hidden rounded-lg border border-l-4 border-slate-200 bg-white", cfg.borderClass)}>
      <div className="flex items-center justify-between gap-2 px-3.5 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <FileText className="h-4 w-4 shrink-0 text-slate-400" />
          <span className="truncate text-sm font-medium text-slate-700">{doc.docLabel}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant="outline" className={cn("text-xs", cfg.badgeClass)}>
            {cfg.label}
          </Badge>
          {storageUrl && (
            <a href={storageUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-blue-600" title="Ver documento">
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            </a>
          )}
        </div>
      </div>

      {doc.estado === "EN_REVISION" && canAct && (
        <div className="space-y-2.5 border-t border-slate-100 bg-slate-50 px-3.5 py-3">
          <Textarea
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            placeholder="Observaciones (opcional para aprobación, obligatoria para rechazo)..."
            rows={2}
            className="resize-none border-slate-200 bg-white text-sm"
          />
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="flex-1 rounded-lg border-green-200 text-green-700 hover:bg-green-50" onClick={() => handleDecision("APROBADO")} disabled={loading}>
              {loading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1 h-3.5 w-3.5" />}
              Aprobar
            </Button>
            <Button size="sm" variant="outline" className="flex-1 rounded-lg border-red-200 text-red-700 hover:bg-red-50" onClick={() => handleDecision("RECHAZADO")} disabled={loading}>
              {loading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <X className="mr-1 h-3.5 w-3.5" />}
              Rechazar
            </Button>
          </div>
        </div>
      )}

      {doc.estado === "EN_REVISION" && !canAct && (
        <div className="flex items-center gap-1.5 border-t border-slate-100 bg-slate-50/60 px-3.5 py-2">
          <Lock className="h-3 w-3 text-slate-400" />
          <p className="text-xs text-slate-400">Pendiente de revisión por Cumplimiento</p>
        </div>
      )}

      {doc.estado === "PENDIENTE" && (
        <div className="border-t border-slate-100 bg-amber-50/40 px-3.5 py-2">
          <p className="text-xs text-amber-700">El cliente aún no ha cargado este documento.</p>
        </div>
      )}

      {doc.estado === "RECHAZADO" && (
        <div className="space-y-2 border-t border-red-100 bg-red-50 px-3.5 py-2">
          {doc.observaciones && (
            <p className="text-xs text-red-600">
              <span className="font-semibold">Motivo:</span> {doc.observaciones}
            </p>
          )}
          {canReplace && (
            <div>
              <input ref={fileRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png" onChange={handleReplace} />
              <Button size="sm" variant="outline" className="h-7 rounded-lg text-xs" disabled={uploading} onClick={() => fileRef.current?.click()}>
                {uploading ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Upload className="mr-1 h-3 w-3" />}
                Reemplazar por el cliente
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Fase III — document review by Cumplimiento (single lane) with PEP/listas adjustment. */
export default function FaseIIIDialog({ inscripcionId, open, onOpenChange }: { inscripcionId: Id<"onboardingClientes">; open: boolean; onOpenChange: (open: boolean) => void }) {
  const inscripcion = useQuery(api.onboarding.customers.obtenerInscripcionPorId, { inscripcionId });
  const docs = useQuery(api.onboarding.customers.obtenerRevisionDocumentos, { inscripcionId });
  const fases = useQuery(api.onboarding.customers.obtenerFasesDeInscripcion, open ? { inscripcionId } : "skip");
  const acceso = useQuery(api.onboarding.roles.miAcceso, inscripcion ? { modulo: CUSTOMER_MODULO, empresa: inscripcion.empresa } : "skip");
  const ajustarRiesgo = useMutation(api.onboarding.customers.ajustarRiesgoCumplimientoDocumental);

  const [ajustePep, setAjustePep] = useState(false);
  const [ajusteListas, setAjusteListas] = useState<"SÍ" | "NO">("NO");
  const [observacionAjuste, setObservacionAjuste] = useState("");
  const [guardandoAjuste, setGuardandoAjuste] = useState(false);

  useEffect(() => {
    if (!open || !inscripcion) return;
    setAjustePep(inscripcion.matriz_00.isPep ?? false);
    setAjusteListas(inscripcion.matriz_00.listas === "SÍ" ? "SÍ" : "NO");
    setObservacionAjuste("");
  }, [open, inscripcion]);

  const usuarioId = acceso?.usuarioId;
  const rolesEmpresa = acceso?.roles.filter((r) => r.empresa === inscripcion?.empresa).map((r) => r.rol) ?? [];
  const faseAsignada = fases?.some((f) => f.fase === "III_REVISION_DOCUMENTAL" && f.estado === "EN_PROGRESO" && f.asignadoA === usuarioId) ?? false;
  const canAct = acceso?.isAdmin === true || rolesEmpresa.includes("CUMPLIMIENTO_LOW_RISK") || faseAsignada;
  const esCumplimiento = acceso?.isAdmin === true || rolesEmpresa.some((r) => ROLES_CUMPLIMIENTO.has(r));
  const esResponsable = acceso?.isAdmin === true || (!!usuarioId && inscripcion?.matriz_00.responsableId === usuarioId);

  const dg = inscripcion?.datos_generales_01;
  const matriz = inscripcion?.matriz_00;
  const riesgoActual = matriz?.riesgo ?? "INDEFINIDO";
  const tipoEvaluacionActual = inscripcion?.tipoEvaluacion ?? "INDEFINIDO";
  const ajusteRecalculado = matriz ? computeCustomerRisk({ ...matriz, isPep: ajustePep, listas: ajusteListas }) : { riesgo: "INDEFINIDO", tipoEvaluacion: "INDEFINIDO" };
  const hayCambioAjuste = (matriz?.isPep ?? false) !== ajustePep || (matriz?.listas === "SÍ" ? "SÍ" : "NO") !== ajusteListas;

  const totalAprobados = docs?.filter((d) => d.estado === "APROBADO").length ?? 0;
  const total = docs?.length ?? 0;
  const progreso = total > 0 ? Math.round((totalAprobados / total) * 100) : 0;
  const todosAprobados = total > 0 && totalAprobados === total;

  async function handleGuardarAjuste() {
    if (!hayCambioAjuste) {
      toast.info("No hay cambios en PEP o listas para guardar.");
      return;
    }
    if (!observacionAjuste.trim()) {
      toast.error("Registra una observación para explicar el ajuste.");
      return;
    }
    setGuardandoAjuste(true);
    try {
      const result = await ajustarRiesgo({ inscripcionId, isPep: ajustePep, listas: ajusteListas, observacion: observacionAjuste.trim() });
      toast.success(
        result.docsAgregados.length > 0
          ? `Evaluación actualizada a ${result.tipoEvaluacionNuevo}. Se solicitaron ${result.docsAgregados.length} documento(s) adicionales al cliente.`
          : `Evaluación de Cumplimiento actualizada (${result.riesgoAnterior} → ${result.riesgoNuevo}).`,
      );
      setObservacionAjuste("");
    } catch (e) {
      toast.error(getOnboardingErrorMessage(e, "Error al ajustar la evaluación de Cumplimiento"));
    } finally {
      setGuardandoAjuste(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-slate-100 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50">
              <FolderOpen className="h-5 w-5 text-teal-600" />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-base font-semibold text-slate-900">Fase III — Revisión Documental</DialogTitle>
              <DialogDescription className="mt-0.5 text-xs text-slate-500">
                {dg?.razonSocial} · {dg?.tipoDocumento} {dg?.numeroDocumento}
              </DialogDescription>
            </div>
            <div className="shrink-0 rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-[11px] font-semibold text-teal-700">Cumplimiento</div>
          </div>

          {total > 0 && (
            <div className="mt-4 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Progreso total</span>
                <span className={cn("font-semibold", todosAprobados ? "text-green-600" : "text-slate-700")}>
                  {totalAprobados} / {total} aprobados
                </span>
              </div>
              <Progress value={progreso} className="h-1.5 bg-slate-100" />
            </div>
          )}
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          {docs === undefined ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
            </div>
          ) : docs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100">
                <FolderOpen className="h-5 w-5 text-slate-400" />
              </div>
              <p className="text-sm font-medium text-slate-600">Sin documentos registrados</p>
              <p className="mt-1 text-xs text-slate-400">El cliente aún no ha firmado el formulario.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {esCumplimiento && (
                <div className="mb-4 space-y-3 rounded-xl border border-teal-100 bg-teal-50/60 p-4">
                  <div className="flex items-start gap-2">
                    <SlidersHorizontal className="mt-0.5 h-4 w-4 text-teal-600" />
                    <div>
                      <p className="text-sm font-semibold text-slate-800">Ajustar PEP y listas</p>
                      <p className="text-xs text-slate-500">Si el ajuste aumenta el riesgo, se agregan los documentos faltantes sin mover esta fase.</p>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-slate-500">PEP</Label>
                      <Select value={ajustePep ? "SI" : "NO"} onValueChange={(value) => setAjustePep(value === "SI")}>
                        <SelectTrigger className="h-9 bg-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="NO">No</SelectItem>
                          <SelectItem value="SI">Sí</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-slate-500">Listas restrictivas</Label>
                      <Select value={ajusteListas} onValueChange={(value) => setAjusteListas(value as "SÍ" | "NO")}>
                        <SelectTrigger className="h-9 bg-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="NO">No</SelectItem>
                          <SelectItem value="SÍ">Sí</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {hayCambioAjuste && (
                    <div className="rounded-lg border border-teal-100 bg-white px-3 py-2 text-xs text-slate-600">
                      Riesgo: <span className="font-semibold">{riesgoActual}</span> → <span className="font-semibold">{ajusteRecalculado.riesgo}</span>. Evaluación:{" "}
                      <span className="font-semibold">{tipoEvaluacionActual}</span> → <span className="font-semibold">{ajusteRecalculado.tipoEvaluacion}</span>.
                    </div>
                  )}
                  <Textarea value={observacionAjuste} onChange={(e) => setObservacionAjuste(e.target.value)} placeholder="Observación del cambio..." rows={2} className="bg-white" />
                  <Button type="button" onClick={handleGuardarAjuste} disabled={!hayCambioAjuste || guardandoAjuste} className="w-full rounded-lg bg-teal-600 text-white hover:bg-teal-700">
                    {guardandoAjuste ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                    Guardar ajuste de Cumplimiento
                  </Button>
                </div>
              )}
              <div className="flex items-center gap-2 rounded-lg border border-teal-100 bg-teal-50/60 px-3 py-2">
                <ShieldCheck className="h-3.5 w-3.5 text-teal-500" />
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-600">Documentos a revisar</span>
              </div>
              {docs.map((doc) => (
                <DocRow key={doc._id} doc={doc} inscripcionId={inscripcionId} canAct={canAct} canReplace={esResponsable} />
              ))}
            </div>
          )}

          {todosAprobados && (
            <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 p-4">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-100">
                <Check className="h-4 w-4 text-green-600" />
              </div>
              <p className="text-sm font-medium text-green-700">Todos los documentos han sido aprobados. El proceso avanzó a Fase IIIA (Aprobación Cumplimiento).</p>
            </div>
          )}
        </div>

        <div className="flex shrink-0 justify-end border-t border-slate-100 bg-slate-50/60 px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-lg">
            Cerrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
