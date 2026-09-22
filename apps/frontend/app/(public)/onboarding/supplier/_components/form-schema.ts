import { z } from "zod";
import type { FunctionReturnType } from "convex/server";
import { BadgeCheck, Briefcase, Building2, FileText, GitBranch, Landmark, Share2, Star, Users, Wallet } from "lucide-react";
import type { api } from "@/convex/_generated/api";
import { TIPO_DOCUMENTO_OPTIONS, TIPO_PERSONA_OPTIONS } from "@/lib/onboarding/risk/shared";

export type InscripcionPublica = NonNullable<FunctionReturnType<typeof api.onboarding.suppliersPublic.obtenerInscripcionPublica>>;

export const TIPO_DOC_VALUES = TIPO_DOCUMENTO_OPTIONS;
export type TipoDoc = (typeof TIPO_DOC_VALUES)[number];

export const FORMA_PAGO_VALUES = ["Contado", "Crédito"] as const;
export const PLAZO_CREDITO_VALUES = ["15 días", "30 días", "60 días", "90 días", "120 días"] as const;
export const PLAZO_PAGO_VALUES = ["NA", "15 días", "30 días", "60 días", "90 días", "120 días"] as const;

export const CALIDAD_CONTRIBUYENTE_VALUES = ["ORDINARIO", "ESPECIAL_SIN_ANIMO_LUCRO", "RST", "NO_CONTRIBUYENTE"] as const;
export type CalidadContribuyente = (typeof CALIDAD_CONTRIBUYENTE_VALUES)[number];

// ─── Defaults ────────────────────────────────────────────────────────────────
export const defaultContacto = { nombre: "", area: "", cargo: "", email: "", celular: "" };
export const defaultReferencia = { nombre: "", ciudad: "", telefono: "", personaContacto: "", tiempoProveedor: "" };
export const defaultFideicomiso = (): { nombre: string; tipoDocumento: TipoDoc; numeroDocumento: string } => ({
  nombre: "",
  tipoDocumento: "C.C.",
  numeroDocumento: "",
});

export const defaultIsPep = () => ({
  ejerceActualmente: false,
  cargo: "",
  fechaInicio: 0,
  fechaFin: undefined as number | undefined,
  dataCercanos: "",
  cuentasExtranjero: false,
  fideicomisos: [] as { nombre: string; tipoDocumento: TipoDoc; numeroDocumento: string }[],
});

export const defaultAccionista = () => ({
  nombre: "",
  tipoDocumento: "C.C." as TipoDoc,
  numeroDocumento: "",
  porcentajeParticipacion: 0,
  nacionalidad: "",
  esPep: false,
  isPep: defaultIsPep(),
  ifNatural: { isAccionista: false, nombreEmpresa: "", nitEmpresa: "" },
});

export const DEFAULT_IMPUESTOS = {
  impuestoRenta: {
    contribuyente: false,
    calidadContribuyente: "NO_CONTRIBUYENTE" as CalidadContribuyente,
    regimenOrdinario: false,
    regimenEspecial: false,
    regimenSimple: false,
    granContribuyente: false,
    autorretenedorRenta: false,
    resolucion: "",
    fechaResolucion: 0,
    resolucionAutorretenedor: "",
  },
  impuestoVentas: { responsableIva: false, retencionIva: false },
  impuestoIndustriaYComercio: {
    responsableImpuesto: false,
    municipiosIcaResponsable: [] as string[],
    granContribuyenteBogota: { es: false, resolucion: "", fechaResolucion: 0 },
  },
  sujetoReteIca: { es: false, municipios: [] as string[], tarifa: undefined as number | undefined },
  autorretenedorIca: { es: false, municipios: [] as string[] },
};

export const STEPS = [
  { id: "01", label: "Datos generales", icon: Building2 },
  { id: "02", label: "Actividad económica", icon: Briefcase },
  { id: "03", label: "Conflicto de intereses", icon: GitBranch },
  { id: "04", label: "Info. tributaria", icon: FileText },
  { id: "05", label: "Composición accionaria", icon: Share2 },
  { id: "06", label: "Contactos adicionales", icon: Users },
  { id: "07", label: "Info. bancaria", icon: Landmark },
  { id: "08", label: "Referencias comerciales", icon: Star },
  { id: "09", label: "Condiciones de pago", icon: Wallet },
  { id: "10", label: "Información adicional", icon: BadgeCheck },
  { id: "11", label: "Documentos requeridos", icon: FileText },
];

