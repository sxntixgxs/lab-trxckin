import type { AssistantSourceRequirement } from '../../lib/assistant/contracts';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { requireIdentity } from '../lib/auth';
import { actorPuedeVerEmpresa, requireActor } from '../lib/billingAuth';
import { revalidateAssistantSources } from './tools';

export const MAX_CONVERSATION_SOURCES = 1000;
export const MAX_CONVERSATION_EVIDENCE = 100;

export async function assistantIdentity(ctx: QueryCtx | MutationCtx, expectedActingUserId: string) {
  const [identity, actor] = await Promise.all([requireIdentity(ctx), requireActor(ctx)]);
  if (actor.nestUserId !== expectedActingUserId) throw new Error('La sesión cambió. Actualiza la página.');
  return { identity, actor };
}

export function normalizeCompanyIds(companyIds: number[]) {
  if (!companyIds.length || companyIds.length > 10 || companyIds.some((id) => !Number.isSafeInteger(id) || id < 1)) {
    throw new Error('Selecciona una empresa autorizada.');
  }
  return [...new Set(companyIds)].sort((a, b) => a - b);
}

export function sameCompanies(a: number[], b: number[]) {
  return JSON.stringify(normalizeCompanyIds(a)) === JSON.stringify(normalizeCompanyIds(b));
}

export async function ownedConversation(
  ctx: QueryCtx | MutationCtx,
  id: Id<'assistantConversations'>,
  expectedActingUserId: string,
) {
  const { identity, actor } = await assistantIdentity(ctx, expectedActingUserId);
  const conversation = await ctx.db.get('assistantConversations', id);
  if (
    !conversation ||
    conversation.deleted ||
    conversation.ownerTokenIdentifier !== identity.tokenIdentifier ||
    conversation.actingUserId !== actor.nestUserId
  ) {
    throw new Error('Conversación no disponible.');
  }
  return { conversation, actor, identity };
}

export async function conversationAccess(
  ctx: QueryCtx | MutationCtx,
  conversation: Doc<'assistantConversations'>,
  expectedActingUserId: string,
) {
  const { actor } = await assistantIdentity(ctx, expectedActingUserId);
  if (conversation.companyIds.some((company) => !actorPuedeVerEmpresa(actor, company))) return false;
  const evidence = await ctx.db
    .query('assistantEvidence')
    .withIndex('by_conversationId', (q) => q.eq('conversationId', conversation._id))
    .take(MAX_CONVERSATION_EVIDENCE + 1);
  if (evidence.length > MAX_CONVERSATION_EVIDENCE) return false;
  const sources: AssistantSourceRequirement[] = evidence.flatMap((row) => row.sources);
  if (sources.length > MAX_CONVERSATION_SOURCES) return false;
  return await revalidateAssistantSources(ctx, sources, conversation.companyIds, expectedActingUserId);
}

export async function authorizedConversation(
  ctx: QueryCtx | MutationCtx,
  id: Id<'assistantConversations'>,
  expectedActingUserId: string,
) {
  const owned = await ownedConversation(ctx, id, expectedActingUserId);
  if (!(await conversationAccess(ctx, owned.conversation, expectedActingUserId))) {
    throw new Error('El acceso a las fuentes cambió. Inicia otra conversación.');
  }
  return owned;
}

export async function authorizedRun(
  ctx: QueryCtx | MutationCtx,
  runId: Id<'assistantRuns'>,
  expectedActingUserId: string,
) {
  const run = await ctx.db.get('assistantRuns', runId);
  if (!run) throw new Error('Respuesta no disponible.');
  const owned = await authorizedConversation(ctx, run.conversationId, expectedActingUserId);
  if (run.ownerTokenIdentifier !== owned.identity.tokenIdentifier || run.actingUserId !== expectedActingUserId)
    throw new Error('No autorizado.');
  return { ...owned, run };
}
