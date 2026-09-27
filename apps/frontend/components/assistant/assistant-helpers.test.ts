import { describe, expect, it } from 'vitest';
import type { AssistantToolResult } from '@/lib/assistant/contracts';
import {
  allowsChart,
  assistantCompanyScope,
  isToolResult,
  pageContext,
  parseAssistantEvent,
  safeRecordHref,
} from './assistant-helpers';

const result: AssistantToolResult = {
  title: 'Facturas',
  records: [],
  rows: [],
  sources: [],
  metadata: {
    complete: true,
    returned: 0,
    scanned: 0,
    limit: 20,
    nextCursor: null,
    companyIds: [1],
    currency: null,
    from: null,
    to: null,
    asOf: 1_800_000_000_000,
    notes: [],
  },
};

describe('assistant rendering boundaries', () => {
  it('expands the global Todas filter into explicit companies without granting restricted users extra scope', () => {
    expect(assistantCompanyScope(null, true, [])).toEqual([1, 2, 3, 4]);
    expect(assistantCompanyScope(2, true, [2])).toEqual([2]);
    expect(assistantCompanyScope(null, false, [2, 4])).toEqual([2, 4]);
    expect(assistantCompanyScope(null, false, [])).toEqual([]);
  });
  it("accepts validated tool outputs with the agent's evidence identifier", () => {
    expect(isToolResult({ ...result, evidenceId: 'tool-1' })).toBe(true);
    expect(isToolResult({ ...result, metadata: {} })).toBe(false);
    expect(isToolResult({ ...result, rows: [{ value: { nested: 'object' } }] })).toBe(false);
    expect(isToolResult({ ...result, metadata: { ...result.metadata, notes: 'invalid' } })).toBe(false);
  });

  it('only links to supported local record routes', () => {
    expect(safeRecordHref('/billing/invoices/abc')).toBe('/billing/invoices/abc');
    expect(safeRecordHref('/finance/advances?anticipo=123')).toBe('/finance/advances?anticipo=123');
    for (const href of [
      'https://example.com',
      '//example.com',
      'javascript:alert(1)',
      '/api/assistant/send',
      '/billing\\evil',
      '/billing\n/123',
      '/billing-unrelated/123',
    ]) {
      expect(safeRecordHref(href)).toBeNull();
    }
  });

  it('assigns reimbursement pages to the petty-cash permission scope', () => {
    expect(pageContext('/billing/petty-cash-reimbursement')?.domain).toBe('pettyCash');
    expect(pageContext('/billing/invoices/invoice123')).toEqual({
      domain: 'billing',
      label: 'Factura abierta',
      recordId: 'invoice123',
    });
    expect(pageContext('/administracion/usuarios')).toBeNull();
  });

  it('only enables a chart in a turn with chart intent', () => {
    expect(allowsChart('Muéstrame un gráfico de barras')).toBe(true);
    expect(allowsChart('Show a line graph of these totals')).toBe(true);
    expect(allowsChart('Muéstrame los saldos pendientes')).toBe(false);
  });

  it('rejects malformed stream events without throwing', () => {
    expect(parseAssistantEvent('{broken')).toBeNull();
    expect(parseAssistantEvent('null')).toBeNull();
    expect(parseAssistantEvent('{"type":"started","conversationId":"123","runId":false}')).toEqual({
      type: 'started',
      conversationId: '123',
    });
    expect(parseAssistantEvent('{"type":"error","error":"Límite alcanzado"}')?.error).toBe('Límite alcanzado');
  });
});
