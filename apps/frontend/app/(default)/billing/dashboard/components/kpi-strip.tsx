"use client";

import { AlertOctagon, Landmark, UsersRound, Wallet } from "lucide-react";
import { formatCurrency } from "../../lib/utils";
import type { DashboardKpis, CurrencyBreakdown } from "../types";

function MontosSecundarios({ montos }: { montos: CurrencyBreakdown }) {
  const entries = Object.entries(montos).filter(([, value]) => value !== 0);
  if (entries.length === 0) {
    return <span className="text-[11px] text-slate-500">Sin monto registrado</span>;
  }
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
      {entries.map(([moneda, valor]) => (
        <span key={moneda} className="whitespace-nowrap">
          {formatCurrency(valor, moneda)}
        </span>
      ))}
    </span>
  );
}

type KpiKind = "lideres" | "fases_contables" | "tesoreria" | "sla_vencido";

function KpiCard({
  label,
  count,
  montos,
  icon,
  tone,
  subcounts,
  onClick,
  isActive,
}: {
  label: string;
  count: number;
  montos: CurrencyBreakdown;
  icon: React.ReactNode;
  tone: "slate" | "sky" | "amber" | "rose";
  subcounts?: Array<{ label: string; value: number }>;
  onClick: () => void;
  isActive: boolean;
}) {
  const toneClasses: Record<string, string> = {
    slate: "text-slate-600",
    sky: "text-sky-600",
    amber: "text-amber-600",
    rose: "text-rose-600",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isActive}
      className={`group flex min-h-[44px] flex-col rounded-2xl border p-3.5 text-left transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring sm:p-4 ${
        isActive
          ? "border-slate-900 bg-slate-100"
          : "border-slate-200 bg-white hover:border-slate-300"
      }`}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
          {label}
        </span>
        <span className={toneClasses[tone]}>{icon}</span>
      </span>
      <span className="mt-2 text-2xl font-semibold tabular-nums text-slate-950">
        {count.toLocaleString("es-CO")}
      </span>
      <span className="mt-1">
        <MontosSecundarios montos={montos} />
      </span>
      {subcounts && subcounts.length > 0 ? (
        <span className="mt-2 flex flex-wrap gap-1.5">
          {subcounts.map((item) => (
            <span
              key={item.label}
              className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600"
            >
              {item.label}: {item.value}
            </span>
          ))}
        </span>
      ) : null}
    </button>
  );
}

export function KpiStrip({
  kpis,
  activeKpi,
  onSelect,
}: {
  kpis: DashboardKpis | undefined;
  activeKpi: KpiKind | null;
  onSelect: (kind: KpiKind) => void;
}) {
  const empty: CurrencyBreakdown = {};
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <KpiCard
        label="En líderes"
        count={kpis?.lideres.count ?? 0}
        montos={kpis?.lideres.montosPorMoneda ?? empty}
        icon={<UsersRound className="h-4 w-4" />}
        tone="slate"
        onClick={() => onSelect("lideres")}
        isActive={activeKpi === "lideres"}
      />
      <KpiCard
        label="Fases contables"
        count={kpis?.fasesContables.count ?? 0}
        montos={kpis?.fasesContables.montosPorMoneda ?? empty}
        icon={<Landmark className="h-4 w-4" />}
        tone="sky"
        subcounts={[
          { label: "Causación", value: kpis?.fasesContables.subcounts.causacion ?? 0 },
          { label: "Contabilidad", value: kpis?.fasesContables.subcounts.revision_impuestos ?? 0 },
          { label: "Eventos DIAN", value: kpis?.fasesContables.subcounts.eventos_dian ?? 0 },
        ]}
        onClick={() => onSelect("fases_contables")}
        isActive={activeKpi === "fases_contables"}
      />
      <KpiCard
        label="Pendientes de pago"
        count={kpis?.tesoreria.count ?? 0}
        montos={kpis?.tesoreria.montosPorMoneda ?? empty}
        icon={<Wallet className="h-4 w-4" />}
        tone="amber"
        onClick={() => onSelect("tesoreria")}
        isActive={activeKpi === "tesoreria"}
      />
      <KpiCard
        label="SLA vencido"
        count={kpis?.slaVencido.count ?? 0}
        montos={kpis?.slaVencido.montosPorMoneda ?? empty}
        icon={<AlertOctagon className="h-4 w-4" />}
        tone="rose"
        onClick={() => onSelect("sla_vencido")}
        isActive={activeKpi === "sla_vencido"}
      />
    </div>
  );
}
