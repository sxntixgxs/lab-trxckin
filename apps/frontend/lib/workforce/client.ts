'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEmpresaFilter } from '@/hooks/useEmpresaFilter';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import type { CommandResult, DirectoryUser, WorkforceCommand, WorkforceSnapshot } from './types';

export class WorkforceClientError extends Error {
  constructor(
    message: string,
    public status: number,
    public uncertain = false,
  ) {
    super(message);
  }
}

type MutationScope = { companyId: number | null; userId: string | null; impersonating: boolean };
type ScopedCommand = MutationScope & { command: WorkforceCommand; requestId: string };

async function readResponse<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok)
    throw new WorkforceClientError(
      data?.error ?? 'No se pudo completar la operación.',
      response.status,
      response.status >= 500,
    );
  if (!data) throw new WorkforceClientError('La respuesta se perdió. Puedes reintentar la misma operación.', 502, true);
  return data;
}

export function useWorkforce(from: string, to: string) {
  const { empresaActiva, initialized } = useEmpresaFilter();
  const { backendUser } = useCurrentUser();
  const queryClient = useQueryClient();
  const companyId = empresaActiva;
  const userId = backendUser?.id ?? null;
  const impersonating = backendUser?.isImpersonating === true;
  const activeScope = useRef<MutationScope>({ companyId, userId, impersonating });
  useEffect(() => {
    activeScope.current = { companyId, userId, impersonating };
    return () => {
      activeScope.current = { companyId: null, userId: null, impersonating: false };
    };
  }, [companyId, userId, impersonating]);
  const query = useQuery({
    queryKey: ['workforce', companyId, backendUser?.id, backendUser?.isImpersonating, from, to],
    enabled: initialized && companyId !== null && Boolean(backendUser),
    queryFn: ({ signal }) =>
      fetch(`/api/workforce?${new URLSearchParams({ companyId: String(companyId), from, to })}`, {
        signal,
        cache: 'no-store',
      }).then(readResponse<WorkforceSnapshot>),
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
    retry: false,
    // Do not keep the previous company's/period's data while switching scope.
    staleTime: 0,
  });
  const mutation = useMutation({
    mutationFn: async ({
      command,
      requestId,
      companyId: targetCompanyId,
      userId: targetUserId,
      impersonating: targetImpersonating,
    }: ScopedCommand) => {
      if (targetCompanyId === null) throw new WorkforceClientError('Selecciona una empresa para continuar.', 400);
      const current = activeScope.current;
      // An old dialog/GPS callback can resume after its company or account was
      // switched. Never let React Query's latest options retarget that command.
      if (
        targetCompanyId !== companyId ||
        targetUserId !== userId ||
        targetImpersonating !== impersonating ||
        targetCompanyId !== current.companyId ||
        targetUserId !== current.userId ||
        targetImpersonating !== current.impersonating
      ) {
        throw new WorkforceClientError(
          'La empresa o la sesión cambió. Inicia la operación de nuevo en la empresa seleccionada.',
          409,
        );
      }
      if (!targetUserId || targetImpersonating)
        throw new WorkforceClientError('Usa tu sesión real para continuar.', 403);
      let response: Response;
      try {
        response = await fetch('/api/workforce', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ companyId: targetCompanyId, command, requestId }),
        });
      } catch {
        throw new WorkforceClientError(
          'No se recibió confirmación. Conserva esta solicitud y reintenta al recuperar la conexión.',
          0,
          true,
        );
      }
      return readResponse<CommandResult>(response);
    },
    onSuccess: (_result, { command, companyId: targetCompanyId }) => {
      if (command.type === 'saveSchedule' && command.preview) return;
      return queryClient.invalidateQueries({ queryKey: ['workforce', targetCompanyId] });
    },
  });
  const { mutateAsync } = mutation;
  const execute = useCallback(
    (command: WorkforceCommand, requestId = crypto.randomUUID()) =>
      mutateAsync({ command, requestId, companyId, userId, impersonating }),
    [mutateAsync, companyId, userId, impersonating],
  );
  return {
    data: query.data,
    isLoading: !initialized || query.isLoading,
    error: query.error,
    refresh: query.refetch,
    execute,
    isPending: mutation.isPending,
    companyId,
  };
}

export function useWorkforceDirectory(companyId: number | null) {
  const { backendUser } = useCurrentUser();
  return useQuery({
    queryKey: ['workforce-directory', companyId, backendUser?.id, backendUser?.isImpersonating],
    enabled: companyId !== null && Boolean(backendUser),
    queryFn: ({ signal }) =>
      fetch(`/api/workforce/directory?companyId=${companyId}`, { signal, cache: 'no-store' }).then(
        readResponse<DirectoryUser[]>,
      ),
    retry: false,
  });
}
