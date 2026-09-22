import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { getValorContableAnticipo } from "./valorContable";
import { getValorLegalizableAnticipo } from "./valorLegalizableAnticipo";
import { normalizeEmail } from "./normalize";

export const ANTICIPO_NOTIFICATION_EVENTS = [
  "I_SOLICITUD",
  "II_APROBACION_JEFE_DIRECTO",
  "III_REVISION_CONTABILIDAD",
  "IV_APROBACION_GERENCIA",
  "IV_DESEMBOLSO_TESORERIA",
  "V_PENDIENTE_LEGALIZACION",
  "VI_LEGALIZADO",
  "DEVUELTO",
  "RECHAZADO",
  "ANULADO",
  "AJUSTE_APLICADO",
  "AJUSTE_REVERSADO",
] as const;

export type AnticipoNotificationEvent = (typeof ANTICIPO_NOTIFICATION_EVENTS)[number];

export type AnticipoNotificationRecipient = {
  usuarioId?: string;
  nombre: string;
  email?: string;
};

type AnticipoRole = "GERENCIA" | "TESORERO" | "CONTABILIDAD";

function buildRecipient(args: {
  usuarioId?: string;
  nombre?: string;
  email?: string;
}): AnticipoNotificationRecipient | null {
  const email = normalizeEmail(args.email);
  const usuarioId = args.usuarioId?.trim();
  if ((!email || !email.includes("@")) && !usuarioId) return null;

  return {
    ...(usuarioId ? { usuarioId } : {}),
    nombre: args.nombre?.trim() || "Usuario",
    ...(email && email.includes("@") ? { email } : {}),
  };
}

export function dedupeAnticipoNotificationRecipients(
  recipients: Array<AnticipoNotificationRecipient | null | undefined>
) {
  const seen = new Set<string>();
  const result: AnticipoNotificationRecipient[] = [];

  for (const recipient of recipients) {
    if (!recipient) continue;
    const email = normalizeEmail(recipient.email);
    const usuarioId = recipient.usuarioId?.trim();
    const key = email || (usuarioId ? `id:${usuarioId}` : "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push({
      ...recipient,
      ...(usuarioId ? { usuarioId } : {}),
      ...(email ? { email } : {}),
    });
  }

  return result;
}

export function getAnticipoRequesterRecipient(anticipo: Doc<"anticipos">) {
  const requesterIsResponsible = anticipo.createdById === anticipo.responsableUserId;
  return buildRecipient({
    usuarioId: anticipo.createdById,
    nombre:
      anticipo.solicitanteNombre ??
      (requesterIsResponsible ? anticipo.responsableNombre : undefined),
    email:
      anticipo.solicitanteEmail ?? (requesterIsResponsible ? anticipo.responsableEmail : undefined),
  });
}

export function getAnticipoSelectedApproverRecipient(anticipo: Doc<"anticipos">) {
  return buildRecipient({
    usuarioId: anticipo.responsableUserId,
    nombre: anticipo.responsableNombre,
    email: anticipo.responsableEmail,
  });
}

export function getAnticipoStakeholderRecipients(anticipo: Doc<"anticipos">) {
  return dedupeAnticipoNotificationRecipients([
    getAnticipoRequesterRecipient(anticipo),
    getAnticipoSelectedApproverRecipient(anticipo),
  ]);
}

async function getRoleConfig(ctx: MutationCtx, empresa: number | undefined, rol: AnticipoRole) {
  if (empresa !== undefined) {
    const scoped = await ctx.db
      .query("anticiposRolesConfig")
      .withIndex("by_empresa_rol", (q) => q.eq("empresa", empresa).eq("rol", rol))
      .first();
    if (scoped) return scoped;
  }

  return await ctx.db
    .query("anticiposRolesConfig")
    .withIndex("by_empresa_rol", (q) => q.eq("empresa", undefined).eq("rol", rol))
    .first();
}

