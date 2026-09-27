import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { UIMessage } from '@convex-dev/agent/react';
import { describe, expect, test, vi } from 'vitest';
import type { AssistantRecordReference, AssistantToolResult } from '@/lib/assistant/contracts';
import { AssistantMessage } from './assistant-message';

vi.mock('./assistant-results', () => ({ AssistantResults: () => null }));

const record: AssistantRecordReference = {
  id: 'ps7kfa2tytdddsnjtx6fx57nxs7m6zyf',
  domain: 'billing',
  recordType: 'invoice',
  companyId: 1,
  title: 'FAC-123',
  status: 'revision_lider',
  href: '/billing/invoices/ps7kfa2tytdddsnjtx6fx57nxs7m6zyf',
};

function evidence(records: AssistantRecordReference[] = [record]): AssistantToolResult {
  return {
    title: 'Facturas',
    records,
    rows: records.map((item) => ({ estado: item.status ?? null })),
    sources: records.map((item) => ({
      kind: 'record', domain: item.domain, companyId: item.companyId, recordId: item.id, recordType: item.recordType,
    })),
    metadata: {
      complete: true, returned: records.length, scanned: records.length, limit: 20, nextCursor: null,
      companyIds: [1], currency: 'COP', from: null, to: null, asOf: 1_800_000_000_000, notes: [],
    },
  };
}

function render(text: string, options: { results?: unknown[]; references?: AssistantRecordReference[]; user?: boolean } = {}) {
  const message = {
    id: 'message-test',
    role: options.user ? 'user' : 'assistant',
    status: 'success',
    parts: [
      ...(options.results ?? []).map((output, index) => ({
        type: 'dynamic-tool', toolName: 'read_data', toolCallId: `call-${index}`, state: 'output-available', output,
      })),
      { type: 'text', text },
    ],
  } as UIMessage;
  return renderToStaticMarkup(createElement(AssistantMessage, {
    message, allowChart: false, references: options.references,
  }));
}

describe('assistant evidence-bound Markdown', () => {
  test('replaces returned enums and opaque IDs in prose and inline code with business labels', () => {
    const html = render(`En revisión del líder (\`revision_lider\`). (ID: \`${record.id}\`). Estado revision_lider.`, {
      results: [evidence()],
    });
    expect(html).toContain('En revisión del líder (Líder). (ID: FAC-123). Estado Líder.');
    expect(html).not.toContain('revision_lider');
    expect(html).not.toContain(record.id);
    expect(html).not.toContain('<code>');
  });

  test('normalizes aggregate status rows using their returned source domain', () => {
    const result = evidence([]);
    result.rows = [{ estado: 'V_PENDIENTE_LEGALIZACION', registros: 3 }];
    result.sources = [{ kind: 'aggregate', domain: 'advances', companyId: 1 }];
    const html = render('Tres anticipos en `V_PENDIENTE_LEGALIZACION`.', { results: [result] });
    expect(html).toContain('Tres anticipos en Pendiente legalización.');
    expect(html).not.toContain('V_PENDIENTE_LEGALIZACION');
  });

  test('preserves unknown prose, unobserved statuses, numeric identifiers and token substrings', () => {
    const text = `Sin cambios: causacion, estado_nuevo, unknowninternalid9999, prefijo_${record.id}, ${record.id}extra y 1234.`;
    const html = render(text, { results: [evidence([record, { ...record, id: '1234', title: 'Otra factura' }])] });
    expect(html).toContain(text);
    expect(html).not.toContain('Otra factura');
  });

  test('does not transform raw code blocks or arbitrary inline expressions', () => {
    const html = render('`estado = revision_lider`\n\n```text\nrevision_lider\n```', { results: [evidence()] });
    expect(html).toContain('<code>estado = revision_lider</code>');
    expect(html).toContain('<code class="language-text">revision_lider\n</code>');
  });

  test('does not infer a label when the same returned enum is ambiguous across domains', () => {
    const advance = { ...record, domain: 'advances', recordType: 'advance', status: 'COMPLETADO' } as const;
    const supplier = { ...record, id: 'anotherinternalid00000', domain: 'suppliers', recordType: 'supplier', status: 'COMPLETADO' } as const;
    const html = render('Estado `COMPLETADO`.', { results: [evidence([advance, supplier])] });
    expect(html).toContain('<code>COMPLETADO</code>');
  });

  test('preserves exact returned link destinations and visible URL text', () => {
    const href = `${record.href}?estado=revision_lider`;
    const html = render(`[\`${record.id}\`](${href})\n\n${href}`, {
      references: [{ ...record, href }],
    });
    expect(html).toContain(`<a href="${href}">FAC-123</a>`);
    expect(html).toContain(`<p>${href}</p>`);
  });

  test('permits actual references from prior turns but renders invented local destinations as plain text', () => {
    const html = render(`[Ver factura](${record.href}) y [Inventada](/billing/invoices/not-returned).`, {
      references: [record],
    });
    expect(html).toContain(`<a href="${record.href}">Ver factura</a>`);
    expect(html).toContain('<span>Inventada</span>');
    expect(html).not.toContain('href="/billing/invoices/not-returned"');
  });

  test('does not trust malformed tool outputs or unsafe destinations even when a reference is provided', () => {
    const html = render(`[No validada](${record.href}) y [Endpoint](/api/assistant/send). revision_lider`, {
      results: [{ ...evidence(), metadata: {} }],
      references: [{ ...record, id: 'other', status: undefined, href: '/api/assistant/send' }],
    });
    expect(html).toContain('<span>No validada</span>');
    expect(html).toContain('<span>Endpoint</span>');
    expect(html).toContain('revision_lider');
    expect(html).not.toContain('<a ');
  });

  test('treats a returned title as literal text instead of injecting Markdown or HTML', () => {
    const html = render(`Registro \`${record.id}\`.`, {
      references: [{ ...record, title: '[Abrir](https://bad.example) <script>alert(1)</script>' }],
    });
    expect(html).toContain('[Abrir](https://bad.example) &lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<a ');
  });

  test('keeps the user’s original text unchanged', () => {
    const html = render(`revision_lider ${record.id}`, { user: true, references: [record] });
    expect(html).toContain(`revision_lider ${record.id}`);
  });
});