/** Section index of each top-level form key (scroll to the first error). */
export const FIELD_SECTION: Record<string, number> = {
  datos_generales_01: 0,
  actividadPrincipal_02: 1,
  conflictoIntereses_03: 2,
  infoTributaria_04: 3,
  compoAccionaria_05: 4,
  contactos_09: 5,
  infoBancaria_10: 6,
  referenciasComerciales_11: 7,
  condicionesPago_12: 8,
  adicionales_13: 9,
};

export const TRIBUTARIA_FIELD_LABELS: Record<string, string> = {
  "impuestoRenta.contribuyente": "¿Es contribuyente?",
  "impuestoRenta.calidadContribuyente": "Régimen (calidad del contribuyente)",
  "impuestoRenta.regimenOrdinario": "¿Régimen ordinario?",
  "impuestoRenta.regimenEspecial": "¿Régimen especial (sin ánimo de lucro)?",
  "impuestoRenta.regimenSimple": "¿Régimen simple de tributación (RST)?",
  "impuestoRenta.granContribuyente": "¿Es gran contribuyente DIAN?",
  "impuestoRenta.autorretenedorRenta": "¿Es autorretenedor de renta DIAN?",
  "impuestoRenta.resolucion": "Resolución (gran contribuyente)",
  "impuestoRenta.fechaResolucion": "Fecha de resolución (gran contribuyente)",
  "impuestoRenta.resolucionAutorretenedor": "Resolución (autorretenedor de renta)",
  tarifaReteIvaRST: "Tarifa Rte IVA aplicable (RST)",
  tarifaReteFuente: "Tarifa de retención en la fuente",
  tipoReteFuenteIfPersonaNatural: "Persona natural — Art. 383 / Tarifa general",
  aiu: "AIU",
  aiuA: "AIU — Administración (%)",
  aiuI: "AIU — Imprevistos (%)",
  aiuU: "AIU — Utilidad (%)",
  "impuestoVentas.responsableIva": "Calidad frente al IVA",
  "impuestoVentas.retencionIva": "¿Practica retención de IVA?",
  "impuestoIndustriaYComercio.responsableImpuesto": "¿Es responsable de ICA?",
  "impuestoIndustriaYComercio.municipiosIcaResponsable": "Municipios donde es responsable de ICA",
  "impuestoIndustriaYComercio.granContribuyenteBogota.es": "¿Es gran contribuyente Bogotá?",
  "impuestoIndustriaYComercio.granContribuyenteBogota.resolucion": "Resolución (gran contribuyente Bogotá)",
  "impuestoIndustriaYComercio.granContribuyenteBogota.fechaResolucion": "Fecha de resolución (gran contribuyente Bogotá)",
  "sujetoReteIca.es": "¿Es sujeto de retención de ICA?",
  "sujetoReteIca.municipios": "Municipios donde es sujeto de rete ICA",
  "sujetoReteIca.tarifa": "Tarifa Rte ICA (%)",
  "autorretenedorIca.es": "¿Es autorretenedor de ICA?",
  "autorretenedorIca.municipios": "Municipios donde es autorretenedor de ICA",
  origenFondos: "Origen de fondos",
  actividadesEconomicasExtranjeras: "Actividades económicas en el extranjero",
};

/** Walks a react-hook-form error tree and returns the leaves as {path, message}. */
export function collectErrorPaths(errors: unknown, prefix = ""): { path: string; message: string }[] {
  const out: { path: string; message: string }[] = [];
  if (!errors || typeof errors !== "object") return out;
  for (const [key, val] of Object.entries(errors as Record<string, unknown>)) {
    if (!val || typeof val !== "object") continue;
    const maybeMsg = (val as { message?: unknown }).message;
    const nextPrefix = prefix ? `${prefix}.${key}` : key;
    if (typeof maybeMsg === "string") out.push({ path: nextPrefix, message: maybeMsg });
    else out.push(...collectErrorPaths(val, nextPrefix));
  }
  return out;
}

