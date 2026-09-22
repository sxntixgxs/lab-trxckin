"use client";

import { Check, FileText, Loader2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FormBranding } from "@/lib/onboarding/branding";
import { hasComplianceLinks } from "@/lib/onboarding/branding";
import { CUSTOMER_DECLARACIONES } from "@/lib/onboarding/declaraciones/customers";
import { SUPPLIER_DECLARACIONES } from "@/lib/onboarding/declaraciones/suppliers";
import type { OnboardingModulo } from "@/lib/onboarding/roles";
import { Section, SectionHeader } from "./form-ui";

export type DocUploadState = { file: File; storageId?: string; uploading: boolean };

export type DocumentoRequerido = { docKey: string; docLabel: string };

/** Documentos requeridos (PDF ≤ 10 MB, uno por documento). Última sección de ambos formularios. */
export function SeccionDocumentos({
  register,
  index = 10,
  step = "11",
  tipoEvaluacion,
  documentos,
  subidos,
  uploads,
  onUpload,
  onRemove,
}: {
  register: (index: number, el: HTMLElement | null) => void;
  /** Position of the section in the stepper (0-based) and its visible number. */
  index?: number;
  step?: string;
  tipoEvaluacion: string;
  documentos: DocumentoRequerido[];
  /** docKey → storageId already saved on the server. */
  subidos: Record<string, string | undefined>;
  uploads: Record<string, DocUploadState>;
  onUpload: (docKey: string, file: File) => void;
  onRemove: (docKey: string) => void;
}) {
  return (
    <Section index={index} register={register}>
      <SectionHeader
        step={step}
        title="Documentos requeridos"
        icon={FileText}
        description={
          documentos.length > 0
            ? `Según su tipo de evaluación (${tipoEvaluacion}), adjunte los siguientes documentos en PDF.`
            : "No se requieren documentos adicionales según su perfil de riesgo actual."
        }
      />
      {documentos.length > 0 && (
        <div className="space-y-4">
          {documentos.map((doc) => {
            const upload = uploads[doc.docKey];
            const hasDoc = upload?.storageId ?? subidos[doc.docKey];
            const inputId = `doc-${doc.docKey}`;
            return (
              <div key={doc.docKey} className="flex flex-col gap-2 rounded-xl border border-slate-100 bg-slate-50/50 p-4">
                <label htmlFor={inputId} className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                  {doc.docLabel}
                </label>
                <input
                  id={inputId}
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) onUpload(doc.docKey, file);
                    e.target.value = "";
                  }}
                />
                {upload ? (
                  <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
                    <FileText className="h-5 w-5 shrink-0 text-primary" />
                    <span className="flex-1 truncate text-sm text-slate-700">{upload.file.name}</span>
                    {upload.uploading ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" /> : upload.storageId ? <span className="text-xs text-emerald-600">Cargado</span> : null}
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => onRemove(doc.docKey)} disabled={upload.uploading}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : hasDoc ? (
                  <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
                    <FileText className="h-5 w-5 shrink-0 text-primary" />
                    <span className="flex-1 text-sm text-slate-700">Documento cargado</span>
                    <span className="text-xs text-emerald-600">Cargado</span>
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => document.getElementById(inputId)?.click()} title="Reemplazar">
                      <Upload className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => document.getElementById(inputId)?.click()}>
                    <Upload className="mr-2 h-4 w-4" />
                    Cargar PDF
                  </Button>
                )}
              </div>
            );
          })}
          <p className="text-xs text-slate-500">Máximo 10 MB por archivo. Formatos permitidos: PDF.</p>
        </div>
      )}
    </Section>
  );
}

