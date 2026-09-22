// Browser-only helpers that build the PDFs attached to the customer closing emails.
import type { Doc } from "@/convex/_generated/dataModel";
import { getFormBranding } from "@/lib/onboarding/branding";

export type FaseCustomerEmail = {
  fase: string;
  estado: string;
  fechaInicio?: number;
  fechaCompletado?: number;
};

/** Signed inscription form, attached to every closing email. */
export async function generateFormularioClienteEmailPdf(ins: Doc<"onboardingClientes">): Promise<{ formulario: Blob; ref: string }> {
  const { renderFormularioClientePdfBlob, shortRef } = await import("@/app/(default)/customers/onboarding/pdf/formulario-pdf-cliente-data");
  return { formulario: await renderFormularioClientePdfBlob(ins), ref: shortRef(ins._id) };
}

/**
 * PDF with the time spent on each phase. Attached to the closing email for the Financiero role.
 * Fase IV is presented as completed at `fechaCierre` because the caller runs right after
 * `completarFaseIV` (the subscription may not have refreshed yet).
 */
export async function generateReporteTiempoFasesClienteEmailPdf(
  ins: Doc<"onboardingClientes">,
  fases: FaseCustomerEmail[],
  ctx: { fechaCierre: number },
): Promise<{ reporte: Blob; ref: string }> {
  const ref = ins._id.slice(-8).toUpperCase();
  const { pdf } = await import("@react-pdf/renderer");
  const { default: ReporteTiempoFasesPdf } = await import("@/app/(default)/suppliers/onboarding/pdf/ReporteTiempoFasesPdf");

  const branding = getFormBranding(ins.empresa);
  const dg = ins.datos_generales_01;
  const fasesVisibles = fases.map((fase) =>
    fase.fase !== "IV_CREACION_CONTABILIDAD"
      ? { fase: fase.fase, estado: fase.estado, fechaInicio: fase.fechaInicio ?? null, fechaCompletado: fase.fechaCompletado ?? null }
      : { fase: fase.fase, estado: "COMPLETADO", fechaInicio: fase.fechaInicio ?? ctx.fechaCierre, fechaCompletado: ctx.fechaCierre },
  );
  if (!fasesVisibles.some((fase) => fase.fase === "IV_CREACION_CONTABILIDAD")) {
    fasesVisibles.push({ fase: "IV_CREACION_CONTABILIDAD", estado: "COMPLETADO", fechaInicio: ctx.fechaCierre, fechaCompletado: ctx.fechaCierre });
  }

  const reporte = await pdf(
    <ReporteTiempoFasesPdf
      data={{
        modulo: "customer",
        empresaNombre: branding.nombre,
        inscripcionRef: ref,
        generadoEn: ctx.fechaCierre,
        tipoSolicitud: dg.tipoSolicitud ?? "INSCRIPCIÓN",
        tipoDocumento: dg.tipoDocumento ?? "",
        numeroDocumento: dg.numeroDocumento ?? "",
        razonSocial: dg.razonSocial ?? "",
        riesgo: ins.matriz_00.riesgo ?? "INDEFINIDO",
        estadoFinal: "COMPLETADO",
        fechaInicioProceso: ins._creationTime,
        fechaCierre: ctx.fechaCierre,
        fases: fasesVisibles,
      }}
    />,
  ).toBlob();

  return { reporte, ref };
}
