"use client";

import { useState } from "react";
import { useConvex } from "convex/react";
import { ClipboardList, FileDown, FileText, Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger } from "@/components/ui/dropdown-menu";
import { actividadSecundariaDesdeMatrizProveedor } from "@/lib/catalogs/ciiu";
import { getFormBranding } from "@/lib/onboarding/branding";
import { calcularEvaluacionCompras, CRITERIOS_COMPRAS, etiquetaValorCriterioCompras, obtenerValoresEvaluacionCompras } from "@/lib/onboarding/evaluacion-compras";
import { absoluteLogoUrl, renderFormularioPdfBlob } from "../pdf/formulario-pdf-data";
import { shortRef, SUPPLIER_MODULO, toDateStr, toDateTimeStr, triggerDownload } from "./ui-config";

interface Props {
  inscripcionId: Id<"onboardingProveedores">;
}

/** "Descargar PDF" submenu: risk matrix, signed form and Compras evaluation. */
export default function DownloadPdfMenu({ inscripcionId }: Props) {
  const convex = useConvex();
  const [loadingMatriz, setLoadingMatriz] = useState(false);
  const [loadingFormulario, setLoadingFormulario] = useState(false);
  const [loadingEval, setLoadingEval] = useState(false);

  async function handleMatriz() {
    setLoadingMatriz(true);
    try {
      const [ins, fases] = await Promise.all([
        convex.query(api.onboarding.suppliers.obtenerInscripcionPorId, { inscripcionId }),
        convex.query(api.onboarding.suppliers.obtenerFasesDeInscripcion, { inscripcionId }),
      ]);
      if (!ins) {
        toast.error("No se encontró la inscripción");
        return;
      }
      const rolesConfig = await convex.query(api.onboarding.roles.obtenerRolesConfig, { modulo: SUPPLIER_MODULO, empresa: ins.empresa });
      const faseI = fases.find((f) => f.fase === "I_ANALISIS_RIESGO" && f.estado === "COMPLETADO");
      const faseII = fases.find((f) => f.fase === "II_PENDIENTE_FORMULARIO");
      const reviewerConfig = faseI?.completadoPor
        ? rolesConfig.find((r) => r.userId === faseI.completadoPor)
        : rolesConfig.find((r) => r.rol === "CUMPLIMIENTO_LOW_RISK");
      const fechaRevisionCumplimiento = faseII?.fechaInicio ? toDateTimeStr(faseII.fechaInicio) : undefined;

      const { pdf } = await import("@react-pdf/renderer");
      const { default: MatrizRiesgoPdf } = await import("../pdf/MatrizRiesgoPdf");
      const branding = getFormBranding(ins.empresa);
      const dg = ins.datos_generales_01;
      const m = ins.matriz_00;
      const secMatriz = actividadSecundariaDesdeMatrizProveedor(m);

      const blob = await pdf(
        <MatrizRiesgoPdf
          data={{
            logoUrl: absoluteLogoUrl(branding.logoPdf),
            primaryColor: branding.color,
            empresaNombre: branding.nombre,
            revisadoPorNombre: reviewerConfig?.nombre,
            fechaRevisionCumplimiento,
            tipoSolicitud: dg.tipoSolicitud ?? "INSCRIPCIÓN",
            razonSocial: dg.razonSocial ?? "—",
            tipoDocumento: dg.tipoDocumento ?? "—",
            numeroDocumento: dg.numeroDocumento ?? "—",
            tipoPersona: dg.tipoPersona ?? "PERSONA_JURIDICA",
            servicioSuministrado: m.servicioSuministrado ?? "—",
            montoAnual: m.montoAnual ?? "—",
            sectorEconomico: m.sectorEconomico ?? "—",
            actividadEconomicaPrincipal: m.actividadEconomicaPrincipal ?? "—",
            codigoCiiu: ins.actividadPrincipal_02?.codigoCiiu ?? "—",
            codigoCiiuSecundario: m.codigoCiiuSecundario?.trim() || undefined,
            actividadEconomicaSecundaria: secMatriz?.actividadEconomica,
            jurisdiccionNacional: m.jurisdiccionNacional ?? "—",
            jurisdiccionInternacional: m.jurisdiccionInternacional ?? "—",
            isPep: m.isPep ?? false,
            listas: m.listas ?? "—",
            riesgo: m.riesgo ?? "INDEFINIDO",
            tipoEvaluacion: ins.tipoEvaluacion_14 ?? "INDEFINIDO",
            createdAt: toDateStr(ins._creationTime),
            inscripcionRef: shortRef(inscripcionId),
          }}
        />,
      ).toBlob();

      await triggerDownload(blob, `matriz-riesgo-${shortRef(inscripcionId)}.pdf`);
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
      const ins = await convex.query(api.onboarding.suppliers.obtenerInscripcionPorId, { inscripcionId });
      if (!ins) {
        toast.error("No se encontró la inscripción");
        return;
      }
      const blob = await renderFormularioPdfBlob(ins);
      await triggerDownload(blob, `formulario-proveedor-${shortRef(inscripcionId)}.pdf`);
      toast.success("Formulario del proveedor descargado");
    } catch (e) {
      console.error(e);
      toast.error("Error al generar el formulario del proveedor");
    } finally {
      setLoadingFormulario(false);
    }
  }

  async function handleEvaluacion() {
    setLoadingEval(true);
    try {
      const [ins, eval_] = await Promise.all([
        convex.query(api.onboarding.suppliers.obtenerInscripcionPorId, { inscripcionId }),
        convex.query(api.onboarding.suppliersEvaluar.obtenerEvaluacionPorInscripcion, { inscripcionId }),
      ]);
      if (!ins) {
        toast.error("No se encontró la inscripción");
        return;
      }
      if (!eval_) {
        toast.error("No existe evaluación de compras registrada para esta inscripción");
        return;
      }
      const rolesConfig = await convex.query(api.onboarding.roles.obtenerRolesConfig, { modulo: SUPPLIER_MODULO, empresa: ins.empresa });
      const branding = getFormBranding(ins.empresa);
      const evaluadorNombre = eval_.evaluadorUserId ? (rolesConfig.find((r) => r.userId === eval_.evaluadorUserId)?.nombre ?? eval_.evaluadorUserId) : "—";

      const calculo = calcularEvaluacionCompras(obtenerValoresEvaluacionCompras(eval_));
      if (!calculo.puedeCalcular || !calculo.proveedorStatus) {
        toast.error("La evaluación no tiene criterios aplicables para generar el PDF");
        return;
      }
      const criterios = CRITERIOS_COMPRAS.map((criterio) => {
        const value = eval_[criterio.key];
        return { label: criterio.label, opcion: etiquetaValorCriterioCompras(criterio.key, value), puntos: value, max: value === null ? null : criterio.max };
      });

      const { pdf } = await import("@react-pdf/renderer");
      const { default: EvaluacionComprasPdf } = await import("../pdf/EvaluacionComprasPdf");
      const dg = ins.datos_generales_01;
      const blob = await pdf(
        <EvaluacionComprasPdf
          data={{
            razonSocial: dg.razonSocial ?? "—",
            tipoDocumento: dg.tipoDocumento ?? "—",
            numeroDocumento: dg.numeroDocumento ?? "—",
            tipoEvaluacion: ins.tipoEvaluacion_14 ?? "INDEFINIDO",
            servicioSuministrado: ins.matriz_00.servicioSuministrado ?? "—",
            criterios,
            sumaPuntos: calculo.sumaPuntos,
            maximoPosible: calculo.maximoPosible,
            porcentaje: calculo.resultadoPorcentaje,
            calificacion: calculo.calificacionGeneral,
            proveedorStatus: calculo.proveedorStatus,
            logoUrl: absoluteLogoUrl(branding.logoPdf),
            primaryColor: branding.color,
            empresaNombre: branding.nombre,
            evaluadoPor: evaluadorNombre,
            fechaEvaluacion: toDateStr(eval_._creationTime),
            inscripcionRef: shortRef(inscripcionId),
          }}
        />,
      ).toBlob();

      await triggerDownload(blob, `evaluacion-compras-${shortRef(inscripcionId)}.pdf`);
      toast.success("Evaluación de compras descargada");
    } catch (e) {
      console.error(e);
      toast.error("Error al generar la evaluación");
    } finally {
      setLoadingEval(false);
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
          <span>Formulario Proveedor</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            void handleEvaluacion();
          }}
          disabled={loadingEval}
          className="flex items-center gap-2"
        >
          {loadingEval ? <Loader2 className="h-3.5 w-3.5 animate-spin text-orange-600" /> : <ClipboardList className="h-3.5 w-3.5 text-orange-600" />}
          <span>Evaluación de Compras</span>
        </DropdownMenuItem>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
