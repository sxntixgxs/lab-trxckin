import type { FunctionReturnType } from "convex/server";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export type BandejaResumen = FunctionReturnType<
  typeof api.cajaMenorBandejaQueries.obtenerResumenBandejaReembolsos
>;

export type BandejaCaja = BandejaResumen["cajas"][number];

export type SolicitudBandejaRow = FunctionReturnType<
  typeof api.cajaMenorBandejaQueries.listarSolicitudesReembolsoBandejaPaginadas
>["page"][number];

export type MovimientoBandejaRow = FunctionReturnType<
  typeof api.cajaMenorBandejaQueries.listarMovimientosPendientesCajaPaginados
>["page"][number];

/** Compatibilidad con ReembolsoGenerationDialog */
export type DashboardMovimiento = {
  _id: Id<"facturacionCajaMenorMovimientos">;
  valor: number;
  nombreEmpresa: string;
  concepto: string;
  fechaPago: string;
  centroCostoCodigo: string;
  centroCostoNombre: string;
  centroCostoId?: string;
  observaciones?: string;
  centrosCostoDistribucion?: Array<{
    centroCostoId?: string;
    centroCostoCodigo: string;
    centroCostoNombre: string;
    valor: number;
  }>;
  origen: "factura_sistema" | "recibo_fisico";
  factura?: {
    numeroFactura?: string;
    proveedorNombre?: string;
    pdfStorageId?: Id<"_storage">;
    soportesStorageId?: Id<"_storage">;
    soportesNombre?: string;
  };
  facturaId?: Id<"facturacionFacturas">;
};

export type DashboardCaja = {
  _id: Id<"cajasMenores">;
  nombre: string;
  empresa_id: number;
  assignedValue: number;
  saldoDisponible: number;
  pendientes: DashboardMovimiento[];
};
