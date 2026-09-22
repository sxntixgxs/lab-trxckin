import type { ReactNode } from "react";

export function Field({
  label,
  icon,
  hint,
  optional,
  children,
}: {
  label: string;
  icon?: ReactNode;
  hint?: string;
  optional?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        {icon ? <span className="text-slate-400">{icon}</span> : null}
        <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">
          {label}
        </label>
        {optional ? (
          <span className="text-[10px] font-medium text-slate-400">opcional</span>
        ) : null}
      </div>
      {children}
      {hint ? <p className="text-xs text-slate-400">{hint}</p> : null}
    </div>
  );
}
