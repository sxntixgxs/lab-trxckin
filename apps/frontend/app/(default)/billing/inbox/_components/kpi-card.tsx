import type { ReactNode } from "react";

export function KpiCard({
  icon,
  label,
  value,
  helper,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  helper: string;
  tone: "primary" | "warning" | "accent" | "danger";
}) {
  const colors = {
    primary: "bg-indigo-50 text-indigo-700",
    warning: "bg-amber-50 text-amber-700",
    accent: "bg-orange-50 text-orange-700",
    danger: "bg-rose-50 text-rose-700",
  };

  return (
    <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4">
      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${colors[tone]}`}>
        {icon}
      </div>
      <div>
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <p className="text-2xl font-semibold tabular-nums text-slate-950">{value}</p>
        <p className="text-xs text-slate-500">{helper}</p>
      </div>
    </div>
  );
}
