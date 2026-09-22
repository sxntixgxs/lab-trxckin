import {
  DEVOLUCION_STAGE_ORDER,
  getDevolucionDestinos,
  puedeDevolverFactura,
  type DevolucionDestino,
} from "@/convex/lib/facturacionDevolucionRules";
import type { Doc } from "@/convex/_generated/dataModel";

export {
  DEVOLUCION_STAGE_ORDER,
  getDevolucionDestinos,
  puedeDevolverFactura,
  type DevolucionDestino,
};

export function puedeMostrarDevolverFactura(args: {
  factura: Pick<Doc<"facturacionFacturas">, "esPeaje">;
  tarea: Pick<Doc<"facturacionTareas">, "estado"> | null | undefined;
  estadoResuelto?: string | null;
}): boolean {
  const estadoActual = args.estadoResuelto ?? args.tarea?.estado ?? "";
  return puedeDevolverFactura({
    estadoActual,
    esPeaje: Boolean(args.factura.esPeaje),
    tieneTarea: Boolean(args.tarea),
  });
}

export type DevolucionContextoDestino = DevolucionDestino & {
  responsableHistorico?: {
    usuarioId?: string;
    nombre: string;
    email: string;
  } | null;
  candidatos?: Array<{
    usuarioId?: string;
    nombre: string;
    email: string;
  }>;
  requiereSeleccionResponsable: boolean;
};

export type DevolucionContexto = {
  puedeDevolver: boolean;
  estadoActual: string;
  empresa?: number;
  asignacionId?: string | null;
  destinos: DevolucionContextoDestino[];
};
