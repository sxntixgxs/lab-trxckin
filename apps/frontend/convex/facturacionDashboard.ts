import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, type QueryCtx, query } from "./_generated/server";
import { backgroundJobsHabilitados } from "./lib/backgroundJobs";
import {
  addCalendarDaysInclusiveRange,
  currentMonthBogotaRange,
  previousMonthBogotaRange,
} from "./lib/facturacionBusinessTime";
import { refrescarProyeccionFactura } from "./lib/facturacionDashboardProjection";
import { normalizeOwnerEmail } from "./lib/facturacionOwnership";
import { requireServerSecret } from "./lib/auth";

const BACKFILL_KEY = "projection-v1";
const MAX_PAGE_SIZE = 100;
const BACKFILL_BATCH_SIZE = 50;
const FACTURAS_SCAN_BATCH = 200;
const RESPONSABLES_FACTURAS_SCAN_BATCH = 200;
const DISTRIBUCION_MAX_SCAN = 5000;

/** Panel tabs map assignment `fase` values to operational groups. */
const RESPONSABLE_PANEL_GROUPS = [
  "lideres",
  "fases_contables",
  "tesoreria",
  "recepcion",
  "gerencia",
] as const;
type ResponsablePanelGroup = (typeof RESPONSABLE_PANEL_GROUPS)[number];

function classifyResponsablePanelGroup(fase: string): ResponsablePanelGroup | null {
  if (fase === "revision_lider") return "lideres";
  if (fase === "causacion" || fase === "revision_impuestos" || fase === "eventos_dian") {
    return "fases_contables";
  }
  if (fase === "revision_tesoreria") return "tesoreria";
  if (fase === "recepcion") return "recepcion";
  if (fase === "gerencia") return "gerencia";
  return null;
}

function isResponsablePanelGroup(value: string): value is ResponsablePanelGroup {
  return (RESPONSABLE_PANEL_GROUPS as readonly string[]).includes(value);
}

const currencyBreakdownValidator = v.record(v.string(), v.number());

const dashboardKpiCounterValidator = v.object({
  count: v.number(),
  montosPorMoneda: currencyBreakdownValidator,
  montosAPagarPorMoneda: currencyBreakdownValidator,
});

const fasesContablesKpiValidator = v.object({
  count: v.number(),
  montosPorMoneda: currencyBreakdownValidator,
  montosAPagarPorMoneda: currencyBreakdownValidator,
  subcounts: v.object({
    causacion: v.number(),
    revision_impuestos: v.number(),
    eventos_dian: v.number(),
  }),
});

const alertValidator = v.object({
  kind: v.union(
    v.literal("sla_breached"),
    v.literal("sla_warning"),
    v.literal("sin_responsable"),
    v.literal("asignacion_inconsistente"),
    v.literal("fase_sin_sla")
  ),
  count: v.number(),
  label: v.string(),
});

const ownerChipValidator = v.object({
  userId: v.union(v.string(), v.null()),
  email: v.string(),
  nombre: v.string(),
  rol: v.string(),
  assignmentAgeMs: v.number(),
});

const facturaLedgerRowValidator = v.object({
  facturaId: v.id("facturacionFacturas"),
  empresa: v.number(),
  numeroFactura: v.string(),
  proveedorNombre: v.string(),
  proveedorNit: v.string(),
  fechaEmision: v.string(),
  faseActual: v.string(),
  grupoFase: v.string(),
  owners: v.array(ownerChipValidator),
  phaseAgeMs: v.number(),
  slaEstado: v.string(),
  slaUmbralDias: v.union(v.number(), v.null()),
  valorContable: v.number(),
  valorAPagar: v.union(v.number(), v.null()),
  moneda: v.string(),
  tipoFlujo: v.string(),
  esLegacyJefeDirecto: v.boolean(),
  fueraDeRango: v.boolean(),
  integrityIssues: v.array(v.string()),
});

type DateRange = {
  fromKey: string | null;
  toKey: string | null;
  fromMs: number | null;
  toMsExclusive: number | null;
};

type Counter = {
  count: number;
  montosPorMoneda: Record<string, number>;
  montosAPagarPorMoneda: Record<string, number>;
};

function resolveDateRange(args: {
  preset?: string;
  from?: string;
  to?: string;
  nowMs?: number;
}): DateRange {
  const now = args.nowMs ?? Date.now();
  if (args.preset === "mes_anterior") return previousMonthBogotaRange(now);
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
  if (args.preset === "todas") {
    return { fromKey: null, toKey: null, fromMs: null, toMsExclusive: null };
  }
  return currentMonthBogotaRange(now);
}

function mergeMontos(target: Record<string, number>, source: Record<string, number>) {
  for (const [moneda, monto] of Object.entries(source)) {
    target[moneda] = (target[moneda] ?? 0) + monto;
  }
}

function mergeMontosAPagar(
  target: Record<string, number>,
  source: Record<string, number> | undefined
) {
  if (!source) return;
  for (const [moneda, monto] of Object.entries(source)) {
    target[moneda] = (target[moneda] ?? 0) + monto;
  }
}

function emptyCounter(): Counter {
  return { count: 0, montosPorMoneda: {}, montosAPagarPorMoneda: {} };
}

function incrementCounter(target: Counter, source: Counter) {
  target.count += source.count;
  mergeMontos(target.montosPorMoneda, source.montosPorMoneda);
  mergeMontosAPagar(target.montosAPagarPorMoneda, source.montosAPagarPorMoneda);
}

