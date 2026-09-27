/// <reference types="vite/client" />
import agentTest from '@convex-dev/agent/test';
import rateLimiterTest from '@convex-dev/rate-limiter/test';
import { listMessages as componentMessages, mockModel } from '@convex-dev/agent';
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { DEFAULT_ASSISTANT_MODEL, type AssistantToolResult } from '../../lib/assistant/contracts';
import { asUser, type ActingClient } from '../../test-utils/onboardingActors';
import { api, components, internal } from '../_generated/api';
import type { Id } from '../_generated/dataModel';
import schema from '../schema';

const providerState = vi.hoisted(() => ({ model: undefined as unknown }));
vi.mock('@openrouter/ai-sdk-provider', () => ({ createOpenRouter: () => () => providerState.model }));
const modules = Object.fromEntries(
  Object.entries(import.meta.glob('../**/*.*s')).map(([path, loader]) => [
    path.startsWith('./') ? `../assistant/${path.slice(2)}` : path,
    loader,
  ]),
);
const secret = 'test-convex-server-secret';
const admin = { id: 'assistant-admin', hasFullAccess: true, empresas: [1, 2], permisos: ['*'] };
type Begun = {
  runId: Id<'assistantRuns'>;
  conversationId: Id<'assistantConversations'>;
  status: string;
  companyIds: number[];
};
function makeTest() {
  const t = convexTest(schema, modules);
  agentTest.register(t);
  rateLimiterTest.register(t);
  return t;
}
type T = ReturnType<typeof makeTest>;
function request(overrides: Record<string, unknown> = {}) {
  return {
    secret,
    expectedActingUserId: admin.id,
    companyIds: [1],
    text: '¿Cuál es el flujo de facturación?',
    model: DEFAULT_ASSISTANT_MODEL,
    language: 'es',
    idempotencyKey: crypto.randomUUID(),
    ...overrides,
  };
}
async function begin(user: ActingClient, overrides: Record<string, unknown> = {}) {
  return (await user.mutation(api.assistant.begin, request(overrides))) as Begun;
}
async function runRound(user: ActingClient, run: Begun) {
  return (await user.action(api.assistant.round, { secret, expectedActingUserId: admin.id, runId: run.runId })) as {
    status: string;
    pendingTools?: unknown[];
  };
}
async function info(user: ActingClient, run: Begun) {
  return (await user.query(api.assistant.getConversation, {
    conversationId: run.conversationId,
    expectedActingUserId: admin.id,
  })) as {
    threadId: string;
    locked: boolean;
    evidence: AssistantToolResult[];
    run: { status: string; error?: string } | null;
  };
}
async function changeActor(
  t: T,
  patch: {
    nestUserId?: string;
    permisos?: string[];
    hasFullAccess?: boolean;
    empresas?: number[];
    role?: 'member' | 'admin';
  },
) {
  await t.run(async (ctx) => {
    const row = await ctx.db
      .query('users')
      .withIndex('by_tokenIdentifier', (q) => q.eq('tokenIdentifier', `test|${admin.id}`))
      .unique();
    if (!row) throw new Error('missing test user');
    await ctx.db.patch('users', row._id, patch);
  });
}
beforeEach(() => {
  vi.stubEnv('OPENROUTER_API_KEY', 'test-provider-key');
  providerState.model = mockModel({
    content: [{ type: 'text', text: 'Puedo ayudarte con tus consultas autorizadas.' }],
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('assistant ownership and scope', () => {
  test('requires both signed-in identity and server secret', async () => {
    const t = makeTest();
    await expect(
      t.mutation(api.assistant.begin, request() as Parameters<typeof t.mutation<typeof api.assistant.begin>>[1]),
    ).rejects.toThrow('No autenticado');
    const user = await asUser(t, admin);
    await expect(begin(user, { secret: 'forged' })).rejects.toThrow('No autorizado');
    await expect(begin(user, { expectedActingUserId: 'other' })).rejects.toThrow('sesión cambió');
  });

  test('rejects arbitrary models, invalid scope and oversized prompts', async () => {
    const t = makeTest();
    const user = await asUser(t, admin);
    await expect(begin(user, { model: 'arbitrary/model' })).rejects.toThrow();
    await expect(begin(user, { companyIds: [] })).rejects.toThrow();
    await expect(begin(user, { text: 'x'.repeat(12_001) })).rejects.toThrow();
    await changeActor(t, { hasFullAccess: false, role: 'member', empresas: [1] });
    await expect(begin(user, { companyIds: [2] })).rejects.toThrow('Empresa no autorizada');
  });

  test('deduplicates same request and rejects mismatched idempotency reuse', async () => {
    const t = makeTest();
    const user = await asUser(t, admin);
    const args = request();
    const first = (await user.mutation(api.assistant.begin, args)) as Begun;
    expect(await user.mutation(api.assistant.begin, args)).toEqual({ ...first, duplicate: true });
    await expect(user.mutation(api.assistant.begin, { ...args, text: 'Otra pregunta' })).rejects.toThrow('duplicada');
    const conversation = await info(user, first);
    const messages = (await user.query(api.assistant.listMessages, {
      conversationId: first.conversationId,
      threadId: conversation.threadId,
      expectedActingUserId: admin.id,
      paginationOpts: { numItems: 20, cursor: null },
    })) as { page: unknown[] };
    expect(messages.page).toHaveLength(1);
  });

  test('allows one active response across impersonation contexts', async () => {
    const t = makeTest();
    const user = await asUser(t, admin);
    await begin(user);
    await expect(begin(user)).rejects.toThrow('respuesta en curso');
    await changeActor(t, { nestUserId: 'acting-target' });
    await expect(begin(user, { expectedActingUserId: 'acting-target' })).rejects.toThrow('respuesta en curso');
  });

  test("isolates real owner, effective actor and target user's own history", async () => {
    const t = makeTest();
    const user = await asUser(t, admin);
    const run = await begin(user);
    const other = await asUser(t, { ...admin, id: 'other-admin' });
    await expect(
      other.query(api.assistant.getConversation, {
        conversationId: run.conversationId,
        expectedActingUserId: 'other-admin',
      }),
    ).rejects.toThrow('Conversación no disponible');
    await user.mutation(api.assistant.cancel, {
      conversationId: run.conversationId,
      runId: run.runId,
      expectedActingUserId: admin.id,
    });
    await changeActor(t, { nestUserId: 'acting-target' });
    await expect(
      user.query(api.assistant.getConversation, {
        conversationId: run.conversationId,
        expectedActingUserId: 'acting-target',
      }),
    ).rejects.toThrow('Conversación no disponible');
    const acted = await begin(user, { expectedActingUserId: 'acting-target' });
    const target = await asUser(t, { ...admin, id: 'acting-target' });
    await expect(
      target.query(api.assistant.getConversation, {
        conversationId: acted.conversationId,
        expectedActingUserId: 'acting-target',
      }),
    ).rejects.toThrow('Conversación no disponible');
  });

  test('freezes explicit company set and rejects thread-id swapping', async () => {
    const t = makeTest();
    const user = await asUser(t, admin);
    const run = await begin(user, { companyIds: [2, 1] });
    expect(run.companyIds).toEqual([1, 2]);
    await user.mutation(api.assistant.cancel, {
      conversationId: run.conversationId,
      runId: run.runId,
      expectedActingUserId: admin.id,
    });
    await expect(begin(user, { conversationId: run.conversationId, companyIds: [1] })).rejects.toThrow(
      'otras empresas',
    );
    await expect(
      user.query(api.assistant.listMessages, {
        conversationId: run.conversationId,
        threadId: 'forged-component-thread',
        expectedActingUserId: admin.id,
        paginationOpts: { numItems: 20, cursor: null },
      }),
    ).rejects.toThrow('Conversación no disponible');
  });

  test('paginates beyond 50 newer conversations in other scopes without exposing other owners or acting histories', async () => {
    const t = makeTest();
    const user = await asUser(t, admin);
    await t.run(async (ctx) => {
      for (let index = 0; index < 65; index++) {
        await ctx.db.insert('assistantConversations', {
          ownerTokenIdentifier: `test|${admin.id}`,
          actingUserId: admin.id,
          threadId: `seed-thread-${index}`,
          title: `Conversación ${index}`,
          companyIds: index < 15 ? [1] : [2],
          model: DEFAULT_ASSISTANT_MODEL,
          language: 'es',
          updatedAt: index + 1,
          sourceCount: 0,
        });
      }
      await ctx.db.insert('assistantConversations', {
        ownerTokenIdentifier: 'test|other-owner',
        actingUserId: admin.id,
        threadId: 'other-owner-thread',
        title: 'Private other owner',
        companyIds: [1],
        model: DEFAULT_ASSISTANT_MODEL,
        language: 'es',
        updatedAt: 100,
        sourceCount: 0,
      });
      await ctx.db.insert('assistantConversations', {
        ownerTokenIdentifier: `test|${admin.id}`,
        actingUserId: 'other-actor',
        threadId: 'other-actor-thread',
        title: 'Private other actor',
        companyIds: [1],
        model: DEFAULT_ASSISTANT_MODEL,
        language: 'es',
        updatedAt: 101,
        sourceCount: 0,
      });
    });
    type HistoryPage = {
      page: Array<{ title: string; companyIds: number[] }>;
      continueCursor: string;
      isDone: boolean;
    };
    const args = { companyIds: [1], expectedActingUserId: admin.id };
    const first = (await user.query(api.assistant.listConversations, {
      ...args,
      paginationOpts: { numItems: 20, cursor: null },
    })) as HistoryPage;
    expect(first.page).toEqual([]);
    expect(first.isDone).toBe(false);
    const found: HistoryPage['page'] = [];
    let cursor = first.continueCursor;
    let isDone = false;
    for (let page = 0; !isDone && page < 10; page++) {
      const next = (await user.query(api.assistant.listConversations, {
        ...args,
        paginationOpts: { numItems: 20, cursor },
      })) as HistoryPage;
      found.push(...next.page);
      cursor = next.continueCursor;
      isDone = next.isDone;
    }
    expect(isDone).toBe(true);
    expect(found).toHaveLength(15);
    expect(found.at(-1)?.title).toBe('Conversación 0');
    expect(found.every((conversation) => conversation.companyIds.join(',') === '1')).toBe(true);
    expect(found.some((conversation) => conversation.title.startsWith('Private'))).toBe(false);
  });
});

describe('assistant runtime', () => {
  test('streams and persists responses through Agent and reloads the same thread', async () => {
    const t = makeTest();
    const user = await asUser(t, admin);
    const run = await begin(user);
    expect(await runRound(user, run)).toMatchObject({ status: 'completed' });
    const conversation = await info(user, run);
    const messages = (await user.query(api.assistant.listMessages, {
      conversationId: run.conversationId,
      threadId: conversation.threadId,
      expectedActingUserId: admin.id,
      paginationOpts: { numItems: 20, cursor: null },
    })) as { page: Array<{ text: string }> };
    expect(messages.page.some((message) => message.text.includes('consultas autorizadas'))).toBe(true);
    expect((await info(user, run)).threadId).toBe(conversation.threadId);
  });

  test('executes multi-round workflow tools for all five domains with source manifests', async () => {
    const t = makeTest();
    const user = await asUser(t, admin);
    const domains = ['billing', 'suppliers', 'customers', 'advances', 'pettyCash'];
    providerState.model = mockModel({
      contentSteps: [
        ...domains.map((domain, index) => [
          {
            type: 'tool-call' as const,
            toolCallId: `call-${index}`,
            toolName: 'read_data',
            input: JSON.stringify({ domain, operation: 'workflow' }),
          },
        ]),
        [{ type: 'text', text: 'Estos son los flujos documentados.' }],
      ],
    });
    const run = await begin(user);
    for (let i = 0; i < domains.length; i++) expect(await runRound(user, run)).toMatchObject({ status: 'running' });
    expect(await runRound(user, run)).toMatchObject({ status: 'completed' });
    const conversation = await info(user, run);
    expect(conversation.evidence).toHaveLength(5);
    expect(new Set(conversation.evidence.flatMap((e) => e.sources.map((s) => s.domain)))).toEqual(new Set(domains));
    expect(conversation.evidence.every((e) => e.guide?.steps.length)).toBe(true);
  });

  test('locks all prior text and evidence when source permissions are revoked', async () => {
    const t = makeTest();
    const user = await asUser(t, admin);
    providerState.model = mockModel({
      content: [
        {
          type: 'tool-call',
          toolCallId: 'workflow',
          toolName: 'read_data',
          input: JSON.stringify({ domain: 'billing', operation: 'workflow' }),
        },
      ],
    });
    const run = await begin(user);
    await runRound(user, run);
    const prior = await info(user, run);
    expect(prior.evidence).toHaveLength(1);
    await changeActor(t, { hasFullAccess: false, role: 'member', permisos: [], empresas: [1] });
    expect(await info(user, run)).toMatchObject({ locked: true, evidence: [], run: null });
    expect(
      await user.query(api.assistant.listConversations, {
        companyIds: [1],
        expectedActingUserId: admin.id,
        paginationOpts: { numItems: 20, cursor: null },
      }),
    ).toMatchObject({ page: [{ locked: true, title: 'Conversación sin acceso' }] });
    expect(
      await user.query(api.assistant.listMessages, {
        conversationId: run.conversationId,
        threadId: prior.threadId,
        expectedActingUserId: admin.id,
        paginationOpts: { numItems: 20, cursor: null },
      }),
    ).toMatchObject({ page: [] });
  });

  test("cancellation releases the user's slot and remains persisted", async () => {
    const t = makeTest();
    const user = await asUser(t, admin);
    const run = await begin(user);
    await user.mutation(api.assistant.cancel, {
      conversationId: run.conversationId,
      runId: run.runId,
      expectedActingUserId: admin.id,
    });
    expect(await runRound(user, run)).toMatchObject({ status: 'cancelled' });
    expect((await info(user, run)).run?.status).toBe('cancelled');
    expect((await begin(user)).runId).not.toBe(run.runId);
  });

  test('deadline and tool-round limits release stale runs', async () => {
    const t = makeTest();
    const user = await asUser(t, admin);
    const run = await begin(user);
    await t.run(async (ctx) => {
      await ctx.db.patch('assistantRuns', run.runId, { deadline: Date.now() - 1 });
    });
    expect(await runRound(user, run)).toMatchObject({ status: 'failed' });
    const next = await begin(user);
    await t.run(async (ctx) => {
      await ctx.db.patch('assistantRuns', next.runId, { rounds: 10 });
    });
    expect(await runRound(user, next)).toMatchObject({ status: 'failed' });
  });

  test('a delayed cancel for run A cannot cancel newer run B in the same conversation', async () => {
    const t = makeTest();
    const user = await asUser(t, admin);
    const first = await begin(user);
    const cancelFirst = { conversationId: first.conversationId, runId: first.runId, expectedActingUserId: admin.id };
    await user.mutation(api.assistant.cancel, cancelFirst);
    const second = await begin(user, { conversationId: first.conversationId });
    await user.mutation(api.assistant.cancel, cancelFirst);
    expect(await t.run(async (ctx) => (await ctx.db.get('assistantRuns', second.runId))?.status)).toBe('running');
    expect(await t.run(async (ctx) => (await ctx.db.get('assistantRuns', first.runId))?.status)).toBe('cancelled');
    const other = await asUser(t, { ...admin, id: 'other-owner' });
    const foreign = await begin(other, { expectedActingUserId: 'other-owner' });
    await expect(user.mutation(api.assistant.cancel, { ...cancelFirst, runId: foreign.runId })).rejects.toThrow(
      'Respuesta no disponible',
    );
  });

  test('rejects simultaneous coordinator claims', async () => {
    const t = makeTest();
    const user = await asUser(t, admin);
    const run = await begin(user);
    const first = await user.mutation(internal.assistant.claimRound, {
      runId: run.runId,
      expectedActingUserId: admin.id,
      lease: 'first',
    });
    const second = await user.mutation(internal.assistant.claimRound, {
      runId: run.runId,
      expectedActingUserId: admin.id,
      lease: 'second',
    });
    expect(first).toMatchObject({ claimed: true });
    expect(second).toMatchObject({ claimed: false });
  });

  test('dictation quota is shared by the real user across acting contexts', async () => {
    const t = makeTest();
    const user = await asUser(t, admin);
    for (let i = 0; i < 10; i++)
      await user.mutation(api.assistant.consumeDictation, { secret, expectedActingUserId: admin.id });
    await changeActor(t, { nestUserId: 'acting-target' });
    await expect(
      user.mutation(api.assistant.consumeDictation, { secret, expectedActingUserId: 'acting-target' }),
    ).rejects.toThrow('10 dictados');
  });

  test('question quota rejects the 31st question', async () => {
    const t = makeTest();
    const user = await asUser(t, admin);
    for (let i = 0; i < 30; i++) {
      const run = await begin(user);
      await user.mutation(api.assistant.cancel, {
        conversationId: run.conversationId,
        runId: run.runId,
        expectedActingUserId: admin.id,
      });
    }
    await expect(begin(user)).rejects.toThrow('30 preguntas');
  });

  test('provider failures persist a sanitized error', async () => {
    const t = makeTest();
    const user = await asUser(t, admin);
    providerState.model = mockModel({ fail: { error: 'secret=do-not-save' } });
    const run = await begin(user);
    expect(await runRound(user, run)).toMatchObject({ status: 'failed' });
    expect((await info(user, run)).run?.error).not.toContain('do-not-save');
    const { threadId } = await info(user, run);
    const saved = await t.run(
      async (ctx) =>
        await componentMessages(ctx, components.agent, { threadId, paginationOpts: { numItems: 20, cursor: null } }),
    );
    expect(JSON.stringify(saved)).not.toContain('do-not-save');
  });

  test('applies the selected response language to the model instructions', async () => {
    const t = makeTest();
    const user = await asUser(t, admin);
    const model = mockModel();
    const spy = vi.spyOn(model, 'doStream');
    providerState.model = model;
    const english = await begin(user, { language: 'en' });
    await runRound(user, english);
    expect(JSON.stringify(spy.mock.calls[0][0].prompt)).toContain('Answer in English');
    const spanish = await begin(user, { language: 'es' });
    await runRound(user, spanish);
    expect(JSON.stringify(spy.mock.calls[1][0].prompt)).toContain('Answer in Spanish');
  });

  test('cancels an active stream and preserves its terminal run state', async () => {
    const t = makeTest();
    const user = await asUser(t, admin);
    providerState.model = mockModel({
      initialDelayInMs: 100,
      chunkDelayInMs: 25,
      content: [{ type: 'text', text: 'Una respuesta larga que todavía se está generando.' }],
    });
    const run = await begin(user);
    const generating = runRound(user, run);
    await vi.waitFor(async () =>
      expect(await t.run(async (ctx) => (await ctx.db.get('assistantRuns', run.runId))?.lease)).toBeTruthy(),
    );
    await user.mutation(api.assistant.cancel, {
      conversationId: run.conversationId,
      runId: run.runId,
      expectedActingUserId: admin.id,
    });
    expect(await generating).toMatchObject({ status: 'cancelled' });
    expect((await info(user, run)).run?.status).toBe('cancelled');
  });

  test('partial text survives cancellation and a fresh history query after streaming deltas expire', async () => {
    const t = makeTest();
    const user = await asUser(t, admin);
    providerState.model = mockModel({
      initialDelayInMs: 0,
      chunkDelayInMs: 15,
      content: [{ type: 'text', text: `Inicio parcial ${'continuando '.repeat(100)}final-respuesta` }],
    });
    const run = await begin(user);
    const { threadId } = await info(user, run);
    const generating = runRound(user, run);
    const historyArgs = {
      conversationId: run.conversationId,
      threadId,
      expectedActingUserId: admin.id,
      paginationOpts: { numItems: 20, cursor: null },
    };
    await vi.waitFor(async () => {
      const list = (await user.query(api.assistant.listMessages, { ...historyArgs, streamArgs: { kind: 'list' } })) as {
        streams: { messages: Array<{ streamId: string }> };
      };
      expect(list.streams.messages.length).toBeGreaterThan(0);
      const deltas = await user.query(api.assistant.listMessages, {
        ...historyArgs,
        streamArgs: { kind: 'deltas', cursors: [{ streamId: list.streams.messages[0].streamId, cursor: 0 }] },
      });
      expect(JSON.stringify(deltas)).toContain('Inicio');
    });
    await user.mutation(api.assistant.cancel, {
      conversationId: run.conversationId,
      runId: run.runId,
      expectedActingUserId: admin.id,
    });
    expect(await generating).toMatchObject({ status: 'cancelled' });
    // No streamArgs: this is a fresh persisted-message read, independent of ephemeral deltas.
    const saved = (await user.query(api.assistant.listMessages, historyArgs)) as {
      page: Array<{ text: string; status: string }>;
    };
    const partial = saved.page.find((message) => message.text.startsWith('Inicio parcial'));
    expect(partial).toMatchObject({ status: 'failed' });
    expect(partial?.text).not.toContain('final-respuesta');
  });

  test('charts require an explicit request and exactly reuse saved numeric rows', async () => {
    const t = makeTest();
    const user = await asUser(t, admin);
    const run = await begin(user, { text: 'Haz un gráfico de barras con la información disponible' });
    const result: AssistantToolResult = {
      title: 'Datos',
      records: [],
      rows: [
        { nombre: 'A', valor: 10 },
        { nombre: 'B', valor: 20 },
      ],
      sources: [],
      metadata: {
        complete: false,
        returned: 2,
        scanned: 2,
        limit: 2,
        nextCursor: null,
        companyIds: [1],
        currency: 'COP',
        from: null,
        to: null,
        asOf: Date.now(),
        notes: ['Subtotales parciales'],
      },
    };
    await user.mutation(internal.assistant.recordEvidence, {
      runId: run.runId,
      expectedActingUserId: admin.id,
      toolCallId: 'data',
      resultJson: JSON.stringify(result),
    });
    const chart = { type: 'bar', title: 'Valores parciales', labelKey: 'nombre', valueKey: 'valor' };
    const args = {
      runId: run.runId,
      expectedActingUserId: admin.id,
      sourceToolCallId: 'data',
      chartJson: JSON.stringify(chart),
    };
    expect(await user.mutation(internal.assistant.chartEvidence, args)).toMatchObject({
      rows: result.rows,
      chart,
      metadata: { complete: false },
    });
    expect(await user.mutation(internal.assistant.chartEvidence, args)).toMatchObject({ chart: { currency: 'COP' } });
    await expect(
      user.mutation(internal.assistant.chartEvidence, {
        ...args,
        chartJson: JSON.stringify({ ...chart, currency: 'USD' }),
      }),
    ).rejects.toThrow('no coincide con las fuentes');
    const mixedResult = {
      ...result,
      rows: [
        { nombre: 'COP', valor: 10, moneda: 'COP', registros: 1 },
        { nombre: 'USD', valor: 20, moneda: 'USD', registros: 2 },
      ],
      metadata: { ...result.metadata, currency: null },
    };
    await user.mutation(internal.assistant.recordEvidence, {
      runId: run.runId,
      expectedActingUserId: admin.id,
      toolCallId: 'mixed',
      resultJson: JSON.stringify(mixedResult),
    });
    const mixedArgs = { ...args, sourceToolCallId: 'mixed' };
    await expect(user.mutation(internal.assistant.chartEvidence, mixedArgs)).rejects.toThrow('Separa las monedas');
    const countChart = { ...chart, valueKey: 'registros' };
    const countResult = (await user.mutation(internal.assistant.chartEvidence, {
      ...mixedArgs,
      chartJson: JSON.stringify(countChart),
    })) as AssistantToolResult;
    expect(countResult.chart?.currency).toBeUndefined();
    await expect(
      user.mutation(internal.assistant.chartEvidence, {
        ...mixedArgs,
        chartJson: JSON.stringify({ ...countChart, currency: 'COP' }),
      }),
    ).rejects.toThrow('no llevan moneda');
    await expect(
      user.mutation(internal.assistant.chartEvidence, {
        ...args,
        chartJson: JSON.stringify({ ...chart, valueKey: 'inventado' }),
      }),
    ).rejects.toThrow('no coincide');
    await user.mutation(api.assistant.cancel, {
      conversationId: run.conversationId,
      runId: run.runId,
      expectedActingUserId: admin.id,
    });
    const other = await begin(user);
    await expect(user.mutation(internal.assistant.chartEvidence, { ...args, runId: other.runId })).rejects.toThrow(
      'solicitud explícita',
    );
  });

  test('renames and deletes only owned conversations', async () => {
    const t = makeTest();
    const user = await asUser(t, admin);
    const run = await begin(user);
    await user.mutation(api.assistant.renameConversation, {
      conversationId: run.conversationId,
      expectedActingUserId: admin.id,
      title: 'Consultas de septiembre',
    });
    expect(
      await user.query(api.assistant.listConversations, {
        companyIds: [1],
        expectedActingUserId: admin.id,
        paginationOpts: { numItems: 20, cursor: null },
      }),
    ).toMatchObject({ page: [{ title: 'Consultas de septiembre' }] });
    await user.mutation(api.assistant.deleteConversation, {
      conversationId: run.conversationId,
      expectedActingUserId: admin.id,
    });
    expect(
      await user.query(api.assistant.listConversations, {
        companyIds: [1],
        expectedActingUserId: admin.id,
        paginationOpts: { numItems: 20, cursor: null },
      }),
    ).toMatchObject({ page: [] });
    await expect(info(user, run)).rejects.toThrow('Conversación no disponible');
  });
});

describe('server-only ERP continuation', () => {
  async function pending() {
    const t = makeTest();
    const user = await asUser(t, admin);
    providerState.model = mockModel({
      contentSteps: [
        [
          {
            type: 'tool-call',
            toolCallId: 'erp-1',
            toolName: 'erp_lookup',
            input: JSON.stringify({
              domain: 'suppliers',
              operation: 'document',
              companyId: 1,
              search: '900123456',
              documentType: 'NIT',
              limit: 10,
            }),
          },
        ],
        [{ type: 'text', text: 'No se encontraron coincidencias en el ERP.' }],
      ],
    });
    const run = await begin(user);
    expect(await runRound(user, run)).toMatchObject({ status: 'waiting_erp' });
    const result: AssistantToolResult = {
      title: 'ERP',
      records: [],
      rows: [],
      sources: [{ domain: 'suppliers', kind: 'erp', companyId: 1, erpMode: 'document', permission: '*' }],
      metadata: {
        complete: true,
        returned: 0,
        scanned: 0,
        limit: 10,
        nextCursor: null,
        companyIds: [1],
        currency: null,
        from: null,
        to: null,
        asOf: Date.now(),
        notes: [],
      },
    };
    return {
      t,
      user,
      run,
      result,
      args: {
        secret,
        expectedActingUserId: admin.id,
        runId: run.runId,
        results: [{ toolCallId: 'erp-1', resultJson: JSON.stringify(result) }],
      },
    };
  }

  test('continues matching authenticated tool results then rejects replay', async () => {
    const { user, run, args } = await pending();
    expect(await user.mutation(api.assistant.continueErp, args)).toEqual({ status: 'running' });
    await expect(user.mutation(api.assistant.continueErp, args)).rejects.toThrow('continuación');
    expect(await runRound(user, run)).toMatchObject({ status: 'completed' });
  });

  test('rejects forged secret, unmatched ID and companies', async () => {
    const { user, args, result } = await pending();
    await expect(user.mutation(api.assistant.continueErp, { ...args, secret: 'browser-forgery' })).rejects.toThrow(
      'No autorizado',
    );
    await expect(
      user.mutation(api.assistant.continueErp, { ...args, results: [{ ...args.results[0], toolCallId: 'other' }] }),
    ).rejects.toThrow('no autorizada');
    result.sources[0].companyId = 2;
    await expect(
      user.mutation(api.assistant.continueErp, {
        ...args,
        results: [{ toolCallId: 'erp-1', resultJson: JSON.stringify(result) }],
      }),
    ).rejects.toThrow('Fuente ERP');
  });

  test('rejects continuation after effective actor changes', async () => {
    const { t, user, args } = await pending();
    await changeActor(t, { nestUserId: 'another-actor' });
    await expect(user.mutation(api.assistant.continueErp, args)).rejects.toThrow('sesión cambió');
  });
});
