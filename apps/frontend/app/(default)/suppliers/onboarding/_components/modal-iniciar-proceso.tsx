"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "convex/react";
import { Building2, Check, FileText, FlaskConical, Loader2, Sparkles, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEmpresaFilter } from "@/hooks/useEmpresaFilter";
import { CIIU_ACTIVIDAD } from "@/lib/catalogs/ciiu";
import { ACME_DEMO, ACME_DEMO_PROVEEDOR, fillEmptyFields } from "@/lib/onboarding/acme-demo";
import { computeSupplierRisk, SUPPLIER_MONTO_OPTIONS, SUPPLIER_SECTOR_OPTIONS } from "@/lib/onboarding/risk/supplier-matrix";
import {
  JURISDICCION_INTERNACIONAL_OPTIONS,
  JURISDICCION_NACIONAL_OPTIONS,
  TIPO_DOCUMENTO_OPTIONS,
  TIPO_PERSONA_LABELS,
  TIPO_PERSONA_OPTIONS,
} from "@/lib/onboarding/risk/shared";
import { buildSiesaProveedoresSearchParams, filterExactProveedoresSiesa, isNitConsultaReady, type ProveedoresSiesaBusquedaResponse } from "@/lib/siesa-proveedores";
import { cn } from "@/lib/utils";
import { getOnboardingErrorMessage, RIESGO_BADGE_SOLID } from "./ui-config";

// ─── Schema ───────────────────────────────────────────────────────────────────
const TIPO_DOC = TIPO_DOCUMENTO_OPTIONS;
const TIPO_PERSONA = TIPO_PERSONA_OPTIONS;

const schema = z.object({
  tipoProveedor: z.string(),
  tipoPersona: z.enum(TIPO_PERSONA),
  tipoDocumento: z.enum(TIPO_DOC),
  numeroDocumento: z.string().min(1, "Requerido"),
  razonSocial: z.string().min(1, "Requerido"),
  contactoNombre: z.string().min(1, "Requerido"),
  contactoEmail: z.string().email("Email inválido"),
  contactoCelular: z.string().min(1, "Requerido"),
  servicioSuministrado: z.string().min(1, "Requerido"),
  montoAnual: z.string().min(1, "Requerido"),
  codigoCiiu: z.string().min(1, "Requerido"),
  actividadEconomicaPrincipal: z.string().min(1, "Requerido"),
  codigoCiiuSecundario: z.string(),
  actividadEconomicaSecundaria: z.string(),
  sectorEconomico: z.string().min(1, "Requerido"),
  jurisdiccionNacional: z.string(),
  jurisdiccionInternacional: z.string(),
  isPep: z.boolean(),
  listas: z.string(),
  direccion: z.string().optional(),
  ciudad: z.string().optional(),
  departamento: z.string().optional(),
  representanteLegalNombre: z.string().optional(),
  representanteLegalEmail: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;
type Step = "idle" | "selected" | "processing" | "done";
type ProcessingPhase = "uploading" | "extracting";
type TipoSolicitud = "INSCRIPCIÓN" | "ACTUALIZACIÓN";

interface UsageInfo {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost_usd: number;
}

// Test data for the "Completar con ACME" buttons.
const ACME_VALUES: FormValues = {
  tipoProveedor: "GENERAL",
  tipoPersona: "PERSONA_JURIDICA",
  tipoDocumento: "NIT",
  numeroDocumento: ACME_DEMO.nit,
  razonSocial: ACME_DEMO.razonSocial,
  contactoNombre: ACME_DEMO.contactoNombre,
  contactoEmail: ACME_DEMO.contactoEmail,
  contactoCelular: ACME_DEMO.contactoCelular,
  ...ACME_DEMO_PROVEEDOR,
  codigoCiiu: ACME_DEMO.codigoCiiu,
  actividadEconomicaPrincipal: CIIU_ACTIVIDAD[ACME_DEMO.codigoCiiu] ?? "",
  codigoCiiuSecundario: ACME_DEMO.codigoCiiuSecundario,
  actividadEconomicaSecundaria: CIIU_ACTIVIDAD[ACME_DEMO.codigoCiiuSecundario] ?? "",
  jurisdiccionNacional: ACME_DEMO.jurisdiccionNacional,
  jurisdiccionInternacional: "",
  isPep: false,
  listas: "NO",
  direccion: ACME_DEMO.direccion,
  ciudad: ACME_DEMO.ciudad,
  departamento: ACME_DEMO.departamento,
  representanteLegalNombre: ACME_DEMO.representanteLegalNombre,
  representanteLegalEmail: ACME_DEMO.representanteLegalEmail,
};

const ACME_GROUPS = [
  ["codigoCiiu", "actividadEconomicaPrincipal"],
  ["codigoCiiuSecundario", "actividadEconomicaSecundaria"],
  ["jurisdiccionNacional", "jurisdiccionInternacional"],
] as const;

function mapTipoDoc(raw: string | null | undefined): (typeof TIPO_DOC)[number] {
  const s = (raw ?? "").toUpperCase();
  if (s.includes("NIT") || s === "31") return "NIT";
  if (s.includes("PASAPORTE") || s === "41") return "P.A.";
  if (s.includes("EXTRANJERÍA") || s.includes("EXTRANJERIA") || s === "22") return "C.E";
  return "C.C.";
}

/**
 * Checks the Nest supplier catalog (`/api/proveedores/search`) for an exact NIT match.
 * An existing supplier turns the request into an ACTUALIZACIÓN.
 */
async function proveedorExisteEnCatalogo(nit: string, empresa: number): Promise<boolean> {
  if (!isNitConsultaReady(nit)) return false;
  const params = buildSiesaProveedoresSearchParams({ nit, empresa });
  const res = await fetch(`/api/proveedores/search?${params.toString()}`, { credentials: "include" });
  if (res.status === 401) throw new Error("No autorizado");
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "Error al consultar el catálogo de proveedores");
  }
  const data = (await res.json()) as ProveedoresSiesaBusquedaResponse | null;
  return filterExactProveedoresSiesa(data?.proveedores ?? [], nit).length > 0;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">{children}</p>;
}

