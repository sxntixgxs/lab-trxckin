import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ session: vi.fn(), mutation: vi.fn(), action: vi.fn(), erp: vi.fn() }));
vi.mock('@/lib/assistant/server-session', async (original) => {
  const actual = await original<typeof import('@/lib/assistant/server-session')>();
  return { ...actual, assistantSession: mocks.session };
});
vi.mock('@workos-inc/authkit-nextjs', () => ({ withAuth: vi.fn() }));
vi.mock('@/lib/convexServerClient', () => ({ getConvexServerSecret: () => 'test' }));
vi.mock('@/lib/assistant/erp', () => ({
  executeAssistantErp: mocks.erp,
  assistantToolError: () => ({ error: 'ERP unavailable' }),
}));
import { POST } from './route';
import { getFunctionName } from 'convex/server';

const payload = {
  text: 'Explica anticipos',
  model: 'google/gemini-3.5-flash-lite',
  language: 'es',
  companyId: 1,
  idempotencyKey: '257fcd2e-5a8f-4e97-b890-9fab078c095c',
};
const begun = {
  conversationId: 'conversation-1',
  runId: 'run-1',
  status: 'running',
  companyIds: [1],
  duplicate: false,
};
const session = {
  client: { mutation: mocks.mutation, action: mocks.action },
  secret: 'test-secret',
  expectedActingUserId: 'actor-1',
  realUserId: 'real-1',
  user: { empresas: [1], hasFullAccess: false },
};
const request = (body: unknown = payload, signal?: AbortSignal) =>
  new Request('http://localhost:3000/api/assistant/send', {
    method: 'POST',
    headers: { 'origin': 'http://localhost:3000', 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
  mocks.session.mockResolvedValue(session);
  mocks.mutation.mockImplementation(async (ref) =>
    getFunctionName(ref) === 'assistant:begin' ? begun : { status: 'running' },
  );
  mocks.action.mockResolvedValue({ status: 'completed' });
});
afterEach(() => vi.unstubAllEnvs());
describe('assistant send coordinator', () => {
  it('streams a public-origin request received at the internal container URL', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.sxntixgxs.dev');
    const response = await POST(
      new Request('http://0.0.0.0:3000/api/assistant/send', {
        method: 'POST',
        headers: { 'origin': 'https://app.sxntixgxs.dev', 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('"completed"');
    expect(mocks.session).toHaveBeenCalled();
  });
  it('rejects a cross-origin request before authentication or generation', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.sxntixgxs.dev');
    const response = await POST(
      new Request('http://0.0.0.0:3000/api/assistant/send', {
        method: 'POST',
        headers: { 'origin': 'https://untrusted.example', 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Origen no autorizado.' });
    expect(mocks.session).not.toHaveBeenCalled();
    expect(mocks.mutation).not.toHaveBeenCalled();
  });
  it('streams start and completion while keeping identity server-derived', async () => {
    const response = await POST(request());
    const events = (await response.text())
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(events.map((event) => event.type)).toEqual(['started', 'completed']);
    expect(mocks.mutation.mock.calls[0][1]).toMatchObject({
      companyIds: [1],
      expectedActingUserId: 'actor-1',
      secret: 'test-secret',
    });
    expect(mocks.action.mock.calls[0][1]).toMatchObject({ runId: 'run-1', expectedActingUserId: 'actor-1' });
  });
  it('rejects browser-supplied results and arbitrary models before auth or generation', async () => {
    expect((await POST(request({ ...payload, results: [] }))).status).toBe(400);
    expect((await POST(request({ ...payload, model: 'unlisted/model' }))).status).toBe(400);
    expect(mocks.session).not.toHaveBeenCalled();
  });
  it('does not coordinate or cancel duplicate submissions', async () => {
    mocks.mutation.mockResolvedValue({ ...begun, duplicate: true });
    const response = await POST(request());
    expect(await response.text()).toContain('"completed"');
    expect(mocks.action).not.toHaveBeenCalled();
    expect(mocks.mutation).toHaveBeenCalledTimes(1);
  });
  it('performs authenticated ERP continuation with the pending call ID', async () => {
    mocks.action
      .mockResolvedValueOnce({
        status: 'waiting_erp',
        pendingTools: [{ toolCallId: 'call-1', toolName: 'erp_lookup', args: { companyId: 1 } }],
      })
      .mockResolvedValueOnce({ status: 'completed' });
    mocks.erp.mockResolvedValue({ rows: [], sources: [] });
    const response = await POST(request());
    expect(await response.text()).toContain('"status":"completed"');
    const continuation = mocks.mutation.mock.calls.find(([ref]) => getFunctionName(ref) === 'assistant:continueErp');
    expect(continuation?.[1]).toMatchObject({
      secret: 'test-secret',
      runId: 'run-1',
      results: [{ toolCallId: 'call-1', resultJson: '{"rows":[],"sources":[]}' }],
    });
    expect(mocks.session).toHaveBeenCalledTimes(4);
  });
  it('rejects a changed real identity before forwarding ERP results', async () => {
    mocks.action.mockResolvedValueOnce({
      status: 'waiting_erp',
      pendingTools: [{ toolCallId: 'call-1', toolName: 'erp_lookup', args: {} }],
    });
    mocks.erp.mockResolvedValue({ rows: [] });
    mocks.session
      .mockResolvedValueOnce(session)
      .mockResolvedValueOnce(session)
      .mockResolvedValueOnce({ ...session, realUserId: 'other' });
    expect(await (await POST(request())).text()).toContain('"type":"error"');
    expect(mocks.mutation.mock.calls.some(([ref]) => getFunctionName(ref) === 'assistant:continueErp')).toBe(false);
  });
  it('binds interrupted request cancellation to its originating run', async () => {
    const abort = new AbortController();
    mocks.action.mockImplementation(async () => {
      abort.abort();
      throw new Error('provider-secret-detail');
    });
    const text = await (await POST(request(payload, abort.signal))).text();
    const calls = mocks.mutation.mock.calls.filter(([ref]) => getFunctionName(ref) === 'assistant:cancel');
    expect(calls.length).toBeGreaterThan(0);
    for (const [, args] of calls) expect(args).toMatchObject({ runId: 'run-1', conversationId: 'conversation-1' });
    expect(text).not.toContain('provider-secret-detail');
  });
});