// ─── Zod schema ──────────────────────────────────────────────────────────────
const tipoDocEnum = z.enum(TIPO_DOC_VALUES);

export const formSchema = z.object({
  datos_generales_01: z.object({
    tipoPersona: z.enum(TIPO_PERSONA_OPTIONS),
    razonSocial: z.string().min(1, "Requerido"),
    contactoNombre: z.string().min(1, "Requerido"),
    contactoEmail: z.string().email("Email inválido"),
    contactoCelular: z.string().min(1, "Requerido"),
    direccion: z.string().optional(),
    ciudad: z.string().optional(),
    departamento: z.string().optional(),
    telefono: z.string().optional(),
    celular: z.string().optional(),
    email: z.string().optional(),
    website: z.string().optional(),
    representanteLegalNombre: z.string().min(1, "Requerido"),
    representanteLegalTipoDocumento: tipoDocEnum,
    representanteLegalNumeroDocumento: z.string().min(1, "Requerido"),
    representanteLegalEmail: z.string().email("Email inválido"),
    representanteLegalTelefono: z.string().optional(),
    representanteLegalCelular: z.string().optional(),
    representanteLegalNombreContacto: z.string().optional(),
    representanteLegalNacionalidad: z.string().optional(),
    tesoreroNombre: z.string().optional(),
    tesoreroEmail: z.string().optional(),
    tesoreroTelefono: z.string().optional(),
    contadorNombre: z.string().optional(),
    contadorEmail: z.string().optional(),
    contadorTelefono: z.string().optional(),
  }),
  actividadPrincipal_02: z.object({
    codigoCiiu: z.string().min(1, "Requerido"),
    actividadEconomica: z.string().optional(),
    descripcionServicio: z.string().optional(),
    cuentasExtranjero: z.string().optional(),
    transaccionesVirtuales: z.string().optional(),
  }),
  conflictoIntereses_03: z.object({
    representanteLegalXColaborador: z.boolean(),
    funcionariosExEmpresa: z.boolean(),
    gerentesXEmpresa: z.boolean(),
    sociosXProveedorEmpresa: z.boolean(),
    profesionalesVinculadosXEmpresa: z.boolean(),
    accionistasRelacionadosXEmpresa: z.boolean(),
  }),
  infoTributaria_04: z.object({
    // Branch-only fields are optional so Zod does not require them when the UI hides them; the
    // payload builder emits valid values for Convex.
    impuestoRenta: z
      .object({
        contribuyente: z.boolean(),
        calidadContribuyente: z.enum(CALIDAD_CONTRIBUYENTE_VALUES),
        regimenOrdinario: z.boolean().optional(),
        regimenEspecial: z.boolean().optional(),
        regimenSimple: z.boolean().optional(),
        granContribuyente: z.boolean(),
        autorretenedorRenta: z.boolean(),
        resolucion: z.string().optional(),
        fechaResolucion: z.coerce.number().optional(),
        resolucionAutorretenedor: z.string().optional(),
      })
      .optional(),
    impuestoVentas: z.object({ responsableIva: z.boolean(), retencionIva: z.boolean() }).optional(),
    impuestoIndustriaYComercio: z
      .object({
        responsableImpuesto: z.boolean(),
        municipiosIcaResponsable: z.array(z.string()).optional(),
        granContribuyenteBogota: z
          .object({ es: z.boolean().optional(), resolucion: z.string().optional(), fechaResolucion: z.coerce.number().optional() })
          .optional(),
      })
      .optional(),
    sujetoReteIca: z.object({ es: z.boolean().optional(), municipios: z.array(z.string()).optional(), tarifa: z.coerce.number().min(0).optional() }).optional(),
    autorretenedorIca: z.object({ es: z.boolean().optional(), municipios: z.array(z.string()).optional() }).optional(),
    aiu: z.coerce.number().min(0).optional(),
    aiuA: z.coerce.number().min(0).optional(),
    aiuI: z.coerce.number().min(0).optional(),
    aiuU: z.coerce.number().min(0).optional(),
    tipoReteFuenteIfPersonaNatural: z.string().optional(),
    tarifaReteFuente: z.coerce.number().min(0).optional(),
    tarifaReteIvaRST: z.coerce.number().min(0).optional(),
    origenFondos: z.string().min(1, "Requerido"),
    actividadesEconomicasExtranjeras: z.string().optional(),
  }),
  compoAccionaria_05: z
    .array(
      z.object({
        nombre: z.string(),
        tipoDocumento: tipoDocEnum,
        numeroDocumento: z.string(),
        porcentajeParticipacion: z.coerce.number().min(0).max(100),
        nacionalidad: z.string(),
        esPep: z.boolean().optional(),
        isPep: z.object({
          ejerceActualmente: z.boolean(),
          cargo: z.string(),
          fechaInicio: z.coerce.number(),
          fechaFin: z.coerce.number().optional(),
          dataCercanos: z.string(),
          cuentasExtranjero: z.boolean(),
          fideicomisos: z.array(z.object({ nombre: z.string(), tipoDocumento: tipoDocEnum, numeroDocumento: z.string() })),
        }),
        ifNatural: z.object({ isAccionista: z.boolean(), nombreEmpresa: z.string(), nitEmpresa: z.string() }),
      }),
    )
    .optional(),
  contactos_09: z.array(z.object({ nombre: z.string(), area: z.string(), cargo: z.string(), email: z.string(), celular: z.string() })).optional(),
  infoBancaria_10: z.object({
    tipoCuenta: z.enum(["Ahorros", "Corriente"]),
    entidad: z.string().min(1, "Requerido"),
    numeroCuenta: z.string().min(1, "Requerido"),
    titular: z.string().min(1, "Requerido"),
    tipoDocumento: tipoDocEnum,
    numeroDocumento: z.string().min(1, "Requerido"),
    email: z.string().email("Email inválido"),
  }),
  referenciasComerciales_11: z
    .array(z.object({ nombre: z.string(), ciudad: z.string(), telefono: z.string(), personaContacto: z.string(), tiempoProveedor: z.string() }))
    .optional(),
  adicionales_13: z.object({
    aniosExperiencia: z.coerce.number().min(0),
    certificaciones: z.array(z.object({ nombre: z.string(), alcance: z.string() })).optional(),
    serviciosXGarantias: z.string().optional(),
  }),
  condicionesPago_12: z.object({ formaPago: z.enum(FORMA_PAGO_VALUES), plazo: z.enum(PLAZO_PAGO_VALUES) }),
});