/** Reads compact daily counters, never source invoices, for period-level KPIs. */
async function readPeriodCounters(
  ctx: QueryCtx,
  empresas: number[],
  range: DateRange
): Promise<Map<string, Counter>> {
  const counters = new Map<string, Counter>();
  for (const empresa of empresas) {
    const base = ctx.db
      .query("facturacionDashboardContadoresDia")
      .withIndex("by_empresa_fechaEmision", (q) => {
        if (range.fromKey && range.toKey) {
          return q
            .eq("empresa", empresa)
            .gte("fechaEmision", range.fromKey)
            .lte("fechaEmision", range.toKey);
        }
        return q.eq("empresa", empresa);
      });
    for await (const row of base) {
      const current = counters.get(row.clave) ?? emptyCounter();
      incrementCounter(current, {
        count: row.count,
        montosPorMoneda: row.montosPorMoneda,
        montosAPagarPorMoneda: row.montosAPagarPorMoneda ?? {},
      });
      counters.set(row.clave, current);
    }
  }
  return counters;
}

function getCounter(counters: Map<string, Counter>, key: string): Counter {
  return counters.get(key) ?? emptyCounter();
}

function weekStartKey(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const utc = Date.UTC(year!, month! - 1, day!);
  const dow = new Date(utc).getUTCDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  return new Date(utc + mondayOffset * 86_400_000).toISOString().slice(0, 10);
}

export const resumen = query({
  args: {
    secret: v.string(),
    empresas: v.array(v.number()),
    preset: v.optional(v.string()),
    from: v.optional(v.string()),
    to: v.optional(v.string()),
    nowMs: v.optional(v.number()),
  },
  returns: v.object({
    generatedAt: v.number(),
    period: v.object({
      preset: v.string(),
      from: v.union(v.string(), v.null()),
      to: v.union(v.string(), v.null()),
    }),
    kpis: v.object({
      lideres: dashboardKpiCounterValidator,
      fasesContables: fasesContablesKpiValidator,
      tesoreria: dashboardKpiCounterValidator,
      slaVencido: dashboardKpiCounterValidator,
    }),
    alerts: v.array(alertValidator),
    wipByPhase: v.array(
      v.object({
        fase: v.string(),
        healthy: v.number(),
        warning: v.number(),
        breached: v.number(),
        sin_sla: v.number(),
      })
    ),
    weeklyTrend: v.array(
      v.object({ weekStart: v.string(), ingresadas: v.number(), finalizadas: v.number() })
    ),
  }),
  handler: async (ctx, args) => {
    requireServerSecret(args.secret);
    const range = resolveDateRange(args);
    const counters = await readPeriodCounters(ctx, args.empresas, range);

    const wip = new Map<
      string,
      { healthy: number; warning: number; breached: number; sin_sla: number }
    >();
    for (const [key, counter] of counters) {
      if (!key.startsWith("wip:")) continue;
      const [, fase, estado] = key.split(":");
      if (!fase || !estado) continue;
      const row = wip.get(fase) ?? { healthy: 0, warning: 0, breached: 0, sin_sla: 0 };
      if (estado === "breached") row.breached += counter.count;
      else if (estado === "warning") row.warning += counter.count;
      else if (estado === "sin_sla") row.sin_sla += counter.count;
      else row.healthy += counter.count;
      wip.set(fase, row);
    }

    const weekly = new Map<string, { ingresadas: number; finalizadas: number }>();
    if (range.fromKey && range.toKey) {
      for (const empresa of args.empresas) {
        const rows = ctx.db
          .query("facturacionDashboardContadoresDia")
          .withIndex("by_empresa_fechaEmision", (q) =>
            q
              .eq("empresa", empresa)
              .gte("fechaEmision", range.fromKey!)
              .lte("fechaEmision", range.toKey!)
          );
        for await (const row of rows) {
          if (row.clave !== "trend:ingresada" && row.clave !== "trend:finalizada") continue;
          const week = weekly.get(weekStartKey(row.fechaEmision)) ?? {
            ingresadas: 0,
            finalizadas: 0,
          };
          if (row.clave === "trend:ingresada") week.ingresadas += row.count;
          else week.finalizadas += row.count;
          weekly.set(weekStartKey(row.fechaEmision), week);
        }
      }
    }

    const alerts = [
      ["sla_breached", "SLA vencido", "sla:breached"],
      ["sla_warning", "Asignaciones ≥80% SLA", "sla:warning"],
      ["sin_responsable", "Sin responsable válido", "integrity:sin_responsable"],
      [
        "asignacion_inconsistente",
        "Inconsistencias de asignación",
        "integrity:asignacion_inconsistente",
      ],
      ["fase_sin_sla", "Fases sin SLA configurado", "integrity:fase_sin_sla"],
    ] as const;

    const fases = getCounter(counters, "kpi:fases_contables");
    return {
      generatedAt: args.nowMs ?? Date.now(),
      period: { preset: args.preset ?? "mes_actual", from: range.fromKey, to: range.toKey },
      kpis: {
        lideres: getCounter(counters, "kpi:lideres"),
        fasesContables: {
          ...fases,
          subcounts: {
            causacion: getCounter(counters, "fase:causacion").count,
            revision_impuestos: getCounter(counters, "fase:revision_impuestos").count,
            eventos_dian: getCounter(counters, "fase:eventos_dian").count,
          },
        },
        tesoreria: getCounter(counters, "kpi:tesoreria"),
        slaVencido: getCounter(counters, "kpi:sla_vencido"),
      },
      alerts: alerts
        .map(([kind, label, key]) => ({ kind, label, count: getCounter(counters, key).count }))
        .filter((alert) => alert.count > 0),
      wipByPhase: [...wip.entries()].map(([fase, values]) => ({ fase, ...values })),
      weeklyTrend: [...weekly.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([weekStart, values]) => ({ weekStart, ...values })),
    };
  },
});

