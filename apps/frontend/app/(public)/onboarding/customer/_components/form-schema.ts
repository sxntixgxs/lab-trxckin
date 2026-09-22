import { z } from "zod";
import type { FunctionReturnType } from "convex/server";
import type { UseFormReturn } from "react-hook-form";
import { BadgeCheck, Briefcase, Building2, FileText, GitBranch, Landmark, Share2, Star, Users } from "lucide-react";
import type { api } from "@/convex/_generated/api";
import { CIIU_ACTIVIDAD } from "@/lib/catalogs/ciiu";
import { TIPO_PERSONA_OPTIONS } from "@/lib/onboarding/risk/shared";
import {
  CALIDAD_CONTRIBUYENTE_VALUES,
  collectErrorPaths,
  defaultAccionista,
  defaultContacto,
  defaultIsPep,
  defaultReferencia,
  TIPO_DOC_VALUES,
  type CalidadContribuyente,
  type TipoDoc,
} from "../../supplier/_components/form-schema";

export { collectErrorPaths, defaultAccionista, defaultContacto, defaultReferencia };

export type InscripcionPublica = NonNullable<FunctionReturnType<typeof api.onboarding.customersPublic.obtenerInscripcionPublica>>;

export const STEPS = [
  { id: "01", label: "Datos generales", icon: Building2 },
  { id: "02", label: "Actividad económica", icon: Briefcase },
  { id: "03", label: "Conflicto de intereses", icon: GitBranch },
  { id: "04", label: "Info. tributaria", icon: FileText },
  { id: "05", label: "Composición accionaria", icon: Share2 },
  { id: "06", label: "Contactos adicionales", icon: Users },
  { id: "07", label: "Info. bancaria", icon: Landmark },
  { id: "08", label: "Referencias comerciales", icon: Star },
  { id: "09", label: "Información adicional", icon: BadgeCheck },
  { id: "10", label: "Documentos requeridos", icon: FileText },
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
  adicionales_13: 8,
};

export const TRIBUTARIA_FIELD_LABELS: Record<string, string> = {
  "impuestoRenta.contribuyente": "¿Es contribuyente?",
  "impuestoRenta.granContribuyente": "¿Es gran contribuyente DIAN?",
  "impuestoRenta.autorretenedorRenta": "¿Es autorretenedor DIAN?",
  "impuestoRenta.resolucion": "Resolución (gran contribuyente DIAN)",
  "impuestoRenta.resolucionAutorretenedor": "Resolución (autorretenedor DIAN)",
  "impuestoRenta.tarifaRetencionFuente": "Tarifa Rte Fte",
  "impuestoRenta.baseRetencionFuente": "Base retención en la fuente",
  "impuestoVentas.responsableIva": "¿Responsable IVA?",
  "impuestoVentas.tarifaRetencionIva": "Tarifa Rte IVA",
  "impuestoIndustriaYComercio.responsableImpuesto": "¿Es responsable de industria y comercio?",
  "impuestoIndustriaYComercio.municipios": "Municipios responsable de ICA",
  "impuestoIndustriaYComercio.esGranContribuyenteIcaBogota": "¿Es gran contribuyente ICA Bogotá?",
  "impuestoIndustriaYComercio.resolucionGranContribuyenteIca": "Resolución (gran contribuyente ICA Bogotá)",
  "basesReteFuente.practicaReteIca": "¿Practica retención de ICA?",
  "basesReteFuente.municipiosRetIca": "Municipios retención de ICA",
  "basesReteFuente.tarifaRetencionIca": "Tarifa Rte ICA",
  "basesReteFuente.whichBase": "Base retención ICA",
  correoFacturacionElectronica: "Correo único para facturación electrónica",
  "contactoCertificadosRetencion.correo": "Correo del contacto para certificados de retención",
};