export type FormValues = z.infer<typeof formSchema>;
export type InfoTributariaValues = FormValues["infoTributaria_04"];

export const DEFAULT_FORM_VALUES: FormValues = {
  datos_generales_01: {
    tipoPersona: "PERSONA_JURIDICA",
    razonSocial: "",
    contactoNombre: "",
    contactoEmail: "",
    contactoCelular: "",
    direccion: "",
    ciudad: "",
    departamento: "",
    telefono: "",
    celular: "",
    email: "",
    website: "",
    representanteLegalNombre: "",
    representanteLegalTipoDocumento: "C.C.",
    representanteLegalNumeroDocumento: "",
    representanteLegalEmail: "",
    representanteLegalTelefono: "",
    representanteLegalCelular: "",
    representanteLegalNombreContacto: "",
    representanteLegalNacionalidad: "",
    tesoreroNombre: "",
    tesoreroEmail: "",
    tesoreroTelefono: "",
    contadorNombre: "",
    contadorEmail: "",
    contadorTelefono: "",
  },
  actividadPrincipal_02: { codigoCiiu: "", actividadEconomica: "", descripcionServicio: "", cuentasExtranjero: "", transaccionesVirtuales: "" },
  conflictoIntereses_03: {
    representanteLegalXColaborador: false,
    funcionariosExEmpresa: false,
    gerentesXEmpresa: false,
    sociosXProveedorEmpresa: false,
    profesionalesVinculadosXEmpresa: false,
    accionistasRelacionadosXEmpresa: false,
  },
  infoTributaria_04: {
    aiu: undefined,
    aiuA: undefined,
    aiuI: undefined,
    aiuU: undefined,
    origenFondos: "",
    actividadesEconomicasExtranjeras: "",
    tipoReteFuenteIfPersonaNatural: "",
    tarifaReteFuente: undefined,
    tarifaReteIvaRST: undefined,
    ...DEFAULT_IMPUESTOS,
  },
  compoAccionaria_05: [defaultAccionista()],
  contactos_09: [defaultContacto],
  infoBancaria_10: { tipoCuenta: "Corriente", entidad: "", numeroCuenta: "", titular: "", tipoDocumento: "NIT", numeroDocumento: "", email: "" },
  referenciasComerciales_11: [defaultReferencia],
  adicionales_13: { aniosExperiencia: 0, certificaciones: [], serviciosXGarantias: "" },
  condicionesPago_12: { formaPago: "Contado", plazo: "NA" },
};

