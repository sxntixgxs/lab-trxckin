// Catálogo de roles del módulo de onboarding (proveedores y clientes).
import type { CustomerRol } from "./phases/customers";
import type { SupplierRol } from "./phases/suppliers";

export type OnboardingModulo = "supplier" | "customer";
export type OnboardingRol = SupplierRol | CustomerRol;
export type PermisoWhitelist = "CONSULTA" | "CONSULTA_CREACION";

export const ONBOARDING_MODULOS: readonly OnboardingModulo[] = ["supplier", "customer"];

export const ONBOARDING_MODULO_LABELS: Record<OnboardingModulo, string> = {
  supplier: "Proveedores",
  customer: "Clientes",
};

/** Ruta/permiso del módulo interno. */
export const ONBOARDING_PERMISO_POR_MODULO: Record<OnboardingModulo, string> = {
  supplier: "suppliers/onboarding",
  customer: "customers/onboarding",
};

/** Ruta interna del tablero de cada módulo. */
export const ONBOARDING_RUTA_INTERNA: Record<OnboardingModulo, string> = {
  supplier: "/suppliers/onboarding",
  customer: "/customers/onboarding",
};

/** Segmento público del formulario de cada módulo. */
export const ONBOARDING_RUTA_PUBLICA: Record<OnboardingModulo, string> = {
  supplier: "/onboarding/supplier",
  customer: "/onboarding/customer",
};

export const ROLES_POR_MODULO: Record<OnboardingModulo, readonly OnboardingRol[]> = {
  supplier: [
    "CUMPLIMIENTO_LOW_RISK",
    "CUMPLIMIENTO_MEDIUM_RISK",
    "CUMPLIMIENTO_HIGH_RISK",
    "COMPRAS",
    "FINANCIERO",
    "CONTABILIDAD",
  ],
  customer: ["CUMPLIMIENTO_LOW_RISK", "CUMPLIMIENTO_MEDIUM_RISK", "CUMPLIMIENTO_HIGH_RISK", "FINANCIERO", "CONTABILIDAD"],
};

export const ROLES_CUMPLIMIENTO: ReadonlySet<string> = new Set([
  "CUMPLIMIENTO_LOW_RISK",
  "CUMPLIMIENTO_MEDIUM_RISK",
  "CUMPLIMIENTO_HIGH_RISK",
]);

export type RolConfigInfo = { label: string; descripcion: string };

export const SUPPLIER_ROL_CONFIG: Record<SupplierRol, RolConfigInfo> = {
  CUMPLIMIENTO_LOW_RISK: {
    label: "Cumplimiento — Riesgo Bajo/Medio",
    descripcion: "Analiza riesgo, revisa documentos de proveedores BAJO y MEDIO. Aprueba en Fase IV.",
  },
  CUMPLIMIENTO_MEDIUM_RISK: {
    label: "Cumplimiento — Riesgo Alto",
    descripcion: "Aprueba en Fase IV inscripciones con riesgo ALTO.",
  },
  CUMPLIMIENTO_HIGH_RISK: {
    label: "Cumplimiento — Riesgo Superior",
    descripcion: "Aprueba en Fase IV inscripciones con riesgo SUPERIOR.",
  },
  COMPRAS: {
    label: "Compras",
    descripcion: "Revisa los documentos comerciales en Fase III y evalúa al proveedor en Fase V.",
  },
  FINANCIERO: {
    label: "Financiero",
    descripcion: "Consulta inscripciones y recibe el cierre con el reporte de tiempos por fase.",
  },
  CONTABILIDAD: {
    label: "Contabilidad",
    descripcion: "Registra el proveedor en el sistema contable (SIESA) en Fase VI.",
  },
};

export const CUSTOMER_ROL_CONFIG: Record<CustomerRol, RolConfigInfo> = {
  CUMPLIMIENTO_LOW_RISK: {
    label: "Cumplimiento — Evaluación Baja",
    descripcion: "Analiza riesgo y revisa documentos de clientes con evaluación Solo Listas o Simplificada.",
  },
  CUMPLIMIENTO_MEDIUM_RISK: {
    label: "Cumplimiento — Evaluación Completa",
    descripcion: "Aprueba en Fase IIIA clientes con evaluación Completa.",
  },
  CUMPLIMIENTO_HIGH_RISK: {
    label: "Cumplimiento — Evaluación Intensificada",
    descripcion: "Aprueba en Fase IIIA clientes con evaluación Intensificada.",
  },
  FINANCIERO: {
    label: "Financiero",
    descripcion: "Recibe el cierre del proceso con el reporte de tiempos por fase.",
  },
  CONTABILIDAD: {
    label: "Contabilidad",
    descripcion: "Registra el cliente en el sistema contable (SIESA) en Fase IV.",
  },
};

export function rolConfigInfo(modulo: OnboardingModulo, rol: string): RolConfigInfo {
  const table: Record<string, RolConfigInfo> = modulo === "supplier" ? SUPPLIER_ROL_CONFIG : CUSTOMER_ROL_CONFIG;
  return table[rol] ?? { label: rol, descripcion: "" };
}

export const WHITELIST_PERMISO_CONFIG: Record<PermisoWhitelist, RolConfigInfo> = {
  CONSULTA: {
    label: "Consulta",
    descripcion: "Ver listado y detalle sin iniciar procesos.",
  },
  CONSULTA_CREACION: {
    label: "Consulta y creación",
    descripcion: "Ver listado y detalle e iniciar procesos, sin gestionar fases.",
  },
};

/** Nivel de acceso al módulo, calculado en el servidor a partir del actor. */
export type OnboardingNivelAcceso = "full" | "consulta_creacion" | "solo_lectura" | "responsable";
