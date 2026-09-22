import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { computeSlaState, isSlaPhase, type SlaPhase } from "./facturacionBusinessTime";
import {
  classifyGrupoFase,
  classifyTipoFlujo,
  incluyeEnTotalesHeadline,
  inferFaseIniciadaEn,
  normalizeOwnerEmail,
  ownerIdentityKey,
  resolveValidOwners,
  type ValidOwner,
  type OwnershipResult,
} from "./facturacionOwnership";
import { resolveFacturacionReportState } from "./facturacionReportState";
import {
  cajaMenorOwnersFromProceso,
  loadCajaMenorProjectionOverlay,
} from "./cajaMenorProjection";
import { getValorContable } from "./valorContable";
import { normalizeEmpresa } from "./normalize";

type Ctx = MutationCtx | QueryCtx;

function fechaEmisionMs(fechaEmision: string): number {
  const key = fechaEmision.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) {
    return 0;
  }
  return new Date(`${key}T00:00:00-05:00`).getTime();
}

function normalizeSearchTerm(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function buildDashboardSearchText(args: {
  numeroFactura: string;
  cufe?: string;
  proveedorNombre: string;
  proveedorNit: string;
  descripcion?: string;
  numeroFp?: string;
  owners: ValidOwner[];
}): string {
  const ownerTerms = args.owners
    .flatMap((o) => [o.nombre, o.email, o.userId ?? ""])
    .filter(Boolean);
  return [
    args.numeroFactura,
    args.cufe ?? "",
    args.proveedorNombre,
    args.proveedorNit,
    args.descripcion ?? "",
    args.numeroFp ?? "",
    ...ownerTerms,
  ]
    .join(" ")
    .split(/\s+/)
    .map(normalizeSearchTerm)
    .join(" ");
}

function resolveReporteCierre(args: {
  factura: Doc<"facturacionFacturas">;
  tarea: Doc<"facturacionTareas"> | null;
  asignaciones: Doc<"facturacionAsignaciones">[];
  aprobaciones: Doc<"facturacionAprobaciones">[];
  esActiva: boolean;
  esPeaje: boolean;
}) {
  if (!args.tarea || args.esActiva || args.esPeaje) {
    return { cierreReporteEn: undefined, cierreReporteEstimado: undefined };
  }

  if (args.tarea.finalizadoEn != null && args.tarea.finalizadoEn > 0) {
    return {
      cierreReporteEn: args.tarea.finalizadoEn,
      cierreReporteEstimado: false,
    };
  }

  const latestApproval = Math.max(
    0,
    ...args.aprobaciones
      .map((aprobacion) => aprobacion.creadoEn)
      .filter((value): value is number => typeof value === "number" && value > 0)
  );
  if (latestApproval > 0) {
    return { cierreReporteEn: latestApproval, cierreReporteEstimado: true };
  }

  const latestAssignmentEvent = Math.max(
    0,
    ...args.asignaciones
      .flatMap((asignacion) => [asignacion.fechaCompletado, asignacion.fechaAsignacion])
      .filter((value): value is number => typeof value === "number" && value > 0)
  );
  if (latestAssignmentEvent > 0) {
    return { cierreReporteEn: latestAssignmentEvent, cierreReporteEstimado: true };
  }

  const fallback = [args.tarea.actualizadoEn, args.factura.actualizadoEn].find(
    (value): value is number => typeof value === "number" && value > 0
  );
  return {
    cierreReporteEn: fallback,
    cierreReporteEstimado: fallback !== undefined ? true : undefined,
  };
}

function counterKeysForItem(item: {
  grupoFase: string;
  faseActual: string;
  slaEstado: string;
  incluyeEnTotales: boolean;
  esActiva: boolean;
  esLegacyJefeDirecto: boolean;
  integrityIssues: string[];
}): string[] {
  if (!item.incluyeEnTotales) {
    const keys: string[] = [];
    if (item.esActiva) {
      keys.push(`activo_excluido:${item.grupoFase}`);
    }
    return keys;
  }

  const keys = ["trend:ingresada"];
  if (!item.esActiva) {
    if (item.grupoFase === "terminal") keys.push("trend:finalizada");
    return keys;
  }

  keys.push(
    `grupo:${item.grupoFase}`,
    `fase:${item.faseActual}`,
    `sla:${item.slaEstado}`,
    `wip:${item.faseActual}:${item.slaEstado}`,
    "activo:total"
  );

  if (item.grupoFase === "lideres" && !item.esLegacyJefeDirecto) {
    keys.push("kpi:lideres");
  }
  if (item.grupoFase === "fases_contables") {
    keys.push("kpi:fases_contables");
  }
  if (item.grupoFase === "tesoreria") {
    keys.push("kpi:tesoreria");
  }
  if (item.slaEstado === "breached") {
    keys.push("kpi:sla_vencido");
  }
  for (const issue of item.integrityIssues) {
    keys.push(`integrity:${issue}`);
  }
  return keys;
}

async function adjustCounter(
  ctx: MutationCtx,
  empresa: number,
  clave: string,
  deltaCount: number,
  moneda: string,
  deltaMonto: number,
  now: number,
  deltaMontoAPagar = 0
) {
  if (deltaCount === 0 && deltaMonto === 0 && deltaMontoAPagar === 0) return;

  const existing = await ctx.db
    .query("facturacionDashboardContadores")
    .withIndex("by_empresa_clave", (q) => q.eq("empresa", empresa).eq("clave", clave))
    .unique();

  if (!existing) {
    if (deltaCount < 0 && deltaMonto === 0 && deltaMontoAPagar === 0) return;
    await ctx.db.insert("facturacionDashboardContadores", {
      empresa,
      clave,
      count: Math.max(0, deltaCount),
      montosPorMoneda: deltaMonto !== 0 ? { [moneda]: deltaMonto } : {},
      ...(deltaMontoAPagar !== 0 ? { montosAPagarPorMoneda: { [moneda]: deltaMontoAPagar } } : {}),
      actualizadoEn: now,
    });
    return;
  }

  const montos = { ...existing.montosPorMoneda };
  if (deltaMonto !== 0) {
    montos[moneda] = (montos[moneda] ?? 0) + deltaMonto;
    if (Math.abs(montos[moneda]!) < 0.0001) delete montos[moneda];
  }

  const montosAPagar = { ...(existing.montosAPagarPorMoneda ?? {}) };
  if (deltaMontoAPagar !== 0) {
    montosAPagar[moneda] = (montosAPagar[moneda] ?? 0) + deltaMontoAPagar;
    if (Math.abs(montosAPagar[moneda]!) < 0.0001) delete montosAPagar[moneda];
  }

  await ctx.db.patch("facturacionDashboardContadores", existing._id, {
    count: Math.max(0, existing.count + deltaCount),
    montosPorMoneda: montos,
    ...(Object.keys(montosAPagar).length > 0
      ? { montosAPagarPorMoneda: montosAPagar }
      : existing.montosAPagarPorMoneda
        ? { montosAPagarPorMoneda: montosAPagar }
        : {}),
    actualizadoEn: now,
  });
}

async function adjustCounterDia(
  ctx: MutationCtx,
  empresa: number,
  fechaEmision: string,
  clave: string,
  deltaCount: number,
  moneda: string,
  deltaMonto: number,
  now: number,
  deltaMontoAPagar = 0
) {
  if (deltaCount === 0 && deltaMonto === 0 && deltaMontoAPagar === 0) return;

  const existing = await ctx.db
    .query("facturacionDashboardContadoresDia")
    .withIndex("by_empresa_fechaEmision_clave", (q) =>
      q.eq("empresa", empresa).eq("fechaEmision", fechaEmision).eq("clave", clave)
    )
    .unique();

  if (!existing) {
    if (deltaCount < 0 && deltaMonto === 0 && deltaMontoAPagar === 0) return;
    await ctx.db.insert("facturacionDashboardContadoresDia", {
      empresa,
      fechaEmision,
      clave,
      count: Math.max(0, deltaCount),
      montosPorMoneda: deltaMonto !== 0 ? { [moneda]: deltaMonto } : {},
      ...(deltaMontoAPagar !== 0 ? { montosAPagarPorMoneda: { [moneda]: deltaMontoAPagar } } : {}),
      actualizadoEn: now,
    });
    return;
  }

  const montos = { ...existing.montosPorMoneda };
  if (deltaMonto !== 0) {
    montos[moneda] = (montos[moneda] ?? 0) + deltaMonto;
    if (Math.abs(montos[moneda]!) < 0.0001) delete montos[moneda];
  }

  const montosAPagar = { ...(existing.montosAPagarPorMoneda ?? {}) };
  if (deltaMontoAPagar !== 0) {
    montosAPagar[moneda] = (montosAPagar[moneda] ?? 0) + deltaMontoAPagar;
    if (Math.abs(montosAPagar[moneda]!) < 0.0001) delete montosAPagar[moneda];
  }

  await ctx.db.patch("facturacionDashboardContadoresDia", existing._id, {
    count: Math.max(0, existing.count + deltaCount),
    montosPorMoneda: montos,
    ...(Object.keys(montosAPagar).length > 0
      ? { montosAPagarPorMoneda: montosAPagar }
      : existing.montosAPagarPorMoneda
        ? { montosAPagarPorMoneda: montosAPagar }
        : {}),
    actualizadoEn: now,
  });
}

async function applyCounterDelta(
  ctx: MutationCtx,
  empresa: number,
  fechaEmision: string,
  keys: string[],
  sign: 1 | -1,
  moneda: string,
  monto: number,
  now: number,
  montoAPagar = 0
) {
  for (const clave of keys) {
    await adjustCounter(ctx, empresa, clave, sign, moneda, sign * monto, now, sign * montoAPagar);
    await adjustCounterDia(
      ctx,
      empresa,
      fechaEmision,
      clave,
      sign,
      moneda,
      sign * monto,
      now,
      sign * montoAPagar
    );
  }
}

async function loadSlaUmbral(ctx: Ctx, empresa: number, fase: string): Promise<number | null> {
  if (!isSlaPhase(fase)) return null;
  const config = await ctx.db
    .query("facturacionSlaConfiguracion")
    .withIndex("by_empresa_fase", (q) => q.eq("empresa", empresa).eq("fase", fase as SlaPhase))
    .unique();
  if (!config?.habilitado) return null;
  if (config.umbralDiasLaborales == null || config.umbralDiasLaborales <= 0) {
    return null;
  }
  return config.umbralDiasLaborales;
}

type ReportePersonaIdentity = {
  identityKey: string;
  userId?: string;
  email: string;
  nombre: string;
};

function identityFromAssignment(
  asignacion: Doc<"facturacionAsignaciones">
): ReportePersonaIdentity {
  const email = normalizeOwnerEmail(asignacion.asignadoAEmail);
  return {
    identityKey: ownerIdentityKey({
      userId: asignacion.asignadoAUserId,
      email,
    }),
    ...(asignacion.asignadoAUserId ? { userId: asignacion.asignadoAUserId } : {}),
    email,
    nombre: asignacion.asignadoANombre,
  };
}

function identityFromOwner(owner: ValidOwner): ReportePersonaIdentity {
  const email = normalizeOwnerEmail(owner.email);
  return {
    identityKey: ownerIdentityKey({ userId: owner.userId, email }),
    ...(owner.userId ? { userId: owner.userId } : {}),
    email,
    nombre: owner.nombre,
  };
}

function buildReporteParticipantGroups(asignaciones: Doc<"facturacionAsignaciones">[]) {
  const groups = new Map<
    string,
    ReportePersonaIdentity & {
      primeraParticipacionEn: number;
      ultimaParticipacionEn: number;
      cantidadMovimientos: number;
    }
  >();

  for (const asignacion of asignaciones) {
    const identity = identityFromAssignment(asignacion);
    const fecha = asignacion.fechaAsignacion;
    const current = groups.get(identity.identityKey);
    if (!current) {
      groups.set(identity.identityKey, {
        ...identity,
        primeraParticipacionEn: fecha,
        ultimaParticipacionEn: fecha,
        cantidadMovimientos: 1,
      });
      continue;
    }

    current.primeraParticipacionEn = Math.min(current.primeraParticipacionEn, fecha);
    current.ultimaParticipacionEn = Math.max(current.ultimaParticipacionEn, fecha);
    current.cantidadMovimientos += 1;
    if (!current.nombre && identity.nombre) current.nombre = identity.nombre;
    if (!current.email && identity.email) current.email = identity.email;
  }

  return groups;
}

async function syncReportePersona(
  ctx: MutationCtx,
  args: {
    empresa: number;
    identity: ReportePersonaIdentity;
    historicalDelta: number;
    currentDelta: number;
    removedLatestParticipationEn: number;
    addedLatestParticipationEn: number;
    nowMs: number;
  }
) {
  const existing = await ctx.db
    .query("facturacionReportePersonas")
    .withIndex("by_empresa_identityKey", (q) =>
      q.eq("empresa", args.empresa).eq("identityKey", args.identity.identityKey)
    )
    .unique();

  const historicalCount = Math.max(
    0,
    (existing?.cantidadFacturasHistoricamenteParticipadas ?? 0) + args.historicalDelta
  );
  const currentCount = Math.max(0, (existing?.cantidadFacturasActuales ?? 0) + args.currentDelta);

  if (historicalCount === 0 && currentCount === 0) {
    if (existing) await ctx.db.delete("facturacionReportePersonas", existing._id);
    return;
  }

  let latestParticipation = Math.max(
    existing?.ultimaParticipacionEn ?? 0,
    args.addedLatestParticipationEn
  );
  // A refresh can remove the row that supplied the directory's latest date.
  // Recover the replacement with one indexed read instead of scanning every
  // participant for this identity. This is the hot path during the backfill.
  if (
    args.removedLatestParticipationEn > 0 &&
    latestParticipation <= args.removedLatestParticipationEn
  ) {
    const latest = await ctx.db
      .query("facturacionReporteParticipantes")
      .withIndex("by_empresa_identityKey_ultimaParticipacionEn", (q) =>
        q.eq("empresa", args.empresa).eq("identityKey", args.identity.identityKey)
      )
      .order("desc")
      .first();
    latestParticipation = latest?.ultimaParticipacionEn ?? 0;
  }

  const searchText = [
    args.identity.nombre,
    args.identity.email,
    args.identity.userId ?? "",
    args.identity.identityKey,
  ]
    .join(" ")
    .split(/\s+/)
    .map(normalizeSearchTerm)
    .join(" ");
  const data = {
    empresa: args.empresa,
    identityKey: args.identity.identityKey,
    ...(args.identity.userId ? { userId: args.identity.userId } : {}),
    email: args.identity.email,
    nombre: args.identity.nombre,
    searchText,
    cantidadFacturasActuales: currentCount,
    cantidadFacturasHistoricamenteParticipadas: historicalCount,
    ultimaParticipacionEn: latestParticipation,
    actualizadoEn: args.nowMs,
  };

  if (existing) await ctx.db.patch("facturacionReportePersonas", existing._id, data);
  else await ctx.db.insert("facturacionReportePersonas", data);
}

async function syncReporteParticipantes(
  ctx: MutationCtx,
  args: {
    itemId: Id<"facturacionDashboardItems">;
    facturaId: Id<"facturacionFacturas">;
    empresa: number;
    fechaEmisionMs: number;
    asignaciones: Doc<"facturacionAsignaciones">[];
    owners: ValidOwner[];
    cajaMenorParticipantes?: Array<{
      identityKey: string;
      userId?: string;
      email: string;
      nombre: string;
      primeraParticipacionEn: number;
      ultimaParticipacionEn: number;
      cantidadMovimientos: number;
    }>;
    nowMs: number;
  }
) {
  const previousOwners: Doc<"facturacionDashboardResponsables">[] = [];
  for await (const row of ctx.db
    .query("facturacionDashboardResponsables")
    .withIndex("by_facturaId", (q) => q.eq("facturaId", args.facturaId))) {
    previousOwners.push(row);
  }

  const previousRows: Doc<"facturacionReporteParticipantes">[] = [];
  for await (const row of ctx.db
    .query("facturacionReporteParticipantes")
    .withIndex("by_facturaId", (q) => q.eq("facturaId", args.facturaId))) {
    previousRows.push(row);
  }

  const changes = new Map<
    string,
    {
      identity: ReportePersonaIdentity;
      historicalDelta: number;
      currentDelta: number;
      removedLatestParticipationEn: number;
      addedLatestParticipationEn: number;
    }
  >();
  const previousOwnerKeys = new Set<string>();
  const getChange = (identity: ReportePersonaIdentity) => {
    const existing = changes.get(identity.identityKey);
    if (existing) {
      if (!existing.identity.nombre && identity.nombre) existing.identity.nombre = identity.nombre;
      if (!existing.identity.email && identity.email) existing.identity.email = identity.email;
      if (!existing.identity.userId && identity.userId) existing.identity.userId = identity.userId;
      return existing;
    }
    const change = {
      identity: { ...identity },
      historicalDelta: 0,
      currentDelta: 0,
      removedLatestParticipationEn: 0,
      addedLatestParticipationEn: 0,
    };
    changes.set(identity.identityKey, change);
    return change;
  };

  for (const row of previousRows) {
    const identity = {
      identityKey: row.identityKey,
      ...(row.userId ? { userId: row.userId } : {}),
      email: row.email,
      nombre: row.nombre,
    };
    const change = getChange(identity);
    change.historicalDelta -= 1;
    change.removedLatestParticipationEn = Math.max(
      change.removedLatestParticipationEn,
      row.ultimaParticipacionEn
    );
    await ctx.db.delete("facturacionReporteParticipantes", row._id);
  }
  for (const row of previousOwners) {
    const identity = {
      identityKey: row.userId ? `id:${row.userId}` : `email:${row.email}`,
      ...(row.userId ? { userId: row.userId } : {}),
      email: row.email,
      nombre: row.nombre,
    };
    // The directory counts invoices, not owner rows. A malformed historical
    // projection can contain duplicate owner rows for one invoice, so only
    // apply one removal per identity here.
    if (!previousOwnerKeys.has(identity.identityKey)) {
      previousOwnerKeys.add(identity.identityKey);
      getChange(identity).currentDelta -= 1;
    }
  }

  const groups = buildReporteParticipantGroups(args.asignaciones);
  for (const group of groups.values()) {
    await ctx.db.insert("facturacionReporteParticipantes", {
      facturaId: args.facturaId,
      itemId: args.itemId,
      empresa: args.empresa,
      identityKey: group.identityKey,
      ...(group.userId ? { userId: group.userId } : {}),
      email: group.email,
      nombre: group.nombre,
      primeraParticipacionEn: group.primeraParticipacionEn,
      ultimaParticipacionEn: group.ultimaParticipacionEn,
      cantidadMovimientos: group.cantidadMovimientos,
      fechaEmisionMs: args.fechaEmisionMs,
      actualizadoEn: args.nowMs,
    });
    const change = getChange(group);
    change.historicalDelta += 1;
    change.addedLatestParticipationEn = Math.max(
      change.addedLatestParticipationEn,
      group.ultimaParticipacionEn
    );
  }

  for (const group of args.cajaMenorParticipantes ?? []) {
    await ctx.db.insert("facturacionReporteParticipantes", {
      facturaId: args.facturaId,
      itemId: args.itemId,
      empresa: args.empresa,
      identityKey: group.identityKey,
      ...(group.userId ? { userId: group.userId } : {}),
      email: group.email,
      nombre: group.nombre,
      primeraParticipacionEn: group.primeraParticipacionEn,
      ultimaParticipacionEn: group.ultimaParticipacionEn,
      cantidadMovimientos: group.cantidadMovimientos,
      fechaEmisionMs: args.fechaEmisionMs,
      actualizadoEn: args.nowMs,
    });
    const change = getChange({
      identityKey: group.identityKey,
      ...(group.userId ? { userId: group.userId } : {}),
      email: group.email,
      nombre: group.nombre,
    });
    change.historicalDelta += 1;
    change.addedLatestParticipationEn = Math.max(
      change.addedLatestParticipationEn,
      group.ultimaParticipacionEn
    );
  }

  const newOwnerKeys = new Set<string>();
  for (const owner of args.owners) {
    const identity = identityFromOwner(owner);
    if (!newOwnerKeys.has(identity.identityKey)) {
      newOwnerKeys.add(identity.identityKey);
      getChange(identity).currentDelta += 1;
    }
  }

  for (const change of changes.values()) {
    await syncReportePersona(ctx, {
      empresa: args.empresa,
      identity: change.identity,
      historicalDelta: change.historicalDelta,
      currentDelta: change.currentDelta,
      removedLatestParticipationEn: change.removedLatestParticipationEn,
      addedLatestParticipationEn: change.addedLatestParticipationEn,
      nowMs: args.nowMs,
    });
  }
}

export async function refrescarProyeccionFactura(
  ctx: MutationCtx,
  facturaId: Id<"facturacionFacturas">,
  nowMs: number = Date.now()
) {
  const factura = await ctx.db.get("facturacionFacturas", facturaId);
  if (!factura) {
    await eliminarProyeccionFactura(ctx, facturaId, nowMs);
    return;
  }

  const empresa = normalizeEmpresa(factura.empresa, 0);
  const tarea = await ctx.db
    .query("facturacionTareas")
    .withIndex("by_facturaId", (q) => q.eq("facturaId", facturaId))
    .unique();
  const peajesContabilidad = factura.esPeaje
    ? await ctx.db
        .query("facturacionPeajesContabilidad")
        .withIndex("by_facturaId", (q) => q.eq("facturaId", facturaId))
        .unique()
    : null;

  const asignaciones: Doc<"facturacionAsignaciones">[] = [];
  for await (const asignacion of ctx.db
    .query("facturacionAsignaciones")
    .withIndex("by_facturaId", (q) => q.eq("facturaId", facturaId))) {
    asignaciones.push(asignacion);
  }

  const aprobaciones: Doc<"facturacionAprobaciones">[] = [];
  for await (const aprobacion of ctx.db
    .query("facturacionAprobaciones")
    .withIndex("by_facturaId", (q) => q.eq("facturaId", facturaId))) {
    aprobaciones.push(aprobacion);
  }

  const ownership = resolveValidOwners({
    tarea: tarea
      ? {
          _id: String(tarea._id),
          estado: tarea.estado,
          grupoAsignacionActualId: tarea.grupoAsignacionActualId,
          currentAsignacionId: tarea.currentAsignacionId ? String(tarea.currentAsignacionId) : null,
        }
      : null,
    asignaciones: asignaciones.map((a) => ({
      _id: String(a._id),
      tareaId: a.tareaId ? String(a.tareaId) : null,
      estado: a.estado,
      fase: a.fase,
      grupoId: a.grupoId,
      asignadoAUserId: a.asignadoAUserId,
      asignadoANombre: a.asignadoANombre,
      asignadoAEmail: a.asignadoAEmail,
      rol: a.rol,
      fechaAsignacion: a.fechaAsignacion,
    })),
    factura: {
      _id: String(factura._id),
      esPeaje: factura.esPeaje,
      esLegalizacionAnticipo: factura.esLegalizacionAnticipo,
      esLegalizacionCajaMenor: factura.esLegalizacionCajaMenor,
      documentoClase: factura.documentoClase,
      anticipoLiderUserId: factura.anticipoLiderUserId,
      anticipoLiderNombre: factura.anticipoLiderNombre,
      anticipoLiderEmail: factura.anticipoLiderEmail,
      cajaMenorMarcadorUserId: factura.cajaMenorMarcadorUserId,
      cajaMenorMarcadorNombre: factura.cajaMenorMarcadorNombre,
      cajaMenorMarcadorEmail: factura.cajaMenorMarcadorEmail,
    },
  });

  const tipoFlujo = classifyTipoFlujo(factura);
  const incluyeEnTotales = incluyeEnTotalesHeadline(tipoFlujo);
  const reportState = resolveFacturacionReportState({
    esPeaje: factura.esPeaje,
    peajesCruce: factura.peajesCruce,
    estadoContable: peajesContabilidad?.estado,
    tareaEstado: tarea?.estado,
  });

  const cajaMenorOverlay = await loadCajaMenorProjectionOverlay(ctx, {
    facturaId,
    factura,
    tarea,
    aprobaciones,
    nowMs,
  });

  const faseActual = cajaMenorOverlay?.fasePublica ?? reportState.faseActual;
  const estadoListado = cajaMenorOverlay?.fasePublica ?? reportState.estadoListado;
  let ownershipResolved = ownership;
  if (cajaMenorOverlay) {
    const cajaOwners = cajaMenorOwnersFromProceso(cajaMenorOverlay, nowMs);
    ownershipResolved = {
      ...ownership,
      owners: cajaOwners,
      esActiva: cajaMenorOverlay.esTerminal ? false : ownership.esActiva,
      integrityIssues:
        cajaOwners.length === 0 && !cajaMenorOverlay.esTerminal
          ? ([...new Set([...ownership.integrityIssues, "sin_responsable"])] as OwnershipResult["integrityIssues"])
          : ownership.integrityIssues.filter((issue) => issue !== "sin_responsable"),
    };
  }

  const grupoFase = classifyGrupoFase(faseActual, ownershipResolved.esPeaje);
  const esLegacyJefeDirecto = faseActual === "jefe_directo";

  let faseIniciadaEn = tarea?.faseIniciadaEn;
  let faseIniciadaEnEstimado = tarea?.faseIniciadaEnEstimado;
  if (tarea && ownershipResolved.esActiva && !faseIniciadaEn) {
    const inferred = inferFaseIniciadaEn({
      tarea: {
        estado: tarea.estado,
        faseIniciadaEn: tarea.faseIniciadaEn,
        actualizadoEn: tarea.actualizadoEn,
        creadoEn: tarea.creadoEn,
        grupoAsignacionActualId: tarea.grupoAsignacionActualId,
      },
      asignaciones: asignaciones.map((a) => ({
        _id: String(a._id),
        tareaId: a.tareaId ? String(a.tareaId) : null,
        estado: a.estado,
        fase: a.fase,
        grupoId: a.grupoId,
        asignadoAUserId: a.asignadoAUserId,
        asignadoANombre: a.asignadoANombre,
        asignadoAEmail: a.asignadoAEmail,
        rol: a.rol,
        fechaAsignacion: a.fechaAsignacion,
      })),
      aprobaciones: aprobaciones.map((a) => ({
        estadoNuevo: a.estadoNuevo,
        creadoEn: a.creadoEn,
      })),
    });
    faseIniciadaEn = inferred.faseIniciadaEn;
    faseIniciadaEnEstimado = inferred.estimado;
    await ctx.db.patch("facturacionTareas", tarea._id, {
      faseIniciadaEn,
      faseIniciadaEnEstimado,
    });
  }

  const umbral = ownershipResolved.esActiva
    ? await loadSlaUmbral(ctx, empresa, faseActual)
    : null;

  const sla = computeSlaState({
    faseIniciadaEn,
    umbralDiasLaborales: umbral,
    nowMs,
    esActiva: ownershipResolved.esActiva && incluyeEnTotales && !ownershipResolved.esPeaje,
  });

  const integrityIssues = [
    ...ownershipResolved.integrityIssues,
    ...(sla.estado === "sin_sla" &&
    ownershipResolved.esActiva &&
    incluyeEnTotales &&
    isSlaPhase(faseActual)
      ? (["fase_sin_sla"] as const)
      : []),
  ];

  const valorContable = getValorContable(factura);
  const valorAPagar =
    factura.esLegalizacionAnticipo && factura.valorAPagar !== undefined
      ? factura.valorAPagar
      : undefined;
  const emisionMs = fechaEmisionMs(factura.fechaEmision);
  const faseAgeMs = faseIniciadaEn ? Math.max(0, nowMs - faseIniciadaEn) : 0;
  let cierreReporte = resolveReporteCierre({
    factura,
    tarea,
    asignaciones,
    aprobaciones,
    esActiva: ownershipResolved.esActiva,
    esPeaje: ownershipResolved.esPeaje,
  });
  if (cajaMenorOverlay?.cierreReporteEn) {
    cierreReporte = {
      cierreReporteEn: cajaMenorOverlay.cierreReporteEn,
      cierreReporteEstimado: false,
    };
  }

  const nextItem = {
    facturaId,
    empresa,
    numeroFactura: factura.numeroFactura,
    cufe: factura.cufe,
    proveedorNombre: factura.proveedorNombre,
    proveedorNit: factura.proveedorNit,
    searchText: buildDashboardSearchText({
      numeroFactura: factura.numeroFactura,
      cufe: factura.cufe,
      proveedorNombre: factura.proveedorNombre,
      proveedorNit: factura.proveedorNit,
      descripcion: factura.descripcion,
      numeroFp: factura.causado === true ? factura.numeroFp : undefined,
      owners: ownershipResolved.owners,
    }),
    ingresadaEn: factura.creadoEn,
    origen: factura.origen,
    descripcion: factura.descripcion,
    totalFactura: factura.total,
    esFisico: factura.isFisico,
    estadoListado,
    tieneTarea: Boolean(tarea),
    ...(cierreReporte.cierreReporteEn !== undefined
      ? { cierreReporteEn: cierreReporte.cierreReporteEn }
      : {}),
    ...(cierreReporte.cierreReporteEstimado !== undefined
      ? { cierreReporteEstimado: cierreReporte.cierreReporteEstimado }
      : {}),
    tieneDatosEstimados: Boolean(faseIniciadaEnEstimado || cierreReporte.cierreReporteEstimado),
    fechaEmision: factura.fechaEmision.slice(0, 10),
    fechaEmisionMs: emisionMs,
    tipoFlujo,
    documentoClase: (factura.documentoClase ??
      "factura") as Doc<"facturacionDashboardItems">["documentoClase"],
    incluyeEnTotales,
    faseActual,
    grupoFase,
    grupoAsignacionActualId: tarea?.grupoAsignacionActualId,
    valorContable,
    ...(valorAPagar !== undefined ? { valorAPagar } : {}),
    moneda: factura.moneda || "COP",
    faseIniciadaEn,
    faseIniciadaEnEstimado,
    finalizadoEn: tarea?.finalizadoEn,
    slaEstado: sla.estado,
    slaUmbralDias: sla.umbralDias,
    slaAlertaEn: sla.alertaEn,
    slaVenceEn: sla.venceEn,
    integrityIssues: integrityIssues as Doc<"facturacionDashboardItems">["integrityIssues"],
    esActiva: ownershipResolved.esActiva,
    esLegacyJefeDirecto,
    sortBreached: sla.estado === "breached" ? 1 : 0,
    sortWarning: sla.estado === "warning" ? 1 : 0,
    sortFaseAgeMs: faseAgeMs,
    sortFechaEmisionMs: emisionMs,
    ...(factura.causado !== undefined ? { causado: factura.causado } : {}),
    ...(factura.causado === true && factura.numeroFp
      ? { numeroFp: factura.numeroFp }
      : {}),
    actualizadoEn: nowMs,
  };

  const existing = await ctx.db
    .query("facturacionDashboardItems")
    .withIndex("by_facturaId", (q) => q.eq("facturaId", facturaId))
    .unique();

  if (existing) {
    await applyCounterDelta(
      ctx,
      existing.empresa,
      existing.fechaEmision,
      counterKeysForItem(existing),
      -1,
      existing.moneda,
      existing.valorContable,
      nowMs,
      existing.valorAPagar ?? 0
    );
    await ctx.db.patch("facturacionDashboardItems", existing._id, nextItem);
    await applyCounterDelta(
      ctx,
      nextItem.empresa,
      nextItem.fechaEmision,
      counterKeysForItem(nextItem),
      1,
      nextItem.moneda,
      nextItem.valorContable,
      nowMs,
      nextItem.valorAPagar ?? 0
    );
    await syncResponsables(
      ctx,
      existing._id,
      facturaId,
      empresa,
      asignaciones,
      ownershipResolved.owners,
      nextItem,
      nowMs,
      cajaMenorOverlay?.participantes
    );
  } else {
    const itemId = await ctx.db.insert("facturacionDashboardItems", nextItem);
    await applyCounterDelta(
      ctx,
      nextItem.empresa,
      nextItem.fechaEmision,
      counterKeysForItem(nextItem),
      1,
      nextItem.moneda,
      nextItem.valorContable,
      nowMs,
      nextItem.valorAPagar ?? 0
    );
    await syncResponsables(
      ctx,
      itemId,
      facturaId,
      empresa,
      asignaciones,
      ownershipResolved.owners,
      nextItem,
      nowMs,
      cajaMenorOverlay?.participantes
    );
  }
}

async function syncResponsables(
  ctx: MutationCtx,
  itemId: Id<"facturacionDashboardItems">,
  facturaId: Id<"facturacionFacturas">,
  empresa: number,
  asignaciones: Doc<"facturacionAsignaciones">[],
  owners: ValidOwner[],
  item: Pick<
    Doc<"facturacionDashboardItems">,
    "fechaEmisionMs" | "valorContable" | "valorAPagar" | "moneda" | "slaEstado" | "sortFaseAgeMs"
  >,
  nowMs: number,
  cajaMenorParticipantes?: Array<{
    identityKey: string;
    userId?: string;
    email: string;
    nombre: string;
    primeraParticipacionEn: number;
    ultimaParticipacionEn: number;
    cantidadMovimientos: number;
  }>
) {
  await syncReporteParticipantes(ctx, {
    itemId,
    facturaId,
    empresa,
    fechaEmisionMs: item.fechaEmisionMs,
    asignaciones,
    owners,
    ...(cajaMenorParticipantes ? { cajaMenorParticipantes } : {}),
    nowMs,
  });

  const existing: Doc<"facturacionDashboardResponsables">[] = [];
  for await (const row of ctx.db
    .query("facturacionDashboardResponsables")
    .withIndex("by_facturaId", (q) => q.eq("facturaId", facturaId))) {
    existing.push(row);
  }

  for (const row of existing) {
    await ctx.db.delete("facturacionDashboardResponsables", row._id);
  }

  for (const owner of owners) {
    await ctx.db.insert("facturacionDashboardResponsables", {
      facturaId,
      itemId,
      empresa,
      userId: owner.userId,
      email: normalizeOwnerEmail(owner.email),
      nombre: owner.nombre,
      rol: owner.rol,
      fase: owner.fase,
      fechaAsignacion: owner.fechaAsignacion || nowMs,
      fechaEmisionMs: item.fechaEmisionMs,
      valorContable: item.valorContable,
      ...(item.valorAPagar !== undefined ? { valorAPagar: item.valorAPagar } : {}),
      moneda: item.moneda,
      slaEstado: item.slaEstado,
      faseAgeMs: item.sortFaseAgeMs,
      esActiva: true,
      esLider: owner.rol === "lider" || owner.fase === "revision_lider",
      actualizadoEn: nowMs,
    });
  }
}

export async function eliminarProyeccionFactura(
  ctx: MutationCtx,
  facturaId: Id<"facturacionFacturas">,
  nowMs: number = Date.now()
) {
  const existing = await ctx.db
    .query("facturacionDashboardItems")
    .withIndex("by_facturaId", (q) => q.eq("facturaId", facturaId))
    .unique();

  if (existing) {
    // Reconcile historical participant/person counters before deleting the
    // current-owner rows that are used to calculate active counts.
    await syncReporteParticipantes(ctx, {
      itemId: existing._id,
      facturaId,
      empresa: existing.empresa,
      fechaEmisionMs: existing.fechaEmisionMs,
      asignaciones: [],
      owners: [],
      nowMs,
    });
  } else {
    // A partially-built projection can still leave participant rows behind.
    // Use their own metadata to make cleanup idempotent.
    const orphan = await ctx.db
      .query("facturacionReporteParticipantes")
      .withIndex("by_facturaId", (q) => q.eq("facturaId", facturaId))
      .first();
    if (orphan) {
      await syncReporteParticipantes(ctx, {
        itemId: orphan.itemId,
        facturaId,
        empresa: orphan.empresa,
        fechaEmisionMs: orphan.fechaEmisionMs,
        asignaciones: [],
        owners: [],
        nowMs,
      });
    }
  }

  if (existing) {
    await applyCounterDelta(
      ctx,
      existing.empresa,
      existing.fechaEmision,
      counterKeysForItem(existing),
      -1,
      existing.moneda,
      existing.valorContable,
      nowMs,
      existing.valorAPagar ?? 0
    );
    await ctx.db.delete("facturacionDashboardItems", existing._id);
  }

  const responsables: Doc<"facturacionDashboardResponsables">[] = [];
  for await (const row of ctx.db
    .query("facturacionDashboardResponsables")
    .withIndex("by_facturaId", (q) => q.eq("facturaId", facturaId))) {
    responsables.push(row);
  }
  for (const row of responsables) {
    await ctx.db.delete("facturacionDashboardResponsables", row._id);
  }
}
