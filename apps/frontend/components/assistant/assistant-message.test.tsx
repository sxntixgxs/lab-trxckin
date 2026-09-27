// @vitest-environment jsdom

import { createElement } from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import type { UIMessage } from '@convex-dev/agent/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { AssistantRecordReference } from '@/lib/assistant/contracts';
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

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function answer(text: string) {
  const message = {
    id: 'copy-test', role: 'assistant', status: 'success', parts: [{ type: 'text', text }],
  } as UIMessage;
  return render(createElement(AssistantMessage, { message, allowChart: false, references: [record] }));
}

describe('copying the presented assistant answer', () => {
  test('copies business labels and retains only the actual evidence link destination', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const view = answer(`Estado \`revision_lider\`, registro \`${record.id}\`. [Abrir](${record.href}) y [No verificado](/billing/invoices/invented).`);
    await act(async () => { fireEvent.click(view.getByRole('button', { name: 'Copiar respuesta' })); });

    const copied = writeText.mock.calls[0][0] as string;
    expect(copied).toBe(`Estado Líder, registro FAC-123. Abrir (${record.href}) y No verificado.`);
    expect(copied).not.toContain('revision_lider');
    expect(copied.replace(record.href, '')).not.toContain(record.id);
    expect(copied).not.toContain('/billing/invoices/invented');
    expect(view.getByRole('button', { name: 'Respuesta copiada' })).toBeTruthy();
  });

  test('keeps paragraph, list and table boundaries readable without reverting to raw Markdown', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const view = answer('Resumen.\n\n1. Revisar `revision_lider`\n2. Consultar estado_nuevo\n\n| Estado | Total |\n| --- | --- |\n| revision_lider | 123 |');
    await act(async () => { fireEvent.click(view.getByRole('button', { name: 'Copiar respuesta' })); });

    const copied = writeText.mock.calls[0][0] as string;
    expect(copied).toContain('Resumen.\n\n1. Revisar Líder\n2. Consultar estado_nuevo');
    expect(copied).toContain('Estado\tTotal\nLíder\t123');
    expect(copied).not.toContain('revision_lider');
    expect(copied).not.toContain('| --- |');
  });
});
