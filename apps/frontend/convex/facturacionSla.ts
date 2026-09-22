import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import {
  type ActionCtx,
  env,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { backgroundJobsHabilitados } from "./lib/backgroundJobs";
import {
  addBusinessDaysBogota,
  computeSlaState,
  isSlaPhase,
  localBogotaDateString,
  SLA_PHASE_LABELS,
  SLA_SUPPORTED_PHASES,
  type SlaPhase,
  shouldRunDigestToday,
} from "./lib/facturacionBusinessTime";
import { refrescarProyeccionFactura } from "./lib/facturacionDashboardProjection";
import { normalizeOwnerEmail } from "./lib/facturacionOwnership";
import { frontendUrl } from "./lib/env";
import { requireServerSecret } from "./lib/auth";

const DIGEST_ITEMS_PER_EMAIL = 250;

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function chunkDigestItems<T>(items: T[]): T[][] {
  const chunks: T[][] = [];
  for (let start = 0; start < items.length; start += DIGEST_ITEMS_PER_EMAIL) {
    chunks.push(items.slice(start, start + DIGEST_ITEMS_PER_EMAIL));
  }
  return chunks;
}

async function firmarDigest(body: string, timestamp: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${body}`)
  );
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join(
    ""
  );
}

const faseValidator = v.union(
  v.literal("recepcion"),
  v.literal("revision_lider"),
  v.literal("causacion"),
  v.literal("revision_impuestos"),
  v.literal("eventos_dian"),
  v.literal("pendiente_rechazar_dian"),
  v.literal("gerencia"),
  v.literal("revision_tesoreria")
);

const slaPhaseRowValidator = v.object({
  fase: faseValidator,
  label: v.string(),
  umbralDiasLaborales: v.union(v.number(), v.null()),
  habilitado: v.boolean(),
  actualizadoEn: v.union(v.number(), v.null()),
  actualizadoPorNombre: v.union(v.string(), v.null()),
  actualizadoPorEmail: v.union(v.string(), v.null()),
});

export const getSlaConfig = query({
  args: {
    secret: v.string(),
    empresa: v.number(),
  },
  returns: v.object({
    fases: v.array(slaPhaseRowValidator),
    oversightEmails: v.array(
      v.object({
        email: v.string(),
        nombre: v.union(v.string(), v.null()),
      })
    ),
    emailsHabilitados: v.boolean(),
    warningRule: v.literal("Warning at 80% of threshold; email only after 100% breach."),
    preview: v.object({
      ejemploInicioMs: v.number(),
      umbralEjemplo: v.number(),
      alertaEn: v.number(),
      venceEn: v.number(),
    }),
  }),
  handler: async (ctx, args) => {
    requireServerSecret(args.secret);
    const rows = ctx.db
      .query("facturacionSlaConfiguracion")
      .withIndex("by_empresa_fase", (q) => q.eq("empresa", args.empresa));
    const byFase = new Map<string, Doc<"facturacionSlaConfiguracion">>();
    for await (const row of rows) byFase.set(row.fase, row);

    const fases = SLA_SUPPORTED_PHASES.map((fase) => {
      const row = byFase.get(fase);
      return {
        fase,
        label: SLA_PHASE_LABELS[fase],
        umbralDiasLaborales: row?.umbralDiasLaborales ?? null,
        habilitado: row?.habilitado ?? false,
        actualizadoEn: row?.actualizadoEn ?? null,
        actualizadoPorNombre: row?.actualizadoPorNombre ?? null,
        actualizadoPorEmail: row?.actualizadoPorEmail ?? null,
      };
    });

    const empresaConfig = await ctx.db
      .query("facturacionSlaEmpresaConfig")
      .withIndex("by_empresa", (q) => q.eq("empresa", args.empresa))
      .unique();

    const umbralEjemplo = 5;
    const ejemploInicioMs = Date.now() - 2 * 86_400_000;
    const preview = {
      ejemploInicioMs,
      umbralEjemplo,
      alertaEn: addBusinessDaysBogota(ejemploInicioMs, umbralEjemplo * 0.8),
      venceEn: addBusinessDaysBogota(ejemploInicioMs, umbralEjemplo),
    };

    return {
      fases,
      oversightEmails: (empresaConfig?.oversightEmails ?? []).map((e) => ({
        email: e.email,
        nombre: e.nombre ?? null,
      })),
      emailsHabilitados: empresaConfig?.emailsHabilitados ?? false,
      warningRule: "Warning at 80% of threshold; email only after 100% breach." as const,
      preview,
    };
  },
});

export const putSlaConfig = mutation({
  args: {
    secret: v.string(),
    empresa: v.number(),
    fases: v.array(
      v.object({
        fase: faseValidator,
        umbralDiasLaborales: v.optional(v.number()),
        habilitado: v.boolean(),
      })
    ),
    oversightEmails: v.array(
      v.object({
        email: v.string(),
        nombre: v.optional(v.string()),
      })
    ),
    emailsHabilitados: v.optional(v.boolean()),
    actorUserId: v.optional(v.string()),
    actorNombre: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireServerSecret(args.secret);
    const now = Date.now();

    const fasesARecalcular: SlaPhase[] = [];
    for (const fase of args.fases) {
      if (!isSlaPhase(fase.fase)) continue;
      if (
        fase.umbralDiasLaborales != null &&
        (!Number.isInteger(fase.umbralDiasLaborales) || fase.umbralDiasLaborales <= 0)
      ) {
        throw new Error(
          `Umbral SLA inválido para ${fase.fase}: debe ser un entero positivo de días laborales.`
        );
      }

      const existing = await ctx.db
        .query("facturacionSlaConfiguracion")
        .withIndex("by_empresa_fase", (q) => q.eq("empresa", args.empresa).eq("fase", fase.fase))
        .unique();

      const patch = {
        umbralDiasLaborales: fase.umbralDiasLaborales,
        habilitado: fase.habilitado,
        actualizadoEn: now,
        actualizadoPorUserId: args.actorUserId,
        actualizadoPorNombre: args.actorNombre,
        actualizadoPorEmail: args.actorEmail ? normalizeOwnerEmail(args.actorEmail) : undefined,
      };

      if (existing) {
        await ctx.db.patch("facturacionSlaConfiguracion", existing._id, patch);
      } else {
        await ctx.db.insert("facturacionSlaConfiguracion", {
          empresa: args.empresa,
          fase: fase.fase,
          ...patch,
        });
      }

      fasesARecalcular.push(fase.fase);
    }

    const empresaConfig = await ctx.db
      .query("facturacionSlaEmpresaConfig")
      .withIndex("by_empresa", (q) => q.eq("empresa", args.empresa))
      .unique();

    const oversightByEmail = new Map<string, { email: string; nombre?: string }>();
    for (const recipient of args.oversightEmails) {
      const email = normalizeOwnerEmail(recipient.email);
      if (!isValidEmail(email))
        throw new Error(`Correo de supervisión inválido: ${recipient.email}`);
      oversightByEmail.set(email, {
        email,
        ...(recipient.nombre?.trim() ? { nombre: recipient.nombre.trim() } : {}),
      });
    }
    const oversight = [...oversightByEmail.values()];

    if (empresaConfig) {
      await ctx.db.patch("facturacionSlaEmpresaConfig", empresaConfig._id, {
        oversightEmails: oversight,
        emailsHabilitados: args.emailsHabilitados ?? empresaConfig.emailsHabilitados,
        actualizadoEn: now,
        actualizadoPorUserId: args.actorUserId,
        actualizadoPorNombre: args.actorNombre,
        actualizadoPorEmail: args.actorEmail ? normalizeOwnerEmail(args.actorEmail) : undefined,
      });
    } else {
      await ctx.db.insert("facturacionSlaEmpresaConfig", {
        empresa: args.empresa,
        oversightEmails: oversight,
        emailsHabilitados: args.emailsHabilitados ?? false,
        actualizadoEn: now,
        actualizadoPorUserId: args.actorUserId,
        actualizadoPorNombre: args.actorNombre,
        actualizadoPorEmail: args.actorEmail ? normalizeOwnerEmail(args.actorEmail) : undefined,
      });
    }

    for (const fase of new Set(fasesARecalcular)) {
      await ctx.scheduler.runAfter(0, internal.facturacionSla.recalcularSlaLote, {
        empresa: args.empresa,
        fase,
      });
    }

    return null;
  },
});

/** Recomputes one company/phase in bounded transactions after an SLA edit. */
export const recalcularSlaLote = internalMutation({
  args: {
    empresa: v.number(),
    fase: faseValidator,
    cursor: v.optional(v.string()),
    nowMs: v.optional(v.number()),
  },
  returns: v.object({ processed: v.number(), isDone: v.boolean() }),
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("facturacionDashboardItems")
      .withIndex("by_empresa_esActiva_faseActual", (q) =>
        q.eq("empresa", args.empresa).eq("esActiva", true).eq("faseActual", args.fase)
      )
      .paginate({ numItems: 50, cursor: args.cursor ?? null });
    const now = args.nowMs ?? Date.now();
    for (const item of page.page) {
      await refrescarProyeccionFactura(ctx, item.facturaId, now);
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.facturacionSla.recalcularSlaLote, {
        empresa: args.empresa,
        fase: args.fase,
        cursor: page.continueCursor,
        nowMs: now,
      });
    }
    return { processed: page.page.length, isDone: page.isDone };
  },
});

export const listEmpresasConEmails = internalQuery({
  args: {},
  returns: v.array(
    v.object({
      empresa: v.number(),
      oversightEmails: v.array(v.object({ email: v.string(), nombre: v.optional(v.string()) })),
    })
  ),
  handler: async (ctx) => {
    const result: Array<{
      empresa: number;
      oversightEmails: Array<{ email: string; nombre?: string }>;
    }> = [];
    for await (const config of ctx.db.query("facturacionSlaEmpresaConfig")) {
      if (!config.emailsHabilitados) continue;
      result.push({ empresa: config.empresa, oversightEmails: config.oversightEmails });
    }
    return result;
  },
});

export const collectDigestPayload = internalQuery({
  args: {
    empresa: v.number(),
    nowMs: v.optional(v.number()),
  },
  returns: v.object({
    byRecipient: v.array(
      v.object({
        email: v.string(),
        userId: v.union(v.string(), v.null()),
        nombre: v.union(v.string(), v.null()),
        items: v.array(
          v.object({
            facturaId: v.id("facturacionFacturas"),
            numeroFactura: v.string(),
            proveedorNombre: v.string(),
            fase: v.string(),
            phaseAgeMs: v.number(),
            assignmentAgeMs: v.number(),
            slaOverageMs: v.union(v.number(), v.null()),
            slaEstado: v.string(),
          })
        ),
      })
    ),
    ownerless: v.array(
      v.object({
        facturaId: v.id("facturacionFacturas"),
        numeroFactura: v.string(),
        proveedorNombre: v.string(),
        fase: v.string(),
        phaseAgeMs: v.number(),
        slaOverageMs: v.union(v.number(), v.null()),
        slaEstado: v.string(),
      })
    ),
  }),
  handler: async (ctx, args) => {
    const now = args.nowMs ?? Date.now();
    const breached = ctx.db
      .query("facturacionDashboardItems")
      .withIndex("by_empresa_esActiva_slaEstado", (q) =>
        q.eq("empresa", args.empresa).eq("esActiva", true).eq("slaEstado", "breached")
      );
    const byRecipient = new Map<
      string,
      {
        email: string;
        userId: string | null;
        nombre: string | null;
        items: Array<{
          facturaId: Doc<"facturacionDashboardItems">["facturaId"];
          numeroFactura: string;
          proveedorNombre: string;
          fase: string;
          phaseAgeMs: number;
          assignmentAgeMs: number;
          slaOverageMs: number | null;
          slaEstado: string;
        }>;
      }
    >();
    const ownerless: Array<{
      facturaId: Doc<"facturacionDashboardItems">["facturaId"];
      numeroFactura: string;
      proveedorNombre: string;
      fase: string;
      phaseAgeMs: number;
      slaOverageMs: number | null;
      slaEstado: string;
    }> = [];

    for await (const item of breached) {
      if (!item.incluyeEnTotales) continue;
      const overage = item.slaVenceEn != null ? Math.max(0, now - item.slaVenceEn) : null;
      const owners: Doc<"facturacionDashboardResponsables">[] = [];
      for await (const owner of ctx.db
        .query("facturacionDashboardResponsables")
        .withIndex("by_facturaId", (q) => q.eq("facturaId", item.facturaId))) {
        owners.push(owner);
      }
      const activeOwners = owners.filter((o) => o.esActiva);

      if (activeOwners.length === 0) {
        ownerless.push({
          facturaId: item.facturaId,
          numeroFactura: item.numeroFactura,
          proveedorNombre: item.proveedorNombre,
          fase: item.faseActual,
          phaseAgeMs: item.sortFaseAgeMs,
          slaOverageMs: overage,
          slaEstado: item.slaEstado,
        });
        continue;
      }

      for (const owner of activeOwners) {
        const email = normalizeOwnerEmail(owner.email);
        let bucket = byRecipient.get(email);
        if (!bucket) {
          bucket = {
            email,
            userId: owner.userId ?? null,
            nombre: owner.nombre,
            items: [],
          };
          byRecipient.set(email, bucket);
        }
        bucket.items.push({
          facturaId: item.facturaId,
          numeroFactura: item.numeroFactura,
          proveedorNombre: item.proveedorNombre,
          fase: item.faseActual,
          phaseAgeMs: item.sortFaseAgeMs,
          assignmentAgeMs: Math.max(0, now - owner.fechaAsignacion),
          slaOverageMs: overage,
          slaEstado: item.slaEstado,
        });
      }
    }

    return {
      byRecipient: [...byRecipient.values()],
      ownerless,
    };
  },
});

export const claimDigestSlot = internalMutation({
  args: {
    fechaLocal: v.string(),
    empresa: v.number(),
    recipientEmail: v.string(),
    recipientUserId: v.optional(v.string()),
    recipientNombre: v.optional(v.string()),
    lote: v.number(),
    facturaIds: v.array(v.id("facturacionFacturas")),
    dryRun: v.boolean(),
  },
  returns: v.union(
    v.object({ action: v.literal("skip"), reason: v.string() }),
    v.object({
      action: v.literal("send"),
      logId: v.id("facturacionSlaDigestLog"),
    })
  ),
  handler: async (ctx, args) => {
    const email = normalizeOwnerEmail(args.recipientEmail);
    const existing = await ctx.db
      .query("facturacionSlaDigestLog")
      .withIndex("by_fecha_empresa_recipient_lote", (q) =>
        q
          .eq("fechaLocal", args.fechaLocal)
          .eq("empresa", args.empresa)
          .eq("recipientEmail", email)
          .eq("lote", args.lote)
      )
      .unique();

    if (existing?.estado === "sent" || existing?.estado === "dry_run") {
      return { action: "skip" as const, reason: "already_sent" };
    }

    const now = Date.now();
    if (existing) {
      await ctx.db.patch("facturacionSlaDigestLog", existing._id, {
        estado: "pending",
        intento: existing.intento + 1,
        facturaIds: args.facturaIds,
        dryRun: args.dryRun,
        actualizadoEn: now,
        error: undefined,
      });
      return { action: "send" as const, logId: existing._id };
    }

    const logId = await ctx.db.insert("facturacionSlaDigestLog", {
      fechaLocal: args.fechaLocal,
      empresa: args.empresa,
      recipientEmail: email,
      recipientUserId: args.recipientUserId,
      recipientNombre: args.recipientNombre,
      lote: args.lote,
      estado: "pending",
      intento: 1,
      facturaIds: args.facturaIds,
      dryRun: args.dryRun,
      creadoEn: now,
      actualizadoEn: now,
    });
    return { action: "send" as const, logId };
  },
});

export const markDigestResult = internalMutation({
  args: {
    logId: v.id("facturacionSlaDigestLog"),
    ok: v.boolean(),
    error: v.optional(v.string()),
    dryRun: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch("facturacionSlaDigestLog", args.logId, {
      estado: args.ok ? (args.dryRun ? "dry_run" : "sent") : "failed",
      error: args.error,
      enviadoEn: args.ok ? now : undefined,
      actualizadoEn: now,
    });
    return null;
  },
});

async function ejecutarDigest(ctx: ActionCtx, args: { dryRun?: boolean; nowMs?: number }) {
  if (!backgroundJobsHabilitados()) {
    return { skipped: true, reason: "background_jobs_disabled", sent: 0, failed: 0 };
  }

  const now = args.nowMs ?? Date.now();
  if (!shouldRunDigestToday(now)) {
    return { skipped: true, reason: "non_business_day", sent: 0, failed: 0 };
  }

  const dryRun = args.dryRun ?? env.FACTURACION_SLA_DIGEST_DRY_RUN === "true";
  const fechaLocal = localBogotaDateString(now);
  const empresas = await ctx.runQuery(internal.facturacionSla.listEmpresasConEmails, {});

  let sent = 0;
  let failed = 0;
  const baseUrl = frontendUrl();
  const digestSecret = env.FACTURACION_SLA_DIGEST_SECRET;

  for (const empresaCfg of empresas) {
    const payload = await ctx.runQuery(internal.facturacionSla.collectDigestPayload, {
      empresa: empresaCfg.empresa,
      nowMs: now,
    });

    const recipients: Array<{
      email: string;
      userId: string | null;
      nombre: string | null;
      items: Array<{
        facturaId: (typeof payload.ownerless)[number]["facturaId"];
        numeroFactura: string;
        proveedorNombre: string;
        fase: string;
        phaseAgeMs: number;
        assignmentAgeMs: number;
        slaOverageMs: number | null;
        slaEstado: string;
      }>;
    }> = [...payload.byRecipient];
    if (payload.ownerless.length > 0) {
      for (const oversight of empresaCfg.oversightEmails) {
        recipients.push({
          email: normalizeOwnerEmail(oversight.email),
          userId: null,
          nombre: oversight.nombre ?? null,
          items: payload.ownerless.map((o: (typeof payload.ownerless)[number]) => ({
            ...o,
            assignmentAgeMs: 0,
          })),
        });
      }
    }

    for (const recipient of recipients) {
      if (recipient.items.length === 0 || !isValidEmail(recipient.email)) continue;
      for (const [lote, items] of chunkDigestItems(recipient.items).entries()) {
        const claim = await ctx.runMutation(internal.facturacionSla.claimDigestSlot, {
          fechaLocal,
          empresa: empresaCfg.empresa,
          recipientEmail: recipient.email,
          recipientUserId: recipient.userId ?? undefined,
          recipientNombre: recipient.nombre ?? undefined,
          lote,
          facturaIds: items.map((i) => i.facturaId),
          dryRun,
        });
        if (claim.action === "skip") continue;

        try {
          if (!dryRun) {
            if (!digestSecret) {
              throw new Error("FACTURACION_SLA_DIGEST_SECRET no configurado.");
            }
            const body = JSON.stringify({
              destinatario: {
                email: recipient.email,
                nombre: recipient.nombre,
                usuarioId: recipient.userId,
              },
              cc: empresaCfg.oversightEmails,
              empresa: empresaCfg.empresa,
              fechaLocal,
              items: items.map((item) => ({
                ...item,
                dashboardUrl: `${baseUrl}/billing?factura=${item.facturaId}&sla=breached`,
              })),
            });
            const timestamp = String(Date.now());
            const signature = await firmarDigest(body, timestamp, digestSecret);
            const res = await fetch(`${baseUrl}/api/notifications/billing/sla-digest`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Facturacion-Timestamp": timestamp,
                "X-Facturacion-Signature": signature,
              },
              body,
            });
            if (!res.ok) {
              throw new Error(`HTTP ${res.status}`);
            }
          }
          await ctx.runMutation(internal.facturacionSla.markDigestResult, {
            logId: claim.logId,
            ok: true,
            dryRun,
          });
          sent += 1;
        } catch (error) {
          await ctx.runMutation(internal.facturacionSla.markDigestResult, {
            logId: claim.logId,
            ok: false,
            dryRun,
            error: error instanceof Error ? error.message : "unknown",
          });
          failed += 1;
        }
      }
    }
  }

  return { skipped: false, sent, failed };
}

const digestResultValidator = v.object({
  skipped: v.boolean(),
  reason: v.optional(v.string()),
  sent: v.number(),
  failed: v.number(),
});

export const ejecutarDigestDiario = internalAction({
  args: {
    dryRun: v.optional(v.boolean()),
    nowMs: v.optional(v.number()),
  },
  returns: digestResultValidator,
  handler: ejecutarDigest,
});

/** Internal administrative trigger for validating the dry-run rollout (`npx convex run`). */
export const ejecutarDigestManual = internalAction({
  args: {
    dryRun: v.optional(v.boolean()),
    nowMs: v.optional(v.number()),
  },
  returns: digestResultValidator,
  handler: ejecutarDigest,
});

/** Preview helper for unit tests / config UI. */
export function previewSlaTimes(startMs: number, umbralDias: number, nowMs: number) {
  return computeSlaState({
    faseIniciadaEn: startMs,
    umbralDiasLaborales: umbralDias,
    nowMs,
    esActiva: true,
  });
}
