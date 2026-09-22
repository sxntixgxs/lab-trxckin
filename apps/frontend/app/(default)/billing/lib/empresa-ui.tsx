import { Building2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { getEmpresaInfo } from "@/lib/empresas";
import { cn } from "@/lib/utils";

export function resolveFacturacionEmpresaId(tarea: {
  empresa?: number;
  factura?: { empresa?: number } | null;
}): number {
  return tarea.empresa ?? tarea.factura?.empresa ?? 1;
}

function hexToRgba(hex: string, alpha: number) {
  const normalized = hex.replace("#", "");
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function getEmpresaAccentStyle(empresaId: number) {
  const info = getEmpresaInfo(empresaId);
  const color = info?.color ?? "#64748b";
  return {
    color,
    rowBackground: hexToRgba(color, 0.06),
    rowBorder: hexToRgba(color, 0.35),
    badgeBackground: hexToRgba(color, 0.1),
    badgeBorder: hexToRgba(color, 0.25),
    iconBackground: hexToRgba(color, 0.12),
  };
}

export function EmpresaIconTile({
  empresaId,
  className,
  iconClassName,
}: {
  empresaId: number;
  className?: string;
  iconClassName?: string;
}) {
  const accent = getEmpresaAccentStyle(empresaId);

  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-xl",
        className,
      )}
      style={{
        backgroundColor: accent.iconBackground,
        color: accent.color,
      }}
    >
      <Building2 className={cn("h-4 w-4", iconClassName)} />
    </span>
  );
}

export function EmpresaBadge({
  empresaId,
  className,
  compact = false,
}: {
  empresaId: number;
  className?: string;
  compact?: boolean;
}) {
  const info = getEmpresaInfo(empresaId);
  const label = compact
    ? (info?.nombreCorto ?? info?.nombre ?? `Empresa ${empresaId}`)
    : (info?.nombre ?? `Empresa ${empresaId}`);
  const accent = getEmpresaAccentStyle(empresaId);

  return (
    <Badge
      variant="outline"
      className={cn(
        "shrink-0 whitespace-nowrap",
        info
          ? cn(info.bgColor, info.textColor, info.borderColor)
          : "border-transparent",
        compact
          ? "rounded-md px-1.5 py-0.5 text-[10px] font-bold leading-4"
          : "rounded-full px-2.5 py-0.5 text-xs font-semibold",
        className,
      )}
      style={
        info
          ? undefined
          : {
              backgroundColor: accent.badgeBackground,
              color: accent.color,
              borderColor: accent.badgeBorder,
            }
      }
    >
      {label}
    </Badge>
  );
}

export function FacturaEmpresaBadge({
  tarea,
  className,
  compact = false,
}: {
  tarea: { empresa?: number; factura?: { empresa?: number } | null };
  className?: string;
  compact?: boolean;
}) {
  return (
    <EmpresaBadge
      empresaId={resolveFacturacionEmpresaId(tarea)}
      className={className}
      compact={compact}
    />
  );
}
