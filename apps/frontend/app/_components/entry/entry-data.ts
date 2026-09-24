import { FACTURACION_STATUS_LABELS } from "@/app/(default)/billing/components/status-badge";
import { EMPRESAS_MAP } from "@/lib/empresas";

// Demonstration data for the entry page. Every company, person, number and amount here is
// fictional; the phases, owners and rules are the app's own (docs/billing.md, finance.md,
// suppliers.md and customers.md).

/** Billing phases in workflow order, keyed as in Convex. */
const BILLING_PHASES = [
  "recepcion",
  "revision_lider",
  "causacion",
  "revision_impuestos",
  "eventos_dian",
  "gerencia",
  "revision_tesoreria",
  "pagada",
] as const;

export type BillingPhase = (typeof BILLING_PHASES)[number];

export const billingPhases = BILLING_PHASES.map((key) => ({ key, label: FACTURACION_STATUS_LABELS[key] ?? key }));

const andes = EMPRESAS_MAP[1];

export const demoInvoice = {
  number: "FE-10482",
  supplier: "ACME Colombia S.A.S.",
  company: andes.nombre,
  companyIcon: andes.icon,
  amount: "COP 4.860.000",
  current: "revision_impuestos" as BillingPhase,
  owner: "Laura M.",
  ownerRole: "Contabilidad",
  since: "Wed",
  task: { text: "Tax review, then", next: "Eventos DIAN or Gerencia" },
  sla: { day: 2, of: 3 },
  /** Append-only history, oldest first; the last entry moved the invoice to its current phase. */
  history: [
    { day: "Mon", phase: "recepcion", text: "Assigned a process leader" },
    { day: "Tue", phase: "revision_lider", text: "The leader confirmed the service was received" },
    { day: "Wed", phase: "causacion", text: "FP-2291 recorded, sent to", term: "Contabilidad" },
  ] satisfies Array<{ day: string; phase: BillingPhase; text: string; term?: string }>,
};

export const currentPhaseIndex = BILLING_PHASES.indexOf(demoInvoice.current);

/** Advance chain from docs/finance.md: jefe directo → contabilidad → gerencia → desembolso → legalización. */
export const demoAdvance = {
  number: "ANT-0042",
  amount: "COP 1.200.000",
  steps: [
    { label: "Jefe directo" },
    { label: "Contabilidad" },
    { label: "Gerencia" },
    { label: "Tesorería" },
    { label: "Legalización" },
  ],
  current: 3,
};

/** Supplier onboarding from docs/suppliers.md: risk sets the documents and the approval tier. */
export const demoSupplier = {
  risk: "Medio",
  evaluation: "Simplificada",
  phase: "III Revisión documental",
  lanes: [
    { owner: "Cumplimiento", approved: 4, total: 5 },
    { owner: "Compras", approved: 2, total: 3 },
  ],
  next: "IV Aprobación Cumplimiento",
};

/** Customer onboarding from docs/customers.md, from the form to the tiered approval. */
export const demoCustomer = {
  paymentTerms: "30 days",
  steps: [
    { key: "II", label: "Formulario" },
    { key: "IIA", label: "Firma" },
    { key: "III", label: "Revisión" },
    { key: "IIIA", label: "Aprobación" },
  ],
  current: 1,
  currentLabel: "IIA Pendiente firma",
};
