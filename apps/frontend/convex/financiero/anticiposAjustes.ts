import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { mutation, query } from "../_generated/server";
import { reconciliarEstadoTrasAjusteValorLegalizable } from "../lib/anticiposLegalizacionReconciliacion";
import {
  dedupeAnticipoNotificationRecipients,
  getAnticipoStakeholderRecipients,
  scheduleAnticipoNotification,
} from "../lib/anticiposNotifications";
import {
  addMoneyAmounts,
  fromMoneyCents,
  isMontoPositivo,
  moneyEquals,
  moneyGreaterThan,
  moneyLessThan,
  moneyLessThanOrEqual,
  subtractMoneyAmounts,
  subtractMoneyCents,
  toMoneyCents,
} from "../lib/money";
import { getValorContableAnticipo } from "../lib/valorContable";
import {
  getSaldoLegalizadoAnticipo,
  getSaldoPendienteLegalizableAnticipo,
  getValorLegalizableAnticipo,
} from "../lib/valorLegalizableAnticipo";
import { requireServerSecret } from "../lib/auth";

const adjuntoArg = v.object({
  storageId: v.id("_storage"),
  nombre: v.string(),
});

const tipoAjusteAplicacionArg = v.union(
  v.literal("CORRECCION_DESEMBOLSO"),
  v.literal("REINTEGRO"),
  v.literal("CUADRE_OTROS_SISTEMAS")
);

const operacionAjusteArg = v.union(v.literal("SUMAR"), v.literal("RESTAR"));

const actorArg = v.object({
  userId: v.string(),
  nombre: v.string(),
  email: v.string(),
  rol: v.union(v.literal("GERENCIA"), v.literal("TESORERO")),
});

type RolAjuste = "GERENCIA" | "TESORERO";

function empresaDeAnticipo(anticipo: Doc<"anticipos">) {
  return anticipo.empresa_id ?? anticipo.empresa ?? 1;
}

async function obtenerRolConfig(ctx: QueryCtx | MutationCtx, empresa: number, rol: RolAjuste) {
  const scoped = await ctx.db
    .query("anticiposRolesConfig")
    .withIndex("by_empresa_rol", (q) => q.eq("empresa", empresa).eq("rol", rol))
    .first();
  if (scoped) return scoped;

  return await ctx.db
    .query("anticiposRolesConfig")
    .withIndex("by_empresa_rol", (q) => q.eq("empresa", undefined).eq("rol", rol))
    .first();
}

async function usuarioTieneRolAjuste(
  ctx: QueryCtx | MutationCtx,
  empresa: number,
  userId: string
): Promise<{ autorizado: boolean; rol?: RolAjuste }> {
  for (const rol of ["GERENCIA", "TESORERO"] as const) {
    const config = await obtenerRolConfig(ctx, empresa, rol);
    if (config?.userId === userId) return { autorizado: true, rol };
  }
  return { autorizado: false };
}

async function listarAjustesActivos(ctx: QueryCtx | MutationCtx, anticipoId: Id<"anticipos">) {
  const rows = await ctx.db
    .query("anticiposAjustes")
    .withIndex("by_anticipoId_aplicadoEn", (q) => q.eq("anticipoId", anticipoId))
    .order("desc")
    .collect();
  return rows.filter((row) => row.reversadoEn === undefined);
}

async function obtenerUltimoAjusteActivo(ctx: QueryCtx | MutationCtx, anticipoId: Id<"anticipos">) {
  const activos = await listarAjustesActivos(ctx, anticipoId);
  return activos[0] ?? null;
}

async function getRoleRecipientsForAjuste(
  ctx: MutationCtx,
  anticipo: Doc<"anticipos">,
  rol: RolAjuste
) {
  const config = await obtenerRolConfig(ctx, empresaDeAnticipo(anticipo), rol);
  if (!config?.userId) return [];
  return [
    {
      usuarioId: config.userId,
      nombre: config.nombre ?? config.userId,
      email: config.email,
    },
  ];
}

