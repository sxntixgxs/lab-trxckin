'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { ArrowUpRight, FileText, Info } from 'lucide-react';
import type { AssistantRecordReference, AssistantToolResult } from '@/lib/assistant/contracts';
import { ASSISTANT_DOMAIN_LABELS } from '@/lib/assistant/contracts';
import { EMPRESAS_MAP } from '@/lib/empresas';
import { formatAmount, safeRecordHref } from './assistant-helpers';
import {
  assistantCellLabel,
  assistantCompletenessNote,
  assistantFieldLabel,
  assistantStatusLabel,
  assistantSummaryLabel,
} from './assistant-labels';

const Chart = dynamic(() => import('./assistant-chart'), {
  ssr: false,
  loading: () => <div className="assistant-skeleton assistant-chart-canvas" aria-label="Cargando gráfico" />,
});

export function RecordCard({ record, compact = false }: { record: AssistantRecordReference; compact?: boolean }) {
  const href = safeRecordHref(record.href);
  const content = (
    <>
      <span className="assistant-record-icon">
        <FileText size={16} />
      </span>
      <span className="assistant-record-copy">
        <span className="assistant-record-title">{record.title}</span>
        <span className="assistant-record-subtitle">
          {record.subtitle ?? ASSISTANT_DOMAIN_LABELS[record.domain]}
          {!compact && ` · ${EMPRESAS_MAP[record.companyId]?.nombreCorto ?? 'Empresa'}`}
        </span>
        {record.status && (
          <span className="assistant-record-status">{assistantStatusLabel(record.status, record.domain)}</span>
        )}
      </span>
      <span className="assistant-record-end">
        {typeof record.amount === 'number' && <strong>{formatAmount(record.amount, record.currency)}</strong>}
        {href && <ArrowUpRight size={16} />}
      </span>
    </>
  );
  return href ? (
    <Link className={`assistant-record${compact ? ' is-compact' : ''}`} href={href}>
      {content}
    </Link>
  ) : (
    <div className={`assistant-record${compact ? ' is-compact' : ''}`}>{content}</div>
  );
}

export function AssistantResults({
  result,
  allowChart,
  showRecords = true,
}: {
  result: AssistantToolResult;
  allowChart: boolean;
  showRecords?: boolean;
}) {
  const columns = [...new Set(result.rows.flatMap((row) => Object.keys(row)))];
  return (
    <section className="assistant-result" aria-label={result.title}>
      <div className="assistant-result-heading">
        <strong>{result.title}</strong>
        <span>
          {result.metadata.returned} {result.metadata.returned === 1 ? 'resultado' : 'resultados'}
        </span>
      </div>
      {result.error ? <p className="assistant-inline-error">{result.error}</p> : null}
      {showRecords && result.records.length > 0 && (
        <div className="assistant-records">
          {result.records.slice(0, 6).map((record) => (
            <RecordCard key={`${record.recordType}:${record.id}`} record={record} />
          ))}
        </div>
      )}
      {result.summary && (
        <dl className="assistant-summary">
          {Object.entries(result.summary).map(([key, value]) => (
            <div key={key}>
              <dt>{assistantFieldLabel(key)}</dt>
              <dd>{assistantSummaryLabel(key, value)}</dd>
            </div>
          ))}
        </dl>
      )}
      {result.guide && (
        <ol className="assistant-guide">
          {result.guide.steps.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
      )}
      {allowChart && result.chart && <Chart result={result} />}
      {result.rows.length > 0 && (
        <details
          className="assistant-data-details"
          open={!showRecords || (result.records.length === 0 && !result.chart && result.rows.length <= 5)}
        >
          <summary>
            Ver tabla de resultados ({result.rows.length} {result.rows.length === 1 ? 'fila' : 'filas'})
          </summary>
          <div className="assistant-table-scroll" tabIndex={0} role="region" aria-label={`Tabla: ${result.title}`}>
            <table>
              <caption className="sr-only">{result.title}</caption>
              <thead>
                <tr>
                  {columns.map((key) => (
                    <th scope="col" key={key}>
                      {assistantFieldLabel(key)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row, i) => (
                  <tr key={i}>
                    {columns.map((key) => (
                      <td key={key}>
                        {assistantCellLabel(
                          key,
                          row[key],
                          result.sources[0]?.domain,
                          typeof row.moneda === 'string' ? row.moneda : result.metadata.currency,
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
      {!result.metadata.complete && (
        <p className="assistant-coverage">
          <Info size={14} />
          Consulta parcial: se muestran {result.metadata.returned} resultados. Pide más resultados o acota la búsqueda.
        </p>
      )}
      {result.metadata.notes.map((note, i) => (
        <p className="assistant-result-note" key={i}>
          {assistantCompletenessNote(note)}
        </p>
      ))}
      <p className="assistant-result-time">
        Consultado{' '}
        {new Intl.DateTimeFormat('es-CO', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' }).format(
          result.metadata.asOf,
        )}{' '}
        · {result.metadata.companyIds.map((id) => EMPRESAS_MAP[id]?.nombreCorto ?? `Empresa ${id}`).join(', ')}
      </p>
    </section>
  );
}
