import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
// actor* args are overwritten with the authenticated caller (see lib/serverActor.ts).
import { queryConActor as query } from "./lib/serverActor";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import {
  REEMBOLSO_ESTADOS_SEGUIMIENTO_ACTIVO,
  isReembolsoEstadoSeguimientoActivo,
  movimientosDisponiblesAggregate,
  type ReembolsoEstadoActivo,
  type ReembolsoResponsableTipo,
} from "./lib/cajaMenorBandeja";
import {
  getPermisosEmpresa,
  puedeObservarReembolsoActivo,
  puedeReasignarReembolso,
  reembolsoTieneAccionParaUsuario,
  resolveCajaVisibilityMode,
} from "./lib/cajaMenorReembolsoPermisos";
import { normalizeEmpresa } from "./lib/normalize";

const BANDEJA_LIST_BATCH_SIZE = 50;

const ETAPAS_PROGRESO = [
  { etapa: "Aprobación líder", key: "lider" as const },
  { etapa: "Revisión", key: "revision" as const },
  { etapa: "Contabilidad", key: "contabilidad" as const },
  { etapa: "Eventos DIAN", key: "eventos_dian" as const },
  { etapa: "Gerencia", key: "gerencia" as const },
  { etapa: "Tesorería", key: "tesoreria" as const },
];

export function buildReembolsoProgreso(reembolso: Doc<"cajasMenoresReembolsos">) {
  const estadoActualIndex = (() => {
    switch (reembolso.estado) {
      case "pendiente_aprobacion_lider":
        return 0;
      case "pendiente_revision":
        return 1;
      case "pendiente_revision_impuestos":
        return 2;
      case "pendiente_eventos_dian":
        return 3;
      case "pendiente_aprobacion":
        return 4;
      case "pendiente_pago_tesoreria":
        return 5;
      default:
        return -1;
    }
  })();

  const completada = (index: number) => {
    switch (index) {
      case 0:
        return Boolean(reembolso.liderDecisionEn);
      case 1:
        return Boolean(reembolso.reviewerDecisionEn);
      case 2:
        return Boolean(reembolso.contadorDecisionEn);
      case 3:
        return Boolean(reembolso.eventosDianDecisionEn);
      case 4:
        return Boolean(reembolso.gfDecisionEn);
      case 5:
        return Boolean(reembolso.comprobanteCargadoEn || reembolso.recibidoEn);
      default:
        return false;
    }
  };

  const omitida = (index: number) => {
    if (estadoActualIndex < 0 || index >= estadoActualIndex) return false;
    return !completada(index);
  };

  return ETAPAS_PROGRESO.map((item, index) => {
    if (index === estadoActualIndex) {
      return { etapa: item.etapa, estado: "actual" as const };
    }
    if (index < estadoActualIndex) {
      if (omitida(index)) {
        return { etapa: item.etapa, estado: "omitida" as const };
      }
      return { etapa: item.etapa, estado: "completada" as const };
    }
    return { etapa: item.etapa, estado: "pendiente" as const };
  });
}

function resolveRoleLabel(
  permisos: Awaited<ReturnType<typeof getPermisosEmpresa>>
) {
  if (permisos.canManage) return "Gerencia Financiera";
  if (permisos.canPayTesoreria) return "Tesorería";
  if (permisos.canReviewContabilidad) return "Contador Impuestos/Contabilidad";
  if (permisos.canReviewEventosDian) return "Eventos DIAN";
  if (permisos.canReviewReembolso) return "Revisor";
  return "Custodio";
}

async function enrichCajaSaldo(ctx: QueryCtx, caja: Doc<"cajasMenores">) {
  const refills = await ctx.db
    .query("cajasMenoresRefills")
    .withIndex("by_cajaMenorId", (q) => q.eq("cajaMenorId", caja._id))
    .collect();
  const totalRefills = refills.reduce((sum, r) => sum + r.refillValue, 0);
  const movimientos = await ctx.db
    .query("facturacionCajaMenorMovimientos")
    .withIndex("by_cajaMenorId", (q) => q.eq("cajaMenorId", caja._id))
    .collect();
  const totalLegalizado = movimientos
    .filter((m) => m.estado !== "anulado")
    .reduce((sum, m) => sum + m.valor, 0);
  const reembolsos = await ctx.db
    .query("cajasMenoresReembolsos")
    .withIndex("by_cajaMenorId", (q) => q.eq("cajaMenorId", caja._id))
    .collect();
  const totalReembolsado = reembolsos
    .filter((r) => r.estado === "recibido")
    .reduce((sum, r) => sum + r.valorTotal, 0);
  const refillPendiente = refills.some((r) => !r.receiptConfirmed);
  const saldoActual = caja.assignedValue + totalRefills + totalReembolsado - totalLegalizado;
  const cerrada = caja.estado === "cerrada";
  return {
    saldoDisponible: cerrada || refillPendiente ? 0 : saldoActual,
  };
}

