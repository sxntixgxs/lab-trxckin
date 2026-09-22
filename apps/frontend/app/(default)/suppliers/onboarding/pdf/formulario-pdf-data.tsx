import { format } from "date-fns";
import { es } from "date-fns/locale";
import type { Doc } from "@/convex/_generated/dataModel";
import { getFormBranding } from "@/lib/onboarding/branding";
import { actividadSecundariaDesdeMatrizProveedor } from "@/lib/catalogs/ciiu";
import type { FormularioPdfData } from "./FormularioPdf";
import { resolveNotasContabilidadForPdf } from "./notas-contabilidad-for-pdf";

type SupplierDoc = Doc<"onboardingProveedores">;

/**
 * Minimum shape needed to render the form PDF. Satisfied by the Convex document and by the
 * public projection returned to the third party (which has no risk matrix nor accounting notes).
 */
export type FormularioPdfSource = Pick<
  SupplierDoc,
  | "_id"
  | "empresa"
  | "datos_generales_01"
  | "actividadPrincipal_02"
  | "conflictoIntereses_03"
  | "infoTributaria_04"
  | "compoAccionaria_05"
  | "contactos_09"
  | "infoBancaria_10"
  | "referenciasComerciales_11"
  | "condicionesPago_12"
  | "adicionales_13"
  | "firmaRepresentante_16"
  | "firmadoEn"
> & {
  _creationTime?: number;
  creadoEn?: number;
  matriz_00?: Pick<SupplierDoc["matriz_00"], "actividadEconomicaPrincipal" | "codigoCiiuSecundario" | "actividadEconomicaSecundaria">;
  notasContabilidadFaseVI?: SupplierDoc["notasContabilidadFaseVI"];
};

export function shortRef(id: string): string {
  return id.slice(-8).toUpperCase();
}

/** Logo URL resolvable from the browser (react-pdf loads images through fetch). */
export function absoluteLogoUrl(path: string | undefined): string | undefined {
  if (!path) return undefined;
  if (/^https?:\/\//.test(path)) return path;
  return typeof window !== "undefined" ? window.location.origin + path : path;
}

export function firmadoALasDe(firmadoEn: number | undefined): string | undefined {
  if (!firmadoEn) return undefined;
  return `Firmado a las ${format(new Date(firmadoEn), "HH:mm dd/MM/yyyy", { locale: es })}`;
}

/** Builds the props of `FormularioPdf` from an inscription (internal document or public projection). */
export function buildFormularioPdfData(ins: FormularioPdfSource): FormularioPdfData {
  const branding = getFormBranding(ins.empresa);
  const dg = ins.datos_generales_01;
  const a2 = ins.actividadPrincipal_02;
  const ci = ins.conflictoIntereses_03;
  const it = ins.infoTributaria_04;
  const ib = ins.infoBancaria_10;
  const cp = ins.condicionesPago_12;
  const ad = ins.adicionales_13;
  const creado = ins._creationTime ?? ins.creadoEn;
  const notasContabilidad = resolveNotasContabilidadForPdf(ins);
  const actividadSecundaria = actividadSecundariaDesdeMatrizProveedor(ins.matriz_00);

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
    razonSocial: dg.razonSocial ?? "—",
    tipoDocumento: dg.tipoDocumento ?? "—",
    numeroDocumento: dg.numeroDocumento ?? "—",
    tipoPersona: dg.tipoPersona ?? "PERSONA_JURIDICA",
    tipoSolicitud: dg.tipoSolicitud,
    contactoNombre: dg.contactoNombre ?? "—",
    contactoEmail: dg.contactoEmail ?? "—",
    contactoCelular: dg.contactoCelular ?? "—",
    telefono: dg.telefono,
    celular: dg.celular,
    email: dg.email,
    direccion: dg.direccion,
    ciudad: dg.ciudad,
    departamento: dg.departamento,
    website: dg.website,
    representanteLegal: dg.representanteLegalNombre
      ? {
          nombre: dg.representanteLegalNombre,
          tipoDocumento: dg.representanteLegalTipoDocumento,
          numeroDocumento: dg.representanteLegalNumeroDocumento,
          email: dg.representanteLegalEmail,
          telefono: dg.representanteLegalTelefono,
          celular: dg.representanteLegalCelular,
          nombreContacto: dg.representanteLegalNombreContacto,
          nacionalidad: dg.representanteLegalNacionalidad,
        }
      : undefined,
    tesorero: dg.tesoreroNombre ? { nombre: dg.tesoreroNombre, email: dg.tesoreroEmail, telefono: dg.tesoreroTelefono } : undefined,
    contador: dg.contadorNombre ? { nombre: dg.contadorNombre, email: dg.contadorEmail, telefono: dg.contadorTelefono } : undefined,
    actividadPrincipal: a2
      ? {
          codigoCiiu: a2.codigoCiiu,
          actividadEconomica: a2.actividadEconomica ?? ins.matriz_00?.actividadEconomicaPrincipal,
          checklist: a2.checklist,
          descripcionServicio: a2.descripcionServicio,
          cuentasExtranjero: a2.cuentasExtranjero,
          transaccionesVirtuales: a2.transaccionesVirtuales,
        }
      : undefined,
    actividadSecundaria,
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
    infoTributaria: it
      ? {
          aiu: it.aiu,
          aiuA: it.aiuA,
          aiuI: it.aiuI,
          aiuU: it.aiuU,
          origenFondos: it.origenFondos,
          actividadesEconomicasExtranjeras: it.actividadesEconomicasExtranjeras,
          tipoReteFuenteIfPersonaNatural: it.tipoReteFuenteIfPersonaNatural,
          tarifaReteFuente: it.tarifaReteFuente,
          tarifaReteIvaRST: it.tarifaReteIvaRST,
          impuestoRenta: it.impuestoRenta,
          impuestoVentas: it.impuestoVentas,
          impuestoIndustriaYComercio: it.impuestoIndustriaYComercio,
          sujetoReteIca: it.sujetoReteIca,
          autorretenedorIca: it.autorretenedorIca,
        }
      : undefined,
    compoAccionaria: ins.compoAccionaria_05,
    contactosAdicionales: ins.contactos_09?.filter((c) => c.nombre || c.email),
    infoBancaria: ib
      ? {
          tipoCuenta: ib.tipoCuenta,
          entidad: ib.entidad,
          numeroCuenta: ib.numeroCuenta,
          titular: ib.titular,
          tipoDocumento: ib.tipoDocumento,
          numeroDocumento: ib.numeroDocumento,
          email: ib.email,
        }
      : undefined,
    referencias: ins.referenciasComerciales_11?.filter((r) => r.nombre),
    condicionesPago: cp ? { formaPago: cp.formaPago, plazo: cp.plazo } : undefined,
    adicionales: ad
      ? { aniosExperiencia: ad.aniosExperiencia, serviciosXGarantias: ad.serviciosXGarantias, certificaciones: ad.certificaciones }
      : undefined,
    firmaDataUrl: ins.firmaRepresentante_16,
    firmadoALas: firmadoALasDe(ins.firmadoEn),
    ...(notasContabilidad ? { notasContabilidad } : {}),
  };
}

/** Renders the form PDF in the browser and returns the blob (react-pdf is loaded lazily). */
export async function renderFormularioPdfBlob(ins: FormularioPdfSource): Promise<Blob> {
  const { pdf } = await import("@react-pdf/renderer");
  const { default: FormularioPdf } = await import("./FormularioPdf");
  return await pdf(<FormularioPdf data={buildFormularioPdfData(ins)} />).toBlob();
}