// ─── Normalizers (server → form) ─────────────────────────────────────────────
type ImpuestosValues = typeof DEFAULT_IMPUESTOS;

export function normalizeImpuestos(raw: InscripcionPublica["infoTributaria_04"]): ImpuestosValues {
  const ir = raw?.impuestoRenta;
  const iv = raw?.impuestoVentas;
  const iyc = raw?.impuestoIndustriaYComercio;
  const gcb = iyc?.granContribuyenteBogota;
  const sr = raw?.sujetoReteIca;
  const ar = raw?.autorretenedorIca;
  const calidad: CalidadContribuyente = ir?.calidadContribuyente && CALIDAD_CONTRIBUYENTE_VALUES.includes(ir.calidadContribuyente) ? ir.calidadContribuyente : "NO_CONTRIBUYENTE";
  const contribuyente = typeof ir?.contribuyente === "boolean" ? ir.contribuyente : calidad !== "NO_CONTRIBUYENTE";
  const granContribuyente = Boolean(ir?.granContribuyente);
  const autorretenedorRenta = Boolean(ir?.autorretenedorRenta);
  const responsableImpuesto = Boolean(iyc?.responsableImpuesto);
  return {
    impuestoRenta: {
      contribuyente,
      calidadContribuyente: calidad,
      regimenOrdinario: typeof ir?.regimenOrdinario === "boolean" ? ir.regimenOrdinario : calidad === "ORDINARIO",
      regimenEspecial: typeof ir?.regimenEspecial === "boolean" ? ir.regimenEspecial : calidad === "ESPECIAL_SIN_ANIMO_LUCRO",
      regimenSimple: typeof ir?.regimenSimple === "boolean" ? ir.regimenSimple : calidad === "RST",
      granContribuyente,
      autorretenedorRenta,
      resolucion: granContribuyente ? (ir?.resolucion ?? "") : "",
      fechaResolucion: granContribuyente ? (ir?.fechaResolucion ?? 0) : 0,
      resolucionAutorretenedor: autorretenedorRenta ? (ir?.resolucionAutorretenedor ?? "") : "",
    },
    impuestoVentas: { responsableIva: Boolean(iv?.responsableIva), retencionIva: Boolean(iv?.retencionIva) },
    impuestoIndustriaYComercio: {
      responsableImpuesto,
      municipiosIcaResponsable: iyc?.municipiosIcaResponsable ?? [],
      granContribuyenteBogota: { es: !responsableImpuesto && Boolean(gcb?.es), resolucion: gcb?.resolucion ?? "", fechaResolucion: gcb?.fechaResolucion ?? 0 },
    },
    sujetoReteIca: { es: Boolean(sr?.es), municipios: sr?.municipios ?? [], tarifa: typeof sr?.tarifa === "number" ? sr.tarifa : undefined },
    autorretenedorIca: { es: Boolean(ar?.es), municipios: ar?.municipios ?? [] },
  };
}

export function normalizeCondicionesPago(c: { formaPago?: string; plazo?: string } | undefined): FormValues["condicionesPago_12"] {
  const forma = c?.formaPago === "Crédito" ? "Crédito" : "Contado";
  if (forma === "Contado") return { formaPago: "Contado", plazo: "NA" };
  const plazoRaw = c?.plazo ?? "";
  const plazo = (PLAZO_CREDITO_VALUES as readonly string[]).includes(plazoRaw) ? (plazoRaw as (typeof PLAZO_CREDITO_VALUES)[number]) : "30 días";
  return { formaPago: "Crédito", plazo };
}

