"use client";

import { Component, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  Ban,
  Briefcase,
  Building2,
  Check,
  Clock,
  DollarSign,
  ExternalLink,
  Eye,
  FileText,
  Globe,
  Hash,
  Landmark,
  ListChecks,
  Loader2,
  Mail,
  MapPin,
  Phone,
  ShieldAlert,
  Upload,
  User,
  X,
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { useArchivoInscripcionUrl } from "@/hooks/useArchivoInscripcionUrl";
import type { Id } from "@/convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useUsuariosMap } from "@/hooks/useUsuariosMap";
import { CIIU_ACTIVIDAD } from "@/lib/catalogs/ciiu";
import type { FactorRisk } from "@/lib/onboarding/risk/compute";
import { computeCustomerFactorRisks } from "@/lib/onboarding/risk/customer-matrix";
import { CorreoHistorialPanel, renderFaseIHistorialDetalle } from "@/app/(default)/suppliers/onboarding/_components/correo-status";
import {
  CUSTOMER_MODULO,
  ESTADO_DOC_BADGE,
  ESTADO_DOC_LABEL,
  EVALUACION_CONFIG,
  FASE_CONFIG,
  FASES_TERMINALES,
  getOnboardingErrorMessage,
  RIESGO_CONFIG,
  TipoSolicitudChip,
} from "./ui-config";

type DetalleInscripcion = NonNullable<FunctionReturnType<typeof api.onboarding.customers.obtenerDetalleInscripcion>>;
/** Same shape as the board rows (`obtenerInscripcionesConUltimaFase`): the document plus `ultimaFaseInicio` and `tipoSolicitud`. */
type Inscripcion = DetalleInscripcion["inscripcion"];

function getPayloadString(payload: unknown, key: string) {
  if (!payload || typeof payload !== "object") return undefined;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function formatDocHistoryAction(action: string) {
  const labels: Record<string, string> = {
    CARGADO: "cargó el documento",
    FORMULARIO_FIRMADO: "creó la revisión al firmar el formulario",
    APROBADO: "aprobó el documento",
    RECHAZADO: "rechazó el documento",
    CARGADO_POR_RESPONSABLE: "cargó un reemplazo",
    AGREGADO_POR_AJUSTE_RIESGO: "agregó el documento por ajuste de riesgo",
    DEVUELTO_A_REVISION: "devolvió el documento a revisión",
  };
  return labels[action] ?? action.toLowerCase().replaceAll("_", " ");
}

/**
 * Permission flags for the detail dialog, with the same rules as the board: returning a phase needs
 * `full` access (not for FINANCIERO-only users), managing the hand-off emails is off in the
 * read-only modes and replacing a rejected document is for admins and the process' responsable.
 * Client-side hints only: the server re-checks every action.
 */
export function permisosDetalle(
  access: DetalleInscripcion["access"] | undefined,
  inscripcion: Pick<Inscripcion, "matriz_00"> | null,
): { allowDevolver: boolean; puedeGestionarCorreo: boolean; puedeReemplazarDocs: boolean } {
  const nivel = access?.nivel;
  const modoSoloConsulta = nivel === "solo_lectura" || nivel === "consulta_creacion";
  const esSoloFinanciero = !access?.isAdmin && (access?.roles.length ?? 0) > 0 && (access?.roles ?? []).every((r) => r.rol === "FINANCIERO");
  return {
    allowDevolver: nivel === "full" && !esSoloFinanciero,
    puedeGestionarCorreo: !!access && !modoSoloConsulta && (access.isAdmin || access.roles.length > 0 || inscripcion?.matriz_00.responsableId === access.usuarioId),
    puedeReemplazarDocs: !!access && (access.isAdmin || inscripcion?.matriz_00.responsableId === access.usuarioId),
  };
}

// ─── Detail dialog ─────────────────────────────────────────────────────────────
export function DetailDialog({
  inscripcion,
  open,
  onOpenChange,
  onCloseAutoFocus,
  allowDevolver,
  puedeGestionarCorreo,
  puedeVerAdjuntos,
  puedeReemplazarDocs,
}: {
  inscripcion: Inscripcion | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Radix `onCloseAutoFocus`, so the caller can restore focus when the dialog closes. */
  onCloseAutoFocus?: (event: Event) => void;
  allowDevolver: boolean;
  puedeGestionarCorreo: boolean;
  puedeVerAdjuntos: boolean;
  /** The responsable (or an admin) may replace a rejected document on behalf of the customer. */
  puedeReemplazarDocs: boolean;
}) {
  const fases = useQuery(api.onboarding.customers.obtenerFasesDeInscripcion, inscripcion ? { inscripcionId: inscripcion._id } : "skip");
  const revDocs = useQuery(api.onboarding.customers.obtenerRevisionDocumentos, inscripcion ? { inscripcionId: inscripcion._id } : "skip");
  const correosData = useQuery(api.onboarding.correos.obtenerCorreosPorInscripcion, inscripcion ? { modulo: CUSTOMER_MODULO, inscripcionId: inscripcion._id, limit: 20 } : "skip");
  const cotizacionStorageId = inscripcion?.matriz_00.cotizacionStorageId;
  const cotizacionUrl = useArchivoInscripcionUrl("customer", puedeVerAdjuntos ? inscripcion?._id : undefined, cotizacionStorageId);
  const devolverFase = useMutation(api.onboarding.customers.devolverFase);
  const cargarInterno = useMutation(api.onboarding.customers.cargarDocumentoRevisionInterno);
  const generateUploadUrl = useMutation(api.facturacionStorage.generateUploadUrl);

  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);
  const [motivoDevolucion, setMotivoDevolucion] = useState("");
  const [devolviendo, setDevolviendo] = useState(false);
  const [uploadingDocKey, setUploadingDocKey] = useState<string | null>(null);

  const d = inscripcion?.datos_generales_01;
  const fasesOrdenadas = useMemo(() => fases?.slice().sort((a, b) => (a.fechaInicio ?? 0) - (b.fechaInicio ?? 0)) ?? [], [fases]);
  const auditUserIds = useMemo(() => {
    if (!inscripcion) return [];
    return [
      inscripcion.anulacion?.porUserId,
      inscripcion.matriz_00.responsableId,
      inscripcion.rechazadoCumplimiento?.rechazadoPorUserId,
      ...(inscripcion.devolucionesFase ?? []).map((item) => item.devueltoPorUserId),
      ...(inscripcion.ajustesRiesgoCumplimiento ?? []).map((item) => item.ajustadoPorUserId),
      ...fasesOrdenadas.map((fase) => fase.completadoPor),
      ...fasesOrdenadas.map((fase) => fase.asignadoA),
      ...(revDocs ?? []).flatMap((doc) => (doc.historial ?? []).map((h) => h.userId)),
    ];
  }, [inscripcion, fasesOrdenadas, revDocs]);
  const auditUsers = useUsuariosMap(auditUserIds);
  const nombreDe = (id: string | undefined) => (id ? (auditUsers[id]?.nombre ?? id) : "—");

  async function handleDevolver(faseId: Id<"onboardingClientesFases">) {
    if (!motivoDevolucion.trim()) {
      toast.error("Registra la razón de la devolución antes de continuar.");
      return;
    }
    setDevolviendo(true);
    try {
      const result = await devolverFase({ faseId, motivo: motivoDevolucion.trim() });
      toast.success(`Proceso devuelto a ${FASE_CONFIG[result.faseDestino]?.label ?? result.faseDestino}. Se reenviaron las notificaciones correspondientes.`);
      setConfirmandoId(null);
      setMotivoDevolucion("");
    } catch (e) {
      toast.error(getOnboardingErrorMessage(e, "Error al devolver la fase"));
    } finally {
      setDevolviendo(false);
    }
  }

  async function handleReemplazarDoc(docKey: string, file: File | undefined) {
    if (!inscripcion || !file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("El archivo excede 10 MB");
      return;
    }
    setUploadingDocKey(docKey);
    try {
      const uploadUrl = await generateUploadUrl();
      const res = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file });
      if (!res.ok) throw new Error("Error al subir el documento");
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
      await cargarInterno({ inscripcionId: inscripcion._id, docKey, storageId });
      toast.success("Documento cargado y enviado nuevamente a revisión.");
    } catch (e) {
      toast.error(getOnboardingErrorMessage(e, "Error al cargar documento"));
    } finally {
      setUploadingDocKey(null);
    }
  }

  if (!inscripcion) return null;

  const m = inscripcion.matriz_00;
  const a2 = inscripcion.actividadEconomica_02;
  const riesgo = m.riesgo ?? "INDEFINIDO";
  const riesgoConf = RIESGO_CONFIG[riesgo] ?? RIESGO_CONFIG.INDEFINIDO;
  const evaluacion = inscripcion.tipoEvaluacion ?? "INDEFINIDO";
  const evaluacionConf = EVALUACION_CONFIG[evaluacion] ?? EVALUACION_CONFIG.INDEFINIDO;
  const faseConf = FASE_CONFIG[inscripcion.faseActual] ?? null;
  const intentosForm = correosData?.intentos.filter((i) => i.handoff === "FORM") ?? [];
  const intentosSign = correosData?.intentos.filter((i) => i.handoff === "SIGN") ?? [];
  const factorRisks = computeCustomerFactorRisks(m);
  const docsAprobados = revDocs?.filter((doc) => doc.estado === "APROBADO").length ?? 0;
  const docsTotal = revDocs?.length ?? 0;
  const rechazo = inscripcion.rechazadoCumplimiento;
  const puedeReemplazar = puedeReemplazarDocs && inscripcion.faseActual === "III_REVISION_DOCUMENTAL";
  const actividadPrincipal = a2?.actividadEconomica ?? (a2?.codigoCiiu ? CIIU_ACTIVIDAD[a2.codigoCiiu] : undefined);
  const actividadSecundaria = a2?.actividadEconomicaSecundaria?.trim() || (a2?.codigoCiiuSecundario?.trim() ? CIIU_ACTIVIDAD[a2.codigoCiiuSecundario.trim()] : undefined);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto" onCloseAutoFocus={onCloseAutoFocus}>
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">{d?.razonSocial ?? "Inscripción"}</DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-2">
            <span>
              {d?.tipoDocumento} {d?.numeroDocumento}
            </span>
            <TipoSolicitudChip tipoSolicitud={d?.tipoSolicitud} className="text-xs" />
            {faseConf && (
              <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${faseConf.bg} ${faseConf.color} ${faseConf.border}`}>{faseConf.label}</span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {cotizacionStorageId && puedeVerAdjuntos ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-blue-100 bg-blue-50/80 px-3 py-2.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-blue-800">Cotización</span>
              {cotizacionUrl ? (
                <a href={cotizacionUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline">
                  Abrir cotización
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                </a>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Cargando enlace…
                </span>
              )}
            </div>
          ) : null}

          {inscripcion.faseActual === "ANULADA" && inscripcion.anulacion && (
            <div className="flex items-start gap-3 rounded-xl border border-slate-300 bg-slate-100 p-4 text-sm">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white">
                <Ban className="h-5 w-5 text-slate-600" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Proceso anulado</p>
                <p className="mt-1 font-semibold uppercase text-slate-800">Anulada por: {nombreDe(inscripcion.anulacion.porUserId)}</p>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">A las {format(new Date(inscripcion.anulacion.fecha), "HH:mm 'del' dd MMM yyyy", { locale: es })}</p>
                <p className="mt-1 text-xs text-slate-600">Motivo: {inscripcion.anulacion.motivo}</p>
              </div>
            </div>
          )}

          {inscripcion.faseActual === "RECHAZADO" && rechazo && (
            <div className="space-y-1 rounded-xl border border-red-200 bg-red-50/70 p-4 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-red-700">Rechazado por Cumplimiento · {nombreDe(rechazo.rechazadoPorUserId)}</p>
              <p className="text-xs text-slate-700">
                <span className="font-semibold">Motivo al cliente:</span> {rechazo.motivoExterno}
              </p>
              <p className="text-xs text-slate-700">
                <span className="font-semibold">Motivo interno:</span> {rechazo.motivoInterno}
              </p>
              <p className="text-[11px] text-slate-500">A las {format(new Date(rechazo.fechaRechazo), "HH:mm 'del' dd MMM yyyy", { locale: es })}</p>
            </div>
          )}

          {(inscripcion.devolucionesFase ?? []).length > 0 && (
            <div className="space-y-2 rounded-xl border border-blue-100 bg-blue-50/60 p-4 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-blue-700">Devoluciones de fase</p>
              <div className="space-y-2">
                {(inscripcion.devolucionesFase ?? []).map((item, index) => (
                  <div key={`${item.fecha}-${index}`} className="rounded-lg bg-white px-3 py-2 text-slate-700">
                    <p className="font-semibold uppercase text-slate-800">
                      {nombreDe(item.devueltoPorUserId)} devolvió el proceso de {FASE_CONFIG[item.faseOrigen]?.label ?? item.faseOrigen} a {FASE_CONFIG[item.faseDestino]?.label ?? item.faseDestino}.
                    </p>
                    <p className="text-xs text-slate-500">
                      Por: {item.motivo}. A las {format(new Date(item.fecha), "HH:mm 'del' dd MMM yyyy", { locale: es })}.
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Datos del cliente</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
              <InfoRow icon={FileText} label="Tipo solicitud" value={d?.tipoSolicitud ?? "INSCRIPCIÓN"} />
              <InfoRow icon={Building2} label="Tipo de persona" value={d?.tipoPersona === "PERSONA_NATURAL" ? "Persona Natural" : "Persona Jurídica"} />
              <InfoRow icon={Hash} label="Documento" value={`${d?.tipoDocumento ?? ""} ${d?.numeroDocumento ?? ""}`.trim() || "—"} />
              <InfoRow icon={Building2} label="Razón social / Nombre" value={d?.razonSocial} />
              <InfoRow icon={User} label="Representante legal" value={d?.representanteLegalNombre} />
              <InfoRow icon={User} label="Responsable" value={nombreDe(m.responsableId)} />
              {inscripcion.condicionesPago_12 && (
                <>
                  <InfoRow icon={DollarSign} label="Forma de pago" value={inscripcion.condicionesPago_12.formaPago} />
                  <InfoRow icon={Clock} label="Plazo" value={inscripcion.condicionesPago_12.plazo} />
                </>
              )}
            </div>
          </div>

          <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Contacto</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
              <InfoRow icon={Mail} label="Email" value={d?.email} />
              <InfoRow icon={Phone} label="Celular" value={d?.celular} />
              <InfoRow icon={Mail} label="Email representante legal" value={d?.representanteLegalEmail} />
              <InfoRow icon={User} label="Contacto" value={d?.contactoNombre} />
              <InfoRow icon={Mail} label="Email contacto" value={d?.contactoEmail} />
              <InfoRow icon={User} label="Tesorero" value={d?.tesoreroNombre} />
              <InfoRow icon={User} label="Contador" value={d?.contadorNombre} />
            </div>
          </div>

          {(d?.direccion || d?.ciudad || d?.departamento) && (
            <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Ubicación</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                <InfoRow icon={MapPin} label="Dirección" value={d?.direccion} />
                <InfoRow icon={MapPin} label="Ciudad" value={d?.ciudad} />
                <InfoRow icon={MapPin} label="Departamento" value={d?.departamento} />
              </div>
            </div>
          )}

          {a2 && (
            <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Actividad económica</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                <InfoRow icon={Hash} label="CIIU principal" value={a2.codigoCiiu} />
                <InfoRow icon={Briefcase} label="Actividad principal" value={actividadPrincipal} />
                <InfoRow icon={Hash} label="CIIU secundario" value={a2.codigoCiiuSecundario?.trim() || undefined} />
                <InfoRow icon={Briefcase} label="Actividad secundaria" value={actividadSecundaria || undefined} />
              </div>
            </div>
          )}

          <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 text-sm">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Matriz de riesgo</p>
              <span className="text-[10px] text-slate-400">
                El riesgo final es el <span className="font-semibold text-slate-500">máximo</span> de los factores
              </span>
            </div>
            <InfoRow icon={Briefcase} label="Producto o servicio" value={m.servicioSuministrado} />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <MatrizRiesgoRow icon={DollarSign} label="Monto anual estimado" value={m.montoAnual} factor={factorRisks.montoAnual} />
              <MatrizRiesgoRow icon={Landmark} label="Sector económico" value={m.sectorEconomico} factor={factorRisks.sectorEconomico} />
              <MatrizRiesgoRow icon={MapPin} label="Jurisdicción nacional" value={m.jurisdiccionNacional} factor={factorRisks.jurisdiccionNacional} />
              <MatrizRiesgoRow icon={Globe} label="Jurisdicción internacional" value={m.jurisdiccionInternacional} factor={factorRisks.jurisdiccionInternacional} />
              <MatrizRiesgoRow icon={User} label="PEP" value={m.isPep ? "Sí" : "No"} factor={factorRisks.isPep} />
              <MatrizRiesgoRow icon={ListChecks} label="Listas restrictivas" value={m.listas} factor={factorRisks.listas} />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Resultado de la evaluación</p>
            <div className="flex flex-wrap items-center justify-around gap-4">
              <div className="flex flex-col items-center gap-1.5">
                <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  <ShieldAlert className="h-3 w-3" /> Nivel de riesgo
                </span>
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-bold ${riesgoConf.badge}`}>
                  <span className={`h-2 w-2 rounded-full ${riesgoConf.dot}`} />
                  {riesgoConf.label}
                </span>
              </div>
              <div className="flex flex-col items-center gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Tipo de evaluación</span>
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-bold ${evaluacionConf.badge}`}>
                  <span className={`h-2 w-2 rounded-full ${evaluacionConf.dot}`} />
                  {evaluacionConf.label}
                </span>
              </div>
            </div>
          </div>

          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Historial de fases</p>
            {fases === undefined ? (
              <div className="flex h-16 items-center justify-center">
                <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
              </div>
            ) : fasesOrdenadas.length === 0 ? (
              <p className="text-sm italic text-slate-500">Sin fases registradas</p>
            ) : (
              <div className="space-y-2">
                {fasesOrdenadas.map((fase) => {
                  const fc = FASE_CONFIG[fase.fase] ?? { label: fase.fase, color: "text-slate-600", bg: "bg-slate-50", border: "border-slate-200", short: "?", icon: FileText };
                  const Icon = fc.icon ?? FileText;
                  const canDevolver = !FASES_TERMINALES.has(inscripcion.faseActual) && (fase.estado === "COMPLETADO" || fase.estado === "RECHAZADO");
                  const puedeDevolverTerminal = inscripcion.faseActual === "RECHAZADO" && (fase.estado === "COMPLETADO" || fase.estado === "RECHAZADO");
                  const isConfirming = confirmandoId === fase._id;
                  const payloadNombre = getPayloadString(fase.payload, "completadoPorNombre");
                  const payloadObservaciones = getPayloadString(fase.payload, "observaciones");
                  const payloadMotivoExterno = getPayloadString(fase.payload, "motivoExterno");
                  const payloadMotivoInterno = getPayloadString(fase.payload, "motivoInterno");
                  return (
                    <div key={fase._id} className={`rounded-xl border px-3 py-2.5 ${fc.bg} ${fc.border}`}>
                      <div className="flex items-start gap-3">
                        <div className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border ${fc.bg} ${fc.border}`}>
                          <Icon className={`h-3.5 w-3.5 ${fc.color}`} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className={`text-sm font-semibold ${fc.color}`}>{fc.label}</p>
                            <div className="flex shrink-0 items-center gap-1.5">
                              <FaseEstadoBadge estado={fase.estado} />
                              {allowDevolver && (canDevolver || puedeDevolverTerminal) && !isConfirming && (
                                <button
                                  type="button"
                                  onClick={() => setConfirmandoId(fase._id)}
                                  className="rounded-xs px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                                  title="Devolver el proceso a esta etapa"
                                >
                                  Devolver
                                </button>
                              )}
                            </div>
                          </div>
                          <div className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-500">
                            {fase.fechaInicio && <span>Inicio: {format(new Date(fase.fechaInicio), "dd MMM yyyy HH:mm", { locale: es })}</span>}
                            {fase.fechaCompletado && <span>Completado: {format(new Date(fase.fechaCompletado), "dd MMM yyyy HH:mm", { locale: es })}</span>}
                            {fase.asignadoA && fase.estado === "EN_PROGRESO" && <span>Asignado a: {nombreDe(fase.asignadoA)}</span>}
                          </div>
                          {fase.observaciones && fase.fase !== "IIIA_APROBACION_CUMPLIMIENTO" && <p className="mt-1 text-xs text-slate-600">{fase.observaciones}</p>}
                          {fase.fase === "I_ANALISIS_RIESGO" && renderFaseIHistorialDetalle(fase, auditUsers[fase.completadoPor ?? ""]?.nombre)}
                          {fase.fase === "II_PENDIENTE_FORMULARIO" ? (
                            <CorreoHistorialPanel
                              modulo={CUSTOMER_MODULO}
                              titulo="Envío del formulario"
                              faseActual={inscripcion.faseActual}
                              fasesActivas={["II_PENDIENTE_FORMULARIO", "III_REVISION_DOCUMENTAL"]}
                              emailCanonico={d?.contactoEmail ?? d?.representanteLegalEmail ?? d?.email}
                              resumen={correosData?.resumen?.form}
                              intentos={intentosForm}
                              puedeGestionar={puedeGestionarCorreo}
                              handoff="FORM"
                              inscripcionId={inscripcion._id}
                            />
                          ) : null}
                          {fase.fase === "IIA_PENDIENTE_FIRMA" ? (
                            <CorreoHistorialPanel
                              modulo={CUSTOMER_MODULO}
                              titulo="Solicitud de firma"
                              faseActual={inscripcion.faseActual}
                              fasesActivas={["IIA_PENDIENTE_FIRMA"]}
                              emailCanonico={d?.representanteLegalEmail}
                              resumen={correosData?.resumen?.sign}
                              intentos={intentosSign}
                              puedeGestionar={puedeGestionarCorreo}
                              handoff="SIGN"
                              inscripcionId={inscripcion._id}
                            />
                          ) : null}
                          {fase.fase === "III_REVISION_DOCUMENTAL" && (inscripcion.ajustesRiesgoCumplimiento ?? []).length > 0 && (
                            <div className="mt-3 space-y-2 rounded-lg border border-amber-200 bg-amber-50/70 p-3">
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-800">Ajustes de riesgo por Cumplimiento</p>
                              {(inscripcion.ajustesRiesgoCumplimiento ?? []).map((ajuste, index) => (
                                <div key={`${ajuste.fecha}-${index}`} className="rounded-md bg-white/80 px-3 py-2 text-xs text-slate-700">
                                  <p className="font-semibold uppercase text-slate-800">
                                    {nombreDe(ajuste.ajustadoPorUserId)} cambió PEP de {ajuste.pepAnterior ? "SÍ" : "NO"} a {ajuste.pepNuevo ? "SÍ" : "NO"} y listas de {ajuste.listasAnterior} a {ajuste.listasNuevo}.
                                  </p>
                                  <p>
                                    Riesgo: <span className="font-semibold">{ajuste.riesgoAnterior}</span> → <span className="font-semibold">{ajuste.riesgoNuevo}</span>. Evaluación:{" "}
                                    <span className="font-semibold">{ajuste.tipoEvaluacionAnterior}</span> → <span className="font-semibold">{ajuste.tipoEvaluacionNuevo}</span>.
                                  </p>
                                  <p>A las {format(new Date(ajuste.fecha), "HH:mm 'del' dd MMM yyyy", { locale: es })}.</p>
                                  <p>
                                    <span className="font-semibold">Observación:</span> {ajuste.observacion}
                                  </p>
                                  {ajuste.docsAgregados.length > 0 && (
                                    <p>
                                      <span className="font-semibold">Documentos agregados:</span> {ajuste.docsAgregados.map((doc) => doc.docLabel).join(", ")}
                                    </p>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                          {fase.fase === "IIIA_APROBACION_CUMPLIMIENTO" && fase.estado === "COMPLETADO" && (
                            <div className="mt-3 rounded-lg border border-indigo-200 bg-white/80 px-3 py-2 text-xs text-slate-700">
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-indigo-700">Aprobación de Cumplimiento</p>
                              <p className="mt-1 font-semibold uppercase text-slate-800">
                                {payloadNombre ?? nombreDe(fase.completadoPor)} aprobó la fase
                                {fase.fechaCompletado ? ` a las ${format(new Date(fase.fechaCompletado), "HH:mm 'del' dd MMM yyyy", { locale: es })}` : ""}.
                              </p>
                              <p>
                                <span className="font-semibold">Observación:</span> {payloadObservaciones ?? fase.observaciones ?? "Sin observaciones registradas."}
                              </p>
                            </div>
                          )}
                          {fase.fase === "IIIA_APROBACION_CUMPLIMIENTO" && fase.estado === "RECHAZADO" && (
                            <div className="mt-3 rounded-lg border border-red-200 bg-white/80 px-3 py-2 text-xs text-slate-700">
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-red-700">Rechazo de Cumplimiento</p>
                              <p className="mt-1 font-semibold uppercase text-slate-800">
                                {nombreDe(fase.completadoPor)} rechazó la fase
                                {fase.fechaCompletado ? ` a las ${format(new Date(fase.fechaCompletado), "HH:mm 'del' dd MMM yyyy", { locale: es })}` : ""}.
                              </p>
                              {(payloadMotivoExterno ?? rechazo?.motivoExterno) && (
                                <p className="mt-1">
                                  <span className="font-semibold">Motivo cliente:</span> {payloadMotivoExterno ?? rechazo?.motivoExterno}
                                </p>
                              )}
                              {(payloadMotivoInterno ?? rechazo?.motivoInterno ?? fase.observaciones) && (
                                <p className="mt-1">
                                  <span className="font-semibold">Motivo interno:</span> {payloadMotivoInterno ?? rechazo?.motivoInterno ?? fase.observaciones}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {isConfirming && (
                        <div className="mt-2.5 space-y-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                          <p className="text-xs text-red-700">¿Devolver el proceso a esta fase? Se eliminarán las fases posteriores, se invalidarán los enlaces anteriores y quedará trazabilidad de la devolución.</p>
                          <Textarea value={motivoDevolucion} onChange={(event) => setMotivoDevolucion(event.target.value)} placeholder="Razón de la devolución..." rows={2} className="bg-white text-xs" />
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setConfirmandoId(null);
                                setMotivoDevolucion("");
                              }}
                              disabled={devolviendo}
                              className="rounded-xs px-2 py-1 text-xs font-medium text-slate-500 transition-colors hover:bg-white disabled:opacity-50"
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDevolver(fase._id)}
                              disabled={devolviendo}
                              className="flex items-center gap-1 rounded-xs bg-red-600 px-2 py-1 text-xs font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                            >
                              {devolviendo ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                              Sí, devolver
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {docsTotal > 0 && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Documentos requeridos</p>
                <span className="text-xs text-slate-500">
                  {docsAprobados}/{docsTotal} aprobados
                </span>
              </div>
              <div className="space-y-1.5">
                {revDocs!.map((doc) => (
                  <div key={doc._id} className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        <span className="truncate text-slate-700">{doc.docLabel}</span>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <DocEstadoBadge estado={doc.estado} />
                        {puedeVerAdjuntos && <DocAdjuntoLink storageId={doc.storageId} inscripcionId={inscripcion._id} />}
                        {puedeReemplazar && doc.estado === "RECHAZADO" && (
                          <label className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 text-[10px] font-semibold text-blue-700 hover:bg-blue-100">
                            {uploadingDocKey === doc.docKey ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                            Reemplazar
                            <input
                              type="file"
                              accept=".pdf,.jpg,.jpeg,.png"
                              className="hidden"
                              disabled={uploadingDocKey === doc.docKey}
                              onChange={(event) => {
                                const selected = event.target.files?.[0];
                                event.target.value = "";
                                void handleReemplazarDoc(doc.docKey, selected);
                              }}
                            />
                          </label>
                        )}
                      </div>
                    </div>
                    {doc.estado === "RECHAZADO" && doc.observaciones?.trim() && (
                      <div className="mt-2 rounded-md border border-red-100 bg-red-50 px-2 py-1.5 text-xs text-red-700">
                        <span className="font-semibold">Motivo de rechazo:</span> {doc.observaciones.trim()}
                      </div>
                    )}
                    {(doc.historial ?? []).some((item) => item.userId || item.nota) && (
                      <div className="mt-2 space-y-1 rounded-md border border-slate-100 bg-white px-2 py-1.5 text-[11px] text-slate-500">
                        <p className="font-semibold uppercase tracking-wide text-slate-400">Historial del documento</p>
                        {(doc.historial ?? [])
                          .filter((item) => item.userId || item.nota)
                          .map((item, index) => (
                            <p key={`${doc.docKey}-${item.fecha}-${index}`}>
                              <span className="font-semibold text-slate-700">{item.userId ? nombreDe(item.userId) : "Sistema"}</span> {formatDocHistoryAction(item.accion)} a las{" "}
                              {format(new Date(item.fecha), "HH:mm 'del' dd MMM yyyy", { locale: es })}
                              {item.nota ? `: ${item.nota}` : ""}.
                            </p>
                          ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {inscripcion.notasContabilidadFaseIV?.trim() && (
            <div className="space-y-1 rounded-xl border border-teal-100 bg-teal-50/60 p-4 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-teal-700">Notas de cierre (Contabilidad · Fase IV)</p>
              <p className="whitespace-pre-wrap text-xs text-slate-700">{inscripcion.notasContabilidadFaseIV.trim()}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: React.ReactNode }) {
  if (!value) return null;
  return (
    <div className="flex min-w-0 items-start gap-2">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
        <div className="truncate text-sm text-slate-700">{value}</div>
      </div>
    </div>
  );
}

function FactorRiskBadge({ factor }: { factor: FactorRisk }) {
  const conf = RIESGO_CONFIG[factor.nivel] ?? RIESGO_CONFIG.INDEFINIDO;
  const scoreLabel = factor.score > 0 ? factor.score : "—";
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${conf.badge}`} title={`Puntaje ${scoreLabel} · ${conf.label}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${conf.dot}`} />
      <span className="font-mono text-[10px]">{scoreLabel}</span>
      <span className="uppercase tracking-wide">{conf.label}</span>
    </span>
  );
}

function MatrizRiesgoRow({ icon: Icon, label, value, factor }: { icon: React.ElementType; label: string; value: React.ReactNode; factor: FactorRisk }) {
  const display = value === undefined || value === null || value === "" ? "—" : value;
  return (
    <div className="flex items-start gap-2 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
          <FactorRiskBadge factor={factor} />
        </div>
        <div className="mt-0.5 break-words text-sm text-slate-700">{display}</div>
      </div>
    </div>
  );
}

function FaseEstadoBadge({ estado }: { estado: string }) {
  const map: Record<string, string> = {
    PENDIENTE: "bg-slate-100 text-slate-600 border-slate-200",
    EN_PROGRESO: "bg-blue-100 text-blue-700 border-blue-200",
    COMPLETADO: "bg-green-100 text-green-700 border-green-200",
    RECHAZADO: "bg-red-100 text-red-700 border-red-200",
    ANULADA: "bg-slate-100 text-slate-700 border-slate-300",
  };
  const labels: Record<string, string> = { PENDIENTE: "Pendiente", EN_PROGRESO: "En progreso", COMPLETADO: "Completado", RECHAZADO: "Rechazado", ANULADA: "Anulada" };
  return (
    <Badge variant="outline" className={`text-[10px] ${map[estado] ?? ""}`}>
      {labels[estado] ?? estado}
    </Badge>
  );
}

function DocEstadoBadge({ estado }: { estado: string }) {
  const icons: Record<string, React.ElementType> = { PENDIENTE: Clock, EN_REVISION: Eye, APROBADO: Check, RECHAZADO: X };
  const Icon = icons[estado] ?? FileText;
  return (
    <Badge variant="outline" className={`flex items-center gap-1 text-[10px] ${ESTADO_DOC_BADGE[estado] ?? ""}`}>
      <Icon className="h-2.5 w-2.5" />
      {ESTADO_DOC_LABEL[estado] ?? estado}
    </Badge>
  );
}

function DocAdjuntoLink({ storageId, inscripcionId }: { storageId?: Id<"_storage">; inscripcionId: Id<"onboardingClientes"> }) {
  const storageUrl = useArchivoInscripcionUrl("customer", inscripcionId, storageId);
  if (!storageUrl) return null;
  return (
    <a href={storageUrl} target="_blank" rel="noopener noreferrer" title="Ver documento adjunto">
      <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-blue-600">
        <Eye className="h-3.5 w-3.5" />
      </Button>
    </a>
  );
}

// ─── Detail dialog by id ───────────────────────────────────────────────────────
type DetailDialogByIdProps = {
  inscripcionId: Id<"onboardingClientes"> | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus?: (event: Event) => void;
};

/**
 * Detail of one inscription loaded by id, with the same access as the board. It is meant to stack
 * over another dialog (e.g. "Iniciar proceso"): renders nothing while loading, and closes with a
 * toast when the process does not exist or the user cannot see it.
 */
export function DetailDialogById(props: DetailDialogByIdProps) {
  const { inscripcionId, open, onOpenChange } = props;
  // The key resets the boundary (and the dialog state) on every opening and process change.
  return (
    <DetailDialogErrorBoundary key={open ? inscripcionId : null} onError={() => onOpenChange(false)}>
      <DetailDialogByIdContent {...props} />
    </DetailDialogErrorBoundary>
  );
}

function DetailDialogByIdContent({ inscripcionId, open, onOpenChange, onCloseAutoFocus }: DetailDialogByIdProps) {
  const data = useQuery(api.onboarding.customers.obtenerDetalleInscripcion, open && inscripcionId ? { inscripcionId } : "skip");
  // `null` (not `undefined`, which is loading or skipped): the process is gone or no longer visible.
  const sinAcceso = open && data === null;
  const avisadoRef = useRef(false);

  useEffect(() => {
    if (!sinAcceso || avisadoRef.current) return;
    avisadoRef.current = true;
    toast.error("No tienes acceso a este proceso.");
    onOpenChange(false);
  }, [sinAcceso, onOpenChange]);

  if (!data) return null;
  return (
    <DetailDialog
      inscripcion={data.inscripcion}
      open={open}
      onOpenChange={onOpenChange}
      onCloseAutoFocus={onCloseAutoFocus}
      puedeVerAdjuntos={data.puedeVerAdjuntos}
      {...permisosDetalle(data.access, data.inscripcion)}
    />
  );
}

/**
 * Keeps a throwing query inside the dialog (e.g. "No autorizado…" after a visibility change) from
 * crashing the page: it renders nothing and asks the caller to close, so reopening retries.
 */
class DetailDialogErrorBoundary extends Component<{ onError: () => void; children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    console.error("[DetailDialogById] No se pudo mostrar el detalle de la inscripción:", error);
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}