// ─── Zod schema ──────────────────────────────────────────────────────────────
const tipoDocEnum = z.enum(TIPO_DOC_VALUES);
const emailOpcional = z.string().email("Email inválido").or(z.literal("")).optional();

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
    web: z.string().optional(),
    representanteLegalNombre: z.string().min(1, "Requerido"),
    representanteLegalTipoDocumento: tipoDocEnum,
    representanteLegalNumeroDocumento: z.string().min(1, "Requerido"),
    representanteLegalEmail: z.string().email("Email inválido"),
    representanteLegalNacionalidad: z.string().optional(),
    tesoreroNombre: z.string().optional(),
    tesoreroEmail: emailOpcional,
    tesoreroTelefono: z.string().optional(),
    contadorNombre: z.string().optional(),
    contadorEmail: emailOpcional,
    contadorTelefono: z.string().optional(),
  }),
  // Same key as the supplier form so the shared "Actividad económica" section can be reused.
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
    impuestoRenta: z.object({
      contribuyente: z.boolean().optional(),
      calidadContribuyente: z.enum(CALIDAD_CONTRIBUYENTE_VALUES).optional(),
      regimenOrdinario: z.boolean().optional(),
      regimenEspecial: z.boolean().optional(),
      regimenSimple: z.boolean().optional(),
      granContribuyente: z.boolean().optional(),
      autorretenedorRenta: z.boolean().optional(),
      resolucion: z.string().optional(),
      resolucionAutorretenedor: z.string().optional(),
      tarifaRetencionFuente: z.string().optional(),
      baseRetencionFuente: z.string().optional(),
    }),
    impuestoVentas: z.object({
      responsableIva: z.boolean().optional(),
      retencionIva: z.boolean().optional(),
      tarifaRetencionIva: z.string().optional(),
    }),
    impuestoIndustriaYComercio: z.object({
      responsableImpuesto: z.boolean().optional(),
      municipios: z.array(z.string()).optional(),
      esGranContribuyenteIcaBogota: z.boolean().optional(),
      resolucionGranContribuyenteIca: z.string().optional(),
    }),
    basesReteFuente: z.object({
      practicaReteFuente: z.boolean().optional(),
      cualBase: z.string().optional(),
      practicaReteIca: z.boolean().optional(),
      whichBase: z.string().optional(),
      municipiosRetIca: z.array(z.string()).optional(),
      tarifaRetencionIca: z.string().optional(),
    }),
    correoFacturacionElectronica: z.string().email("Email inválido").or(z.literal("")).optional(),
    contactoCertificadosRetencion: z.object({ nombre: z.string().optional(), correo: emailOpcional, telefono: z.string().optional() }),
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
  // Same key as the supplier form (shared section); persisted as `contactos_06`.
  contactos_09: z.array(z.object({ nombre: z.string(), area: z.string(), cargo: z.string(), email: z.string(), celular: z.string() })).optional(),
  // Same key as the supplier form (shared section); persisted as the first row of `datosCuentasPagos_08`.
  infoBancaria_10: z.object({
    tipoCuenta: z.enum(["Ahorros", "Corriente"]),
    entidad: z.string().min(1, "Requerido"),
    numeroCuenta: z.string().min(1, "Requerido"),
    titular: z.string().min(1, "Requerido"),
    tipoDocumento: tipoDocEnum,
    numeroDocumento: z.string().min(1, "Requerido"),
    email: z.string().email("Email inválido"),
  }),
  referenciasComerciales_11: z.array(z.object({ nombre: z.string(), ciudad: z.string(), telefono: z.string(), personaContacto: z.string(), tiempoProveedor: z.string() })).optional(),
  adicionales_13: z.object({
    aniosExperiencia: z.coerce.number().min(0),
    certificaciones: z.array(z.object({ nombre: z.string(), alcance: z.string() })).optional(),
    serviciosXGarantias: z.string().optional(),
  }),
});

export type FormValues = z.infer<typeof formSchema>;
export type InfoTributariaValues = FormValues["infoTributaria_04"];
export type CustomerForm = UseFormReturn<FormValues>;

export const DEFAULT_INFO_TRIBUTARIA: InfoTributariaValues = {
  impuestoRenta: {
    contribuyente: false,
    calidadContribuyente: "NO_CONTRIBUYENTE",
    regimenOrdinario: false,
    regimenEspecial: false,
    regimenSimple: false,
    granContribuyente: false,
    autorretenedorRenta: false,
    resolucion: "",
    resolucionAutorretenedor: "",
    tarifaRetencionFuente: "",
    baseRetencionFuente: "",
  },
  impuestoVentas: { responsableIva: false, retencionIva: false, tarifaRetencionIva: "" },
  impuestoIndustriaYComercio: { responsableImpuesto: false, municipios: [], esGranContribuyenteIcaBogota: false, resolucionGranContribuyenteIca: "" },
  basesReteFuente: { practicaReteFuente: false, cualBase: "", practicaReteIca: false, whichBase: "", municipiosRetIca: [], tarifaRetencionIca: "" },
  correoFacturacionElectronica: "",
  contactoCertificadosRetencion: { nombre: "", correo: "", telefono: "" },
};

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
    web: "",
    representanteLegalNombre: "",
    representanteLegalTipoDocumento: "C.C.",
    representanteLegalNumeroDocumento: "",
    representanteLegalEmail: "",
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
  infoTributaria_04: DEFAULT_INFO_TRIBUTARIA,
  compoAccionaria_05: [defaultAccionista()],
  contactos_09: [defaultContacto],
  infoBancaria_10: { tipoCuenta: "Corriente", entidad: "", numeroCuenta: "", titular: "", tipoDocumento: "NIT", numeroDocumento: "", email: "" },
  referenciasComerciales_11: [defaultReferencia],
  adicionales_13: { aniosExperiencia: 0, certificaciones: [], serviciosXGarantias: "" },
};