/** Declaraciones, tratamiento de datos y botón de envío. */
export function DeclaracionesYEnvio({
  branding,
  submitting,
  disabled,
  onSubmit,
  modulo = "supplier",
}: {
  branding: FormBranding;
  submitting: boolean;
  disabled: boolean;
  onSubmit: () => void;
  modulo?: OnboardingModulo;
}) {
  const empresa = { nombre: branding.nombre, nit: branding.nit, web: branding.web, emailProteccionDatos: branding.emailProteccionDatos };
  const dec = modulo === "customer" ? CUSTOMER_DECLARACIONES(empresa) : SUPPLIER_DECLARACIONES(empresa);
  const line = <div className="h-px flex-1" style={{ backgroundColor: `${branding.color}99` }} />;
  const compliance = branding.compliance;
  return (
    <>
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs sm:p-8">
        <h3 className="mb-1 text-base font-bold text-slate-900">Declaraciones y tratamiento de datos</h3>
        <p className="mb-6 text-xs text-slate-500">Al enviar este formulario usted declara y acepta lo siguiente:</p>
        <div className="space-y-8">
          <div>
            <div className="mb-3 flex items-center gap-3">
              <span className="text-sm font-bold text-slate-900">{dec.ORIGEN_FONDOS.titulo}</span>
              {line}
            </div>
            <p className="mb-2 text-xs font-semibold text-slate-700">{dec.ORIGEN_FONDOS.subtitulo}</p>
            <ol className="list-inside list-decimal space-y-2 text-xs leading-relaxed text-slate-600">
              {dec.ORIGEN_FONDOS.puntos.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ol>
          </div>
          <div>
            <div className="mb-3 flex items-center gap-3">
              <span className="text-sm font-bold text-slate-900">{dec.ACTUALIZACION.titulo}</span>
              {line}
            </div>
            <p className="text-xs leading-relaxed text-slate-600">{dec.ACTUALIZACION.texto}</p>
          </div>
          <div>
            <div className="mb-3 flex items-center gap-3">
              <span className="text-sm font-bold text-slate-900">{dec.TRATAMIENTO_DATOS.titulo}</span>
              {line}
            </div>
            <p className="mb-3 text-xs leading-relaxed text-slate-600">{dec.TRATAMIENTO_DATOS.declaracion}</p>
            <p className="mb-2 text-xs leading-relaxed text-slate-600">{dec.TRATAMIENTO_DATOS.consentimiento}</p>
            <ol className="mb-3 list-inside list-decimal space-y-1 text-xs leading-relaxed text-slate-600">
              {dec.TRATAMIENTO_DATOS.finalidades.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ol>
            <p className="text-xs leading-relaxed text-slate-600">{dec.TRATAMIENTO_DATOS.derechos}</p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-primary/20 bg-primary/5 p-6">
        <p className="mb-4 text-sm text-slate-600">
          Al enviar este formulario, confirma que ha leído las declaraciones anteriores
          {hasComplianceLinks(branding) && compliance ? (
            <>
              , que ha leído y acepta{" "}
              {compliance.etica && (
                <a href={compliance.etica} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  el código de ética
                </a>
              )}
              {compliance.sagrilaft && (
                <>
                  {compliance.etica ? ", " : " "}
                  <a href={compliance.sagrilaft} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    el manual SAGRILAFT
                  </a>
                </>
              )}
              {compliance.ptee && (
                <>
                  {" y "}
                  <a href={compliance.ptee} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    el manual PTEE
                  </a>
                </>
              )}
            </>
          ) : null}{" "}
          y que la información suministrada es veraz y completa. Sus documentos serán enviados al equipo de Cumplimiento para revisión.
        </p>
        <p className="mb-4 text-sm text-slate-600">
          Se reconoce y acepta que las firmas electrónicas, digitales o diferentes a la manuscrita, plasmadas en el presente documento son confiables y vinculantes para
          obligarlas legal y contractualmente en relación con su contenido y tienen la misma validez y los mismos efectos jurídicos de la firma manuscrita.
        </p>
        {disabled && !submitting && <p className="mb-3 text-xs font-medium text-amber-700">Cargue todos los documentos requeridos para habilitar el envío.</p>}
        <button
          type="button"
          disabled={submitting || disabled}
          onClick={onSubmit}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60 sm:w-auto sm:min-w-[200px]"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Enviando...
            </>
          ) : (
            <>
              <Check className="h-4 w-4" /> Enviar formulario para revisión
            </>
          )}
        </button>
      </div>
    </>
  );
}
