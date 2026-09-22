import type { Doc } from "@/convex/_generated/dataModel";

export type CajaRow = Doc<"cajasMenores"> & {
  estado: "activa" | "cerrada" | "anulado";
  totalRefills: number;
  totalReembolsado: number;
  totalLegalizado: number;
  saldoActual: number;
  saldoDisponible: number;
  refillPendiente: boolean;
  movimientosCount: number;
  refillsCount: number;
  canManage?: boolean;
};

export type CajaFormState = {
  nombre: string;
  assignedValue: string;
  assignedUsersIds: string[];
  observations: string;
};

export const emptyCajaForm: CajaFormState = {
  nombre: "",
  assignedValue: "",
  assignedUsersIds: [],
  observations: "",
};
