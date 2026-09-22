/**
 * Types mirroring the API responses from `/api/billing/dashboard/*`
 * (which proxy `convex/facturacionDashboard.ts`).
 */

export type CurrencyBreakdown = Record<string, number>;

export type DatePreset = "mes_actual" | "mes_anterior" | "personalizado" | "todas";

export type AlertKind =
  | "sla_breached"
  | "sla_warning"
  | "sin_responsable"
  | "asignacion_inconsistente"
  | "fuera_de_periodo"
  | "fase_sin_sla";

export interface DashboardAlert {
  kind: AlertKind;
  count: number;
  label: string;
}

export interface KpiBucket {
  count: number;
  montosPorMoneda: CurrencyBreakdown;
  montosAPagarPorMoneda: CurrencyBreakdown;
}

export interface FasesContablesKpi extends KpiBucket {
  subcounts: {
    causacion: number;
    revision_impuestos: number;
    eventos_dian: number;
  };
}

export interface DashboardKpis {
  lideres: KpiBucket;
  fasesContables: FasesContablesKpi;
  tesoreria: KpiBucket;
  slaVencido: KpiBucket;
}

export interface WipByPhase {
  fase: string;
  healthy: number;
  warning: number;
  breached: number;
  sin_sla: number;
}

export interface WeeklyTrendPoint {
  weekStart: string;
  ingresadas: number;
  finalizadas: number;
}

export interface DashboardResumen {
  generatedAt: number;
  period: {
    preset: string;
    from: string | null;
    to: string | null;
  };
  kpis: DashboardKpis;
  alerts: DashboardAlert[];
  wipByPhase: WipByPhase[];
  weeklyTrend: WeeklyTrendPoint[];
}

export interface LiderRow {
  userId: string | null;
  email: string;
  nombre: string;
  invoiceCount: number;
  warningCount: number;
  breachedCount: number;
  oldestPhaseAgeMs: number | null;
  montosPorMoneda: CurrencyBreakdown;
  sharedInvoiceCount: number;
}

/** Alias kept for the people table row shape. */
export type ResponsableRow = LiderRow;

export type ResponsablePanelGroup =
  | "lideres"
  | "fases_contables"
  | "tesoreria"
  | "recepcion"
  | "gerencia";

export interface ResponsablesGroup {
  group: ResponsablePanelGroup;
  people: ResponsableRow[];
}

export interface ResponsablesResponse {
  groups: ResponsablesGroup[];
}

export interface DistribucionPorFase {
  fase: string;
  count: number;
}

export interface DistribucionPorResponsable {
  userId: string | null;
  email: string;
  nombre: string;
  count: number;
}

export interface DashboardDistribucion {
  porFase: DistribucionPorFase[];
  porResponsable: DistribucionPorResponsable[];
  truncated: boolean;
}

export type FilterChipKind = "grupoFase" | "slaEstado" | "dateRange";

export interface FilterChip {
  id: string;
  kind: FilterChipKind;
  label: string;
}

export interface OwnerChip {
  userId: string | null;
  email: string;
  nombre: string;
  rol: string;
  assignmentAgeMs: number;
}

/** `grupoFase` values materialized on `facturacionDashboardItems`. */
export type GrupoFase =
  | "lideres"
  | "fases_contables"
  | "tesoreria"
  | "recepcion"
  | "gerencia"
  | "rechazos_dian"
  | "reembolso_caja_menor"
  | "otros_activos"
  | "terminal"
  | "peajes";

export type TipoFlujo =
  | "normal"
  | "anticipo"
  | "caja_menor"
  | "peaje"
  | "nota_credito"
  | "nota_debito"
  | "otro";

export type DocumentoClase = "factura" | "nota_credito" | "nota_debito" | "otro";

export type SlaEstado = "healthy" | "warning" | "breached" | "sin_sla" | "n_a";

export interface FacturaLedgerRow {
  facturaId: string;
  empresa: number;
  numeroFactura: string;
  proveedorNombre: string;
  proveedorNit: string;
  fechaEmision: string;
  faseActual: string;
  grupoFase: string;
  owners: OwnerChip[];
  phaseAgeMs: number;
  slaEstado: string;
  slaUmbralDias: number | null;
  valorContable: number;
  valorAPagar: number | null;
  moneda: string;
  tipoFlujo: string;
  esLegacyJefeDirecto: boolean;
  fueraDeRango: boolean;
  integrityIssues: string[];
}