type DashboardCursor = {
  empresaIndex: number;
  cursor: string | null;
  /** Overflow matches from a batch when the page filled mid-scan. */
  queue?: string[];
};

function decodeCursor(cursor: string | undefined): DashboardCursor {
  if (!cursor) return { empresaIndex: 0, cursor: null };
  try {
    const decoded = JSON.parse(cursor) as DashboardCursor;
    if (
      Number.isInteger(decoded.empresaIndex) &&
      (typeof decoded.cursor === "string" || decoded.cursor === null) &&
      (decoded.queue === undefined ||
        (Array.isArray(decoded.queue) && decoded.queue.every((id) => typeof id === "string")))
    ) {
      return decoded;
    }
  } catch {
    // Fall through to the first company so malformed cursors are harmless.
  }
  return { empresaIndex: 0, cursor: null };
}

function encodeCursor(cursor: DashboardCursor): string {
  return JSON.stringify(cursor);
}

type ItemFilterArgs = {
  grupoFase?: string;
  fase?: string;
  slaEstado?: string;
  tipoFlujo?: string;
  documentoClase?: string;
  moneda?: string;
  soloActivas: boolean;
};

function matchesItem(item: Doc<"facturacionDashboardItems">, args: ItemFilterArgs) {
  return (
    (!args.soloActivas || item.esActiva) &&
    (!args.grupoFase || item.grupoFase === args.grupoFase) &&
    (!args.fase || item.faseActual === args.fase) &&
    (!args.slaEstado || item.slaEstado === args.slaEstado) &&
    (!args.tipoFlujo || item.tipoFlujo === args.tipoFlujo) &&
    (!args.documentoClase || item.documentoClase === args.documentoClase) &&
    (!args.moneda || item.moneda === args.moneda)
  );
}

function isOutsideDateRange(
  item: Doc<"facturacionDashboardItems">,
  range: DateRange,
  ignoreDateRange: boolean
) {
  if (ignoreDateRange || range.fromMs == null || range.toMsExclusive == null) return false;
  return item.fechaEmisionMs < range.fromMs || item.fechaEmisionMs >= range.toMsExclusive;
}

function normalizeResponsableEmails(emails: string[] | undefined) {
  if (!emails || emails.length === 0) return new Set<string>();
  return new Set(emails.map((email) => normalizeOwnerEmail(email)));
}

function matchesResponsables(
  activeOwners: Doc<"facturacionDashboardResponsables">[],
  userIds: string[] | undefined,
  emails: Set<string>
) {
  const hasUserFilter = Boolean(userIds && userIds.length > 0);
  const hasEmailFilter = emails.size > 0;
  if (!hasUserFilter && !hasEmailFilter) return true;
  return activeOwners.some(
    (owner) =>
      (hasUserFilter && owner.userId != null && userIds!.includes(owner.userId)) ||
      (hasEmailFilter && emails.has(normalizeOwnerEmail(owner.email)))
  );
}

type FacturaLedgerRow = {
  facturaId: Id<"facturacionFacturas">;
  empresa: number;
  numeroFactura: string;
  proveedorNombre: string;
  proveedorNit: string;
  fechaEmision: string;
  faseActual: string;
  grupoFase: string;
  owners: Array<{
    userId: string | null;
    email: string;
    nombre: string;
    rol: string;
    assignmentAgeMs: number;
  }>;
  phaseAgeMs: number;
  slaEstado: string;
  slaUmbralDias: number | null;
  valorContable: number;
  valorAPagar: number | null;
  moneda: string;
  tipoFlujo: string;
  esLegacyJefeDirecto: boolean;
  fueraDeRango: boolean;
  integrityIssues: string[];
};

async function loadActiveOwners(
  ctx: QueryCtx,
  facturaId: Id<"facturacionFacturas">
): Promise<Doc<"facturacionDashboardResponsables">[]> {
  const owners: Doc<"facturacionDashboardResponsables">[] = [];
  for await (const owner of ctx.db
    .query("facturacionDashboardResponsables")
    .withIndex("by_facturaId", (q) => q.eq("facturaId", facturaId))) {
    if (owner.esActiva) owners.push(owner);
  }
  return owners;
}

async function buildLedgerRow(
  ctx: QueryCtx,
  item: Doc<"facturacionDashboardItems">,
  now: number,
  range: DateRange,
  ignoreDateRange: boolean,
  activeOwners?: Doc<"facturacionDashboardResponsables">[]
): Promise<FacturaLedgerRow> {
  const owners = activeOwners ?? (await loadActiveOwners(ctx, item.facturaId));
  const outsideRange = isOutsideDateRange(item, range, ignoreDateRange);
  return {
    facturaId: item.facturaId,
    empresa: item.empresa,
    numeroFactura: item.numeroFactura,
    proveedorNombre: item.proveedorNombre,
    proveedorNit: item.proveedorNit,
    fechaEmision: item.fechaEmision,
    faseActual: item.faseActual,
    grupoFase: item.grupoFase,
    owners: owners.map((owner) => ({
      userId: owner.userId ?? null,
      email: owner.email,
      nombre: owner.nombre,
      rol: owner.rol,
      assignmentAgeMs: Math.max(0, now - owner.fechaAsignacion),
    })),
    phaseAgeMs: item.sortFaseAgeMs,
    slaEstado: item.slaEstado,
    slaUmbralDias: item.slaUmbralDias ?? null,
    valorContable: item.valorContable,
    valorAPagar: item.valorAPagar ?? null,
    moneda: item.moneda,
    tipoFlujo: item.tipoFlujo,
    esLegacyJefeDirecto: item.esLegacyJefeDirecto,
    fueraDeRango: outsideRange,
    integrityIssues: item.integrityIssues,
  };
}

