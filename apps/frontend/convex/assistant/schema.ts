import { defineTable } from 'convex/server';
import { v } from 'convex/values';

export const domainValidator = v.union(
  v.literal('billing'),
  v.literal('suppliers'),
  v.literal('customers'),
  v.literal('advances'),
  v.literal('pettyCash'),
);
export const contextValidator = v.object({
  domain: domainValidator,
  recordId: v.optional(v.string()),
  label: v.string(),
});
export const sourceValidator = v.object({
  domain: domainValidator,
  kind: v.union(v.literal('record'), v.literal('aggregate'), v.literal('workflow'), v.literal('erp')),
  companyId: v.number(),
  recordId: v.optional(v.string()),
  recordType: v.optional(
    v.union(
      v.literal('invoice'),
      v.literal('supplier'),
      v.literal('customer'),
      v.literal('advance'),
      v.literal('cashBox'),
      v.literal('cashMovement'),
      v.literal('cashReimbursement'),
    ),
  ),
  accessFingerprint: v.optional(v.string()),
  erpMode: v.optional(v.union(v.literal('search'), v.literal('document'))),
  permission: v.optional(v.string()),
});
export const runStatusValidator = v.union(
  v.literal('running'),
  v.literal('waiting_erp'),
  v.literal('completed'),
  v.literal('cancelled'),
  v.literal('failed'),
);
export const pendingToolValidator = v.object({ toolCallId: v.string(), toolName: v.string(), argsJson: v.string() });

export const assistantConversations = defineTable({
  ownerTokenIdentifier: v.string(),
  actingUserId: v.string(),
  threadId: v.string(),
  title: v.string(),
  companyIds: v.array(v.number()),
  model: v.string(),
  language: v.union(v.literal('es'), v.literal('en')),
  updatedAt: v.number(),
  sourceCount: v.number(),
  lastRunId: v.optional(v.id('assistantRuns')),
  deleted: v.optional(v.boolean()),
}).index('by_ownerTokenIdentifier_and_actingUserId_and_updatedAt', [
  'ownerTokenIdentifier',
  'actingUserId',
  'updatedAt',
]);

export const assistantRuns = defineTable({
  ownerTokenIdentifier: v.string(),
  actingUserId: v.string(),
  conversationId: v.id('assistantConversations'),
  idempotencyKey: v.string(),
  requestFingerprint: v.string(),
  model: v.string(),
  language: v.union(v.literal('es'), v.literal('en')),
  context: v.optional(contextValidator),
  promptMessageId: v.string(),
  status: runStatusValidator,
  deadline: v.number(),
  rounds: v.number(),
  lease: v.optional(v.string()),
  pendingTools: v.array(pendingToolValidator),
  error: v.optional(v.string()),
  progress: v.optional(v.string()),
  partialMessageId: v.optional(v.string()),
})
  .index('by_ownerTokenIdentifier_and_idempotencyKey', ['ownerTokenIdentifier', 'idempotencyKey'])
  .index('by_ownerTokenIdentifier_and_status', ['ownerTokenIdentifier', 'status'])
  .index('by_conversationId', ['conversationId']);

/** Evidence and access manifests only; messages/deltas remain in the Agent component. */
export const assistantEvidence = defineTable({
  conversationId: v.id('assistantConversations'),
  runId: v.id('assistantRuns'),
  toolCallId: v.string(),
  resultJson: v.string(),
  sources: v.array(sourceValidator),
})
  .index('by_conversationId', ['conversationId'])
  .index('by_runId_and_toolCallId', ['runId', 'toolCallId']);