async function getRoleRecipients(ctx: MutationCtx, anticipo: Doc<"anticipos">, rol: AnticipoRole) {
  const config = await getRoleConfig(ctx, anticipo.empresa_id ?? anticipo.empresa, rol);
  if (!config) return [];

  const configured =
    rol === "CONTABILIDAD" && config.usuarios?.length
      ? config.usuarios.map((usuario) =>
          buildRecipient({
            usuarioId: usuario.userId,
            nombre: usuario.nombre,
            email: usuario.email,
          })
        )
      : [
          buildRecipient({
            usuarioId: config.userId,
            nombre: config.nombre,
            email: config.email,
          }),
        ];

  return dedupeAnticipoNotificationRecipients(configured);
}

export async function getAnticipoPhaseRecipients(
  ctx: MutationCtx,
  anticipo: Doc<"anticipos">,
  phase: AnticipoNotificationEvent
) {
  if (phase === "I_SOLICITUD") {
    return dedupeAnticipoNotificationRecipients([getAnticipoRequesterRecipient(anticipo)]);
  }
  if (phase === "II_APROBACION_JEFE_DIRECTO") {
    return dedupeAnticipoNotificationRecipients([getAnticipoSelectedApproverRecipient(anticipo)]);
  }
  if (phase === "III_REVISION_CONTABILIDAD") {
    return await getRoleRecipients(ctx, anticipo, "CONTABILIDAD");
  }
  if (phase === "IV_APROBACION_GERENCIA") {
    return await getRoleRecipients(ctx, anticipo, "GERENCIA");
  }
  if (phase === "IV_DESEMBOLSO_TESORERIA") {
    return await getRoleRecipients(ctx, anticipo, "TESORERO");
  }
  if (phase === "V_PENDIENTE_LEGALIZACION" || phase === "VI_LEGALIZADO") {
    return getAnticipoStakeholderRecipients(anticipo);
  }
  return getAnticipoStakeholderRecipients(anticipo);
}

export async function scheduleAnticipoNotification(
  ctx: MutationCtx,
  args: {
    anticipo: Doc<"anticipos">;
    evento: AnticipoNotificationEvent;
    destinatarios: AnticipoNotificationRecipient[];
    comentario?: string;
    faseDestino?: string;
  }
) {
  const destinatarios = dedupeAnticipoNotificationRecipients(args.destinatarios);
  if (destinatarios.length === 0) return false;

  const valor = getValorContableAnticipo(args.anticipo);
  const valorLegalizable = getValorLegalizableAnticipo(args.anticipo);
  const saldoLegalizado = Math.max(0, args.anticipo.saldoLegalizado ?? 0);

  await ctx.scheduler.runAfter(0, internal.notificacionesAnticipos.enviarNotificacionAnticipo, {
    destinatarios,
    evento: args.evento,
    anticipoId: String(args.anticipo._id),
    consecutivo: args.anticipo.consecutivo,
    empresa: args.anticipo.empresa_id ?? args.anticipo.empresa,
    razonSocial: args.anticipo.razonSocial,
    nit: args.anticipo.nit,
    valor,
    valorLegalizable,
    saldoPendiente: Math.max(0, valorLegalizable - saldoLegalizado),
    maxLegalizacionDate: args.anticipo.maxLegalizacionDate,
    faseActual: args.anticipo.faseActual,
    ...(args.comentario?.trim() ? { comentario: args.comentario.trim() } : {}),
    ...(args.faseDestino ? { faseDestino: args.faseDestino } : {}),
  });

  return true;
}

export async function scheduleAnticipoPhaseNotification(
  ctx: MutationCtx,
  anticipo: Doc<"anticipos">,
  phase: Extract<
    AnticipoNotificationEvent,
    | "I_SOLICITUD"
    | "II_APROBACION_JEFE_DIRECTO"
    | "III_REVISION_CONTABILIDAD"
    | "IV_APROBACION_GERENCIA"
    | "IV_DESEMBOLSO_TESORERIA"
    | "V_PENDIENTE_LEGALIZACION"
    | "VI_LEGALIZADO"
  >,
  comentario?: string
) {
  return await scheduleAnticipoNotification(ctx, {
    anticipo,
    evento: phase,
    destinatarios: await getAnticipoPhaseRecipients(ctx, anticipo, phase),
    comentario,
  });
}
