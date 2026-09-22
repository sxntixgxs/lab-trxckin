import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";

export const CAJA_MENOR_AUDIT_ACTIONS = [
  "marcar_caja_menor",
  "legalizar_caja_menor",
  "crear_documento_fisico",
  "crear_movimiento_caja_menor",
  "generar_reembolso_caja_menor",
  "actualizar_centro_costo_caja_menor",
  "aprobar_lider_reembolso_caja_menor",
  "rechazar_lider_reembolso_caja_menor",
  "aprobar_reembolso_caja_menor",
  "rechazar_reembolso_caja_menor",
  "confirmar_reembolso_caja_menor",
  "anular_movimiento_caja_menor",
  "devolver_buzon",
  "reasignar_revisor_caja_menor",
  "enviar_impuestos_reembolso_caja_menor",
  "aprobar_impuestos_reembolso_caja_menor",
  "rechazar_impuestos_reembolso_caja_menor",
  "devolver_impuestos_reembolso_caja_menor",
  "reasignar_contador_reembolso_caja_menor",
  "devolver_gerencia_contabilidad_reembolso_caja_menor",
  "devolver_gerencia_revision_reembolso_caja_menor",
  "reenviar_gerencia_reembolso_caja_menor",
  "reasignar_eventos_dian_reembolso_caja_menor",
  "reenviar_gerencia_impuestos_reembolso_caja_menor",
  "enviar_eventos_dian_reembolso_caja_menor",
  "rechazar_eventos_dian_reembolso_caja_menor",
  "devolver_eventos_dian_reembolso_caja_menor",
  "aprobar_eventos_dian_reembolso_caja_menor",
  "devolver_gerencia_eventos_dian_reembolso_caja_menor",
] as const;

export const cajaMenorContextoTipoEventoValidator = v.union(
  v.literal("asignacion"),
  v.literal("transicion"),
  v.literal("reasignacion"),
  v.literal("devolucion"),
  v.literal("rechazo"),
  v.literal("cierre"),
  v.literal("salto")
);

export const cajaMenorContextoResponsableValidator = v.object({
  userId: v.optional(v.string()),
  nombre: v.string(),
  email: v.optional(v.string()),
  tipo: v.optional(v.string()),
});

export const cajaMenorContextoValidator = v.object({
  reembolsoId: v.optional(v.id("cajasMenoresReembolsos")),
  movimientoId: v.optional(v.id("facturacionCajaMenorMovimientos")),
  eventoReembolsoId: v.optional(v.id("cajasMenoresReembolsoEventos")),
  faseAnterior: v.optional(v.string()),
  faseNueva: v.optional(v.string()),
  tipoEvento: v.optional(cajaMenorContextoTipoEventoValidator),
  responsableDestino: v.optional(cajaMenorContextoResponsableValidator),
  fasesOmitidas: v.optional(v.array(v.string())),
  intentoId: v.optional(v.string()),
});

export type CajaMenorContexto = {
  reembolsoId?: Id<"cajasMenoresReembolsos">;
  movimientoId?: Id<"facturacionCajaMenorMovimientos">;
  eventoReembolsoId?: Id<"cajasMenoresReembolsoEventos">;
  faseAnterior?: string;
  faseNueva?: string;
  tipoEvento?:
    | "asignacion"
    | "transicion"
    | "reasignacion"
    | "devolucion"
    | "rechazo"
    | "cierre"
    | "salto";
  responsableDestino?: {
    userId?: string;
    nombre: string;
    email?: string;
    tipo?: string;
  };
  fasesOmitidas?: string[];
  intentoId?: string;
};

export type CajaMenorDestinatario = {
  usuarioId?: string;
  userId?: string;
  nombre: string;
  email?: string;
  tipo?: string;
};

function normalizeDestinatario(
  destinatario: CajaMenorDestinatario | undefined | null
): CajaMenorContexto["responsableDestino"] | undefined {
  if (!destinatario?.nombre?.trim()) return undefined;
  const userId = destinatario.usuarioId ?? destinatario.userId;
  return {
    ...(userId ? { userId } : {}),
    nombre: destinatario.nombre.trim(),
    ...(destinatario.email ? { email: destinatario.email.trim().toLowerCase() } : {}),
    ...(destinatario.tipo ? { tipo: destinatario.tipo } : {}),
  };
}

