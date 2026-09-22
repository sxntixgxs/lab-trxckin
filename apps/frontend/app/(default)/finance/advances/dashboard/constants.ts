import type {
  AnticiposConfigDraft,
  RolAnticipo,
  RolAnticipoSingle,
} from "./types";

export const formatterCOP = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

export const formatterDate = new Intl.DateTimeFormat("es-CO", {
  year: "numeric",
  month: "short",
  day: "2-digit",
});

export const faseLabels: Record<string, string> = {
  I_SOLICITUD: "Solicitud creada",
  II_APROBACION_JEFE_DIRECTO: "Aprobación jefe directo",
  III_REVISION_CONTABILIDAD: "Revisión contabilidad",
  IV_APROBACION_GERENCIA: "Aprobación gerencia",
  IV_DESEMBOLSO_TESORERIA: "Desembolso tesorería",
  V_PENDIENTE_LEGALIZACION: "Pendiente legalización",
  VI_LEGALIZADO: "Legalizado",
  COMPLETADO: "Legalizado",
  RECHAZADO: "Rechazado",
  ANULADO: "Anulado",
};

export const fasesFlujoAnticipo = [
  {
    faseKey: "I_SOLICITUD",
    label: "I. Solicitud",
    short: "I",
    responsable: "Solicitante",
  },
  {
    faseKey: "II_APROBACION_JEFE_DIRECTO",
    label: "II. Jefe directo",
    short: "II",
    responsable: "Jefe directo",
  },
  {
    faseKey: "III_REVISION_CONTABILIDAD",
    label: "III. Contabilidad",
    short: "III",
    responsable: "Contabilidad",
  },
  {
    faseKey: "IV_APROBACION_GERENCIA",
    label: "IV. Gerencia",
    short: "IV",
    responsable: "Gerencia",
  },
  {
    faseKey: "IV_DESEMBOLSO_TESORERIA",
    label: "V. Desembolso",
    short: "V",
    responsable: "Tesorería",
  },
  {
    faseKey: "V_PENDIENTE_LEGALIZACION",
    label: "VI. Legalización",
    short: "VI",
    responsable: "Responsable anticipo",
  },
  {
    faseKey: "COMPLETADO",
    label: "VII. Legalizado",
    short: "VII",
    responsable: "Contabilidad",
  },
  {
    faseKey: "RECHAZADO",
    label: "Rechazados",
    short: "✕",
    responsable: "",
  },
  {
    faseKey: "ANULADO",
    label: "Anulados",
    short: "!",
    responsable: "",
  },
] as const;

export const fasesProgresoAnticipo = [
  "I_SOLICITUD",
  "II_APROBACION_JEFE_DIRECTO",
  "III_REVISION_CONTABILIDAD",
  "IV_APROBACION_GERENCIA",
  "IV_DESEMBOLSO_TESORERIA",
  "V_PENDIENTE_LEGALIZACION",
  "COMPLETADO",
] as const;

export const roleLabels: Record<RolAnticipo, string> = {
  CONTABILIDAD: "Contabilidad",
  GERENCIA: "Gerencia",
  TESORERO: "Tesorero",
};

export const rolesAnticipo = Object.keys(roleLabels) as RolAnticipo[];
export const rolesAnticipoSingle: RolAnticipoSingle[] = [
  "GERENCIA",
  "TESORERO",
];

export const emptyConfigDraft: AnticiposConfigDraft = {
  GERENCIA: "",
  TESORERO: "",
  CONTABILIDAD: [],
};
