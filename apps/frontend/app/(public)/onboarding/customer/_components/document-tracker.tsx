"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { FileText, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import type { FormBranding } from "@/lib/onboarding/branding";
import { cn } from "@/lib/utils";
import { PublicShell } from "../../_components/public-shell";
import { getPublicErrorMessage, type DocumentoVerificado } from "../../_components/use-public-link";
import type { InscripcionPublica } from "./form-schema";

const ESTADO_CONFIG: Record<string, { label: string; badgeClass: string; borderClass: string }> = {
  PENDIENTE: { label: "Pendiente de carga", badgeClass: "bg-amber-50 text-amber-700 border border-amber-200", borderClass: "border-l-amber-400" },
  EN_REVISION: { label: "En revisión", badgeClass: "bg-blue-50 text-blue-700 border border-blue-200", borderClass: "border-l-blue-500" },
  APROBADO: { label: "Aprobado", badgeClass: "bg-green-50 text-green-700 border border-green-200", borderClass: "border-l-green-500" },
  RECHAZADO: { label: "Rechazado", badgeClass: "bg-red-50 text-red-700 border border-red-200", borderClass: "border-l-red-500" },
};

/** Fase III: the customer follows the review and uploads pending or rejected documents. */
export function DocumentTracker({ inscripcion, token, verificado, branding }: { inscripcion: InscripcionPublica; token: string; verificado: DocumentoVerificado; branding: FormBranding }) {
  const cargarDoc = useMutation(api.onboarding.customersPublic.cargarDocumentoRevision);
  const generateUploadUrl = useMutation(api.onboarding.customersPublic.generateUploadUrlPublico);
  const [recargando, setRecargando] = useState<Record<string, boolean>>({});

  const docs = inscripcion.revisiones;
  const aprobados = docs.filter((d) => d.estado === "APROBADO").length;
  const total = docs.length;

  async function handleRecargar(docKey: string, file: File) {
    if (file.type !== "application/pdf") {
      toast.error("Solo se permiten archivos PDF");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Máximo 10 MB");
      return;
    }
    setRecargando((p) => ({ ...p, [docKey]: true }));
    try {
      const uploadUrl = await generateUploadUrl({
        inscripcionId: inscripcion._id,
        token,
        tipoDocumento: verificado.tipoDocumento,
        numeroDocumento: verificado.numeroDocumento,
      });
      const res = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": file.type }, body: file });
      if (!res.ok) throw new Error("Error al subir el archivo");
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
      await cargarDoc({ inscripcionId: inscripcion._id, token, tipoDocumento: verificado.tipoDocumento, numeroDocumento: verificado.numeroDocumento, docKey, storageId });
      toast.success("Documento cargado correctamente. Queda en revisión.");
    } catch (e) {
      toast.error(getPublicErrorMessage(e, "Error al cargar documento"));
    } finally {
      setRecargando((p) => ({ ...p, [docKey]: false }));
    }
  }

  return (
    <PublicShell branding={branding} titulo="Inscripción de Clientes" subtitulo="Su formulario fue firmado. El equipo de Cumplimiento está revisando los documentos.">
      <div className="mx-auto w-full max-w-2xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Revisión Documental</h1>
          <p className="mt-1 text-sm text-slate-500">{inscripcion.datos_generales_01.razonSocial} — Cargue los documentos pendientes y siga el estado de la revisión.</p>
          {total > 0 && (
            <div className="mt-4 space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Progreso de aprobación</span>
                <span className="font-semibold text-slate-700">
                  {aprobados} / {total}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
                <div className="h-full rounded-full bg-green-500 transition-all duration-500" style={{ width: `${(aprobados / total) * 100}%` }} />
              </div>
            </div>
          )}
        </div>
        <div className="space-y-3">
          {docs.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 py-12 text-center">
              <p className="text-sm font-medium text-slate-500">No hay documentos registrados todavía.</p>
            </div>
          ) : (
            docs.map((doc) => {
              const cfg = ESTADO_CONFIG[doc.estado] ?? { label: doc.estado, badgeClass: "bg-slate-50 text-slate-700", borderClass: "" };
              const puedeCargar = doc.estado === "PENDIENTE" || doc.estado === "RECHAZADO";
              return (
                <div key={doc.docKey} className={cn("overflow-hidden rounded-xl border border-l-4 border-slate-200 bg-white", cfg.borderClass)}>
                  <div className="flex items-center justify-between gap-3 px-4 py-3.5">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                        <p className="truncate text-sm font-medium text-slate-800">{doc.docLabel}</p>
                      </div>
                      <span className={cn("mt-1.5 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold", cfg.badgeClass)}>{cfg.label}</span>
                    </div>
                    {puedeCargar && (
                      <div className="shrink-0">
                        <input
                          type="file"
                          accept="application/pdf"
                          id={`recargar-${doc.docKey}`}
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) void handleRecargar(doc.docKey, file);
                            e.target.value = "";
                          }}
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={recargando[doc.docKey]}
                          className={cn("rounded-lg", doc.estado === "RECHAZADO" ? "border-red-200 text-red-700 hover:bg-red-50" : "border-blue-200 text-blue-700 hover:bg-blue-50")}
                          onClick={() => document.getElementById(`recargar-${doc.docKey}`)?.click()}
                        >
                          {recargando[doc.docKey] ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-1 h-3.5 w-3.5" />}
                          {doc.estado === "PENDIENTE" ? "Cargar" : "Recargar"}
                        </Button>
                      </div>
                    )}
                  </div>
                  {doc.estado === "RECHAZADO" && doc.observaciones && (
                    <div className="border-t border-red-100 bg-red-50 px-4 py-2">
                      <p className="text-xs text-red-600">
                        <span className="font-semibold">Motivo:</span> {doc.observaciones}
                      </p>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </PublicShell>
  );
}
