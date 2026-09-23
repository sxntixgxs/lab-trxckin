import { v } from "convex/values";
import {
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { RUTAS_SISTEMA } from "../lib/rutas-sistema";
import { isValidServerSecret } from "./lib/auth";
import {
  actorPuedeVerEmpresa,
  requirePermisoEmpresa,
} from "./lib/billingAuth";
import { normalizePeajesProviderNit } from "./lib/peajes";
import { normalizeEmail, normalizeEmpresa } from "./lib/normalize";

const DEFAULT_EMPRESA = 1;
const MAX_ANALISTAS_CAUSACION = 100;
const MAX_PROVEEDORES_CAUSACION_CONFIG = 500;

const claveConfiguracionValidator = v.union(
  v.literal("lider_administracion"),
  v.literal("lider_tecnologia"),
  v.literal("recepcion"),
  v.literal("analista_causacion"),
  v.literal("rechazos_dian"),
  v.literal("contadores_impuestos"),
  v.literal("contadores_peajes"),
  v.literal("eventos_dian"),
  v.literal("gerencia"),
  v.literal("gerente_financiero"),
  v.literal("gerente_general"),
  v.literal("tesorero"),
  v.literal("tesoreria_default"),
  v.literal("cuenta_recepcion"),
  v.literal("revisor_caja_menor"),
  v.literal("notificacion_pagadas"),
  v.literal("notificacion_legalizadas"),
  v.literal("notificacion_rechazado_dian")
);

const usuarioConfigValidator = v.object({
  usuarioId: v.string(),
  nombre: v.string(),
  email: v.string(),
});

const claveUsuariosListaValidator = v.union(
  v.literal("recepcion"),
  v.literal("analista_causacion"),
  v.literal("rechazos_dian"),
  v.literal("contadores_impuestos"),
  v.literal("contadores_peajes"),
  v.literal("eventos_dian"),
  v.literal("gerencia"),
  v.literal("tesorero"),
  v.literal("tesoreria_default"),
  v.literal("revisor_caja_menor"),
  v.literal("notificacion_pagadas"),
  v.literal("notificacion_legalizadas"),
  v.literal("notificacion_rechazado_dian")
);

const analistaCausacionValidator = v.object({
  usuarioId: v.string(),
  nombre: v.string(),
  email: v.string(),
  peso: v.number(),
});

type UsuarioPonderadoInput = {
  usuarioId: string;
  nombre: string;
  email: string;
  peso: number;
};

type ConfigRow = {
  _id?: unknown;
  empresa?: number;
  clave: string;
  tipo: "usuario" | "texto" | "usuarios_lista" | "usuarios_ponderados";
  usuarioId?: string;
  nombre?: string;
  email?: string;
  usuarios?: Array<{
    usuarioId: string;
    nombre: string;
    email: string;
  }>;
  usuariosPonderados?: Array<{
    usuarioId: string;
    nombre: string;
    email: string;
    peso: number;
  }>;
  distribucionCursor?: number;
  valor?: string;
  sincronizacionGraphDeshabilitada?: boolean;
  actualizadoEn: number;
  actualizadoPorUserId?: string;
  actualizadoPorNombre?: string;
};

type ClaveConfiguracion = Doc<"facturacionConfiguracion">["clave"];
type ClaveUsuarioIndexada = Exclude<ClaveConfiguracion, "cuenta_recepcion">;
type TipoUsuariosRol = "usuario" | "usuarios_lista" | "usuarios_ponderados";

const CLAVES_USUARIO_INDEXADAS = new Set<string>([
  "lider_administracion",
  "lider_tecnologia",
  "recepcion",
  "analista_causacion",
  "rechazos_dian",
  "contadores_impuestos",
  "contadores_peajes",
  "eventos_dian",
  "gerencia",
  "gerente_financiero",
  "gerente_general",
  "tesorero",
  "tesoreria_default",
  "revisor_caja_menor",
  "notificacion_pagadas",
  "notificacion_legalizadas",
  "notificacion_rechazado_dian",
]);

function normalizeProveedorNit(value?: string) {
  return normalizePeajesProviderNit(value);
}

/**
 * Billing settings are edited from /billing/settings: the caller needs that permission and
 * access to the company being configured. The audit fields come from the caller's identity;
 * the `actualizadoPor*` args are still accepted for compatibility but ignored.
 */
async function requireConfiguradorFacturacion(ctx: MutationCtx, empresa: number) {
  const actor = await requirePermisoEmpresa(
    ctx,
    RUTAS_SISTEMA.FACTURACION_CONFIGURACION,
    empresa
  );
  return {
    actualizadoPorUserId: actor.usuarioId,
    actualizadoPorNombre: actor.nombre,
  };
}

async function getAnalistasCausacionActivos(
  ctx: QueryCtx | MutationCtx,
  empresa: number
) {
  const indexed = await ctx.db
    .query("facturacionConfiguracionUsuarios")
    .withIndex("by_empresa_clave", (q) =>
      q.eq("empresa", empresa).eq("clave", "analista_causacion")
    )
    .take(MAX_ANALISTAS_CAUSACION);

  if (indexed.length > 0) {
    return indexed
      .filter(
        (usuario) =>
          usuario.usuarioId &&
          usuario.nombre &&
          usuario.email &&
          Number.isFinite(usuario.peso) &&
          (usuario.peso ?? 0) > 0
      )
      .map((usuario) => ({
        usuarioId: usuario.usuarioId,
        nombre: usuario.nombre,
        email: usuario.email.toLowerCase(),
        peso: usuario.peso ?? 0,
      }));
  }

  const config = await getConfigForRead(ctx, empresa, "analista_causacion");
  if (!config?.usuariosPonderados?.length) return [];

  return config.usuariosPonderados.filter(
    (usuario) =>
      usuario.usuarioId &&
      usuario.nombre &&
      usuario.email &&
      Number.isFinite(usuario.peso) &&
      usuario.peso > 0
  );
}

async function assertAnalistaEnDistribucionCausacion(
  ctx: QueryCtx | MutationCtx,
  empresa: number,
  analistaUsuarioId: string
) {
  const analistas = await getAnalistasCausacionActivos(ctx, empresa);
  const analista = analistas.find(
    (item) => item.usuarioId === analistaUsuarioId
  );
  if (!analista) {
    throw new Error(
      "El analista seleccionado no está en la distribución de causación."
    );
  }
  return analista;
}

async function assertAnalistasSinProveedoresAsignados(
  ctx: MutationCtx,
  empresa: number,
  analistaUsuarioIds: string[]
) {
  for (const analistaUsuarioId of analistaUsuarioIds) {
    const proveedores = await ctx.db
      .query("facturacionCausacionProveedorAnalistas")
      .withIndex("by_empresa_analistaUsuarioId", (q) =>
        q.eq("empresa", empresa).eq("analistaUsuarioId", analistaUsuarioId)
      )
      .first();
    if (proveedores) {
      throw new Error(
        "No puedes quitar un analista que aún tiene proveedores con analista fijo."
      );
    }
  }
}

function validarPesoPonderado(peso: number, message: string) {
  if (!Number.isFinite(peso) || !Number.isInteger(peso) || peso < 0) {
    throw new Error(message);
  }
}

function toMap(configs: ConfigRow[]) {
  return configs.reduce<Record<string, ConfigRow>>((acc, item) => {
    acc[item.clave] = item;
    return acc;
  }, {});
}

function getUsuariosLista(config: ConfigRow) {
  if (config.usuarios && config.usuarios.length > 0) {
    return config.usuarios.map((usuario) => ({
      usuarioId: usuario.usuarioId,
      nombre: usuario.nombre,
      email: usuario.email.toLowerCase(),
    }));
  }

  if (config.usuariosPonderados && config.usuariosPonderados.length > 0) {
    return config.usuariosPonderados.map((usuario) => ({
      usuarioId: usuario.usuarioId,
      nombre: usuario.nombre,
      email: usuario.email.toLowerCase(),
    }));
  }

  if (config.usuarioId && config.nombre && config.email) {
    return [
      {
        usuarioId: config.usuarioId,
        nombre: config.nombre,
        email: config.email.toLowerCase(),
      },
    ];
  }

  return [];
}

function esClaveUsuarioIndexada(
  clave: ClaveConfiguracion
): clave is ClaveUsuarioIndexada {
  return CLAVES_USUARIO_INDEXADAS.has(clave);
}

async function reemplazarUsuariosRolIndex(
  ctx: MutationCtx,
  args: {
    empresa: number;
    clave: ClaveConfiguracion;
    tipo: TipoUsuariosRol;
    usuarios: Array<{
      usuarioId: string;
      nombre: string;
      email: string;
      peso?: number;
    }>;
    actualizadoPorUserId?: string;
    actualizadoPorNombre?: string;
  }
) {
  const clave = args.clave;
  if (!esClaveUsuarioIndexada(clave)) return;

  const existentes = await ctx.db
    .query("facturacionConfiguracionUsuarios")
    .withIndex("by_empresa_clave", (q) =>
      q.eq("empresa", args.empresa).eq("clave", clave)
    )
    .collect();

  for (const existente of existentes) {
    await ctx.db.delete("facturacionConfiguracionUsuarios", existente._id);
  }

  const now = Date.now();
  for (const [orden, usuario] of args.usuarios.entries()) {
    await ctx.db.insert("facturacionConfiguracionUsuarios", {
      empresa: args.empresa,
      clave,
      tipo: args.tipo,
      usuarioId: usuario.usuarioId,
      nombre: usuario.nombre.trim(),
      email: usuario.email.toLowerCase(),
      ...(typeof usuario.peso === "number" ? { peso: usuario.peso } : {}),
      orden,
      actualizadoEn: now,
      ...(args.actualizadoPorUserId
        ? { actualizadoPorUserId: args.actualizadoPorUserId }
        : {}),
      ...(args.actualizadoPorNombre
        ? { actualizadoPorNombre: args.actualizadoPorNombre }
        : {}),
    });
  }
}

function normalizarUsuariosRolIndex(
  usuarios: Array<Doc<"facturacionConfiguracionUsuarios">>
) {
  return [...usuarios]
    .sort(
      (a, b) =>
        (a.orden ?? 0) - (b.orden ?? 0) ||
        a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" })
    )
    .map((usuario) => ({
      usuarioId: usuario.usuarioId,
      nombre: usuario.nombre,
      email: usuario.email.toLowerCase(),
    }));
}

async function getConfigForRead(
  ctx: QueryCtx,
  empresa: number,
  clave: ClaveConfiguracion
) {
  const scoped = await ctx.db
    .query("facturacionConfiguracion")
    .withIndex("by_empresa_clave", (q) =>
      q.eq("empresa", empresa).eq("clave", clave)
    )
    .first();
  if (scoped) return scoped;

  if (empresa === DEFAULT_EMPRESA) {
    return await ctx.db
      .query("facturacionConfiguracion")
      .withIndex("by_clave", (q) => q.eq("clave", clave))
      .filter((q) => q.eq(q.field("empresa"), undefined))
      .first();
  }

  return null;
}

async function getExisting(
  ctx: MutationCtx,
  empresa: number,
  clave: ClaveConfiguracion
) {
  const scoped = await ctx.db
    .query("facturacionConfiguracion")
    .withIndex("by_empresa_clave", (q) =>
      q.eq("empresa", empresa).eq("clave", clave)
    )
    .first();
  if (scoped) return scoped;

  // Compatibilidad: la configuración antigua no tenía empresa.
  if (empresa === DEFAULT_EMPRESA) {
    return await ctx.db
      .query("facturacionConfiguracion")
      .withIndex("by_clave", (q) => q.eq("clave", clave))
      .filter((q) => q.eq(q.field("empresa"), undefined))
      .first();
  }

  return null;
}

export const listar = query({
  args: { empresa: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const empresa = normalizeEmpresa(args.empresa);
    await requirePermisoEmpresa(ctx, RUTAS_SISTEMA.FACTURACION_CONFIGURACION, empresa);
    const scoped = await ctx.db
      .query("facturacionConfiguracion")
      .withIndex("by_empresa", (q) => q.eq("empresa", empresa))
      .collect();

    if (empresa !== DEFAULT_EMPRESA) return toMap(scoped);

    const legacy = await ctx.db
      .query("facturacionConfiguracion")
      .filter((q) => q.eq(q.field("empresa"), undefined))
      .collect();

    return toMap([...legacy, ...scoped]);
  },
});

export const listarCuentasRecepcionInterno = internalQuery({
  args: {},
  handler: async (ctx) => {
    const configs = await ctx.db
      .query("facturacionConfiguracion")
      .withIndex("by_clave", (q) => q.eq("clave", "cuenta_recepcion"))
      .collect();

    if (configs.length === 0) {
      return {
        cuentas: [
          { empresa: DEFAULT_EMPRESA, email: "facturas@example.com" },
        ],
        omitidas: [],
      };
    }

    const cuentas: Array<{ empresa: number; email: string }> = [];
    const omitidas: Array<{
      empresa: number;
      email: string;
      motivo: "carga_manual";
    }> = [];

    for (const config of configs) {
      const cuenta = {
        empresa: normalizeEmpresa(config.empresa),
        email: (config.valor ?? "").trim().toLowerCase(),
      };

      if (config.sincronizacionGraphDeshabilitada === true) {
        omitidas.push({ ...cuenta, motivo: "carga_manual" });
        continue;
      }

      if (cuenta.email) {
        cuentas.push(cuenta);
      }
    }

    return { cuentas, omitidas };
  },
});

/**
 * Role pickers of the inbox (and the Next assign-phase route, which calls it server-side
 * with `secret`). Browser callers need the inbox or settings permission. The inbox asks for
 * the companies of the invoices assigned to the user, which may be outside their own
 * companies, so an explicit list is honoured; without it only visible companies are returned.
 */
export const listarUsuariosPorClave = query({
  args: {
    clave: claveUsuariosListaValidator,
    empresas: v.optional(v.array(v.number())),
    secret: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = isValidServerSecret(args.secret)
      ? null
      : await requirePermisoEmpresa(ctx, [
          RUTAS_SISTEMA.FACTURACION_BUZON,
          RUTAS_SISTEMA.FACTURACION_CONFIGURACION,
        ]);
    const out: Record<string, ReturnType<typeof getUsuariosLista>> = {};

    if (args.empresas) {
      for (const empresaArg of args.empresas) {
        const empresa = normalizeEmpresa(empresaArg);
        const indexed = await ctx.db
          .query("facturacionConfiguracionUsuarios")
          .withIndex("by_empresa_clave", (q) =>
            q.eq("empresa", empresa).eq("clave", args.clave)
          )
          .collect();

        if (indexed.length > 0) {
          out[String(empresa)] = normalizarUsuariosRolIndex(indexed);
          continue;
        }

        const fallback = await getConfigForRead(ctx, empresa, args.clave);
        if (fallback) {
          out[String(empresa)] = getUsuariosLista(fallback);
        }
      }

      return out;
    }

    const indexed = await ctx.db
      .query("facturacionConfiguracionUsuarios")
      .withIndex("by_clave", (q) => q.eq("clave", args.clave))
      .collect();

    const indexedByEmpresa = new Map<number, typeof indexed>();
    for (const usuario of indexed) {
      const current = indexedByEmpresa.get(usuario.empresa) ?? [];
      current.push(usuario);
      indexedByEmpresa.set(usuario.empresa, current);
    }

    for (const [empresa, usuarios] of indexedByEmpresa) {
      out[String(empresa)] = normalizarUsuariosRolIndex(usuarios);
    }

    const configs = await ctx.db
      .query("facturacionConfiguracion")
      .withIndex("by_clave", (q) => q.eq("clave", args.clave))
      .collect();

    const ordered = [...configs].sort((a, b) => {
      const aScoped = typeof a.empresa === "number" ? 1 : 0;
      const bScoped = typeof b.empresa === "number" ? 1 : 0;
      return aScoped - bScoped;
    });

    for (const config of ordered) {
      const empresa = normalizeEmpresa(config.empresa);
      if (out[String(empresa)]) continue;
      out[String(empresa)] = getUsuariosLista(config);
    }

    if (actor) {
      for (const empresa of Object.keys(out)) {
        if (!actorPuedeVerEmpresa(actor, Number(empresa))) delete out[empresa];
      }
    }

    return out;
  },
});

export const guardarUsuario = mutation({
  args: {
    empresa: v.optional(v.number()),
    clave: claveConfiguracionValidator,
    usuarioId: v.string(),
    nombre: v.string(),
    email: v.string(),
    actualizadoPorUserId: v.optional(v.string()),
    actualizadoPorNombre: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const empresa = normalizeEmpresa(args.empresa);
    const auditoria = await requireConfiguradorFacturacion(ctx, empresa);
    const existing = await getExisting(ctx, empresa, args.clave);

    const payload = {
      empresa,
      clave: args.clave,
      tipo: "usuario" as const,
      usuarioId: args.usuarioId,
      nombre: args.nombre.trim(),
      email: args.email.toLowerCase(),
      actualizadoEn: Date.now(),
      ...(auditoria.actualizadoPorUserId
        ? { actualizadoPorUserId: auditoria.actualizadoPorUserId }
        : {}),
      ...(auditoria.actualizadoPorNombre
        ? { actualizadoPorNombre: auditoria.actualizadoPorNombre }
        : {}),
    };

    const configId = existing
      ? existing._id
      : await ctx.db.insert("facturacionConfiguracion", payload);

    if (existing) {
      await ctx.db.replace("facturacionConfiguracion", existing._id, payload);
    }

    await reemplazarUsuariosRolIndex(ctx, {
      empresa,
      clave: args.clave,
      tipo: "usuario",
      usuarios: [
        {
          usuarioId: args.usuarioId,
          nombre: args.nombre,
          email: args.email,
        },
      ],
      actualizadoPorUserId: auditoria.actualizadoPorUserId,
      actualizadoPorNombre: auditoria.actualizadoPorNombre,
    });

    return configId;
  },
});

export const guardarUsuariosLista = mutation({
  args: {
    empresa: v.optional(v.number()),
    clave: claveConfiguracionValidator,
    usuarios: v.array(usuarioConfigValidator),
    actualizadoPorUserId: v.optional(v.string()),
    actualizadoPorNombre: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const empresa = normalizeEmpresa(args.empresa);
    const auditoria = await requireConfiguradorFacturacion(ctx, empresa);
    if (args.usuarios.length === 0) {
      throw new Error("Configura al menos un usuario.");
    }

    const seen = new Set<string>();
    const usuarios = (args.usuarios as UsuarioPonderadoInput[]).map(
      (usuario) => {
        if (seen.has(usuario.usuarioId)) {
          throw new Error("No repitas usuarios en la lista.");
        }
        seen.add(usuario.usuarioId);
        return {
          usuarioId: usuario.usuarioId,
          nombre: usuario.nombre.trim(),
          email: usuario.email.toLowerCase(),
        };
      }
    );

    const existing = await getExisting(ctx, empresa, args.clave);
    const payload = {
      empresa,
      clave: args.clave,
      tipo: "usuarios_lista" as const,
      usuarios,
      actualizadoEn: Date.now(),
      ...(auditoria.actualizadoPorUserId
        ? { actualizadoPorUserId: auditoria.actualizadoPorUserId }
        : {}),
      ...(auditoria.actualizadoPorNombre
        ? { actualizadoPorNombre: auditoria.actualizadoPorNombre }
        : {}),
    };

    const configId = existing
      ? existing._id
      : await ctx.db.insert("facturacionConfiguracion", payload);

    if (existing) {
      await ctx.db.replace("facturacionConfiguracion", existing._id, payload);
    }

    await reemplazarUsuariosRolIndex(ctx, {
      empresa,
      clave: args.clave,
      tipo: "usuarios_lista",
      usuarios,
      actualizadoPorUserId: auditoria.actualizadoPorUserId,
      actualizadoPorNombre: auditoria.actualizadoPorNombre,
    });

    return configId;
  },
});

export const guardarGerencias = mutation({
  args: {
    empresa: v.optional(v.number()),
    usuarios: v.array(usuarioConfigValidator),
    defaultUsuarioId: v.string(),
    actualizadoPorUserId: v.optional(v.string()),
    actualizadoPorNombre: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const empresa = normalizeEmpresa(args.empresa);
    const auditoria = await requireConfiguradorFacturacion(ctx, empresa);
    if (args.usuarios.length === 0) {
      throw new Error("Configura al menos un usuario de gerencia.");
    }

    const seen = new Set<string>();
    const usuariosMap = new Map<
      string,
      { usuarioId: string; nombre: string; email: string }
    >();
    for (const usuario of args.usuarios as Array<{
      usuarioId: string;
      nombre: string;
      email: string;
    }>) {
      if (seen.has(usuario.usuarioId)) {
        throw new Error("No repitas usuarios en la lista.");
      }
      seen.add(usuario.usuarioId);
      usuariosMap.set(usuario.usuarioId, {
        usuarioId: usuario.usuarioId,
        nombre: usuario.nombre.trim(),
        email: usuario.email.toLowerCase(),
      });
    }

    const defaultUsuarioId =
      args.usuarios.length === 1
        ? args.usuarios[0].usuarioId
        : args.defaultUsuarioId;
    const defaultUsuario = usuariosMap.get(defaultUsuarioId);
    if (!defaultUsuario) {
      throw new Error("Selecciona un gerente default válido.");
    }

    const restantes = [...usuariosMap.values()].filter(
      (usuario) => usuario.usuarioId !== defaultUsuario.usuarioId
    );
    const usuarios = [defaultUsuario, ...restantes];

    const existing = await getExisting(ctx, empresa, "gerencia");
    const payload = {
      empresa,
      clave: "gerencia" as const,
      tipo: "usuarios_lista" as const,
      usuarios,
      actualizadoEn: Date.now(),
      ...(auditoria.actualizadoPorUserId
        ? { actualizadoPorUserId: auditoria.actualizadoPorUserId }
        : {}),
      ...(auditoria.actualizadoPorNombre
        ? { actualizadoPorNombre: auditoria.actualizadoPorNombre }
        : {}),
    };

    const configId = existing
      ? existing._id
      : await ctx.db.insert("facturacionConfiguracion", payload);

    if (existing) {
      await ctx.db.replace("facturacionConfiguracion", existing._id, payload);
    }

    await reemplazarUsuariosRolIndex(ctx, {
      empresa,
      clave: "gerencia",
      tipo: "usuarios_lista",
      usuarios,
      actualizadoPorUserId: auditoria.actualizadoPorUserId,
      actualizadoPorNombre: auditoria.actualizadoPorNombre,
    });

    return configId;
  },
});

export const guardarAnalistasCausacion = mutation({
  args: {
    empresa: v.optional(v.number()),
    usuarios: v.array(analistaCausacionValidator),
    actualizadoPorUserId: v.optional(v.string()),
    actualizadoPorNombre: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const empresa = normalizeEmpresa(args.empresa);
    const auditoria = await requireConfiguradorFacturacion(ctx, empresa);
    if (args.usuarios.length === 0) {
      throw new Error("Configura al menos un analista de causación.");
    }

    const seen = new Set<string>();
    const usuarios = args.usuarios.map((usuario) => {
      if (seen.has(usuario.usuarioId)) {
        throw new Error("No repitas analistas en la distribución.");
      }
      seen.add(usuario.usuarioId);

      validarPesoPonderado(
        usuario.peso,
        "Cada analista debe tener un peso entero entre 0 y 100."
      );

      return {
        usuarioId: usuario.usuarioId,
        nombre: usuario.nombre.trim(),
        email: usuario.email.toLowerCase(),
        peso: usuario.peso,
      };
    });

    const totalPeso = usuarios.reduce(
      (total: number, usuario) => total + usuario.peso,
      0
    );
    if (!usuarios.some((usuario) => usuario.peso > 0)) {
      throw new Error("Configura al menos un analista con peso mayor a 0.");
    }

    if (totalPeso !== 100) {
      throw new Error("La distribución de causación debe sumar 100%.");
    }

    const existing = await getExisting(ctx, empresa, "analista_causacion");
    const removedAnalystIds = new Set<string>();

    if (existing?.usuariosPonderados?.length) {
      const nextIds = new Set(usuarios.map((usuario) => usuario.usuarioId));
      for (const usuario of existing.usuariosPonderados) {
        if (!nextIds.has(usuario.usuarioId)) {
          removedAnalystIds.add(usuario.usuarioId);
        }
      }
    } else if (existing?.usuarioId) {
      const nextIds = new Set(usuarios.map((usuario) => usuario.usuarioId));
      if (!nextIds.has(existing.usuarioId)) {
        removedAnalystIds.add(existing.usuarioId);
      }
    }

    if (removedAnalystIds.size > 0) {
      await assertAnalistasSinProveedoresAsignados(ctx, empresa, [
        ...removedAnalystIds,
      ]);
    }

    const payload = {
      empresa,
      clave: "analista_causacion" as const,
      tipo: "usuarios_ponderados" as const,
      usuariosPonderados: usuarios,
      distribucionCursor: 0,
      actualizadoEn: Date.now(),
      ...(auditoria.actualizadoPorUserId
        ? { actualizadoPorUserId: auditoria.actualizadoPorUserId }
        : {}),
      ...(auditoria.actualizadoPorNombre
        ? { actualizadoPorNombre: auditoria.actualizadoPorNombre }
        : {}),
    };

    const configId = existing
      ? existing._id
      : await ctx.db.insert("facturacionConfiguracion", payload);

    if (existing) {
      await ctx.db.replace("facturacionConfiguracion", existing._id, {
        ...payload,
        distribucionCursor: existing.distribucionCursor ?? 0,
      });
    }

    await reemplazarUsuariosRolIndex(ctx, {
      empresa,
      clave: "analista_causacion",
      tipo: "usuarios_ponderados",
      usuarios,
      actualizadoPorUserId: auditoria.actualizadoPorUserId,
      actualizadoPorNombre: auditoria.actualizadoPorNombre,
    });

    return configId;
  },
});

export const guardarRechazosDian = mutation({
  args: {
    empresa: v.optional(v.number()),
    usuarios: v.array(analistaCausacionValidator),
    actualizadoPorUserId: v.optional(v.string()),
    actualizadoPorNombre: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const empresa = normalizeEmpresa(args.empresa);
    const auditoria = await requireConfiguradorFacturacion(ctx, empresa);
    if (args.usuarios.length === 0) {
      throw new Error("Configura al menos un usuario de Rechazos DIAN.");
    }

    const seen = new Set<string>();
    const usuarios = (args.usuarios as UsuarioPonderadoInput[]).map(
      (usuario) => {
        if (seen.has(usuario.usuarioId)) {
          throw new Error("No repitas usuarios en la distribución.");
        }
        seen.add(usuario.usuarioId);

        validarPesoPonderado(
          usuario.peso,
          "Cada usuario debe tener un peso entero entre 0 y 100."
        );

        return {
          usuarioId: usuario.usuarioId,
          nombre: usuario.nombre.trim(),
          email: usuario.email.toLowerCase(),
          peso: usuario.peso,
        };
      }
    );

    const totalPeso = usuarios.reduce(
      (total: number, usuario) => total + usuario.peso,
      0
    );
    if (!usuarios.some((usuario) => usuario.peso > 0)) {
      throw new Error("Configura al menos un usuario con peso mayor a 0.");
    }

    if (totalPeso !== 100) {
      throw new Error("La distribución de Rechazos DIAN debe sumar 100%.");
    }

    const existing = await getExisting(ctx, empresa, "rechazos_dian");
    const payload = {
      empresa,
      clave: "rechazos_dian" as const,
      tipo: "usuarios_ponderados" as const,
      usuariosPonderados: usuarios,
      distribucionCursor: 0,
      actualizadoEn: Date.now(),
      ...(auditoria.actualizadoPorUserId
        ? { actualizadoPorUserId: auditoria.actualizadoPorUserId }
        : {}),
      ...(auditoria.actualizadoPorNombre
        ? { actualizadoPorNombre: auditoria.actualizadoPorNombre }
        : {}),
    };

    const configId = existing
      ? existing._id
      : await ctx.db.insert("facturacionConfiguracion", payload);

    if (existing) {
      await ctx.db.replace("facturacionConfiguracion", existing._id, {
        ...payload,
        distribucionCursor: existing.distribucionCursor ?? 0,
      });
    }

    await reemplazarUsuariosRolIndex(ctx, {
      empresa,
      clave: "rechazos_dian",
      tipo: "usuarios_ponderados",
      usuarios,
      actualizadoPorUserId: auditoria.actualizadoPorUserId,
      actualizadoPorNombre: auditoria.actualizadoPorNombre,
    });

    return configId;
  },
});

export const guardarRevisoresCajaMenor = mutation({
  args: {
    empresa: v.optional(v.number()),
    usuarios: v.array(analistaCausacionValidator),
    actualizadoPorUserId: v.optional(v.string()),
    actualizadoPorNombre: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const empresa = normalizeEmpresa(args.empresa);
    const auditoria = await requireConfiguradorFacturacion(ctx, empresa);
    if (args.usuarios.length === 0) {
      throw new Error("Configura al menos un Revisor Caja Menor.");
    }

    const seen = new Set<string>();
    const usuarios = (args.usuarios as UsuarioPonderadoInput[]).map(
      (usuario) => {
        if (seen.has(usuario.usuarioId)) {
          throw new Error("No repitas revisores en la distribución.");
        }
        seen.add(usuario.usuarioId);

        validarPesoPonderado(
          usuario.peso,
          "Cada revisor debe tener un peso entero entre 0 y 100."
        );

        return {
          usuarioId: usuario.usuarioId,
          nombre: usuario.nombre.trim(),
          email: usuario.email.toLowerCase(),
          peso: usuario.peso,
        };
      }
    );

    const totalPeso = usuarios.reduce(
      (total: number, usuario) => total + usuario.peso,
      0
    );
    if (!usuarios.some((usuario) => usuario.peso > 0)) {
      throw new Error("Configura al menos un revisor con peso mayor a 0.");
    }

    if (totalPeso !== 100) {
      throw new Error("La distribución de Revisores Caja Menor debe sumar 100%.");
    }

    const existing = await getExisting(ctx, empresa, "revisor_caja_menor");
    const payload = {
      empresa,
      clave: "revisor_caja_menor" as const,
      tipo: "usuarios_ponderados" as const,
      usuariosPonderados: usuarios,
      distribucionCursor: 0,
      actualizadoEn: Date.now(),
      ...(auditoria.actualizadoPorUserId
        ? { actualizadoPorUserId: auditoria.actualizadoPorUserId }
        : {}),
      ...(auditoria.actualizadoPorNombre
        ? { actualizadoPorNombre: auditoria.actualizadoPorNombre }
        : {}),
    };

    const configId = existing
      ? existing._id
      : await ctx.db.insert("facturacionConfiguracion", payload);

    if (existing) {
      await ctx.db.replace("facturacionConfiguracion", existing._id, {
        ...payload,
        distribucionCursor: existing.distribucionCursor ?? 0,
      });
    }

    await reemplazarUsuariosRolIndex(ctx, {
      empresa,
      clave: "revisor_caja_menor",
      tipo: "usuarios_ponderados",
      usuarios,
      actualizadoPorUserId: auditoria.actualizadoPorUserId,
      actualizadoPorNombre: auditoria.actualizadoPorNombre,
    });

    return configId;
  },
});

export const guardarCuentaRecepcion = mutation({
  args: {
    empresa: v.optional(v.number()),
    valor: v.string(),
    sincronizacionGraphDeshabilitada: v.boolean(),
    actualizadoPorUserId: v.optional(v.string()),
    actualizadoPorNombre: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const empresa = normalizeEmpresa(args.empresa);
    const auditoria = await requireConfiguradorFacturacion(ctx, empresa);
    const valor = args.valor.trim().toLowerCase();

    if (!args.sincronizacionGraphDeshabilitada && !valor) {
      throw new Error("Ingresa la cuenta de recepción para sincronizar Graph.");
    }

    const existing = await getExisting(ctx, empresa, "cuenta_recepcion");
    const payload = {
      empresa,
      clave: "cuenta_recepcion" as const,
      tipo: "texto" as const,
      valor,
      sincronizacionGraphDeshabilitada:
        args.sincronizacionGraphDeshabilitada,
      actualizadoEn: Date.now(),
      ...(auditoria.actualizadoPorUserId
        ? { actualizadoPorUserId: auditoria.actualizadoPorUserId }
        : {}),
      ...(auditoria.actualizadoPorNombre
        ? { actualizadoPorNombre: auditoria.actualizadoPorNombre }
        : {}),
    };

    if (existing) {
      await ctx.db.replace("facturacionConfiguracion", existing._id, payload);
      return existing._id;
    }

    return await ctx.db.insert("facturacionConfiguracion", payload);
  },
});

export const listarProveedoresCausacion = query({
  args: { empresa: v.optional(v.number()) },
  returns: v.array(
    v.object({
      _id: v.id("facturacionCausacionProveedorAnalistas"),
      empresa: v.number(),
      proveedorNit: v.string(),
      proveedorNitNormalizado: v.string(),
      proveedorNombre: v.string(),
      analistaUsuarioId: v.string(),
      analistaNombre: v.string(),
      analistaEmail: v.string(),
      creadoEn: v.number(),
      actualizadoEn: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    const empresa = normalizeEmpresa(args.empresa);
    await requirePermisoEmpresa(ctx, RUTAS_SISTEMA.FACTURACION_CONFIGURACION, empresa);
    const rows = await ctx.db
      .query("facturacionCausacionProveedorAnalistas")
      .withIndex("by_empresa", (q) => q.eq("empresa", empresa))
      .take(MAX_PROVEEDORES_CAUSACION_CONFIG);

    return rows
      .sort(
        (a, b) =>
          a.analistaNombre.localeCompare(b.analistaNombre, "es", {
            sensitivity: "base",
          }) ||
          a.proveedorNombre.localeCompare(b.proveedorNombre, "es", {
            sensitivity: "base",
          })
      )
      .map((row) => ({
        _id: row._id,
        empresa: row.empresa,
        proveedorNit: row.proveedorNit,
        proveedorNitNormalizado: row.proveedorNitNormalizado,
        proveedorNombre: row.proveedorNombre,
        analistaUsuarioId: row.analistaUsuarioId,
        analistaNombre: row.analistaNombre,
        analistaEmail: row.analistaEmail,
        creadoEn: row.creadoEn,
        actualizadoEn: row.actualizadoEn,
      }));
  },
});

export const guardarProveedorCausacion = mutation({
  args: {
    empresa: v.optional(v.number()),
    proveedorNit: v.string(),
    proveedorNombre: v.string(),
    analistaUsuarioId: v.string(),
    analistaNombre: v.string(),
    analistaEmail: v.string(),
    actualizadoPorUserId: v.optional(v.string()),
    actualizadoPorNombre: v.optional(v.string()),
  },
  returns: v.id("facturacionCausacionProveedorAnalistas"),
  handler: async (ctx, args) => {
    const empresa = normalizeEmpresa(args.empresa);
    const auditoria = await requireConfiguradorFacturacion(ctx, empresa);
    const proveedorNit = args.proveedorNit.trim();
    const proveedorNombre = args.proveedorNombre.trim();
    const proveedorNitNormalizado = normalizeProveedorNit(proveedorNit);

    if (!proveedorNit) {
      throw new Error("Ingresa el NIT del proveedor.");
    }
    if (!proveedorNitNormalizado) {
      throw new Error("El NIT del proveedor no es válido.");
    }
    if (!proveedorNombre) {
      throw new Error("Ingresa el nombre del proveedor.");
    }

    const analista = await assertAnalistaEnDistribucionCausacion(
      ctx,
      empresa,
      args.analistaUsuarioId
    );

    const existing = await ctx.db
      .query("facturacionCausacionProveedorAnalistas")
      .withIndex("by_empresa_proveedorNitNormalizado", (q) =>
        q
          .eq("empresa", empresa)
          .eq("proveedorNitNormalizado", proveedorNitNormalizado)
      )
      .first();

    if (existing && existing.analistaUsuarioId !== args.analistaUsuarioId) {
      throw new Error(
        "Este NIT ya está asignado a otro analista de causación."
      );
    }

    const now = Date.now();
    const payload = {
      empresa,
      proveedorNit,
      proveedorNitNormalizado,
      proveedorNombre,
      analistaUsuarioId: analista.usuarioId,
      analistaNombre: analista.nombre.trim(),
      analistaEmail: normalizeEmail(analista.email),
      actualizadoEn: now,
      ...(auditoria.actualizadoPorUserId
        ? { actualizadoPorUserId: auditoria.actualizadoPorUserId }
        : {}),
      ...(auditoria.actualizadoPorNombre
        ? { actualizadoPorNombre: auditoria.actualizadoPorNombre }
        : {}),
    };

    if (existing) {
      await ctx.db.patch("facturacionCausacionProveedorAnalistas", existing._id, payload);
      return existing._id;
    }

    return await ctx.db.insert("facturacionCausacionProveedorAnalistas", {
      ...payload,
      creadoEn: now,
    });
  },
});

export const eliminarProveedorCausacion = mutation({
  args: {
    id: v.id("facturacionCausacionProveedorAnalistas"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db.get("facturacionCausacionProveedorAnalistas", args.id);
    if (!existing) {
      throw new Error("Proveedor no encontrado.");
    }
    await requireConfiguradorFacturacion(ctx, normalizeEmpresa(existing.empresa));
    await ctx.db.delete("facturacionCausacionProveedorAnalistas", args.id);
    return null;
  },
});