function tipoDocOr(value: string | undefined, fallback: TipoDoc): TipoDoc {
  return (TIPO_DOC_VALUES as readonly string[]).includes(value ?? "") ? (value as TipoDoc) : fallback;
}

/** Builds the form state from the public projection (what the supplier already saved). */
export function toFormValues(ins: InscripcionPublica): FormValues {
  const d = ins.datos_generales_01;
  const a = ins.actividadPrincipal_02;
  const it = ins.infoTributaria_04;
  const ib = ins.infoBancaria_10;
  return {
    datos_generales_01: {
      tipoPersona: d.tipoPersona || "PERSONA_JURIDICA",
      razonSocial: d.razonSocial ?? "",
      contactoNombre: d.contactoNombre ?? "",
      contactoEmail: d.contactoEmail ?? "",
      contactoCelular: d.contactoCelular ?? "",
      direccion: d.direccion ?? "",
      ciudad: d.ciudad ?? "",
      departamento: d.departamento ?? "",
      telefono: d.telefono ?? "",
      celular: d.celular ?? "",
      email: d.email ?? "",
      website: d.website ?? "",
      representanteLegalNombre: d.representanteLegalNombre ?? "",
      representanteLegalTipoDocumento: tipoDocOr(d.representanteLegalTipoDocumento, "C.C."),
      representanteLegalNumeroDocumento: d.representanteLegalNumeroDocumento ?? "",
      representanteLegalEmail: d.representanteLegalEmail ?? "",
      representanteLegalTelefono: d.representanteLegalTelefono ?? "",
      representanteLegalCelular: d.representanteLegalCelular ?? "",
      representanteLegalNombreContacto: d.representanteLegalNombreContacto ?? "",
      representanteLegalNacionalidad: d.representanteLegalNacionalidad ?? "",
      tesoreroNombre: d.tesoreroNombre ?? "",
      tesoreroEmail: d.tesoreroEmail ?? "",
      tesoreroTelefono: d.tesoreroTelefono ?? "",
      contadorNombre: d.contadorNombre ?? "",
      contadorEmail: d.contadorEmail ?? "",
      contadorTelefono: d.contadorTelefono ?? "",
    },
    actividadPrincipal_02: {
      codigoCiiu: a?.codigoCiiu ?? "",
      actividadEconomica: a?.actividadEconomica ?? "",
      descripcionServicio: a?.descripcionServicio ?? "",
      cuentasExtranjero: a?.cuentasExtranjero ?? "",
      transaccionesVirtuales: a?.transaccionesVirtuales ?? "",
    },
    conflictoIntereses_03: ins.conflictoIntereses_03 ?? DEFAULT_FORM_VALUES.conflictoIntereses_03,
    infoTributaria_04: {
      aiu: it?.aiu,
      aiuA: it?.aiuA,
      aiuI: it?.aiuI,
      aiuU: it?.aiuU,
      origenFondos: it?.origenFondos ?? "",
      actividadesEconomicasExtranjeras: it?.actividadesEconomicasExtranjeras ?? "",
      tipoReteFuenteIfPersonaNatural: it?.tipoReteFuenteIfPersonaNatural ?? "",
      tarifaReteFuente: it?.tarifaReteFuente,
      tarifaReteIvaRST: it?.tarifaReteIvaRST,
      ...normalizeImpuestos(it),
    },
    compoAccionaria_05: ins.compoAccionaria_05?.length
      ? ins.compoAccionaria_05.map((acc) => {
          const hasPepData = !!(acc.isPep?.ejerceActualmente || acc.isPep?.cargo?.trim() || acc.isPep?.dataCercanos?.trim() || (acc.isPep?.fechaInicio ?? 0) > 0 || acc.isPep?.cuentasExtranjero);
          return {
            nombre: acc.nombre,
            tipoDocumento: tipoDocOr(acc.tipoDocumento, "C.C."),
            numeroDocumento: acc.numeroDocumento,
            porcentajeParticipacion: acc.porcentajeParticipacion,
            nacionalidad: acc.nacionalidad,
            esPep: hasPepData,
            isPep: { ...defaultIsPep(), ...acc.isPep, fideicomisos: acc.isPep?.fideicomisos ?? [] },
            ifNatural: acc.ifNatural ?? { isAccionista: false, nombreEmpresa: "", nitEmpresa: "" },
          };
        })
      : [defaultAccionista()],
    contactos_09: ins.contactos_09?.length ? ins.contactos_09 : [defaultContacto],
    infoBancaria_10: {
      tipoCuenta: ib?.tipoCuenta === "Ahorros" ? "Ahorros" : "Corriente",
      entidad: ib?.entidad ?? "",
      numeroCuenta: ib?.numeroCuenta ?? "",
      titular: ib?.titular ?? "",
      tipoDocumento: tipoDocOr(ib?.tipoDocumento, "NIT"),
      numeroDocumento: ib?.numeroDocumento ?? "",
      email: ib?.email ?? "",
    },
    referenciasComerciales_11: ins.referenciasComerciales_11?.length ? ins.referenciasComerciales_11 : [defaultReferencia],
    adicionales_13: ins.adicionales_13 ?? { aniosExperiencia: 0, certificaciones: [], serviciosXGarantias: "" },
    condicionesPago_12: normalizeCondicionesPago(ins.condicionesPago_12),
  };
}

