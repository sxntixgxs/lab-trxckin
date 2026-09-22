"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "convex/react";
import { AlertCircle, Check, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Form } from "@/components/ui/form";
import type { FormBranding } from "@/lib/onboarding/branding";
import { cn } from "@/lib/utils";
import { PublicFooter, PublicHeader, brandingVars, type AutosaveStatus } from "../../_components/public-shell";
import { getPublicErrorMessage, type DocumentoVerificado } from "../../_components/use-public-link";
import {
  buildSectionsPayload,
  collectErrorPaths,
  DEFAULT_FORM_VALUES,
  FIELD_SECTION,
  formSchema,
  normalizeCondicionesPago,
  STEPS,
  toFormValues,
  TRIBUTARIA_FIELD_LABELS,
  type FormValues,
  type InscripcionPublica,
} from "./form-schema";
import { SeccionAccionaria } from "./section-accionaria";
import { DeclaracionesYEnvio, SeccionDocumentos, type DocUploadState } from "./section-documentos";
import { SeccionTributaria } from "./section-tributaria";
import { SeccionAdicionales, SeccionBancaria, SeccionCondicionesPago, SeccionContactos, SeccionReferencias } from "./sections-comerciales";
import { SeccionActividad, SeccionConflicto, SeccionDatosGenerales } from "./sections-generales";

const AUTOSAVE_DELAY_MS = 1500;
const MAX_PDF_BYTES = 10 * 1024 * 1024;

/**
 * Fase II: the 11-section supplier form with autosave, required documents and submit.
 * Every write carries the link token plus the verified document pair (server double-checks).
 */
