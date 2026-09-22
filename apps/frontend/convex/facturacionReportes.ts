import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { type QueryCtx, query } from "./_generated/server";
import {
  addCalendarDaysInclusiveRange,
  currentMonthBogotaRange,
  previousMonthBogotaRange,
} from "./lib/facturacionBusinessTime";
import { normalizeOwnerEmail } from "./lib/facturacionOwnership";
import { isPeajesPublicState, resolveFacturacionReportState } from "./lib/facturacionReportState";
import {
  buildFacturaTiempoMovimientos,
  buildFacturaTiempoResumen,
  type FacturaTiempoResumen,
  type TimingMovement,
} from "./lib/facturacionTiempos";
import { loadCajaMenorTimingMovements } from "./lib/cajaMenorProjection";
import { matchesCausacionEstadoFilter } from "./lib/facturacionCausacion";
import { requireServerSecret } from "./lib/auth";

const MAX_PAGE_SIZE = 100;
const TIMING_MAX_PAGE_SIZE = 20;
const SCAN_BATCH = 200;

type DateRange = {
  fromKey: string | null;
  toKey: string | null;
  fromMs: number | null;
  toMsExclusive: number | null;
};

function resolveDateRange(args: {
  preset?: string;
  from?: string;
  to?: string;
  nowMs?: number;
}): DateRange {
  const now = args.nowMs ?? Date.now();
  if (args.preset === "mes_anterior") return previousMonthBogotaRange(now);
  if (args.preset === "mes_actual") return currentMonthBogotaRange(now);
  if (args.preset === "personalizado") {
    if (!args.from || !args.to || args.from > args.to) {
      throw new Error("Indica un rango de fechas válido.");
    }
    return {
      fromKey: args.from,
      toKey: args.to,
      ...addCalendarDaysInclusiveRange(args.from, args.to),
    };
  }
  return { fromKey: null, toKey: null, fromMs: null, toMsExclusive: null };
}

function decodeCursor(raw: string | undefined): {
  empresaIndex: number;
  cursor: string | null;
  queue: string[];
  empresaCompletada: boolean;
} {
  if (!raw) return { empresaIndex: 0, cursor: null, queue: [], empresaCompletada: false };
  try {
    const decoded = JSON.parse(raw) as { empresaIndex?: unknown; cursor?: unknown };
    return {
      empresaIndex:
        typeof decoded.empresaIndex === "number" && decoded.empresaIndex >= 0
          ? Math.trunc(decoded.empresaIndex)
          : 0,
      cursor: typeof decoded.cursor === "string" ? decoded.cursor : null,
      queue: Array.isArray((decoded as { queue?: unknown }).queue)
        ? (decoded as { queue: unknown[] }).queue.filter(
            (value): value is string => typeof value === "string"
          )
        : [],
      empresaCompletada: (decoded as { empresaCompletada?: unknown }).empresaCompletada === true,
    };
  } catch {
    return { empresaIndex: 0, cursor: null, queue: [], empresaCompletada: false };
  }
}

function encodeCursor(value: {
  empresaIndex: number;
  cursor: string | null;
  queue?: string[];
  empresaCompletada?: boolean;
}) {
  return JSON.stringify(value);
}

type ReportFilters = {
  empresas: number[];
  preset?: string;
  from?: string;
  to?: string;
  busqueda?: string;
  estadoProceso?: "todos" | "activos" | "finalizados" | "sin_workflow";
  responsableUserIds?: string[];
  responsableEmails?: string[];
  incluirSinResponsable?: boolean;
  fase?: string;
  documentoClase?: string;
  tipoFlujo?: string;
  causacionEstado?: "causado" | "no_causado" | "sin_registro";
  nowMs?: number;
};

type ListFilters = ReportFilters & {
  estados?: string[];
  soloRechazos?: boolean;
  fechaEmisionDesde?: string;
  fechaEmisionHasta?: string;
  montoMin?: number;
  montoMax?: number;
  origen?: string;
  tipoFlujoListado?: string;
  causacionEstado?: "causado" | "no_causado" | "sin_registro";
};

