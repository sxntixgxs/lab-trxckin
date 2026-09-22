import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { resolveCentroCostoCatalogScope } from "../lib/centro-costo-catalog-scope";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { requireActor, requirePermiso } from "./lib/billingAuth";

const PERMISO_ADMIN = "administracion/centro-costo";
const SEARCH_MIN_LENGTH = 2;
const SEARCH_MAX_RESULTS = 50;
const LIST_PAGE_CAP = 100;

const appEmpresaValidator = v.union(
  v.literal(1),
  v.literal(2),
  v.literal(3),
  v.literal(4),
);

const centroCostoPublicValidator = v.object({
  _id: v.id("centrosCosto"),
  appEmpresa: appEmpresaValidator,
  empresa: v.union(v.literal(1), v.literal(2)),
  companiaId: v.string(),
  codigo: v.string(),
  descripcion: v.string(),
  centroOperacion: v.union(v.string(), v.null()),
  responsable: v.union(v.string(), v.null()),
  activo: v.boolean(),
  siesaId: v.string(),
});

const centroCostoBusquedaValidator = v.object({
  id: v.string(),
  codigo: v.string(),
  nombre: v.string(),
  centroOperacion: v.union(v.string(), v.null()),
});

type AppEmpresa = 1 | 2 | 3 | 4;

type CentroCostoFields = {
  appEmpresa: AppEmpresa;
  empresa: 1 | 2;
  companiaId: string;
  codigo: string;
  descripcion: string;
  centroOperacion?: string;
  responsable?: string;
  activo: boolean;
  siesaId: string;
  searchText: string;
};

function normalizeCodigo(codigo: string) {
  const trimmed = codigo.trim();
  if (!trimmed || trimmed.length > 40) {
    throw new Error("El código debe tener entre 1 y 40 caracteres.");
  }
  if (trimmed.includes(":")) {
    throw new Error("El código no puede contener dos puntos.");
  }
  if (/\s/.test(trimmed)) {
    throw new Error("El código no puede contener espacios.");
  }
  return trimmed;
}

function normalizeDescripcion(descripcion: string) {
  const trimmed = descripcion.trim();
  if (!trimmed || trimmed.length > 160) {
    throw new Error("La descripción debe tener entre 1 y 160 caracteres.");
  }
  return trimmed;
}

function normalizeOptional(value: string | null | undefined, label: string) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return undefined;
  if (trimmed.length > 120) {
    throw new Error(`${label} no puede superar 120 caracteres.`);
  }
  return trimmed;
}

function scopeFor(appEmpresa: AppEmpresa) {
  const scope = resolveCentroCostoCatalogScope(appEmpresa);
  if (!scope) {
    throw new Error("La empresa no tiene un catálogo de centros de costo.");
  }
  return scope;
}

function buildFields(args: {
  appEmpresa: AppEmpresa;
  codigo: string;
  descripcion: string;
  centroOperacion?: string | null;
  responsable?: string | null;
  activo: boolean;
}): CentroCostoFields {
  const scope = scopeFor(args.appEmpresa);
  const codigo = normalizeCodigo(args.codigo);
  const descripcion = normalizeDescripcion(args.descripcion);
  const centroOperacion = normalizeOptional(args.centroOperacion, "Centro de operación");
  const responsable = normalizeOptional(args.responsable, "Responsable");

  return {
    appEmpresa: args.appEmpresa,
    empresa: scope.empresa,
    companiaId: scope.companiaId,
    codigo,
    descripcion,
    ...(centroOperacion ? { centroOperacion } : {}),
    ...(responsable ? { responsable } : {}),
    activo: args.activo,
    siesaId: `${scope.empresa}:${scope.companiaId}:${codigo}`,
    searchText: `${codigo} ${descripcion}`,
  };
}

function toPublic(doc: Doc<"centrosCosto">) {
  return {
    _id: doc._id,
    appEmpresa: doc.appEmpresa,
    empresa: doc.empresa,
    companiaId: doc.companiaId,
    codigo: doc.codigo,
    descripcion: doc.descripcion,
    centroOperacion: doc.centroOperacion ?? null,
    responsable: doc.responsable ?? null,
    activo: doc.activo,
    siesaId: doc.siesaId,
  };
}

