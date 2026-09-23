"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "convex/react";
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
import { useVerificacionTercero, type TipoSolicitud } from "@/components/onboarding/use-verificacion-tercero";
import { VerificacionTerceroPanel } from "@/components/onboarding/verificacion-tercero-panel";
import { useEmpresaFilter } from "@/hooks/useEmpresaFilter";
import { CIIU_ACTIVIDAD } from "@/lib/catalogs/ciiu";
import { ACME_DEMO, ACME_DEMO_CLIENTE, fillEmptyFields } from "@/lib/onboarding/acme-demo";
import { customerDocLabel, getCustomerDocKeys } from "@/lib/onboarding/documents/customers";
import { computeCustomerRisk, CUSTOMER_MONTO_OPTIONS, CUSTOMER_SECTOR_OPTIONS } from "@/lib/onboarding/risk/customer-matrix";
import { JURISDICCION_INTERNACIONAL_OPTIONS, JURISDICCION_NACIONAL_OPTIONS, TIPO_DOCUMENTO_OPTIONS, TIPO_PERSONA_LABELS, TIPO_PERSONA_OPTIONS } from "@/lib/onboarding/risk/shared";
import { cn } from "@/lib/utils";
import { FORMA_PAGO_OPTIONS, getOnboardingErrorMessage, PLAZO_OPTIONS, plazosPara, RIESGO_BADGE_SOLID } from "./ui-config";

// ─── Schema ───────────────────────────────────────────────────────────────────
const schema = z.object({
  tipoPersona: z.enum(TIPO_PERSONA_OPTIONS),
  tipoDocumento: z.enum(TIPO_DOCUMENTO_OPTIONS),
  numeroDocumento: z.string().min(1, "Requerido"),
  razonSocial: z.string().min(1, "Requerido"),
  direccion: z.string().min(1, "Requerido"),
  ciudad: z.string().min(1, "Requerido"),
  departamento: z.string().min(1, "Requerido"),
  celular: z.string().min(1, "Requerido"),
  email: z.string().email("Email inválido"),
  representanteLegalNombre: z.string().min(1, "Requerido"),
  representanteLegalTipoDocumento: z.enum(TIPO_DOCUMENTO_OPTIONS),
  representanteLegalNumeroDocumento: z.string().min(1, "Requerido"),
  representanteLegalEmail: z.string().email("Email inválido"),
  representanteLegalNacionalidad: z.string().min(1, "Requerido"),
  servicioSuministrado: z.string().min(1, "Requerido"),
  montoAnual: z.string().min(1, "Requerido"),
  sectorEconomico: z.string().min(1, "Requerido"),
  codigoCiiu: z.string(),
  codigoCiiuSecundario: z.string(),
  jurisdiccionNacional: z.string(),
  jurisdiccionInternacional: z.string(),
  isPep: z.boolean(),
  listas: z.string(),
  formaPago: z.enum(FORMA_PAGO_OPTIONS),
  plazo: z.enum(PLAZO_OPTIONS),
});

type FormValues = z.infer<typeof schema>;
type Step = "idle" | "selected" | "processing" | "done";
type ProcessingPhase = "uploading" | "extracting";

interface UsageInfo {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost_usd: number;
}

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ACCEPTED = ["application/pdf", "image/jpeg", "image/png"];

// Test data for the "Completar con ACME" buttons.
const ACME_VALUES: FormValues = {
  tipoPersona: "PERSONA_JURIDICA",
  tipoDocumento: "NIT",
  numeroDocumento: ACME_DEMO.nit,
  razonSocial: ACME_DEMO.razonSocial,
  direccion: ACME_DEMO.direccion,
  ciudad: ACME_DEMO.ciudad,
  departamento: ACME_DEMO.departamento,
  celular: ACME_DEMO.contactoCelular,
  email: ACME_DEMO.contactoEmail,
  representanteLegalNombre: ACME_DEMO.representanteLegalNombre,
  representanteLegalTipoDocumento: "C.C.",
  representanteLegalNumeroDocumento: ACME_DEMO.representanteLegalDocumento,
  representanteLegalEmail: ACME_DEMO.representanteLegalEmail,
  representanteLegalNacionalidad: "Colombiana",
  ...ACME_DEMO_CLIENTE,
  codigoCiiu: ACME_DEMO.codigoCiiu,
  codigoCiiuSecundario: ACME_DEMO.codigoCiiuSecundario,
  jurisdiccionNacional: ACME_DEMO.jurisdiccionNacional,
  jurisdiccionInternacional: "",
  isPep: false,
  listas: "NO",
  formaPago: "Crédito",
  plazo: "30 días",
};

