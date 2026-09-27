import type { Doc, Id, TableNames } from '../_generated/dataModel';
import { env, type QueryCtx, type MutationCtx } from '../_generated/server';
import type { CalculationPolicy, TrustedActor, WorkforceSettings } from '../../lib/workforce/types';
import { DEFAULT_POLICY } from '../../lib/workforce/calculation';
import { addDays, bogotaDate, periodFor, weekStart } from '../../lib/workforce/dates';

export type Ctx = QueryCtx | MutationCtx;
export type Access = { actor: TrustedActor; companyId: number; hr: boolean; settings: WorkforceSettings };
export const MAX_CATALOG = 500;
export const MAX_ROWS = 2500;
/** Convex serialization may reorder object keys; equality must be structural. */
export function stableJson(value: unknown): string {
  const normalize = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(normalize);
    if (input && typeof input === 'object')
      return Object.fromEntries(
        Object.entries(input)
          .filter(([, value]) => value !== undefined)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, value]) => [key, normalize(value)]),
      );
    return input;
  };
  return JSON.stringify(normalize(value));
}
export function bounded<T>(rows: T[], max = MAX_ROWS): T[] {
  if (rows.length > max)
    throw new Error('La consulta excede el límite seguro. Reduzca el rango o el tamaño del grupo.');
  return rows;
}
export function dto<T extends { _id: string; _creationTime: number }>(
  row: T,
): Omit<T, '_id' | '_creationTime'> & { id: string } {
  const { _id, _creationTime: ignored, ...data } = row;
  void ignored;
  return { ...data, id: _id };
}
export function permitted(actor: TrustedActor, permission: string) {
  return actor.admin || actor.permissions.includes('*') || actor.permissions.includes(permission);
}
export function requirePermission(access: Access, permission: string) {
  if (!permitted(access.actor, permission)) throw new Error(`Acceso denegado: requiere ${permission}.`);
}
export function requireHr(access: Access, permission: string) {
  requirePermission(access, permission);
  if (!access.hr) throw new Error('Esta acción requiere un responsable de Talento humano.');
}
export async function settingsFor(ctx: Ctx, companyId: number, now: number): Promise<WorkforceSettings> {
  const config = await ctx.db
    .query('wfSettings')
    .withIndex('by_companyId', (q) => q.eq('companyId', companyId))
    .unique();
  const policies = bounded(
    await ctx.db
      .query('wfPolicies')
      .withIndex('by_companyId_and_effectiveFrom', (q) => q.eq('companyId', companyId))
      .take(501),
    500,
  ).map((r) => r.policy);
  const launchDate = config?.launchDate ?? weekStart(bogotaDate(now));
  return {
    companyId,
    launchDate,
    hrUserIds: config?.hrUserIds ?? [],
    revision: config?.revision ?? 0,
    policies: policies.length ? policies : [{ ...DEFAULT_POLICY, effectiveFrom: launchDate }],
  };
}
export async function authorize(
  ctx: Ctx,
  secret: string,
  actor: TrustedActor,
  companyId: number,
  now: number,
): Promise<Access> {
  if (!env.CONVEX_SERVER_SECRET || secret !== env.CONVEX_SERVER_SECRET)
    throw new Error('Acceso denegado: intermediario no autorizado.');
  const identity = await ctx.auth.getUserIdentity();
  if (!identity || identity.subject !== actor.workosUserId) throw new Error('Acceso denegado: identidad no válida.');
  // The BFF obtains this actor from Nest using the real WorkOS session. The mutable
  // Convex users projection is intentionally not an authority during impersonation.
  if (
    !Number.isSafeInteger(companyId) ||
    companyId < 1 ||
    (!actor.admin && !actor.allCompanies && !actor.companyIds.includes(companyId))
  )
    throw new Error('Empresa no autorizada.');
  if (!actor.admin && !actor.permissions.includes('*') && !actor.permissions.some((p) => p.startsWith('workforce/')))
    throw new Error('No tiene acceso a Talento humano.');
  const settings = await settingsFor(ctx, companyId, now);
  return { actor, companyId, settings, hr: actor.admin || settings.hrUserIds.includes(actor.userId) };
}
export async function record<T extends TableNames>(ctx: Ctx, table: T, id: string, companyId: number): Promise<Doc<T>> {
  const normalized = ctx.db.normalizeId(table, id);
  if (!normalized) throw new Error('Identificador no válido.');
  const row = await ctx.db.get(table, normalized);
  if (!row || !('companyId' in row) || row.companyId !== companyId)
    throw new Error('Registro no disponible en esta empresa.');
  return row;
}
export function revision(current: { revision: number } | null, expected: number) {
  if ((current?.revision ?? 0) !== expected)
    throw new Error('El registro cambió en otra sesión. Recargue y revise el conflicto.');
}
export async function groupAccess(ctx: Ctx, access: Access, groupId: string, permission: string, active = false) {
  requirePermission(access, permission);
  const group = await record(ctx, 'wfGroups', groupId, access.companyId);
  if (!access.hr && !group.managerIds.includes(access.actor.userId))
    throw new Error('No tiene autorización sobre este grupo.');
  if (active && !group.active) throw new Error('El grupo está inactivo.');
  return group;
}
export async function membershipAt(ctx: Ctx, companyId: number, employeeId: string, date: string) {
  const rows = bounded(
    await ctx.db
      .query('wfMemberships')
      .withIndex('by_companyId_and_employeeId_and_effectiveFrom', (q) =>
        q.eq('companyId', companyId).eq('employeeId', employeeId).lte('effectiveFrom', date),
      )
      .order('desc')
      .take(501),
    500,
  );
  return rows.find((r) => !r.effectiveTo || r.effectiveTo >= date) ?? null;
}
export function policyAt(settings: WorkforceSettings, date: string): CalculationPolicy {
  const policy = [...settings.policies].reverse().find((p) => p.effectiveFrom <= date);
  if (!policy) throw new Error('No existe una política vigente para esta fecha.');
  return policy;
}
export function launchGuard(access: Access, date: string) {
  if (date < access.settings.launchDate) throw new Error('La fecha es anterior al lanzamiento del módulo.');
}
export async function closureFor(ctx: Ctx, companyId: number, groupId: string, date: string) {
  const { start } = periodFor(date);
  return ctx.db
    .query('wfClosures')
    .withIndex('by_companyId_and_groupId_and_periodStart', (q) =>
      q.eq('companyId', companyId).eq('groupId', groupId).eq('periodStart', start),
    )
    .unique();
}
export async function editable(ctx: Ctx, access: Access, groupId: string, date: string, now: number) {
  launchGuard(access, date);
  const closure = await closureFor(ctx, access.companyId, groupId, date);
  if (closure?.state === 'CLOSED')
    throw new Error('La quincena está cerrada. Talento humano debe reabrirla con un motivo.');
  if (closure?.state === 'CORRECTION_TH' && !access.hr)
    throw new Error('La quincena está abierta exclusivamente para correcciones de TH.');
  if (!access.hr && bogotaDate(now) > addDays(periodFor(date).end, 5))
    throw new Error('Terminó el plazo de cinco días. Solicite una corrección a Talento humano.');
}
export async function audit(
  ctx: MutationCtx,
  access: Access,
  action: string,
  targetId: string,
  reason: string,
  details: unknown,
  now: number,
) {
  await ctx.db.insert('wfAudit', {
    companyId: access.companyId,
    actorId: access.actor.userId,
    actorName: access.actor.name,
    action,
    targetId,
    timestamp: now,
    reason,
    details: JSON.stringify(details),
  });
}
export async function persistSettings(ctx: MutationCtx, access: Access) {
  const existing = await ctx.db
    .query('wfSettings')
    .withIndex('by_companyId', (q) => q.eq('companyId', access.companyId))
    .unique();
  if (existing) return existing._id;
  const { policies, ...config } = access.settings;
  const id = await ctx.db.insert('wfSettings', config);
  for (const policy of policies) await ctx.db.insert('wfPolicies', { companyId: access.companyId, policy });
  return id;
}
export type EmployeeId = Id<'wfEmployees'>;
