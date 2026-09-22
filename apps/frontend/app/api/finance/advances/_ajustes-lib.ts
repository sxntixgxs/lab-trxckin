import { NextResponse } from "next/server";
import type { Doc, Id } from "@/convex/_generated/dataModel";

export function resolveAjusteErrorStatus(message: string) {
  if (
    message === "No autorizado" ||
    message === "Sin permiso para registrar ajustes" ||
    message === "Sin permiso para reversar ajustes" ||
    message === "Empresa no autorizada"
  ) {
    return 403;
  }
  if (
    message.includes("no encontrad") ||
    message === "Ajuste no encontrado" ||
    message === "Anticipo no encontrado"
  ) {
    return 404;
  }
  if (
    message.includes("cambió") ||
    message.includes("último ajuste") ||
    message.includes("ya fue reversado") ||
    message.includes("no admite reversión") ||
    message.includes("fase actual")
  ) {
    return 409;
  }
  if (
    message.includes("Debe") ||
    message.includes("obligatorio") ||
    message.includes("entero") ||
    message.includes("decimales") ||
    message.includes("mayor a cero") ||
    message.includes("monto del ajuste") ||
    message.includes("únicamente") ||
    message.includes("menor") ||
    message.includes("inferior") ||
    message.includes("peajes") ||
    message.includes("pendiente de legalización") ||
    message.includes("Inválid")
  ) {
    return 400;
  }
  return 500;
}

export function jsonAjusteError(error: unknown) {
  const message = error instanceof Error ? error.message : "Error al procesar ajuste";
  return NextResponse.json({ error: message }, { status: resolveAjusteErrorStatus(message) });
}

export type AnticipoAjusteHistorialRow = Doc<"anticiposAjustes">;

export type AnticipoAjustesResumen = {
  valorSolicitado: number;
  valorAprobado: number;
  valorLegalizable: number;
  saldoLegalizado: number;
  saldoPendiente: number;
};

export type AnticipoAjustesLimites = {
  maximoSumar: number;
  maximoRestar: number;
  puedeSumar: boolean;
  puedeRestar: boolean;
};

export type AnticipoAjustesContextResponse = {
  empresa: number;
  resumen: AnticipoAjustesResumen;
  limites: AnticipoAjustesLimites;
  faseActual: string;
  tipoBolsa: "general" | "peajes";
  actorRol: "GERENCIA" | "TESORERO" | null;
  capacidades: {
    puedeAplicar: boolean;
    puedeReversar: boolean;
    ultimoAjusteActivoId: Id<"anticiposAjustes"> | null;
  };
  historial: {
    page: AnticipoAjusteHistorialRow[];
    isDone: boolean;
    continueCursor: string;
  } | null;
};

export type AnticipoAjusteApplyResponse = {
  ajusteId: Id<"anticiposAjustes">;
  idempotente: boolean;
  resumen: AnticipoAjustesResumen;
  limites: AnticipoAjustesLimites;
  faseActual: string;
  completado?: boolean;
  reabierto?: boolean;
};
