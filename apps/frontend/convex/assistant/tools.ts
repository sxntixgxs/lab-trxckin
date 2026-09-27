import { v } from 'convex/values';
import { z } from 'zod';
import type {
  AssistantCell,
  AssistantDomain,
  AssistantRecordReference,
  AssistantRecordType,
  AssistantSourceRequirement,
  AssistantToolResult,
} from '../../lib/assistant/contracts';
import { ASSISTANT_DOMAIN_LABELS, assistantDomainSchema } from '../../lib/assistant/contracts';
import { recordHref } from '../../lib/command-palette/record-links';
import { RUTAS_SISTEMA as R } from '../../lib/rutas-sistema';
import type { Doc } from '../_generated/dataModel';
import { internalQuery, type MutationCtx, type QueryCtx } from '../_generated/server';
import { actorPuedeVerAnticipo } from '../financiero/anticipos';
import { usuarioPuedeVerCajaMenor } from '../cajasMenores';
import {
  actorPuedeVerEmpresa,
  actorTieneAlgunPermiso,
  actorTienePermiso,
  requireActor,
  type BillingActor,
} from '../lib/billingAuth';
import { actorPuedeVerFactura } from '../lib/facturacionAccess';
import { computeSlaState, localBogotaDateString } from '../lib/facturacionBusinessTime';
import { resolveValidOwners } from '../lib/facturacionOwnership';
import { getPermisosEmpresa, puedeObservarReembolsoActivo } from '../lib/cajaMenorReembolsoPermisos';
import { deriveReembolsoResponsable, isReembolsoEstadoSeguimientoActivo } from '../lib/cajaMenorBandeja';
import {
  getSaldoLegalizadoAnticipo,
  getSaldoPendienteLegalizableAnticipo,
  getValorLegalizableAnticipo,
} from '../lib/valorLegalizableAnticipo';
import { normalizeEmpresa } from '../lib/normalize';
import { puedeVerInscripcion, resolveOnboardingAccess } from '../lib/onboarding/access';
import { ASSISTANT_WORKFLOWS } from './knowledge';
import { getCompanyVisibility } from '../lib/anticiposVisibility';

type Ctx = QueryCtx | MutationCtx;
type CellRow = Record<string, AssistantCell>;
const MAX_PAGE = 30;
const MAX_BALANCE_ROWS = 250;
const PERMISSIONS: Record<AssistantDomain, readonly string[]> = {
  billing: [R.FACTURACION_FACTURAS, R.FACTURACION_BUZON, R.FACTURACION_DASHBOARD],
  suppliers: [R.PROVEEDORES_ONBOARDING],
  customers: [R.CLIENTES_ONBOARDING],
  advances: [R.FINANZAS_ANTICIPOS_DASHBOARD, R.FINANZAS_ANTICIPOS_SOLICITAR],
  pettyCash: [R.FINANZAS_CAJAS_MENORES, R.FACTURACION_REEMBOLSO_CAJA_MENOR],
};
const operations = ['search', 'detail', 'summary', 'movements', 'reimbursements', 'legalizations', 'workflow'] as const;
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const timestamp = Date.parse(`${value}T00:00:00Z`);
    return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
  }, 'Fecha de calendario inválida');
export const assistantNativeToolSchema = z
  .object({
    domain: assistantDomainSchema,
    operation: z.enum(operations),
    search: z.string().trim().max(160).optional(),
    recordId: z.string().max(200).optional(),
    limit: z.number().int().min(1).max(MAX_PAGE).optional(),
    cursor: z.string().max(8000).optional(),
    from: dateSchema.optional(),
    to: dateSchema.optional(),
  })
  .strict();
type Input = z.infer<typeof assistantNativeToolSchema> & { companyIds: number[]; expectedActingUserId: string };
const domainV = v.union(
  v.literal('billing'),
  v.literal('suppliers'),
  v.literal('customers'),
  v.literal('advances'),
  v.literal('pettyCash'),
);
const operationV = v.union(...operations.map((operation) => v.literal(operation)));

function assertScope(actor: BillingActor, companyIds: number[], expectedActingUserId: string) {
  if (actor.usuarioId !== expectedActingUserId)
    throw new Error('La identidad activa cambió. Inicia una nueva conversación.');
  if (
    !companyIds.length ||
    companyIds.length > 8 ||
    companyIds.some((id) => !Number.isInteger(id) || !actorPuedeVerEmpresa(actor, id))
  ) {
    throw new Error('El alcance de empresas ya no está autorizado.');
  }
}
function assertDomain(actor: BillingActor, domain: AssistantDomain) {
  if (!actorTieneAlgunPermiso(actor, PERMISSIONS[domain])) throw new Error('No tienes acceso a este módulo.');
}
function source(record: AssistantRecordReference): AssistantSourceRequirement {
  return {
    domain: record.domain,
    kind: 'record',
    companyId: record.companyId,
    recordId: record.id,
    recordType: record.recordType,
  };
}
function reference(
  domain: AssistantDomain,
  recordType: AssistantRecordType,
  id: string,
  companyId: number,
  title: string,
  status: string,
): AssistantRecordReference {
  const kinds = { invoice: 'factura', supplier: 'proveedor', customer: 'cliente', advance: 'anticipo' } as const;
  const href =
    recordType in kinds
      ? recordHref(kinds[recordType as keyof typeof kinds], { id, empresa: companyId })
      : recordType === 'cashReimbursement'
        ? recordHref('reembolsoCajaMenor', { id })
        : recordHref('cajaMenor', { id });
  return { id, domain, recordType, companyId, title, href, status };
}
function baseResult(args: Input): AssistantToolResult {
  return {
    title: ASSISTANT_DOMAIN_LABELS[args.domain],
    records: [],
    rows: [],
    sources: [],
    metadata: {
      complete: true,
      returned: 0,
      scanned: 0,
      limit: args.limit ?? 20,
      nextCursor: null,
      companyIds: args.companyIds,
      currency: null,
      from: args.from ?? null,
      to: args.to ?? null,
      asOf: Date.now(),
      notes: [],
    },
  };
}
function add(result: AssistantToolResult, record: AssistantRecordReference, row: CellRow) {
  result.records.push(record);
  result.rows.push(row);
  result.sources.push(source(record));
}
function matches(args: Input, row: CellRow) {
  const normalized = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  if (args.search && !normalized(Object.values(row).join(' ')).includes(normalized(args.search))) return false;
  const date = typeof row.fecha === 'string' ? row.fecha.slice(0, 10) : null;
  return !(args.from && (!date || date < args.from)) && !(args.to && (!date || date > args.to));
}