function normalizedSearch(value: string | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function matchesScope(item: Doc<"facturacionDashboardItems">, empresa: number, range: DateRange) {
  if (item.empresa !== empresa) return false;
  if (range.fromMs != null && item.fechaEmisionMs < range.fromMs) return false;
  if (range.toMsExclusive != null && item.fechaEmisionMs >= range.toMsExclusive) return false;
  if (item.tipoFlujo === "peaje") return false;
  return true;
}

function matchesSearch(item: Doc<"facturacionDashboardItems">, search: string) {
  if (!search) return true;
  return item.searchText.includes(search);
}

function matchesListadoItem(
  item: Doc<"facturacionDashboardItems">,
  filters: ListFilters,
  search: string
) {
  if (!matchesSearch(item, search)) return false;
  if (filters.documentoClase && item.documentoClase !== filters.documentoClase) return false;
  if (filters.fechaEmisionDesde && item.fechaEmision < filters.fechaEmisionDesde) return false;
  if (filters.fechaEmisionHasta && item.fechaEmision > filters.fechaEmisionHasta) return false;
  if (filters.origen && item.origen !== filters.origen) return false;
  if (filters.montoMin != null && item.valorContable < filters.montoMin) return false;
  if (filters.montoMax != null && item.valorContable > filters.montoMax) return false;
  if (filters.estados?.length) {
    const estadoProyectado = item.estadoListado ?? item.faseActual;
    const necesitaResolverPeajeEnVivo =
      item.tipoFlujo === "peaje" && !isPeajesPublicState(estadoProyectado);
    if (!necesitaResolverPeajeEnVivo && !filters.estados.includes(estadoProyectado)) return false;
  }
  if (
    filters.soloRechazos &&
    !["rechazada", "rechazada_dian", "pendiente_rechazar_dian"].includes(
      item.estadoListado ?? item.faseActual
    )
  )
    return false;
  if (filters.tipoFlujoListado) {
    const expected =
      filters.tipoFlujoListado === "legalizacion_anticipo"
        ? "anticipo"
        : filters.tipoFlujoListado === "legalizacion_caja_menor"
          ? "caja_menor"
          : filters.tipoFlujoListado;
    if (item.tipoFlujo !== expected) return false;
  }
  if (
    filters.causacionEstado &&
    !matchesCausacionEstadoFilter(item.causado, filters.causacionEstado)
  ) {
    return false;
  }
  return true;
}

async function activeOwners(ctx: QueryCtx, facturaId: Id<"facturacionFacturas">) {
  const rows: Doc<"facturacionDashboardResponsables">[] = [];
  for await (const row of ctx.db
    .query("facturacionDashboardResponsables")
    .withIndex("by_facturaId", (q) => q.eq("facturaId", facturaId))) {
    if (row.esActiva) rows.push(row);
  }
  return rows;
}

function matchesOwnerFilter(
  owners: Doc<"facturacionDashboardResponsables">[],
  args: ReportFilters
) {
  const ownerIds = new Set((args.responsableUserIds ?? []).filter(Boolean));
  const ownerEmails = new Set(
    (args.responsableEmails ?? []).map((value) => normalizeOwnerEmail(value)).filter(Boolean)
  );
  const hasOwnerFilter = ownerIds.size > 0 || ownerEmails.size > 0 || args.incluirSinResponsable;
  if (!hasOwnerFilter) return true;
  const ownerMatches = owners.some(
    (owner) =>
      (owner.userId != null && ownerIds.has(owner.userId)) ||
      ownerEmails.has(normalizeOwnerEmail(owner.email))
  );
  return ownerMatches || Boolean(args.incluirSinResponsable && owners.length === 0);
}

function matchesPeopleFilters(
  owners: Doc<"facturacionDashboardResponsables">[],
  args: ReportFilters
) {
  return matchesOwnerFilter(owners, args);
}

const facturaListadoValidator = v.object({
  _id: v.id("facturacionFacturas"),
  empresa: v.optional(v.number()),
  numeroFactura: v.string(),
  cufe: v.optional(v.string()),
  tipoDocumento: v.string(),
  tipoDocumentoNormalizado: v.optional(v.string()),
  documentoClase: v.optional(
    v.union(
      v.literal("factura"),
      v.literal("nota_credito"),
      v.literal("nota_debito"),
      v.literal("otro")
    )
  ),
  proveedorNit: v.string(),
  proveedorNombre: v.string(),
  fechaEmision: v.string(),
  total: v.number(),
  valorContable: v.optional(v.number()),
  valorAPagar: v.optional(v.number()),
  valorCrucesDocumentosInternos: v.optional(v.number()),
  cantidadCrucesDocumentosInternos: v.optional(v.number()),
  moneda: v.string(),
  descripcion: v.string(),
  esPeaje: v.optional(v.boolean()),
  rolOperacion: v.optional(v.literal("PEAJES")),
  esLegalizacionAnticipo: v.optional(v.boolean()),
  esLegalizacionCajaMenor: v.optional(v.boolean()),
  isFisico: v.optional(v.boolean()),
  origen: v.union(
    v.literal("correo"),
    v.literal("carga_manual"),
    v.literal("recibo_fisico"),
    v.literal("documento_fisico")
  ),
  causado: v.union(v.boolean(), v.null()),
  numeroFp: v.union(v.string(), v.null()),
  creadoEn: v.number(),
  actualizadoEn: v.number(),
});

const tareaListadoValidator = v.object({
  _id: v.id("facturacionTareas"),
  facturaId: v.id("facturacionFacturas"),
  estado: v.string(),
});

const listFacturaValidator = facturaListadoValidator.extend({
  tarea: v.union(tareaListadoValidator, v.null()),
  asignaciones: v.array(v.object({})),
  asignacionesActivas: v.array(v.object({})),
  estadoResuelto: v.union(v.string(), v.null()),
  responsablesActuales: v.array(
    v.object({
      userId: v.union(v.string(), v.null()),
      email: v.string(),
      nombre: v.string(),
      rol: v.string(),
    })
  ),
  responsabilidadEstado: v.union(
    v.literal("con_responsable"),
    v.literal("sin_responsable"),
    v.literal("no_aplica")
  ),
});

// Keep the same flattened row contract as the original Facturas query. The
// page renders `_id`, `fechaEmision`, and `tarea` directly; nesting the source
// invoice under `factura` makes those values undefined, causing invalid-date
// errors and duplicate React keys (`key={undefined}`).

function buildListadoRow(
  factura: Doc<"facturacionFacturas">,
  tarea: Doc<"facturacionTareas"> | null,
  asignaciones: Doc<"facturacionAsignaciones">[],
  item: Doc<"facturacionDashboardItems">,
  owners: Doc<"facturacionDashboardResponsables">[],
  estadoResuelto: string | null
) {
  const facturaListado = {
    _id: factura._id,
    ...(factura.empresa !== undefined ? { empresa: factura.empresa } : {}),
    numeroFactura: factura.numeroFactura,
    ...(factura.cufe !== undefined ? { cufe: factura.cufe } : {}),
    tipoDocumento: factura.tipoDocumento,
    ...(factura.tipoDocumentoNormalizado !== undefined
      ? { tipoDocumentoNormalizado: factura.tipoDocumentoNormalizado }
      : {}),
    ...(factura.documentoClase !== undefined ? { documentoClase: factura.documentoClase } : {}),
    proveedorNit: factura.proveedorNit,
    proveedorNombre: factura.proveedorNombre,
    fechaEmision: factura.fechaEmision,
    total: factura.total,
    ...(factura.valorContable !== undefined ? { valorContable: factura.valorContable } : {}),
    ...(factura.valorAPagar !== undefined ? { valorAPagar: factura.valorAPagar } : {}),
    ...(factura.valorCrucesDocumentosInternos !== undefined
      ? { valorCrucesDocumentosInternos: factura.valorCrucesDocumentosInternos }
      : {}),
    ...(factura.cantidadCrucesDocumentosInternos !== undefined
      ? { cantidadCrucesDocumentosInternos: factura.cantidadCrucesDocumentosInternos }
      : {}),
    moneda: factura.moneda,
    descripcion: factura.descripcion,
    ...(factura.esPeaje !== undefined ? { esPeaje: factura.esPeaje } : {}),
    ...(factura.rolOperacion !== undefined ? { rolOperacion: factura.rolOperacion } : {}),
    ...(factura.esLegalizacionAnticipo !== undefined
      ? { esLegalizacionAnticipo: factura.esLegalizacionAnticipo }
      : {}),
    ...(factura.esLegalizacionCajaMenor !== undefined
      ? { esLegalizacionCajaMenor: factura.esLegalizacionCajaMenor }
      : {}),
    ...(factura.isFisico !== undefined ? { isFisico: factura.isFisico } : {}),
    origen: factura.origen,
    causado: factura.causado === undefined ? null : factura.causado,
    numeroFp: factura.causado === true ? (factura.numeroFp ?? null) : null,
    creadoEn: factura.creadoEn,
    actualizadoEn: factura.actualizadoEn,
  };
  return {
    ...facturaListado,
    tarea: tarea ? { _id: tarea._id, facturaId: tarea.facturaId, estado: tarea.estado } : null,
    asignaciones: [] as Array<object>,
    asignacionesActivas: [] as Array<object>,
    estadoResuelto,
    responsablesActuales: owners.map((owner) => ({
      userId: owner.userId ?? null,
      email: owner.email,
      nombre: owner.nombre,
      rol: owner.rol,
    })),
    responsabilidadEstado: (!item.esActiva
      ? "no_aplica"
      : owners.length > 0
        ? "con_responsable"
        : "sin_responsable") as "con_responsable" | "sin_responsable" | "no_aplica",
  };
}

function resolveListadoEstadoEnVivo(
  source: NonNullable<Awaited<ReturnType<typeof loadSource>>>,
  item: Doc<"facturacionDashboardItems">
) {
  if (!source.factura.esPeaje) return item.estadoListado ?? item.faseActual ?? null;
  return resolveFacturacionReportState({
    esPeaje: true,
    peajesCruce: source.factura.peajesCruce,
    estadoContable: source.peajesContabilidad?.estado,
    tareaEstado: source.tarea?.estado,
  }).estadoListado;
}

function matchesEstadoResuelto(filters: ListFilters, estadoResuelto: string | null) {
  return (
    !filters.estados?.length || (estadoResuelto != null && filters.estados.includes(estadoResuelto))
  );
}

export const listarListado = query({
  args: {
    secret: v.string(),
    empresas: v.array(v.number()),
    busqueda: v.optional(v.string()),
    documentoClase: v.optional(v.string()),
    estados: v.optional(v.array(v.string())),
    soloRechazos: v.optional(v.boolean()),
    fechaEmisionDesde: v.optional(v.string()),
    fechaEmisionHasta: v.optional(v.string()),
    montoMin: v.optional(v.number()),
    montoMax: v.optional(v.number()),
    origen: v.optional(v.string()),
    tipoFlujoListado: v.optional(v.string()),
    causacionEstado: v.optional(
      v.union(v.literal("causado"), v.literal("no_causado"), v.literal("sin_registro"))
    ),
    responsableUserIds: v.optional(v.array(v.string())),
    responsableEmails: v.optional(v.array(v.string())),
    incluirSinResponsable: v.optional(v.boolean()),
    cursor: v.optional(v.string()),
    pageSize: v.optional(v.number()),
  },
  returns: v.object({
    page: v.array(listFacturaValidator),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, args) => {
    requireServerSecret(args.secret);
    const pageSize = Math.min(Math.max(Math.trunc(args.pageSize ?? 20), 1), MAX_PAGE_SIZE);
    const search = normalizedSearch(args.busqueda);
    const state = decodeCursor(args.cursor);
    const page: Array<ReturnType<typeof buildListadoRow>> = [];
    let empresaIndex = state.empresaIndex;
    let sourceCursor = state.cursor;
    let queue = [...state.queue];
    let empresaCompletada = state.empresaCompletada;
    while (page.length < pageSize && empresaIndex < args.empresas.length) {
      const empresa = args.empresas[empresaIndex]!;
      while (queue.length > 0 && page.length < pageSize) {
        const item = await ctx.db
          .query("facturacionDashboardItems")
          .withIndex("by_facturaId", (q) =>
            q.eq("facturaId", queue.shift() as Id<"facturacionFacturas">)
          )
          .unique();
        if (!item || item.empresa !== empresa) continue;
        const filters: ListFilters = args;
        if (!matchesListadoItem(item, filters, search)) continue;
        const owners = await activeOwners(ctx, item.facturaId);
        if (!matchesPeopleFilters(owners, filters)) continue;
        const sourceData = await loadSource(ctx, item.facturaId);
        if (!sourceData) continue;
        const estadoResuelto = resolveListadoEstadoEnVivo(sourceData, item);
        if (!matchesEstadoResuelto(filters, estadoResuelto)) continue;
        page.push(
          buildListadoRow(
            sourceData.factura,
            sourceData.tarea,
            sourceData.asignaciones,
            item,
            owners,
            estadoResuelto
          )
        );
      }
      if (empresaCompletada && queue.length === 0) {
        empresaIndex += 1;
        empresaCompletada = false;
        sourceCursor = null;
        continue;
      }
      if (page.length >= pageSize) break;
      const source =
        search.length >= 2
          ? await ctx.db
              .query("facturacionDashboardItems")
              .withSearchIndex("search_identity", (q) =>
                q.search("searchText", search).eq("empresa", empresa)
              )
              .paginate({ numItems: SCAN_BATCH, cursor: sourceCursor })
          : await ctx.db
              .query("facturacionDashboardItems")
              .withIndex("by_empresa_fechaEmisionMs", (q) => q.eq("empresa", empresa))
              .order("desc")
              .paginate({ numItems: SCAN_BATCH, cursor: sourceCursor });
      const filters: ListFilters = args;
      const overflow: string[] = [];
      for (let index = 0; index < source.page.length; index += 1) {
        const item = source.page[index]!;
        if (!matchesListadoItem(item, filters, search)) continue;
        const owners = await activeOwners(ctx, item.facturaId);
        if (!matchesPeopleFilters(owners, filters)) continue;
        const sourceData = await loadSource(ctx, item.facturaId);
        if (!sourceData) continue;
        const estadoResuelto = resolveListadoEstadoEnVivo(sourceData, item);
        if (!matchesEstadoResuelto(filters, estadoResuelto)) continue;
        page.push(
          buildListadoRow(
            sourceData.factura,
            sourceData.tarea,
            sourceData.asignaciones,
            item,
            owners,
            estadoResuelto
          )
        );
        if (page.length >= pageSize) {
          for (const remaining of source.page.slice(index + 1))
            overflow.push(String(remaining.facturaId));
          break;
        }
      }
      queue = overflow;
      if (source.isDone) {
        empresaCompletada = true;
        sourceCursor = null;
      } else {
        sourceCursor = source.continueCursor;
      }
      break;
    }
    const done =
      empresaIndex >= args.empresas.length && sourceCursor === null && queue.length === 0;
    return {
      page,
      isDone: done,
      continueCursor: done
        ? ""
        : encodeCursor({ empresaIndex, cursor: sourceCursor, queue, empresaCompletada }),
    };
  },
});

async function loadSource(ctx: QueryCtx, facturaId: Id<"facturacionFacturas">) {
  const factura = await ctx.db.get("facturacionFacturas", facturaId);
  if (!factura) return null;
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
  for await (const row of ctx.db
    .query("facturacionAsignaciones")
    .withIndex("by_facturaId", (q) => q.eq("facturaId", facturaId))) {
    asignaciones.push(row);
  }
  const aprobaciones: Doc<"facturacionAprobaciones">[] = [];
  for await (const row of ctx.db
    .query("facturacionAprobaciones")
    .withIndex("by_facturaId", (q) => q.eq("facturaId", facturaId))) {
    aprobaciones.push(row);
  }
  return { factura, tarea, peajesContabilidad, asignaciones, aprobaciones };
}

type TimingSource = {
  numeroFactura?: string;
  proveedorNombre?: string;
  proveedorNit?: string;
  factura: {
    id: string;
    creadoEn: number;
    actualizadoEn?: number;
    esPeaje?: boolean;
  };
  tarea: { estado?: string; finalizadoEn?: number; actualizadoEn?: number } | null;
  asignaciones: Array<{
    id: string;
    tareaId?: string;
    fase?: string;
    estado?: string;
    rol?: string;
    grupoId?: string;
    asignadoAUserId?: string;
    asignadoANombre?: string;
    asignadoAEmail?: string;
    asignadoAProcesoId?: number;
    asignadoAProcesoNombre?: string;
    fechaAsignacion: number;
    fechaCompletado?: number;
    duracionMs?: number;
    comentario?: string;
    actualizadoEn?: number;
  }>;
  aprobaciones: Array<{ asignacionId?: string; creadoEn: number }>;
  cajaMenorMovimientos?: TimingMovement[];
};

function mapTimingAssignment(asignacion: Doc<"facturacionAsignaciones">) {
  return {
    id: String(asignacion._id),
    ...(asignacion.tareaId ? { tareaId: String(asignacion.tareaId) } : {}),
    fase: asignacion.fase,
    estado: asignacion.estado,
    rol: asignacion.rol,
    grupoId: asignacion.grupoId,
    ...(asignacion.asignadoAUserId ? { asignadoAUserId: asignacion.asignadoAUserId } : {}),
    asignadoANombre: asignacion.asignadoANombre,
    asignadoAEmail: asignacion.asignadoAEmail,
    ...(asignacion.asignadoAProcesoId !== undefined
      ? { asignadoAProcesoId: asignacion.asignadoAProcesoId }
      : {}),
    ...(asignacion.asignadoAProcesoNombre
      ? { asignadoAProcesoNombre: asignacion.asignadoAProcesoNombre }
      : {}),
    fechaAsignacion: asignacion.fechaAsignacion,
    ...(asignacion.fechaCompletado !== undefined
      ? { fechaCompletado: asignacion.fechaCompletado }
      : {}),
    ...(asignacion.duracionMs !== undefined ? { duracionMs: asignacion.duracionMs } : {}),
    ...(asignacion.comentario !== undefined ? { comentario: asignacion.comentario } : {}),
    actualizadoEn: asignacion.actualizadoEn,
  };
}

async function loadLegacyTimingSource(
  ctx: QueryCtx,
  facturaId: Id<"facturacionFacturas">,
  nowMs: number = Date.now()
): Promise<TimingSource | null> {
  const source = await loadSource(ctx, facturaId);
  if (!source) return null;
  const cajaMenorMovimientos = await loadCajaMenorTimingMovements(ctx, {
    facturaId,
    factura: source.factura,
    tarea: source.tarea,
    aprobaciones: source.aprobaciones,
    nowMs,
  });
  return {
    numeroFactura: source.factura.numeroFactura,
    proveedorNombre: source.factura.proveedorNombre,
    proveedorNit: source.factura.proveedorNit,
    factura: {
      id: String(source.factura._id),
      creadoEn: source.factura.creadoEn,
      actualizadoEn: source.factura.actualizadoEn,
      esPeaje: source.factura.esPeaje,
    },
    tarea: source.tarea
      ? {
          estado: source.tarea.estado,
          finalizadoEn: source.tarea.finalizadoEn,
          actualizadoEn: source.tarea.actualizadoEn,
        }
      : null,
    asignaciones: source.asignaciones.map(mapTimingAssignment),
    aprobaciones: source.aprobaciones.map((approval) => ({
      ...(approval.asignacionId ? { asignacionId: String(approval.asignacionId) } : {}),
      creadoEn: approval.creadoEn,
    })),
    ...(cajaMenorMovimientos.length > 0 ? { cajaMenorMovimientos } : {}),
  };
}

function needsCajaMenorTiming(item: Doc<"facturacionDashboardItems">) {
  return (
    item.tipoFlujo === "caja_menor" ||
    item.faseActual.startsWith("caja_menor_") ||
    item.faseActual === "reembolso_caja_menor"
  );
}

async function loadCajaMenorMovimientosForItem(
  ctx: QueryCtx,
  item: Doc<"facturacionDashboardItems">,
  nowMs: number
): Promise<TimingMovement[]> {
  if (!needsCajaMenorTiming(item)) return [];
  const factura = await ctx.db.get("facturacionFacturas", item.facturaId);
  if (!factura) return [];
  const tarea = await ctx.db
    .query("facturacionTareas")
    .withIndex("by_facturaId", (q) => q.eq("facturaId", item.facturaId))
    .unique();
  const aprobaciones: Doc<"facturacionAprobaciones">[] = [];
  for await (const aprobacion of ctx.db
    .query("facturacionAprobaciones")
    .withIndex("by_facturaId", (q) => q.eq("facturaId", item.facturaId))) {
    aprobaciones.push(aprobacion);
  }
  return await loadCajaMenorTimingMovements(ctx, {
    facturaId: item.facturaId,
    factura,
    tarea,
    aprobaciones,
    nowMs,
  });
}

function toTimingInput(source: TimingSource, nowMs: number) {
  return {
    factura: source.factura,
    tarea: source.tarea,
    asignaciones: source.asignaciones,
    aprobaciones: source.aprobaciones,
    ...(source.cajaMenorMovimientos ? { cajaMenorMovimientos: source.cajaMenorMovimientos } : {}),
    nowMs,
  };
}

/**
 * Build timing input from the dashboard projection. The projection already
 * contains ingress, workflow presence and the resolved close boundary, so a
 * timing page only needs assignment rows for gap/parallel-work calculations.
 * Full invoice/task/approval documents remain a compatibility fallback for
 * older projections that have not been backfilled yet.
 */
async function loadTimingSource(
  ctx: QueryCtx,
  item: Doc<"facturacionDashboardItems">,
  nowMs: number = Date.now()
): Promise<TimingSource | null> {
  if (
    item.ingresadaEn === undefined ||
    (item.tieneTarea && !item.esActiva && item.cierreReporteEn === undefined)
  ) {
    return loadLegacyTimingSource(ctx, item.facturaId, nowMs);
  }

  if (!item.tieneTarea) {
    return {
      factura: {
        id: String(item.facturaId),
        creadoEn: item.ingresadaEn,
      },
      tarea: null,
      asignaciones: [],
      aprobaciones: [],
    };
  }

  const asignaciones: Doc<"facturacionAsignaciones">[] = [];
  for await (const asignacion of ctx.db
    .query("facturacionAsignaciones")
    .withIndex("by_facturaId", (q) => q.eq("facturaId", item.facturaId))) {
    asignaciones.push(asignacion);
  }

  const aprobacionesNecesarias = asignaciones.some(
    (asignacion) =>
      asignacion.estado !== "pendiente" &&
      asignacion.fechaCompletado === undefined &&
      asignacion.duracionMs === undefined
  );
  const aprobaciones: TimingSource["aprobaciones"] = [];
  if (aprobacionesNecesarias) {
    for await (const approval of ctx.db
      .query("facturacionAprobaciones")
      .withIndex("by_facturaId", (q) => q.eq("facturaId", item.facturaId))) {
      aprobaciones.push({
        ...(approval.asignacionId ? { asignacionId: String(approval.asignacionId) } : {}),
        creadoEn: approval.creadoEn,
      });
    }
  }

  const close = item.cierreReporteEn;
  const tarea = item.tieneTarea
    ? { estado: item.faseActual, ...(close !== undefined ? { finalizadoEn: close } : {}) }
    : null;

  const cajaMenorMovimientos = await loadCajaMenorMovimientosForItem(ctx, item, nowMs);

  return {
    factura: {
      id: String(item.facturaId),
      creadoEn: item.ingresadaEn,
      ...(item.tipoFlujo === "peaje" ? { esPeaje: true } : {}),
    },
    tarea,
    asignaciones: asignaciones.map(mapTimingAssignment),
    aprobaciones,
    ...(cajaMenorMovimientos.length > 0 ? { cajaMenorMovimientos } : {}),
  };
}

const timingSummaryValidator = v.object({
  incluidaEnReporte: v.boolean(),
  excluidaPorPeaje: v.boolean(),
  facturaId: v.union(v.string(), v.null()),
  inicioEn: v.number(),
  finEn: v.number(),
  enCurso: v.boolean(),
  sinWorkflow: v.boolean(),
  tiempoCalendarioMs: v.number(),
  diasLaborales: v.number(),
  tiempoCalendarioSinAsignarMs: v.number(),
  diasLaboralesSinAsignar: v.number(),
  cantidadMovimientos: v.number(),
});

const timingMovementValidator = v.object({
  id: v.string(),
  tipoIntervalo: v.union(
    v.literal("asignacion"),
    v.literal("sin_asignar"),
    v.literal("caja_menor")
  ),
  esSintetico: v.boolean(),
  fase: v.union(v.string(), v.null()),
  rol: v.union(v.string(), v.null()),
  estado: v.string(),
  responsableUserId: v.union(v.string(), v.null()),
  responsableNombre: v.union(v.string(), v.null()),
  responsableEmail: v.union(v.string(), v.null()),
  procesoId: v.union(v.number(), v.null()),
  procesoNombre: v.union(v.string(), v.null()),
  inicioEn: v.number(),
  finEn: v.number(),
  duracionMs: v.number(),
  diasLaborales: v.number(),
  enCurso: v.boolean(),
  comentario: v.union(v.string(), v.null()),
});

function projectSummary(
  item: Doc<"facturacionDashboardItems">,
  summary: FacturaTiempoResumen,
  owners: Doc<"facturacionDashboardResponsables">[]
) {
  return {
    ...summary,
    facturaId: String(item.facturaId),
    empresa: item.empresa,
    numeroFactura: item.numeroFactura,
    proveedorNombre: item.proveedorNombre,
    proveedorNit: item.proveedorNit,
    fechaEmision: item.fechaEmision,
    tipoFlujo: item.tipoFlujo,
    documentoClase: item.documentoClase,
    estadoProceso: item.estadoListado ?? item.faseActual,
    faseActual: item.faseActual,
    searchText: item.searchText,
    responsablesActuales: owners.map((owner) => ({
      userId: owner.userId ?? null,
      nombre: owner.nombre,
      email: owner.email,
      rol: owner.rol,
    })),
    causado: item.causado === undefined ? null : item.causado,
    numeroFp: item.causado === true ? (item.numeroFp ?? null) : null,
  };
}

const reportRowValidator = timingSummaryValidator.extend({
  empresa: v.number(),
  numeroFactura: v.string(),
  proveedorNombre: v.string(),
  proveedorNit: v.string(),
  fechaEmision: v.string(),
  tipoFlujo: v.string(),
  documentoClase: v.string(),
  estadoProceso: v.string(),
  faseActual: v.string(),
  searchText: v.string(),
  responsablesActuales: v.array(
    v.object({
      userId: v.union(v.string(), v.null()),
      nombre: v.string(),
      email: v.string(),
      rol: v.string(),
    })
  ),
  causado: v.union(v.boolean(), v.null()),
  numeroFp: v.union(v.string(), v.null()),
});

export const listarTiempos = query({
  args: {
    secret: v.string(),
    empresas: v.array(v.number()),
    preset: v.optional(v.string()),
    from: v.optional(v.string()),
    to: v.optional(v.string()),
    busqueda: v.optional(v.string()),
    estadoProceso: v.optional(
      v.union(
        v.literal("todos"),
        v.literal("activos"),
        v.literal("finalizados"),
        v.literal("sin_workflow")
      )
    ),
    responsableUserIds: v.optional(v.array(v.string())),
    responsableEmails: v.optional(v.array(v.string())),
    incluirSinResponsable: v.optional(v.boolean()),
    fase: v.optional(v.string()),
    documentoClase: v.optional(v.string()),
    tipoFlujo: v.optional(v.string()),
    causacionEstado: v.optional(
      v.union(v.literal("causado"), v.literal("no_causado"), v.literal("sin_registro"))
    ),
    nowMs: v.optional(v.number()),
    cursor: v.optional(v.string()),
    pageSize: v.optional(v.number()),
  },
  returns: v.object({
    page: v.array(reportRowValidator),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, args) => {
    requireServerSecret(args.secret);
    const pageSize = Math.min(Math.max(Math.trunc(args.pageSize ?? 20), 1), TIMING_MAX_PAGE_SIZE);
    const range = resolveDateRange(args);
    const search = normalizedSearch(args.busqueda);
    const filters: ReportFilters = args;
    const state = decodeCursor(args.cursor);
    const page: ReturnType<typeof projectSummary>[] = [];
    let empresaIndex = state.empresaIndex;
    let sourceCursor = state.cursor;
    let queue = [...state.queue];
    let empresaCompletada = state.empresaCompletada;

    while (page.length < pageSize && empresaIndex < args.empresas.length) {
      const empresa = args.empresas[empresaIndex]!;
      while (queue.length > 0 && page.length < pageSize) {
        const queuedId = queue.shift() as Id<"facturacionFacturas">;
        const item = await ctx.db
          .query("facturacionDashboardItems")
          .withIndex("by_facturaId", (q) => q.eq("facturaId", queuedId))
          .unique();
        if (!item || item.empresa !== empresa) continue;
        if (!matchesScope(item, empresa, range) || !matchesSearch(item, search)) continue;
        if (filters.fase && item.faseActual !== filters.fase) continue;
        if (filters.documentoClase && item.documentoClase !== filters.documentoClase) continue;
        if (filters.tipoFlujo && item.tipoFlujo !== filters.tipoFlujo) continue;
        if (filters.estadoProceso === "activos" && !item.esActiva) continue;
        if (filters.estadoProceso === "finalizados" && (item.esActiva || !item.tieneTarea))
          continue;
        if (filters.estadoProceso === "sin_workflow" && item.tieneTarea) continue;
        if (
          filters.causacionEstado &&
          !matchesCausacionEstadoFilter(item.causado, filters.causacionEstado)
        ) {
          continue;
        }
        const owners = await activeOwners(ctx, item.facturaId);
        if (!matchesPeopleFilters(owners, filters)) continue;
        const sourceData = await loadTimingSource(ctx, item, args.nowMs ?? Date.now());
        if (!sourceData) continue;
        const timing = buildFacturaTiempoResumen(toTimingInput(sourceData, args.nowMs ?? Date.now()));
        if (timing.incluidaEnReporte) page.push(projectSummary(item, timing, owners));
      }
      if (empresaCompletada && queue.length === 0) {
        empresaIndex += 1;
        empresaCompletada = false;
        sourceCursor = null;
        continue;
      }
      if (page.length >= pageSize) break;
      const source =
        search.length >= 2
          ? await ctx.db
              .query("facturacionDashboardItems")
              .withSearchIndex("search_identity", (q) =>
                q.search("searchText", search).eq("empresa", empresa)
              )
              .paginate({ numItems: SCAN_BATCH, cursor: sourceCursor })
          : await ctx.db
              .query("facturacionDashboardItems")
              .withIndex("by_empresa_fechaEmisionMs", (q) => {
                if (range.fromMs != null && range.toMsExclusive != null) {
                  return q
                    .eq("empresa", empresa)
                    .gte("fechaEmisionMs", range.fromMs)
                    .lt("fechaEmisionMs", range.toMsExclusive);
                }
                return q.eq("empresa", empresa);
              })
              .order("desc")
              .paginate({ numItems: SCAN_BATCH, cursor: sourceCursor });

      const overflow: string[] = [];
      for (let index = 0; index < source.page.length; index += 1) {
        const item = source.page[index]!;
        if (!matchesScope(item, empresa, range) || !matchesSearch(item, search)) continue;
        if (filters.fase && item.faseActual !== filters.fase) continue;
        if (filters.documentoClase && item.documentoClase !== filters.documentoClase) continue;
        if (filters.tipoFlujo && item.tipoFlujo !== filters.tipoFlujo) continue;
        if (filters.estadoProceso === "activos" && !item.esActiva) continue;
        if (filters.estadoProceso === "finalizados" && (item.esActiva || !item.tieneTarea))
          continue;
        if (filters.estadoProceso === "sin_workflow" && item.tieneTarea) continue;
        if (
          filters.causacionEstado &&
          !matchesCausacionEstadoFilter(item.causado, filters.causacionEstado)
        ) {
          continue;
        }
        const owners = await activeOwners(ctx, item.facturaId);
        if (!matchesPeopleFilters(owners, filters)) continue;
        const sourceData = await loadTimingSource(ctx, item, args.nowMs ?? Date.now());
        if (!sourceData) continue;
        const timing = buildFacturaTiempoResumen(toTimingInput(sourceData, args.nowMs ?? Date.now()));
        if (!timing.incluidaEnReporte) continue;
        page.push(projectSummary(item, timing, owners));
        if (page.length >= pageSize) {
          for (const remaining of source.page.slice(index + 1))
            overflow.push(String(remaining.facturaId));
          break;
        }
      }
      queue = overflow;

      if (source.isDone) {
        empresaCompletada = true;
        sourceCursor = null;
      } else {
        sourceCursor = source.continueCursor;
      }
      break;
    }

    const done =
      empresaIndex >= args.empresas.length && sourceCursor === null && queue.length === 0;
    return {
      page,
      isDone: done,
      continueCursor: done
        ? ""
        : encodeCursor({ empresaIndex, cursor: sourceCursor, queue, empresaCompletada }),
    };
  },
});

export const obtenerDetalleTiempo = query({
  args: {
    secret: v.string(),
    facturaId: v.id("facturacionFacturas"),
    empresas: v.optional(v.array(v.number())),
    nowMs: v.optional(v.number()),
  },
  returns: v.object({
    facturaId: v.id("facturacionFacturas"),
    numeroFactura: v.string(),
    proveedorNombre: v.string(),
    proveedorNit: v.string(),
    resumen: timingSummaryValidator,
    movimientos: v.array(timingMovementValidator),
  }),
  handler: async (ctx, args) => {
    requireServerSecret(args.secret);
    const item = await ctx.db
      .query("facturacionDashboardItems")
      .withIndex("by_facturaId", (q) => q.eq("facturaId", args.facturaId))
      .unique();
    if (args.empresas && (!item || !args.empresas.includes(item.empresa))) {
      throw new Error("Factura no autorizada");
    }
    const nowMs = args.nowMs ?? Date.now();
    const source = item
      ? await loadTimingSource(ctx, item, nowMs)
      : await loadLegacyTimingSource(ctx, args.facturaId, nowMs);
    if (!source) throw new Error("Factura no encontrada");
    const input = toTimingInput(source, nowMs);
    return {
      facturaId: args.facturaId,
      numeroFactura: item?.numeroFactura ?? source.numeroFactura ?? "",
      proveedorNombre: item?.proveedorNombre ?? source.proveedorNombre ?? "",
      proveedorNit: item?.proveedorNit ?? source.proveedorNit ?? "",
      resumen: buildFacturaTiempoResumen(input),
      movimientos: buildFacturaTiempoMovimientos(input),
    };
  },
});

const personValidator = v.object({
  empresa: v.number(),
  identityKey: v.string(),
  userId: v.union(v.string(), v.null()),
  email: v.string(),
  nombre: v.string(),
  cantidadFacturasActuales: v.number(),
  cantidadFacturasHistoricamenteParticipadas: v.number(),
  ultimaParticipacionEn: v.number(),
});

export const listarPersonas = query({
  args: {
    secret: v.string(),
    empresas: v.array(v.number()),
    tipo: v.union(v.literal("actual"), v.literal("participante")),
    busqueda: v.optional(v.string()),
    cursor: v.optional(v.string()),
    pageSize: v.optional(v.number()),
  },
  returns: v.object({
    page: v.array(personValidator),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, args) => {
    requireServerSecret(args.secret);
    const pageSize = Math.min(Math.max(Math.trunc(args.pageSize ?? 50), 1), MAX_PAGE_SIZE);
    const search = normalizedSearch(args.busqueda);
    let empresaIndex = 0;
    let sourceCursor: string | null = null;
    if (args.cursor) {
      try {
        const state = JSON.parse(args.cursor) as { empresaIndex?: unknown; cursor?: unknown };
        if (typeof state.empresaIndex === "number")
          empresaIndex = Math.max(0, Math.trunc(state.empresaIndex));
        if (typeof state.cursor === "string") sourceCursor = state.cursor;
      } catch {
        empresaIndex = 0;
      }
    }
    const empresa = args.empresas[empresaIndex];
    if (empresa === undefined) return { page: [], isDone: true, continueCursor: "" };
    const result =
      search.length >= 2
        ? await ctx.db
            .query("facturacionReportePersonas")
            .withSearchIndex("search_identity", (q) =>
              q.search("searchText", search).eq("empresa", empresa)
            )
            .paginate({ numItems: pageSize, cursor: sourceCursor })
        : await ctx.db
            .query("facturacionReportePersonas")
            .withIndex("by_empresa", (q) => q.eq("empresa", empresa))
            .order("asc")
            .paginate({ numItems: pageSize, cursor: sourceCursor });
    const page = result.page
      .filter((person) => args.empresas.includes(person.empresa))
      .filter((person) =>
        args.tipo === "actual"
          ? person.cantidadFacturasActuales > 0
          : person.cantidadFacturasHistoricamenteParticipadas > 0
      )
      .map((person) => ({
        empresa: person.empresa,
        identityKey: person.identityKey,
        userId: person.userId ?? null,
        email: person.email,
        nombre: person.nombre,
        cantidadFacturasActuales: person.cantidadFacturasActuales,
        cantidadFacturasHistoricamenteParticipadas:
          person.cantidadFacturasHistoricamenteParticipadas,
        ultimaParticipacionEn: person.ultimaParticipacionEn,
      }));
    const isDone = result.isDone && empresaIndex >= args.empresas.length - 1;
    const continueCursor = isDone
      ? ""
      : JSON.stringify({
          empresaIndex: result.isDone ? empresaIndex + 1 : empresaIndex,
          cursor: result.isDone ? null : result.continueCursor,
        });
    return { page, isDone, continueCursor };
  },
});
