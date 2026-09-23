"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Check, FileText, Loader2, PenLine } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { renderFormularioPdfBlob } from "@/app/(default)/suppliers/onboarding/pdf/formulario-pdf-data";
import { getFormBranding } from "@/lib/onboarding/branding";
import { DocumentoVerificacion } from "../../_components/documento-verificacion";
import { InvalidLinkScreen, LoadingScreen, PublicShell, StatusCard } from "../../_components/public-shell";
import { SignaturePad, type SignaturePadHandle } from "../../_components/signature-pad";
import { getPublicErrorMessage, useDocumentoVerificado, usePublicLink } from "../../_components/use-public-link";

const TITULO_FIRMA = "Firma del Representante Legal";
const TITULO_VISTA = "Formulario de inscripción";
const SUB_FIRMA = "Revise el formulario de inscripción y firme para continuar con el proceso.";
const SUB_VISTA = "Vista del formulario de inscripción del proveedor.";

const FASES_POSTERIORES: ReadonlySet<string> = new Set(["III_REVISION_DOCUMENTAL", "IV_APROBADO_CUMPLIMIENTO", "V_EVALUACION_COMPRAS", "VI_CREACION_CONTABILIDAD", "COMPLETADO"]);

function SignContent() {
  const link = usePublicLink();
  const inscripcion = useQuery(
    api.onboarding.suppliersPublic.obtenerInscripcionPublica,
    link ? { inscripcionId: link.id as Id<"onboardingProveedores">, token: link.token } : "skip",
  );
  const firmar = useMutation(api.onboarding.suppliersPublic.firmarFormularioRepresentante);
  const { verificado, setVerificado } = useDocumentoVerificado(link?.id ?? null);

  const sigRef = useRef<SignaturePadHandle>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [signing, setSigning] = useState(false);
  const [signed, setSigned] = useState<{ razonSocial: string; empresa: number } | null>(null);

  const fallbackBranding = getFormBranding(null);

  // PDF preview (regenerated when the inscription changes, e.g. after signing).
  useEffect(() => {
    if (!inscripcion) return;
    let cancelled = false;
    setLoadingPdf(true);
    (async () => {
      try {
        const blob = await renderFormularioPdfBlob(inscripcion);
        if (cancelled) return;
        setPdfUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(blob);
        });
      } catch (e) {
        console.error("Error generando PDF:", e);
        toast.error("Error al generar la vista previa del formulario");
      } finally {
        if (!cancelled) setLoadingPdf(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [inscripcion]);

  async function handleFirmar() {
    if (!link || !inscripcion || !verificado) return;
    setSigning(true);
    try {
      const firmaDataUrl = await sigRef.current?.toPngDataUrl();
      if (!firmaDataUrl) {
        toast.error("Por favor dibuje su firma antes de continuar.");
        return;
      }
      await firmar({
        inscripcionId: inscripcion._id,
        token: link.token,
        tipoDocumento: verificado.tipoDocumento,
        numeroDocumento: verificado.numeroDocumento,
        firmaDataUrl,
      });
      // The SIGN token is consumed by the mutation: keep what the success screen needs.
      setSigned({ razonSocial: inscripcion.datos_generales_01.razonSocial, empresa: inscripcion.empresa });
    } catch (e) {
      toast.error(getPublicErrorMessage(e, "Error al registrar la firma."));
    } finally {
      setSigning(false);
    }
  }

  if (signed) {
    const branding = getFormBranding(signed.empresa);
    return (
      <PublicShell branding={branding} titulo={TITULO_FIRMA} subtitulo={SUB_FIRMA} center>
        <StatusCard
          tone="green"
          titulo="¡Formulario firmado!"
          descripcion="Su firma ha sido registrada exitosamente."
          razonSocial={signed.razonSocial}
          icon={
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white">
              <Check className="h-8 w-8 text-green-600" />
            </div>
          }
        >
          <p className="text-sm text-slate-600">
            El proceso de inscripción ha avanzado a la revisión documental. El equipo de Cumplimiento se pondrá en contacto si se requiere información adicional.
          </p>
        </StatusCard>
      </PublicShell>
    );
  }

  if (!link) return <InvalidLinkScreen branding={fallbackBranding} titulo={TITULO_FIRMA} subtitulo={SUB_FIRMA} motivo="El enlace no contiene los datos necesarios. Abra el enlace tal como llegó en el correo." />;
  if (inscripcion === undefined) return <LoadingScreen branding={fallbackBranding} titulo={TITULO_FIRMA} subtitulo={SUB_FIRMA} mensaje="Cargando formulario..." />;
  if (inscripcion === null) return <InvalidLinkScreen branding={fallbackBranding} titulo={TITULO_FIRMA} subtitulo={SUB_FIRMA} />;

  const branding = getFormBranding(inscripcion.empresa);
  // Internal viewers (read-only token) and suppliers following their form link only see the PDF.
  const soloVista = inscripcion.acceso.viewOnly || inscripcion.acceso.scope !== "SIGN";
  const dg = inscripcion.datos_generales_01;

  if (!soloVista && inscripcion.faseActual !== "IIA_PENDIENTE_FIRMA") {
    const esFirmada = FASES_POSTERIORES.has(inscripcion.faseActual);
    return (
      <PublicShell branding={branding} titulo={TITULO_FIRMA} subtitulo={SUB_FIRMA} center>
        <StatusCard
          tone={esFirmada ? "green" : "slate"}
          titulo={esFirmada ? "Formulario ya firmado" : "Formulario no disponible para firma"}
          descripcion={esFirmada ? "Este formulario ya fue firmado. El proceso ha continuado a la siguiente etapa." : "El formulario aún no ha sido enviado por el proveedor o el proceso cambió de estado."}
          razonSocial={dg.razonSocial}
        />
      </PublicShell>
    );
  }

  // Like the form, signing first asks for the document the company registered; the server
  // re-checks the same pair.
  if (!soloVista && !verificado) {
    return (
      <PublicShell branding={branding} titulo={TITULO_FIRMA} subtitulo={SUB_FIRMA} center>
        <DocumentoVerificacion
          branding={branding}
          titulo={TITULO_FIRMA}
          descripcion={SUB_FIRMA}
          esperado={{ tipoDocumento: dg.tipoDocumento, numeroDocumento: dg.numeroDocumento }}
          onVerificado={setVerificado}
        />
      </PublicShell>
    );
  }

  return (
    <PublicShell branding={branding} titulo={soloVista ? TITULO_VISTA : TITULO_FIRMA} subtitulo={soloVista ? SUB_VISTA : SUB_FIRMA}>
      <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8">
        {!soloVista && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100">
                <PenLine className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-amber-900">Firma requerida</p>
                <p className="mt-0.5 text-sm text-amber-700">
                  El formulario de inscripción de <strong>{dg.razonSocial}</strong> ({dg.tipoDocumento} {dg.numeroDocumento}) requiere su firma como representante legal para continuar.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
          <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3">
            <FileText className="h-4 w-4 text-slate-500" />
            <span className="text-sm font-semibold text-slate-700">{soloVista ? "Formulario de inscripción" : "Vista previa del formulario"}</span>
          </div>
          <div className="bg-slate-100" style={{ minHeight: 500 }}>
            {loadingPdf || !pdfUrl ? (
              <div className="flex h-[500px] items-center justify-center gap-3">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                <span className="text-sm text-slate-500">Generando vista previa...</span>
              </div>
            ) : (
              <iframe src={pdfUrl} className="w-full border-0" style={{ height: 600 }} title="Formulario de inscripción" />
            )}
          </div>
        </div>

        {!soloVista && (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
            <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3">
              <PenLine className="h-4 w-4 text-slate-500" />
              <span className="text-sm font-semibold text-slate-700">Firma del representante legal</span>
            </div>
            <div className="space-y-4 p-5">
              <p className="text-sm text-slate-600">Al firmar, confirma que ha revisado el contenido del formulario y que la información suministrada es veraz y completa.</p>
              <SignaturePad ref={sigRef} />
              <p className="text-center text-[11px] text-slate-400">Dibuje su firma con el mouse o con el dedo en dispositivos táctiles</p>
              <div className="flex items-center justify-between gap-3">
                <button type="button" onClick={() => sigRef.current?.clear()} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50">
                  Limpiar firma
                </button>
                <button
                  type="button"
                  onClick={handleFirmar}
                  disabled={signing || loadingPdf}
                  className="flex items-center gap-2 rounded-lg bg-green-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-60"
                >
                  {signing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Registrando firma...
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4" /> Firmar formulario
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </PublicShell>
  );
}

export default function SupplierSignPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-50">
          <Loader2 className="h-10 w-10 animate-spin text-slate-400" />
        </div>
      }
    >
      <SignContent />
    </Suspense>
  );
}