async function scheduleAjusteNotification(
  ctx: MutationCtx,
  anticipo: Doc<"anticipos">,
  evento: "AJUSTE_APLICADO" | "AJUSTE_REVERSADO",
  comentario: string,
  faseDestino?: string
) {
  const gerencia = await getRoleRecipientsForAjuste(ctx, anticipo, "GERENCIA");
  const tesoreria = await getRoleRecipientsForAjuste(ctx, anticipo, "TESORERO");
  const destinatarios = dedupeAnticipoNotificationRecipients([
    ...getAnticipoStakeholderRecipients(anticipo),
    ...gerencia,
    ...tesoreria,
  ]);
  await scheduleAnticipoNotification(ctx, {
    anticipo,
    evento,
    destinatarios,
    comentario,
    faseDestino,
  });
}

function buildResumenAjustes(anticipo: Doc<"anticipos">) {
  const valorAprobado = getValorContableAnticipo(anticipo);
  const valorLegalizable = getValorLegalizableAnticipo(anticipo);
  const saldoLegalizado = getSaldoLegalizadoAnticipo(anticipo);
  const saldoPendiente = getSaldoPendienteLegalizableAnticipo(anticipo);
  return {
    valorSolicitado: anticipo.valorNumerico,
    valorAprobado,
    valorLegalizable,
    saldoLegalizado,
    saldoPendiente,
  };
}

function buildLimitesAjuste(anticipo: Doc<"anticipos">) {
  const valorAprobado = getValorContableAnticipo(anticipo);
  const valorLegalizable = getValorLegalizableAnticipo(anticipo);
  const saldoLegalizado = getSaldoLegalizadoAnticipo(anticipo);
  const maximoRestar = Math.max(0, subtractMoneyAmounts(valorLegalizable, saldoLegalizado));
  const maximoSumar = Math.max(0, subtractMoneyAmounts(valorAprobado, valorLegalizable));
  return {
    maximoSumar,
    maximoRestar,
    puedeSumar: toMoneyCents(maximoSumar) > 0,
    puedeRestar: toMoneyCents(maximoRestar) > 0,
  };
}

function calcularValorObjetivo(
  valorLegalizableActual: number,
  operacion: "SUMAR" | "RESTAR",
  montoAjuste: number
) {
  return operacion === "SUMAR"
    ? addMoneyAmounts(valorLegalizableActual, montoAjuste)
    : subtractMoneyAmounts(valorLegalizableActual, montoAjuste);
}

function validarAplicacionAjuste(args: {
  anticipo: Doc<"anticipos">;
  tipo: "CORRECCION_DESEMBOLSO" | "REINTEGRO" | "CUADRE_OTROS_SISTEMAS";
  operacion: "SUMAR" | "RESTAR";
  montoAjuste: number;
  valorEsperado: number;
}) {
  const valorLegalizableActual = getValorLegalizableAnticipo(args.anticipo);
  if (!moneyEquals(args.valorEsperado, valorLegalizableActual)) {
    throw new Error("El valor legalizable cambió. Recarga la pantalla e intenta de nuevo.");
  }
  if (!isMontoPositivo(args.montoAjuste)) {
    throw new Error("El monto del ajuste debe ser mayor a cero y tener máximo dos decimales");
  }
  if (args.tipo === "REINTEGRO" && args.operacion !== "RESTAR") {
    throw new Error("Los reintegros únicamente disminuyen el valor legalizable");
  }
  if (args.tipo === "CUADRE_OTROS_SISTEMAS" && args.operacion !== "SUMAR") {
    throw new Error(
      "Los ajustes por cuadre con otros sistemas únicamente aumentan el valor legalizable"
    );
  }
  if (args.anticipo.faseActual !== "V_PENDIENTE_LEGALIZACION") {
    throw new Error("El anticipo no está pendiente de legalización");
  }

  const valorAprobado = getValorContableAnticipo(args.anticipo);
  const saldoLegalizado = getSaldoLegalizadoAnticipo(args.anticipo);
  const limites = buildLimitesAjuste(args.anticipo);
  const valorObjetivo = calcularValorObjetivo(
    valorLegalizableActual,
    args.operacion,
    args.montoAjuste
  );

  if (args.operacion === "SUMAR") {
    if (args.tipo !== "CUADRE_OTROS_SISTEMAS") {
      if (!limites.puedeSumar) {
        throw new Error("El valor legalizable ya coincide con el valor aprobado");
      }
      if (moneyGreaterThan(args.montoAjuste, limites.maximoSumar)) {
        throw new Error("La suma supera el valor aprobado");
      }
      if (moneyGreaterThan(valorObjetivo, valorAprobado)) {
        throw new Error("La suma supera el valor aprobado");
      }
    }
  } else {
    if (!limites.puedeRestar) {
      throw new Error("No hay saldo legalizable disponible para restar");
    }
    if (moneyGreaterThan(args.montoAjuste, limites.maximoRestar)) {
      throw new Error("La resta supera el saldo legalizable disponible");
    }
    if (moneyLessThan(valorObjetivo, saldoLegalizado)) {
      throw new Error("El valor objetivo no puede ser inferior al saldo legalizado");
    }
  }

  if (moneyLessThanOrEqual(valorObjetivo, 0)) {
    throw new Error("El valor legalizable no puede quedar en cero; usa el flujo de anulación");
  }

  return {
    valorLegalizableActual,
    valorObjetivo,
    valorAjuste: fromMoneyCents(subtractMoneyCents(valorObjetivo, valorLegalizableActual)),
    saldoLegalizado,
  };
}