// ─── Payload builders (form → Convex) ────────────────────────────────────────
const toNum = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const toNumOpt = (v: unknown): number | undefined => {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

/** Converts the tax slice of the form into the Convex payload (numbers coerced, branches normalized). */
export function buildInfoTributariaPayload(it: InfoTributariaValues) {
  const ir = it.impuestoRenta;
  const iyc = it.impuestoIndustriaYComercio;
  const gcb = iyc?.granContribuyenteBogota;
  const sr = it.sujetoReteIca;
  const ar = it.autorretenedorIca;
  const isRegimenSimple = Boolean(ir?.regimenSimple);
  const isAutorretenedorRenta = Boolean(ir?.autorretenedorRenta);
  const calidadContribuyente: CalidadContribuyente = ir?.regimenSimple ? "RST" : ir?.regimenEspecial ? "ESPECIAL_SIN_ANIMO_LUCRO" : ir?.regimenOrdinario ? "ORDINARIO" : "NO_CONTRIBUYENTE";
  const tarifaReteFuente = toNumOpt(it.tarifaReteFuente);
  const tarifaReteIvaRST = toNumOpt(it.tarifaReteIvaRST);
  const srTarifa = toNumOpt(sr?.tarifa);

  return {
    aiu: toNumOpt(it.aiu),
    aiuA: toNumOpt(it.aiuA),
    aiuI: toNumOpt(it.aiuI),
    aiuU: toNumOpt(it.aiuU),
    origenFondos: it.origenFondos ?? "",
    actividadesEconomicasExtranjeras: it.actividadesEconomicasExtranjeras,
    tipoReteFuenteIfPersonaNatural: it.tipoReteFuenteIfPersonaNatural || undefined,
    tarifaReteFuente: !isAutorretenedorRenta ? (tarifaReteFuente ?? 0) : 0,
    tarifaReteIvaRST: isRegimenSimple ? (tarifaReteIvaRST ?? 0) : 0,
    impuestoRenta: ir
      ? {
          contribuyente: Boolean(ir.contribuyente),
          calidadContribuyente,
          regimenOrdinario: Boolean(ir.regimenOrdinario),
          regimenEspecial: Boolean(ir.regimenEspecial),
          regimenSimple: Boolean(ir.regimenSimple),
          granContribuyente: Boolean(ir.granContribuyente),
          autorretenedorRenta: Boolean(ir.autorretenedorRenta),
          resolucion: ir.resolucion ?? "",
          fechaResolucion: toNum(ir.fechaResolucion),
          resolucionAutorretenedor: ir.resolucionAutorretenedor ?? "",
        }
      : undefined,
    impuestoVentas: it.impuestoVentas ? { responsableIva: Boolean(it.impuestoVentas.responsableIva), retencionIva: Boolean(it.impuestoVentas.retencionIva) } : undefined,
    impuestoIndustriaYComercio: iyc
      ? {
          responsableImpuesto: Boolean(iyc.responsableImpuesto),
          municipiosIcaResponsable: iyc.municipiosIcaResponsable ?? [],
          granContribuyenteBogota: {
            es: Boolean(gcb?.es) && !iyc.responsableImpuesto,
            resolucion: gcb?.resolucion ?? "",
            fechaResolucion: toNum(gcb?.fechaResolucion),
          },
        }
      : undefined,
    sujetoReteIca: sr ? { es: Boolean(sr.es), municipios: sr.municipios ?? [], ...(srTarifa !== undefined ? { tarifa: srTarifa } : {}) } : undefined,
    autorretenedorIca: ar ? { es: Boolean(ar.es), municipios: ar.municipios ?? [] } : undefined,
  };
}

/** Full section payload for `actualizarInscripcion` (identity fields are never sent). */
export function buildSectionsPayload(values: FormValues) {
  const safeNum = toNum;
  return {
    datos_generales_01: values.datos_generales_01,
    actividadPrincipal_02: {
      codigoCiiu: values.actividadPrincipal_02.codigoCiiu,
      actividadEconomica: values.actividadPrincipal_02.actividadEconomica,
      descripcionServicio: values.actividadPrincipal_02.descripcionServicio,
      cuentasExtranjero: values.actividadPrincipal_02.cuentasExtranjero,
      transaccionesVirtuales: values.actividadPrincipal_02.transaccionesVirtuales,
    },
    conflictoIntereses_03: values.conflictoIntereses_03,
    infoTributaria_04: buildInfoTributariaPayload(values.infoTributaria_04),
    compoAccionaria_05: (values.compoAccionaria_05 ?? [])
      .filter((a) => a.nombre || a.numeroDocumento)
      .map((a) => ({
        nombre: a.nombre,
        tipoDocumento: tipoDocOr(a.tipoDocumento, "C.C."),
        numeroDocumento: a.numeroDocumento,
        porcentajeParticipacion: safeNum(a.porcentajeParticipacion),
        nacionalidad: a.nacionalidad,
        isPep: a.esPep
          ? {
              ejerceActualmente: a.isPep.ejerceActualmente,
              cargo: a.isPep.cargo,
              fechaInicio: safeNum(a.isPep.fechaInicio),
              fechaFin: a.isPep.fechaFin !== undefined && a.isPep.fechaFin !== null ? safeNum(a.isPep.fechaFin) : undefined,
              dataCercanos: a.isPep.dataCercanos,
              cuentasExtranjero: a.isPep.cuentasExtranjero,
              fideicomisos: (a.isPep.fideicomisos ?? []).map((f) => ({ nombre: f.nombre, tipoDocumento: tipoDocOr(f.tipoDocumento, "C.C."), numeroDocumento: f.numeroDocumento })),
            }
          : defaultIsPep(),
        ifNatural: {
          isAccionista: a.ifNatural?.isAccionista ?? false,
          nombreEmpresa: a.ifNatural?.nombreEmpresa ?? "",
          nitEmpresa: a.ifNatural?.nitEmpresa ?? "",
        },
      })),
    contactos_09: (values.contactos_09 ?? []).filter((c) => c.nombre || c.email),
    infoBancaria_10: {
      ...values.infoBancaria_10,
      tipoCuenta: values.infoBancaria_10.tipoCuenta === "Ahorros" ? ("Ahorros" as const) : ("Corriente" as const),
      tipoDocumento: tipoDocOr(values.infoBancaria_10.tipoDocumento, "NIT"),
    },
    referenciasComerciales_11: (values.referenciasComerciales_11 ?? []).filter((r) => r.nombre),
    condicionesPago_12: normalizeCondicionesPago(values.condicionesPago_12),
    adicionales_13: {
      aniosExperiencia: safeNum(values.adicionales_13.aniosExperiencia),
      certificaciones: values.adicionales_13.certificaciones ?? [],
      serviciosXGarantias: values.adicionales_13.serviciosXGarantias ?? "",
    },
  };
}
