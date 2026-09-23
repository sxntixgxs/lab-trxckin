"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Check, ExternalLink, FileText, Loader2, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { useArchivoInscripcionUrl } from "@/hooks/useArchivoInscripcionUrl";
import type { Id } from "@/convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { ESTADO_DOC_BADGE, ESTADO_DOC_LABEL, getOnboardingErrorMessage, InfoItem, RIESGO_BADGE_SOLID, RIESGO_CONFIG, SUPPLIER_MODULO } from "./ui-config";

function DocLinkRow({ label, estado, storageId, inscripcionId, onOpen, loading }: { label: string; estado?: string; storageId?: Id<"_storage">; inscripcionId?: Id<"onboardingProveedores">; onOpen?: () => void; loading?: boolean }) {
  const storageUrl = useArchivoInscripcionUrl("supplier", inscripcionId, storageId);
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <FileText className="h-4 w-4 shrink-0 text-slate-400" />
        <span className="truncate text-sm font-medium text-slate-700">{label}</span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {estado && (
          <Badge variant="outline" className={cn("text-[10px]", ESTADO_DOC_BADGE[estado] ?? "")}>
            {ESTADO_DOC_LABEL[estado] ?? estado}
          </Badge>
        )}
        {onOpen ? (
          <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-blue-600" title="Ver formato" onClick={onOpen} disabled={loading}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
          </Button>
        ) : storageUrl ? (
          <a href={storageUrl} target="_blank" rel="noopener noreferrer" title="Ver documento">
            <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-blue-600">
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          </a>
        ) : null}
      </div>
    </div>
  );
}

/** Fase IV — Cumplimiento approval (escalated by evaluation type). */
export default function FaseIVDialog({
  inscripcionId,
  open,
  onOpenChange,
}: {
  inscripcionId: Id<"onboardingProveedores">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const inscripcion = useQuery(api.onboarding.suppliers.obtenerInscripcionPorId, { inscripcionId });
  const revisiones = useQuery(api.onboarding.suppliers.obtenerRevisionDocumentos, { inscripcionId });
  const completarFaseIV = useMutation(api.onboarding.suppliers.completarFaseIV);
  const rechazarCumplimiento = useMutation(api.onboarding.suppliers.rechazarCumplimiento);
  const emitirEnlace = useMutation(api.onboarding.tokens.emitirEnlaceAcceso);

  const [motivoProveedor, setMotivoProveedor] = useState("");
  const [motivoInterno, setMotivoInterno] = useState("");
  const [observacionesAprobacion, setObservacionesAprobacion] = useState("");
  const [loading, setLoading] = useState(false);
  const [abriendoFormato, setAbriendoFormato] = useState(false);
  const [showRechazo, setShowRechazo] = useState(false);

  if (!inscripcion) return null;

  const datos = inscripcion.datos_generales_01;
  const riesgo = inscripcion.matriz_00.riesgo ?? "INDEFINIDO";
  const riesgoConfig = RIESGO_CONFIG[riesgo] ?? RIESGO_CONFIG.INDEFINIDO;
  const docsAprobados = revisiones?.filter((r) => r.estado === "APROBADO").length ?? 0;
  const docsTotal = revisiones?.length ?? 0;

  async function handleVerFormato() {
    setAbriendoFormato(true);
    try {
      // Short-lived read-only link to the signed form viewer (never rotates the supplier's tokens).
      const { url } = await emitirEnlace({ modulo: SUPPLIER_MODULO, inscripcionId, scope: "SIGN", viewOnly: true });
      window.open(url, "_blank", "noopener");
    } catch (e) {
      toast.error(getOnboardingErrorMessage(e, "No se pudo abrir el formato"));
    } finally {
      setAbriendoFormato(false);
    }
  }

  async function handleAprobar() {
    setLoading(true);
    try {
      await completarFaseIV({ inscripcionId, decision: "APROBADO", observaciones: observacionesAprobacion.trim() || undefined });
      toast.success("Inscripción aprobada por Cumplimiento. Pasa a Fase V — Evaluación de Compras.");
      onOpenChange(false);
    } catch (e) {
      toast.error(getOnboardingErrorMessage(e, "Error al aprobar"));
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
      await rechazarCumplimiento({ inscripcionId, motivoProveedor: motivoProveedor.trim(), motivoInterno: motivoInterno.trim() });
      toast.success("Inscripción rechazada por Cumplimiento. El proveedor fue notificado.");
      onOpenChange(false);
    } catch (e) {
      toast.error(getOnboardingErrorMessage(e, "Error al rechazar"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-xl flex-col gap-0 p-0">
        <DialogHeader className="border-b border-slate-100 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50">
              <ShieldCheck className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold text-slate-900">Fase IV — Aprobación Cumplimiento</DialogTitle>
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
              <InfoItem label="Documentos revisados">
                <span className={docsAprobados === docsTotal && docsTotal > 0 ? "text-green-700" : "text-amber-700"}>
                  {docsAprobados}/{docsTotal} aprobados
                </span>
              </InfoItem>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Documentos</p>
            <div className="space-y-1.5">
              <DocLinkRow label="Formato proveedor (formulario firmado)" onOpen={handleVerFormato} loading={abriendoFormato} />
              {revisiones?.map((doc) => (
                <DocLinkRow key={doc._id} label={doc.docLabel} estado={doc.estado} storageId={doc.storageId} inscripcionId={inscripcionId} />
              ))}
            </div>
          </div>

          <div className="border-t border-dashed border-slate-200" />

          {!showRechazo ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-4">
                <p className="text-sm leading-relaxed text-indigo-700">
                  Todos los documentos han sido revisados. Verifica el nivel de riesgo y la información del proveedor antes de tomar una decisión.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="observacionesAprobacion">
                  Observaciones de aprobación
                </Label>
                <Textarea
                  id="observacionesAprobacion"
                  value={observacionesAprobacion}
                  onChange={(e) => setObservacionesAprobacion(e.target.value)}
                  placeholder="Registra una observación para dejar trazabilidad..."
                  rows={3}
                  className="resize-none border-slate-200 bg-slate-50"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Motivos de rechazo</p>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="motivoProveedor">
                  Motivo para el proveedor
                  <span className="ml-1 text-[10px] font-normal normal-case text-slate-400">(visible externamente)</span>
                </Label>
                <Textarea id="motivoProveedor" value={motivoProveedor} onChange={(e) => setMotivoProveedor(e.target.value)} placeholder="Explica al proveedor el motivo del rechazo..." rows={3} className="resize-none border-slate-200 bg-slate-50" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="motivoInterno">
                  Motivo interno
                  <span className="ml-1 text-[10px] font-normal normal-case text-slate-400">(solo uso interno)</span>
                </Label>
                <Textarea id="motivoInterno" value={motivoInterno} onChange={(e) => setMotivoInterno(e.target.value)} placeholder="Detalla el motivo interno del rechazo..." rows={3} className="resize-none border-slate-200 bg-slate-50" />
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 border-t border-slate-100 bg-slate-50/60 px-6 py-4">
          {!showRechazo ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading} className="rounded-lg">
                Cancelar
              </Button>
              <Button variant="outline" className="rounded-lg border-red-200 text-red-700 hover:bg-red-50" onClick={() => setShowRechazo(true)} disabled={loading}>
                <X className="mr-1 h-4 w-4" />
                Rechazar
              </Button>
              <Button className="rounded-lg bg-indigo-600 text-white hover:bg-indigo-700" onClick={handleAprobar} disabled={loading}>
                {loading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}
                Aprobar
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
  );
}
