import type { AssistantContext, AssistantDomain, AssistantToolResult } from '@/lib/assistant/contracts';
import { assistantToolResultSchema } from '@/lib/assistant/contracts';
import { EMPRESAS_LIST } from '@/lib/empresas';

export function assistantCompanyScope(active: number | null, canAccessAll: boolean, filteredIds: number[]) {
  // The shared ERP filter represents Todas as [], while assistant threads require an explicit frozen set.
  return active === null && canAccessAll ? EMPRESAS_LIST.map((company) => company.id) : filteredIds;
}

export const DOMAIN_PERMISSIONS: Record<AssistantDomain, string[]> = {
  billing: ['billing/dashboard', 'billing/invoices', 'billing/inbox'],
  suppliers: ['suppliers/onboarding'],
  customers: ['customers/onboarding'],
  advances: ['finance/advances', 'finance/advances/request'],
  pettyCash: ['finance/petty-cash', 'billing/petty-cash-reimbursement'],
};

export function pageContext(pathname: string): AssistantContext | null {
  if (pathname.startsWith('/billing/petty-cash-reimbursement'))
    return { domain: 'pettyCash', label: 'Reembolsos de caja menor' };
  if (pathname.startsWith('/billing')) {
    const match = pathname.match(/^\/billing\/invoices\/([^/]+)$/);
    return {
      domain: 'billing',
      label: match ? 'Factura abierta' : 'Facturación',
      ...(match ? { recordId: match[1] } : {}),
    };
  }
  if (pathname.startsWith('/suppliers')) return { domain: 'suppliers', label: 'Proveedores' };
  if (pathname.startsWith('/customers')) return { domain: 'customers', label: 'Clientes' };
  if (pathname.startsWith('/finance/advances')) return { domain: 'advances', label: 'Anticipos' };
  if (pathname.startsWith('/finance/petty-cash')) return { domain: 'pettyCash', label: 'Cajas menores' };
  return null;
}

export function safeRecordHref(href: string): string | null {
  return /^\/(billing|suppliers|customers|finance|administracion)(\/|\?|$)/.test(href) &&
    !/[\\\u0000-\u001f]/.test(href)
    ? href
    : null;
}

export function isToolResult(value: unknown): value is AssistantToolResult {
  if (!value || typeof value !== 'object') return false;
  // The agent adds the evidence identifier to a validated result for later charts.
  const result = Object.fromEntries(
    Object.entries(value).filter(([key]) => !['evidenceId', 'toolCallId', 'runId'].includes(key)),
  );
  return assistantToolResultSchema.safeParse(result).success;
}

export function allowsChart(prompt: string) {
  return /gr[aá]fic|chart|plot|graph|barras|donut/i.test(prompt);
}

export function formatAmount(value: number, currency = 'COP') {
  try {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency,
      maximumFractionDigits: currency === 'COP' ? 0 : 2,
    }).format(value);
  } catch {
    return new Intl.NumberFormat('es-CO').format(value);
  }
}

export function companyLabel(ids: number[], names: Record<number, { nombreCorto: string }>) {
  return ids.length === 1 ? (names[ids[0]]?.nombreCorto ?? `Empresa ${ids[0]}`) : 'Todas las empresas';
}

export function parseAssistantEvent(
  line: string,
): { type: string; conversationId?: string; runId?: string; error?: string; status?: string } | null {
  try {
    const value: unknown = JSON.parse(line);
    if (!value || typeof value !== 'object' || !('type' in value) || typeof value.type !== 'string') return null;
    return {
      type: value.type,
      ...('conversationId' in value && typeof value.conversationId === 'string'
        ? { conversationId: value.conversationId }
        : {}),
      ...('runId' in value && typeof value.runId === 'string' ? { runId: value.runId } : {}),
      ...('error' in value && typeof value.error === 'string' ? { error: value.error } : {}),
      ...('status' in value && typeof value.status === 'string' ? { status: value.status } : {}),
    };
  } catch {
    return null;
  }
}
