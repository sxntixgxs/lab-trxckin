'use client';

import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { UIMessage } from '@convex-dev/agent/react';
import type { AssistantRecordReference } from '@/lib/assistant/contracts';
import { Check, CheckCheck, Copy, LoaderCircle, MessageSquare, TriangleAlert } from 'lucide-react';
import { isToolResult, safeRecordHref } from './assistant-helpers';
import { AssistantResults } from './assistant-results';
import { assistantMarkdownClipboard, assistantMarkdownPlugin } from './assistant-markdown';

const TOOL_LABELS: Record<string, string> = {
  read_data: 'Consultando información',
  erp_lookup: 'Consultando catálogo ERP',
  display_chart: 'Preparando gráfico',
};

export function AssistantMessage({
  message,
  allowChart,
  runActive = false,
  references = [],
}: {
  message: UIMessage;
  allowChart: boolean;
  runActive?: boolean;
  references?: AssistantRecordReference[];
}) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const markdown = useRef<HTMLDivElement | null>(null);
  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    [],
  );
  const user = message.role === 'user';
  const parts = message.parts;
  const text = parts
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('\n');
  const tools = parts.filter((part) => part.type === 'dynamic-tool' || part.type.startsWith('tool-'));
  const results = tools.flatMap((part) => 'output' in part && isToolResult(part.output) ? [part.output] : []);
  const records = [...references, ...results.flatMap((result) => result.records)];
  const hrefs = new Set(records.map((record) => record.href));
  if (!text && tools.length === 0 && (!runActive || (message.status !== 'pending' && message.status !== 'streaming')))
    return null;
  const copy = async () => {
    try {
      if (!markdown.current) throw new Error('La respuesta no está disponible para copiar.');
      await navigator.clipboard.writeText(assistantMarkdownClipboard(markdown.current, hrefs));
      setCopied(true);
      setCopyError(false);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyError(true);
    }
  };
  return (
    <article
      className={`assistant-message ${user ? 'is-user' : 'is-assistant'}`}
      aria-label={user ? 'Tu mensaje' : 'Respuesta del asistente'}
    >
      {!user && (
        <div className="assistant-message-byline">
          <span className="assistant-avatar">
            <MessageSquare size={14} />
          </span>
          <strong>Asistente</strong>
          <span>Lab Trxckin</span>
        </div>
      )}
      {user ? (
        <p className="assistant-user-text">{text}</p>
      ) : (
        <>
          {tools.map((part, index) => {
            const state = 'state' in part ? part.state : undefined;
            const toolName =
              'toolName' in part && typeof part.toolName === 'string' ? part.toolName : part.type.replace(/^tool-/, '');
            const result = 'output' in part ? part.output : undefined;
            const done = state === 'output-available';
            const failed = state === 'output-error' || (!done && !runActive);
            return (
              <div className="assistant-tool" key={'toolCallId' in part ? String(part.toolCallId) : index}>
                <div className="assistant-tool-label">
                  {done ? (
                    <Check size={14} />
                  ) : failed ? (
                    <TriangleAlert size={14} />
                  ) : (
                    <LoaderCircle size={14} className="assistant-spin" />
                  )}
                  <span>
                    {TOOL_LABELS[toolName] ?? 'Consultando información'}
                    {done ? ' · listo' : failed ? ' · no disponible' : '…'}
                  </span>
                </div>
                {isToolResult(result) && <AssistantResults result={result} allowChart={allowChart} />}
                {failed && (
                  <p className="assistant-inline-error">
                    Esta consulta no pudo completarse. Puedes intentarla de nuevo.
                  </p>
                )}
              </div>
            );
          })}
          {text && (
            <div className="assistant-markdown" ref={markdown}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm, assistantMarkdownPlugin(records, results)]}
                skipHtml
                components={{
                  img: () => null,
                  a: ({ href, children }) => {
                    const safe = href && hrefs.has(href) ? safeRecordHref(href) : null;
                    return safe ? <a href={safe}>{children}</a> : <span>{children}</span>;
                  },
                  table: ({ children }) => (
                    <div className="assistant-table-scroll" tabIndex={0}>
                      <table>{children}</table>
                    </div>
                  ),
                }}
              >
                {text}
              </ReactMarkdown>
            </div>
          )}
          {!text && tools.length === 0 && (
            <div className="assistant-thinking" role="status">
              <span />
              <span />
              <span />
              <span className="sr-only">Preparando respuesta</span>
            </div>
          )}
          {text && (message.status !== 'streaming' || !runActive) && (
            <div className="assistant-message-actions">
              <button
                type="button"
                onClick={() => void copy()}
                aria-label={copied ? 'Respuesta copiada' : 'Copiar respuesta'}
              >
                {copied ? <CheckCheck size={14} /> : <Copy size={14} />}
                {copied ? 'Copiado' : 'Copiar'}
              </button>
              {copyError && <span role="status">No se pudo copiar. Selecciona el texto.</span>}
              {message.status === 'failed' && <span className="assistant-inline-error">Respuesta interrumpida</span>}
            </div>
          )}
        </>
      )}
    </article>
  );
}