const reembolsoEstadoActivoValidator = v.union(
  ...REEMBOLSO_ESTADOS_SEGUIMIENTO_ACTIVO.map((estado) => v.literal(estado))
);

const solicitudBandejaValidator = v.object({
  reembolsoId: v.id("cajasMenoresReembolsos"),
  numeroReembolso: v.string(),
  cajaMenorId: v.id("cajasMenores"),
  cajaNombre: v.string(),
  empresaId: v.number(),
  estado: reembolsoEstadoActivoValidator,
  valorTotal: v.number(),
  movimientosCount: v.number(),
  custodio: v.object({ userId: v.string(), nombre: v.string() }),
  responsableActual: v.object({
    userId: v.optional(v.string()),
    nombre: v.string(),
    tipo: v.union(
      v.literal("lider"),
      v.literal("revisor"),
      v.literal("contabilidad"),
      v.literal("eventos_dian"),
      v.literal("gerencia_financiera"),
      v.literal("tesoreria")
    ),
  }),
  creadoEn: v.number(),
  actualizadoEn: v.number(),
  puedeActuar: v.boolean(),
  puedeReasignar: v.boolean(),
  puedeDescargarFormato: v.boolean(),
  apertura: v.union(v.literal("action"), v.literal("readonly")),
  progreso: v.array(
    v.object({
      etapa: v.string(),
      estado: v.union(
        v.literal("completada"),
        v.literal("actual"),
        v.literal("omitida"),
        v.literal("pendiente")
      ),
    })
  ),
  busquedaTexto: v.string(),
  reviewAssignedUserId: v.optional(v.string()),
  reviewAssignedNombre: v.optional(v.string()),
  contadorAsignadoUserId: v.optional(v.string()),
  contadorAsignadoNombre: v.optional(v.string()),
  eventosDianAsignadoUserId: v.optional(v.string()),
  eventosDianAsignadoNombre: v.optional(v.string()),
  causacionCausadasCount: v.optional(v.number()),
  causacionNoCausadasCount: v.optional(v.number()),
  causacionSinRegistroCount: v.optional(v.number()),
});

function mapSolicitudBandejaRow(
  reembolso: Doc<"cajasMenoresReembolsos">,
  caja: Doc<"cajasMenores">,
  permisos: Awaited<ReturnType<typeof getPermisosEmpresa>>,
  actorUserId: string,
  actorRol?: number
) {
  const puedeActuar = reembolsoTieneAccionParaUsuario(
    reembolso,
    actorUserId,
    permisos,
    actorRol
  );
  return {
    reembolsoId: reembolso._id,
    numeroReembolso: reembolso.numeroReembolso ?? String(reembolso._id),
    cajaMenorId: reembolso.cajaMenorId,
    cajaNombre: caja.nombre,
    empresaId: reembolso.empresaId ?? caja.empresa_id,
    estado: reembolso.estado as ReembolsoEstadoActivo,
    valorTotal: reembolso.valorTotal,
    movimientosCount: reembolso.movimientoIds.length,
    custodio: {
      userId: reembolso.custodioUserId,
      nombre: reembolso.custodioNombre,
    },
    responsableActual: {
      userId: reembolso.responsableActualUserId,
      nombre: reembolso.responsableActualNombre ?? "Sin responsable",
      tipo: (reembolso.responsableActualTipo ?? "revisor") as ReembolsoResponsableTipo,
    },
    creadoEn: reembolso.creadoEn,
    actualizadoEn: reembolso.actualizadoEn,
    puedeActuar,
    puedeReasignar: puedeReasignarReembolso(
      reembolso,
      actorUserId,
      permisos,
      actorRol
    ),
    puedeDescargarFormato: Boolean(reembolso.formatoSnapshot),
    apertura: puedeActuar ? ("action" as const) : ("readonly" as const),
    progreso: buildReembolsoProgreso(reembolso),
    busquedaTexto: reembolso.busquedaBandeja ?? "",
    reviewAssignedUserId: reembolso.reviewAssignedUserId,
    reviewAssignedNombre: reembolso.reviewAssignedNombre,
    contadorAsignadoUserId: reembolso.contadorAsignadoUserId,
    contadorAsignadoNombre: reembolso.contadorAsignadoNombre,
    eventosDianAsignadoUserId: reembolso.eventosDianAsignadoUserId,
    eventosDianAsignadoNombre: reembolso.eventosDianAsignadoNombre,
    causacionCausadasCount: reembolso.causacionCausadasCount,
    causacionNoCausadasCount: reembolso.causacionNoCausadasCount,
    causacionSinRegistroCount: reembolso.causacionSinRegistroCount,
  };
}

