import type { MutationCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { identidadDe, type Destinatario, type InscripcionDoc, type OnboardingModulo } from "./refs";

/** Programa una notificación por correo (no rastreada) hacia el tercero o el equipo interno. */
export async function programarNotificacion(
  ctx: MutationCtx,
  args: {
    modulo: OnboardingModulo;
    tipo: string;
    ins: InscripcionDoc;
    destinatarios: Destinatario[];
    datos?: Record<string, unknown>;
    /** El correo va al tercero y debe incluir el enlace (token) al formulario público. */
    conEnlaceTercero?: boolean;
  },
): Promise<void> {
  const destinatarios = dedupeDestinatarios(args.destinatarios);
  if (destinatarios.length === 0) return;
  await ctx.scheduler.runAfter(0, internal.onboarding.notificaciones.notificarEvento, {
    modulo: args.modulo,
    tipo: args.tipo,
    inscripcionId: args.ins._id,
    empresa: args.ins.empresa,
    tercero: identidadDe(args.ins),
    destinatarios,
    datos: args.datos ?? {},
    conEnlaceTercero: args.conEnlaceTercero === true,
  });
}

export function dedupeDestinatarios(list: Array<Destinatario | null | undefined>): Destinatario[] {
  const seen = new Set<string>();
  const out: Destinatario[] = [];
  for (const d of list) {
    const email = d?.email?.trim().toLowerCase();
    if (!email || !email.includes("@") || seen.has(email)) continue;
    seen.add(email);
    out.push({ nombre: d!.nombre?.trim() || email, email });
  }
  return out;
}
