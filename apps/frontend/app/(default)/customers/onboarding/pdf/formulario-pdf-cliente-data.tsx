import { format } from "date-fns";
import { es } from "date-fns/locale";
import type { Doc } from "@/convex/_generated/dataModel";
import { CIIU_ACTIVIDAD } from "@/lib/catalogs/ciiu";
import { getFormBranding } from "@/lib/onboarding/branding";
import type { FormularioClientePdfData } from "./FormularioPdfCliente";

type CustomerDoc = Doc<"onboardingClientes">;

/**
 * Minimum shape needed to render the customer form PDF. Satisfied by the Convex document and by
 * the public projection returned to the customer (which has no risk matrix nor accounting notes).
 */
export type FormularioClientePdfSource = Pick<
  CustomerDoc,
  | "_id"
  | "empresa"
  | "datos_generales_01"
  | "actividadEconomica_02"
  | "conflictoIntereses_03"
  | "infoTributaria_04"
  | "compoAccionaria_05"
  | "contactos_06"
  | "radicacionFactura_07"
  | "datosCuentasPagos_08"
  | "referenciasComerciales_11"
  | "condicionesPago_12"
  | "adicionales_13"
  | "firmaRepresentante_10"
  | "firmadoEn"
> & {
  _creationTime?: number;
  creadoEn?: number;
  notasContabilidadFaseIV?: string;
};

export function shortRef(id: string): string {
  return id.slice(-8).toUpperCase();
}

/** Logo URL resolvable from the browser (react-pdf loads images through fetch). */
export function absoluteLogoUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return typeof window !== "undefined" ? window.location.origin + path : path;
}

export function firmadoALasDe(firmadoEn: number | undefined): string | undefined {
  if (!firmadoEn) return undefined;
  return `Firmado a las ${format(new Date(firmadoEn), "HH:mm dd/MM/yyyy", { locale: es })}`;
}

/** Builds the props of `FormularioPdfCliente` from an inscription (internal document or public projection). */
export function buildFormularioClientePdfData(ins: FormularioClientePdfSource): FormularioClientePdfData {
  const branding = getFormBranding(ins.empresa);
  const dg = ins.datos_generales_01;
  const a2 = ins.actividadEconomica_02;
  const ci = ins.conflictoIntereses_03;
  const cp = ins.condicionesPago_12;
  const ad = ins.adicionales_13;
  const creado = ins._creationTime ?? ins.creadoEn;
  const codSec = a2?.codigoCiiuSecundario?.trim();
  const actSec = a2?.actividadEconomicaSecundaria?.trim() || (codSec ? CIIU_ACTIVIDAD[codSec] : undefined);
  const compliance = branding.compliance;

  return {
    inscripcionRef: shortRef(ins._id),
    fechaEnvio: creado ? format(new Date(creado), "dd/MM/yyyy", { locale: es }) : "—",
    logoUrl: absoluteLogoUrl(branding.logoPdf),
    primaryColor: branding.color,
    empresaNombre: branding.nombre,
    empresaParaDeclaraciones: {
      nombre: branding.nombre,
      nit: branding.nit,
      web: branding.web,
      emailProteccionDatos: branding.emailProteccionDatos,
    },
    enlacesCumplimiento: compliance && (compliance.etica || compliance.sagrilaft || compliance.ptee) ? compliance : undefined,
    razonSocial: dg.razonSocial ?? "—",
    tipoDocumento: dg.tipoDocumento ?? "—",
    numeroDocumento: dg.numeroDocumento ?? "—",
    tipoPersona: dg.tipoPersona ?? "PERSONA_JURIDICA",
    tipoSolicitud: dg.tipoSolicitud,
    celular: dg.celular ?? dg.contactoCelular,
    email: dg.email ?? dg.contactoEmail,
    direccion: dg.direccion,
    ciudad: dg.ciudad,
    departamento: dg.departamento,
    web: dg.web,
    representanteLegal: dg.representanteLegalNombre
      ? {
          nombre: dg.representanteLegalNombre,
          tipoDocumento: dg.representanteLegalTipoDocumento,
          numeroDocumento: dg.representanteLegalNumeroDocumento,
          email: dg.representanteLegalEmail,
          nacionalidad: dg.representanteLegalNacionalidad,
        }
      : undefined,
    tesorero: dg.tesoreroNombre ? { nombre: dg.tesoreroNombre, email: dg.tesoreroEmail, telefono: dg.tesoreroTelefono } : undefined,
    contador: dg.contadorNombre ? { nombre: dg.contadorNombre, email: dg.contadorEmail, telefono: dg.contadorTelefono } : undefined,
    actividadEconomica: a2
      ? {
          codigoCiiu: a2.codigoCiiu,
          actividadEconomica: a2.actividadEconomica ?? (a2.codigoCiiu ? CIIU_ACTIVIDAD[a2.codigoCiiu] : undefined),
          codigoCiiuSecundario: codSec || undefined,
          actividadEconomicaSecundaria: actSec || undefined,
          descripcionServicio: a2.descripcionServicio,
          cuentasExtranjero: a2.cuentasExtranjero,
          transaccionesVirtuales: a2.transaccionesVirtuales,
        }
      : undefined,
    conflicto: ci
      ? {
          representanteLegalXColaborador: ci.representanteLegalXColaborador,
          funcionariosExEmpresa: ci.funcionariosExEmpresa,
          gerentesXEmpresa: ci.gerentesXEmpresa,
          sociosXProveedorEmpresa: ci.sociosXProveedorEmpresa,
          profesionalesVinculadosXEmpresa: ci.profesionalesVinculadosXEmpresa,
          accionistasRelacionadosXEmpresa: ci.accionistasRelacionadosXEmpresa,
        }
      : undefined,
    compoAccionaria: ins.compoAccionaria_05?.map((ac) => ({
      nombre: ac.nombre,
      tipoDocumento: ac.tipoDocumento,
      numeroDocumento: ac.numeroDocumento,
      porcentajeParticipacion: ac.porcentajeParticipacion,
      nacionalidad: ac.nacionalidad,
      isPep: ac.isPep ? { ejerceActualmente: ac.isPep.ejerceActualmente, cargo: ac.isPep.cargo } : undefined,
    })),
    contactos: ins.contactos_06?.filter((c) => c.nombre || c.email),
    radicacionFactura: ins.radicacionFactura_07,
    datosCuentasPagos: ins.datosCuentasPagos_08,
    infoTributaria: ins.infoTributaria_04,
    referenciasComerciales: ins.referenciasComerciales_11?.filter((r) => r.nombre),
    adicionales: ad ? { aniosExperiencia: ad.aniosExperiencia, certificaciones: ad.certificaciones, serviciosXGarantias: ad.serviciosXGarantias } : undefined,
    condicionesPago: cp ? { formaPago: cp.formaPago, plazo: cp.plazo } : undefined,
    notasCierreContabilidad: ins.notasContabilidadFaseIV?.trim() || undefined,
    firmaDataUrl: ins.firmaRepresentante_10,
    firmadoALas: firmadoALasDe(ins.firmadoEn),
  };
}

/** Renders the customer form PDF in the browser and returns the blob (react-pdf is loaded lazily). */
export async function renderFormularioClientePdfBlob(ins: FormularioClientePdfSource): Promise<Blob> {
  const { pdf } = await import("@react-pdf/renderer");
  const { default: FormularioPdfCliente } = await import("./FormularioPdfCliente");
  return await pdf(<FormularioPdfCliente data={buildFormularioClientePdfData(ins)} />).toBlob();
}