export const obtenerContextoAjustes = query({
  args: {
    secret: v.string(),
    anticipoId: v.id("anticipos"),
    actorUserId: v.string(),
    historialPagination: v.optional(paginationOptsValidator),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.secret);
    const anticipo = await ctx.db.get("anticipos", args.anticipoId);
    if (!anticipo) throw new Error("Anticipo no encontrado");

    const empresa = empresaDeAnticipo(anticipo);
    const { autorizado, rol } = await usuarioTieneRolAjuste(ctx, empresa, args.actorUserId);
    const ultimoActivo = await obtenerUltimoAjusteActivo(ctx, args.anticipoId);
    const historial = args.historialPagination
      ? await ctx.db
          .query("anticiposAjustes")
          .withIndex("by_anticipoId_aplicadoEn", (q) => q.eq("anticipoId", args.anticipoId))
          .order("desc")
          .paginate(args.historialPagination)
      : null;

    const puedeAplicar = autorizado && anticipo.faseActual === "V_PENDIENTE_LEGALIZACION";

    const puedeReversar =
      autorizado &&
      ultimoActivo !== null &&
      (anticipo.faseActual === "V_PENDIENTE_LEGALIZACION" || anticipo.faseActual === "COMPLETADO");

    return {
      empresa,
      resumen: buildResumenAjustes(anticipo),
      limites: buildLimitesAjuste(anticipo),
      faseActual: anticipo.faseActual,
      tipoBolsa: anticipo.tipoBolsa ?? ("general" as const),
      actorRol: rol ?? null,
      capacidades: {
        puedeAplicar,
        puedeReversar,
        ultimoAjusteActivoId: ultimoActivo?._id ?? null,
      },
      historial,
    };
  },
});