async function createBandejaContext(ctx: QueryCtx, actorUserId: string, actorRol?: number) {
  const cajaCache = new Map<Id<"cajasMenores">, Doc<"cajasMenores"> | null>();
  const permisosCache = new Map<number, Awaited<ReturnType<typeof getPermisosEmpresa>>>();

  const getCaja = async (cajaMenorId: Id<"cajasMenores">) => {
    if (!cajaCache.has(cajaMenorId)) {
      cajaCache.set(cajaMenorId, await ctx.db.get("cajasMenores", cajaMenorId));
    }
    return cajaCache.get(cajaMenorId) ?? null;
  };

  const getPermisos = async (empresa: number) => {
    if (!permisosCache.has(empresa)) {
      permisosCache.set(
        empresa,
        await getPermisosEmpresa(ctx, empresa, actorUserId, actorRol)
      );
    }
    return permisosCache.get(empresa)!;
  };

  const isVisible = async (reembolso: Doc<"cajasMenoresReembolsos">) => {
    const caja = await getCaja(reembolso.cajaMenorId);
    if (!caja) return false;
    const permisos = await getPermisos(caja.empresa_id);
    const visibilityMode = resolveCajaVisibilityMode(
      caja,
      permisos,
      actorUserId,
      actorRol
    );
    return puedeObservarReembolsoActivo(
      reembolso,
      caja,
      actorUserId,
      permisos,
      actorRol,
      visibilityMode
    );
  };

  const mapVisibleRow = async (reembolso: Doc<"cajasMenoresReembolsos">) => {
    const caja = await getCaja(reembolso.cajaMenorId);
    if (!caja) return null;
    const permisos = await getPermisos(caja.empresa_id);
    return mapSolicitudBandejaRow(reembolso, caja, permisos, actorUserId, actorRol);
  };

  return { getCaja, getPermisos, isVisible, mapVisibleRow };
}

function matchesEmpresaScope(
  reembolso: Doc<"cajasMenoresReembolsos">,
  caja: Doc<"cajasMenores"> | null,
  empresas?: number[]
) {
  if (!empresas?.length) return true;
  const empresaId = reembolso.empresaId ?? caja?.empresa_id;
  if (empresaId === undefined) return false;
  return empresas.includes(normalizeEmpresa(empresaId));
}

