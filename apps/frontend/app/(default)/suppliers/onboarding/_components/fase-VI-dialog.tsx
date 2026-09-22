"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Building2, CheckCircle2, Loader2, Paperclip, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { blobToBase64, notificarOnboarding, type NotificarOnboardingResult, type OnboardingEmailAttachment } from "@/lib/onboarding/email-client";
import { generateReporteTiempoFasesEmailPdf } from "@/lib/onboarding/suppliers-email-pdfs";
import { cn } from "@/lib/utils";
import { getOnboardingErrorMessage, InfoItem, RIESGO_BADGE_SOLID, RIESGO_CONFIG, SUPPLIER_MODULO } from "./ui-config";

type Destinatario = { email: string; nombre: string };

const MAX_ARCHIVOS = 8;
const MAX_ARCHIVO_BYTES = 15 * 1024 * 1024;

/**
 * Fase VI — Contabilidad confirms the supplier was created in the accounting system.
 * The closing emails carry browser-generated PDFs, so they are posted through the session
 * route after the mutation succeeds.
 */
export default function FaseVIDialog({
  inscripcionId,
  open,
  onOpenChange,
}: {
  inscripcionId: Id<"onboardingProveedores">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const inscripcion = useQuery(api.onboarding.suppliers.obtenerInscripcionPorId, { inscripcionId });
  const rolesConfig = useQuery(api.onboarding.roles.obtenerRolesConfig, inscripcion ? { modulo: SUPPLIER_MODULO, empresa: inscripcion.empresa } : "skip");
  const fases = useQuery(api.onboarding.suppliers.obtenerFasesDeInscripcion, { inscripcionId });
  const completarFaseVI = useMutation(api.onboarding.suppliers.completarFaseVI);
  const generateUploadUrl = useMutation(api.facturacionStorage.generateUploadUrl);

  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [justificacion, setJustificacion] = useState("");
  const [archivosLocales, setArchivosLocales] = useState<File[]>([]);

  if (!inscripcion) return null;

  const datos = inscripcion.datos_generales_01;
  const riesgo = inscripcion.matriz_00.riesgo ?? "INDEFINIDO";
  const riesgoConfig = RIESGO_CONFIG[riesgo] ?? RIESGO_CONFIG.INDEFINIDO;
  const tercero = { razonSocial: datos.razonSocial ?? "", tipoDocumento: datos.tipoDocumento ?? "", numeroDocumento: datos.numeroDocumento ?? "" };

  function handleOpenChange(next: boolean) {
    if (!next) {
      setConfirmed(false);
      setJustificacion("");
      setArchivosLocales([]);
    }
    onOpenChange(next);
  }

  function handleSeleccionarArchivos(e: React.ChangeEvent<HTMLInputElement>) {
    const list = e.target.files;
    if (!list?.length) return;
    const nuevos = [...archivosLocales];
    for (let i = 0; i < list.length; i++) {
      const f = list[i];
      if (f.size > MAX_ARCHIVO_BYTES) {
        toast.error(`"${f.name}" supera el tamaño máximo (15 MB).`);
        continue;
      }
      if (nuevos.length >= MAX_ARCHIVOS) {
        toast.error(`Máximo ${MAX_ARCHIVOS} archivos.`);
        break;
      }
      nuevos.push(f);
    }
    setArchivosLocales(nuevos);
    e.target.value = "";
  }

  function quitarArchivo(index: number) {
    setArchivosLocales((prev) => prev.filter((_, i) => i !== index));
  }

  async function subirArchivos(): Promise<{ storageId: Id<"_storage">; nombre: string }[]> {
    const out: { storageId: Id<"_storage">; nombre: string }[] = [];
    for (const f of archivosLocales) {
      const uploadUrl = await generateUploadUrl();
      const res = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": f.type || "application/octet-stream" }, body: f });
      if (!res.ok) throw new Error(`No se pudo subir ${f.name}`);
      const json = (await res.json()) as { storageId?: Id<"_storage"> };
      if (!json.storageId) throw new Error(`Respuesta inválida al subir ${f.name}`);
      out.push({ storageId: json.storageId, nombre: f.name });
    }
    return out;
  }

  async function handleConfirmar() {
    if (!confirmed) {
      toast.error("Confirma que el proveedor fue creado en el sistema contable antes de continuar.");
      return;
    }
    if (!inscripcion || rolesConfig === undefined || fases === undefined) {
      toast.error("Espera a que cargue la configuración de roles antes de confirmar.");
      return;
    }
    setLoading(true);
    try {
      const archivosSoporte = archivosLocales.length > 0 ? await subirArchivos() : [];
      const justTrim = justificacion.trim();
      await completarFaseVI({
        inscripcionId,
        notasContabilidad:
          justTrim.length > 0 || archivosSoporte.length > 0
            ? { justificacionCambios: justTrim || undefined, archivosSoporte: archivosSoporte.length > 0 ? archivosSoporte : undefined }
            : undefined,
      });

      // Closing emails: supplier (no attachment) and Financiero (with the phase-time report).
      const proveedorMap = new Map<string, Destinatario>();
      const financieroMap = new Map<string, Destinatario>();
      const add = (map: Map<string, Destinatario>, email: string | undefined, nombre: string) => {
        const clean = email?.trim();
        if (!clean) return;
        const key = clean.toLowerCase();
        if (!map.has(key)) map.set(key, { email: clean, nombre });
      };
      add(proveedorMap, datos.contactoEmail, datos.contactoNombre || "Proveedor");
      for (const r of rolesConfig) if (r.rol === "FINANCIERO") add(financieroMap, r.email, r.nombre || "Financiero");
      const financierosKeys = new Set(financieroMap.keys());
      const destinatariosProveedor = [...proveedorMap.entries()].filter(([key]) => !financierosKeys.has(key)).map(([, d]) => d);
      const destinatariosFinanciero = [...financieroMap.values()];

      let reporteFinanciero: OnboardingEmailAttachment[] | undefined;
      if (destinatariosFinanciero.length > 0) {
        try {
          const fechaCierre = Date.now();
          const insParaPdf: Doc<"onboardingProveedores"> = { ...inscripcion, faseActual: "COMPLETADO" };
          const { reporte, ref } = await generateReporteTiempoFasesEmailPdf(insParaPdf, fases, { fechaCierre });
          reporteFinanciero = [{ filename: `reporte-tiempos-fases-proveedor-${ref}.pdf`, contentBase64: await blobToBase64(reporte) }];
        } catch (pdfErr) {
          console.error("[Fase VI] PDF reporte tiempos para Financiero:", pdfErr);
          toast.warning("El correo a Financiero se enviará sin el reporte de tiempos (error al generarlo).");
        }
      }

      const results: NotificarOnboardingResult[] = [];
      const base = { modulo: SUPPLIER_MODULO, tipo: "INSCRIPCION_COMPLETADA", inscripcionId, empresa: inscripcion.empresa, tercero };
      if (destinatariosProveedor.length > 0) {
        results.push(await notificarOnboarding({ ...base, destinatarios: destinatariosProveedor, datos: { tipoSolicitud: datos.tipoSolicitud, destinatarioTipo: "tercero" } }));
      }
      if (destinatariosFinanciero.length > 0) {
        results.push(
          await notificarOnboarding({
            ...base,
            destinatarios: destinatariosFinanciero,
            attachments: reporteFinanciero,
            datos: { tipoSolicitud: datos.tipoSolicitud, destinatarioTipo: "interno", tieneReporteTiemposPdf: !!reporteFinanciero },
          }),
        );
      }

      const failed = results.find((r) => !r.sent);
      if (failed) {
        if (failed.ok && failed.reason === "resend_not_configured") {
          toast.warning("Proveedor inscrito, pero no se enviaron correos: falta RESEND_API_KEY.");
        } else if (!failed.ok) {
          toast.warning(`Proveedor inscrito, pero el envío de correos falló${failed.message ? `: ${failed.message}` : "."}`);
        } else {
          toast.warning("Proveedor inscrito, pero no se enviaron todos los correos.");
        }
      } else if (results.length > 0) {
        toast.success("Proveedor inscrito exitosamente. Notificaciones enviadas.");
      } else {
        toast.success("Proveedor inscrito exitosamente. (Sin destinatarios para notificar.)");
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
              <DialogTitle className="text-base font-semibold text-slate-900">Fase VI — Creación en Contabilidad</DialogTitle>
              <p className="mt-0.5 text-xs text-slate-500">
                {datos.razonSocial} · {datos.tipoDocumento} {datos.numeroDocumento}
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Resumen del proveedor</p>
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

          <div className="border-t border-dashed border-slate-200" />

          <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
            <div>
              <p className="text-xs font-semibold text-slate-800">Aclaraciones para el expediente (opcional)</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">
                Si al crear el tercero en el sistema contable los datos no coinciden exactamente con el formulario de inscripción, describe el motivo y adjunta soportes.
                Quedará en el PDF del formulario como <span className="font-semibold">Notas de Contabilidad</span> al final del documento.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="justif-fase-vi" className="text-xs font-medium text-slate-700">
                Justificación de cambios o diferencias
              </Label>
              <Textarea
                id="justif-fase-vi"
                value={justificacion}
                onChange={(e) => setJustificacion(e.target.value)}
                placeholder="Ej.: NIT efectivo en el sistema contable coincide con carta de actualización RUT; razón social homologada según cámara de comercio."
                className="min-h-[88px] resize-y border-slate-200 bg-white text-sm"
                maxLength={8000}
              />
              <p className="text-[10px] text-slate-400">{justificacion.length} / 8000</p>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium text-slate-700">Archivos de soporte</Label>
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50">
                  <Paperclip className="h-3.5 w-3.5" />
                  Adjuntar archivos
                  <input type="file" className="hidden" multiple accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx" onChange={handleSeleccionarArchivos} />
                </label>
                <span className="text-[10px] text-slate-500">PDF, imágenes u Office. Máx. {MAX_ARCHIVOS} archivos, 15 MB c/u.</span>
              </div>
              {archivosLocales.length > 0 ? (
                <ul className="space-y-1.5">
                  {archivosLocales.map((f, i) => (
                    <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs">
                      <span className="truncate font-medium text-slate-800" title={f.name}>
                        {f.name}
                      </span>
                      <button type="button" className="shrink-0 rounded-xs p-0.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800" onClick={() => quitarArchivo(i)} aria-label="Quitar archivo">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[11px] text-slate-500">No hay archivos seleccionados.</p>
              )}
            </div>
          </div>

          <div className="border-t border-dashed border-slate-200" />

          <div className="space-y-4 rounded-xl border border-teal-100 bg-teal-50/60 p-4">
            <p className="text-sm leading-relaxed text-teal-700">
              La evaluación de Compras ha sido completada. Confirma que el proveedor fue creado correctamente en el sistema contable para finalizar el proceso de inscripción.
            </p>
            <label className="group flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-0.5 h-4 w-4 cursor-pointer rounded-xs border-slate-300 text-teal-600 accent-teal-600"
              />
              <span className="text-sm font-medium leading-snug text-slate-700 group-hover:text-slate-900">
                Confirmo que el proveedor <strong>{datos.razonSocial}</strong> fue creado exitosamente en el sistema contable.
              </span>
            </label>
          </div>
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