async function assertSiesaIdAvailable(
  ctx: MutationCtx,
  siesaId: string,
  exceptId?: Id<"centrosCosto">,
) {
  const existing = await ctx.db
    .query("centrosCosto")
    .withIndex("by_siesaId", (q) => q.eq("siesaId", siesaId))
    .unique();
  if (existing && existing._id !== exceptId) {
    throw new Error("Ya existe un centro de costo con ese código en esta empresa.");
  }
}

export const buscar = query({
  args: {
    appEmpresa: v.union(appEmpresaValidator, v.null()),
    q: v.string(),
  },
  returns: v.array(centroCostoBusquedaValidator),
  handler: async (ctx, args) => {
    await requireActor(ctx);
    const q = args.q.trim();
    if (q.length < SEARCH_MIN_LENGTH) return [];

    const appEmpresa = args.appEmpresa ?? 1;
    const rows = await ctx.db
      .query("centrosCosto")
      .withSearchIndex("search_text", (sq) =>
        sq.search("searchText", q).eq("appEmpresa", appEmpresa).eq("activo", true),
      )
      .take(SEARCH_MAX_RESULTS);

    return rows.map((row) => ({
      id: row.siesaId,
      codigo: row.codigo,
      nombre: row.descripcion,
      centroOperacion: row.centroOperacion ?? null,
    }));
  },
});

export const listar = query({
  args: {
    appEmpresa: appEmpresaValidator,
    q: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(centroCostoPublicValidator),
  handler: async (ctx, args) => {
    await requirePermiso(ctx, PERMISO_ADMIN);
    const paginationOpts = {
      ...args.paginationOpts,
      numItems: Math.min(args.paginationOpts.numItems, LIST_PAGE_CAP),
    };
    const q = args.q?.trim() ?? "";

    const result =
      q.length >= SEARCH_MIN_LENGTH
        ? await ctx.db
            .query("centrosCosto")
            .withSearchIndex("search_text", (sq) =>
              sq.search("searchText", q).eq("appEmpresa", args.appEmpresa),
            )
            .paginate(paginationOpts)
        : await ctx.db
            .query("centrosCosto")
            .withIndex("by_appEmpresa_codigo", (idx) => idx.eq("appEmpresa", args.appEmpresa))
            .paginate(paginationOpts);

    return {
      ...result,
      page: result.page.map(toPublic),
    };
  },
});

export const crear = mutation({
  args: {
    appEmpresa: appEmpresaValidator,
    codigo: v.string(),
    descripcion: v.string(),
    centroOperacion: v.optional(v.string()),
    responsable: v.optional(v.string()),
  },
  returns: v.id("centrosCosto"),
  handler: async (ctx, args) => {
    await requirePermiso(ctx, PERMISO_ADMIN);
    const fields = buildFields({ ...args, activo: true });
    await assertSiesaIdAvailable(ctx, fields.siesaId);
    return await ctx.db.insert("centrosCosto", fields);
  },
});

export const actualizar = mutation({
  args: {
    id: v.id("centrosCosto"),
    descripcion: v.string(),
    centroOperacion: v.union(v.string(), v.null()),
    responsable: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requirePermiso(ctx, PERMISO_ADMIN);
    const current = await ctx.db.get("centrosCosto", args.id);
    if (!current) {
      throw new Error("Centro de costo no encontrado.");
    }

    const fields = buildFields({
      appEmpresa: current.appEmpresa,
      codigo: current.codigo,
      descripcion: args.descripcion,
      centroOperacion: args.centroOperacion,
      responsable: args.responsable,
      activo: current.activo,
    });
    await ctx.db.replace("centrosCosto", args.id, fields);
    return null;
  },
});

export const setActivo = mutation({
  args: {
    id: v.id("centrosCosto"),
    activo: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requirePermiso(ctx, PERMISO_ADMIN);
    const current = await ctx.db.get("centrosCosto", args.id);
    if (!current) {
      throw new Error("Centro de costo no encontrado.");
    }
    await ctx.db.patch("centrosCosto", args.id, { activo: args.activo });
    return null;
  },
});
