"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Check, ExternalLink, FileText, FolderOpen, Loader2, Lock, ShieldCheck, ShoppingCart, SlidersHorizontal, Upload, X } from "lucide-react";
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
import { supplierDocRevisorRol } from "@/lib/onboarding/documents/suppliers";
import { computeSupplierRisk } from "@/lib/onboarding/risk/supplier-matrix";
import { ROLES_CUMPLIMIENTO } from "@/lib/onboarding/roles";
import { cn } from "@/lib/utils";
import { getOnboardingErrorMessage, SUPPLIER_MODULO } from "./ui-config";

type RevDoc = Doc<"onboardingProveedoresDocumentos">;

const ESTADO_CONFIG: Record<string, { label: string; badgeClass: string; borderClass: string }> = {
  PENDIENTE: { label: "Pendiente", badgeClass: "bg-amber-50 text-amber-700 border-amber-200", borderClass: "border-l-amber-300" },
  EN_REVISION: { label: "En revisión", badgeClass: "bg-blue-50 text-blue-700 border-blue-200", borderClass: "border-l-blue-400" },
  APROBADO: { label: "Aprobado", badgeClass: "bg-green-50 text-green-700 border-green-200", borderClass: "border-l-green-500" },
  RECHAZADO: { label: "Rechazado", badgeClass: "bg-red-50 text-red-700 border-red-200", borderClass: "border-l-red-500" },
};

function useStorageUrl(storageId: Id<"_storage"> | undefined) {
  return useQuery(api.facturacionStorage.getUrl, storageId ? { storageId } : "skip");
}

