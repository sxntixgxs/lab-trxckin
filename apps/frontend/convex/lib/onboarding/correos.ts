import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { getInscripcion, type InscripcionRef } from "./refs";

export type CorreoEstado = Doc<"onboardingCorreos">["estado"];
export type CorreoHandoff = Doc<"onboardingCorreos">["handoff"];
export type CorreoOrigen = Doc<"onboardingCorreos">["origen"];
export type CorreoResumen = NonNullable<Doc<"onboardingProveedores">["correoResumen"]>;
export type CorreoResumenItem = NonNullable<CorreoResumen["form"]>;

export const ESTADO_RANK: Record<CorreoEstado, number> = {
  PENDIENTE: 0,
  ENVIADO: 1,
  DEMORADO: 2,
  ENTREGADO: 3,
  FALLIDO: 4,
};

/** Tipos de notificación que viajan por el canal rastreado (hand-offs al tercero). */
export const TIPOS_RASTREADOS: Record<CorreoHandoff, string> = {
  FORM: "FASE_I_COMPLETADA",
  SIGN: "PENDIENTE_FIRMA",
};

export function cleanOptionalText(value: string | undefined, maxLen: number): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLen);
}

export function resumenKey(handoff: CorreoHandoff): "form" | "sign" {
  return handoff === "FORM" ? "form" : "sign";
}

export function mapWebhookEventToEstado(tipoEvento: string): CorreoEstado | null {
  switch (tipoEvento) {
    case "email.sent":
      return "ENVIADO";
    case "email.delivered":
      return "ENTREGADO";
    case "email.delivery_delayed":
      return "DEMORADO";
    case "email.failed":
    case "email.bounced":
    case "email.suppressed":
      return "FALLIDO";
    default:
      return null;
  }
}

/** Transición monótona: FALLIDO siempre gana; eventos más antiguos no degradan. */
export function shouldApplyEstadoTransition(
  current: CorreoEstado,
  next: CorreoEstado,
  eventoProveedorEn: number,
  ultimoEventoProveedorEn: number | undefined,
): boolean {
  if (next === "FALLIDO") return true;
  const currentRank = ESTADO_RANK[current];
  const nextRank = ESTADO_RANK[next];
  if (nextRank > currentRank) return true;
  if (nextRank < currentRank) return false;
  if (ultimoEventoProveedorEn === undefined) return true;
  return eventoProveedorEn >= ultimoEventoProveedorEn;
}

export function buildResumenItem(correo: Doc<"onboardingCorreos">): CorreoResumenItem {
  return {
    correoId: correo._id,
    estado: correo.estado,
    email: correo.destinatarioEmail,
    numeroIntento: correo.numeroIntento,
    actualizadoEn: correo.actualizadoEn,
    falloResumen: correo.detalleFallo ?? correo.codigoFallo,
  };
}

function refDeCorreo(correo: Doc<"onboardingCorreos">): InscripcionRef {
  return correo.modulo === "supplier"
    ? { modulo: "supplier", inscripcionId: correo.inscripcionId }
    : { modulo: "customer", inscripcionId: correo.inscripcionId };
}

async function patchResumen(ctx: MutationCtx, correo: Doc<"onboardingCorreos">, resumen: CorreoResumen) {
  if (correo.modulo === "supplier") {
    await ctx.db.patch("onboardingProveedores", correo.inscripcionId, { correoResumen: resumen });
  } else {
    await ctx.db.patch("onboardingClientes", correo.inscripcionId, { correoResumen: resumen });
  }
}

/** Un intento nuevo siempre pasa a ser el resumen visible de su hand-off. */
export async function setResumen(ctx: MutationCtx, correo: Doc<"onboardingCorreos">): Promise<void> {
  const ins = await getInscripcion(ctx, refDeCorreo(correo));
  if (!ins) return;
  await patchResumen(ctx, correo, { ...(ins.correoResumen ?? {}), [resumenKey(correo.handoff)]: buildResumenItem(correo) });
}

/** Actualiza el resumen solo si este correo sigue siendo el intento visible. */
export async function updateResumenIfCurrent(ctx: MutationCtx, correo: Doc<"onboardingCorreos">): Promise<void> {
  const ins = await getInscripcion(ctx, refDeCorreo(correo));
  if (!ins) return;
  const key = resumenKey(correo.handoff);
  const current = ins.correoResumen?.[key];
  if (current && current.correoId !== correo._id) return;
  await patchResumen(ctx, correo, { ...(ins.correoResumen ?? {}), [key]: buildResumenItem(correo) });
}

export type InsertIntentoArgs = InscripcionRef & {
  handoff: CorreoHandoff;
  tipoNotificacion: string;
  origen: CorreoOrigen;
  destinatarioNombre: string;
  destinatarioEmail: string;
  solicitadoPorUserId?: string;
};

/** Registra un intento PENDIENTE (el número de intento sale del resumen denormalizado). */
export async function insertIntento(
  ctx: MutationCtx,
  args: InsertIntentoArgs,
): Promise<{ correoId: Id<"onboardingCorreos">; numeroIntento: number }> {
  const email = args.destinatarioEmail.trim().toLowerCase();
  if (!email.includes("@")) throw new Error("Correo destinatario inválido.");

  const ins = await getInscripcion(ctx, args);
  if (!ins) throw new Error("Inscripción no encontrada.");
  const previo = ins.correoResumen?.[resumenKey(args.handoff)]?.numeroIntento ?? 0;
  const numeroIntento = previo + 1;
  const now = Date.now();
  const common = {
    handoff: args.handoff,
    tipoNotificacion: args.tipoNotificacion,
    origen: args.origen,
    destinatarioNombre: args.destinatarioNombre.trim() || email,
    destinatarioEmail: email,
    numeroIntento,
    estado: "PENDIENTE" as const,
    solicitadoPorUserId: args.solicitadoPorUserId,
    creadoEn: now,
    actualizadoEn: now,
  };
  const correoId =
    args.modulo === "supplier"
      ? await ctx.db.insert("onboardingCorreos", { modulo: "supplier", inscripcionId: args.inscripcionId, ...common })
      : await ctx.db.insert("onboardingCorreos", { modulo: "customer", inscripcionId: args.inscripcionId, ...common });
  const correo = await ctx.db.get("onboardingCorreos", correoId);
  if (correo) await setResumen(ctx, correo);
  return { correoId, numeroIntento };
}

/** Inserta el intento y programa el envío rastreado (token + POST a Next). */
export async function programarCorreoRastreado(
  ctx: MutationCtx,
  args: InsertIntentoArgs,
): Promise<{ correoId: Id<"onboardingCorreos">; numeroIntento: number }> {
  const result = await insertIntento(ctx, args);
  await ctx.scheduler.runAfter(0, internal.onboarding.notificaciones.enviarCorreoRastreado, {
    correoId: result.correoId,
  });
  return result;
}

export async function marcarFallo(
  ctx: MutationCtx,
  correoId: Id<"onboardingCorreos">,
  error: string,
  codigoFallo = "delivery_http_error",
): Promise<void> {
  const correo = await ctx.db.get("onboardingCorreos", correoId);
  if (!correo || correo.estado === "ENTREGADO") return;
  const now = Date.now();
  await ctx.db.patch("onboardingCorreos", correoId, {
    estado: "FALLIDO",
    codigoFallo,
    detalleFallo: cleanOptionalText(error, 1_000),
    fallidoEn: now,
    actualizadoEn: now,
  });
  const updated = await ctx.db.get("onboardingCorreos", correoId);
  if (updated) await updateResumenIfCurrent(ctx, updated);
}
