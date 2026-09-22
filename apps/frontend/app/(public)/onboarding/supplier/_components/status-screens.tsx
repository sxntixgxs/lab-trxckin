"use client";

import { Check } from "lucide-react";
import type { FormBranding } from "@/lib/onboarding/branding";
import { PublicShell, StatusCard } from "../../_components/public-shell";
import type { InscripcionPublica } from "./form-schema";

const TITULO = "Inscripción de Proveedores";
const SUBTITULO = "Estado de su proceso de inscripción.";

/** Screens for every phase in which the supplier has nothing to fill (I, IIA, IV, V, VI, terminal). */
export function StatusScreen({ inscripcion, branding, reciénEnviado = false }: { inscripcion: InscripcionPublica; branding: FormBranding; reciénEnviado?: boolean }) {
  const razonSocial = inscripcion.datos_generales_01.razonSocial;
  const fase = inscripcion.faseActual;

  let card: React.ReactNode;
  if (reciénEnviado && fase === "IIA_PENDIENTE_FIRMA") {
    card = (
      <StatusCard
        tone="primary"
        titulo="¡Formulario enviado!"
        descripcion="Sus datos han sido registrados exitosamente."
        razonSocial={razonSocial}
        icon={
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary-foreground">
            <Check className="h-8 w-8 text-primary" />
          </div>
        }
      >
        <p className="text-sm text-slate-600">
          Su formulario fue recibido correctamente. Se ha enviado una solicitud de firma al correo del representante legal declarado en el formulario. Una vez firmado, el
          equipo de Cumplimiento iniciará la revisión documental.
        </p>
      </StatusCard>
    );
  } else if (fase === "I_ANALISIS_RIESGO") {
    card = (
      <StatusCard tone="blue" titulo="Inscripción en revisión" descripcion="El equipo de Cumplimiento está analizando la información ingresada." razonSocial={razonSocial}>
        <p className="text-sm text-slate-600">Una vez completado el análisis de riesgo, recibirá una notificación y podrá completar el formulario de inscripción.</p>
      </StatusCard>
    );
  } else if (fase === "IIA_PENDIENTE_FIRMA") {
    const rlEmail = inscripcion.datos_generales_01.representanteLegalEmail;
    card = (
      <StatusCard tone="amber" titulo="Pendiente de firma" descripcion="El formulario fue enviado correctamente y está pendiente de firma por el representante legal." razonSocial={razonSocial}>
        <p className="text-sm text-slate-600">
          Se ha enviado una solicitud de firma al correo del representante legal{rlEmail ? ` (${rlEmail})` : ""} declarado en el formulario. Una vez firmado, el proceso continuará
          automáticamente.
        </p>
      </StatusCard>
    );
  } else if (fase === "IV_APROBADO_CUMPLIMIENTO") {
    card = (
      <StatusCard tone="indigo" titulo="En revisión por Cumplimiento" descripcion="Sus documentos fueron revisados y aprobados. El equipo de Cumplimiento está evaluando su inscripción." razonSocial={razonSocial}>
        <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3">
          <p className="text-sm leading-relaxed text-indigo-700">Una vez que Cumplimiento apruebe su expediente, el equipo de Compras procesará la evaluación final. Le notificaremos cuando haya novedades.</p>
        </div>
      </StatusCard>
    );
  } else if (fase === "COMPLETADO") {
    card = (
      <StatusCard tone="green" titulo="¡Inscripción Completada!" descripcion="Su empresa ha sido registrada exitosamente como proveedora." razonSocial={razonSocial} />
    );
  } else if (fase === "RECHAZADO") {
    card = (
      <StatusCard tone="red" titulo="Inscripción Rechazada" descripcion="Su inscripción no pudo ser completada." razonSocial={razonSocial}>
        {inscripcion.motivoRechazo && (
          <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-red-500">Motivo de rechazo</p>
            <p className="text-sm text-red-700">{inscripcion.motivoRechazo}</p>
          </div>
        )}
      </StatusCard>
    );
  } else if (fase === "ANULADA") {
    card = <StatusCard tone="slate" titulo="Proceso anulado" descripcion="Este proceso de inscripción fue anulado por la empresa." razonSocial={razonSocial} />;
  } else {
    const isEvaluacionCompras = fase === "V_EVALUACION_COMPRAS";
    card = (
      <StatusCard
        tone="orange"
        titulo={isEvaluacionCompras ? "En evaluación por Compras" : "Registro en curso"}
        descripcion={
          isEvaluacionCompras ? "Cumplimiento ha aprobado su expediente. El equipo de Compras está realizando la evaluación final." : "El equipo interno está completando el registro de su empresa."
        }
        razonSocial={razonSocial}
      >
        <p className="text-sm text-slate-500">Le notificaremos cuando el proceso sea completado.</p>
      </StatusCard>
    );
  }

  return (
    <PublicShell branding={branding} titulo={TITULO} subtitulo={SUBTITULO} center>
      {card}
    </PublicShell>
  );
}
