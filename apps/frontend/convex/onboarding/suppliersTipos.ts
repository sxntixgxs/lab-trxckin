import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { requireAdminModulo, requirePuedeCrear, resolveOnboardingAccess } from "../lib/onboarding/access";
import { revisorRolValidator } from "./validators";

const extraDocValidator = v.object({
  docKey: v.string(),
  docLabel: v.string(),
  revisorRol: revisorRolValidator,
});

function slugifyKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .trim()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export const obtenerTiposProveedor = query({
  args: { empresa: v.number(), soloActivos: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    await resolveOnboardingAccess(ctx, "supplier", args.empresa);
    if (args.soloActivos) {
      return await ctx.db
        .query("onboardingProveedoresTipos")
        .withIndex("by_empresa_activo", (q) => q.eq("empresa", args.empresa).eq("activo", true))
        .take(100);
    }
    return await ctx.db
      .query("onboardingProveedoresTipos")
      .withIndex("by_empresa", (q) => q.eq("empresa", args.empresa))
      .take(100);
  },
});

export const obtenerTipoPorKey = query({
  args: { empresa: v.number(), key: v.string() },
  handler: async (ctx, args) => {
    await resolveOnboardingAccess(ctx, "supplier", args.empresa);
    return await ctx.db
      .query("onboardingProveedoresTipos")
      .withIndex("by_empresa_key", (q) => q.eq("empresa", args.empresa).eq("key", args.key))
      .first();
  },
});

/** Crea el tipo GENERAL de la empresa si no existe (se llama al abrir la configuración). */
export const inicializarTipoGeneral = mutation({
  args: { empresa: v.number() },
  returns: v.id("onboardingProveedoresTipos"),
  handler: async (ctx, args) => {
    await resolveOnboardingAccess(ctx, "supplier", args.empresa);
    const existente = await ctx.db
      .query("onboardingProveedoresTipos")
      .withIndex("by_empresa_key", (q) => q.eq("empresa", args.empresa).eq("key", "GENERAL"))
      .first();
    if (existente) return existente._id;
    return await ctx.db.insert("onboardingProveedoresTipos", {
      empresa: args.empresa,
      key: "GENERAL",
      label: "General",
      activo: true,
      extraDocs: [],
    });
  },
});

/** Los responsables (que inician procesos) pueden crear tipos; editar/eliminar es de administradores. */
export const crearTipoProveedor = mutation({
  args: {
    empresa: v.number(),
    key: v.optional(v.string()),
    label: v.string(),
    extraDocs: v.array(extraDocValidator),
  },
  returns: v.id("onboardingProveedoresTipos"),
  handler: async (ctx, args) => {
    await requirePuedeCrear(ctx, "supplier", args.empresa);
    const label = args.label.trim();
    if (!label) throw new Error("El nombre del tipo es requerido.");
    const key = slugifyKey(args.key?.trim() || label);
    if (!key) throw new Error("Clave de tipo inválida.");
    const existente = await ctx.db
      .query("onboardingProveedoresTipos")
      .withIndex("by_empresa_key", (q) => q.eq("empresa", args.empresa).eq("key", key))
      .first();
    if (existente) throw new Error(`Ya existe un tipo con la clave "${key}" para esta empresa.`);
    return await ctx.db.insert("onboardingProveedoresTipos", {
      empresa: args.empresa,
      key,
      label,
      activo: true,
      extraDocs: args.extraDocs.map((d) => ({ ...d, docKey: d.docKey.trim(), docLabel: d.docLabel.trim() })),
    });
  },
});

export const actualizarTipoProveedor = mutation({
  args: { id: v.id("onboardingProveedoresTipos"), label: v.string(), extraDocs: v.array(extraDocValidator) },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdminModulo(ctx, "supplier");
    const tipo = await ctx.db.get("onboardingProveedoresTipos", args.id);
    if (!tipo) throw new Error("Tipo no encontrado.");
    await ctx.db.patch("onboardingProveedoresTipos", args.id, {
      label: args.label.trim() || tipo.label,
      extraDocs: args.extraDocs,
    });
    return null;
  },
});

export const toggleActivoTipoProveedor = mutation({
  args: { id: v.id("onboardingProveedoresTipos") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdminModulo(ctx, "supplier");
    const tipo = await ctx.db.get("onboardingProveedoresTipos", args.id);
    if (!tipo) throw new Error("Tipo no encontrado.");
    await ctx.db.patch("onboardingProveedoresTipos", args.id, { activo: !tipo.activo });
    return null;
  },
});

export const eliminarTipoProveedor = mutation({
  args: { id: v.id("onboardingProveedoresTipos") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdminModulo(ctx, "supplier");
    const tipo = await ctx.db.get("onboardingProveedoresTipos", args.id);
    if (!tipo) throw new Error("Tipo no encontrado.");
    if (tipo.key === "GENERAL") throw new Error("El tipo General no puede eliminarse.");
    const inscripciones = await ctx.db
      .query("onboardingProveedores")
      .withIndex("by_empresa", (q) => q.eq("empresa", tipo.empresa))
      .take(2000);
    if (inscripciones.some((r) => (r.tipoProveedor ?? "GENERAL") === tipo.key)) {
      throw new Error("Este tipo está en uso por inscripciones existentes y no puede eliminarse.");
    }
    await ctx.db.delete("onboardingProveedoresTipos", args.id);
    return null;
  },
});
