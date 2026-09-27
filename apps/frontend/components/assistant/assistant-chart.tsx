'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { AssistantToolResult } from '@/lib/assistant/contracts';
import { formatAmount } from './assistant-helpers';
import { assistantCellLabel, assistantFieldLabel } from './assistant-labels';

const COLORS = ['#4268a8', '#2d8b81', '#bd7b35', '#8666b8', '#9b596b'];
export default function AssistantChart({ result }: { result: AssistantToolResult }) {
  const chart = result.chart;
  if (!chart) return null;
  const data = result.rows.filter(
    (row) => typeof row[chart.valueKey] === 'number' && Number.isFinite(row[chart.valueKey]),
  );
  if (!data.length) return null;
  const format = (value: number) =>
    chart.currency ? formatAmount(value, chart.currency) : new Intl.NumberFormat('es-CO').format(value);
  const label = (value: string | number) => assistantCellLabel(chart.labelKey, value, result.sources[0]?.domain);
  return (
    <figure className="assistant-chart">
      <figcaption>{chart.title}</figcaption>
      <div aria-hidden="true" className="assistant-chart-canvas">
        <ResponsiveContainer width="100%" height="100%">
          {chart.type === 'donut' ? (
            <PieChart>
              <Pie
                data={data}
                dataKey={chart.valueKey}
                nameKey={chart.labelKey}
                innerRadius={58}
                outerRadius={86}
                paddingAngle={2}
                isAnimationActive={false}
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value: number, name: string | number) => [format(value), label(name)]} />
            </PieChart>
          ) : chart.type === 'line' ? (
            <LineChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 10 }}>
              <CartesianGrid vertical={false} stroke="var(--assistant-border)" />
              <XAxis
                dataKey={chart.labelKey}
                tick={{ fontSize: 11, fill: 'var(--assistant-muted)' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={label}
              />
              <YAxis
                tick={{ fontSize: 11, fill: 'var(--assistant-muted)' }}
                width={55}
                axisLine={false}
                tickLine={false}
                tickFormatter={(n) => new Intl.NumberFormat('es', { notation: 'compact' }).format(n)}
              />
              <Tooltip
                formatter={(value: number) => [format(value), assistantFieldLabel(chart.valueKey)]}
                labelFormatter={label}
              />
              <Line
                type="monotone"
                dataKey={chart.valueKey}
                stroke={COLORS[0]}
                strokeWidth={2}
                dot={{ r: 3 }}
                isAnimationActive={false}
              />
            </LineChart>
          ) : (
            <BarChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 10 }}>
              <CartesianGrid vertical={false} stroke="var(--assistant-border)" />
              <XAxis
                dataKey={chart.labelKey}
                tick={{ fontSize: 11, fill: 'var(--assistant-muted)' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={label}
              />
              <YAxis
                tick={{ fontSize: 11, fill: 'var(--assistant-muted)' }}
                axisLine={false}
                tickLine={false}
                width={55}
                tickFormatter={(n) => new Intl.NumberFormat('es', { notation: 'compact' }).format(n)}
              />
              <Tooltip
                formatter={(value: number) => [format(value), assistantFieldLabel(chart.valueKey)]}
                labelFormatter={label}
              />
              <Bar
                dataKey={chart.valueKey}
                fill={COLORS[0]}
                radius={[4, 4, 0, 0]}
                maxBarSize={48}
                isAnimationActive={false}
              />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
      <details className="assistant-data-details">
        <summary>Ver datos del gráfico</summary>
        <div className="assistant-table-scroll">
          <table>
            <caption className="sr-only">{chart.title}</caption>
            <thead>
              <tr>
                <th scope="col">{assistantFieldLabel(chart.labelKey)}</th>
                <th scope="col">{assistantFieldLabel(chart.valueKey)}</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr key={i}>
                  <th scope="row">
                    {assistantCellLabel(chart.labelKey, row[chart.labelKey], result.sources[0]?.domain)}
                  </th>
                  <td>{format(Number(row[chart.valueKey]))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
