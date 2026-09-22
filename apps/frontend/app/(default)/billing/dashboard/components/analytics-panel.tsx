"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate } from "../../lib/utils";
import {
  PHASE_LABELS,
  type DashboardDistribucion,
  type WeeklyTrendPoint,
} from "../types";

const CHART_GRID = "#e2e8f0";
const CHART_TICK = "#64748b";
const PHASE_COLOR = "#0ea5e9";
const USER_COLOR = "#6366f1";

function phaseLabel(fase: string) {
  return PHASE_LABELS[fase] ?? fase;
}

function truncateName(name: string, max = 22) {
  return name.length > max ? `${name.slice(0, max - 1)}…` : name;
}

export function AnalyticsPanel({
  distribucion,
  distribucionLoading,
  distribucionError,
  weeklyTrend,
}: {
  distribucion: DashboardDistribucion | undefined;
  distribucionLoading: boolean;
  distribucionError: string | null;
  weeklyTrend: WeeklyTrendPoint[] | undefined;
}) {
  const porFase = (distribucion?.porFase ?? []).map((row) => ({
    ...row,
    label: phaseLabel(row.fase),
  }));
  const porResponsable = (distribucion?.porResponsable ?? []).slice(0, 15).map((row) => ({
    ...row,
    label: truncateName(row.nombre),
  }));
  const trend = weeklyTrend ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900">Distribución por fase</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Facturas activas según período, grupo y SLA.
          </p>

          {distribucionError ? (
            <p className="mt-6 text-center text-sm text-rose-600">{distribucionError}</p>
          ) : distribucionLoading && !distribucion ? (
            <p className="mt-6 text-center text-sm text-slate-500">Cargando distribución...</p>
          ) : porFase.length === 0 ? (
            <p className="mt-6 text-center text-sm text-slate-500">
              Sin facturas para los filtros seleccionados.
            </p>
          ) : (
            <div className="mt-4 h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={porFase} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11, fill: CHART_TICK }}
                    allowDecimals={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={130}
                    tick={{ fontSize: 11, fill: CHART_TICK }}
                  />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 12 }}
                    formatter={(value) => [value, "Facturas"]}
                  />
                  <Bar dataKey="count" fill={PHASE_COLOR} name="Facturas" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {distribucion?.truncated ? (
            <p className="mt-2 text-xs text-amber-600">
              Resultado parcial: se alcanzó el límite de análisis.
            </p>
          ) : null}

          <details className="mt-3">
            <summary className="cursor-pointer text-xs font-medium text-slate-500 hover:text-slate-900">
              Ver tabla de datos
            </summary>
            <div className="mt-2 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 hover:bg-slate-50">
                    <TableHead>Fase</TableHead>
                    <TableHead className="text-right">Facturas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {porFase.map((row) => (
                    <TableRow key={row.fase}>
                      <TableCell>{row.label}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </details>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900">Distribución por responsable</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Responsables activos de las facturas filtradas (top 15).
          </p>

          {distribucionError ? (
            <p className="mt-6 text-center text-sm text-rose-600">{distribucionError}</p>
          ) : distribucionLoading && !distribucion ? (
            <p className="mt-6 text-center text-sm text-slate-500">Cargando distribución...</p>
          ) : porResponsable.length === 0 ? (
            <p className="mt-6 text-center text-sm text-slate-500">
              Sin responsables para los filtros seleccionados.
            </p>
          ) : (
            <div className="mt-4 h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={porResponsable} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11, fill: CHART_TICK }}
                    allowDecimals={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={130}
                    tick={{ fontSize: 11, fill: CHART_TICK }}
                  />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 12 }}
                    formatter={(value, _name, payload) => [
                      value,
                      (payload as { payload?: { nombre?: string } })?.payload?.nombre ?? "Facturas",
                    ]}
                  />
                  <Bar dataKey="count" fill={USER_COLOR} name="Facturas" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <details className="mt-3">
            <summary className="cursor-pointer text-xs font-medium text-slate-500 hover:text-slate-900">
              Ver tabla de datos
            </summary>
            <div className="mt-2 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 hover:bg-slate-50">
                    <TableHead>Responsable</TableHead>
                    <TableHead className="text-right">Facturas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(distribucion?.porResponsable ?? []).map((row) => (
                    <TableRow key={row.userId ?? row.email}>
                      <TableCell>{row.nombre}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </details>
        </section>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">
          Ingresadas vs. finalizadas por semana
        </h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Solo disponible con un rango de fechas definido (no aplica en &quot;Todas las
          fechas&quot;).
        </p>

        {trend.length === 0 ? (
          <p className="mt-6 text-center text-sm text-slate-500">
            Sin datos semanales para el periodo seleccionado.
          </p>
        ) : (
          <div className="mt-4 h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={trend} margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                <XAxis
                  dataKey="weekStart"
                  tickFormatter={(value: string) => formatDate(value)}
                  tick={{ fontSize: 11, fill: CHART_TICK }}
                />
                <YAxis tick={{ fontSize: 11, fill: CHART_TICK }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 12 }}
                  labelFormatter={(value) => formatDate(String(value))}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="ingresadas" fill="#0ea5e9" name="Ingresadas" radius={[4, 4, 0, 0]} />
                <Line
                  type="monotone"
                  dataKey="finalizadas"
                  stroke="#10b981"
                  strokeWidth={2}
                  name="Finalizadas"
                  dot={{ r: 3 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}

        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-medium text-slate-500 hover:text-slate-900">
            Ver tabla de datos
          </summary>
          <div className="mt-2 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 hover:bg-slate-50">
                  <TableHead>Semana</TableHead>
                  <TableHead className="text-right">Ingresadas</TableHead>
                  <TableHead className="text-right">Finalizadas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trend.map((row) => (
                  <TableRow key={row.weekStart}>
                    <TableCell>{formatDate(row.weekStart)}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.ingresadas}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.finalizadas}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </details>
      </section>
    </div>
  );
}
