import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const toneClasses = {
  default: "border-slate-200 bg-white text-slate-950",
  selected: "border-slate-900 bg-slate-900 text-white",
  accent: "border-teal-200 bg-teal-50 text-teal-900",
};

export function BandejaKpiCard({
  label,
  value,
  helper,
  selected = false,
  onClick,
}: {
  label: string;
  value: string;
  helper?: string;
  selected?: boolean;
  onClick?: () => void;
}) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "rounded-xl border p-4 text-left transition-colors",
        onClick && "cursor-pointer hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400",
        selected ? toneClasses.selected : toneClasses.default,
      )}
    >
      <p className={cn("text-xs font-medium", selected ? "text-slate-200" : "text-slate-500")}>
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {helper ? (
        <p className={cn("mt-1 text-xs", selected ? "text-slate-300" : "text-slate-500")}>
          {helper}
        </p>
      ) : null}
    </Comp>
  );
}

export function BandejaSkeletonRows({ count = 5 }: { count?: number }) {
  return (
    <div className="divide-y divide-slate-100">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="flex animate-pulse flex-col gap-2 px-4 py-4">
          <div className="h-4 w-40 rounded bg-slate-100" />
          <div className="h-3 w-64 rounded bg-slate-100" />
        </div>
      ))}
    </div>
  );
}

export function BandejaEmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-10 text-center">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}
