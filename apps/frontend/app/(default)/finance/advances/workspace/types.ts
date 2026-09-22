import type { Id } from "@/convex/_generated/dataModel";
import type { AnticipoRow } from "../dashboard/types";

export type AnticiposWorkspaceView = "buzon" | "mine" | "dashboard" | "bags" | "settings";

export type AnticiposDashboardMode = "flow" | "backlog";
export type AnticiposDatePreset = "mes_actual" | "mes_anterior" | "personalizado";
export type AnticiposScope = "buzon" | "mine" | "visible";
export type AnticiposUrgency = "all" | "overdue" | "due_soon" | "returned" | "integrity";

export type AnticiposFilters = {
  search: string;
  phase?: string;
  urgency: AnticiposUrgency;
  coverage?: "total" | "parcial";
  responsible?: string;
  kpi?: string;
  mode: AnticiposDashboardMode;
  preset: AnticiposDatePreset;
  from?: string;
  to?: string;
};

export type AnticiposItemsResponse = {
  page: AnticipoRow[];
  isDone: boolean;
  continueCursor: string;
};

export type AnticiposMetric = { count: number; amount: number };

export type AnticiposDashboardSummary = {
  generatedAt: number;
  period: {
    preset: AnticiposDatePreset;
    from: string | null;
    to: string | null;
  };
  flow: {
    solicitado: AnticiposMetric;
    aprobadoGerencia: AnticiposMetric;
    desembolsado: AnticiposMetric;
    legalizado: AnticiposMetric;
  };
  previousFlow: {
    solicitado: AnticiposMetric;
    aprobadoGerencia: AnticiposMetric;
    desembolsado: AnticiposMetric;
    legalizado: AnticiposMetric;
  };
  backlog: {
    misPendientes: AnticiposMetric;
    enAprobacion: AnticiposMetric;
    porDesembolsar: AnticiposMetric;
    porLegalizar: AnticiposMetric;
    vencidos: AnticiposMetric;
  };
  alerts: Array<{
    kind: "overdue" | "due_soon" | "returned" | "integrity";
    label: string;
    count: number;
  }>;
  weeklyTrend: Array<{
    week: string;
    solicitado: number;
    desembolsado: number;
    legalizado: number;
  }>;
};

export type AnticiposOwnerWorkload = {
  userId: string | null;
  nombre: string;
  rol: string;
  count: number;
  amount: number;
  oldestAssignmentAt: number | null;
};

export type AnticiposBagStatus = "pending" | "overdue" | "legalized" | "all";
export type AnticiposBagSort = "priority" | "pending" | "recent";

export type AnticiposBagItem = {
  anticipoId: string;
  consecutivo: number;
  razonSocial: string;
  nit: string;
  faseActual: string;
  maxLegalizacionDate: number;
  isOverdue: boolean;
  valorContable: number;
  valorLegalizable: number;
  saldoLegalizado: number;
  saldoPendiente: number;
  facturas: Array<{
    facturaId: string;
    numeroFactura: string;
    valorAplicado: number;
  }>;
  hasMoreInvoices: boolean;
};

export type AnticiposBagItemsSummary = {
  bolsaId: string;
  empresa: number;
  tipoBolsa: "general" | "peajes";
  procesoNombre: string;
  count: number;
  requested: number;
  accounting: number;
  legalizable: number;
  legalized: number;
  pending: number;
  overdue: number;
  pendingCount: number;
  legalizedCount: number;
  summaryComplete: boolean;
};

export type AnticiposBagItemsResponse = {
  summary: AnticiposBagItemsSummary;
  page: AnticiposBagItem[];
  isDone: boolean;
  continueCursor: string;
};

export type AnticiposBagSummary = {
  key: string;
  bolsaId: string | null;
  empresa: number;
  tipoBolsa: "general" | "peajes";
  procesoNombre: string;
  count: number;
  requested: number;
  accounting: number;
  legalizable: number;
  legalized: number;
  pending: number;
  overdue: number;
  recentItemIds: string[];
  recentItems: Array<{
    anticipoId: string;
    consecutivo: number;
    razonSocial: string;
    faseActual: string;
    valorContable: number;
    valorLegalizable: number;
    saldoLegalizado: number;
    saldoPendiente: number;
    facturas: Array<{
      facturaId: string;
      numeroFactura: string;
      valorAplicado: number;
    }>;
  }>;
};

export type AnticipoReviewDecision = "APROBADO" | "RECHAZADO";
export type AnticipoReviewStatus = "draft" | "submitting" | "success" | "error";
export type AnticipoReviewMode = "review" | "desembolso" | "devolver" | "anular" | "readonly";
export type AnticipoReviewEditorMode = "joint" | "individual";

export type AnticipoReviewDraft = {
  anticipo: AnticipoRow;
  observedPhase: string;
  decision?: AnticipoReviewDecision;
  observation: string;
  hasIndividualOverride?: boolean;
  accountingValue?: number;
  files: File[];
  status: AnticipoReviewStatus;
  error?: string;
};

export type AnticipoReviewPlan = {
  anticipoId: string;
  observedPhase: string;
  decision?: AnticipoReviewDecision;
  observation: string;
  source: "joint" | "individual";
};

export type AnticipoReviewDocument = {
  id: string;
  facturaId: string;
  kind: "soporte";
  storageId: Id<"_storage">;
  nombre: string;
  url: string | null;
  source: "solicitud" | "fase";
  sourceLabel: string;
  phase?: string;
  mimeType?: string;
  createdAt?: number;
  previewable: boolean;
};

export type AnticipoBatchResult = {
  anticipoId: string;
  status: "success" | "error";
  error?: string;
};