// ─── Normalizers (server → form) ─────────────────────────────────────────────
function tipoDocOr(value: string | undefined, fallback: TipoDoc): TipoDoc {
  return (TIPO_DOC_VALUES as readonly string[]).includes(value ?? "") ? (value as TipoDoc) : fallback;
}

export function normalizeInfoTributaria(raw: InscripcionPublica["infoTributaria_04"]): InfoTributariaValues {
  const ir = raw?.impuestoRenta;
  const iv = raw?.impuestoVentas;
  const iyc = raw?.impuestoIndustriaYComercio;
  const brf = raw?.basesReteFuente;
  const cc = raw?.contactoCertificadosRetencion;
  const calidadRaw = ir?.calidadContribuyente;
  const calidad: CalidadContribuyente = calidadRaw && (CALIDAD_CONTRIBUYENTE_VALUES as readonly string[]).includes(calidadRaw) ? (calidadRaw as CalidadContribuyente) : ir?.contribuyente ? "ORDINARIO" : "NO_CONTRIBUYENTE";
  const contribuyente = typeof ir?.contribuyente === "boolean" ? ir.contribuyente : calidad !== "NO_CONTRIBUYENTE";
  return {
    impuestoRenta: {
      contribuyente,
      calidadContribuyente: contribuyente ? calidad : "NO_CONTRIBUYENTE",
      regimenOrdinario: contribuyente ? (typeof ir?.regimenOrdinario === "boolean" ? ir.regimenOrdinario : calidad === "ORDINARIO") : false,
      regimenEspecial: contribuyente ? (typeof ir?.regimenEspecial === "boolean" ? ir.regimenEspecial : calidad === "ESPECIAL_SIN_ANIMO_LUCRO") : false,
      regimenSimple: contribuyente ? (typeof ir?.regimenSimple === "boolean" ? ir.regimenSimple : calidad === "RST") : false,
      granContribuyente: Boolean(ir?.granContribuyente),
      autorretenedorRenta: Boolean(ir?.autorretenedorRenta),
      resolucion: ir?.resolucion ?? "",
      resolucionAutorretenedor: ir?.resolucionAutorretenedor ?? "",
      tarifaRetencionFuente: ir?.tarifaRetencionFuente ?? "",
      baseRetencionFuente: ir?.baseRetencionFuente ?? "",
    },
    impuestoVentas: { responsableIva: Boolean(iv?.responsableIva), retencionIva: Boolean(iv?.retencionIva), tarifaRetencionIva: iv?.tarifaRetencionIva ?? "" },
    impuestoIndustriaYComercio: {
      responsableImpuesto: Boolean(iyc?.responsableImpuesto),
      municipios: iyc?.municipios ?? [],
      esGranContribuyenteIcaBogota: Boolean(iyc?.esGranContribuyenteIcaBogota),
      resolucionGranContribuyenteIca: iyc?.resolucionGranContribuyenteIca ?? "",
    },
    basesReteFuente: {
      practicaReteFuente: Boolean(brf?.practicaReteFuente),
      cualBase: brf?.cualBase ?? "",
      practicaReteIca: Boolean(brf?.practicaReteIca),
      whichBase: brf?.whichBase ?? "",
      municipiosRetIca: brf?.municipiosRetIca ?? [],
      tarifaRetencionIca: brf?.tarifaRetencionIca ?? "",
    },
    correoFacturacionElectronica: raw?.correoFacturacionElectronica ?? "",
    contactoCertificadosRetencion: { nombre: cc?.nombre ?? "", correo: cc?.correo ?? "", telefono: cc?.telefono ?? "" },
  };
}