export const aplicarAjuste = mutation({
  args: {
    secret: v.string(),
    anticipoId: v.id("anticipos"),
    empresa: v.number(),
    operacionId: v.string(),
    tipo: tipoAjusteAplicacionArg,
    operacion: operacionAjusteArg,
    montoAjuste: v.number(),
    valorEsperado: v.number(),
    motivo: v.string(),
    soporte: v.optional(adjuntoArg),
    actor: actorArg,
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.secret);

    const existente = await ctx.db
      .query("anticiposAjustes")
      .withIndex("by_operacionId", (q) => q.eq("operacionId", args.operacionId))
      .first();
    if (existente) {
      const anticipo = await ctx.db.get("anticipos", existente.anticipoId);
      if (!anticipo) throw new Error("Anticipo no encontrado");
      return {
        ajusteId: existente._id,
        idempotente: true as const,
        resumen: buildResumenAjustes(anticipo),
        limites: buildLimitesAjuste(anticipo),
        faseActual: anticipo.faseActual,
      };
    }

    const anticipo = await ctx.db.get("anticipos", args.anticipoId);
    if (!anticipo) throw new Error("Anticipo no encontrado");

    const empresa = empresaDeAnticipo(anticipo);
    if (empresa !== args.empresa) throw new Error("Empresa no autorizada");

    const { autorizado, rol } = await usuarioTieneRolAjuste(ctx, empresa, args.actor.userId);
    if (!autorizado || !rol || rol !== args.actor.rol) {
      throw new Error("Sin permiso para registrar ajustes");
    }

    const { valorLegalizableActual, valorObjetivo, valorAjuste, saldoLegalizado } =
      validarAplicacionAjuste({
        anticipo,
        tipo: args.tipo,
        operacion: args.operacion,
        montoAjuste: args.montoAjuste,
        valorEsperado: args.valorEsperado,
      });

    const motivo = args.motivo.trim();
    if (!motivo) throw new Error("El motivo es obligatorio");

    const now = Date.now();
    const faseAnterior = anticipo.faseActual;

    await ctx.db.patch("anticipos", args.anticipoId, {
      valorLegalizableActual: valorObjetivo,
      updatedAt: now,
    });

    const anticipoActualizado = (await ctx.db.get("anticipos", args.anticipoId))!;
    const reconciliacion = await reconciliarEstadoTrasAjusteValorLegalizable(
      ctx,
      anticipoActualizado,
      args.actor.userId,
      now,
      motivo
    );

    const ajusteId = await ctx.db.insert("anticiposAjustes", {
      anticipoId: args.anticipoId,
      empresa,
      operacionId: args.operacionId,
      tipo: args.tipo,
      valorAnterior: valorLegalizableActual,
      valorObjetivo,
      valorAjuste,
      saldoLegalizadoAlAplicar: saldoLegalizado,
      faseAnterior,
      fasePosterior: reconciliacion.faseDestino,
      motivo,
      soporte: args.soporte,
      actorUserId: args.actor.userId,
      actorNombre: args.actor.nombre,
      actorEmail: args.actor.email,
      actorRol: args.actor.rol,
      aplicadoEn: now,
    });

    const finalAnticipo = (await ctx.db.get("anticipos", args.anticipoId))!;
    const completado = reconciliacion.faseDestino === "COMPLETADO";
    await scheduleAjusteNotification(
      ctx,
      finalAnticipo,
      "AJUSTE_APLICADO",
      `${motivo}${completado ? " · El anticipo quedó completado." : ""}`,
      reconciliacion.faseDestino
    );

    return {
      ajusteId,
      idempotente: false as const,
      resumen: buildResumenAjustes(finalAnticipo),
      limites: buildLimitesAjuste(finalAnticipo),
      faseActual: finalAnticipo.faseActual,
      completado,
    };
  },
});

