import type { BillingSession as Session } from "@/lib/billing-session";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { convexServer } from "@/lib/convexServerClient";
import { EMPRESAS_LIST, hasGlobalEmpresaAccess } from "@/lib/empresas";

export type CausacionContextoInput =
  | { tipo: "flujo_factura" }
  | {
      tipo: "reembolso_caja_menor";
      reembolsoId: Id<"cajasMenoresReembolsos">;
      movimientoId: Id<"facturacionCajaMenorMovimientos">;
    };

export type CausacionPatchInput = {
  expectedVersion: number;
  causado: boolean;
  numeroFp?: string;
  motivoCambio?: string;
  contexto: CausacionContextoInput;
};

export function resolveActorFromSession(session: Session) {
  const actorUserId = session.user.id?.trim();
  const actorNombre = session.user.nombre?.trim() || "Usuario";
  const actorEmail = session.user.email?.trim().toLowerCase() || "";
  if (!actorUserId) {
    throw new Error("No se pudo identificar al usuario de la sesión.");
  }
  return { actorUserId, actorNombre, actorEmail };
}

export function parseCausacionContexto(params: URLSearchParams): CausacionContextoInput {
  const tipo = params.get("contextoTipo") ?? "flujo_factura";
  if (tipo === "reembolso_caja_menor") {
    const reembolsoId = params.get("reembolsoId");
    const movimientoId = params.get("movimientoId");
    if (!reembolsoId || !movimientoId) {
      throw new Error("Indica reembolsoId y movimientoId para el contexto de Caja Menor.");
    }
    return {
      tipo: "reembolso_caja_menor",
      reembolsoId: reembolsoId as Id<"cajasMenoresReembolsos">,
      movimientoId: movimientoId as Id<"facturacionCajaMenorMovimientos">,
    };
  }
  return { tipo: "flujo_factura" };
}

export function parseCausacionContextoFromBody(body: unknown): CausacionContextoInput {
  if (!body || typeof body !== "object") {
    throw new Error("Cuerpo JSON inválido.");
  }
  const record = body as Record<string, unknown>;
  const contexto = record.contexto;
  if (!contexto || typeof contexto !== "object") {
    throw new Error("Indica el contexto de la operación.");
  }
  const ctx = contexto as Record<string, unknown>;
  if (ctx.tipo === "reembolso_caja_menor") {
    if (typeof ctx.reembolsoId !== "string" || typeof ctx.movimientoId !== "string") {
      throw new Error("Contexto de reembolso incompleto.");
    }
    return {
      tipo: "reembolso_caja_menor",
      reembolsoId: ctx.reembolsoId as Id<"cajasMenoresReembolsos">,
      movimientoId: ctx.movimientoId as Id<"facturacionCajaMenorMovimientos">,
    };
  }
  if (ctx.tipo === "flujo_factura") {
    return { tipo: "flujo_factura" };
  }
  throw new Error("Contexto de causación no reconocido.");
}

export function parseCausacionPatchBody(body: unknown): CausacionPatchInput {
  if (!body || typeof body !== "object") {
    throw new Error("Cuerpo JSON inválido.");
  }
  const record = body as Record<string, unknown>;
  if (typeof record.expectedVersion !== "number" || !Number.isFinite(record.expectedVersion)) {
    throw new Error("Indica expectedVersion.");
  }
  if (typeof record.causado !== "boolean") {
    throw new Error("Indica causado como booleano.");
  }
  const contexto = parseCausacionContextoFromBody(body);
  return {
    expectedVersion: Math.trunc(record.expectedVersion),
    causado: record.causado,
    ...(typeof record.numeroFp === "string" ? { numeroFp: record.numeroFp } : {}),
    ...(typeof record.motivoCambio === "string" ? { motivoCambio: record.motivoCambio } : {}),
    contexto,
  };
}

export function resolveEmpresasAutorizadas(session: Session): number[] {
  const empresas = session.user.empresas ?? [];
  const todas = EMPRESAS_LIST.map((empresa) => empresa.id);
  if (hasGlobalEmpresaAccess(session.user.id_rol, session.user.acceso_todas_empresas)) {
    return empresas.length > 0 ? empresas : todas;
  }
  return empresas;
}

export function assertEmpresaAutorizada(empresa: number, empresasAutorizadas: number[]) {
  if (!empresasAutorizadas.includes(empresa)) {
    throw new Error("Empresa no autorizada");
  }
}

export function mapConvexCausacionError(error: unknown): { status: number; message: string } {
  if (
    error &&
    typeof error === "object" &&
    "data" in error &&
    error.data &&
    typeof error.data === "object"
  ) {
    const data = error.data as { code?: string; message?: string };
    const message = data.message ?? "Error al procesar causación.";
    switch (data.code) {
      case "BAD_REQUEST":
        return { status: 400, message };
      case "UNAUTHORIZED":
        return { status: 401, message };
      case "FORBIDDEN":
        return { status: 403, message };
      case "NOT_FOUND":
        return { status: 404, message };
      case "CONFLICT":
        return { status: 409, message };
      case "UNPROCESSABLE":
        return { status: 422, message };
      default:
        break;
    }
  }

  const message = error instanceof Error ? error.message : "Error al procesar causación.";
  if (message === "Empresa no autorizada") return { status: 403, message };
  if (message.includes("Factura no encontrada")) return { status: 404, message };
  if (message.includes("No se pudo identificar")) return { status: 401, message };
  if (
    message.includes("Cuerpo") ||
    message.includes("Indica") ||
    message.includes("Contexto") ||
    message.includes("JSON")
  ) {
    return { status: 400, message };
  }
  if (message.includes("cambió") || message.includes("corresponde")) {
    return { status: 409, message };
  }
  if (
    message.includes("FP") ||
    message.includes("motivo") ||
    message.includes("Transición") ||
    message.includes("cambios")
  ) {
    return { status: 422, message };
  }
  if (message.includes("permiso") || message.includes("autorizada")) {
    return { status: 403, message };
  }
  return { status: 500, message };
}

export async function obtenerCausacionFactura(args: {
  secret: string;
  facturaId: Id<"facturacionFacturas">;
  actorUserId: string;
  empresasAutorizadas: number[];
  contexto: CausacionContextoInput;
  historialCursor?: string;
}) {
  return await convexServer.query(api.facturacionCausacion.obtenerDesdeServidor, {
    secret: args.secret,
    facturaId: args.facturaId,
    actorUserId: args.actorUserId,
    empresasAutorizadas: args.empresasAutorizadas,
    contexto: args.contexto,
    ...(args.historialCursor ? { historialCursor: args.historialCursor } : {}),
  });
}

export async function actualizarCausacionFactura(args: {
  secret: string;
  facturaId: Id<"facturacionFacturas">;
  actor: { userId: string; nombre: string; email: string };
  empresasAutorizadas: number[];
  payload: CausacionPatchInput;
}) {
  return await convexServer.mutation(api.facturacionCausacion.actualizarDesdeServidor, {
    secret: args.secret,
    facturaId: args.facturaId,
    actor: args.actor,
    empresasAutorizadas: args.empresasAutorizadas,
    expectedVersion: args.payload.expectedVersion,
    causado: args.payload.causado,
    ...(args.payload.numeroFp !== undefined ? { numeroFp: args.payload.numeroFp } : {}),
    ...(args.payload.motivoCambio !== undefined ? { motivoCambio: args.payload.motivoCambio } : {}),
    contexto: args.payload.contexto,
  });
}
