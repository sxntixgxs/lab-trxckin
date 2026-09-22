import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { internalMutation, mutation, query } from "../_generated/server";
import { requireServerSecret } from "../lib/auth";
import { puedeVerInscripcion, requireGestionInscripcion, resolveOnboardingAccess } from "../lib/onboarding/access";
import {
  cleanOptionalText,
  mapWebhookEventToEstado,
  marcarFallo,
  programarCorreoRastreado,
  shouldApplyEstadoTransition,
  TIPOS_RASTREADOS,
  updateResumenIfCurrent,
} from "../lib/onboarding/correos";
import {
  contactoFirmaDe,
  contactoFormularioDe,
  identidadDe,
  requireInscripcion,
  resolveRef,
} from "../lib/onboarding/refs";
import {
  correoEstadoValidator,
  correoResumenValidator,
  moduloValidator,
  origenCorreoValidator,
  scopeValidator,
  tipoSolicitudValidator,
} from "./validators";

const intentoValidator = v.object({
  _id: v.id("onboardingCorreos"),
  handoff: scopeValidator,
  tipoNotificacion: v.string(),
  origen: origenCorreoValidator,
  destinatarioNombre: v.string(),
  destinatarioEmail: v.string(),
  numeroIntento: v.number(),
  estado: correoEstadoValidator,
  codigoFallo: v.optional(v.string()),
  detalleFallo: v.optional(v.string()),
  creadoEn: v.number(),
  enviadoEn: v.optional(v.number()),
  entregadoEn: v.optional(v.number()),
  fallidoEn: v.optional(v.number()),
  actualizadoEn: v.number(),
});

function toIntento(row: Doc<"onboardingCorreos">) {
  return {
    _id: row._id,
    handoff: row.handoff,
    tipoNotificacion: row.tipoNotificacion,
    origen: row.origen,
    destinatarioNombre: row.destinatarioNombre,
    destinatarioEmail: row.destinatarioEmail,
    numeroIntento: row.numeroIntento,
    estado: row.estado,
    codigoFallo: row.codigoFallo,
    detalleFallo: row.detalleFallo,
    creadoEn: row.creadoEn,
    enviadoEn: row.enviadoEn,
    entregadoEn: row.entregadoEn,
    fallidoEn: row.fallidoEn,
    actualizadoEn: row.actualizadoEn,
  };
}

// ─── Servidor (Next → Convex con CONVEX_SERVER_SECRET) ───────────────────────