export const reversarAjuste = mutation({
  args: {
    secret: v.string(),
    anticipoId: v.id("anticipos"),
    ajusteId: v.id("anticiposAjustes"),
    empresa: v.number(),
    operacionId: v.string(),
    motivo: v.string(),
    actor: actorArg,
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.secret);

    const existente = await ctx.db
      .query("anticiposAjustes")
      .withIndex("by_operacionId", (q) => q.eq("operacionId", args.operacionId))
      .first();
    if (existente) {
      const anticipo = await ctx.db.get("anticipos", existente.anticipoId);
      if (!anticipo) throw new Error("Anticipo no encontrado");
      return {
        ajusteId: existente._id,
        idempotente: true as const,
        resumen: buildResumenAjustes(anticipo),
        limites: buildLimitesAjuste(anticipo),
        faseActual: anticipo.faseActual,
      };
    }

    const anticipo = await ctx.db.get("anticipos", args.anticipoId);
    if (!anticipo) throw new Error("Anticipo no encontrado");

    const empresa = empresaDeAnticipo(anticipo);
    if (empresa !== args.empresa) throw new Error("Empresa no autorizada");

    const { autorizado, rol } = await usuarioTieneRolAjuste(ctx, empresa, args.actor.userId);
    if (!autorizado || !rol || rol !== args.actor.rol) {
      throw new Error("Sin permiso para reversar ajustes");
    }

    if (
      anticipo.faseActual !== "V_PENDIENTE_LEGALIZACION" &&
      anticipo.faseActual !== "COMPLETADO"
    ) {
      throw new Error("El anticipo no admite reversión en su fase actual");
    }

    const ajuste = await ctx.db.get("anticiposAjustes", args.ajusteId);
    if (!ajuste || ajuste.anticipoId !== args.anticipoId) {
      throw new Error("Ajuste no encontrado");
    }
    if (ajuste.reversadoEn !== undefined) {
      throw new Error("Este ajuste ya fue reversado");
    }
    if (ajuste.tipo === "REVERSO") {
      throw new Error("No se puede reversar un movimiento de reverso");
    }

    const ultimoActivo = await obtenerUltimoAjusteActivo(ctx, args.anticipoId);
    if (!ultimoActivo || ultimoActivo._id !== args.ajusteId) {
      throw new Error("Solo se puede reversar el último ajuste activo");
    }

    const saldoLegalizado = getSaldoLegalizadoAnticipo(anticipo);
    if (
      toMoneyCents(ajuste.valorAjuste) > 0 &&
      moneyLessThan(ajuste.valorAnterior, saldoLegalizado)
    ) {
      throw new Error(
        "No se puede reversar este ajuste porque el valor anterior quedaría por debajo de lo legalizado"
      );
    }

    const motivo = args.motivo.trim();
    if (!motivo) throw new Error("El motivo es obligatorio");

    const now = Date.now();
    const valorLegalizableActual = getValorLegalizableAnticipo(anticipo);
    const faseAnterior = anticipo.faseActual;

    await ctx.db.patch("anticipos", args.anticipoId, {
      valorLegalizableActual: ajuste.valorAnterior,
      updatedAt: now,
    });

    const anticipoActualizado = (await ctx.db.get("anticipos", args.anticipoId))!;
    const reconciliacion = await reconciliarEstadoTrasAjusteValorLegalizable(
      ctx,
      anticipoActualizado,
      args.actor.userId,
      now,
      motivo
    );

    const reversoId = await ctx.db.insert("anticiposAjustes", {
      anticipoId: args.anticipoId,
      empresa,
      operacionId: args.operacionId,
      tipo: "REVERSO",
      ajusteOrigenId: args.ajusteId,
      valorAnterior: valorLegalizableActual,
      valorObjetivo: ajuste.valorAnterior,
      valorAjuste: fromMoneyCents(subtractMoneyCents(ajuste.valorAnterior, valorLegalizableActual)),
      saldoLegalizadoAlAplicar: saldoLegalizado,
      faseAnterior,
      fasePosterior: reconciliacion.faseDestino,
      motivo,
      actorUserId: args.actor.userId,
      actorNombre: args.actor.nombre,
      actorEmail: args.actor.email,
      actorRol: args.actor.rol,
      aplicadoEn: now,
    });

    await ctx.db.patch("anticiposAjustes", args.ajusteId, {
      reversadoEn: now,
      reversadoPorAjusteId: reversoId,
    });

    const finalAnticipo = (await ctx.db.get("anticipos", args.anticipoId))!;
    const reabierto =
      faseAnterior === "COMPLETADO" && reconciliacion.faseDestino === "V_PENDIENTE_LEGALIZACION";
    await scheduleAjusteNotification(
      ctx,
      finalAnticipo,
      "AJUSTE_REVERSADO",
      `${motivo}${reabierto ? " · El anticipo fue reabierto." : ""}`,
      reconciliacion.faseDestino
    );

    return {
      ajusteId: reversoId,
      idempotente: false as const,
      resumen: buildResumenAjustes(finalAnticipo),
      limites: buildLimitesAjuste(finalAnticipo),
      faseActual: finalAnticipo.faseActual,
      reabierto,
    };
  },
});