export interface FacturasPage {
  page: FacturaLedgerRow[];
  isDone: boolean;
  continueCursor: string;
}

export interface DashboardFilters {
  preset: DatePreset;
  from?: string;
  to?: string;
  grupoFase?: GrupoFase;
  fase?: string;
  slaEstado?: SlaEstado;
  tipoFlujo?: TipoFlujo;
  moneda?: string;
  activeResponsableGroup?: ResponsablePanelGroup;
  ignoreDateRange: boolean;
}

export const DEFAULT_FILTERS: DashboardFilters = {
  preset: "mes_actual",
  activeResponsableGroup: "lideres",
  ignoreDateRange: false,
};

export const RESPONSABLE_PANEL_GROUP_LABELS: Record<ResponsablePanelGroup, string> = {
  lideres: "Líderes",
  fases_contables: "Contabilidad",
  tesoreria: "Tesorería",
  recepcion: "Recepción",
  gerencia: "Gerencia",
};

export const RESPONSABLE_PANEL_TO_GRUPO_FASE: Record<ResponsablePanelGroup, GrupoFase> = {
  lideres: "lideres",
  fases_contables: "fases_contables",
  tesoreria: "tesoreria",
  recepcion: "recepcion",
  gerencia: "gerencia",
};

export const PHASE_LABELS: Record<string, string> = {
  recepcion: "Recepción",
  revision_lider: "Líder",
  aceptada: "Aceptada",
  causacion: "Causación",
  revision_impuestos: "Contabilidad",
  eventos_dian: "Eventos DIAN",
  pendiente_rechazar_dian: "Rechazos DIAN",
  pendiente_nota_credito: "Nota crédito",
  gerencia: "Gerencia",
  revision_tesoreria: "Tesorería",
  reembolso_caja_menor: "Reembolso caja menor",
  pagada: "Pagada",
  legalizada: "Legalizada",
  cerrada: "Cerrada",
  rechazada: "Rechazada",
  rechazada_dian: "Rechazada DIAN",
  nota_credito_cerrada: "Nota crédito cerrada",
};

export const DATE_PRESET_LABELS: Record<DatePreset, string> = {
  mes_actual: "Mes actual",
  mes_anterior: "Mes anterior",
  personalizado: "Personalizado",
  todas: "Todas las fechas",
};

export const SLA_ESTADO_LABELS: Record<string, string> = {
  healthy: "En tiempo",
  warning: "Por vencer",
  breached: "Vencido",
  sin_sla: "Sin SLA",
  n_a: "No aplica",
};

export const GRUPO_FASE_LABELS: Record<string, string> = {
  lideres: "Líderes",
  fases_contables: "Fases contables",
  tesoreria: "Tesorería",
  recepcion: "Recepción",
  gerencia: "Gerencia",
  rechazos_dian: "Rechazos DIAN",
  reembolso_caja_menor: "Reembolso caja menor",
  otros_activos: "Otros activos",
  terminal: "Terminal",
  peajes: "Peajes",
};

export const ALERT_KIND_TONE: Record<AlertKind, "warning" | "destructive" | "info"> = {
  sla_breached: "destructive",
  sla_warning: "warning",
  sin_responsable: "destructive",
  asignacion_inconsistente: "warning",
  fuera_de_periodo: "info",
  fase_sin_sla: "info",
};

/** Accent-insensitive, case-insensitive normalization for local search. */
export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

export function slaUrgencyRank(slaEstado: string): number {
  if (slaEstado === "breached") return 0;
  if (slaEstado === "warning") return 1;
  return 2;
}

export function compareFacturasPorUrgencia(a: FacturaLedgerRow, b: FacturaLedgerRow): number {
  return (
    slaUrgencyRank(a.slaEstado) - slaUrgencyRank(b.slaEstado) ||
    b.phaseAgeMs - a.phaseAgeMs ||
    a.fechaEmision.localeCompare(b.fechaEmision) ||
    a.numeroFactura.localeCompare(b.numeroFactura, "es", { numeric: true })
  );
}