/** Entitlements used by aggregate/empty answers. Record sources independently recheck ownership. */
export async function assistantAccessFingerprint(
  ctx: Ctx,
  actor: BillingActor,
  domain: AssistantDomain,
  companyId: number,
) {
  const base = {
    full: actor.hasFullAccess,
    permissions: PERMISSIONS[domain].filter((p) => actorTienePermiso(actor, p)),
    company: actorPuedeVerEmpresa(actor, companyId),
  };
  if (domain === 'suppliers' || domain === 'customers') {
    const { access } = await resolveOnboardingAccess(ctx, domain === 'suppliers' ? 'supplier' : 'customer', companyId);
    return JSON.stringify({ ...base, level: access.nivel });
  }
  if (domain === 'advances')
    return JSON.stringify({ ...base, visibility: await getCompanyVisibility(ctx, companyId, actor.usuarioId) });
  if (domain === 'pettyCash')
    return JSON.stringify({
      ...base,
      roles: await getPermisosEmpresa(ctx, companyId, actor.usuarioId, actor.hasFullAccess ? 1 : undefined),
    });
  return JSON.stringify(base);
}

async function canReadReimbursement(
  ctx: Ctx,
  actor: BillingActor,
  reembolso: Doc<'cajasMenoresReembolsos'>,
  caja: Doc<'cajasMenores'>,
) {
  const role = actor.hasFullAccess ? 1 : undefined;
  const access = await usuarioPuedeVerCajaMenor(ctx, caja, actor.usuarioId, role);
  const permissions = await getPermisosEmpresa(ctx, caja.empresa_id, actor.usuarioId, role);
  const active = isReembolsoEstadoSeguimientoActivo(reembolso.estado);
  const removedCustodian =
    reembolso.custodioUserId === actor.usuarioId && !caja.assignedUsersIds.includes(actor.usuarioId);
  if (removedCustodian) return active;
  if (active)
    return (
      access.canView ||
      reembolso.liderAprobadorUserId === actor.usuarioId ||
      puedeObservarReembolsoActivo(reembolso, caja, actor.usuarioId, permissions, role)
    );
  return (
    access.canView ||
    reembolso.liderAprobadorUserId === actor.usuarioId ||
    reembolso.custodioUserId === actor.usuarioId ||
    permissions.canPayTesoreria ||
    permissions.canApproveReembolso ||
    actor.hasFullAccess
  );
}