function DocRow({
  doc,
  inscripcionId,
  canAct,
  canReplace,
}: {
  doc: RevDoc;
  inscripcionId: Id<"onboardingProveedores">;
  /** Current user reviews this lane. */
  canAct: boolean;
  /** Current user is the responsable and may replace a rejected file on behalf of the supplier. */
  canReplace: boolean;
}) {
  const revisarDoc = useMutation(api.onboarding.suppliers.revisarDocumento);
  const cargarInterno = useMutation(api.onboarding.suppliers.cargarDocumentoRevisionInterno);
  const generateUploadUrl = useMutation(api.facturacionStorage.generateUploadUrl);
  const storageUrl = useStorageUrl(doc.storageId);
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
        result.faseIVAbierta
          ? "Documento aprobado. Todos los documentos están revisados: el proceso pasó a Fase IV."
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
          <p className="text-xs text-slate-400">Pendiente de revisión por otra área</p>
        </div>
      )}

      {doc.estado === "PENDIENTE" && (
        <div className="border-t border-slate-100 bg-amber-50/40 px-3.5 py-2">
          <p className="text-xs text-amber-700">El proveedor aún no ha cargado este documento.</p>
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
                Reemplazar por el proveedor
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function GroupSection({
  title,
  icon,
  iconClass,
  bgClass,
  docs,
  inscripcionId,
  canAct,
  canReplace,
}: {
  title: string;
  icon: React.ReactNode;
  iconClass: string;
  bgClass: string;
  docs: RevDoc[];
  inscripcionId: Id<"onboardingProveedores">;
  canAct: boolean;
  canReplace: boolean;
}) {
  const aprobados = docs.filter((d) => d.estado === "APROBADO").length;
  const total = docs.length;
  const allApproved = total > 0 && aprobados === total;
  if (total === 0) return null;

  return (
    <div className="space-y-2">
      <div className={cn("flex items-center justify-between rounded-lg px-3 py-2", bgClass)}>
        <div className="flex items-center gap-2">
          <span className={iconClass}>{icon}</span>
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-600">{title}</span>
        </div>
        {allApproved ? (
          <span className="flex items-center gap-1 text-[11px] font-semibold text-green-700">
            <Check className="h-3 w-3" /> Completo
          </span>
        ) : (
          <span className="text-[11px] text-slate-500">
            {aprobados}/{total} aprobados
          </span>
        )}
      </div>
      <div className="space-y-1.5 pl-1">
        {docs.map((doc) => (
          <DocRow key={doc._id} doc={doc} inscripcionId={inscripcionId} canAct={canAct} canReplace={canReplace} />
        ))}
      </div>
    </div>
  );
}

/** Fase III — document review in two lanes (Cumplimiento and Compras). */
export default function FaseIIIDialog({
  inscripcionId,
  open,
  onOpenChange,
}: {
  inscripcionId: Id<"onboardingProveedores">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const inscripcion = useQuery(api.onboarding.suppliers.obtenerInscripcionPorId, { inscripcionId });
  const docs = useQuery(api.onboarding.suppliers.obtenerRevisionDocumentos, { inscripcionId });
  const fases = useQuery(api.onboarding.suppliers.obtenerFasesDeInscripcion, open ? { inscripcionId } : "skip");
  const acceso = useQuery(api.onboarding.roles.miAcceso, inscripcion ? { modulo: SUPPLIER_MODULO, empresa: inscripcion.empresa } : "skip");
  const ajustarRiesgo = useMutation(api.onboarding.suppliers.ajustarRiesgoCumplimientoDocumental);

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
  const faseAsignada = (lane: string) => fases?.some((f) => f.fase === lane && f.estado === "EN_PROGRESO" && f.asignadoA === usuarioId) ?? false;
  const canActCumplimiento =
    acceso?.isAdmin === true || rolesEmpresa.some((r) => ROLES_CUMPLIMIENTO.has(r)) || faseAsignada("III_REVISION_DOCUMENTAL_CUMPLIMIENTO");
  const canActCompras = acceso?.isAdmin === true || rolesEmpresa.includes("COMPRAS") || faseAsignada("III_REVISION_DOCUMENTAL_COMPRAS");
  const esResponsable = acceso?.isAdmin === true || (!!usuarioId && inscripcion?.matriz_00.responsableId === usuarioId);
  const userRol: "CUMPLIMIENTO" | "COMPRAS" | null = canActCompras && !canActCumplimiento ? "COMPRAS" : canActCumplimiento ? "CUMPLIMIENTO" : null;

  const dg = inscripcion?.datos_generales_01;
  const matriz = inscripcion?.matriz_00;
  const riesgoActual = matriz?.riesgo ?? "INDEFINIDO";
  const tipoEvaluacionActual = inscripcion?.tipoEvaluacion_14 ?? "INDEFINIDO";
  const ajusteRecalculado = matriz
    ? computeSupplierRisk({ ...matriz, isPep: ajustePep, listas: ajusteListas })
    : { riesgo: "INDEFINIDO", tipoEvaluacion: "INDEFINIDO" };
  const hayCambioAjuste = (matriz?.isPep ?? false) !== ajustePep || (matriz?.listas === "SÍ" ? "SÍ" : "NO") !== ajusteListas;

  const laneDe = (d: RevDoc) => d.revisorRol ?? supplierDocRevisorRol(d.docKey);
  const cumplimientoDocs = docs?.filter((d) => laneDe(d) !== "COMPRAS") ?? [];
  const comprasDocs = docs?.filter((d) => laneDe(d) === "COMPRAS") ?? [];

  const totalAprobados = docs?.filter((d) => d.estado === "APROBADO").length ?? 0;
  const total = docs?.length ?? 0;
  const progreso = total > 0 ? Math.round((totalAprobados / total) * 100) : 0;
  const cumplimientoOk = cumplimientoDocs.length > 0 && cumplimientoDocs.every((d) => d.estado === "APROBADO");
  const comprasOk = comprasDocs.length > 0 && comprasDocs.every((d) => d.estado === "APROBADO");
  const todosAprobados = (cumplimientoDocs.length === 0 || cumplimientoOk) && (comprasDocs.length === 0 || comprasOk) && total > 0;

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
          ? `Evaluación actualizada a ${result.tipoEvaluacionNuevo}. Se solicitaron ${result.docsAgregados.length} documento(s) adicionales al proveedor.`
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
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-50">
              <FolderOpen className="h-5 w-5 text-violet-600" />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-base font-semibold text-slate-900">Fase III — Revisión Documental</DialogTitle>
              <DialogDescription className="mt-0.5 text-xs text-slate-500">
                {dg?.razonSocial} · {dg?.tipoDocumento} {dg?.numeroDocumento}
              </DialogDescription>
            </div>
            {userRol && (
              <div
                className={cn(
                  "shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                  userRol === "CUMPLIMIENTO" ? "border-violet-200 bg-violet-50 text-violet-700" : "border-orange-200 bg-orange-50 text-orange-700",
                )}
              >
                {userRol === "CUMPLIMIENTO" ? "Cumplimiento" : "Compras"}
              </div>
            )}
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
              <div className="flex gap-3 pt-0.5">
                <span className={cn("flex items-center gap-1 text-[11px] font-medium", cumplimientoOk ? "text-green-600" : "text-slate-400")}>
                  {cumplimientoOk ? <Check className="h-3 w-3" /> : <div className="h-3 w-3 rounded-full border border-current" />}
                  Cumplimiento
                </span>
                <span className={cn("flex items-center gap-1 text-[11px] font-medium", comprasOk ? "text-green-600" : "text-slate-400")}>
                  {comprasOk ? <Check className="h-3 w-3" /> : <div className="h-3 w-3 rounded-full border border-current" />}
                  Compras
                </span>
              </div>
            </div>
          )}
        </DialogHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-4">
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
              <p className="mt-1 text-xs text-slate-400">El proveedor aún no ha firmado el formulario.</p>
            </div>
          ) : (
            <>
              {canActCumplimiento && (
                <div className="space-y-3 rounded-xl border border-violet-100 bg-violet-50/50 p-4">
                  <div className="flex items-start gap-2">
                    <SlidersHorizontal className="mt-0.5 h-4 w-4 text-violet-600" />
                    <div>
                      <p className="text-sm font-semibold text-slate-800">Ajustar PEP y listas</p>
                      <p className="text-xs text-slate-500">Si el ajuste aumenta el riesgo, se agregan los documentos faltantes sin devolver la fase.</p>
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
                    <div className="rounded-lg border border-violet-100 bg-white px-3 py-2 text-xs text-slate-600">
                      Riesgo: <span className="font-semibold">{riesgoActual}</span> → <span className="font-semibold">{ajusteRecalculado.riesgo}</span>. Evaluación:{" "}
                      <span className="font-semibold">{tipoEvaluacionActual}</span> → <span className="font-semibold">{ajusteRecalculado.tipoEvaluacion}</span>.
                    </div>
                  )}
                  <Textarea value={observacionAjuste} onChange={(e) => setObservacionAjuste(e.target.value)} placeholder="Observación del cambio..." rows={2} className="bg-white" />
                  <Button type="button" onClick={handleGuardarAjuste} disabled={!hayCambioAjuste || guardandoAjuste} className="w-full rounded-lg bg-violet-600 text-white hover:bg-violet-700">
                    {guardandoAjuste ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                    Guardar ajuste de Cumplimiento
                  </Button>
                </div>
              )}
              <GroupSection
                title="Revisión Cumplimiento"
                icon={<ShieldCheck className="h-3.5 w-3.5" />}
                iconClass="text-violet-500"
                bgClass="bg-violet-50/60 border border-violet-100"
                docs={cumplimientoDocs}
                inscripcionId={inscripcionId}
                canAct={canActCumplimiento}
                canReplace={esResponsable}
              />
              <GroupSection
                title="Revisión Compras"
                icon={<ShoppingCart className="h-3.5 w-3.5" />}
                iconClass="text-orange-500"
                bgClass="bg-orange-50/60 border border-orange-100"
                docs={comprasDocs}
                inscripcionId={inscripcionId}
                canAct={canActCompras}
                canReplace={esResponsable}
              />
            </>
          )}

          {todosAprobados && (
            <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 p-4">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-100">
                <Check className="h-4 w-4 text-green-600" />
              </div>
              <p className="text-sm font-medium text-green-700">
                Cumplimiento y Compras han aprobado todos sus documentos. El proceso avanza automáticamente a Fase IV.
              </p>
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