function AiBadge() {
  return (
    <span className="ml-1.5 inline-flex items-center gap-0.5 rounded-xs bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-600">
      <Sparkles className="h-2.5 w-2.5" /> IA
    </span>
  );
}

const LABEL_CLS = "text-xs font-semibold uppercase tracking-wide text-slate-500";
const INPUT_CLS = "border-slate-200 bg-slate-50";

interface ModalIniciarProcesoProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Starts a supplier process: upload the RUT, optionally prefill the form with AI extraction,
 * compute the risk live and create the inscription (Fase I auto-completed, Fase II pending).
 */
export default function ModalIniciarProceso({ open, onOpenChange }: ModalIniciarProcesoProps) {
  const [step, setStep] = useState<Step>("idle");
  const [phase, setPhase] = useState<ProcessingPhase>("uploading");
  const [phasesDone, setPhasesDone] = useState<ProcessingPhase[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [rutStorageId, setRutStorageId] = useState<Id<"_storage"> | null>(null);
  const [autoFilled, setAutoFilled] = useState<Partial<Record<keyof FormValues, boolean>>>({});
  const [extractUsage, setExtractUsage] = useState<UsageInfo | null>(null);
  const [extractSkipped, setExtractSkipped] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [tipoSolicitud, setTipoSolicitud] = useState<TipoSolicitud | null>(null);
  const [checkingCatalogo, setCheckingCatalogo] = useState(false);

  const { empresaActiva } = useEmpresaFilter();
  const generateUploadUrl = useMutation(api.facturacionStorage.generateUploadUrl);
  const crearMatrizRiesgo = useMutation(api.onboarding.suppliers.crearMatrizRiesgo);
  const tiposProveedor = useQuery(
    api.onboarding.suppliersTipos.obtenerTiposProveedor,
    open && empresaActiva !== null ? { empresa: empresaActiva, soloActivos: true } : "skip",
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      tipoProveedor: "GENERAL",
      tipoPersona: "PERSONA_JURIDICA",
      tipoDocumento: "NIT",
      numeroDocumento: "",
      razonSocial: "",
      contactoNombre: "",
      contactoEmail: "",
      contactoCelular: "",
      servicioSuministrado: "",
      montoAnual: "",
      codigoCiiu: "",
      actividadEconomicaPrincipal: "",
      codigoCiiuSecundario: "",
      actividadEconomicaSecundaria: "",
      sectorEconomico: "",
      jurisdiccionNacional: "",
      jurisdiccionInternacional: "",
      isPep: false,
      listas: "NO",
      direccion: "",
      ciudad: "",
      departamento: "",
      representanteLegalNombre: "",
      representanteLegalEmail: "",
    },
  });

  // CIIU auto-lookup on manual edit (skipped right after an AI fill so its value is kept).
  const codigoCiiu = form.watch("codigoCiiu");
  const codigoCiiuSecundario = form.watch("codigoCiiuSecundario");
  const skipCiiuLookup = useRef<{ principal: boolean; secundario: boolean }>({ principal: false, secundario: false });

  useEffect(() => {
    if (skipCiiuLookup.current.principal) {
      skipCiiuLookup.current.principal = false;
      return;
    }
    if (step !== "done") return;
    form.setValue("actividadEconomicaPrincipal", CIIU_ACTIVIDAD[codigoCiiu ?? ""] ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codigoCiiu]);

  useEffect(() => {
    if (skipCiiuLookup.current.secundario) {
      skipCiiuLookup.current.secundario = false;
      return;
    }
    if (step !== "done") return;
    form.setValue("actividadEconomicaSecundaria", CIIU_ACTIVIDAD[codigoCiiuSecundario ?? ""] ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codigoCiiuSecundario]);

  // Live risk
  const risk = computeSupplierRisk({
    montoAnual: form.watch("montoAnual"),
    sectorEconomico: form.watch("sectorEconomico"),
    jurisdiccionNacional: form.watch("jurisdiccionNacional"),
    jurisdiccionInternacional: form.watch("jurisdiccionInternacional"),
    isPep: form.watch("isPep"),
    listas: form.watch("listas"),
  });

  const checkCatalogoForDoc = async (doc: string) => {
    if (!doc.trim() || empresaActiva === null) {
      setTipoSolicitud(null);
      return;
    }
    setCheckingCatalogo(true);
    setTipoSolicitud(null);
    try {
      const existe = await proveedorExisteEnCatalogo(doc, empresaActiva);
      setTipoSolicitud(existe ? "ACTUALIZACIÓN" : "INSCRIPCIÓN");
    } catch {
      setTipoSolicitud(null);
    } finally {
      setCheckingCatalogo(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    if (selected.size > 10 * 1024 * 1024) {
      toast.error("El archivo excede 10 MB");
      return;
    }
    if (!["application/pdf", "image/jpeg", "image/png"].includes(selected.type)) {
      toast.error("Solo se aceptan PDF o imágenes");
      return;
    }
    setFile(selected);
    setStep("selected");
  };

  function aplicarExtraccion(data: Record<string, unknown>) {
    const str = (k: string) => (typeof data[k] === "string" && (data[k] as string).trim() ? (data[k] as string).trim() : null);
    const isJuridica = data.tipo_contribuyente === "juridica";
    const filled: Partial<Record<keyof FormValues, boolean>> = {};

    if (data.tipo_contribuyente) {
      form.setValue("tipoPersona", isJuridica ? "PERSONA_JURIDICA" : "PERSONA_NATURAL");
      filled.tipoPersona = true;
    }
    if (isJuridica) {
      form.setValue("tipoDocumento", "NIT");
      filled.tipoDocumento = true;
      const nit = str("nit");
      if (nit) {
        form.setValue("numeroDocumento", nit);
        filled.numeroDocumento = true;
        void checkCatalogoForDoc(nit);
      }
      const razon = str("razon_social");
      if (razon) {
        form.setValue("razonSocial", razon);
        filled.razonSocial = true;
      }
    } else {
      form.setValue("tipoDocumento", mapTipoDoc(str("tipo_documento")));
      filled.tipoDocumento = true;
      const numero = str("numero_identificacion");
      if (numero) {
        form.setValue("numeroDocumento", numero);
        filled.numeroDocumento = true;
        void checkCatalogoForDoc(numero);
      }
      const nombre = [str("primer_nombre"), str("primer_apellido"), str("segundo_apellido")].filter(Boolean).join(" ");
      if (nombre) {
        form.setValue("razonSocial", nombre);
        filled.razonSocial = true;
      }
    }
    const ciiu = str("actividad_principal_codigo");
    if (ciiu) {
      skipCiiuLookup.current.principal = true;
      form.setValue("codigoCiiu", ciiu);
      form.setValue("actividadEconomicaPrincipal", CIIU_ACTIVIDAD[ciiu] ?? "");
      filled.codigoCiiu = true;
      filled.actividadEconomicaPrincipal = true;
    }
    const ciiuSec = str("actividad_secundaria_codigo");
    if (ciiuSec) {
      skipCiiuLookup.current.secundario = true;
      form.setValue("codigoCiiuSecundario", ciiuSec);
      form.setValue("actividadEconomicaSecundaria", CIIU_ACTIVIDAD[ciiuSec] ?? "");
      filled.codigoCiiuSecundario = true;
      filled.actividadEconomicaSecundaria = true;
    }
    const direccion = str("direccion");
    if (direccion) {
      form.setValue("direccion", direccion);
      filled.direccion = true;
    }
    const municipio = str("municipio");
    if (municipio) {
      form.setValue("ciudad", municipio);
      filled.ciudad = true;
    }
    const departamento = str("departamento");
    if (departamento) {
      form.setValue("departamento", departamento);
      filled.departamento = true;
    }
    const rl = str("nombre_representante_legal");
    if (rl) {
      form.setValue("representanteLegalNombre", rl);
      filled.representanteLegalNombre = true;
    }
    setAutoFilled(filled);
  }

  // Fills only the empty fields, so anything typed or read from the RUT is kept. The defaults stay
  // untouched so closing the modal still clears the form.
  function completarConAcme() {
    const actual = form.getValues();
    const valores = fillEmptyFields(actual, ACME_VALUES, ACME_GROUPS);
    form.reset(valores, { keepDefaultValues: true });
    if (valores.numeroDocumento !== actual.numeroDocumento) void checkCatalogoForDoc(valores.numeroDocumento);
  }

  function continuarSinRutConAcme() {
    setRutStorageId(null);
    setExtractSkipped("Sin RUT: se cargaron datos de prueba de ACME. Revísalos antes de continuar.");
    completarConAcme();
    setStep("done");
  }

  // Upload → extract (optional) → form
  const handleProcess = async () => {
    if (!file) return;
    if (empresaActiva === null) {
      toast.error("Selecciona una empresa para iniciar el proceso");
      return;
    }
    setStep("processing");
    setPhasesDone([]);
    setExtractSkipped(null);

    try {
      setPhase("uploading");
      const uploadUrl = await generateUploadUrl();
      const res = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": file.type }, body: file });
      if (!res.ok) throw new Error("Error al subir el archivo");
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
      setRutStorageId(storageId);
      setPhasesDone(["uploading"]);

      setPhase("extracting");
      const extractRes = await fetch("/api/extract-rut", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storageId }),
      });
      if (extractRes.status === 503) {
        // Extraction not configured: continue with manual entry.
        setExtractSkipped("La extracción automática con IA no está configurada. Completa los datos manualmente.");
        setAutoFilled({});
      } else if (!extractRes.ok) {
        const body = (await extractRes.json().catch(() => ({}))) as { error?: string };
        setExtractSkipped(`No se pudo leer el RUT automáticamente${body.error ? ` (${body.error})` : ""}. Completa los datos manualmente.`);
        setAutoFilled({});
      } else {
        const extractData = (await extractRes.json()) as Record<string, unknown> & { _usage?: UsageInfo };
        const { _usage, ...data } = extractData;
        if (_usage) setExtractUsage(_usage);
        aplicarExtraccion(data);
      }

      setPhasesDone(["uploading", "extracting"]);
      setStep("done");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al procesar el archivo");
      setStep("selected");
    }
  };

  const handleClose = () => {
    form.reset();
    setStep("idle");
    setFile(null);
    setRutStorageId(null);
    setAutoFilled({});
    setExtractUsage(null);
    setExtractSkipped(null);
    setPhasesDone([]);
    setTipoSolicitud(null);
    setCheckingCatalogo(false);
    onOpenChange(false);
  };

  const onSubmit = form.handleSubmit(async (values) => {
    if (empresaActiva === null) {
      toast.error("Selecciona una empresa para iniciar el proceso");
      return;
    }
    if (risk.riesgo === "INDEFINIDO" || risk.tipoEvaluacion === "INDEFINIDO") {
      toast.error("Completa los factores de riesgo antes de iniciar el proceso.");
      return;
    }
    try {
      let tipoSolicitudFinal: TipoSolicitud = tipoSolicitud ?? "INSCRIPCIÓN";
      if (!tipoSolicitud) {
        try {
          tipoSolicitudFinal = (await proveedorExisteEnCatalogo(values.numeroDocumento, empresaActiva)) ? "ACTUALIZACIÓN" : "INSCRIPCIÓN";
        } catch {
          tipoSolicitudFinal = "INSCRIPCIÓN";
        }
      }

      await crearMatrizRiesgo({
        empresa: empresaActiva,
        tipoSolicitud: tipoSolicitudFinal,
        tipoProveedor: values.tipoProveedor,
        tipoPersona: values.tipoPersona,
        tipoDocumento: values.tipoDocumento,
        numeroDocumento: values.numeroDocumento,
        razonSocial: values.razonSocial,
        contactoNombre: values.contactoNombre,
        contactoEmail: values.contactoEmail,
        contactoCelular: values.contactoCelular,
        servicioSuministrado: values.servicioSuministrado,
        montoAnual: values.montoAnual,
        codigoCiiu: values.codigoCiiu,
        actividadEconomicaPrincipal: values.actividadEconomicaPrincipal,
        codigoCiiuSecundario: values.codigoCiiuSecundario,
        actividadEconomicaSecundaria: values.actividadEconomicaSecundaria,
        sectorEconomico: values.sectorEconomico,
        jurisdiccionNacional: values.jurisdiccionNacional,
        jurisdiccionInternacional: values.jurisdiccionInternacional,
        isPep: values.isPep,
        listas: values.listas,
        rutStorageId: rutStorageId ?? undefined,
        direccion: values.direccion || undefined,
        ciudad: values.ciudad || undefined,
        departamento: values.departamento || undefined,
        representanteLegalNombre: values.representanteLegalNombre || undefined,
        representanteLegalEmail: values.representanteLegalEmail || undefined,
      });
      toast.success(
        tipoSolicitudFinal === "ACTUALIZACIÓN"
          ? "Actualización iniciada. Se envió la invitación al formulario por correo."
          : "Inscripción iniciada. Se envió la invitación al formulario por correo.",
      );
      handleClose();
    } catch (err) {
      toast.error(getOnboardingErrorMessage(err, "Error al crear inscripción"));
    }
  });

  const ai = (field: keyof FormValues) => autoFilled[field];

  const renderUploadArea = () => (
    <div className="flex flex-col items-center justify-center gap-6 py-10">
      <label
        htmlFor="rut-file"
        className={cn(
          "flex w-full cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-8 py-10 text-center transition-colors",
          step === "selected" ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-slate-100",
        )}
      >
        <div className={cn("flex h-14 w-14 items-center justify-center rounded-full", step === "selected" ? "bg-blue-100" : "bg-slate-200")}>
          {step === "selected" ? <FileText className="h-7 w-7 text-blue-600" /> : <Upload className="h-7 w-7 text-slate-400" />}
        </div>
        {step === "selected" && file ? (
          <div>
            <p className="font-semibold text-blue-800">{file.name}</p>
            <p className="mt-0.5 text-xs text-blue-500">
              {(file.size / 1024).toFixed(0)} KB · {file.type.includes("pdf") ? "PDF" : "Imagen"}
            </p>
          </div>
        ) : (
          <div>
            <p className="font-medium text-slate-700">Suba el RUT del proveedor (últimos 30 días)</p>
            <p className="mt-0.5 text-xs text-slate-400">PDF, JPG o PNG · Máx. 10 MB</p>
          </div>
        )}
        <input id="rut-file" ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={handleFileChange} className="hidden" />
      </label>

      {step === "idle" && (
        <Button type="button" variant="ghost" className="text-slate-500" onClick={continuarSinRutConAcme}>
          <FlaskConical className="h-4 w-4" /> Continuar sin RUT con datos de ACME
        </Button>
      )}

      {step === "selected" && (
        <div className="flex w-full items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            className="flex-1 text-slate-500"
            onClick={() => {
              setFile(null);
              setStep("idle");
              if (fileInputRef.current) fileInputRef.current.value = "";
            }}
          >
            <X className="mr-2 h-4 w-4" /> Cambiar archivo
          </Button>
          <Button type="button" className="flex-1 gap-2" onClick={handleProcess}>
            <Check className="h-4 w-4" /> Confirmar y procesar
          </Button>
        </div>
      )}
    </div>
  );

  const renderProcessing = () => {
    const steps: { id: ProcessingPhase; label: string; sublabel: string }[] = [
      { id: "uploading", label: "Subiendo RUT", sublabel: "Guardando el archivo de forma segura" },
      { id: "extracting", label: "Analizando con IA", sublabel: "Leyendo y extrayendo los datos del documento" },
    ];
    return (
      <div className="flex flex-col items-center gap-8 py-12">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-50">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
        <div className="w-full max-w-xs space-y-4">
          {steps.map((s, idx) => {
            const done = phasesDone.includes(s.id);
            const active = phase === s.id && !done;
            return (
              <div key={s.id} className="flex items-center gap-4">
                <div
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                    done ? "border-green-500 bg-green-500 text-white" : active ? "border-blue-500 bg-blue-50 text-blue-600" : "border-slate-200 bg-white text-slate-300",
                  )}
                >
                  {done ? <Check className="h-4 w-4" /> : active ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="text-xs font-bold">{idx + 1}</span>}
                </div>
                <div>
                  <p className={cn("text-sm font-semibold", done ? "text-green-700" : active ? "text-blue-700" : "text-slate-400")}>{s.label}</p>
                  <p className="text-xs text-slate-400">{s.sublabel}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderEmpresaRequired = () => (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <Building2 className="h-8 w-8 text-slate-300" />
      <p className="text-sm font-medium text-slate-500">Selecciona una empresa para iniciar el proceso.</p>
    </div>
  );

  const tipos = tiposProveedor && tiposProveedor.length > 0 ? tiposProveedor : [{ key: "GENERAL", label: "General" }];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <DialogTitle>Iniciar Proceso de {tipoSolicitud === "ACTUALIZACIÓN" ? "Actualización" : "Inscripción"}</DialogTitle>
            {checkingCatalogo && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
            {!checkingCatalogo && tipoSolicitud !== null && (
              <span
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
                  tipoSolicitud === "ACTUALIZACIÓN" ? "border-amber-200 bg-amber-50 text-amber-700" : "border-green-200 bg-green-50 text-green-700",
                )}
              >
                {tipoSolicitud}
              </span>
            )}
          </div>
        </DialogHeader>

        {empresaActiva === null ? (
          renderEmpresaRequired()
        ) : (
          <>
            {(step === "idle" || step === "selected") && <div className="px-6">{renderUploadArea()}</div>}
            {step === "processing" && renderProcessing()}

            {step === "done" && (
              <Form {...form}>
                <form onSubmit={onSubmit} className="flex flex-1 flex-col overflow-hidden">
                  <div className="flex-1 space-y-6 overflow-y-auto px-6 py-4">
                    {extractSkipped ? (
                      <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs text-amber-700">{extractSkipped}</div>
                    ) : (
                      <div className="overflow-hidden rounded-xl border border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50">
                        <div className="flex items-start gap-3 px-4 py-3">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-100">
                            <Sparkles className="h-3.5 w-3.5 text-blue-600" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-blue-800">Completado automáticamente con IA</p>
                            <p className="mt-0.5 text-xs leading-relaxed text-blue-600/80">
                              Los campos con <AiBadge /> fueron extraídos del RUT. Verifique la información antes de continuar.
                            </p>
                          </div>
                          {extractUsage && (
                            <div className="shrink-0 text-right">
                              <p className="text-[10px] font-medium text-blue-500">{extractUsage.total_tokens} tokens</p>
                              <p className="text-[10px] text-blue-400">${extractUsage.cost_usd.toFixed(5)}</p>
                            </div>
                          )}
                        </div>
                        <div className="h-0.5 bg-gradient-to-r from-blue-200 via-indigo-300 to-blue-200 opacity-60" />
                      </div>
                    )}

                    <div className="space-y-3">
                      <SectionLabel>Tipo de Proveedor</SectionLabel>
                      <FormField
                        control={form.control}
                        name="tipoProveedor"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className={LABEL_CLS}>Tipo de proveedor</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger className={INPUT_CLS}>
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {tipos.map((t) => (
                                  <SelectItem key={t.key} value={t.key}>
                                    {t.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="space-y-3">
                      <SectionLabel>Identificación</SectionLabel>
                      <div className="grid grid-cols-2 gap-3">
                        <FormField
                          control={form.control}
                          name="tipoPersona"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className={LABEL_CLS}>Tipo de persona{ai("tipoPersona") && <AiBadge />}</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                  <SelectTrigger className={cn(INPUT_CLS, ai("tipoPersona") && "ring-1 ring-blue-300")}>
                                    <SelectValue />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {TIPO_PERSONA_OPTIONS.map((opt) => (
                                    <SelectItem key={opt} value={opt}>
                                      {TIPO_PERSONA_LABELS[opt]}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="tipoDocumento"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className={LABEL_CLS}>Tipo documento{ai("tipoDocumento") && <AiBadge />}</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                  <SelectTrigger className={cn(INPUT_CLS, ai("tipoDocumento") && "ring-1 ring-blue-300")}>
                                    <SelectValue />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {TIPO_DOCUMENTO_OPTIONS.map((opt) => (
                                    <SelectItem key={opt} value={opt}>
                                      {opt}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="numeroDocumento"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className={LABEL_CLS}>Número de documento{ai("numeroDocumento") && <AiBadge />}</FormLabel>
                              <FormControl>
                                <Input
                                  className={cn(INPUT_CLS, ai("numeroDocumento") && "ring-1 ring-blue-300")}
                                  {...field}
                                  onChange={(e) => {
                                    field.onChange(e);
                                    setTipoSolicitud(null);
                                  }}
                                  onBlur={(e) => {
                                    field.onBlur();
                                    void checkCatalogoForDoc(e.target.value);
                                  }}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="razonSocial"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className={LABEL_CLS}>Razón social / Nombre{ai("razonSocial") && <AiBadge />}</FormLabel>
                              <FormControl>
                                <Input className={cn(INPUT_CLS, ai("razonSocial") && "ring-1 ring-blue-300")} {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>

                    <div className="space-y-3">
                      <SectionLabel>Contacto</SectionLabel>
                      <div className="grid grid-cols-3 gap-3">
                        {(["contactoNombre", "contactoEmail", "contactoCelular"] as const).map((name) => (
                          <FormField
                            key={name}
                            control={form.control}
                            name={name}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className={LABEL_CLS}>{name === "contactoNombre" ? "Nombre" : name === "contactoEmail" ? "Email" : "Celular"}</FormLabel>
                                <FormControl>
                                  <Input type={name === "contactoEmail" ? "email" : "text"} className={INPUT_CLS} {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        ))}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <SectionLabel>Representante legal (opcional)</SectionLabel>
                      <div className="grid grid-cols-2 gap-3">
                        <FormField
                          control={form.control}
                          name="representanteLegalNombre"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className={LABEL_CLS}>Nombre{ai("representanteLegalNombre") && <AiBadge />}</FormLabel>
                              <FormControl>
                                <Input className={cn(INPUT_CLS, ai("representanteLegalNombre") && "ring-1 ring-blue-300")} {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="representanteLegalEmail"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className={LABEL_CLS}>Email (para la firma)</FormLabel>
                              <FormControl>
                                <Input type="email" placeholder="El proveedor podrá completarlo en el formulario" className={INPUT_CLS} {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>

                    <div className="space-y-3">
                      <SectionLabel>Actividad económica</SectionLabel>
                      <div className="grid grid-cols-2 gap-3">
                        <FormField
                          control={form.control}
                          name="codigoCiiu"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className={LABEL_CLS}>CIIU principal{ai("codigoCiiu") && <AiBadge />}</FormLabel>
                              <FormControl>
                                <Input placeholder="Ej: 6201" className={cn(INPUT_CLS, ai("codigoCiiu") && "ring-1 ring-blue-300")} {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="actividadEconomicaPrincipal"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className={LABEL_CLS}>Actividad principal{ai("actividadEconomicaPrincipal") && <AiBadge />}</FormLabel>
                              <FormControl>
                                <Input placeholder="Se llena automáticamente" className={cn(INPUT_CLS, ai("actividadEconomicaPrincipal") && "ring-1 ring-blue-300")} {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="codigoCiiuSecundario"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className={LABEL_CLS}>CIIU secundario{ai("codigoCiiuSecundario") && <AiBadge />}</FormLabel>
                              <FormControl>
                                <Input placeholder="Opcional" className={cn(INPUT_CLS, ai("codigoCiiuSecundario") && "ring-1 ring-blue-300")} {...field} />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="actividadEconomicaSecundaria"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className={LABEL_CLS}>Actividad secundaria{ai("actividadEconomicaSecundaria") && <AiBadge />}</FormLabel>
                              <FormControl>
                                <Input placeholder="Se llena automáticamente" className={cn(INPUT_CLS, ai("actividadEconomicaSecundaria") && "ring-1 ring-blue-300")} {...field} />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>

                    <div className="space-y-3">
                      <SectionLabel>Matriz de riesgo</SectionLabel>
                      <div className="grid grid-cols-2 gap-3">
                        <FormField
                          control={form.control}
                          name="servicioSuministrado"
                          render={({ field }) => (
                            <FormItem className="col-span-2">
                              <FormLabel className={LABEL_CLS}>Producto o servicio suministrado</FormLabel>
                              <FormControl>
                                <Input placeholder="Descripción del servicio o producto" className={INPUT_CLS} {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="montoAnual"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className={LABEL_CLS}>Monto anual estimado</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                  <SelectTrigger className={INPUT_CLS}>
                                    <SelectValue placeholder="Seleccione" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {SUPPLIER_MONTO_OPTIONS.map((opt) => (
                                    <SelectItem key={opt} value={opt}>
                                      {opt}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="sectorEconomico"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className={LABEL_CLS}>Sector económico</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                  <SelectTrigger className={INPUT_CLS}>
                                    <SelectValue placeholder="Seleccione" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {SUPPLIER_SECTOR_OPTIONS.map((opt) => (
                                    <SelectItem key={opt} value={opt}>
                                      <span className="line-clamp-2 text-xs">{opt}</span>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="jurisdiccionNacional"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className={LABEL_CLS}>Jurisdicción nacional</FormLabel>
                              <Select
                                onValueChange={(v) => {
                                  field.onChange(v);
                                  form.setValue("jurisdiccionInternacional", "");
                                }}
                                value={field.value}
                                disabled={!!form.watch("jurisdiccionInternacional")}
                              >
                                <FormControl>
                                  <SelectTrigger className={INPUT_CLS}>
                                    <SelectValue placeholder="Seleccione" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {JURISDICCION_NACIONAL_OPTIONS.map((opt) => (
                                    <SelectItem key={opt} value={opt}>
                                      {opt}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="jurisdiccionInternacional"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className={LABEL_CLS}>Jurisdicción internacional</FormLabel>
                              <Select
                                onValueChange={(v) => {
                                  field.onChange(v);
                                  form.setValue("jurisdiccionNacional", "");
                                }}
                                value={field.value}
                                disabled={!!form.watch("jurisdiccionNacional")}
                              >
                                <FormControl>
                                  <SelectTrigger className={INPUT_CLS}>
                                    <SelectValue placeholder="Seleccione" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {JURISDICCION_INTERNACIONAL_OPTIONS.map((opt) => (
                                    <SelectItem key={opt} value={opt}>
                                      {opt}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="isPep"
                          render={({ field }) => (
                            <FormItem className="flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
                              <FormControl>
                                <Checkbox checked={field.value} onCheckedChange={field.onChange} className="border-slate-300" />
                              </FormControl>
                              <FormLabel className="cursor-pointer text-sm font-normal text-slate-700">¿Es PEP?</FormLabel>
                              <FormDescription>*PEP: Persona Expuesta Políticamente</FormDescription>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="listas"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className={LABEL_CLS}>Listas restrictivas (CUMPLIMIENTO)</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                  <SelectTrigger className={INPUT_CLS}>
                                    <SelectValue placeholder="Seleccione" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="NO">NO — sin coincidencias</SelectItem>
                                  <SelectItem value="SÍ">SÍ — con coincidencias</SelectItem>
                                </SelectContent>
                              </Select>
                            </FormItem>
                          )}
                        />
                      </div>

                      {risk.riesgo !== "INDEFINIDO" && (
                        <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-xs">
                          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Riesgo calculado</span>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className={cn("px-3 py-1 text-sm font-bold", RIESGO_BADGE_SOLID[risk.riesgo])}>
                              {risk.riesgo}
                            </Badge>
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-400">{risk.tipoEvaluacion}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-100 bg-slate-50/60 px-6 py-4">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={completarConAcme}
                      disabled={form.formState.isSubmitting}
                      title="Rellena los campos vacíos con datos de prueba de ACME"
                      className="mr-auto rounded-lg text-slate-500"
                    >
                      <FlaskConical className="h-4 w-4" />
                      <span className="sr-only sm:not-sr-only">Completar con ACME</span>
                    </Button>
                    <Button type="button" variant="outline" onClick={handleClose} disabled={form.formState.isSubmitting} className="rounded-lg">
                      Cancelar
                    </Button>
                    <Button type="submit" disabled={form.formState.isSubmitting} className="gap-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700">
                      {form.formState.isSubmitting ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" /> Creando...
                        </>
                      ) : tipoSolicitud === "ACTUALIZACIÓN" ? (
                        "Crear actualización"
                      ) : (
                        "Crear inscripción"
                      )}
                    </Button>
                  </div>
                </form>
              </Form>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
