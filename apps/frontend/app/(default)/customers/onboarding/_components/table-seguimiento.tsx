"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  ArrowUpDown,
  Ban,
  Briefcase,
  Building2,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
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
  MoreHorizontal,
  Phone,
  Search,
  Settings2,
  ShieldAlert,
  Upload,
  User,
  X,
  XCircle,
} from "lucide-react";
import { differenceInDays, format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useEmpresaFilter } from "@/hooks/useEmpresaFilter";
import { useInscripcionDeepLink } from "@/hooks/useInscripcionDeepLink";
import { useUsuariosMap } from "@/hooks/useUsuariosMap";
import { CIIU_ACTIVIDAD } from "@/lib/catalogs/ciiu";
import type { FactorRisk } from "@/lib/onboarding/risk/compute";
import { computeCustomerFactorRisks } from "@/lib/onboarding/risk/customer-matrix";
import { ROLES_CUMPLIMIENTO } from "@/lib/onboarding/roles";
import { CorreoHistorialPanel, CorreoStatusBadge, pickCorreoResumenVisible, renderFaseIHistorialDetalle } from "@/app/(default)/suppliers/onboarding/_components/correo-status";
import DownloadPdfMenu from "./download-pdf-menu";
import { FaseDialogs, type FaseDialogKey, faseDialogFor } from "./fase-dialogs";
import {
  CUSTOMER_MODULO,
  ESTADO_DOC_BADGE,
  ESTADO_DOC_LABEL,
  EVALUACION_CONFIG,
  FASE_CONFIG,
  FASES_ORDERED,
  FASES_TERMINALES,
  getInitials,
  getOnboardingErrorMessage,
  RIESGO_CONFIG,
  rolRequeridoParaFase,
  TipoSolicitudChip,
} from "./ui-config";

export type SeguimientoData = FunctionReturnType<typeof api.onboarding.customers.obtenerInscripcionesConUltimaFase>;
type Inscripcion = SeguimientoData["inscripciones"][number];

export interface ExportRow {
  razonSocial: string;
  tipoSolicitud: string;
  tipoPersona: string;
  tipoDocumento: string;
  numeroDocumento: string;
  contactoEmail: string;
  riesgo: string;
  evaluacion: string;
  servicioSuministrado: string;
  montoAnual: string;
  formaPago: string;
  plazo: string;
  faseActual: string;
  responsableNombre: string;
  responsableProceso: string;
  fechaInicioProceso: string;
  fechaUltimaFase: string;
}

function daysSince(ts: number) {
  return differenceInDays(Date.now(), ts);
}

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