export function inferTipoEventoFromAccion(
  accion: Doc<"facturacionAprobaciones">["accion"]
): CajaMenorContexto["tipoEvento"] | undefined {
  if (accion.startsWith("reasignar_")) return "reasignacion";
  if (accion.startsWith("devolver_")) return "devolucion";
  if (accion.startsWith("rechazar_")) return "rechazo";
  if (accion === "confirmar_reembolso_caja_menor") return "cierre";
  if (accion === "generar_reembolso_caja_menor") return "transicion";
  if (
    accion === "aprobar_lider_reembolso_caja_menor" ||
    accion === "aprobar_reembolso_caja_menor" ||
    accion === "aprobar_impuestos_reembolso_caja_menor" ||
    accion === "aprobar_eventos_dian_reembolso_caja_menor" ||
    accion === "enviar_impuestos_reembolso_caja_menor" ||
    accion === "enviar_eventos_dian_reembolso_caja_menor" ||
    accion === "reenviar_gerencia_reembolso_caja_menor" ||
    accion === "reenviar_gerencia_impuestos_reembolso_caja_menor"
  ) {
    return "transicion";
  }
  if (accion === "anular_movimiento_caja_menor" || accion === "devolver_buzon") {
    return "cierre";
  }
  if (accion === "crear_movimiento_caja_menor" || accion === "actualizar_centro_costo_caja_menor") {
    return "transicion";
  }
  return undefined;
}

export function buildCajaMenorContexto(args: {
  movimientoId: Id<"facturacionCajaMenorMovimientos">;
  reembolsoId?: Id<"cajasMenoresReembolsos">;
  eventoReembolsoId?: Id<"cajasMenoresReembolsoEventos">;
  faseAnterior?: string;
  faseNueva?: string;
  tipoEvento?: CajaMenorContexto["tipoEvento"];
  responsableDestino?: CajaMenorDestinatario | null;
  fasesOmitidas?: string[];
  accion?: Doc<"facturacionAprobaciones">["accion"];
}): CajaMenorContexto {
  const responsableDestino = normalizeDestinatario(args.responsableDestino);
  const tipoEvento = args.tipoEvento ?? (args.accion ? inferTipoEventoFromAccion(args.accion) : undefined);
  const intentoId = args.reembolsoId ? String(args.reembolsoId) : undefined;

  return {
    movimientoId: args.movimientoId,
    ...(args.reembolsoId ? { reembolsoId: args.reembolsoId } : {}),
    ...(args.eventoReembolsoId ? { eventoReembolsoId: args.eventoReembolsoId } : {}),
    ...(args.faseAnterior ? { faseAnterior: args.faseAnterior } : {}),
    ...(args.faseNueva ? { faseNueva: args.faseNueva } : {}),
    ...(tipoEvento ? { tipoEvento } : {}),
    ...(responsableDestino ? { responsableDestino } : {}),
    ...(args.fasesOmitidas?.length ? { fasesOmitidas: args.fasesOmitidas } : {}),
    ...(intentoId ? { intentoId } : {}),
  };
}

export function destinatarioFromReembolsoEstado(
  reembolso: Doc<"cajasMenoresReembolsos">,
  estado: string
): CajaMenorDestinatario | undefined {
  switch (estado) {
    case "pendiente_aprobacion_lider":
      if (!reembolso.liderAprobadorNombre) return undefined;
      return {
        usuarioId: reembolso.liderAprobadorUserId,
        nombre: reembolso.liderAprobadorNombre,
        email: reembolso.liderAprobadorEmail,
        tipo: "lider",
      };
    case "pendiente_revision":
      if (!reembolso.reviewAssignedNombre) return undefined;
      return {
        usuarioId: reembolso.reviewAssignedUserId,
        nombre: reembolso.reviewAssignedNombre,
        email: reembolso.reviewAssignedEmail,
        tipo: "revisor",
      };
    case "pendiente_revision_impuestos":
      if (!reembolso.contadorAsignadoNombre) return undefined;
      return {
        usuarioId: reembolso.contadorAsignadoUserId,
        nombre: reembolso.contadorAsignadoNombre,
        email: reembolso.contadorAsignadoEmail,
        tipo: "contabilidad",
      };
    case "pendiente_eventos_dian":
      if (!reembolso.eventosDianAsignadoNombre) return undefined;
      return {
        usuarioId: reembolso.eventosDianAsignadoUserId,
        nombre: reembolso.eventosDianAsignadoNombre,
        email: reembolso.eventosDianAsignadoEmail,
        tipo: "eventos_dian",
      };
    case "pendiente_aprobacion":
      if (reembolso.gfAprobadorNombre) {
        return {
          usuarioId: reembolso.gfAprobadorUserId,
          nombre: reembolso.gfAprobadorNombre,
          email: reembolso.gfAprobadorEmail,
          tipo: "gerencia_financiera",
        };
      }
      return { nombre: "Gerencia Financiera", tipo: "gerencia_financiera" };
    case "pendiente_pago_tesoreria":
    case "aprobado_pendiente_recibo":
      if (reembolso.tesoreroNombre) {
        return {
          usuarioId: reembolso.tesoreroUserId,
          nombre: reembolso.tesoreroNombre,
          email: reembolso.tesoreroEmail,
          tipo: "tesoreria",
        };
      }
      return { nombre: "Tesorería", tipo: "tesoreria" };
    default:
      return undefined;
  }
}
