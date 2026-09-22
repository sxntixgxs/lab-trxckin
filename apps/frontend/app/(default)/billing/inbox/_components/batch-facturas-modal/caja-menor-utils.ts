import type { BuzonTarea } from "../../../components/buzon-row";
import {
  createDefaultDistribucion,
  toLegacyCentroCosto,
} from "@/lib/cajas-menores/centros-costo-distribucion";
import type { CajaMenorMovementDraft } from "./types";

export function getDefaultCajaMenorDraft(tarea?: BuzonTarea | null): CajaMenorMovementDraft {
  const centrosCostoDistribucion = createDefaultDistribucion(tarea?.factura?.total ?? 0, {
    centroCostoCodigo: tarea?.factura?.centroCostoCodigo,
    centroCostoNombre: tarea?.factura?.centroCostoNombre,
    centrosCostoDistribucion: tarea?.factura?.centrosCostoDistribucion,
  });
  const legacy = toLegacyCentroCosto(centrosCostoDistribucion);
  return {
    centroCostoCodigo: legacy.centroCostoCodigo,
    centroCostoNombre: legacy.centroCostoNombre,
    centrosCostoDistribucion,
    fechaPago:
      tarea?.factura?.fechaPagoCajaMenor ??
      new Date().toISOString().slice(0, 10),
    concepto:
      tarea?.factura?.conceptoCajaMenor ??
      tarea?.factura?.descripcion ??
      "",
    observaciones: "",
  };
}

export function buildCajaMenorObservation(cajaMenorNombre?: string, cajaMenorId?: string) {
  const cajaMenorLabel = cajaMenorNombre?.trim() || cajaMenorId || "seleccionada";
  return `Pertenece a gasto de caja menor ${cajaMenorLabel}`;
}
