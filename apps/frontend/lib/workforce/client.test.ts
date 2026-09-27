import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommandResult, WorkforceCommand } from './types';

type Variables = {
  command: WorkforceCommand;
  requestId: string;
  companyId: number | null;
  userId: string | null;
  impersonating: boolean;
};
type Options = {
  mutationFn: (variables: Variables) => Promise<CommandResult>;
  onSuccess: (result: CommandResult, variables: Variables) => unknown;
};
const state = vi.hoisted(() => ({
  companyId: 1 as number | null,
  user: { id: 'user-one', isImpersonating: false } as { id: string; isImpersonating: boolean } | null,
  scopeRef: undefined as { current: unknown } | undefined,
  cleanup: undefined as (() => void) | undefined,
  options: undefined as Options | undefined,
  mutateAsync: vi.fn(),
  invalidateQueries: vi.fn(),
}));

// React Query keeps mutateAsync stable while replacing the observer's current
// options on render. Model that behavior explicitly to reproduce the GPS race.
vi.mock('react', () => ({
  useCallback: (callback: unknown) => callback,
  useRef: (value: unknown) => (state.scopeRef ??= { current: value }),
  useEffect: (effect: () => () => void) => {
    state.cleanup?.();
    state.cleanup = effect();
  },
}));
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: undefined, isLoading: false, error: null, refetch: vi.fn() }),
  useQueryClient: () => ({ invalidateQueries: state.invalidateQueries }),
  useMutation: (options: Options) => {
    state.options = options;
    return { mutateAsync: state.mutateAsync, isPending: false };
  },
}));
vi.mock('@/hooks/useEmpresaFilter', () => ({
  useEmpresaFilter: () => ({ empresaActiva: state.companyId, initialized: true }),
}));
vi.mock('@/hooks/useCurrentUser', () => ({ useCurrentUser: () => ({ backendUser: state.user }) }));

import { useWorkforce, WorkforceClientError } from './client';

const command: WorkforceCommand = {
  type: 'mark',
  mode: 'self',
  kind: 'IN',
  reason: '',
  expectedRevision: 0,
  gps: { latitude: 4.7, longitude: -74.1, accuracy: 10, timestamp: 1_800_000_000_000 },
};
const RenderWorkforce = () => useWorkforce('2026-09-20', '2026-09-26');

beforeEach(() => {
  state.companyId = 1;
  state.user = { id: 'user-one', isImpersonating: false };
  state.scopeRef = undefined;
  state.cleanup = undefined;
  state.options = undefined;
  state.mutateAsync.mockReset();
  state.invalidateQueries.mockReset().mockResolvedValue(undefined);
  state.mutateAsync.mockImplementation(async (variables: Variables) => {
    const options = state.options!;
    const result = await options.mutationFn(variables);
    await options.onSuccess(result, variables);
    return result;
  });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ok: true, message: 'Entrada registrada' })));
});

describe('workforce mutation scope', () => {
  it('rejects a GPS callback that resumes after a company switch', async () => {
    const original = RenderWorkforce();
    let releaseGps!: () => void;
    const gps = new Promise<void>((resolve) => {
      releaseGps = resolve;
    });
    const delayedMark = gps.then(() => original.execute(command, 'same-request'));
    state.companyId = 2;
    RenderWorkforce();
    releaseGps();
    await expect(delayedMark).rejects.toMatchObject({ status: 409, uncertain: false });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('binds a new command to the selected company and never posts scope hints as authority', async () => {
    RenderWorkforce();
    state.companyId = 2;
    const current = RenderWorkforce();
    await current.execute(command, 'new-request');
    expect(fetch).toHaveBeenCalledWith(
      '/api/workforce',
      expect.objectContaining({ body: JSON.stringify({ companyId: 2, command, requestId: 'new-request' }) }),
    );
    expect(state.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['workforce', 2] });
  });

  it('invalidates the originating company if it changes while an accepted request is pending', async () => {
    let finish!: (response: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    const original = RenderWorkforce();
    const saving = original.execute(command, 'in-flight');
    state.companyId = 2;
    RenderWorkforce();
    finish(Response.json({ ok: true, message: 'Entrada registrada' }));
    await saving;
    expect(state.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['workforce', 1] });
    expect(state.invalidateQueries).not.toHaveBeenCalledWith({ queryKey: ['workforce', 2] });
  });

  it('rejects old callbacks after the user changes or impersonation starts', async () => {
    const original = RenderWorkforce();
    state.user = { id: 'user-two', isImpersonating: false };
    RenderWorkforce();
    await expect(original.execute(command)).rejects.toMatchObject({ status: 409 });
    const second = RenderWorkforce();
    state.user = { id: 'user-two', isImpersonating: true };
    const acting = RenderWorkforce();
    await expect(second.execute(command)).rejects.toMatchObject({ status: 409 });
    await expect(acting.execute(command)).rejects.toMatchObject({ status: 403 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('cancels delayed writes after the hook has unmounted', async () => {
    const original = RenderWorkforce();
    state.cleanup?.();
    await expect(original.execute(command)).rejects.toMatchObject({ status: 409 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('retains uncertain transport failures so the same request can be retried', async () => {
    const original = RenderWorkforce();
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(original.execute(command, 'retry-id')).rejects.toMatchObject({ status: 0, uncertain: true });
    await original.execute(command, 'retry-id');
    const bodies = vi
      .mocked(fetch)
      .mock.calls.map(([, options]) => JSON.parse(String(options?.body)) as { requestId: string });
    expect(bodies.map((body) => body.requestId)).toEqual(['retry-id', 'retry-id']);
  });

  it('does not let a missing company start a request', async () => {
    state.companyId = null;
    await expect(RenderWorkforce().execute(command)).rejects.toBeInstanceOf(WorkforceClientError);
    expect(fetch).not.toHaveBeenCalled();
  });
});