// ─── Phase progress column ──────────────────────────────────────────────────────
function PhaseProgress({ faseActual }: { faseActual: string | undefined }) {
  const isCompleted = faseActual === "COMPLETADO";
  const isRejected = faseActual === "RECHAZADO";
  const isAnulada = faseActual === "ANULADA";
  const currentIdx = FASES_ORDERED.indexOf(faseActual ?? "");
  const total = FASES_ORDERED.length;
  const progress = isCompleted ? 100 : currentIdx >= 0 ? Math.round(((currentIdx + 1) / total) * 100) : 0;
  const done = isCompleted ? total : currentIdx >= 0 ? currentIdx + 1 : 0;

  if (isCompleted) {
    return (
      <div className="space-y-1.5">
        <Badge variant="outline" className="gap-1 border-green-200 bg-green-50 text-[11px] font-medium text-green-700">
          <CheckCircle2 className="h-3 w-3" /> Completado
        </Badge>
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-green-500" style={{ width: "100%" }} />
          </div>
          <span className="font-mono text-[10px] text-slate-400">
            {total}/{total}
          </span>
        </div>
      </div>
    );
  }
  if (isRejected) {
    return (
      <Badge variant="outline" className="gap-1 border-red-200 bg-red-50 text-[11px] font-medium text-red-700">
        <XCircle className="h-3 w-3" /> Rechazado
      </Badge>
    );
  }
  if (isAnulada) {
    return (
      <Badge variant="outline" className="gap-1 border-slate-300 bg-slate-100 text-[11px] font-medium text-slate-700">
        <Ban className="h-3 w-3" /> Anulada
      </Badge>
    );
  }
  if (!faseActual || currentIdx < 0) return <span className="text-xs text-slate-400">—</span>;

  const faseConf = FASE_CONFIG[faseActual];
  return (
    <div className="space-y-1.5">
      <Badge variant="outline" className={`gap-1 border text-[11px] font-medium ${faseConf.border} ${faseConf.bg} ${faseConf.color}`}>
        <Clock className="h-3 w-3" />
        {faseConf.short} · {faseConf.label.split(" ")[0]}
      </Badge>
      <div className="flex items-center gap-2">
        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${progress}%` }} />
        </div>
        <span className="font-mono text-[10px] text-slate-400">
          {done}/{total}
        </span>
      </div>
    </div>
  );
}

// ─── Stats bar ─────────────────────────────────────────────────────────────────
function StatsBar({ rows, faseFiltro, setFaseFiltro }: { rows: Array<{ faseActual?: string }>; faseFiltro: string; setFaseFiltro: (v: string) => void }) {
  const stats = useMemo(() => {
    const counts: Record<string, number> = {};
    rows.forEach((r) => {
      const f = r.faseActual ?? "SIN_FASE";
      counts[f] = (counts[f] ?? 0) + 1;
    });
    const inProgress = rows.filter((r) => r.faseActual && !FASES_TERMINALES.has(r.faseActual)).length;
    return { total: rows.length, inProgress, completado: counts.COMPLETADO ?? 0, rechazado: counts.RECHAZADO ?? 0, anulada: counts.ANULADA ?? 0 };
  }, [rows]);

  const { empresaActiva } = useEmpresaFilter();
  const rolesConfig = useQuery(api.onboarding.roles.obtenerRolesConfig, empresaActiva !== null ? { modulo: CUSTOMER_MODULO, empresa: empresaActiva } : "skip");
  const nombreRol = (rol: string) => rolesConfig?.find((r) => r.rol === rol)?.nombre ?? null;

  const fasesActivas = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => {
      if (r.faseActual) s.add(r.faseActual);
    });
    return s;
  }, [rows]);

  const STAT_CARDS = [
    { label: "Total registros", value: stats.total, icon: FileText, iconBg: "bg-blue-50", iconColor: "text-blue-600", border: "border-blue-100" },
    { label: "En proceso", value: stats.inProgress, icon: Clock, iconBg: "bg-amber-50", iconColor: "text-amber-600", border: "border-amber-100" },
    { label: "Completados", value: stats.completado, icon: CheckCircle2, iconBg: "bg-green-50", iconColor: "text-green-600", border: "border-green-100" },
    { label: "Rechazados", value: stats.rechazado, icon: XCircle, iconBg: "bg-red-50", iconColor: "text-red-500", border: "border-red-100" },
    { label: "Anuladas", value: stats.anulada, icon: Ban, iconBg: "bg-slate-100", iconColor: "text-slate-600", border: "border-slate-200" },
  ];

  const FASES_PIPELINE = [
    { faseKey: "I_ANALISIS_RIESGO", label: "I. Análisis de Riesgo", rol: "Cumplimiento", nombre: nombreRol("CUMPLIMIENTO_LOW_RISK") },
    { faseKey: "II_PENDIENTE_FORMULARIO", label: "II. Formulario Cliente", rol: "Cliente", nombre: null },
    { faseKey: "IIA_PENDIENTE_FIRMA", label: "IIA. Pendiente firma", rol: "Cliente", nombre: null },
    { faseKey: "III_REVISION_DOCUMENTAL", label: "III. Revisión documental", rol: "Cumplimiento", nombre: nombreRol("CUMPLIMIENTO_LOW_RISK") },
    { faseKey: "IIIA_APROBACION_CUMPLIMIENTO", label: "IIIA. Aprobación Cumplimiento", rol: "Cumplimiento", nombre: nombreRol("CUMPLIMIENTO_LOW_RISK") },
    { faseKey: "IV_CREACION_CONTABILIDAD", label: "IV. Creación Contabilidad", rol: "Contabilidad", nombre: nombreRol("CONTABILIDAD") },
    { faseKey: "COMPLETADO", label: "Completados", rol: "", nombre: null },
    { faseKey: "RECHAZADO", label: "Rechazados", rol: "", nombre: null },
    { faseKey: "ANULADA", label: "Anuladas", rol: "", nombre: null },
  ];

  return (
    <div className="space-y-4 border-b border-slate-100 p-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {STAT_CARDS.map(({ label, value, icon: Icon, iconBg, iconColor, border }) => (
          <div key={label} className={`flex items-center gap-3 rounded-xl border bg-white p-4 transition-all hover:shadow-xs ${border}`}>
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${iconBg}`}>
              <Icon className={`h-5 w-5 ${iconColor}`} />
            </div>
            <div>
              <p className="text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
              <p className="text-xs text-slate-500">{label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
        <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400">Filtrar por fase</p>
        <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
          {FASES_PIPELINE.map((f, i) => {
            const activa = fasesActivas.has(f.faseKey);
            const selected = faseFiltro === f.faseKey;
            return (
              <div key={f.faseKey} className="flex shrink-0 items-center gap-1">
                {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300" />}
                <button
                  type="button"
                  disabled={!activa && !selected}
                  onClick={() => setFaseFiltro(selected ? "TODOS" : f.faseKey)}
                  className={`flex flex-col items-start rounded-lg px-3 py-2 text-left transition-all focus-visible:outline-hidden ${
                    selected ? "bg-blue-600 text-white shadow-xs ring-1 ring-blue-500" : activa ? "text-slate-600 hover:bg-white hover:text-slate-900 hover:shadow-xs" : "cursor-default text-slate-400 opacity-35"
                  }`}
                >
                  <span className="text-[11px] font-semibold leading-tight">{f.label}</span>
                  {f.rol && <span className={`text-[10px] leading-tight ${selected ? "opacity-80" : "opacity-60"}`}>{f.nombre ? `${f.rol}: ${f.nombre}` : f.rol}</span>}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Detail dialog ─────────────────────────────────────────────────────────────
function DetailDialog({
  inscripcion,
  open,
  onOpenChange,
  allowDevolver,
  puedeGestionarCorreo,
  puedeVerAdjuntos,
  puedeReemplazarDocs,
}: {
  inscripcion: Inscripcion | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
  const cotizacionUrl = useQuery(api.facturacionStorage.getUrl, cotizacionStorageId && puedeVerAdjuntos ? { storageId: cotizacionStorageId } : "skip");
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
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
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
                        {puedeVerAdjuntos && <DocAdjuntoLink storageId={doc.storageId} />}
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

function DocAdjuntoLink({ storageId }: { storageId?: Id<"_storage"> }) {
  const storageUrl = useQuery(api.facturacionStorage.getUrl, storageId ? { storageId } : "skip");
  if (!storageUrl) return null;
  return (
    <a href={storageUrl} target="_blank" rel="noopener noreferrer" title="Ver documento adjunto">
      <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-blue-600">
        <Eye className="h-3.5 w-3.5" />
      </Button>
    </a>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────
type SortField = "razonSocial" | "riesgo" | "_creationTime" | "faseActual";
type SortDir = "asc" | "desc";

export default function TableSeguimiento({ data, onDataChange }: { data: SeguimientoData | undefined; onDataChange?: (all: ExportRow[], filtered: ExportRow[]) => void }) {
  const inscripciones = data?.inscripciones;
  const access = data?.access;
  const nivel = access?.nivel;
  const modoResponsable = nivel === "responsable";
  const modoSoloConsulta = nivel === "solo_lectura" || nivel === "consulta_creacion";
  const rolesPorEmpresa = useMemo(() => {
    const map = new Map<number, string[]>();
    for (const r of access?.roles ?? []) map.set(r.empresa, [...(map.get(r.empresa) ?? []), r.rol]);
    return map;
  }, [access]);
  const esSoloFinanciero = !access?.isAdmin && (access?.roles.length ?? 0) > 0 && (access?.roles ?? []).every((r) => r.rol === "FINANCIERO");
  const anularProceso = useMutation(api.onboarding.customers.anularProceso);

  const [search, setSearch] = useState("");
  const [faseFiltro, setFaseFiltro] = useState("TODOS");
  const [riesgoFiltro, setRiesgoFiltro] = useState("TODOS");
  const [sortField, setSortField] = useState<SortField>("_creationTime");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  const [detailId, setDetailId] = useState<Id<"onboardingClientes"> | null>(null);
  useInscripcionDeepLink(inscripciones, setDetailId);
  const [anularId, setAnularId] = useState<Id<"onboardingClientes"> | null>(null);
  const [motivoAnulacion, setMotivoAnulacion] = useState("");
  const [anulando, setAnulando] = useState(false);
  const [gestionId, setGestionId] = useState<Id<"onboardingClientes"> | null>(null);
  const [gestionDialog, setGestionDialog] = useState<FaseDialogKey | null>(null);

  function handleGestionar(id: Id<"onboardingClientes">, faseActual: string | undefined) {
    const key = faseDialogFor(faseActual);
    if (!key) return;
    setGestionId(id);
    setGestionDialog(key);
  }

  const rows = useMemo(() => {
    if (!inscripciones) return [];
    return inscripciones.map((ins) => ({
      _id: ins._id,
      _creationTime: ins._creationTime,
      empresa: ins.empresa,
      razonSocial: ins.datos_generales_01.razonSocial ?? "—",
      tipoSolicitud: ins.tipoSolicitud,
      tipoPersona: ins.datos_generales_01.tipoPersona ?? "PERSONA_JURIDICA",
      tipoDocumento: ins.datos_generales_01.tipoDocumento ?? "",
      numeroDocumento: ins.datos_generales_01.numeroDocumento ?? "—",
      contactoEmail: ins.datos_generales_01.email ?? ins.datos_generales_01.representanteLegalEmail ?? "",
      riesgo: ins.matriz_00.riesgo ?? "INDEFINIDO",
      evaluacion: ins.tipoEvaluacion ?? "INDEFINIDO",
      servicioSuministrado: ins.matriz_00.servicioSuministrado ?? "—",
      montoAnual: ins.matriz_00.montoAnual ?? "—",
      formaPago: ins.condicionesPago_12?.formaPago ?? "—",
      plazo: ins.condicionesPago_12?.plazo ?? "—",
      iniciadoPor: ins.matriz_00.responsableId ?? "—",
      faseActual: ins.faseActual as string,
      ultimaFaseInicio: ins.ultimaFaseInicio ?? null,
      correoResumen: ins.correoResumen,
    }));
  }, [inscripciones]);

  const filtered = useMemo(() => {
    let result = [...rows];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (r) => r.razonSocial.toLowerCase().includes(q) || r.numeroDocumento.toLowerCase().includes(q) || r.contactoEmail.toLowerCase().includes(q) || r.servicioSuministrado.toLowerCase().includes(q),
      );
    }
    if (faseFiltro !== "TODOS") result = result.filter((r) => r.faseActual === faseFiltro);
    if (riesgoFiltro !== "TODOS") result = result.filter((r) => r.riesgo === riesgoFiltro);
    result.sort((a, b) => {
      let aVal: string | number = a[sortField] ?? "";
      let bVal: string | number = b[sortField] ?? "";
      if (typeof aVal === "string") aVal = aVal.toLowerCase();
      if (typeof bVal === "string") bVal = bVal.toLowerCase();
      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return result;
  }, [rows, search, faseFiltro, riesgoFiltro, sortField, sortDir]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const userIdsToResolve = useMemo(() => rows.map((r) => r.iniciadoPor), [rows]);
  const userDataMap = useUsuariosMap(userIdsToResolve);

  // `onDataChange` is memoized by the parent (useCallback), so it is safe as a dependency.
  useEffect(() => {
    if (!onDataChange) return;
    function toExportRow(r: (typeof rows)[0]): ExportRow {
      const u = userDataMap[r.iniciadoPor];
      return {
        razonSocial: r.razonSocial,
        tipoSolicitud: r.tipoSolicitud,
        tipoPersona: r.tipoPersona === "PERSONA_NATURAL" ? "Persona Natural" : "Persona Jurídica",
        tipoDocumento: r.tipoDocumento,
        numeroDocumento: r.numeroDocumento,
        contactoEmail: r.contactoEmail,
        riesgo: RIESGO_CONFIG[r.riesgo]?.label ?? r.riesgo,
        evaluacion: EVALUACION_CONFIG[r.evaluacion]?.label ?? r.evaluacion,
        servicioSuministrado: r.servicioSuministrado,
        montoAnual: r.montoAnual,
        formaPago: r.formaPago,
        plazo: r.plazo,
        faseActual: FASE_CONFIG[r.faseActual]?.label ?? r.faseActual ?? "—",
        responsableNombre: u?.nombre ?? r.iniciadoPor,
        responsableProceso: u?.proceso ?? "—",
        fechaInicioProceso: format(new Date(r._creationTime), "dd/MM/yyyy", { locale: es }),
        fechaUltimaFase: r.ultimaFaseInicio ? format(new Date(r.ultimaFaseInicio), "dd/MM/yyyy", { locale: es }) : "—",
      };
    }
    onDataChange(rows.map(toExportRow), filtered.map(toExportRow));
  }, [rows, filtered, userDataMap, onDataChange]);

  const detailInscripcion = useMemo(() => inscripciones?.find((i) => i._id === detailId) ?? null, [inscripciones, detailId]);

  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortField(field);
      setSortDir("asc");
    }
    setPage(1);
  }

  async function handleAnular(id: Id<"onboardingClientes">) {
    if (!motivoAnulacion.trim()) {
      toast.error("Indica la razón de la anulación.");
      return;
    }
    setAnulando(true);
    try {
      await anularProceso({ inscripcionId: id, motivo: motivoAnulacion.trim() });
      toast.success("Inscripción anulada. Quedó disponible para auditoría y sus enlaces fueron revocados.");
      setAnularId(null);
      setMotivoAnulacion("");
    } catch (e) {
      toast.error(getOnboardingErrorMessage(e, "Error al anular la inscripción"));
    } finally {
      setAnulando(false);
    }
  }

  /** Client-side hint: the server enforces the same rule in every phase mutation. */
  function canGestionarRow(row: (typeof rows)[0]) {
    if (!access || modoResponsable || modoSoloConsulta) return false;
    if (!faseDialogFor(row.faseActual)) return false;
    if (access.isAdmin) return true;
    const roles = rolesPorEmpresa.get(row.empresa) ?? [];
    if (row.faseActual === "I_ANALISIS_RIESGO") return roles.some((r) => ROLES_CUMPLIMIENTO.has(r));
    const ins = inscripciones?.find((i) => i._id === row._id);
    const requerido = rolRequeridoParaFase(row.faseActual, ins?.tipoEvaluacion);
    return !!requerido && roles.includes(requerido);
  }

  const isLoading = inscripciones === undefined;
  const puedeAnular = nivel === "full" && !esSoloFinanciero;
  const puedeGestionarCorreo = !!access && !modoSoloConsulta && (access.isAdmin || access.roles.length > 0 || detailInscripcion?.matriz_00.responsableId === access.usuarioId);
  const puedeReemplazarDocs = !!access && (access.isAdmin || detailInscripcion?.matriz_00.responsableId === access.usuarioId);

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
        {!isLoading && (
          <StatsBar
            rows={rows}
            faseFiltro={faseFiltro}
            setFaseFiltro={(v) => {
              setFaseFiltro(v);
              setPage(1);
            }}
          />
        )}

        <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-3.5 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Buscar por nombre, documento, email..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="h-9 rounded-lg pl-9"
            />
          </div>
          <Select
            value={faseFiltro}
            onValueChange={(v) => {
              setFaseFiltro(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="h-9 w-full rounded-lg sm:w-[195px]">
              <SelectValue placeholder="Fase" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="TODOS">Todas las fases</SelectItem>
              <SelectItem value="I_ANALISIS_RIESGO">I · Análisis de Riesgo</SelectItem>
              <SelectItem value="II_PENDIENTE_FORMULARIO">II · Pendiente Formulario</SelectItem>
              <SelectItem value="IIA_PENDIENTE_FIRMA">IIA · Pendiente firma</SelectItem>
              <SelectItem value="III_REVISION_DOCUMENTAL">III · Revisión documental</SelectItem>
              <SelectItem value="IIIA_APROBACION_CUMPLIMIENTO">IIIA · Aprobación Cumplimiento</SelectItem>
              <SelectItem value="IV_CREACION_CONTABILIDAD">IV · Creación Contabilidad</SelectItem>
              <SelectItem value="COMPLETADO">Completados</SelectItem>
              <SelectItem value="RECHAZADO">Rechazados</SelectItem>
              <SelectItem value="ANULADA">Anuladas</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={riesgoFiltro}
            onValueChange={(v) => {
              setRiesgoFiltro(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="h-9 w-full rounded-lg sm:w-[140px]">
              <SelectValue placeholder="Riesgo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="TODOS">Todo el riesgo</SelectItem>
              <SelectItem value="BAJO">Bajo</SelectItem>
              <SelectItem value="MEDIO">Medio</SelectItem>
              <SelectItem value="ALTO">Alto</SelectItem>
              <SelectItem value="SUPERIOR">Superior</SelectItem>
            </SelectContent>
          </Select>
          {!isLoading && (
            <span className="shrink-0 text-xs text-slate-400 sm:pl-1">
              {filtered.length} {filtered.length === 1 ? "registro" : "registros"}
            </span>
          )}
        </div>

        <div className="w-full overflow-x-auto">
          {isLoading ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="h-7 w-7 animate-spin text-blue-500" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center gap-2 text-sm text-slate-400">
              <FileText className="h-8 w-8 text-slate-200" />
              No se encontraron inscripciones con los filtros aplicados.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100 bg-slate-50/70">
                <tr>
                  <th className="px-5 py-3 text-left">
                    <button onClick={() => toggleSort("razonSocial")} className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-slate-400 transition-colors hover:text-slate-700">
                      Cliente <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="px-5 py-3 text-left">
                    <button onClick={() => toggleSort("riesgo")} className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-slate-400 transition-colors hover:text-slate-700">
                      Riesgo <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Evaluación</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Servicio</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Progreso</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Responsable</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Correo</th>
                  <th className="px-5 py-3 text-left">
                    <button onClick={() => toggleSort("_creationTime")} className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-slate-400 transition-colors hover:text-slate-700">
                      Fechas <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className={modoSoloConsulta ? "w-32 px-3 py-3" : "w-12 px-3 py-3"} />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {paginated.map((row) => {
                  const riesgoConf = RIESGO_CONFIG[row.riesgo] ?? RIESGO_CONFIG.INDEFINIDO;
                  const evaluacionConf = EVALUACION_CONFIG[row.evaluacion] ?? EVALUACION_CONFIG.INDEFINIDO;
                  const days = daysSince(row._creationTime);
                  const isUrgent = days > 14 && !FASES_TERMINALES.has(row.faseActual);
                  const userData = userDataMap[row.iniciadoPor];
                  const displayName = userData?.nombre ?? row.iniciadoPor;
                  const displayProceso = userData?.proceso ?? "—";
                  const canGestionar = canGestionarRow(row);
                  const visible = pickCorreoResumenVisible({ faseActual: row.faseActual, form: row.correoResumen?.form, sign: row.correoResumen?.sign });
                  const needsManage =
                    (row.faseActual === "II_PENDIENTE_FORMULARIO" || row.faseActual === "IIA_PENDIENTE_FIRMA") &&
                    (!visible.resumen || visible.resumen.estado === "FALLIDO" || visible.resumen.estado === "PENDIENTE");

                  return (
                    <tr key={row._id} className="group cursor-pointer transition-colors hover:bg-slate-50/80" onDoubleClick={() => setDetailId(row._id)}>
                      <td className="max-w-[220px] px-5 py-3.5">
                        <p className="truncate font-semibold text-slate-800 transition-colors group-hover:text-blue-600" title={row.razonSocial}>
                          {row.razonSocial}
                        </p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                          <span className="font-mono text-xs text-slate-400">
                            {row.tipoDocumento} {row.numeroDocumento}
                          </span>
                          <span className="rounded-xs border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-400">{row.tipoPersona === "PERSONA_NATURAL" ? "Natural" : "Jurídica"}</span>
                          <TipoSolicitudChip tipoSolicitud={row.tipoSolicitud} className="rounded-xs" />
                        </div>
                        {row.contactoEmail && (
                          <p className="mt-0.5 truncate text-xs text-slate-400" title={row.contactoEmail}>
                            {row.contactoEmail}
                          </p>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${riesgoConf.badge}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${riesgoConf.dot}`} />
                          {riesgoConf.label}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${evaluacionConf.badge}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${evaluacionConf.dot}`} />
                          {evaluacionConf.label}
                        </span>
                      </td>
                      <td className="max-w-[180px] px-5 py-3.5">
                        <p className="truncate text-sm font-medium text-slate-700" title={row.servicioSuministrado}>
                          {row.servicioSuministrado}
                        </p>
                        {row.montoAnual && row.montoAnual !== "—" && <p className="mt-0.5 text-xs text-slate-400">Monto: {row.montoAnual}</p>}
                        {row.formaPago !== "—" && (
                          <p className="mt-0.5 text-xs text-slate-400">
                            {row.formaPago} · {row.plazo}
                          </p>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <PhaseProgress faseActual={row.faseActual} />
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[10px] font-bold text-blue-600">{getInitials(displayName)}</div>
                          <div className="min-w-0">
                            <span className="block max-w-[110px] truncate text-xs text-slate-600" title={displayName}>
                              {displayName}
                            </span>
                            <span className="block max-w-[110px] truncate text-[10px] text-slate-400" title={displayProceso}>
                              {displayProceso}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="max-w-[180px] px-5 py-3.5">
                        <div className="space-y-1">
                          <CorreoStatusBadge handoffLabel={visible.handoffLabel} estado={visible.resumen?.estado ?? "sin_registro"} email={visible.resumen?.email} failureDetail={visible.resumen?.falloResumen} compact />
                          {needsManage && !modoSoloConsulta ? (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setDetailId(row._id);
                              }}
                              className="text-[11px] font-medium text-blue-700 hover:underline"
                            >
                              Gestionar
                            </button>
                          ) : null}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3.5">
                        <div className="space-y-0.5">
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Inicio proceso</p>
                            <p className={`text-xs font-medium ${isUrgent ? "text-orange-500" : "text-slate-700"}`}>
                              {format(new Date(row._creationTime), "dd MMM yyyy", { locale: es })}
                              {isUrgent && <span className="ml-1">⚠</span>}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Inicio última fase</p>
                            <p className="text-xs text-slate-500">{row.ultimaFaseInicio ? format(new Date(row.ultimaFaseInicio), "dd MMM yyyy", { locale: es }) : "—"}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3.5">
                        {modoSoloConsulta ? (
                          <Button variant="ghost" size="sm" className="h-8 whitespace-nowrap rounded-lg px-2 text-blue-600 hover:bg-blue-50 hover:text-blue-700" onClick={() => setDetailId(row._id)}>
                            <Eye className="mr-1.5 h-3.5 w-3.5" />
                            Ver detalles
                          </Button>
                        ) : (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52">
                              <DropdownMenuItem onClick={() => setDetailId(row._id)}>
                                <Eye className="mr-2 h-3.5 w-3.5" /> Ver detalles
                              </DropdownMenuItem>
                              {canGestionar && (
                                <DropdownMenuItem onClick={() => handleGestionar(row._id, row.faseActual)}>
                                  <Settings2 className="mr-2 h-3.5 w-3.5" /> Gestionar fase
                                </DropdownMenuItem>
                              )}
                              <DownloadPdfMenu inscripcionId={row._id} />
                              {puedeAnular && row.faseActual !== "ANULADA" && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem className="text-red-600 focus:bg-red-50 focus:text-red-600" onClick={() => setAnularId(row._id)}>
                                    <Ban className="mr-2 h-3.5 w-3.5" /> Anular proceso
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {!isLoading && totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3">
            <span className="text-xs text-slate-400">
              Página {page} de {totalPages}
            </span>
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      <DetailDialog
        inscripcion={detailInscripcion}
        open={!!detailId}
        onOpenChange={(open) => !open && setDetailId(null)}
        allowDevolver={puedeAnular}
        puedeGestionarCorreo={puedeGestionarCorreo}
        puedeVerAdjuntos={data?.puedeVerAdjuntos === true}
        puedeReemplazarDocs={puedeReemplazarDocs}
      />

      <FaseDialogs
        inscripcionId={gestionId}
        dialog={gestionDialog}
        onClose={() => {
          setGestionDialog(null);
          setGestionId(null);
        }}
      />

      <Dialog
        open={!!anularId}
        onOpenChange={(open) => {
          if (!open) {
            setAnularId(null);
            setMotivoAnulacion("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Anular inscripción</DialogTitle>
            <DialogDescription>El proceso quedará en estado ANULADA, sus enlaces públicos dejarán de funcionar y seguirá visible en el listado y en el detalle para auditoría.</DialogDescription>
          </DialogHeader>
          <Textarea value={motivoAnulacion} onChange={(e) => setMotivoAnulacion(e.target.value)} placeholder="Razón de la anulación..." rows={3} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAnularId(null)} disabled={anulando}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={() => anularId && handleAnular(anularId)} disabled={anulando || !motivoAnulacion.trim()}>
              {anulando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Ban className="mr-1 h-4 w-4" />}
              Anular
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