/** Fail closed for the whole conversation, including data already paraphrased in previous answers. */
export async function revalidateAssistantSources(
  ctx: Ctx,
  sources: AssistantSourceRequirement[],
  companyIds: number[],
  expectedActingUserId: string,
): Promise<boolean> {
  try {
    const actor = await requireActor(ctx);
    assertScope(actor, companyIds, expectedActingUserId);
    if (sources.length > 1000) return false;
    const fingerprints = new Map<string, string>();
    for (const item of sources) {
      if (!companyIds.includes(item.companyId)) return false;
      if (item.kind === 'erp') {
        if (!item.permission || !actorTienePermiso(actor, item.permission)) return false;
        continue;
      }
      if (item.kind === 'workflow' || item.kind === 'aggregate') {
        assertDomain(actor, item.domain);
        if (item.accessFingerprint) {
          const key = `${item.domain}:${item.companyId}`;
          if (!fingerprints.has(key))
            fingerprints.set(key, await assistantAccessFingerprint(ctx, actor, item.domain, item.companyId));
          if (fingerprints.get(key) !== item.accessFingerprint) return false;
        }
        continue;
      }
      if (!item.recordId || !item.recordType) return false;
      if (item.domain !== 'billing') assertDomain(actor, item.domain);
      if (!(await recordVisible(ctx, actor, item))) return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function recordVisible(ctx: Ctx, actor: BillingActor, item: AssistantSourceRequirement): Promise<boolean> {
  const id = item.recordId!;
  switch (item.recordType) {
    case 'invoice': {
      const normalized = ctx.db.normalizeId('facturacionFacturas', id);
      if (!normalized) return false;
      const doc = await ctx.db.get('facturacionFacturas', normalized);
      return !!doc && normalizeEmpresa(doc.empresa) === item.companyId && (await actorPuedeVerFactura(ctx, actor, doc));
    }
    case 'advance': {
      const normalized = ctx.db.normalizeId('anticipos', id);
      if (!normalized) return false;
      const doc = await ctx.db.get('anticipos', normalized);
      return (
        !!doc &&
        normalizeEmpresa(doc.empresa_id ?? doc.empresa) === item.companyId &&
        (await actorPuedeVerAnticipo(ctx, doc))
      );
    }
    case 'supplier':
    case 'customer': {
      const table = item.recordType === 'supplier' ? 'onboardingProveedores' : 'onboardingClientes';
      const normalized = ctx.db.normalizeId(table, id);
      if (!normalized) return false;
      const doc = await ctx.db.get(table, normalized);
      if (!doc || doc.empresa !== item.companyId) return false;
      const { access } = await resolveOnboardingAccess(ctx, item.recordType, doc.empresa);
      return puedeVerInscripcion(access, doc);
    }
    case 'cashBox': {
      const normalized = ctx.db.normalizeId('cajasMenores', id);
      if (!normalized) return false;
      const doc = await ctx.db.get('cajasMenores', normalized);
      return (
        !!doc &&
        doc.empresa_id === item.companyId &&
        (await usuarioPuedeVerCajaMenor(ctx, doc, actor.usuarioId, actor.hasFullAccess ? 1 : undefined)).canView
      );
    }
    case 'cashMovement': {
      const normalized = ctx.db.normalizeId('facturacionCajaMenorMovimientos', id);
      if (!normalized) return false;
      const doc = await ctx.db.get('facturacionCajaMenorMovimientos', normalized);
      if (!doc) return false;
      return recordVisible(ctx, actor, { ...item, recordType: 'cashBox', recordId: doc.cajaMenorId });
    }
    case 'cashReimbursement': {
      const normalized = ctx.db.normalizeId('cajasMenoresReembolsos', id);
      if (!normalized) return false;
      const doc = await ctx.db.get('cajasMenoresReembolsos', normalized);
      if (!doc) return false;
      const caja = await ctx.db.get('cajasMenores', doc.cajaMenorId);
      return !!caja && caja.empresa_id === item.companyId && (await canReadReimbursement(ctx, actor, doc, caja));
    }
    default:
      return false;
  }
}

async function invoice(
  ctx: Ctx,
  actor: BillingActor,
  doc: Doc<'facturacionFacturas'>,
  result: AssistantToolResult,
  args: Input,
) {
  if (!args.companyIds.includes(normalizeEmpresa(doc.empresa)) || !(await actorPuedeVerFactura(ctx, actor, doc)))
    return;
  const [task, projection, assignments] = await Promise.all([
    ctx.db
      .query('facturacionTareas')
      .withIndex('by_facturaId', (q) => q.eq('facturaId', doc._id))
      .first(),
    ctx.db
      .query('facturacionDashboardItems')
      .withIndex('by_facturaId', (q) => q.eq('facturaId', doc._id))
      .first(),
    ctx.db
      .query('facturacionAsignaciones')
      .withIndex('by_facturaId', (q) => q.eq('facturaId', doc._id))
      .take(501),
  ]);
  const ownership = resolveValidOwners({ tarea: task, asignaciones: assignments.slice(0, 500), factura: doc });
  const sla = computeSlaState({
    faseIniciadaEn: projection?.faseIniciadaEn,
    umbralDiasLaborales: projection?.slaUmbralDias,
    esActiva: projection?.esActiva ?? ownership.esActiva,
    nowMs: result.metadata.asOf,
  });
  const state = projection?.estadoListado ?? task?.estado ?? 'sin_tarea';
  const row: CellRow = {
    id: doc._id,
    empresa: normalizeEmpresa(doc.empresa),
    factura: doc.numeroFactura,
    proveedor: doc.proveedorNombre,
    nit: doc.proveedorNit,
    estado: state,
    fecha: doc.fechaEmision,
    totalFactura: doc.total,
    valorContable: doc.valorContable ?? doc.total,
    moneda: doc.moneda,
    responsable: ownership.owners.map((owner) => owner.nombre).join(', ') || null,
    sla: sla.estado,
    venceSla: sla.venceEn ?? null,
    diasHabilesEnFase: sla.edadDiasLaborales,
    valorAPagar: projection?.valorAPagar ?? null,
  };
  if (!matches(args, row)) return;
  const ref = reference('billing', 'invoice', doc._id, normalizeEmpresa(doc.empresa), doc.numeroFactura, state);
  add(
    result,
    {
      ...ref,
      subtitle: doc.proveedorNombre,
      date: doc.fechaEmision,
      amount: doc.valorContable ?? doc.total,
      currency: doc.moneda,
      ...(row.responsable ? { owner: String(row.responsable) } : {}),
    },
    row,
  );
  if (assignments.length > 500) {
    result.metadata.complete = false;
    result.metadata.notes.push('Historial de responsables truncado; no se puede confirmar que todos estén incluidos.');
  }
}

async function advance(ctx: Ctx, doc: Doc<'anticipos'>, result: AssistantToolResult, args: Input) {
  const company = normalizeEmpresa(doc.empresa_id ?? doc.empresa);
  if (!args.companyIds.includes(company) || !(await actorPuedeVerAnticipo(ctx, doc))) return;
  const row: CellRow = {
    id: doc._id,
    empresa: company,
    consecutivo: doc.consecutivo,
    proveedor: doc.razonSocial,
    nit: doc.nit,
    estado: doc.faseActual,
    fecha: localBogotaDateString(doc.createdAt),
    valorSolicitado: doc.valorNumerico,
    valorLegalizable: getValorLegalizableAnticipo(doc),
    saldoLegalizado: getSaldoLegalizadoAnticipo(doc),
    saldoPendiente: getSaldoPendienteLegalizableAnticipo(doc),
    responsable: doc.responsableNombre ?? null,
    fechaMaximaLegalizacion: localBogotaDateString(doc.maxLegalizacionDate),
    vencido: doc.faseActual === 'V_PENDIENTE_LEGALIZACION' && doc.maxLegalizacionDate < result.metadata.asOf,
    proceso: doc.procesoNombre ?? null,
    moneda: 'COP',
  };
  if (!matches(args, row)) return;
  add(
    result,
    {
      ...reference('advances', 'advance', doc._id, company, `Anticipo ${doc.consecutivo}`, doc.faseActual),
      subtitle: doc.razonSocial,
      amount: getSaldoPendienteLegalizableAnticipo(doc),
      currency: 'COP',
      date: String(row.fecha),
      ...(doc.responsableNombre ? { owner: doc.responsableNombre } : {}),
    },
    row,
  );
}

async function onboarding(
  ctx: Ctx,
  doc: Doc<'onboardingProveedores'> | Doc<'onboardingClientes'>,
  result: AssistantToolResult,
  args: Input,
) {
  if (!args.companyIds.includes(doc.empresa)) return;
  const supplier = args.domain === 'suppliers';
  const { access } = await resolveOnboardingAccess(ctx, supplier ? 'supplier' : 'customer', doc.empresa);
  if (!puedeVerInscripcion(access, doc)) return;
  const row: CellRow = {
    id: doc._id,
    empresa: doc.empresa,
    razonSocial: doc.datos_generales_01.razonSocial ?? '',
    nit: doc.NIT,
    estado: doc.faseActual,
    fecha: localBogotaDateString(doc._creationTime),
    riesgo: doc.matriz_00.riesgo,
    responsableId: doc.matriz_00.responsableId,
    tipoSolicitud: doc.datos_generales_01.tipoSolicitud ?? null,
    registroErpEnProceso: !!doc.registroErp,
  };
  if (!matches(args, row)) return;
  add(
    result,
    reference(
      args.domain,
      supplier ? 'supplier' : 'customer',
      doc._id,
      doc.empresa,
      String(row.razonSocial) || doc.NIT,
      doc.faseActual,
    ),
    row,
  );
}

async function cashBalance(ctx: Ctx, doc: Doc<'cajasMenores'>) {
  const [refills, movements, reimbursements, legacy] = await Promise.all([
    ctx.db
      .query('cajasMenoresRefills')
      .withIndex('by_cajaMenorId', (q) => q.eq('cajaMenorId', doc._id))
      .take(MAX_BALANCE_ROWS + 1),
    ctx.db
      .query('facturacionCajaMenorMovimientos')
      .withIndex('by_cajaMenorId', (q) => q.eq('cajaMenorId', doc._id))
      .take(MAX_BALANCE_ROWS + 1),
    ctx.db
      .query('cajasMenoresReembolsos')
      .withIndex('by_cajaMenorId_estado', (q) => q.eq('cajaMenorId', doc._id).eq('estado', 'recibido'))
      .take(MAX_BALANCE_ROWS + 1),
    ctx.db
      .query('facturacionCajaMenorLegalizaciones')
      .withIndex('by_cajaMenorId_estado', (q) => q.eq('cajaMenorId', doc._id).eq('estado', 'activa'))
      .take(MAX_BALANCE_ROWS + 1),
  ]);
  if ([refills, movements, reimbursements, legacy].some((rows) => rows.length > MAX_BALANCE_ROWS)) return null;
  const sum = (values: number[]) => values.reduce((total, value) => total + Math.max(0, value), 0);
  const balance =
    doc.assignedValue +
    sum(refills.filter((item) => item.receiptConfirmed).map((item) => item.refillValue)) +
    sum(reimbursements.map((item) => item.valorTotal)) -
    sum(movements.filter((item) => item.estado !== 'anulado').map((item) => item.valor)) -
    sum(legacy.map((item) => item.valorAplicado));
  const pending = refills.some((item) => !item.receiptConfirmed);
  return {
    saldoActual: balance,
    saldoDisponible: doc.estado === 'cerrada' || pending ? 0 : balance,
    recargaPendiente: pending,
  };
}
async function cashBox(
  ctx: Ctx,
  actor: BillingActor,
  doc: Doc<'cajasMenores'>,
  result: AssistantToolResult,
  args: Input,
) {
  if (
    !args.companyIds.includes(doc.empresa_id) ||
    !(await usuarioPuedeVerCajaMenor(ctx, doc, actor.usuarioId, actor.hasFullAccess ? 1 : undefined)).canView
  )
    return;
  const row: CellRow = {
    id: doc._id,
    empresa: doc.empresa_id,
    caja: doc.nombre,
    estado: doc.estado ?? 'activa',
    valorAsignado: doc.assignedValue,
    moneda: 'COP',
    fecha: localBogotaDateString(doc.createdAt ?? doc._creationTime),
  };
  if (!matches(args, row)) return;
  const balance = await cashBalance(ctx, doc);
  Object.assign(row, balance ?? { saldoActual: null, saldoDisponible: null, recargaPendiente: null });
  if (!balance) {
    result.metadata.complete = false;
    result.metadata.notes.push(
      `Saldo de ${doc.nombre} no disponible: supera el límite de cálculo. Consulta el detalle de la caja.`,
    );
  }
  add(
    result,
    {
      ...reference('pettyCash', 'cashBox', doc._id, doc.empresa_id, doc.nombre, doc.estado ?? 'activa'),
      ...(balance ? { amount: balance.saldoDisponible } : {}),
      currency: 'COP',
    },
    row,
  );
}
async function cashReimbursement(
  ctx: Ctx,
  actor: BillingActor,
  doc: Doc<'cajasMenoresReembolsos'>,
  result: AssistantToolResult,
  args: Input,
) {
  const box = await ctx.db.get('cajasMenores', doc.cajaMenorId);
  if (!box || !args.companyIds.includes(box.empresa_id) || !(await canReadReimbursement(ctx, actor, doc, box))) return;
  const owner = deriveReembolsoResponsable(doc);
  const row: CellRow = {
    id: doc._id,
    empresa: box.empresa_id,
    caja: box.nombre,
    reembolso: doc.numeroReembolso ?? doc._id,
    estado: doc.estado,
    valor: doc.valorTotal,
    moneda: 'COP',
    responsable: owner.responsableActualNombre,
    fecha: localBogotaDateString(doc.creadoEn),
  };
  if (matches(args, row))
    add(
      result,
      {
        ...reference('pettyCash', 'cashReimbursement', doc._id, box.empresa_id, String(row.reembolso), doc.estado),
        amount: doc.valorTotal,
        currency: 'COP',
        owner: owner.responsableActualNombre,
      },
      row,
    );
}

function decodeCursor(cursor: string | undefined, binding: string) {
  if (!cursor) return { company: 0, native: null as string | null };
  try {
    const value: unknown = JSON.parse(cursor);
    if (
      typeof value === 'object' &&
      value !== null &&
      'binding' in value &&
      value.binding === binding &&
      'company' in value &&
      typeof value.company === 'number' &&
      Number.isInteger(value.company) &&
      value.company >= 0 &&
      'native' in value &&
      (value.native === null || typeof value.native === 'string')
    )
      return { company: value.company, native: value.native };
  } catch {
    /* Invalid cursor must not silently restart and duplicate totals. */
  }
  throw new Error('Cursor inválido para esta consulta.');
}

async function details(ctx: QueryCtx, actor: BillingActor, args: Input, result: AssistantToolResult) {
  const rawId = args.recordId;
  if (!rawId) throw new Error('Selecciona un registro mediante una búsqueda antes de consultar su detalle.');
  switch (args.domain) {
    case 'billing': {
      const id = ctx.db.normalizeId('facturacionFacturas', rawId);
      const doc = id && (await ctx.db.get('facturacionFacturas', id));
      if (doc) await invoice(ctx, actor, doc, result, args);
      break;
    }
    case 'advances': {
      const id = ctx.db.normalizeId('anticipos', rawId);
      const doc = id && (await ctx.db.get('anticipos', id));
      if (doc) await advance(ctx, doc, result, args);
      break;
    }
    case 'suppliers':
    case 'customers': {
      const table = args.domain === 'suppliers' ? 'onboardingProveedores' : 'onboardingClientes';
      const id = ctx.db.normalizeId(table, rawId);
      const doc = id && (await ctx.db.get(table, id));
      if (doc) await onboarding(ctx, doc, result, args);
      break;
    }
    case 'pettyCash': {
      const boxId = ctx.db.normalizeId('cajasMenores', rawId);
      if (boxId) {
        const doc = await ctx.db.get('cajasMenores', boxId);
        if (doc) await cashBox(ctx, actor, doc, result, args);
      } else {
        const id = ctx.db.normalizeId('cajasMenoresReembolsos', rawId);
        const doc = id && (await ctx.db.get('cajasMenoresReembolsos', id));
        if (doc) await cashReimbursement(ctx, actor, doc, result, args);
      }
    }
  }
  result.metadata.scanned = 1;
  if (!result.records.length)
    result.metadata.notes.push('Registro no disponible en este alcance o sin permiso; esto no confirma que no exista.');
}

export const readAssistantData = internalQuery({
  args: {
    domain: domainV,
    operation: operationV,
    companyIds: v.array(v.number()),
    expectedActingUserId: v.string(),
    search: v.optional(v.string()),
    recordId: v.optional(v.string()),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
    from: v.optional(v.string()),
    to: v.optional(v.string()),
  },
  handler: async (ctx, raw): Promise<AssistantToolResult> => {
    const { companyIds, expectedActingUserId, ...toolArgs } = raw;
    const args: Input = {
      ...assistantNativeToolSchema.parse(toolArgs),
      companyIds: [...new Set(companyIds)].sort((a, b) => a - b),
      expectedActingUserId,
    };
    const actor = await requireActor(ctx);
    assertScope(actor, args.companyIds, expectedActingUserId);
    if (args.from && args.to && args.from > args.to) throw new Error('El rango de fechas es inválido.');
    const result = baseResult(args);
    if (args.operation !== 'detail' || args.domain !== 'billing') assertDomain(actor, args.domain);
    if (args.operation === 'workflow') {
      const guide = ASSISTANT_WORKFLOWS[args.domain];
      result.title = guide.title;
      result.guide = { steps: [...guide.steps], sourcePaths: [...guide.sourcePaths] };
      result.sources = args.companyIds.map((companyId) => ({ kind: 'workflow', companyId, domain: args.domain }));
      return result;
    }
    if (args.operation === 'detail') await details(ctx, actor, args, result);
    else if (args.operation === 'summary') await summarizeRows(ctx, actor, args, result);
    else if (args.operation === 'movements' || args.operation === 'legalizations')
      await relatedRows(ctx, actor, args, result);
    else await listRows(ctx, actor, args, result);
    result.metadata.returned = result.rows.length;
    const currencies = new Set(
      result.rows.map((row) => row.moneda).filter((currency): currency is string => typeof currency === 'string'),
    );
    result.metadata.currency = currencies.size === 1 ? [...currencies][0] : null;
    if (args.operation !== 'detail')
      for (const companyId of args.companyIds)
        result.sources.push({
          kind: 'aggregate',
          domain: args.domain,
          companyId,
          accessFingerprint: await assistantAccessFingerprint(ctx, actor, args.domain, companyId),
        });
    return result;
  },
});

/** A summary is an independent bounded scan, never a total inferred from one search page. */
async function summarizeRows(ctx: QueryCtx, actor: BillingActor, args: Input, result: AssistantToolResult) {
  if (args.cursor) throw new Error('Los resúmenes no aceptan cursor; usa búsqueda para explorar páginas.');
  const scanLimit = args.domain === 'pettyCash' ? Math.max(1, Math.floor(6 / args.companyIds.length)) : 100;
  result.metadata.limit = scanLimit * args.companyIds.length;
  const rows: CellRow[] = [];
  for (const company of args.companyIds) {
    if (args.domain === 'billing') {
      const items = await ctx.db
        .query('facturacionDashboardItems')
        .withIndex('by_empresa_fechaEmisionMs', (q) =>
          q
            .eq('empresa', company)
            .gte('fechaEmisionMs', args.from ? Date.parse(`${args.from}T00:00:00-05:00`) : 0)
            .lt(
              'fechaEmisionMs',
              args.to ? Date.parse(`${args.to}T00:00:00-05:00`) + 86_400_000 : Number.MAX_SAFE_INTEGER,
            ),
        )
        .order('desc')
        .take(scanLimit + 1);
      result.metadata.scanned += Math.min(items.length, scanLimit);
      if (items.length > scanLimit) result.metadata.complete = false;
      const companyAggregateAccess =
        actorTienePermiso(actor, R.FACTURACION_DASHBOARD) || actorTienePermiso(actor, R.FACTURACION_FACTURAS);
      for (const item of items.slice(0, scanLimit)) {
        const row: CellRow = {
          factura: item.numeroFactura,
          proveedor: item.proveedorNombre,
          nit: item.proveedorNit,
          estado: item.estadoListado ?? item.faseActual,
          fecha: item.fechaEmision,
          moneda: item.moneda,
          totalFactura: item.totalFactura ?? null,
          valorContable: item.valorContable,
          valorAPagar: item.valorAPagar ?? null,
        };
        if (!matches(args, row)) continue;
        if (!companyAggregateAccess) {
          const doc = await ctx.db.get('facturacionFacturas', item.facturaId);
          if (!doc || !(await actorPuedeVerFactura(ctx, actor, doc))) continue;
          result.sources.push({
            domain: 'billing',
            kind: 'record',
            companyId: company,
            recordType: 'invoice',
            recordId: item.facturaId,
          });
        }
        rows.push(row);
      }
    } else if (args.domain === 'advances') {
      const items = await ctx.db
        .query('anticiposDashboardItems')
        .withIndex('by_empresa_createdAt', (q) =>
          q
            .eq('empresa', company)
            .gte('createdAt', args.from ? Date.parse(`${args.from}T00:00:00-05:00`) : 0)
            .lt('createdAt', args.to ? Date.parse(`${args.to}T00:00:00-05:00`) + 86_400_000 : Number.MAX_SAFE_INTEGER),
        )
        .order('desc')
        .take(scanLimit + 1);
      result.metadata.scanned += Math.min(items.length, scanLimit);
      if (items.length > scanLimit) result.metadata.complete = false;
      for (const item of items.slice(0, scanLimit)) {
        const doc = await ctx.db.get('anticipos', item.anticipoId);
        if (doc) await advance(ctx, doc, result, args);
      }
    } else if (args.domain === 'suppliers' || args.domain === 'customers') {
      const table = args.domain === 'suppliers' ? 'onboardingProveedores' : 'onboardingClientes';
      const docs = await ctx.db
        .query(table)
        .withIndex('by_empresa', (q) => q.eq('empresa', company))
        .order('desc')
        .take(scanLimit + 1);
      result.metadata.scanned += Math.min(docs.length, scanLimit);
      if (docs.length > scanLimit) result.metadata.complete = false;
      for (const doc of docs.slice(0, scanLimit)) await onboarding(ctx, doc, result, args);
    } else {
      const docs = await ctx.db
        .query('cajasMenores')
        .withIndex('by_empresa_id', (q) => q.eq('empresa_id', company))
        .order('desc')
        .take(scanLimit + 1);
      result.metadata.scanned += Math.min(docs.length, scanLimit);
      if (docs.length > scanLimit) result.metadata.complete = false;
      for (const doc of docs.slice(0, scanLimit)) await cashBox(ctx, actor, doc, result, args);
    }
  }
  rows.push(...result.rows);
  const moneyFields = [
    'totalFactura',
    'valorContable',
    'valorAPagar',
    'valorSolicitado',
    'valorLegalizable',
    'saldoLegalizado',
    'saldoPendiente',
    'valorAsignado',
    'saldoActual',
    'saldoDisponible',
  ];
  const groups = new Map<string, CellRow>();
  const summary: Record<string, number> = { registros: rows.length };
  for (const row of rows) {
    const currency = typeof row.moneda === 'string' ? row.moneda : null;
    const key = JSON.stringify([row.estado, currency]);
    const group = groups.get(key) ?? { estado: row.estado, moneda: currency, registros: 0 };
    group.registros = Number(group.registros) + 1;
    for (const field of moneyFields)
      if (typeof row[field] === 'number') {
        group[field] = Math.round((Number(group[field] ?? 0) + row[field]) * 100) / 100;
        const summaryKey = `${field}_${currency ?? 'sin_moneda'}`;
        summary[summaryKey] = Math.round(((summary[summaryKey] ?? 0) + row[field]) * 100) / 100;
      }
    groups.set(key, group);
  }
  for (const currency of new Set(rows.map((row) => row.moneda))) {
    const currencyRows = rows.filter((row) => row.moneda === currency);
    for (const field of moneyFields) {
      const available = currencyRows.filter((row) => typeof row[field] === 'number').length;
      if (available > 0 && available < currencyRows.length) {
        delete summary[`${field}_${currency ?? 'sin_moneda'}`];
        for (const group of groups.values()) if (group.moneda === currency) group[field] = null;
        result.metadata.complete = false;
        result.metadata.notes.push(
          `No se calcula ${field} (${currency ?? 'sin moneda'}): hay registros sin ese importe.`,
        );
      }
    }
  }
  // Groups reveal only authorized totals; source requirements retain each ownership-dependent row.
  result.records = [];
  result.rows = [...groups.values()];
  result.summary = summary;
  result.metadata.notes.push(
    'Resumen de registros autorizados agrupado por estado y moneda; los importes de distintas monedas no se suman.',
  );
  if (args.domain === 'billing' || args.domain === 'advances')
    result.metadata.notes.push(
      'Cobertura de la proyección operativa del módulo; registros antiguos sin proyección no están incluidos.',
    );
  if (!result.metadata.complete)
    result.metadata.notes.push(
      `Resumen incompleto: límite de ${scanLimit} registros por empresa o saldos no disponibles. Los valores son subtotales y no deben presentarse como totales completos. Acota el rango o consulta el módulo.`,
    );
}

async function listRows(ctx: QueryCtx, actor: BillingActor, args: Input, result: AssistantToolResult) {
  if (args.operation === 'reimbursements' && args.domain !== 'pettyCash')
    throw new Error('Los reembolsos pertenecen a cajas menores.');
  const binding = JSON.stringify([
    args.domain,
    args.operation,
    args.companyIds,
    args.search ?? '',
    args.from ?? '',
    args.to ?? '',
  ]);
  const cursor = decodeCursor(args.cursor, binding);
  const company = args.companyIds[cursor.company];
  if (company === undefined) throw new Error('Cursor fuera del alcance.');
  const pageSize =
    args.domain === 'pettyCash' && args.operation !== 'reimbursements'
      ? Math.min(args.limit ?? 20, 6)
      : (args.limit ?? 20);
  result.metadata.limit = pageSize;
  const opts = { numItems: pageSize, cursor: cursor.native, maximumRowsRead: 120, maximumBytesRead: 600_000 };
  let state: { isDone: boolean; continueCursor: string; page: unknown[] };
  if (args.domain === 'billing') {
    const page = args.search
      ? await ctx.db
          .query('facturacionDashboardItems')
          .withSearchIndex('search_identity', (q) => q.search('searchText', args.search!).eq('empresa', company))
          .paginate(opts)
      : await ctx.db
          .query('facturacionDashboardItems')
          .withIndex('by_empresa_fechaEmisionMs', (q) => q.eq('empresa', company))
          .order('desc')
          .paginate(opts);
    state = page;
    for (const item of page.page) {
      const doc = await ctx.db.get('facturacionFacturas', item.facturaId);
      if (doc) await invoice(ctx, actor, doc, result, { ...args, search: undefined });
    }
    result.metadata.notes.push(
      'Listado basado en la proyección de facturación; las filas sin proyección requieren consulta por ID.',
    );
  } else if (args.domain === 'advances') {
    const page = args.search
      ? await ctx.db
          .query('anticiposDashboardItems')
          .withSearchIndex('search_identity', (q) => q.search('searchText', args.search!).eq('empresa', company))
          .paginate(opts)
      : await ctx.db
          .query('anticiposDashboardItems')
          .withIndex('by_empresa_createdAt', (q) => q.eq('empresa', company))
          .order('desc')
          .paginate(opts);
    state = page;
    for (const item of page.page) {
      const doc = await ctx.db.get('anticipos', item.anticipoId);
      if (doc) await advance(ctx, doc, result, { ...args, search: undefined });
    }
    result.metadata.notes.push(
      'Listado basado en la proyección de anticipos; las filas sin proyección requieren consulta por ID.',
    );
  } else if (args.domain === 'suppliers' || args.domain === 'customers') {
    const table = args.domain === 'suppliers' ? 'onboardingProveedores' : 'onboardingClientes';
    const page = await ctx.db
      .query(table)
      .withIndex('by_empresa', (q) => q.eq('empresa', company))
      .order('desc')
      .paginate(opts);
    state = page;
    for (const doc of page.page) await onboarding(ctx, doc, result, args);
  } else if (args.operation === 'reimbursements') {
    const page = await ctx.db
      .query('cajasMenoresReembolsos')
      .withIndex('by_empresaId_and_seguimientoActivo_and_actualizadoEn', (q) => q.eq('empresaId', company))
      .order('desc')
      .paginate(opts);
    state = page;
    for (const doc of page.page) await cashReimbursement(ctx, actor, doc, result, args);
    result.metadata.notes.push('Los reembolsos antiguos sin empresa proyectada requieren consulta por ID.');
  } else {
    const page = await ctx.db
      .query('cajasMenores')
      .withIndex('by_empresa_id', (q) => q.eq('empresa_id', company))
      .order('desc')
      .paginate(opts);
    state = page;
    for (const doc of page.page) await cashBox(ctx, actor, doc, result, args);
  }
  result.metadata.scanned = state.page.length;
  const next = state.isDone
    ? { company: cursor.company + 1, native: null }
    : { company: cursor.company, native: state.continueCursor };
  const hasNext = next.company < args.companyIds.length;
  result.metadata.nextCursor = hasNext ? JSON.stringify({ ...next, binding }) : null;
  result.metadata.complete = result.metadata.complete && !hasNext && !args.cursor;
  if (!result.metadata.complete)
    result.metadata.notes.push(
      'Resultados parciales. Pide la siguiente página si hay más resultados disponibles. Una página vacía no significa que no existan coincidencias.',
    );
}

async function relatedRows(ctx: QueryCtx, actor: BillingActor, args: Input, result: AssistantToolResult) {
  if (!args.recordId) throw new Error('Se requiere el ID del anticipo o caja obtenido en una búsqueda.');
  if (args.operation === 'movements' && args.domain === 'pettyCash') {
    const id = ctx.db.normalizeId('cajasMenores', args.recordId);
    const box = id && (await ctx.db.get('cajasMenores', id));
    if (
      !box ||
      !args.companyIds.includes(box.empresa_id) ||
      !(await usuarioPuedeVerCajaMenor(ctx, box, actor.usuarioId, actor.hasFullAccess ? 1 : undefined)).canView
    )
      throw new Error('Caja no disponible en este alcance.');
    const page = await ctx.db
      .query('facturacionCajaMenorMovimientos')
      .withIndex('by_cajaMenorId', (q) => q.eq('cajaMenorId', box._id))
      .order('desc')
      .paginate({ numItems: args.limit ?? 20, cursor: args.cursor ?? null, maximumRowsRead: 120 });
    for (const doc of page.page) {
      const row: CellRow = {
        id: doc._id,
        caja: box.nombre,
        proveedor: doc.nombreEmpresa,
        nit: doc.nit ?? null,
        concepto: doc.concepto.slice(0, 300),
        estado: doc.estado,
        fecha: doc.fechaPago,
        valor: doc.valor,
        moneda: 'COP',
      };
      if (!matches(args, row)) continue;
      const ref = reference('pettyCash', 'cashMovement', doc._id, box.empresa_id, doc.nombreEmpresa, doc.estado);
      ref.href = recordHref('cajaMenor', { id: box._id });
      add(result, { ...ref, amount: doc.valor, currency: 'COP' }, row);
    }
    result.sources.push({
      domain: 'pettyCash',
      kind: 'record',
      recordType: 'cashBox',
      recordId: box._id,
      companyId: box.empresa_id,
    });
    result.metadata.scanned = page.page.length;
    result.metadata.complete = page.isDone && !args.cursor;
    result.metadata.nextCursor = page.isDone ? null : page.continueCursor;
  } else if (args.operation === 'legalizations' && args.domain === 'advances') {
    const id = ctx.db.normalizeId('anticipos', args.recordId);
    const doc = id && (await ctx.db.get('anticipos', id));
    if (
      !doc ||
      !args.companyIds.includes(normalizeEmpresa(doc.empresa_id ?? doc.empresa)) ||
      !(await actorPuedeVerAnticipo(ctx, doc))
    )
      throw new Error('Anticipo no disponible en este alcance.');
    const page = await ctx.db
      .query('facturacionAnticipoLegalizaciones')
      .withIndex('by_anticipoId_estado', (q) => q.eq('anticipoId', doc._id).eq('estado', 'activa'))
      .paginate({ numItems: args.limit ?? 20, cursor: args.cursor ?? null, maximumRowsRead: 120 });
    result.sources.push({
      domain: 'advances',
      kind: 'record',
      recordType: 'advance',
      recordId: doc._id,
      companyId: normalizeEmpresa(doc.empresa_id ?? doc.empresa),
    });
    for (const cross of page.page) {
      const invoiceDoc = await ctx.db.get('facturacionFacturas', cross.facturaId);
      // Advance access does not grant access to the crossed invoice's identity/details.
      if (
        !invoiceDoc ||
        !args.companyIds.includes(normalizeEmpresa(invoiceDoc.empresa)) ||
        !(await actorPuedeVerFactura(ctx, actor, invoiceDoc))
      )
        continue;
      const row: CellRow = {
        factura: invoiceDoc.numeroFactura,
        proveedor: invoiceDoc.proveedorNombre,
        nit: invoiceDoc.proveedorNit,
        fecha: localBogotaDateString(cross.creadoEn),
        valorAplicado: cross.valorAplicado,
        moneda: invoiceDoc.moneda,
        estado: cross.estado,
      };
      if (!matches(args, row)) continue;
      const ref = reference(
        'billing',
        'invoice',
        invoiceDoc._id,
        normalizeEmpresa(invoiceDoc.empresa),
        invoiceDoc.numeroFactura,
        cross.estado,
      );
      add(result, { ...ref, date: String(row.fecha) }, row);
    }
    result.metadata.scanned = page.page.length;
    result.metadata.complete = page.isDone && !args.cursor;
    result.metadata.nextCursor = page.isDone ? null : page.continueCursor;
    result.metadata.notes.push(
      'El rango de fechas corresponde a la creación del cruce de legalización en America/Bogota, no a la fecha de emisión de la factura.',
      'Solo se muestran facturas cuya consulta también está autorizada; la suma de cruces visibles puede diferir del saldo legalizado del anticipo.',
    );
  } else throw new Error('Operación no compatible con el módulo seleccionado.');
}
