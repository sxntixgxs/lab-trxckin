import { Badge } from "@/components/ui/badge";
import {
  ESTADO_TONE_CLASSES,
  getMovimientoEstadoLabel,
  getMovimientoEstadoTone,
  getReembolsoEstadoLabel,
  getReembolsoEstadoTone,
  type EstadoTone,
} from "@/lib/cajas-menores";

type EstadoBadgeProps = {
  kind: "movimiento" | "reembolso";
  estado: string;
  className?: string;
};

function getLabel(kind: EstadoBadgeProps["kind"], estado: string) {
  return kind === "movimiento"
    ? getMovimientoEstadoLabel(estado)
    : getReembolsoEstadoLabel(estado);
}

function getTone(kind: EstadoBadgeProps["kind"], estado: string): EstadoTone {
  return kind === "movimiento"
    ? getMovimientoEstadoTone(estado)
    : getReembolsoEstadoTone(estado);
}

export function EstadoBadge({ kind, estado, className }: EstadoBadgeProps) {
  const tone = getTone(kind, estado);
  return (
    <Badge
      variant="outline"
      className={`rounded-full font-medium ${ESTADO_TONE_CLASSES[tone].badge} ${className ?? ""}`}
    >
      {getLabel(kind, estado)}
    </Badge>
  );
}
