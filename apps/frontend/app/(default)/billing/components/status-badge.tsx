import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Doc } from "@/convex/_generated/dataModel";

export const FACTURACION_STATUS_LABELS: Record<string, string> = {
  recepcion: "Recepción",
  recepcion_peajes: "Recepción Peajes",
  peajes_cubierta: "Cruce aplicado",
  peajes_pendiente_contabilidad: "Pendiente contabilidad",
  peajes_contabilizada: "Contabilizada",
  revision_lider: "Revisión líder",
  jefe_directo: "Jefe directo",
  aceptada: "Aceptada",
  rechazada: "Rechazada",
  rechazada_dian: "Rechazada DIAN",
  pendiente_rechazar_dian: "Pendiente Rechazar DIAN",
  pendiente_nota_credito: "Pendiente NC (legacy)",
  causacion: "Causación",
  revision_impuestos: "Contabilidad",
  eventos_dian: "Eventos DIAN",
  reembolso_caja_menor: "Reembolso Caja Menor",
  caja_menor_por_generar: "Caja menor · Por generar",
  caja_menor_aprobacion_lider: "Caja menor · Aprobación líder",
  caja_menor_revision: "Caja menor · Revisión",
  caja_menor_contabilidad: "Caja menor · Contabilidad",
  caja_menor_eventos_dian: "Caja menor · Eventos DIAN",
  caja_menor_gerencia: "Caja menor · Gerencia",
  caja_menor_tesoreria: "Caja menor · Tesorería",
  caja_menor_reembolsada: "Caja menor · Reembolsada",
  caja_menor_tesoreria_pendiente_regularizar:
    "Caja menor · Tesorería pendiente de regularizar",
  caja_menor_rechazado: "Caja menor · Reembolso rechazado",
  caja_menor_anulado: "Caja menor · Caja Menor anulada",
  caja_menor_relacion_pendiente: "Caja menor · Relación pendiente",
  gerencia: "Gerencia",
  revision_tesoreria: "Tesorería",
  pagada: "Pagada",
  legalizada: "Legalizada",
  cerrada: "Cerrada",
  nota_credito_cerrada: "Cerrada NC",
};

const STATUS_CLASSES: Record<string, string> = {
  recepcion: "border-indigo-200 bg-indigo-50 text-indigo-700",
  recepcion_peajes: "border-teal-200 bg-teal-50 text-teal-700",
  peajes_cubierta: "border-emerald-200 bg-emerald-50 text-emerald-700",
  peajes_pendiente_contabilidad: "border-amber-200 bg-amber-50 text-amber-700",
  peajes_contabilizada: "border-emerald-200 bg-emerald-50 text-emerald-700",
  revision_lider: "border-amber-200 bg-amber-50 text-amber-700",
  jefe_directo: "border-lime-200 bg-lime-50 text-lime-700",
  aceptada: "border-emerald-200 bg-emerald-50 text-emerald-700",
  rechazada: "border-rose-200 bg-rose-50 text-rose-700",
  rechazada_dian: "border-rose-300 bg-rose-50 text-rose-800",
  pendiente_rechazar_dian: "border-orange-200 bg-orange-50 text-orange-700",
  pendiente_nota_credito: "border-amber-200 bg-amber-50 text-amber-800",
  causacion: "border-sky-200 bg-sky-50 text-sky-700",
  revision_impuestos: "border-cyan-200 bg-cyan-50 text-cyan-700",
  eventos_dian: "border-teal-200 bg-teal-50 text-teal-700",
  reembolso_caja_menor: "border-teal-200 bg-teal-50 text-teal-700",
  caja_menor_por_generar: "border-teal-200 bg-teal-50 text-teal-800",
  caja_menor_aprobacion_lider: "border-teal-200 bg-teal-50 text-teal-800",
  caja_menor_revision: "border-teal-200 bg-teal-50 text-teal-800",
  caja_menor_contabilidad: "border-cyan-200 bg-cyan-50 text-cyan-800",
  caja_menor_eventos_dian: "border-teal-200 bg-teal-50 text-teal-800",
  caja_menor_gerencia: "border-purple-200 bg-purple-50 text-purple-800",
  caja_menor_tesoreria: "border-violet-200 bg-violet-50 text-violet-800",
  caja_menor_reembolsada: "border-emerald-200 bg-emerald-50 text-emerald-800",
  caja_menor_tesoreria_pendiente_regularizar:
    "border-amber-200 bg-amber-50 text-amber-800",
  caja_menor_rechazado: "border-rose-200 bg-rose-50 text-rose-800",
  caja_menor_anulado: "border-slate-200 bg-slate-50 text-slate-700",
  caja_menor_relacion_pendiente: "border-orange-200 bg-orange-50 text-orange-800",
  gerencia: "border-purple-200 bg-purple-50 text-purple-700",
  revision_tesoreria: "border-violet-200 bg-violet-50 text-violet-700",
  pagada: "border-green-200 bg-green-50 text-green-700",
  legalizada: "border-emerald-200 bg-emerald-50 text-emerald-700",
  cerrada: "border-cyan-200 bg-cyan-50 text-cyan-700",
  nota_credito_cerrada: "border-cyan-200 bg-cyan-50 text-cyan-700",
};

export type PeajesConciliacionEstado =
  | "pendiente"
  | "parcial"
  | "cubierta"
  | "sobrecubierta";

type FacturaEstadoInput = {
  esPeaje?: boolean;
  peajesCruce?: unknown;
};

export function resolveFacturaEstado(args: {
  factura: FacturaEstadoInput;
  tareaEstado?: string | null;
  estadoResuelto?: string | null;
  estadoConciliacion?: PeajesConciliacionEstado | null;
  estadoContable?: "pendiente_contabilidad" | "contabilizada" | null;
}): string | null {
  if (args.estadoResuelto) return args.estadoResuelto;
  if (args.tareaEstado) return args.tareaEstado;
  if (!args.factura.esPeaje) return null;

  if (args.estadoContable === "contabilizada") {
    return "peajes_contabilizada";
  }
  if (args.estadoContable === "pendiente_contabilidad") {
    return "peajes_pendiente_contabilidad";
  }

  if (args.factura.peajesCruce) return "peajes_cubierta";

  const conciliacion = args.estadoConciliacion;
  if (conciliacion === "cubierta" || conciliacion === "sobrecubierta") {
    return "peajes_cubierta";
  }

  return "recepcion_peajes";
}

export function resolveFacturaEstadoFromRow(args: {
  factura: Doc<"facturacionFacturas"> & { estadoResuelto?: string | null };
  tarea?: Doc<"facturacionTareas"> | null;
}): string | null {
  return resolveFacturaEstado({
    factura: args.factura,
    tareaEstado: args.tarea?.estado ?? null,
    estadoResuelto: args.factura.estadoResuelto ?? null,
  });
}

export function FacturacionStatusBadge({
  estado,
  className,
}: {
  estado: string;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
        STATUS_CLASSES[estado] ?? "border-slate-200 bg-slate-50 text-slate-700",
        className,
      )}
    >
      {FACTURACION_STATUS_LABELS[estado] ?? estado}
    </Badge>
  );
}
