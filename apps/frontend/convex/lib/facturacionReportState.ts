import {
  type PeajesEstadoContable,
  resolvePeajesEstadoPublico,
} from "./facturacionPeajesContabilidad";

export function resolveFacturacionReportState(args: {
  esPeaje?: boolean;
  peajesCruce?: unknown;
  estadoContable?: PeajesEstadoContable | null;
  tareaEstado?: string | null;
}) {
  const estadoPeajes = resolvePeajesEstadoPublico({
    esPeaje: args.esPeaje,
    peajesCruce: args.peajesCruce,
    estadoContable: args.estadoContable,
  });

  if (estadoPeajes) {
    return {
      faseActual: estadoPeajes,
      estadoListado: estadoPeajes,
    };
  }

  return {
    faseActual: args.tareaEstado ?? "sin_tarea",
    estadoListado: args.tareaEstado ?? "sin_workflow",
  };
}

export function isPeajesPublicState(value: string | null | undefined) {
  return (
    value === "recepcion_peajes" ||
    value === "peajes_cubierta" ||
    value === "peajes_pendiente_contabilidad" ||
    value === "peajes_contabilizada"
  );
}
