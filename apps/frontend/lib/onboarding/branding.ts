import { EMPRESAS_MAP, getEmpresaInfo } from "@/lib/empresas";

/**
 * Datos opcionales por empresa para los formularios públicos de onboarding
 * (sitio web, correo de contacto y enlaces de cumplimiento). Todo es opcional:
 * la UI y los PDF omiten el párrafo cuando falta. Datos de demostración.
 */
export type EmpresaOnboardingExtra = {
  web?: string;
  contactEmail?: string;
  emailProteccionDatos?: string;
  compliance?: {
    etica?: string;
    sagrilaft?: string;
    ptee?: string;
  };
};

export const EMPRESAS_ONBOARDING_EXTRA: Record<number, EmpresaOnboardingExtra> = {
  1: {
    web: "https://andes-logistica.example.com",
    contactEmail: "compras@andes-logistica.example.com",
    emailProteccionDatos: "proteccion.datos@andes-logistica.example.com",
    compliance: {
      etica: "https://andes-logistica.example.com/cumplimiento/codigo-etica",
      sagrilaft: "https://andes-logistica.example.com/cumplimiento/sagrilaft",
      ptee: "https://andes-logistica.example.com/cumplimiento/ptee",
    },
  },
  2: {
    web: "https://cordillera-mineria.example.com",
    contactEmail: "compras@cordillera-mineria.example.com",
    emailProteccionDatos: "proteccion.datos@cordillera-mineria.example.com",
    compliance: {
      etica: "https://cordillera-mineria.example.com/cumplimiento/codigo-etica",
      sagrilaft: "https://cordillera-mineria.example.com/cumplimiento/sagrilaft",
      ptee: "https://cordillera-mineria.example.com/cumplimiento/ptee",
    },
  },
  3: { web: "https://pacifico-ingenieria.example.com", contactEmail: "compras@pacifico-ingenieria.example.com" },
  4: { web: "https://altiplano-holding.example.com", contactEmail: "compras@altiplano-holding.example.com" },
};

export function hexToHsl(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return "0 100% 42%";
  const r = parseInt(result[1], 16) / 255;
  const g = parseInt(result[2], 16) / 255;
  const b = parseInt(result[3], 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

export type FormBranding = {
  empresaId: number;
  nombre: string;
  nombreCorto: string;
  nit: string;
  color: string;
  primaryHsl: string;
  /** Logo para fondos oscuros (cabecera del formulario). */
  logo: string;
  /** Logo para PDF (fondo blanco). */
  logoPdf: string;
  web?: string;
  contactEmail?: string;
  emailProteccionDatos?: string;
  compliance?: EmpresaOnboardingExtra["compliance"];
};

const FALLBACK_EMPRESA_ID = 1;

/** Branding neutro para formularios públicos, PDFs y correos de onboarding. */
export function getFormBranding(empresaId: number | null | undefined): FormBranding {
  const id = empresaId != null && EMPRESAS_MAP[empresaId] ? empresaId : FALLBACK_EMPRESA_ID;
  const info = getEmpresaInfo(id) ?? EMPRESAS_MAP[FALLBACK_EMPRESA_ID];
  const extra = EMPRESAS_ONBOARDING_EXTRA[id] ?? {};
  return {
    empresaId: id,
    nombre: info.nombre,
    nombreCorto: info.nombreCorto,
    nit: info.nit,
    color: info.color,
    primaryHsl: hexToHsl(info.color),
    logo: info.logoBlanco,
    logoPdf: info.logo,
    web: extra.web,
    contactEmail: extra.contactEmail,
    emailProteccionDatos: extra.emailProteccionDatos,
    compliance: extra.compliance,
  };
}

export function hasComplianceLinks(branding: FormBranding): boolean {
  const c = branding.compliance;
  return Boolean(c && (c.etica || c.sagrilaft || c.ptee));
}
