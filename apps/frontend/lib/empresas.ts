export interface EmpresaInfo {
  id: number;
  nombre: string;
  nombreCorto: string;
  color: string;
  nit: string;
  bgColor: string;
  textColor: string;
  borderColor: string;
  logo: string;
  logoBlanco: string;
  icon: string;
}

/** Generic placeholder used for every company logo (demo data). */
export const EMPRESA_LOGO_PLACEHOLDER = "/images/company-placeholder.svg";

// Fictional demo companies. NITs are stored as digits without the check digit.
export const EMPRESAS_MAP: Record<number, EmpresaInfo> = {
  1: {
    id: 1,
    nombre: "Andes Logística S.A.S.",
    nombreCorto: "Andes",
    nit: "900000001",
    color: "#e21c21",
    bgColor: "bg-red-100",
    textColor: "text-red-700",
    borderColor: "border-red-300",
    logo: EMPRESA_LOGO_PLACEHOLDER,
    logoBlanco: EMPRESA_LOGO_PLACEHOLDER,
    icon: EMPRESA_LOGO_PLACEHOLDER,
  },
  2: {
    id: 2,
    nombre: "Cordillera Minería S.A.S.",
    nombreCorto: "Cordillera",
    nit: "900000002",
    color: "#059669",
    bgColor: "bg-emerald-100",
    textColor: "text-emerald-700",
    borderColor: "border-emerald-300",
    logo: EMPRESA_LOGO_PLACEHOLDER,
    logoBlanco: EMPRESA_LOGO_PLACEHOLDER,
    icon: EMPRESA_LOGO_PLACEHOLDER,
  },
  3: {
    id: 3,
    nombre: "Pacífico Ingeniería S.A.S.",
    nombreCorto: "Pacífico",
    nit: "900000003",
    color: "#D54913",
    bgColor: "bg-orange-100",
    textColor: "text-orange-700",
    borderColor: "border-orange-300",
    logo: EMPRESA_LOGO_PLACEHOLDER,
    logoBlanco: EMPRESA_LOGO_PLACEHOLDER,
    icon: EMPRESA_LOGO_PLACEHOLDER,
  },
  4: {
    id: 4,
    nombre: "Altiplano Holding S.A.S.",
    nombreCorto: "Altiplano",
    nit: "900000004",
    color: "#7c3aed",
    bgColor: "bg-violet-100",
    textColor: "text-violet-700",
    borderColor: "border-violet-300",
    logo: EMPRESA_LOGO_PLACEHOLDER,
    logoBlanco: EMPRESA_LOGO_PLACEHOLDER,
    icon: EMPRESA_LOGO_PLACEHOLDER,
  },
} as const;

export const EMPRESAS_LIST = Object.values(EMPRESAS_MAP);

export const DELEGADOS_TH_EMPRESAS_EXTERNAS: Record<number, number[]> = {
  3: [1],
};

export const ROL_OPERADOR = 4;
export const ROLES_ADMIN = [1, 99];
export const ROLES_GLOBAL_EMPRESA = [...ROLES_ADMIN, ROL_OPERADOR];

export const COOKIE_EMPRESA_ACTIVA = "empresa-activa";

export function hasGlobalEmpresaAccess(
  idRol: number,
  accesoTodasEmpresas?: boolean | null,
): boolean {
  return ROLES_GLOBAL_EMPRESA.includes(idRol) || accesoTodasEmpresas === true;
}

export function getEmpresaNombre(id: number): string {
  return EMPRESAS_MAP[id]?.nombre ?? `Empresa ${id}`;
}

export function getEmpresaInfo(id: number): EmpresaInfo | undefined {
  return EMPRESAS_MAP[id];
}

export function getEmpresaByNit(nit: string): EmpresaInfo | undefined {
  const normalized = nit.replace(/\D/g, "");
  return EMPRESAS_LIST.find((empresa) => empresa.nit && empresa.nit === normalized);
}
