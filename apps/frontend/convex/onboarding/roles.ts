import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { mutation, query } from "../_generated/server";
import { CUSTOMER_FASES_POR_ROL } from "../../lib/onboarding/phases/customers";
import { SUPPLIER_FASES_POR_ROL } from "../../lib/onboarding/phases/suppliers";
import { ROLES_POR_MODULO } from "../../lib/onboarding/roles";
import { requireAdminModulo, resolveOnboardingAccess } from "../lib/onboarding/access";
import { rolParaFase, type OnboardingRol } from "../lib/onboarding/phases";
import type { OnboardingModulo } from "../lib/onboarding/refs";
import { moduloValidator, permisoWhitelistValidator, rolValidator } from "./validators";

const rolRowValidator = v.object({
  _id: v.id("onboardingRoles"),
  empresa: v.number(),
  rol: rolValidator,
  userId: v.string(),
  nombre: v.string(),
  email: v.string(),
});

const whitelistRowValidator = v.object({
  _id: v.id("onboardingWhitelist"),
  empresa: v.number(),
  userId: v.string(),
  nombre: v.string(),
  email: v.string(),
  permiso: permisoWhitelistValidator,
});

const nivelAccesoValidator = v.union(
  v.literal("full"),
  v.literal("consulta_creacion"),
  v.literal("solo_lectura"),
  v.literal("responsable"),
);

function toRolRow(r: Doc<"onboardingRoles">) {
  return { _id: r._id, empresa: r.empresa, rol: r.rol, userId: r.userId, nombre: r.nombre, email: r.email };
}

function assertRolDelModulo(modulo: OnboardingModulo, rol: OnboardingRol) {
  if (!ROLES_POR_MODULO[modulo].includes(rol)) {
    throw new Error(`El rol ${rol} no aplica al módulo ${modulo}.`);
  }
}

export const miAcceso = query({
  args: { modulo: moduloValidator, empresa: v.optional(v.number()) },
  returns: v.object({
    nivel: nivelAccesoValidator,
    isAdmin: v.boolean(),
    usuarioId: v.string(),
    roles: v.array(v.object({ empresa: v.number(), rol: rolValidator })),
    whitelist: v.array(v.object({ empresa: v.number(), permiso: permisoWhitelistValidator })),
    empresasVisibles: v.union(v.literal("todas"), v.array(v.number())),
  }),
  handler: async (ctx, args) => {
    const { access } = await resolveOnboardingAccess(ctx, args.modulo, args.empresa ?? null);
    return access;
  },
});

export const obtenerRolesConfig = query({
  args: { modulo: moduloValidator, empresa: v.number() },
  returns: v.array(rolRowValidator),
  handler: async (ctx, args) => {
    await resolveOnboardingAccess(ctx, args.modulo, args.empresa);
    const rows = await ctx.db
      .query("onboardingRoles")
      .withIndex("by_modulo_empresa", (q) => q.eq("modulo", args.modulo).eq("empresa", args.empresa))
      .take(20);
    return rows.map(toRolRow);
  },
});

export const obtenerRolPorTipo = query({
  args: { modulo: moduloValidator, empresa: v.number(), rol: rolValidator },
  returns: v.union(rolRowValidator, v.null()),
  handler: async (ctx, args) => {
    await resolveOnboardingAccess(ctx, args.modulo, args.empresa);
    const row = await ctx.db
      .query("onboardingRoles")
      .withIndex("by_modulo_empresa_rol", (q) =>
        q.eq("modulo", args.modulo).eq("empresa", args.empresa).eq("rol", args.rol),
      )
      .unique();
    return row ? toRolRow(row) : null;
  },
});

/**
 * Asigna (o reemplaza) el usuario de un rol para una empresa y re-sincroniza `asignadoA`
 * en las fases abiertas que atiende ese rol, para que la bandeja "Mis tareas" del nuevo
 * titular refleje el cambio de inmediato.
 */
