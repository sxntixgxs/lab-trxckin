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

export const COOKIE_EMPRESA_ACTIVA = "empresa-activa";

/**
 * Global scope ("Todas las empresas") is granted only by the explicit flag. Callers fold
 * `hasFullAccess` (admin) into it: see `toBillingSession` and `resolveEmpresaAccess`.
 * `_idRol` is kept for call-site compatibility; role ids no longer grant global scope.
 */
export function hasGlobalEmpresaAccess(
  _idRol: number,
  accesoTodasEmpresas?: boolean | null,
): boolean {
  return accesoTodasEmpresas === true;
}

export type EmpresaAccessInput = {
  empresas?: number[] | null;
  acceso_todas_empresas?: boolean | null;
  hasFullAccess?: boolean | null;
};

export type EmpresaAccess = {
  /** Companies the user may select. Every company when the user has global scope. */
  empresas: number[];
  /** May pick "Todas las empresas" and any company. */
  canAccessAllEmpresas: boolean;
  /** `hasFullAccess` (admin role). */
  isAdmin: boolean;
};

/** Sorted, de-duplicated, positive-integer company ids. */
export function normalizeEmpresaIds(ids: readonly number[] | null | undefined): number[] {
  return [...new Set((ids ?? []).filter((id) => Number.isInteger(id) && id > 0))].sort(
    (a, b) => a - b,
  );
}

/** Resolves the company scope of a user as returned by Nest (`/api/me`, `toBillingSession`). */
export function resolveEmpresaAccess(user: EmpresaAccessInput | null | undefined): EmpresaAccess {
  const isAdmin = user?.hasFullAccess === true;
  const canAccessAllEmpresas = isAdmin || user?.acceso_todas_empresas === true;
  return {
    empresas: canAccessAllEmpresas
      ? EMPRESAS_LIST.map((empresa) => empresa.id)
      : normalizeEmpresaIds(user?.empresas),
    canAccessAllEmpresas,
    isAdmin,
  };
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