export const obtenerResumenBandejaReembolsos = query({
  args: {
    empresas: v.optional(v.array(v.number())),
    actorUserId: v.string(),
    actorRol: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const empresas = args.empresas?.length
      ? args.empresas.map(normalizeEmpresa)
      : undefined;
    const rows = empresas?.length
      ? (
          await Promise.all(
            empresas.map((empresa) =>
              ctx.db
                .query("cajasMenores")
                .withIndex("by_empresa_id", (q) => q.eq("empresa_id", empresa))
                .collect()
            )
          )
        ).flat()
      : await ctx.db.query("cajasMenores").collect();

    let canAccess = false;
    let canGenerate = false;
    let roleLabel = "Custodio";
    let facturasPendientes = 0;
    let valorPendiente = 0;
    let accionesAsignadas = 0;
    let solicitudesActivas = 0;

    const cajas = [];
    for (const caja of rows) {
      if ((caja.estado ?? "activa") === "anulado") continue;
      const permisos = await getPermisosEmpresa(
        ctx,
        caja.empresa_id,
        args.actorUserId,
        args.actorRol
      );
      const isCustodio = caja.assignedUsersIds.includes(args.actorUserId);
      const visibilityMode = resolveCajaVisibilityMode(
        caja,
        permisos,
        args.actorUserId,
        args.actorRol
      );

      const leaderPending = await ctx.db
        .query("cajasMenoresReembolsos")
        .withIndex("by_liderAprobadorUserId_estado", (q) =>
          q
            .eq("liderAprobadorUserId", args.actorUserId)
            .eq("estado", "pendiente_aprobacion_lider")
        )
        .collect();
      const hasLeaderPending = leaderPending.some((r) => r.cajaMenorId === caja._id);

      const hasRoleAccess =
        permisos.canReview ||
        permisos.canManage ||
        permisos.canReviewReembolso ||
        permisos.canReviewContabilidad ||
        permisos.canReviewEventosDian ||
        permisos.canApproveReembolso ||
        permisos.canPayTesoreria ||
        isCustodio ||
        hasLeaderPending;

      if (!hasRoleAccess) {
        if (visibilityMode !== "participant_only") continue;
        const participantReembolsos = await ctx.db
          .query("cajasMenoresReembolsos")
          .withIndex("by_custodioUserId_estado", (q) =>
            q.eq("custodioUserId", args.actorUserId).eq("estado", "pendiente_revision")
          )
          .filter((q) => q.eq(q.field("cajaMenorId"), caja._id))
          .take(1);
        const leaderRows = await ctx.db
          .query("cajasMenoresReembolsos")
          .withIndex("by_liderAprobadorUserId_estado", (q) =>
            q.eq("liderAprobadorUserId", args.actorUserId)
          )
          .take(20);
        const hasParticipant =
          participantReembolsos.length > 0 ||
          leaderRows.some(
            (r) =>
              r.cajaMenorId === caja._id && isReembolsoEstadoSeguimientoActivo(r.estado)
          );
        if (!hasParticipant) continue;
      }

      canAccess = true;
      if (isCustodio) canGenerate = true;
      roleLabel = resolveRoleLabel(permisos);

      const facturasPendientesCount = await movimientosDisponiblesAggregate.count(ctx, {
        namespace: caja._id,
      });
      const facturasPendientesValor =
        (await movimientosDisponiblesAggregate.sum(ctx, { namespace: caja._id })) ?? 0;

      const reembolsosActivos = await ctx.db
        .query("cajasMenoresReembolsos")
        .withIndex("by_cajaMenorId_and_seguimientoActivo_and_actualizadoEn", (q) =>
          q.eq("cajaMenorId", caja._id).eq("seguimientoActivo", true)
        )
        .collect();

      let accionesAsignadasCount = 0;
      let solicitudesVisiblesCount = 0;
      let solicitudesVisiblesValor = 0;
      for (const reembolso of reembolsosActivos) {
        if (
          !puedeObservarReembolsoActivo(
            reembolso,
            caja,
            args.actorUserId,
            permisos,
            args.actorRol,
            visibilityMode
          )
        ) {
          continue;
        }
        solicitudesVisiblesCount += 1;
        solicitudesVisiblesValor += reembolso.valorTotal;
        if (reembolsoTieneAccionParaUsuario(reembolso, args.actorUserId, permisos, args.actorRol)) {
          accionesAsignadasCount += 1;
        }
      }

      facturasPendientes += isCustodio ? facturasPendientesCount : 0;
      valorPendiente += isCustodio ? facturasPendientesValor : 0;
      accionesAsignadas += accionesAsignadasCount;
      solicitudesActivas += solicitudesVisiblesCount;

      const saldo = await enrichCajaSaldo(ctx, caja);
      cajas.push({
        cajaMenorId: caja._id,
        empresaId: caja.empresa_id,
        nombre: caja.nombre,
        estado: (caja.estado ?? "activa") as "activa" | "cerrada" | "anulado",
        saldoDisponible: saldo.saldoDisponible,
        isCustodio,
        canGenerate: isCustodio,
        visibilityMode,
        facturasPendientesCount: isCustodio ? facturasPendientesCount : 0,
        facturasPendientesValor: isCustodio ? facturasPendientesValor : 0,
        solicitudesActivasCount: solicitudesVisiblesCount,
        solicitudesActivasValor: solicitudesVisiblesValor,
        accionesAsignadasCount,
      });
    }

    cajas.sort((a, b) => {
      if (b.accionesAsignadasCount !== a.accionesAsignadasCount) {
        return b.accionesAsignadasCount - a.accionesAsignadasCount;
      }
      if (a.empresaId !== b.empresaId) return a.empresaId - b.empresaId;
      return a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" });
    });

    return {
      canAccess,
      canGenerate,
      roleLabel,
      kpis: {
        facturasPendientes,
        valorPendiente,
        accionesAsignadas,
        solicitudesActivas,
      },
      cajas,
    };
  },
});

