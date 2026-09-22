"use client";

import { AlertTriangle, Info, OctagonAlert } from "lucide-react";
import { ALERT_KIND_TONE, type DashboardAlert } from "../types";

const TONE_STYLES: Record<string, string> = {
  destructive: "border-rose-200 bg-rose-50 text-rose-800",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  info: "border-sky-200 bg-sky-50 text-sky-800",
};

const TONE_ICON: Record<string, React.ReactNode> = {
  destructive: <OctagonAlert className="h-3.5 w-3.5" />,
  warning: <AlertTriangle className="h-3.5 w-3.5" />,
  info: <Info className="h-3.5 w-3.5" />,
};

export function AttentionStrip({ alerts }: { alerts: DashboardAlert[] | undefined }) {
  if (!alerts || alerts.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2" role="status" aria-label="Alertas operativas">
      {alerts.map((alert) => {
        const tone = ALERT_KIND_TONE[alert.kind] ?? "info";
        return (
          <span
            key={alert.kind}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${TONE_STYLES[tone]}`}
          >
            {TONE_ICON[tone]}
            {alert.label}
            <span className="font-semibold tabular-nums">{alert.count}</span>
          </span>
        );
      })}
    </div>
  );
}