export const configurarRol = mutation({
  args: {
    modulo: moduloValidator,
    empresa: v.number(),
    rol: rolValidator,
    userId: v.string(),
    nombre: v.string(),
    email: v.string(),
  },
  returns: v.object({ rolId: v.id("onboardingRoles"), fasesReasignadas: v.number() }),
  handler: async (ctx, args) => {
    await requireAdminModulo(ctx, args.modulo);
    assertRolDelModulo(args.modulo, args.rol);
    const userId = args.userId.trim();
    const email = args.email.trim().toLowerCase();
    if (!userId) throw new Error("Usuario requerido.");
    if (!email.includes("@")) throw new Error("Correo inválido.");

    const existing = await ctx.db
      .query("onboardingRoles")
      .withIndex("by_modulo_empresa_rol", (q) =>
        q.eq("modulo", args.modulo).eq("empresa", args.empresa).eq("rol", args.rol),
      )
      .unique();
    const data = { modulo: args.modulo, empresa: args.empresa, rol: args.rol, userId, nombre: args.nombre.trim(), email };
    const rolId = existing
      ? (await ctx.db.patch("onboardingRoles", existing._id, data), existing._id)
      : await ctx.db.insert("onboardingRoles", data);

    let fasesReasignadas = 0;
    const fases: readonly string[] =
      args.modulo === "supplier"
        ? SUPPLIER_FASES_POR_ROL[args.rol as keyof typeof SUPPLIER_FASES_POR_ROL] ?? []
        : CUSTOMER_FASES_POR_ROL[args.rol as keyof typeof CUSTOMER_FASES_POR_ROL] ?? [];

    for (const fase of fases) {
      for (const estado of ["PENDIENTE", "EN_PROGRESO"] as const) {
        if (args.modulo === "supplier") {
          const rows = await ctx.db
            .query("onboardingProveedoresFases")
            .withIndex("by_empresa_fase_estado", (q) =>
              q
                .eq("empresa", args.empresa)
                .eq("fase", fase as Doc<"onboardingProveedoresFases">["fase"])
                .eq("estado", estado),
            )
            .take(200);
          for (const row of rows) {
            const ins = await ctx.db.get("onboardingProveedores", row.inscripcionId);
            if (!ins || rolParaFase("supplier", fase, ins) !== args.rol) continue;
            if (row.asignadoA === userId) continue;
            await ctx.db.patch("onboardingProveedoresFases", row._id, { asignadoA: userId });
            fasesReasignadas += 1;
          }
        } else {
          const rows = await ctx.db
            .query("onboardingClientesFases")
            .withIndex("by_empresa_fase_estado", (q) =>
              q
                .eq("empresa", args.empresa)
                .eq("fase", fase as Doc<"onboardingClientesFases">["fase"])
                .eq("estado", estado),
            )
            .take(200);
          for (const row of rows) {
            const ins = await ctx.db.get("onboardingClientes", row.inscripcionId);
            if (!ins || rolParaFase("customer", fase, ins) !== args.rol) continue;
            if (row.asignadoA === userId) continue;
            await ctx.db.patch("onboardingClientesFases", row._id, { asignadoA: userId });
            fasesReasignadas += 1;
          }
        }
      }
    }
    return { rolId, fasesReasignadas };
  },
});

export const obtenerWhitelist = query({
  args: { modulo: moduloValidator, empresa: v.number() },
  returns: v.array(whitelistRowValidator),
  handler: async (ctx, args) => {
    await resolveOnboardingAccess(ctx, args.modulo, args.empresa);
    const rows = await ctx.db
      .query("onboardingWhitelist")
      .withIndex("by_modulo_empresa", (q) => q.eq("modulo", args.modulo).eq("empresa", args.empresa))
      .take(200);
    return rows.map((r) => ({
      _id: r._id,
      empresa: r.empresa,
      userId: r.userId,
      nombre: r.nombre,
      email: r.email,
      permiso: r.permiso,
    }));
  },
});

export const agregarWhitelist = mutation({
  args: {
    modulo: moduloValidator,
    empresa: v.number(),
    userId: v.string(),
    nombre: v.string(),
    email: v.string(),
    permiso: v.optional(permisoWhitelistValidator),
  },
  returns: v.id("onboardingWhitelist"),
  handler: async (ctx, args) => {
    await requireAdminModulo(ctx, args.modulo);
    const userId = args.userId.trim();
    if (!userId) throw new Error("Usuario requerido.");
    const data = {
      modulo: args.modulo,
      empresa: args.empresa,
      userId,
      nombre: args.nombre.trim(),
      email: args.email.trim().toLowerCase(),
      permiso: args.permiso ?? ("CONSULTA" as const),
    };
    const existing = await ctx.db
      .query("onboardingWhitelist")
      .withIndex("by_modulo_empresa_userId", (q) =>
        q.eq("modulo", args.modulo).eq("empresa", args.empresa).eq("userId", userId),
      )
      .unique();
    if (existing) {
      await ctx.db.patch("onboardingWhitelist", existing._id, data);
      return existing._id;
    }
    return await ctx.db.insert("onboardingWhitelist", data);
  },
});

export const quitarWhitelist = mutation({
  args: { modulo: moduloValidator, empresa: v.number(), userId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdminModulo(ctx, args.modulo);
    const existing = await ctx.db
      .query("onboardingWhitelist")
      .withIndex("by_modulo_empresa_userId", (q) =>
        q.eq("modulo", args.modulo).eq("empresa", args.empresa).eq("userId", args.userId.trim()),
      )
      .unique();
    if (existing) await ctx.db.delete("onboardingWhitelist", existing._id);
    return null;
  },
});