export const listarSolicitudesReembolsoBandejaPaginadas = query({
  args: {
    empresas: v.optional(v.array(v.number())),
    actorUserId: v.string(),
    actorRol: v.optional(v.number()),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(solicitudBandejaValidator),
  handler: async (ctx, args) => {
    const empresas = args.empresas?.length
      ? args.empresas.map(normalizeEmpresa)
      : undefined;
    const { getCaja, isVisible, mapVisibleRow } = await createBandejaContext(
      ctx,
      args.actorUserId,
      args.actorRol
    );

    const target = Math.min(Math.max(args.paginationOpts.numItems, 1), 200);
    const page = [];
    const seen = new Set<string>();
    let cursor = args.paginationOpts.cursor;
    let isDone = false;

    while (page.length < target) {
      const batch = await ctx.db
        .query("cajasMenoresReembolsos")
        .withIndex("by_seguimientoActivo_and_actualizadoEn", (q) =>
          q.eq("seguimientoActivo", true)
        )
        .order("desc")
        .paginate({
          numItems: BANDEJA_LIST_BATCH_SIZE,
          cursor,
        });

      for (const reembolso of batch.page) {
        if (seen.has(reembolso._id)) continue;
        seen.add(reembolso._id);
        const caja = await getCaja(reembolso.cajaMenorId);
        if (!matchesEmpresaScope(reembolso, caja, empresas)) continue;
        if (!(await isVisible(reembolso))) continue;
        const row = await mapVisibleRow(reembolso);
        if (!row) continue;
        page.push(row);
        if (page.length >= target) break;
      }

      isDone = batch.isDone;
      cursor = batch.continueCursor;
      if (batch.isDone) break;
    }

    page.sort((a, b) => b.actualizadoEn - a.actualizadoEn);

    return {
      page,
      isDone,
      continueCursor: cursor ?? "",
    };
  },
});

const movimientoBandejaValidator = v.object({
  movimientoId: v.id("facturacionCajaMenorMovimientos"),
  facturaId: v.id("facturacionFacturas"),
  proveedor: v.string(),
  numeroFactura: v.string(),
  concepto: v.string(),
  centroCostoCodigo: v.string(),
  centroCostoNombre: v.string(),
  fechaPago: v.string(),
  valor: v.number(),
  origen: v.union(v.literal("factura_sistema"), v.literal("recibo_fisico")),
  causado: v.optional(v.union(v.boolean(), v.null())),
  numeroFp: v.optional(v.union(v.string(), v.null())),
});

export const listarMovimientosPendientesCajaPaginados = query({
  args: {
    cajaMenorId: v.id("cajasMenores"),
    actorUserId: v.string(),
    actorRol: v.optional(v.number()),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(movimientoBandejaValidator),
  handler: async (ctx, args) => {
    const caja = await ctx.db.get("cajasMenores", args.cajaMenorId);
    if (!caja) {
      return { page: [], isDone: true, continueCursor: "" };
    }
    if (!caja.assignedUsersIds.includes(args.actorUserId)) {
      return { page: [], isDone: true, continueCursor: "" };
    }

    const paginated = await ctx.db
      .query("facturacionCajaMenorMovimientos")
      .withIndex("by_cajaMenorId_estado", (q) =>
        q.eq("cajaMenorId", args.cajaMenorId).eq("estado", "pendiente_reembolso")
      )
      .filter((q) => q.eq(q.field("reembolsoId"), undefined))
      .order("desc")
      .paginate({
        ...args.paginationOpts,
        numItems: Math.min(args.paginationOpts.numItems, 20),
      });

    const page = await Promise.all(
      paginated.page.map(async (movimiento) => {
        const factura = await ctx.db.get("facturacionFacturas", movimiento.facturaId);
        return {
          movimientoId: movimiento._id,
          facturaId: movimiento.facturaId,
          proveedor: movimiento.nombreEmpresa,
          numeroFactura:
            movimiento.origen === "recibo_fisico"
              ? "Recibo físico"
              : (factura?.numeroFactura ?? String(movimiento.facturaId)),
          concepto: movimiento.concepto,
          centroCostoCodigo: movimiento.centroCostoCodigo,
          centroCostoNombre: movimiento.centroCostoNombre,
          fechaPago: movimiento.fechaPago,
          valor: movimiento.valor,
          origen: movimiento.origen,
          causado: factura?.causado === undefined ? null : factura.causado,
          numeroFp: factura?.causado === true ? (factura.numeroFp ?? null) : null,
        };
      })
    );

    return {
      page,
      isDone: paginated.isDone,
      continueCursor: paginated.continueCursor,
    };
  },
});