export function SupplierForm({
  inscripcion,
  token,
  verificado,
  branding,
  onSubmitted,
}: {
  inscripcion: InscripcionPublica;
  token: string;
  verificado: DocumentoVerificado;
  branding: FormBranding;
  onSubmitted: () => void;
}) {
  const actualizar = useMutation(api.onboarding.suppliersPublic.actualizarInscripcion);
  const enviarFormulario = useMutation(api.onboarding.suppliersPublic.enviarFormulario);
  const generateUploadUrl = useMutation(api.onboarding.suppliersPublic.generateUploadUrlPublico);

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [activeStep, setActiveStep] = useState(0);
  const [docUploads, setDocUploads] = useState<Record<string, DocUploadState>>({});
  const [autosave, setAutosave] = useState<AutosaveStatus>("oculto");
  const sectionRefs = useRef<(HTMLElement | null)[]>([]);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema) as Resolver<FormValues>,
    defaultValues: DEFAULT_FORM_VALUES,
  });

  const registerSection = useCallback((index: number, el: HTMLElement | null) => {
    sectionRefs.current[index] = el;
  }, []);

  // Load the saved draft once per inscription.
  const lastResetId = useRef<string | null>(null);
  useEffect(() => {
    if (lastResetId.current === inscripcion._id) return;
    lastResetId.current = inscripcion._id;
    form.reset(toFormValues(inscripcion));
  }, [inscripcion, form]);

  // Keep condiciones de pago coherent (Contado ⇒ NA).
  const condForma = form.watch("condicionesPago_12.formaPago");
  const condPlazo = form.watch("condicionesPago_12.plazo");
  useEffect(() => {
    const fixed = normalizeCondicionesPago({ formaPago: condForma, plazo: condPlazo });
    if (fixed.formaPago !== condForma || fixed.plazo !== condPlazo) form.setValue("condicionesPago_12", fixed, { shouldValidate: true, shouldDirty: true });
  }, [condForma, condPlazo, form]);

  // Active section via IntersectionObserver.
  useEffect(() => {
    const observers: IntersectionObserver[] = [];
    sectionRefs.current.forEach((el, i) => {
      if (!el) return;
      const obs = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) setActiveStep(i);
        },
        { rootMargin: "-30% 0px -60% 0px" },
      );
      obs.observe(el);
      observers.push(obs);
    });
    return () => observers.forEach((o) => o.disconnect());
  }, []);

  const identidad = { inscripcionId: inscripcion._id, token, tipoDocumento: verificado.tipoDocumento, numeroDocumento: verificado.numeroDocumento };

  // Autosave: 1.5 s of silence after any change.
  useEffect(() => {
    const { unsubscribe } = form.watch(() => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
      setAutosave("saving");
      autosaveTimer.current = setTimeout(async () => {
        try {
          await actualizar({ ...identidad, ...buildSectionsPayload(form.getValues()) });
          setAutosave("saved");
          setTimeout(() => setAutosave("oculto"), 2000);
        } catch (err) {
          console.error("[auto-save]", err);
          setAutosave("oculto");
        }
      }, AUTOSAVE_DELAY_MS);
    });
    return () => {
      unsubscribe();
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inscripcion._id, token, verificado.tipoDocumento, verificado.numeroDocumento]);

  async function uploadPdf(file: File): Promise<Id<"_storage">> {
    const uploadUrl = await generateUploadUrl({ inscripcionId: inscripcion._id, token });
    const res = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": file.type }, body: file });
    if (!res.ok) throw new Error("Error al subir el archivo");
    const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
    return storageId;
  }

  async function handleDocUpload(docKey: string, file: File) {
    if (file.type !== "application/pdf") {
      toast.error("Solo se permiten archivos PDF");
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      toast.error("El archivo no puede superar 10 MB");
      return;
    }
    setDocUploads((prev) => ({ ...prev, [docKey]: { file, uploading: true } }));
    try {
      const storageId = await uploadPdf(file);
      setDocUploads((prev) => ({ ...prev, [docKey]: { file, storageId, uploading: false } }));
      // Persist right away so a reload keeps the document.
      await actualizar({ ...identidad, documentos_15: { [docKey]: storageId } });
      toast.success("Documento cargado correctamente");
    } catch (err) {
      setDocUploads((prev) => {
        const next = { ...prev };
        delete next[docKey];
        return next;
      });
      toast.error(getPublicErrorMessage(err, "Error al subir el documento. Intente de nuevo."));
    }
  }

  function removeDoc(docKey: string) {
    setDocUploads((prev) => {
      const next = { ...prev };
      delete next[docKey];
      return next;
    });
  }

  const handleSubmit = form.handleSubmit(
    async (values) => {
      setSubmitError(null);
      try {
        const documentos_15: Record<string, Id<"_storage">> = {};
        for (const [key, v] of Object.entries(docUploads)) if (v.storageId) documentos_15[key] = v.storageId as Id<"_storage">;
        await actualizar({ ...identidad, ...buildSectionsPayload(values), documentos_15 });
        await enviarFormulario(identidad);
        onSubmitted();
      } catch (err) {
        setSubmitError(getPublicErrorMessage(err, "Error al enviar el formulario."));
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    },
    (errors) => {
      const firstKey = Object.keys(errors)[0];
      const sectionIdx = FIELD_SECTION[firstKey] ?? 0;
      sectionRefs.current[sectionIdx]?.scrollIntoView({ behavior: "smooth", block: "start" });
      const sectionLabel = STEPS[sectionIdx]?.label ?? firstKey;
      if (firstKey === "infoTributaria_04") {
        const leaves = collectErrorPaths((errors as Record<string, unknown>).infoTributaria_04);
        if (leaves.length > 0) {
          const shown = leaves.slice(0, 5);
          const extra = leaves.length - shown.length;
          toast.error(`Revisa "${sectionLabel}"`, {
            description: (
              <ul className="list-disc space-y-0.5 pl-4">
                {shown.map((l) => (
                  <li key={l.path}>
                    <span className="font-medium">{TRIBUTARIA_FIELD_LABELS[l.path] ?? l.path}</span>
                    {l.message ? <span className="text-slate-500"> — {l.message}</span> : null}
                  </li>
                ))}
                {extra > 0 ? <li className="text-slate-500">…y {extra} campo(s) más</li> : null}
              </ul>
            ),
            duration: 8000,
          });
          return;
        }
      }
      toast.error(`Revisa la sección "${sectionLabel}" antes de continuar`);
    },
  );

  const documentosRequeridos = inscripcion.documentosRequeridos.map((d) => ({ docKey: d.docKey, docLabel: d.docLabel }));
  const faltanDocumentos = documentosRequeridos.some((doc) => {
    const upload = docUploads[doc.docKey];
    if (upload?.uploading) return true;
    return !(upload?.storageId ?? inscripcion.documentos[doc.docKey]);
  });

  const scrollTo = (i: number) => sectionRefs.current[i]?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900" style={brandingVars(branding)}>
      <PublicHeader
        branding={branding}
        titulo="Inscripción de Proveedores"
        subtitulo="Complete todos los campos requeridos y adjunte los documentos solicitados para iniciar su proceso de inscripción como proveedor."
        autosave={autosave}
      />

      <div className="flex overflow-x-auto border-b border-slate-200 bg-white sm:hidden">
        {STEPS.map((step, i) => (
          <button
            key={step.id}
            type="button"
            onClick={() => scrollTo(i)}
            className={cn("flex shrink-0 flex-col items-center gap-1 px-4 py-3 text-xs font-medium transition-colors", activeStep === i ? "border-b-2 border-primary text-primary" : "text-slate-400")}
          >
            <span>{step.id}</span>
          </button>
        ))}
      </div>

      <div className="mx-auto flex w-full max-w-7xl flex-1 gap-0 px-4 py-8 sm:px-6 lg:gap-8">
        <aside className="hidden lg:block">
          <div className="sticky top-20 w-56 shrink-0">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">Secciones</p>
            <nav className="space-y-0.5">
              {STEPS.map((step, i) => {
                const Icon = step.icon;
                return (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => scrollTo(i)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
                      activeStep === i ? "bg-primary font-semibold text-primary-foreground" : "text-slate-600 hover:bg-slate-100",
                    )}
                  >
                    <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[10px] font-bold", activeStep === i ? "bg-primary-foreground text-primary" : "bg-slate-200 text-slate-500")}>
                      {step.id}
                    </span>
                    <span className="truncate">{step.label}</span>
                    {activeStep > i && <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-primary" />}
                    <Icon className="sr-only" />
                  </button>
                );
              })}
            </nav>
            {branding.contactEmail && (
              <div className="mt-6 rounded-xl border border-primary/20 bg-primary/5 px-4 py-4">
                <p className="text-xs font-semibold text-primary">¿Necesita ayuda?</p>
                <p className="mt-1 text-xs text-slate-500">Contacte al área de Compras ({branding.contactEmail}) para soporte con el formulario.</p>
              </div>
            )}
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <div className="mb-8">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span>{branding.nombreCorto}</span>
              <ChevronRight className="h-3 w-3" />
              <span>Inscripción de Proveedores</span>
            </div>
            <h1 className="mt-2 text-2xl font-bold text-slate-900 sm:text-3xl">{inscripcion.datos_generales_01.razonSocial ?? "Completar inscripción"}</h1>
            <p className="mt-1 text-sm text-slate-500">Complete todos los campos requeridos para finalizar su proceso de inscripción.</p>
          </div>

          {submitError && (
            <div className="mb-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
              <p className="text-sm text-red-700">{submitError}</p>
            </div>
          )}

          <Form {...form}>
            <form onSubmit={handleSubmit} className="space-y-6">
              <SeccionDatosGenerales form={form} register={registerSection} branding={branding} />
              <SeccionActividad form={form} register={registerSection} branding={branding} />
              <SeccionConflicto form={form} register={registerSection} branding={branding} />
              <SeccionTributaria form={form} register={registerSection} branding={branding} />
              <SeccionAccionaria form={form} register={registerSection} />
              <SeccionContactos form={form} register={registerSection} />
              <SeccionBancaria form={form} register={registerSection} />
              <SeccionReferencias form={form} register={registerSection} />
              <SeccionCondicionesPago form={form} register={registerSection} />
              <SeccionAdicionales form={form} register={registerSection} />
              <SeccionDocumentos
                register={registerSection}
                tipoEvaluacion={inscripcion.tipoEvaluacion_14 ?? "—"}
                documentos={documentosRequeridos}
                subidos={inscripcion.documentos}
                uploads={docUploads}
                onUpload={handleDocUpload}
                onRemove={removeDoc}
              />
              <DeclaracionesYEnvio branding={branding} submitting={form.formState.isSubmitting} disabled={faltanDocumentos} onSubmit={() => void handleSubmit()} />
            </form>
          </Form>
        </main>
      </div>

      <PublicFooter branding={branding} />
    </div>
  );
}