/** Builds the form state from the public projection (what the customer already saved). */
export function toFormValues(ins: InscripcionPublica): FormValues {
  const d = ins.datos_generales_01;
  const a = ins.actividadEconomica_02;
  const cuenta = ins.datosCuentasPagos_08?.[0];
  return {
    datos_generales_01: {
      tipoPersona: d.tipoPersona ?? "PERSONA_JURIDICA",
      razonSocial: d.razonSocial ?? "",
      contactoNombre: d.contactoNombre ?? d.representanteLegalNombre ?? "",
      contactoEmail: d.contactoEmail ?? d.email ?? "",
      contactoCelular: d.contactoCelular ?? d.celular ?? "",
      direccion: d.direccion ?? "",
      ciudad: d.ciudad ?? "",
      departamento: d.departamento ?? "",
      telefono: d.telefono ?? "",
      web: d.web ?? "",
      representanteLegalNombre: d.representanteLegalNombre ?? "",
      representanteLegalTipoDocumento: tipoDocOr(d.representanteLegalTipoDocumento, "C.C."),
      representanteLegalNumeroDocumento: d.representanteLegalNumeroDocumento ?? "",
      representanteLegalEmail: d.representanteLegalEmail ?? "",
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
    infoTributaria_04: normalizeInfoTributaria(ins.infoTributaria_04),
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
    contactos_09: ins.contactos_06?.length ? ins.contactos_06 : [defaultContacto],
    infoBancaria_10: {
      tipoCuenta: cuenta?.tipoCuenta === "Ahorros" ? "Ahorros" : "Corriente",
      entidad: cuenta?.entidad ?? "",
      numeroCuenta: cuenta?.numeroCuenta ?? "",
      titular: cuenta?.titular ?? "",
      tipoDocumento: tipoDocOr(cuenta?.tipoDocumento, d.tipoDocumento ?? "NIT"),
      numeroDocumento: cuenta?.numeroDocumento ?? d.numeroDocumento ?? "",
      email: cuenta?.email ?? d.email ?? "",
    },
    referenciasComerciales_11: ins.referenciasComerciales_11?.length ? ins.referenciasComerciales_11 : [defaultReferencia],
    adicionales_13: ins.adicionales_13 ?? { aniosExperiencia: 0, certificaciones: [], serviciosXGarantias: "" },
  };
}

// ─── Payload builders (form → Convex) ────────────────────────────────────────
const toNum = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const clean = (v: string | undefined): string | undefined => (v?.trim() ? v.trim() : undefined);

/** Converts the tax slice of the form into the Convex payload (empty strings dropped, branches normalized). */
export function buildInfoTributariaPayload(it: InfoTributariaValues) {
  const ir = it.impuestoRenta;
  const contribuyente = Boolean(ir.contribuyente);
  const calidad: CalidadContribuyente = !contribuyente ? "NO_CONTRIBUYENTE" : ir.regimenSimple ? "RST" : ir.regimenEspecial ? "ESPECIAL_SIN_ANIMO_LUCRO" : "ORDINARIO";
  const granContribuyente = Boolean(ir.granContribuyente);
  const autorretenedor = Boolean(ir.autorretenedorRenta);
  const responsableIca = Boolean(it.impuestoIndustriaYComercio.responsableImpuesto);
  const practicaReteIca = Boolean(it.basesReteFuente.practicaReteIca);
  return {
    impuestoRenta: {
      contribuyente,
      calidadContribuyente: calidad,
      regimenOrdinario: contribuyente && calidad === "ORDINARIO",
      regimenEspecial: contribuyente && calidad === "ESPECIAL_SIN_ANIMO_LUCRO",
      regimenSimple: contribuyente && calidad === "RST",
      granContribuyente,
      autorretenedorRenta: autorretenedor,
      resolucion: granContribuyente ? clean(ir.resolucion) : undefined,
      resolucionAutorretenedor: autorretenedor ? clean(ir.resolucionAutorretenedor) : undefined,
      tarifaRetencionFuente: clean(ir.tarifaRetencionFuente),
      baseRetencionFuente: clean(ir.baseRetencionFuente),
    },
    impuestoVentas: {
      responsableIva: Boolean(it.impuestoVentas.responsableIva),
      retencionIva: Boolean(it.impuestoVentas.retencionIva),
      tarifaRetencionIva: granContribuyente ? clean(it.impuestoVentas.tarifaRetencionIva) : undefined,
    },
    impuestoIndustriaYComercio: {
      responsableImpuesto: responsableIca,
      municipios: responsableIca ? (it.impuestoIndustriaYComercio.municipios ?? []) : [],
      esGranContribuyenteIcaBogota: responsableIca && Boolean(it.impuestoIndustriaYComercio.esGranContribuyenteIcaBogota),
      resolucionGranContribuyenteIca: responsableIca && it.impuestoIndustriaYComercio.esGranContribuyenteIcaBogota ? clean(it.impuestoIndustriaYComercio.resolucionGranContribuyenteIca) : undefined,
    },
    basesReteFuente: {
      practicaReteFuente: Boolean(it.basesReteFuente.practicaReteFuente),
      cualBase: it.basesReteFuente.practicaReteFuente ? clean(it.basesReteFuente.cualBase) : undefined,
      practicaReteIca,
      whichBase: practicaReteIca ? clean(it.basesReteFuente.whichBase) : undefined,
      municipiosRetIca: practicaReteIca ? (it.basesReteFuente.municipiosRetIca ?? []) : [],
      tarifaRetencionIca: practicaReteIca ? clean(it.basesReteFuente.tarifaRetencionIca) : undefined,
    },
    correoFacturacionElectronica: clean(it.correoFacturacionElectronica),
    contactoCertificadosRetencion: {
      nombre: clean(it.contactoCertificadosRetencion.nombre),
      correo: clean(it.contactoCertificadosRetencion.correo),
      telefono: clean(it.contactoCertificadosRetencion.telefono),
    },
  };
}

const DIAS_RADICACION_MS = 30 * 24 * 60 * 60 * 1000;

/** Full section payload for `actualizarInscripcion` (identity fields are never sent). */
export function buildSectionsPayload(values: FormValues) {
  const dg = values.datos_generales_01;
  const it = values.infoTributaria_04;
  const ib = values.infoBancaria_10;
  const ciiu = values.actividadPrincipal_02.codigoCiiu.trim();
  return {
    datos_generales_01: {
      ...dg,
      web: clean(dg.web),
      tesoreroEmail: clean(dg.tesoreroEmail),
      contadorEmail: clean(dg.contadorEmail),
    },
    actividadEconomica_02: {
      codigoCiiu: ciiu,
      actividadEconomica: clean(values.actividadPrincipal_02.actividadEconomica) ?? CIIU_ACTIVIDAD[ciiu],
      descripcionServicio: clean(values.actividadPrincipal_02.descripcionServicio),
      cuentasExtranjero: clean(values.actividadPrincipal_02.cuentasExtranjero),
      transaccionesVirtuales: clean(values.actividadPrincipal_02.transaccionesVirtuales),
    },
    conflictoIntereses_03: values.conflictoIntereses_03,
    infoTributaria_04: buildInfoTributariaPayload(it),
    compoAccionaria_05: (values.compoAccionaria_05 ?? [])
      .filter((a) => a.nombre || a.numeroDocumento)
      .map((a) => ({
        nombre: a.nombre,
        tipoDocumento: tipoDocOr(a.tipoDocumento, "C.C."),
        numeroDocumento: a.numeroDocumento,
        porcentajeParticipacion: toNum(a.porcentajeParticipacion),
        nacionalidad: a.nacionalidad,
        isPep: a.esPep
          ? {
              ejerceActualmente: a.isPep.ejerceActualmente,
              cargo: a.isPep.cargo,
              fechaInicio: toNum(a.isPep.fechaInicio),
              fechaFin: a.isPep.fechaFin !== undefined && a.isPep.fechaFin !== null ? toNum(a.isPep.fechaFin) : undefined,
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
    contactos_06: (values.contactos_09 ?? []).filter((c) => c.nombre || c.email),
    radicacionFactura_07: {
      direccion: dg.direccion ?? "",
      correoFacturacion: clean(it.correoFacturacionElectronica) ?? dg.contactoEmail,
      fechaMaximaRadicacion: Date.now() + DIAS_RADICACION_MS,
    },
    datosCuentasPagos_08:
      ib.entidad || ib.numeroCuenta
        ? [
            {
              tipoCuenta: ib.tipoCuenta === "Ahorros" ? ("Ahorros" as const) : ("Corriente" as const),
              entidad: ib.entidad,
              numeroCuenta: ib.numeroCuenta,
              titular: ib.titular,
              tipoDocumento: tipoDocOr(ib.tipoDocumento, "NIT"),
              numeroDocumento: clean(ib.numeroDocumento),
              email: clean(ib.email),
              ciudad: clean(dg.ciudad),
              departamento: clean(dg.departamento),
            },
          ]
        : [],
    referenciasComerciales_11: (values.referenciasComerciales_11 ?? []).filter((r) => r.nombre),
    adicionales_13: {
      aniosExperiencia: toNum(values.adicionales_13.aniosExperiencia),
      certificaciones: values.adicionales_13.certificaciones ?? [],
      serviciosXGarantias: values.adicionales_13.serviciosXGarantias ?? "",
    },
  };
}