const ACME_GROUPS = [["jurisdiccionNacional", "jurisdiccionInternacional"]] as const;

function mapTipoDoc(raw: string | null | undefined): (typeof TIPO_DOCUMENTO_OPTIONS)[number] {
  const s = (raw ?? "").toUpperCase();
  if (s.includes("NIT") || s === "31") return "NIT";
  if (s.includes("PASAPORTE") || s === "41") return "P.A.";
  if (s.includes("EXTRANJERÍA") || s.includes("EXTRANJERIA") || s === "22") return "C.E";
  return "C.C.";
}

function validarArchivo(file: File): boolean {
  if (file.size > MAX_FILE_BYTES) {
    toast.error("El archivo excede 10 MB");
    return false;
  }
  if (!ACCEPTED.includes(file.type)) {
    toast.error("Solo se aceptan PDF o imágenes");
    return false;
  }
  return true;
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

/**
 * Starts a customer process: upload the RUT, optionally prefill the form with AI extraction,
 * compute the risk live, capture the commercial payment terms and pre-load documents.
 * The request type (inscripción / actualización) comes from the company's ERP catalog; it is
 * picked by hand only when that check cannot run.
 */
export default function ModalIniciarProceso({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [step, setStep] = useState<Step>("idle");
  const [phase, setPhase] = useState<ProcessingPhase>("uploading");
  const [phasesDone, setPhasesDone] = useState<ProcessingPhase[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [rutStorageId, setRutStorageId] = useState<Id<"_storage"> | null>(null);
  const [cotizacion, setCotizacion] = useState<{ storageId: Id<"_storage">; fileName: string } | null>(null);
  const [cotizacionUploading, setCotizacionUploading] = useState(false);
  const [documentosIniciales, setDocumentosIniciales] = useState<Record<string, { storageId: Id<"_storage">; fileName: string }>>({});
  const [uploadingDocKey, setUploadingDocKey] = useState<string | null>(null);
  const [autoFilled, setAutoFilled] = useState<Partial<Record<keyof FormValues, boolean>>>({});
  const [extractUsage, setExtractUsage] = useState<UsageInfo | null>(null);
  const [extractSkipped, setExtractSkipped] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  /** Only used when the ERP check cannot run; recorded as tipoSolicitudOrigen MANUAL. */
  const [tipoSolicitudManual, setTipoSolicitudManual] = useState<TipoSolicitud | null>(null);

  const { empresaActiva } = useEmpresaFilter();
  const generateUploadUrl = useMutation(api.facturacionStorage.generateUploadUrl);
  const crearMatrizRiesgo = useMutation(api.onboarding.customers.crearMatrizRiesgo);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      tipoPersona: "PERSONA_JURIDICA",
      tipoDocumento: "NIT",
      numeroDocumento: "",
      razonSocial: "",
      direccion: "",
      ciudad: "",
      departamento: "",
      celular: "",
      email: "",
      representanteLegalNombre: "",
      representanteLegalTipoDocumento: "C.C.",
      representanteLegalNumeroDocumento: "",
      representanteLegalEmail: "",
      representanteLegalNacionalidad: "Colombiana",
      servicioSuministrado: "",
      montoAnual: "",
      sectorEconomico: "",
      codigoCiiu: "",
      codigoCiiuSecundario: "",
      jurisdiccionNacional: "",
      jurisdiccionInternacional: "",
      isPep: false,
      listas: "NO",
      formaPago: "Crédito",
      plazo: "30 días",
    },
  });

  // ERP catalog check for the typed document (typing, RUT extraction or ACME fill).
  const verificacion = useVerificacionTercero({
    modulo: "customer",
    empresa: empresaActiva,
    numeroDocumento: form.watch("numeroDocumento"),
    tipoDocumento: form.watch("tipoDocumento"),
    habilitado: open && step === "done",
  });
  const manualRequerido = verificacion.erp.estado === "no_disponible";
  const tipoSolicitud: TipoSolicitud | null = verificacion.tipoSugerido ?? (manualRequerido ? tipoSolicitudManual : null);
  const puedeCrear = tipoSolicitud !== null;
  const tipoPersona = form.watch("tipoPersona");
  const formaPago = form.watch("formaPago");
  const codigoCiiu = form.watch("codigoCiiu");
  const codigoCiiuSecundario = form.watch("codigoCiiuSecundario");
  const risk = computeCustomerRisk({
    montoAnual: form.watch("montoAnual"),
    sectorEconomico: form.watch("sectorEconomico"),
    jurisdiccionNacional: form.watch("jurisdiccionNacional"),
    jurisdiccionInternacional: form.watch("jurisdiccionInternacional"),
    isPep: form.watch("isPep"),
    listas: form.watch("listas"),
  });
  const documentosRequeridos = getCustomerDocKeys(risk.tipoEvaluacion, tipoPersona, form.watch("isPep"));
  const plazoOpciones = plazosPara(formaPago);

  // Anticipado ⇔ NA (mirrors the server rule).
  useEffect(() => {
    if (formaPago === "Anticipado") form.setValue("plazo", "NA");
    else if (form.getValues("plazo") === "NA") form.setValue("plazo", "30 días");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formaPago]);

  async function subirArchivo(selected: File): Promise<Id<"_storage">> {
    const uploadUrl = await generateUploadUrl();
    const res = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": selected.type }, body: selected });
    if (!res.ok) throw new Error("Error al subir el archivo");
    const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
    return storageId;
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected || !validarArchivo(selected)) return;
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
      }
      const nombre = [str("primer_nombre"), str("primer_apellido"), str("segundo_apellido")].filter(Boolean).join(" ");
      if (nombre) {
        form.setValue("razonSocial", nombre);
        filled.razonSocial = true;
      }
    }
    const setIf = (key: "direccion" | "ciudad" | "departamento" | "representanteLegalNombre" | "codigoCiiu" | "codigoCiiuSecundario", raw: string) => {
      const value = str(raw);
      if (value) {
        form.setValue(key, value);
        filled[key] = true;
      }
    };
    setIf("direccion", "direccion");
    setIf("ciudad", "municipio");
    setIf("departamento", "departamento");
    setIf("representanteLegalNombre", "nombre_representante_legal");
    setIf("codigoCiiu", "actividad_principal_codigo");
    setIf("codigoCiiuSecundario", "actividad_secundaria_codigo");
    setAutoFilled(filled);
  }

  // Fills only the empty fields, so anything typed or read from the RUT is kept. The defaults stay
  // untouched so closing the modal still clears the form.
  function completarConAcme() {
    form.reset(fillEmptyFields(form.getValues(), ACME_VALUES, ACME_GROUPS), { keepDefaultValues: true });
  }

  function continuarSinRutConAcme() {
    setRutStorageId(null);
    setExtractSkipped("Sin RUT: se cargaron datos de prueba de ACME. Revísalos antes de continuar.");
    completarConAcme();
    setStep("done");
  }

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
      const storageId = await subirArchivo(file);
      setRutStorageId(storageId);
      setPhasesDone(["uploading"]);

      setPhase("extracting");
      const extractBody = new FormData();
      extractBody.append("file", file);
      const extractRes = await fetch("/api/extract-rut", { method: "POST", body: extractBody });
      if (extractRes.status === 503) {
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

  async function handleCotizacionChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    e.target.value = "";
    if (!selected || !validarArchivo(selected)) return;
    setCotizacionUploading(true);
    try {
      const storageId = await subirArchivo(selected);
      setCotizacion({ storageId, fileName: selected.name });
      toast.success("Cotización subida correctamente");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al subir la cotización");
    } finally {
      setCotizacionUploading(false);
    }
  }

  async function handleDocumentoInicialChange(docKey: string, e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    e.target.value = "";
    if (!selected || !validarArchivo(selected)) return;
    setUploadingDocKey(docKey);
    try {
      const storageId = await subirArchivo(selected);
      setDocumentosIniciales((prev) => ({ ...prev, [docKey]: { storageId, fileName: selected.name } }));
      toast.success("Documento precargado correctamente");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al subir el documento");
    } finally {
      setUploadingDocKey(null);
    }
  }

  const handleClose = () => {
    form.reset();
    setStep("idle");
    setFile(null);
    setRutStorageId(null);
    setCotizacion(null);
    setCotizacionUploading(false);
    setDocumentosIniciales({});
    setUploadingDocKey(null);
    setAutoFilled({});
    setExtractUsage(null);
    setExtractSkipped(null);
    setPhasesDone([]);
    setTipoSolicitudManual(null);
    onOpenChange(false);
  };

  const onSubmit = form.handleSubmit(async (values) => {
    if (empresaActiva === null) {
      toast.error("Selecciona una empresa para iniciar el proceso");
      return;
    }
    if (risk.riesgo === "INDEFINIDO" || risk.tipoEvaluacion === "INDEFINIDO") {
      toast.error("Completa los factores de riesgo antes de enviar el formulario al cliente.");
      return;
    }
    if (tipoSolicitud === null) {
      toast.error(
        manualRequerido
          ? "Elige el tipo de solicitud: no se pudo verificar el documento en el ERP."
          : "Espera a que termine la verificación del documento en el ERP.",
      );
      return;
    }
    try {
      const ciiuP = values.codigoCiiu.trim();
      const ciiuS = values.codigoCiiuSecundario.trim();
      const documentosPayload = Object.fromEntries(Object.entries(documentosIniciales).map(([docKey, v]) => [docKey, v.storageId])) as Record<string, Id<"_storage">>;
      await crearMatrizRiesgo({
        empresa: empresaActiva,
        tipoSolicitud,
        tipoSolicitudOrigen: verificacion.tipoSugerido ? "ERP" : "MANUAL",
        rutStorageId: rutStorageId ?? undefined,
        cotizacionStorageId: cotizacion?.storageId,
        tipoPersona: values.tipoPersona,
        tipoDocumento: values.tipoDocumento,
        numeroDocumento: values.numeroDocumento,
        razonSocial: values.razonSocial,
        direccion: values.direccion,
        ciudad: values.ciudad,
        departamento: values.departamento,
        celular: values.celular,
        email: values.email,
        representanteLegalNombre: values.representanteLegalNombre,
        representanteLegalTipoDocumento: values.representanteLegalTipoDocumento,
        representanteLegalNumeroDocumento: values.representanteLegalNumeroDocumento,
        representanteLegalEmail: values.representanteLegalEmail,
        representanteLegalNacionalidad: values.representanteLegalNacionalidad,
        servicioSuministrado: values.servicioSuministrado,
        montoAnual: values.montoAnual,
        sectorEconomico: values.sectorEconomico,
        jurisdiccionNacional: values.jurisdiccionNacional,
        jurisdiccionInternacional: values.jurisdiccionInternacional,
        isPep: values.isPep,
        listas: values.listas,
        codigoCiiu: ciiuP || undefined,
        actividadEconomica: ciiuP ? CIIU_ACTIVIDAD[ciiuP] : undefined,
        codigoCiiuSecundario: ciiuS || undefined,
        actividadEconomicaSecundaria: ciiuS ? CIIU_ACTIVIDAD[ciiuS] : undefined,
        documentosIniciales: Object.keys(documentosPayload).length > 0 ? documentosPayload : undefined,
        formaPago: values.formaPago,
        plazo: values.plazo,
      });
      toast.success(
        tipoSolicitud === "ACTUALIZACIÓN"
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
        htmlFor="rut-file-cliente"
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
            <p className="font-medium text-slate-700">Suba el RUT del cliente (últimos 30 días)</p>
            <p className="mt-0.5 text-xs text-slate-400">PDF, JPG o PNG · Máx. 10 MB</p>
          </div>
        )}
        <input id="rut-file-cliente" ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={handleFileChange} className="hidden" />
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
                <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition-colors", done ? "border-green-500 bg-green-500 text-white" : active ? "border-blue-500 bg-blue-50 text-blue-600" : "border-slate-200 bg-white text-slate-300")}>
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

  const textField = (name: keyof FormValues, label: string, opts: { type?: string; placeholder?: string; className?: string } = {}) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem className={opts.className}>
          <FormLabel className={LABEL_CLS}>
            {label}
            {ai(name) && <AiBadge />}
          </FormLabel>
          <FormControl>
            <Input type={opts.type ?? "text"} placeholder={opts.placeholder} className={cn(INPUT_CLS, ai(name) && "ring-1 ring-blue-300")} {...field} value={String(field.value ?? "")} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );

  const selectField = (name: keyof FormValues, label: string, options: readonly string[], render?: (opt: string) => React.ReactNode, className?: string) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem className={className}>
          <FormLabel className={LABEL_CLS}>
            {label}
            {ai(name) && <AiBadge />}
          </FormLabel>
          <Select onValueChange={field.onChange} value={String(field.value ?? "")}>
            <FormControl>
              <SelectTrigger className={cn(INPUT_CLS, ai(name) && "ring-1 ring-blue-300")}>
                <SelectValue placeholder="Seleccione" />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {options.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {render ? render(opt) : opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )}
    />
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <DialogTitle>Iniciar proceso de {tipoSolicitud === "ACTUALIZACIÓN" ? "actualización" : "inscripción"}</DialogTitle>
            {step === "done" && verificacion.erp.estado === "verificando" && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
            {step === "done" && verificacion.erp.estado !== "verificando" && tipoSolicitud !== null && (
              <span className={cn("rounded-full border px-2.5 py-0.5 text-[11px] font-semibold", tipoSolicitud === "ACTUALIZACIÓN" ? "border-amber-200 bg-amber-50 text-amber-700" : "border-green-200 bg-green-50 text-green-700")}>
                {tipoSolicitud}
              </span>
            )}
          </div>
        </DialogHeader>

        {empresaActiva === null ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
            <Building2 className="h-8 w-8 text-slate-300" />
            <p className="text-sm font-medium text-slate-500">Selecciona una empresa para iniciar el proceso.</p>
          </div>
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
                      <SectionLabel>Identificación</SectionLabel>
                      <div className="grid grid-cols-2 gap-3">
                        {selectField("tipoPersona", "Tipo de persona", TIPO_PERSONA_OPTIONS, (opt) => TIPO_PERSONA_LABELS[opt])}
                        {selectField("tipoDocumento", "Tipo documento", TIPO_DOCUMENTO_OPTIONS)}
                        {textField("numeroDocumento", "Número de documento")}
                        {textField("razonSocial", "Razón social / Nombre")}
                      </div>
                      <VerificacionTerceroPanel
                        verificacion={verificacion}
                        entidad="cliente"
                        razonSocialFormulario={form.watch("razonSocial")}
                      />
                      {manualRequerido && (
                        <div className="space-y-1.5">
                          <p className={LABEL_CLS}>Tipo de solicitud</p>
                          <Select value={tipoSolicitudManual ?? ""} onValueChange={(v) => setTipoSolicitudManual(v as TipoSolicitud)}>
                            <SelectTrigger className={INPUT_CLS} aria-label="Tipo de solicitud">
                              <SelectValue placeholder="¿El cliente ya existe en el sistema contable?" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="INSCRIPCIÓN">INSCRIPCIÓN — cliente nuevo</SelectItem>
                              <SelectItem value="ACTUALIZACIÓN">ACTUALIZACIÓN — cliente ya registrado</SelectItem>
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-slate-500">Se registrará que el tipo se eligió manualmente.</p>
                        </div>
                      )}
                    </div>

                    <div className="space-y-3">
                      <SectionLabel>Ubicación y contacto</SectionLabel>
                      <div className="grid grid-cols-2 gap-3">
                        {textField("direccion", "Dirección", { className: "col-span-2" })}
                        {textField("ciudad", "Ciudad")}
                        {textField("departamento", "Departamento")}
                        {textField("celular", "Celular")}
                        {textField("email", "Email", { type: "email" })}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <SectionLabel>Representante legal</SectionLabel>
                      <div className="grid grid-cols-2 gap-3">
                        {textField("representanteLegalNombre", "Nombre")}
                        {selectField("representanteLegalTipoDocumento", "Tipo documento", TIPO_DOCUMENTO_OPTIONS)}
                        {textField("representanteLegalNumeroDocumento", "Número documento")}
                        {textField("representanteLegalNacionalidad", "Nacionalidad")}
                        {textField("representanteLegalEmail", "Email (recibe la solicitud de firma)", { type: "email", className: "col-span-2" })}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <SectionLabel>Matriz de riesgo</SectionLabel>
                      <div className="grid grid-cols-2 gap-3">
                        <FormField
                          control={form.control}
                          name="codigoCiiu"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className={LABEL_CLS}>
                                Código CIIU principal{ai("codigoCiiu") && <AiBadge />}
                              </FormLabel>
                              <FormControl>
                                <Input placeholder="Ej. 4751" className={cn(INPUT_CLS, ai("codigoCiiu") && "ring-1 ring-blue-300")} {...field} />
                              </FormControl>
                              {CIIU_ACTIVIDAD[codigoCiiu.trim()] ? <FormDescription className="text-xs text-slate-600">{CIIU_ACTIVIDAD[codigoCiiu.trim()]}</FormDescription> : null}
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="codigoCiiuSecundario"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className={LABEL_CLS}>
                                Código CIIU secundario (opcional){ai("codigoCiiuSecundario") && <AiBadge />}
                              </FormLabel>
                              <FormControl>
                                <Input placeholder="Opcional" className={cn(INPUT_CLS, ai("codigoCiiuSecundario") && "ring-1 ring-blue-300")} {...field} />
                              </FormControl>
                              {CIIU_ACTIVIDAD[codigoCiiuSecundario.trim()] ? <FormDescription className="text-xs text-slate-600">{CIIU_ACTIVIDAD[codigoCiiuSecundario.trim()]}</FormDescription> : null}
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        {textField("servicioSuministrado", "Producto o servicio suministrado", { placeholder: "Descripción del servicio o producto", className: "col-span-2" })}

                        <div className="col-span-2">
                          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Cotización (opcional)</p>
                          <label
                            htmlFor="cotizacion-file"
                            className={cn("flex cursor-pointer items-center gap-3 rounded-lg border border-dashed px-4 py-3 transition-colors", cotizacion ? "border-green-300 bg-green-50" : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-slate-100")}
                          >
                            {cotizacionUploading ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-500" /> : cotizacion ? <Check className="h-4 w-4 shrink-0 text-green-600" /> : <Upload className="h-4 w-4 shrink-0 text-slate-400" />}
                            <span className={cn("truncate text-sm", cotizacion ? "font-medium text-green-700" : "text-slate-500")}>
                              {cotizacionUploading ? "Subiendo..." : (cotizacion?.fileName ?? "Subir cotización (PDF, JPG o PNG · Máx. 10 MB)")}
                            </span>
                            {cotizacion && !cotizacionUploading && (
                              <button
                                type="button"
                                className="ml-auto shrink-0 text-slate-400 hover:text-slate-600"
                                onClick={(e) => {
                                  e.preventDefault();
                                  setCotizacion(null);
                                }}
                              >
                                <X className="h-4 w-4" />
                              </button>
                            )}
                            <input id="cotizacion-file" type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={handleCotizacionChange} disabled={cotizacionUploading} className="hidden" />
                          </label>
                        </div>

                        {selectField("montoAnual", "Monto anual estimado", CUSTOMER_MONTO_OPTIONS)}
                        {selectField("sectorEconomico", "Sector económico", CUSTOMER_SECTOR_OPTIONS, (opt) => <span className="line-clamp-2 text-xs">{opt}</span>)}
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
                              <FormLabel className={LABEL_CLS}>¿En listas restrictivas?</FormLabel>
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

                    <div className="space-y-3">
                      <SectionLabel>Condiciones de pago</SectionLabel>
                      <div className="grid grid-cols-2 gap-3">
                        {selectField("formaPago", "Forma de pago", FORMA_PAGO_OPTIONS)}
                        {selectField("plazo", "Plazo", plazoOpciones)}
                      </div>
                    </div>

                    {documentosRequeridos.length > 0 && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <SectionLabel>Documentos requeridos</SectionLabel>
                          <span className="text-xs text-slate-400">{Object.keys(documentosIniciales).length + (rutStorageId && !documentosIniciales.rutUltimoAnio ? 1 : 0)} precargados</span>
                        </div>
                        <div className="space-y-2">
                          {documentosRequeridos.map((docKey) => {
                            const docInicial = documentosIniciales[docKey];
                            const usaRutInicial = docKey === "rutUltimoAnio" && !!rutStorageId && !docInicial;
                            const cargado = !!docInicial || usaRutInicial;
                            return (
                              <div key={docKey} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium text-slate-700">{customerDocLabel(docKey)}</p>
                                  <p className={cn("truncate text-xs", cargado ? "text-green-600" : "text-slate-400")}>{docInicial?.fileName ?? (usaRutInicial ? "Se usará el RUT cargado al inicio" : "Opcional en este paso")}</p>
                                </div>
                                <label
                                  className={cn(
                                    "inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-colors",
                                    cargado ? "border-green-200 bg-green-50 text-green-700 hover:bg-green-100" : "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100",
                                    uploadingDocKey === docKey && "pointer-events-none opacity-70",
                                  )}
                                >
                                  {uploadingDocKey === docKey ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : cargado ? <Check className="h-3.5 w-3.5" /> : <Upload className="h-3.5 w-3.5" />}
                                  {cargado ? "Cambiar" : "Subir"}
                                  <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={(e) => handleDocumentoInicialChange(docKey, e)} disabled={uploadingDocKey === docKey} />
                                </label>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
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
                    <Button
                      type="submit"
                      disabled={form.formState.isSubmitting || !puedeCrear}
                      title={
                        !verificacion.listo
                          ? "Ingresa el número de documento"
                          : manualRequerido && tipoSolicitudManual === null
                            ? "Elige el tipo de solicitud"
                            : undefined
                      }
                      className="gap-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
                    >
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
