import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CurrentUser } from '@/lib/fetch-backend';

const mocks = vi.hoisted(() => ({ fetchBackend: vi.fn() }));
vi.mock('@workos-inc/authkit-nextjs', () => ({ withAuth: vi.fn() }));
vi.mock('@/lib/convexServerClient', () => ({ getConvexServerSecret: () => 'test' }));
vi.mock('@/lib/fetch-backend', () => ({
  fetchBackend: mocks.fetchBackend,
  userHasPermission: (user: CurrentUser, permission: string) =>
    user.hasFullAccess || user.permisos.includes('*') || user.permisos.includes(permission),
}));
import { assistantErpSchema, assistantToolResultSchema } from './contracts';
import { assistantErpPath, executeAssistantErp } from './erp';

const user = (permisos: string[], extra: Partial<CurrentUser> = {}): CurrentUser => ({
  id: 'u1',
  workosUserId: 'w1',
  email: 'demo@example.test',
  nombre: 'Demo',
  activo: true,
  empresas: [1],
  permisos,
  hasFullAccess: false,
  rol: { id: 2, slug: 'member', nombre: 'Member' },
  ...extra,
});
const input = assistantErpSchema.parse({
  domain: 'customers',
  operation: 'document',
  companyId: 1,
  search: '900123456',
});
beforeEach(() => vi.clearAllMocks());

describe('assistant ERP boundary', () => {
  it('does not let a tool expand frozen companies or current membership', () => {
    expect(() =>
      assistantErpPath({ ...input, companyId: 2 }, user(['customers/onboarding'], { empresas: [1, 2] }), [1]),
    ).toThrow('conversación');
    expect(() => assistantErpPath({ ...input, companyId: 2 }, user(['customers/onboarding']), [2])).toThrow(
      'Empresa no autorizada',
    );
  });
  it('allows onboarding document lookup but not customer name search', () => {
    const actor = user(['customers/onboarding']);
    expect(assistantErpPath(input, actor, [1]).path).toContain('/clientes/existe?');
    expect(() => assistantErpPath({ ...input, operation: 'search' }, actor, [1])).toThrow('catálogo ERP');
  });
  it('uses catalog search only with its existing permission', () => {
    const path = assistantErpPath({ ...input, operation: 'search' }, user(['administracion/terceros-erp']), [1]);
    expect(path.path).toContain('/erp/catalogo/clientes?');
    expect(path.permission).toBe('administracion/terceros-erp');
  });
  it('advances catalog pages without calling a partial page a complete result', async () => {
    mocks.fetchBackend.mockResolvedValue(Response.json({ items: [], total: 11, page: 2, pageSize: 10 }));
    const result = await executeAssistantErp(
      { ...input, operation: 'search', cursor: '2' },
      user(['administracion/terceros-erp']),
      [1],
    );
    expect(mocks.fetchBackend.mock.calls[0][0]).toContain('page=2');
    expect(result.metadata.nextCursor).toBeNull();
    expect(result.metadata.complete).toBe(false);
    expect(assistantErpSchema.safeParse({ ...input, cursor: '-1' }).success).toBe(false);
    expect(() => assistantErpPath({ ...input, cursor: '2' }, user(['customers/onboarding']), [1])).toThrow(
      'paginación',
    );
  });
  it('preserves existing advance-request supplier search', () => {
    expect(
      assistantErpPath({ ...input, domain: 'suppliers', operation: 'search' }, user(['finance/advances/request']), [1])
        .mode,
    ).toBe('suppliers');
  });
  it('rejects model-selected endpoints, actors and malformed documents', () => {
    expect(assistantErpSchema.safeParse({ ...input, actorId: 'admin', endpoint: '/users' }).success).toBe(false);
    expect(assistantErpSchema.safeParse({ ...input, search: 'x'.repeat(31) }).success).toBe(false);
  });
  it('does not treat an unsynchronized empty catalog as proof of absence', async () => {
    mocks.fetchBackend.mockResolvedValue(
      Response.json({ existe: false, tercero: null, catalogo: { sincronizado: false, ultimaSincronizacion: null } }),
    );
    const result = await executeAssistantErp(input, user(['customers/onboarding']), [1]);
    expect(result.metadata.complete).toBe(false);
    expect(result.metadata.notes.join(' ')).toContain('no demuestra');
    expect(assistantToolResultSchema.safeParse(result).success).toBe(true);
  });
  it('projects only approved fields and never invents a record link without catalog access', async () => {
    mocks.fetchBackend.mockResolvedValue(
      Response.json({
        existe: true,
        tercero: {
          erpTerceroId: 'erp-1',
          nit: '900123456',
          razonSocial: 'Empresa demo',
          activo: true,
          sincronizadoEn: '2026-09-25',
          sucursales: [],
          bankAccount: 'hidden',
          signedUrl: 'hidden',
        },
        catalogo: { sincronizado: true, ultimaSincronizacion: '2026-09-25' },
      }),
    );
    const result = await executeAssistantErp(input, user(['customers/onboarding']), [1]);
    expect(JSON.stringify(result)).not.toContain('hidden');
    expect(result.records).toEqual([]);
    expect(result.sources[0].permission).toBe('customers/onboarding');
    expect(result.metadata.complete).toBe(true);
  });
});