/** Datos para renderizar y enviar un correo rastreado. `null` si ya se entregó o falló. */
export const obtenerCorreoParaEnvio = query({
  args: { secret: v.string(), correoId: v.id("onboardingCorreos") },
  returns: v.union(
    v.object({
      correo: intentoValidator,
      inscripcion: v.object({
        _id: v.string(),
        modulo: moduloValidator,
        empresa: v.number(),
        faseActual: v.string(),
        razonSocial: v.string(),
        tipoDocumento: v.string(),
        numeroDocumento: v.string(),
        tipoSolicitud: v.optional(tipoSolicitudValidator),
      }),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    requireServerSecret(args.secret);
    const correo = await ctx.db.get("onboardingCorreos", args.correoId);
    if (!correo || correo.estado === "ENTREGADO" || correo.estado === "FALLIDO") return null;
    const ref =
      correo.modulo === "supplier"
        ? ({ modulo: "supplier", inscripcionId: correo.inscripcionId } as const)
        : ({ modulo: "customer", inscripcionId: correo.inscripcionId } as const);
    const ins = await requireInscripcion(ctx, ref);
    const identidad = identidadDe(ins);
    return {
      correo: toIntento(correo),
      inscripcion: {
        _id: ins._id,
        modulo: correo.modulo,
        empresa: ins.empresa,
        faseActual: ins.faseActual,
        ...identidad,
      },
    };
  },
});

export const registrarResultadoResendApi = mutation({
  args: {
    secret: v.string(),
    correoId: v.id("onboardingCorreos"),
    resendEmailId: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  returns: v.object({ ok: v.boolean(), estado: correoEstadoValidator, skipped: v.optional(v.boolean()) }),
  handler: async (ctx, args) => {
    requireServerSecret(args.secret);
    const correo = await ctx.db.get("onboardingCorreos", args.correoId);
    if (!correo) return { ok: false, estado: "FALLIDO" as const, skipped: true };
    if (correo.estado === "ENTREGADO") return { ok: true, estado: correo.estado, skipped: true };

    const now = Date.now();
    const error = cleanOptionalText(args.error, 1_000);
    if (error) {
      await ctx.db.patch("onboardingCorreos", args.correoId, {
        estado: "FALLIDO",
        codigoFallo: "resend_api_error",
        detalleFallo: error,
        fallidoEn: now,
        actualizadoEn: now,
      });
      const updated = await ctx.db.get("onboardingCorreos", args.correoId);
      if (updated) await updateResumenIfCurrent(ctx, updated);
      return { ok: false, estado: "FALLIDO" as const };
    }

    await ctx.db.patch("onboardingCorreos", args.correoId, {
      estado: "ENVIADO",
      resendEmailId: cleanOptionalText(args.resendEmailId, 300),
      enviadoEn: now,
      actualizadoEn: now,
      codigoFallo: undefined,
      detalleFallo: undefined,
    });
    const updated = await ctx.db.get("onboardingCorreos", args.correoId);
    if (updated) await updateResumenIfCurrent(ctx, updated);
    return { ok: true, estado: "ENVIADO" as const };
  },
});

export const aplicarEventoWebhookResend = mutation({
  args: {
    secret: v.string(),
    resendEmailId: v.string(),
    svixId: v.string(),
    tipoEvento: v.string(),
    eventoProveedorEn: v.number(),
    detalleFallo: v.optional(v.string()),
  },
  returns: v.object({ ok: v.boolean(), ignored: v.optional(v.boolean()), reason: v.optional(v.string()) }),
  handler: async (ctx, args) => {
    requireServerSecret(args.secret);

    const duplicado = await ctx.db
      .query("onboardingCorreoEventos")
      .withIndex("by_svixId", (q) => q.eq("svixId", args.svixId))
      .first();
    if (duplicado) return { ok: true, ignored: true, reason: "duplicate_svix" };

    const correo = await ctx.db
      .query("onboardingCorreos")
      .withIndex("by_resendEmailId", (q) => q.eq("resendEmailId", args.resendEmailId))
      .first();
    if (!correo) return { ok: true, ignored: true, reason: "untracked_email" };

    const now = Date.now();
    await ctx.db.insert("onboardingCorreoEventos", {
      correoId: correo._id,
      resendEmailId: args.resendEmailId,
      svixId: args.svixId,
      tipoEvento: args.tipoEvento,
      eventoProveedorEn: args.eventoProveedorEn,
      recibidoEn: now,
      detalleFallo: cleanOptionalText(args.detalleFallo, 1_000),
    });

    const nextEstado = mapWebhookEventToEstado(args.tipoEvento);
    if (!nextEstado) return { ok: true, ignored: true, reason: "unsupported_event" };
    if (!shouldApplyEstadoTransition(correo.estado, nextEstado, args.eventoProveedorEn, correo.ultimoEventoProveedorEn)) {
      return { ok: true, ignored: true, reason: "stale_event" };
    }

    const patch: Partial<Doc<"onboardingCorreos">> = {
      estado: nextEstado,
      actualizadoEn: now,
      ultimoEventoProveedorEn: args.eventoProveedorEn,
    };
    if (nextEstado === "ENVIADO" && !correo.enviadoEn) patch.enviadoEn = now;
    if (nextEstado === "ENTREGADO") patch.entregadoEn = now;
    if (nextEstado === "FALLIDO") {
      patch.fallidoEn = now;
      patch.codigoFallo = args.tipoEvento.replace("email.", "");
      patch.detalleFallo = cleanOptionalText(args.detalleFallo, 1_000);
    }
    await ctx.db.patch("onboardingCorreos", correo._id, patch);
    const updated = await ctx.db.get("onboardingCorreos", correo._id);
    if (updated) await updateResumenIfCurrent(ctx, updated);
    return { ok: true };
  },
});

export const marcarFalloCorreo = internalMutation({
  args: { correoId: v.id("onboardingCorreos"), error: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await marcarFallo(ctx, args.correoId, args.error);
    return null;
  },
});

// ─── UI interna (identidad) ──────────────────────────────────────────────────

export const obtenerCorreosPorInscripcion = query({
  args: { modulo: moduloValidator, inscripcionId: v.string(), limit: v.optional(v.number()) },
  returns: v.object({
    resumen: v.optional(correoResumenValidator),
    intentos: v.array(intentoValidator),
  }),
  handler: async (ctx, args) => {
    const ref = resolveRef(ctx, args.modulo, args.inscripcionId);
    const ins = await requireInscripcion(ctx, ref);
    const { access } = await resolveOnboardingAccess(ctx, args.modulo, ins.empresa);
    if (!puedeVerInscripcion(access, ins)) throw new Error("No autorizado.");

    const limit = Math.min(Math.max(args.limit ?? 20, 1), 50);
    const rows = await ctx.db
      .query("onboardingCorreos")
      .withIndex("by_modulo_inscripcionId_creadoEn", (q) =>
        q.eq("modulo", ref.modulo).eq("inscripcionId", ref.inscripcionId),
      )
      .order("desc")
      .take(limit);
    return { resumen: ins.correoResumen, intentos: rows.map(toIntento) };
  },
});

/**
 * Reenvía el correo de un hand-off (formulario o firma), opcionalmente corrigiendo el
 * correo canónico del destinatario. Rota el token del enlace.
 */
export const solicitarReenvio = mutation({
  args: {
    modulo: moduloValidator,
    inscripcionId: v.string(),
    handoff: scopeValidator,
    email: v.optional(v.string()),
  },
  returns: v.object({ correoId: v.id("onboardingCorreos"), numeroIntento: v.number() }),
  handler: async (ctx, args) => {
    const ref = resolveRef(ctx, args.modulo, args.inscripcionId);
    let ins = await requireInscripcion(ctx, ref);
    const actor = await requireGestionInscripcion(ctx, args.modulo, ins);

    const fasesValidas: readonly string[] =
      args.handoff === "FORM" ? ["II_PENDIENTE_FORMULARIO", "III_REVISION_DOCUMENTAL"] : ["IIA_PENDIENTE_FIRMA"];
    if (!fasesValidas.includes(ins.faseActual)) {
      throw new Error(`El proceso debe estar en ${fasesValidas.join(" o ")} para reenviar este correo.`);
    }

    const nuevoEmail = args.email?.trim().toLowerCase();
    if (nuevoEmail) {
      if (!nuevoEmail.includes("@")) throw new Error("Correo inválido.");
      const datos = { ...ins.datos_generales_01 };
      if (args.handoff === "FORM") datos.contactoEmail = nuevoEmail;
      else datos.representanteLegalEmail = nuevoEmail;
      if (ref.modulo === "supplier") {
        await ctx.db.patch("onboardingProveedores", ref.inscripcionId, {
          datos_generales_01: datos as Doc<"onboardingProveedores">["datos_generales_01"],
        });
      } else {
        await ctx.db.patch("onboardingClientes", ref.inscripcionId, {
          datos_generales_01: datos as Doc<"onboardingClientes">["datos_generales_01"],
        });
      }
      ins = await requireInscripcion(ctx, ref);
    }

    const destinatario = args.handoff === "FORM" ? contactoFormularioDe(ins) : contactoFirmaDe(ins);
    if (!destinatario) throw new Error("No hay correo destinatario configurado.");

    return await programarCorreoRastreado(ctx, {
      ...ref,
      handoff: args.handoff,
      tipoNotificacion: TIPOS_RASTREADOS[args.handoff],
      origen: "REENVIO",
      destinatarioNombre: destinatario.nombre,
      destinatarioEmail: destinatario.email,
      solicitadoPorUserId: actor.usuarioId,
    });
  },
});
