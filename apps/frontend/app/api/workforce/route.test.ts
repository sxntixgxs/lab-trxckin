import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('convex/nextjs', () => ({ fetchMutation: vi.fn(), fetchQuery: vi.fn() }));
vi.mock('@workos-inc/authkit-nextjs', () => ({ withAuth: vi.fn() }));
vi.mock('@/lib/fetch-backend', () => ({ getCurrentBackendUser: vi.fn(), fetchBackend: vi.fn() }));
vi.mock('@/lib/impersonate-cookie', () => ({ readImpersonateCookie: vi.fn() }));
import { fetchMutation, fetchQuery } from 'convex/nextjs';
import { withAuth } from '@workos-inc/authkit-nextjs';
import { fetchBackend, getCurrentBackendUser } from '@/lib/fetch-backend';
import { readImpersonateCookie } from '@/lib/impersonate-cookie';
import { GET, POST } from './route';

const actor = {
  id: 'nest-manager',
  workosUserId: 'user_manager',
  activo: true,
  nombre: 'Gestor ficticio',
  email: 'manager@example.test',
  hasFullAccess: false,
  acceso_todas_empresas: false,
  empresas: [1],
  permisos: ['workforce/scheduling', 'workforce/employees'],
  rol: { id: 2, slug: 'manager', nombre: 'Gestor' },
};
function post(command: unknown, overrides: Record<string, unknown> = {}) {
  return new Request('https://app.example/api/workforce', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Origin': 'https://app.example' },
    body: JSON.stringify({ companyId: 1, requestId: crypto.randomUUID(), command, ...overrides }),
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('CONVEX_SERVER_SECRET', 'server-test-secret');
  vi.mocked(withAuth).mockResolvedValue({
    user: { id: 'user_manager' },
    accessToken: 'verified-workos-token',
  } as Awaited<ReturnType<typeof withAuth>>);
  vi.mocked(getCurrentBackendUser).mockResolvedValue(actor);
  vi.mocked(readImpersonateCookie).mockResolvedValue(null);
  vi.mocked(fetchMutation).mockResolvedValue({ ok: true, message: 'Guardado' });
  vi.mocked(fetchQuery).mockResolvedValue({ companyId: 1 });
});
describe('workforce authenticated boundary', () => {
  it('keeps an uncertain transport outcome retryable without exposing internal details', async () => {
    vi.mocked(fetchMutation).mockRejectedValue(new TypeError('fetch failed: private deployment detail'));
    const response = await POST(post({ type: 'seedDemo' }));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('private deployment detail');
  });
  it('preserves actionable concurrency errors from the server', async () => {
    vi.mocked(fetchMutation).mockRejectedValue(
      new Error('[CONVEX M] Uncaught Error: Conflicto de revisión. Recarga.\n    at handler'),
    );
    const response = await POST(post({ type: 'seedDemo' }));
    expect(response.status).toBe(409);
    expect(await response.text()).toContain('Conflicto de revisión');
  });
  it('builds authority only from the real server identity and sends the JWT', async () => {
    const response = await POST(post({ type: 'seedDemo' }));
    expect(response.status).toBe(200);
    expect(getCurrentBackendUser).toHaveBeenCalledWith({ skipImpersonation: true });
    expect(fetchMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actor: expect.objectContaining({ userId: 'nest-manager', admin: false, companyIds: [1] }),
        secret: 'server-test-secret',
      }),
      { token: 'verified-workos-token' },
    );
  });
  it('rejects impersonation before accessing Convex', async () => {
    vi.mocked(readImpersonateCookie).mockResolvedValue({ targetUserId: 'someone' } as NonNullable<
      Awaited<ReturnType<typeof readImpersonateCookie>>
    >);
    expect((await POST(post({ type: 'seedDemo' }))).status).toBe(403);
    expect(fetchMutation).not.toHaveBeenCalled();
  });
  it('rejects inactive accounts, mismatched identity and cross-company calls', async () => {
    vi.mocked(getCurrentBackendUser).mockResolvedValue({ ...actor, activo: false });
    expect((await POST(post({ type: 'seedDemo' }))).status).toBe(403);
    vi.mocked(getCurrentBackendUser).mockResolvedValue({ ...actor, workosUserId: 'different' });
    expect((await POST(post({ type: 'seedDemo' }))).status).toBe(403);
    vi.mocked(getCurrentBackendUser).mockResolvedValue(actor);
    expect(
      (await GET(new Request('https://app.example/api/workforce?companyId=2&from=2026-09-20&to=2026-09-26'))).status,
    ).toBe(403);
    expect(fetchMutation).not.toHaveBeenCalled();
    expect(fetchQuery).not.toHaveBeenCalled();
  });
  it('rejects forged actor fields and cross-origin browser writes', async () => {
    expect((await POST(post({ type: 'seedDemo' }, { actor: { admin: true } }))).status).toBe(400);
    const request = post({ type: 'seedDemo' });
    request.headers.set('origin', 'https://untrusted.example');
    expect((await POST(request)).status).toBe(403);
    expect(fetchMutation).not.toHaveBeenCalled();
  });
  it('verifies employee account linkage against active company membership', async () => {
    vi.mocked(fetchBackend).mockResolvedValue(
      Response.json([
        {
          id: 'outside',
          nombre: 'Otra',
          email: 'other@example.test',
          activo: true,
          empresas: [2],
          acceso_todas_empresas: false,
        },
      ]),
    );
    const response = await POST(
      post({
        type: 'saveEmployee',
        employee: {
          code: 'D01',
          name: 'Demo',
          job: 'Operador',
          active: true,
          linkedUserId: 'outside',
          agreement: { dailyMinutes: 480, weeklyMinutes: 2520, restDay: 0 },
        },
        expectedRevision: 0,
      }),
    );
    expect(response.status).toBe(400);
    expect(fetchMutation).not.toHaveBeenCalled();
  });
  it('never trusts browser names/roles and gives no module access to a basic member', async () => {
    vi.mocked(getCurrentBackendUser).mockResolvedValue({ ...actor, permisos: ['dashboard', 'perfil'] });
    expect((await POST(post({ type: 'seedDemo' }))).status).toBe(403);
    expect(fetchMutation).not.toHaveBeenCalled();
  });
});
