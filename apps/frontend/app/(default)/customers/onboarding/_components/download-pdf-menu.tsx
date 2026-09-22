"use client";

import { useState } from "react";
import { useConvex } from "convex/react";
import { FileDown, FileText, Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { DropdownMenuItem, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger } from "@/components/ui/dropdown-menu";
import { CIIU_ACTIVIDAD } from "@/lib/catalogs/ciiu";
import { getFormBranding } from "@/lib/onboarding/branding";
import { absoluteLogoUrl, renderFormularioClientePdfBlob } from "../pdf/formulario-pdf-cliente-data";
import { shortRef, toDateStr, toDateTimeStr, triggerDownload } from "./ui-config";

async function fetchNombreUsuario(userId: string | undefined): Promise<string | undefined> {
  if (!userId) return undefined;
  try {
    const res = await fetch(`/api/usuarios/${encodeURIComponent(userId)}`);
    if (!res.ok) return undefined;
    const data = (await res.json()) as { nombre?: string; name?: string };
    return data.nombre ?? data.name ?? undefined;
  } catch {
    return undefined;
  }
}

/** "Descargar PDF" submenu of the customer board: risk matrix and signed form. */
export default function DownloadPdfMenu({ inscripcionId }: { inscripcionId: Id<"onboardingClientes"> }) {
  const convex = useConvex();
  const [loadingMatriz, setLoadingMatriz] = useState(false);
  const [loadingFormulario, setLoadingFormulario] = useState(false);

  async function handleMatriz() {
    setLoadingMatriz(true);
    try {
      const [ins, fases] = await Promise.all([
        convex.query(api.onboarding.customers.obtenerInscripcionPorId, { inscripcionId }),
        convex.query(api.onboarding.customers.obtenerFasesDeInscripcion, { inscripcionId }),
      ]);
      if (!ins) {
        toast.error("No se encontró la inscripción");
        return;
      }
      // The risk review closes with Fase I (auto-completed by the responsable at process start).
      const faseI = fases.find((f) => f.fase === "I_ANALISIS_RIESGO" && f.estado === "COMPLETADO");
      const revisadoPorNombre = await fetchNombreUsuario(faseI?.completadoPor);
      const fechaRevisionCumplimiento = faseI?.fechaCompletado ? toDateTimeStr(faseI.fechaCompletado) : undefined;

      const { pdf } = await import("@react-pdf/renderer");
      const { default: MatrizRiesgoPdf } = await import("@/app/(default)/suppliers/onboarding/pdf/MatrizRiesgoPdf");
      const branding = getFormBranding(ins.empresa);
      const dg = ins.datos_generales_01;
      const m = ins.matriz_00;
      const a2 = ins.actividadEconomica_02;
      const codSec = a2?.codigoCiiuSecundario?.trim();
      const actSec = a2?.actividadEconomicaSecundaria?.trim() || (codSec ? CIIU_ACTIVIDAD[codSec] : undefined);

      const blob = await pdf(
        <MatrizRiesgoPdf
          data={{
            modulo: "customer",
            logoUrl: absoluteLogoUrl(branding.logoPdf),
            primaryColor: branding.color,
            empresaNombre: branding.nombre,
            revisadoPorNombre,
            fechaRevisionCumplimiento,
            tipoSolicitud: dg.tipoSolicitud ?? "INSCRIPCIÓN",
            razonSocial: dg.razonSocial ?? "—",
            tipoDocumento: dg.tipoDocumento ?? "—",
            numeroDocumento: dg.numeroDocumento ?? "—",
            tipoPersona: dg.tipoPersona ?? "PERSONA_JURIDICA",
            servicioSuministrado: m.servicioSuministrado ?? "—",
            montoAnual: m.montoAnual ?? "—",
            sectorEconomico: m.sectorEconomico ?? "—",
            actividadEconomicaPrincipal: a2?.actividadEconomica ?? (a2?.codigoCiiu ? (CIIU_ACTIVIDAD[a2.codigoCiiu] ?? "—") : "—"),
            codigoCiiu: a2?.codigoCiiu ?? "—",
            codigoCiiuSecundario: codSec || undefined,
            actividadEconomicaSecundaria: actSec || undefined,
            jurisdiccionNacional: m.jurisdiccionNacional ?? "—",
            jurisdiccionInternacional: m.jurisdiccionInternacional ?? "—",
            isPep: m.isPep ?? false,
            listas: m.listas ?? "—",
            riesgo: m.riesgo ?? "INDEFINIDO",
            tipoEvaluacion: ins.tipoEvaluacion ?? "INDEFINIDO",
            createdAt: toDateStr(ins._creationTime),
            inscripcionRef: shortRef(inscripcionId),
          }}
        />,
      ).toBlob();

      await triggerDownload(blob, `matriz-riesgo-cliente-${shortRef(inscripcionId)}.pdf`);
      toast.success("Matriz de riesgo descargada");
    } catch (e) {
      console.error(e);
      toast.error("Error al generar la matriz de riesgo");
    } finally {
      setLoadingMatriz(false);
    }
  }

  async function handleFormulario() {
    setLoadingFormulario(true);
    try {
      const ins = await convex.query(api.onboarding.customers.obtenerInscripcionPorId, { inscripcionId });
      if (!ins) {
        toast.error("No se encontró la inscripción");
        return;
      }
      const blob = await renderFormularioClientePdfBlob(ins);
      await triggerDownload(blob, `formulario-cliente-${shortRef(inscripcionId)}.pdf`);
      toast.success("Formulario del cliente descargado");
    } catch (e) {
      console.error(e);
      toast.error("Error al generar el formulario del cliente");
    } finally {
      setLoadingFormulario(false);
    }
  }

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="flex items-center gap-2">
        <FileDown className="h-4 w-4 text-slate-500" />
        <span>Descargar PDF</span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            void handleMatriz();
          }}
          disabled={loadingMatriz}
          className="flex items-center gap-2"
        >
          {loadingMatriz ? <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" /> : <ShieldAlert className="h-3.5 w-3.5 text-blue-600" />}
          <span>Matriz de Riesgo</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            void handleFormulario();
          }}
          disabled={loadingFormulario}
          className="flex items-center gap-2"
        >
          {loadingFormulario ? <Loader2 className="h-3.5 w-3.5 animate-spin text-green-600" /> : <FileText className="h-3.5 w-3.5 text-green-600" />}
          <span>Formulario Cliente</span>
        </DropdownMenuItem>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
