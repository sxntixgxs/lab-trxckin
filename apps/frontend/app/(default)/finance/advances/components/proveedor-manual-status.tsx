import { AlertTriangle, Info } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const MANUAL_BADGE_LABEL = "Manual · solo esta solicitud";

const MANUAL_ALERT_TITLE = "Proveedor no inscrito en SIESA";
const MANUAL_ALERT_BODY =
  "Este dato no crea ni formaliza al proveedor. Se guardará únicamente en el formato y la solicitud de anticipo.";

export function isProveedorManualOrigen(
  origen: string | null | undefined
): boolean {
  return origen === "manual_solicitud";
}

export function ProveedorManualBadge({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "w-fit gap-1 border-amber-300 bg-amber-50 font-semibold text-amber-950",
        compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs",
        className
      )}
    >
      <Info
        className={cn("shrink-0", compact ? "h-3 w-3" : "h-3.5 w-3.5")}
        aria-hidden
      />
      <span>{MANUAL_BADGE_LABEL}</span>
    </Badge>
  );
}

export function ProveedorManualAlert({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-2.5 rounded-md border border-amber-300 bg-amber-50 text-amber-950",
        compact ? "px-3 py-2.5" : "px-4 py-3",
        className
      )}
    >
      <AlertTriangle
        className={cn(
          "mt-0.5 shrink-0 text-amber-700",
          compact ? "h-4 w-4" : "h-5 w-5"
        )}
        aria-hidden
      />
      <div className="min-w-0">
        <p
          className={cn(
            "font-black",
            compact ? "text-xs" : "text-sm"
          )}
        >
          {MANUAL_ALERT_TITLE}
        </p>
        <p
          className={cn(
            "mt-0.5 font-medium leading-relaxed text-amber-900",
            compact ? "text-[11px]" : "text-xs"
          )}
        >
          {MANUAL_ALERT_BODY}
        </p>
      </div>
    </div>
  );
}

export function ProveedorOrigenInline({
  origen,
  className,
}: {
  origen?: string | null;
  className?: string;
}) {
  if (!isProveedorManualOrigen(origen)) return null;
  return <ProveedorManualBadge compact className={className} />;
}
