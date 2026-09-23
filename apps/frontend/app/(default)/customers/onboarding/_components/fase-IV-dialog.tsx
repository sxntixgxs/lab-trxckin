"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Building2, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RegistroErpPanel } from "@/components/onboarding/registro-erp-panel";
import { useUsuario } from "@/hooks/useUsuariosMap";
import { generateFormularioClienteEmailPdf, generateReporteTiempoFasesClienteEmailPdf } from "@/lib/onboarding/customers-email-pdfs";
import { blobToBase64, notificarOnboarding, type NotificarOnboardingResult, type OnboardingEmailAttachment } from "@/lib/onboarding/email-client";
import { cn } from "@/lib/utils";
import { CUSTOMER_MODULO, getOnboardingErrorMessage, InfoItem, RIESGO_BADGE_SOLID, RIESGO_CONFIG } from "./ui-config";

type Destinatario = { email: string; nombre: string };

/**
 * Fase IV — Contabilidad confirms the customer was created in the accounting system.
 * The closing emails carry browser-generated PDFs (signed form; phase-time report for Financiero),
 * so they are posted through the session route after the mutation succeeds.
 */
export default function FaseIVDialog({ inscripcionId, open, onOpenChange }: { inscripcionId: Id<"onboardingClientes">; open: boolean; onOpenChange: (open: boolean) => void }) {
  const inscripcion = useQuery(api.onboarding.customers.obtenerInscripcionPorId, { inscripcionId });
  const rolesConfig = useQuery(api.onboarding.roles.obtenerRolesConfig, inscripcion ? { modulo: CUSTOMER_MODULO, empresa: inscripcion.empresa } : "skip");
  const fases = useQuery(api.onboarding.customers.obtenerFasesDeInscripcion, { inscripcionId });
  const responsable = useUsuario(inscripcion?.matriz_00.responsableId);
  const completarFaseIV = useMutation(api.onboarding.customers.completarFaseIV);

  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notas, setNotas] = useState("");

  if (!inscripcion) return null;

  const datos = inscripcion.datos_generales_01;
  const cp = inscripcion.condicionesPago_12;
  const riesgo = inscripcion.matriz_00.riesgo ?? "INDEFINIDO";
  const riesgoConfig = RIESGO_CONFIG[riesgo] ?? RIESGO_CONFIG.INDEFINIDO;
  const tercero = { razonSocial: datos.razonSocial ?? "", tipoDocumento: datos.tipoDocumento ?? "", numeroDocumento: datos.numeroDocumento ?? "" };

  function handleOpenChange(next: boolean) {
    if (!next) {
      setConfirmed(false);
      setNotas("");
    }
    onOpenChange(next);
  }

  async function handleConfirmar() {
    if (!confirmed) {
      toast.error("Confirma que el cliente fue creado en el sistema contable antes de continuar.");
      return;
    }
    if (!inscripcion || rolesConfig === undefined || fases === undefined) {
      toast.error("Espera a que cargue la configuración de roles antes de confirmar.");
      return;
    }
    setLoading(true);
    try {
      const notasTrim = notas.trim();
      await completarFaseIV({ inscripcionId, notasContabilidad: notasTrim || undefined });

      // Closing emails: customer (signed form), internal team (signed form) and Financiero (form + phase-time report).
      const clienteMap = new Map<string, Destinatario>();
      const internosMap = new Map<string, Destinatario>();
      const financieroMap = new Map<string, Destinatario>();
      const add = (map: Map<string, Destinatario>, email: string | undefined, nombre: string) => {
        const clean = email?.trim();
        if (!clean) return;
        const key = clean.toLowerCase();
        if (!map.has(key)) map.set(key, { email: clean, nombre });
      };
      add(clienteMap, datos.representanteLegalEmail ?? datos.email, datos.representanteLegalNombre || datos.razonSocial || "Cliente");
      add(internosMap, responsable?.email, responsable?.nombre ?? "Responsable");
      for (const r of rolesConfig) {
        if (r.rol === "FINANCIERO") add(financieroMap, r.email, r.nombre || "Financiero");
        else add(internosMap, r.email, r.nombre || r.rol);
      }
      const financierosKeys = new Set(financieroMap.keys());
      const destinatariosCliente = [...clienteMap.values()];
      const destinatariosInternos = [...internosMap.entries()].filter(([key]) => !financierosKeys.has(key) && !clienteMap.has(key)).map(([, d]) => d);
      const destinatariosFinanciero = [...financieroMap.values()];

      const fechaCierre = Date.now();
      const insParaPdf: Doc<"onboardingClientes"> = { ...inscripcion, faseActual: "COMPLETADO", notasContabilidadFaseIV: notasTrim || undefined };

      let formulario: OnboardingEmailAttachment[] | undefined;
      try {
        const { formulario: blob, ref } = await generateFormularioClienteEmailPdf(insParaPdf);
        formulario = [{ filename: `formulario-inscripcion-cliente-${ref}.pdf`, contentBase64: await blobToBase64(blob) }];
      } catch (pdfErr) {
        console.error("[Fase IV] PDF formulario para correo:", pdfErr);
        toast.warning("Los correos se enviarán sin el PDF del formulario (error al generarlo).");
      }

      let adjuntosFinanciero: OnboardingEmailAttachment[] | undefined = formulario;
      if (destinatariosFinanciero.length > 0) {
        try {
          const { reporte, ref } = await generateReporteTiempoFasesClienteEmailPdf(insParaPdf, fases, { fechaCierre });
          adjuntosFinanciero = [...(formulario ?? []), { filename: `reporte-tiempos-fases-cliente-${ref}.pdf`, contentBase64: await blobToBase64(reporte) }];
        } catch (pdfErr) {
          console.error("[Fase IV] PDF reporte tiempos para Financiero:", pdfErr);
          toast.warning("El correo a Financiero se enviará sin el reporte de tiempos (error al generarlo).");
        }
      }

      const results: NotificarOnboardingResult[] = [];
      const base = { modulo: CUSTOMER_MODULO, tipo: "INSCRIPCION_COMPLETADA", inscripcionId, empresa: inscripcion.empresa, tercero };
      const datosBase = { tipoSolicitud: datos.tipoSolicitud, tieneFormularioPdf: !!formulario };
      if (destinatariosCliente.length > 0) {
        results.push(await notificarOnboarding({ ...base, destinatarios: destinatariosCliente, attachments: formulario, datos: { ...datosBase, destinatarioTipo: "tercero" } }));
      }
      if (destinatariosInternos.length > 0) {
        results.push(await notificarOnboarding({ ...base, destinatarios: destinatariosInternos, attachments: formulario, datos: { ...datosBase, destinatarioTipo: "interno" } }));
      }
      if (destinatariosFinanciero.length > 0) {
        results.push(
          await notificarOnboarding({
            ...base,
            destinatarios: destinatariosFinanciero,
            attachments: adjuntosFinanciero,
            datos: { ...datosBase, destinatarioTipo: "interno", tieneReporteTiemposPdf: (adjuntosFinanciero?.length ?? 0) > (formulario?.length ?? 0) },
          }),
        );
      }

      const failed = results.find((r) => !r.sent);
      if (failed) {
        if (failed.ok && failed.reason === "resend_not_configured") {
          toast.warning("Cliente inscrito, pero no se enviaron correos: falta RESEND_API_KEY.");
        } else if (!failed.ok) {
          toast.warning(`Cliente inscrito, pero el envío de correos falló${failed.message ? `: ${failed.message}` : "."}`);
        } else {
          toast.warning("Cliente inscrito, pero no se enviaron todos los correos.");
        }
      } else if (results.length > 0) {
        toast.success("Cliente inscrito exitosamente. Notificaciones enviadas.");
      } else {
        toast.success("Cliente inscrito exitosamente. (Sin destinatarios para notificar.)");
      }
      handleOpenChange(false);
    } catch (e) {
      toast.error(getOnboardingErrorMessage(e, "Error al completar"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-xl flex-col gap-0 p-0">
        <DialogHeader className="border-b border-slate-100 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50">
              <Building2 className="h-5 w-5 text-teal-600" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold text-slate-900">Fase IV — Creación en Contabilidad</DialogTitle>
              <p className="mt-0.5 text-xs text-slate-500">
                {datos.razonSocial} · {datos.tipoDocumento} {datos.numeroDocumento}
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Resumen del cliente</p>
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
              <InfoItem label="Monto anual">{inscripcion.matriz_00.montoAnual || "—"}</InfoItem>
            </div>
          </div>

          {cp && (
            <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Condiciones de pago (Comercial)</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-slate-500">Forma de pago · </span>
                  <span className="font-medium text-slate-800">{cp.formaPago}</span>
                </div>
                <div>
                  <span className="text-slate-500">Plazo · </span>
                  <span className="font-medium text-slate-800">{cp.plazo}</span>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="notas-fase-iv" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Notas de cierre (Contabilidad)
              <span className="ml-1 text-[10px] font-normal normal-case text-slate-400">(opcional; se incluyen al final del PDF del formulario)</span>
            </Label>
            <Textarea
              id="notas-fase-iv"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Observaciones internas, ajustes en el sistema contable, condiciones particulares…"
              rows={4}
              className="resize-none border-slate-200 bg-slate-50 text-sm"
              maxLength={8000}
            />
          </div>

          <div className="space-y-4 rounded-xl border border-teal-100 bg-teal-50/60 p-4">
            <p className="text-sm leading-relaxed text-teal-700">
              Cumplimiento aprobó la inscripción. Confirma que el cliente fue creado y está activo en el sistema contable para finalizar el proceso.
            </p>
            <RegistroErpPanel
              modulo={CUSTOMER_MODULO}
              inscripcionId={inscripcionId}
              registroErp={inscripcion.registroErp}
              entidad="cliente"
              onRegistrado={() => setConfirmed(true)}
            />
            <label className="group flex cursor-pointer items-start gap-3">
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5 h-4 w-4 cursor-pointer rounded-xs border-slate-300 text-teal-600 accent-teal-600" />
              <span className="text-sm font-medium leading-snug text-slate-700 group-hover:text-slate-900">
                Confirmo que el cliente <strong>{datos.razonSocial}</strong> fue creado y está activo en el sistema contable.
              </span>
            </label>
          </div>
          <p className="text-xs text-slate-500">Al confirmar, se notificará al cliente, al responsable del proceso y a los roles configurados.</p>
        </div>

        <DialogFooter className="gap-2 border-t border-slate-100 bg-slate-50/60 px-6 py-4">
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={loading} className="rounded-lg">
            Cancelar
          </Button>
          <Button className="rounded-lg bg-teal-600 text-white hover:bg-teal-700" onClick={handleConfirmar} disabled={loading || !confirmed || rolesConfig === undefined || fases === undefined}>
            {loading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1 h-4 w-4" />}
            Confirmar creación
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
