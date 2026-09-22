"use client";

import { Suspense, useState } from "react";
import { useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getFormBranding } from "@/lib/onboarding/branding";
import { DocumentoVerificacion } from "../_components/documento-verificacion";
import { InvalidLinkScreen, LoadingScreen, PublicShell } from "../_components/public-shell";
import { useDocumentoVerificado, usePublicLink } from "../_components/use-public-link";
import { CustomerForm } from "./_components/customer-form";
import { DocumentTracker } from "./_components/document-tracker";
import { StatusScreen } from "./_components/status-screens";

const TITULO = "Inscripción de Clientes";
const SUBTITULO = "Complete el formulario y adjunte los documentos solicitados para su inscripción como cliente.";

function CustomerOnboardingContent() {
  const link = usePublicLink();
  const inscripcion = useQuery(api.onboarding.customersPublic.obtenerInscripcionPublica, link ? { inscripcionId: link.id as Id<"onboardingClientes">, token: link.token } : "skip");
  const { verificado, setVerificado } = useDocumentoVerificado(link?.id ?? null);
  const [reciénEnviado, setReciénEnviado] = useState(false);

  const fallbackBranding = getFormBranding(null);

  if (!link) return <InvalidLinkScreen branding={fallbackBranding} titulo={TITULO} subtitulo={SUBTITULO} motivo="El enlace no contiene los datos necesarios. Abra el enlace tal como llegó en el correo." />;
  if (inscripcion === undefined) return <LoadingScreen branding={fallbackBranding} titulo={TITULO} subtitulo={SUBTITULO} />;
  if (inscripcion === null) return <InvalidLinkScreen branding={fallbackBranding} titulo={TITULO} subtitulo={SUBTITULO} />;

  const branding = getFormBranding(inscripcion.empresa);
  const fase = inscripcion.faseActual;
  const esperado = { tipoDocumento: inscripcion.datos_generales_01.tipoDocumento, numeroDocumento: inscripcion.datos_generales_01.numeroDocumento };

  // Phases in which the customer acts (fill / upload) require the document confirmation first.
  const requiereVerificacion = (fase === "II_PENDIENTE_FORMULARIO" || fase === "III_REVISION_DOCUMENTAL") && !inscripcion.acceso.viewOnly;
  if (requiereVerificacion && !verificado) {
    return (
      <PublicShell branding={branding} titulo={TITULO} subtitulo={SUBTITULO} center>
        <DocumentoVerificacion branding={branding} titulo="Formulario de Inscripción" descripcion={`Complete sus datos para registrarse como cliente de ${branding.nombre}.`} esperado={esperado} onVerificado={setVerificado} />
      </PublicShell>
    );
  }

  if (fase === "II_PENDIENTE_FORMULARIO" && verificado && !inscripcion.acceso.viewOnly) {
    return <CustomerForm inscripcion={inscripcion} token={link.token} verificado={verificado} branding={branding} onSubmitted={() => setReciénEnviado(true)} />;
  }
  if (fase === "III_REVISION_DOCUMENTAL" && verificado && !inscripcion.acceso.viewOnly) {
    return <DocumentTracker inscripcion={inscripcion} token={link.token} verificado={verificado} branding={branding} />;
  }
  return <StatusScreen inscripcion={inscripcion} branding={branding} reciénEnviado={reciénEnviado} />;
}

export default function CustomerOnboardingPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-50">
          <Loader2 className="h-10 w-10 animate-spin text-slate-400" />
        </div>
      }
    >
      <CustomerOnboardingContent />
    </Suspense>
  );
}