async function itemMatchesAllFilters(
  ctx: QueryCtx,
  item: Doc<"facturacionDashboardItems">,
  args: ItemFilterArgs & {
    range: DateRange;
    ignoreDateRange: boolean;
    responsableUserIds?: string[];
    responsableEmails?: string[];
  }
): Promise<boolean> {
  if (!matchesItem(item, args)) return false;
  if (isOutsideDateRange(item, args.range, args.ignoreDateRange)) return false;
  const userIds = args.responsableUserIds;
  const emails = normalizeResponsableEmails(args.responsableEmails);
  if (!userIds?.length && emails.size === 0) return true;
  const activeOwners = await loadActiveOwners(ctx, item.facturaId);
  return matchesResponsables(activeOwners, userIds, emails);
}

export const facturas = query({
  args: {
    secret: v.string(),
    empresas: v.array(v.number()),
    preset: v.optional(v.string()),
    from: v.optional(v.string()),
    to: v.optional(v.string()),
    busqueda: v.optional(v.string()),
    grupoFase: v.optional(v.string()),
    fase: v.optional(v.string()),
    responsableUserIds: v.optional(v.array(v.string())),
    responsableEmails: v.optional(v.array(v.string())),
    slaEstado: v.optional(v.string()),
    tipoFlujo: v.optional(v.string()),
    documentoClase: v.optional(v.string()),
    moneda: v.optional(v.string()),
    soloActivas: v.optional(v.boolean()),
    ignoreDateRange: v.optional(v.boolean()),
    pageSize: v.optional(v.number()),
    cursor: v.optional(v.string()),
    nowMs: v.optional(v.number()),
  },
  returns: v.object({
    page: v.array(facturaLedgerRowValidator),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, args) => {
    requireServerSecret(args.secret);
    const now = args.nowMs ?? Date.now();
    const range = resolveDateRange(args);
    const pageSize = Math.min(Math.max(args.pageSize ?? 20, 1), MAX_PAGE_SIZE);
    const search = args.busqueda?.trim().toLowerCase();
    const filterArgs: ItemFilterArgs = {
      grupoFase: args.grupoFase,
      fase: args.fase,
      slaEstado: args.slaEstado,
      tipoFlujo: args.tipoFlujo,
      documentoClase: args.documentoClase,
      moneda: args.moneda,
      soloActivas: args.soloActivas !== false,
    };
    const matchArgs = {
      ...filterArgs,
      range,
      ignoreDateRange: args.ignoreDateRange === true,
      responsableUserIds: args.responsableUserIds,
      responsableEmails: args.responsableEmails,
    };

    const state = decodeCursor(args.cursor);
    const page: FacturaLedgerRow[] = [];
    let queue: string[] = [...(state.queue ?? [])];
    let empresaIndex = state.empresaIndex;
    let sourceCursor = state.cursor;

    // 1) Drain any overflow carried from the previous batch. These are direct
    // index lookups (not pagination), so they never count against Convex's
    // single-paginate-per-function limit.
    while (queue.length > 0 && page.length < pageSize) {
      const facturaId = queue.shift()! as Id<"facturacionFacturas">;
      const item = await ctx.db
        .query("facturacionDashboardItems")
        .withIndex("by_facturaId", (q) => q.eq("facturaId", facturaId))
        .unique();
      if (!item || !(await itemMatchesAllFilters(ctx, item, matchArgs))) continue;
      page.push(await buildLedgerRow(ctx, item, now, range, matchArgs.ignoreDateRange));
    }

    // 2) If we still need more rows, run EXACTLY ONE paginated scan. Convex only
    // allows a single paginated query per function call, so we scan a wide batch
    // and carry any surplus matches forward through the cursor queue.
    if (page.length < pageSize && queue.length === 0 && empresaIndex < args.empresas.length) {
      const empresa = args.empresas[empresaIndex]!;
      type SourcePage = {
        page: Doc<"facturacionDashboardItems">[];
        isDone: boolean;
        continueCursor: string;
      };
      let source: SourcePage;
      if (search && search.length >= 2) {
        source = await ctx.db
          .query("facturacionDashboardItems")
          .withSearchIndex("search_identity", (q) =>
            q.search("searchText", search).eq("empresa", empresa)
          )
          .paginate({ numItems: FACTURAS_SCAN_BATCH, cursor: sourceCursor });
      } else {
        source = await ctx.db
          .query("facturacionDashboardItems")
          .withIndex("by_empresa_fechaEmisionMs", (q) => {
            if (!matchArgs.ignoreDateRange && range.fromMs != null && range.toMsExclusive != null) {
              return q
                .eq("empresa", empresa)
                .gte("fechaEmisionMs", range.fromMs)
                .lt("fechaEmisionMs", range.toMsExclusive);
            }
            return q.eq("empresa", empresa);
          })
          .paginate({ numItems: FACTURAS_SCAN_BATCH, cursor: sourceCursor });
      }

      const overflowQueue: string[] = [];
      for (const item of source.page) {
        if (!(await itemMatchesAllFilters(ctx, item, matchArgs))) continue;
        if (page.length < pageSize) {
          page.push(await buildLedgerRow(ctx, item, now, range, matchArgs.ignoreDateRange));
        } else {
          overflowQueue.push(String(item.facturaId));
        }
      }
      queue = overflowQueue;

      if (source.isDone) {
        // Finished this company; the next call resumes on the following one.
        empresaIndex += 1;
        sourceCursor = null;
      } else {
        sourceCursor = source.continueCursor;
      }
    }

    const nextState: DashboardCursor = {
      empresaIndex,
      cursor: sourceCursor,
      queue: queue.length > 0 ? queue : undefined,
    };
    const isDone =
      nextState.empresaIndex >= args.empresas.length &&
      !nextState.queue?.length &&
      nextState.cursor === null;
    return {
      page,
      isDone,
      continueCursor: isDone ? "" : encodeCursor(nextState),
    };
  },
});

const responsableRowValidator = v.object({
  userId: v.union(v.string(), v.null()),
  email: v.string(),
  nombre: v.string(),
  invoiceCount: v.number(),
  warningCount: v.number(),
  breachedCount: v.number(),
  oldestPhaseAgeMs: v.union(v.number(), v.null()),
  montosPorMoneda: currencyBreakdownValidator,
  sharedInvoiceCount: v.number(),
});

export const responsables = query({
  args: {
    secret: v.string(),
    empresas: v.array(v.number()),
    preset: v.optional(v.string()),
    from: v.optional(v.string()),
    to: v.optional(v.string()),
    nowMs: v.optional(v.number()),
  },
  returns: v.object({
    groups: v.array(
      v.object({
        group: v.string(),
        people: v.array(responsableRowValidator),
      })
    ),
  }),
  handler: async (ctx, args) => {
    requireServerSecret(args.secret);
    const range = resolveDateRange(args);

    type PersonAgg = {
      userId: string | null;
      email: string;
      nombre: string;
      invoiceIds: Set<string>;
      sharedIds: Set<string>;
      warningCount: number;
      breachedCount: number;
      oldestPhaseAgeMs: number | null;
      montosPorMoneda: Record<string, number>;
    };

    const groups = new Map<ResponsablePanelGroup, Map<string, PersonAgg>>();
    for (const group of RESPONSABLE_PANEL_GROUPS) groups.set(group, new Map());
    // Per group, how many owners each invoice has (drives "compartida" counts).
    const ownersPerInvoiceByGroup = new Map<ResponsablePanelGroup, Map<string, number>>();
    for (const group of RESPONSABLE_PANEL_GROUPS) ownersPerInvoiceByGroup.set(group, new Map());
    let scanned = 0;

    for (const empresa of args.empresas) {
      for (const clave of ["lider_administracion", "lider_tecnologia"] as const) {
        const configured = ctx.db
          .query("facturacionConfiguracionUsuarios")
          .withIndex("by_empresa_clave", (q) => q.eq("empresa", empresa).eq("clave", clave));
        for await (const row of configured) {
          const email = normalizeOwnerEmail(row.email);
          const key = row.usuarioId ? `id:${row.usuarioId}` : `email:${email}`;
          const bucket = groups.get("lideres")!;
          if (!bucket.has(key)) {
            bucket.set(key, {
              userId: row.usuarioId ?? null,
              email,
              nombre: row.nombre,
              invoiceIds: new Set<string>(),
              sharedIds: new Set<string>(),
              warningCount: 0,
              breachedCount: 0,
              oldestPhaseAgeMs: null,
              montosPorMoneda: {},
            });
          }
        }
      }

      if (scanned >= DISTRIBUCION_MAX_SCAN) break;

      // Drive aggregation from items (which reliably carry fechaEmisionMs) and
      // join each invoice's active owners, so the panel always matches the ledger
      // regardless of legacy responsable rows missing projected fields.
      const items = ctx.db
        .query("facturacionDashboardItems")
        .withIndex("by_empresa_fechaEmisionMs", (q) => {
          if (range.fromMs != null && range.toMsExclusive != null) {
            return q
              .eq("empresa", empresa)
              .gte("fechaEmisionMs", range.fromMs)
              .lt("fechaEmisionMs", range.toMsExclusive);
          }
          return q.eq("empresa", empresa);
        });

      for await (const item of items) {
        scanned += 1;
        if (scanned >= DISTRIBUCION_MAX_SCAN) break;
        if (!item.esActiva) continue;

        const invoiceKey = String(item.facturaId);
        const activeOwners = await loadActiveOwners(ctx, item.facturaId);

        for (const owner of activeOwners) {
          const panelGroup = classifyResponsablePanelGroup(owner.fase);
          if (!panelGroup) continue;

          const groupOwnerCounts = ownersPerInvoiceByGroup.get(panelGroup)!;
          groupOwnerCounts.set(invoiceKey, (groupOwnerCounts.get(invoiceKey) ?? 0) + 1);

          const personKey = owner.userId
            ? `id:${owner.userId}`
            : `email:${normalizeOwnerEmail(owner.email)}`;
          const bucket = groups.get(panelGroup)!;
          const person = bucket.get(personKey) ?? {
            userId: owner.userId ?? null,
            email: normalizeOwnerEmail(owner.email),
            nombre: owner.nombre,
            invoiceIds: new Set<string>(),
            sharedIds: new Set<string>(),
            warningCount: 0,
            breachedCount: 0,
            oldestPhaseAgeMs: null,
            montosPorMoneda: {},
          };

          if (!person.invoiceIds.has(invoiceKey)) {
            person.invoiceIds.add(invoiceKey);
            if (item.slaEstado === "warning") person.warningCount += 1;
            if (item.slaEstado === "breached") person.breachedCount += 1;
            person.montosPorMoneda[item.moneda] =
              (person.montosPorMoneda[item.moneda] ?? 0) + item.valorContable;
            if (person.oldestPhaseAgeMs == null || item.sortFaseAgeMs > person.oldestPhaseAgeMs) {
              person.oldestPhaseAgeMs = item.sortFaseAgeMs;
            }
          }
          bucket.set(personKey, person);
        }
      }
    }

    for (const [group, bucket] of groups) {
      const groupOwnerCounts = ownersPerInvoiceByGroup.get(group)!;
      for (const person of bucket.values()) {
        for (const invoiceId of person.invoiceIds) {
          if ((groupOwnerCounts.get(invoiceId) ?? 0) > 1) person.sharedIds.add(invoiceId);
        }
      }
    }

    return {
      groups: RESPONSABLE_PANEL_GROUPS.map((group) => ({
        group,
        people: [...(groups.get(group)?.values() ?? [])]
          .map((person) => ({
            userId: person.userId,
            email: person.email,
            nombre: person.nombre,
            invoiceCount: person.invoiceIds.size,
            warningCount: person.warningCount,
            breachedCount: person.breachedCount,
            oldestPhaseAgeMs: person.oldestPhaseAgeMs,
            montosPorMoneda: person.montosPorMoneda,
            sharedInvoiceCount: person.sharedIds.size,
          }))
          .sort(
            (a, b) =>
              b.breachedCount - a.breachedCount ||
              b.warningCount - a.warningCount ||
              b.invoiceCount - a.invoiceCount ||
              a.nombre.localeCompare(b.nombre)
          ),
      })),
    };
  },
});

/**
 * Exact invoice list for one responsable row in the panel.
 * Scope mirrors `responsables` aggregation: allowed companies, period,
 * responsibility group (via assignment fase), active invoice, and identity.
 */
export const facturasPorResponsable = query({
  args: {
    secret: v.string(),
    empresas: v.array(v.number()),
    preset: v.optional(v.string()),
    from: v.optional(v.string()),
    to: v.optional(v.string()),
    group: v.string(),
    userId: v.optional(v.string()),
    email: v.optional(v.string()),
    pageSize: v.optional(v.number()),
    cursor: v.optional(v.string()),
    nowMs: v.optional(v.number()),
  },
  returns: v.object({
    page: v.array(facturaLedgerRowValidator),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, args) => {
    requireServerSecret(args.secret);
    if (!isResponsablePanelGroup(args.group)) {
      throw new Error("Grupo de responsabilidad inválido.");
    }
    const userId = args.userId?.trim() || undefined;
    const email = args.email ? normalizeOwnerEmail(args.email) : undefined;
    if (!userId && !email) {
      throw new Error("Indica userId o email del responsable.");
    }

    const now = args.nowMs ?? Date.now();
    const range = resolveDateRange(args);
    const pageSize = Math.min(Math.max(args.pageSize ?? 50, 1), MAX_PAGE_SIZE);
    const group = args.group;

    const state = decodeCursor(args.cursor);
    const page: FacturaLedgerRow[] = [];
    const seen = new Set<string>();
    let queue: string[] = [...(state.queue ?? [])];
    let empresaIndex = state.empresaIndex;
    let sourceCursor = state.cursor;

    async function tryPushFactura(facturaId: Id<"facturacionFacturas">) {
      const key = String(facturaId);
      if (seen.has(key)) return;
      const item = await ctx.db
        .query("facturacionDashboardItems")
        .withIndex("by_facturaId", (q) => q.eq("facturaId", facturaId))
        .unique();
      if (!item || !item.esActiva) return;
      if (range.fromMs != null && range.toMsExclusive != null) {
        if (item.fechaEmisionMs < range.fromMs || item.fechaEmisionMs >= range.toMsExclusive) {
          return;
        }
      }
      seen.add(key);
      page.push(await buildLedgerRow(ctx, item, now, range, false));
    }

    while (queue.length > 0 && page.length < pageSize) {
      const facturaId = queue.shift()! as Id<"facturacionFacturas">;
      await tryPushFactura(facturaId);
    }

    if (page.length < pageSize && queue.length === 0 && empresaIndex < args.empresas.length) {
      const empresa = args.empresas[empresaIndex]!;
      type SourcePage = {
        page: Doc<"facturacionDashboardResponsables">[];
        isDone: boolean;
        continueCursor: string;
      };
      let source: SourcePage;
      if (userId) {
        source = await ctx.db
          .query("facturacionDashboardResponsables")
          .withIndex("by_empresa_userId_esActiva", (q) =>
            q.eq("empresa", empresa).eq("userId", userId).eq("esActiva", true)
          )
          .paginate({ numItems: RESPONSABLES_FACTURAS_SCAN_BATCH, cursor: sourceCursor });
      } else {
        source = await ctx.db
          .query("facturacionDashboardResponsables")
          .withIndex("by_empresa_email_esActiva", (q) =>
            q.eq("empresa", empresa).eq("email", email!).eq("esActiva", true)
          )
          .paginate({ numItems: RESPONSABLES_FACTURAS_SCAN_BATCH, cursor: sourceCursor });
      }

      const overflowQueue: string[] = [];
      for (const owner of source.page) {
        if (classifyResponsablePanelGroup(owner.fase) !== group) continue;
        if (range.fromMs != null && range.toMsExclusive != null) {
          if (
            owner.fechaEmisionMs < range.fromMs ||
            owner.fechaEmisionMs >= range.toMsExclusive
          ) {
            continue;
          }
        }
        const invoiceKey = String(owner.facturaId);
        if (seen.has(invoiceKey) || overflowQueue.includes(invoiceKey)) continue;

        const item = await ctx.db
          .query("facturacionDashboardItems")
          .withIndex("by_facturaId", (q) => q.eq("facturaId", owner.facturaId))
          .unique();
        if (!item || !item.esActiva) continue;
        if (range.fromMs != null && range.toMsExclusive != null) {
          if (item.fechaEmisionMs < range.fromMs || item.fechaEmisionMs >= range.toMsExclusive) {
            continue;
          }
        }

        if (page.length < pageSize) {
          seen.add(invoiceKey);
          page.push(await buildLedgerRow(ctx, item, now, range, false));
        } else {
          overflowQueue.push(invoiceKey);
        }
      }
      queue = overflowQueue;

      if (source.isDone) {
        empresaIndex += 1;
        sourceCursor = null;
      } else {
        sourceCursor = source.continueCursor;
      }
    }

    const nextState: DashboardCursor = {
      empresaIndex,
      cursor: sourceCursor,
      queue: queue.length > 0 ? queue : undefined,
    };
    const isDone =
      nextState.empresaIndex >= args.empresas.length &&
      !nextState.queue?.length &&
      nextState.cursor === null;
    return {
      page,
      isDone,
      continueCursor: isDone ? "" : encodeCursor(nextState),
    };
  },
});

export const distribucion = query({
  args: {
    secret: v.string(),
    empresas: v.array(v.number()),
    preset: v.optional(v.string()),
    from: v.optional(v.string()),
    to: v.optional(v.string()),
    busqueda: v.optional(v.string()),
    grupoFase: v.optional(v.string()),
    fase: v.optional(v.string()),
    responsableUserIds: v.optional(v.array(v.string())),
    responsableEmails: v.optional(v.array(v.string())),
    slaEstado: v.optional(v.string()),
    tipoFlujo: v.optional(v.string()),
    documentoClase: v.optional(v.string()),
    moneda: v.optional(v.string()),
    soloActivas: v.optional(v.boolean()),
    ignoreDateRange: v.optional(v.boolean()),
    nowMs: v.optional(v.number()),
  },
  returns: v.object({
    porFase: v.array(v.object({ fase: v.string(), count: v.number() })),
    porResponsable: v.array(
      v.object({
        userId: v.union(v.string(), v.null()),
        email: v.string(),
        nombre: v.string(),
        count: v.number(),
      })
    ),
    truncated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    requireServerSecret(args.secret);
    const range = resolveDateRange(args);
    const search = args.busqueda?.trim().toLowerCase();
    const filterArgs: ItemFilterArgs = {
      grupoFase: args.grupoFase,
      fase: args.fase,
      slaEstado: args.slaEstado,
      tipoFlujo: args.tipoFlujo,
      documentoClase: args.documentoClase,
      moneda: args.moneda,
      soloActivas: args.soloActivas !== false,
    };
    const matchArgs = {
      ...filterArgs,
      range,
      ignoreDateRange: args.ignoreDateRange === true,
      responsableUserIds: args.responsableUserIds,
      responsableEmails: args.responsableEmails,
    };

    const porFase = new Map<string, number>();
    const porResponsable = new Map<
      string,
      { userId: string | null; email: string; nombre: string; count: number }
    >();
    let scanned = 0;
    let truncated = false;

    for (const empresa of args.empresas) {
      if (scanned >= DISTRIBUCION_MAX_SCAN) {
        truncated = true;
        break;
      }

      if (search && search.length >= 2) {
        const rows = ctx.db
          .query("facturacionDashboardItems")
          .withSearchIndex("search_identity", (q) =>
            q.search("searchText", search).eq("empresa", empresa)
          );
        for await (const item of rows) {
          scanned += 1;
          if (scanned >= DISTRIBUCION_MAX_SCAN) {
            truncated = true;
            break;
          }
          if (!(await itemMatchesAllFilters(ctx, item, matchArgs))) continue;
          porFase.set(item.faseActual, (porFase.get(item.faseActual) ?? 0) + 1);
          const activeOwners = await loadActiveOwners(ctx, item.facturaId);
          for (const owner of activeOwners) {
            const key = owner.userId ? `id:${owner.userId}` : `email:${normalizeOwnerEmail(owner.email)}`;
            const current = porResponsable.get(key) ?? {
              userId: owner.userId ?? null,
              email: normalizeOwnerEmail(owner.email),
              nombre: owner.nombre,
              count: 0,
            };
            current.count += 1;
            porResponsable.set(key, current);
          }
        }
        continue;
      }

      const rows = ctx.db
        .query("facturacionDashboardItems")
        .withIndex("by_empresa_fechaEmisionMs", (q) => {
          if (!matchArgs.ignoreDateRange && range.fromMs != null && range.toMsExclusive != null) {
            return q
              .eq("empresa", empresa)
              .gte("fechaEmisionMs", range.fromMs)
              .lt("fechaEmisionMs", range.toMsExclusive);
          }
          return q.eq("empresa", empresa);
        });

      for await (const item of rows) {
        scanned += 1;
        if (scanned >= DISTRIBUCION_MAX_SCAN) {
          truncated = true;
          break;
        }
        if (!(await itemMatchesAllFilters(ctx, item, matchArgs))) continue;
        porFase.set(item.faseActual, (porFase.get(item.faseActual) ?? 0) + 1);
        const activeOwners = await loadActiveOwners(ctx, item.facturaId);
        for (const owner of activeOwners) {
          const key = owner.userId ? `id:${owner.userId}` : `email:${normalizeOwnerEmail(owner.email)}`;
          const current = porResponsable.get(key) ?? {
            userId: owner.userId ?? null,
            email: normalizeOwnerEmail(owner.email),
            nombre: owner.nombre,
            count: 0,
          };
          current.count += 1;
          porResponsable.set(key, current);
        }
      }
    }

    return {
      porFase: [...porFase.entries()]
        .map(([fase, count]) => ({ fase, count }))
        .sort((a, b) => b.count - a.count || a.fase.localeCompare(b.fase)),
      porResponsable: [...porResponsable.values()].sort(
        (a, b) => b.count - a.count || a.nombre.localeCompare(b.nombre)
      ),
      truncated,
    };
  },
});

export const refrescarProyeccion = internalMutation({
  args: { facturaId: v.id("facturacionFacturas"), nowMs: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    await refrescarProyeccionFactura(ctx, args.facturaId, args.nowMs);
    return null;
  },
});

export const refrescarProyeccionBatch = internalMutation({
  args: { facturaIds: v.array(v.id("facturacionFacturas")), nowMs: v.optional(v.number()) },
  returns: v.object({ processed: v.number() }),
  handler: async (ctx, args) => {
    if (args.facturaIds.length > BACKFILL_BATCH_SIZE)
      throw new Error("Un lote de proyección no puede exceder 50 facturas.");
    const now = args.nowMs ?? Date.now();
    for (const facturaId of args.facturaIds) await refrescarProyeccionFactura(ctx, facturaId, now);
    return { processed: args.facturaIds.length };
  },
});

/** Internal only: run from the Convex dashboard / CLI (`npx convex run`). */
export const iniciarBackfill = internalMutation({
  args: { reiniciar: v.optional(v.boolean()) },
  returns: v.object({ estado: v.string(), procesadas: v.number() }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("facturacionDashboardBackfills")
      .withIndex("by_clave", (q) => q.eq("clave", BACKFILL_KEY))
      .unique();
    if (existing?.estado === "running" && !args.reiniciar)
      return { estado: existing.estado, procesadas: existing.procesadas };
    if (existing) {
      await ctx.db.patch("facturacionDashboardBackfills", existing._id, {
        estado: "running",
        cursor: null,
        procesadas: 0,
        lotes: 0,
        iniciadoEn: now,
        completadoEn: undefined,
        actualizadoEn: now,
        error: undefined,
      });
    } else {
      await ctx.db.insert("facturacionDashboardBackfills", {
        clave: BACKFILL_KEY,
        estado: "running",
        cursor: null,
        procesadas: 0,
        lotes: 0,
        iniciadoEn: now,
        actualizadoEn: now,
      });
    }
    await ctx.scheduler.runAfter(0, internal.facturacionDashboard.ejecutarBackfillLote, {});
    return { estado: "running", procesadas: 0 };
  },
});

export const estadoBackfill = internalQuery({
  args: {},
  returns: v.union(
    v.object({
      estado: v.string(),
      procesadas: v.number(),
      lotes: v.number(),
      cursor: v.union(v.string(), v.null()),
      iniciadoEn: v.union(v.number(), v.null()),
      completadoEn: v.union(v.number(), v.null()),
      error: v.union(v.string(), v.null()),
    }),
    v.null()
  ),
  handler: async (ctx) => {
    const state = await ctx.db
      .query("facturacionDashboardBackfills")
      .withIndex("by_clave", (q) => q.eq("clave", BACKFILL_KEY))
      .unique();
    if (!state) return null;
    return {
      estado: state.estado,
      procesadas: state.procesadas,
      lotes: state.lotes,
      cursor: state.cursor,
      iniciadoEn: state.iniciadoEn ?? null,
      completadoEn: state.completadoEn ?? null,
      error: state.error ?? null,
    };
  },
});

export const ejecutarBackfillLote = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const state = await ctx.db
      .query("facturacionDashboardBackfills")
      .withIndex("by_clave", (q) => q.eq("clave", BACKFILL_KEY))
      .unique();
    if (!state || state.estado !== "running") return null;
    try {
      const batch = await ctx.db
        .query("facturacionFacturas")
        .paginate({ numItems: BACKFILL_BATCH_SIZE, cursor: state.cursor });
      const now = Date.now();
      for (const factura of batch.page) await refrescarProyeccionFactura(ctx, factura._id, now);
      await ctx.db.patch("facturacionDashboardBackfills", state._id, {
        cursor: batch.isDone ? null : batch.continueCursor,
        procesadas: state.procesadas + batch.page.length,
        lotes: state.lotes + 1,
        estado: batch.isDone ? "completed" : "running",
        completadoEn: batch.isDone ? now : undefined,
        actualizadoEn: now,
      });
      if (!batch.isDone)
        await ctx.scheduler.runAfter(0, internal.facturacionDashboard.ejecutarBackfillLote, {});
    } catch (error) {
      await ctx.db.patch("facturacionDashboardBackfills", state._id, {
        estado: "failed",
        actualizadoEn: Date.now(),
        error: error instanceof Error ? error.message : "Error desconocido durante backfill.",
      });
    }
    return null;
  },
});

export const reconciliarProyecciones = internalMutation({
  args: {
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
    nowMs: v.optional(v.number()),
  },
  returns: v.object({
    repaired: v.number(),
    continueCursor: v.union(v.string(), v.null()),
    isDone: v.boolean(),
  }),
  handler: async (ctx, args) => {
    if (!backgroundJobsHabilitados()) {
      return { repaired: 0, continueCursor: null, isDone: true };
    }
    const batch = await ctx.db.query("facturacionDashboardItems").paginate({
      numItems: Math.min(Math.max(args.limit ?? BACKFILL_BATCH_SIZE, 1), BACKFILL_BATCH_SIZE),
      cursor: args.cursor ?? null,
    });
    const now = args.nowMs ?? Date.now();
    for (const item of batch.page) await refrescarProyeccionFactura(ctx, item.facturaId, now);
    if (!batch.isDone) {
      await ctx.scheduler.runAfter(0, internal.facturacionDashboard.reconciliarProyecciones, {
        cursor: batch.continueCursor,
        limit: args.limit,
        nowMs: now,
      });
    }
    return {
      repaired: batch.page.length,
      continueCursor: batch.isDone ? null : batch.continueCursor,
      isDone: batch.isDone,
    };
  },
});
