'use client';

import { useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useConvex } from 'convex/react';
import { toast } from 'sonner';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import type { ReembolsoModalTarget } from '@/components/cajas-menores';
import type { CajaRow } from '@/app/(default)/finance/petty-cash/_components/types';

/** Opens a referenced record only after its existing server-side access check. */
export function usePettyCashDeepLink({
  actorUserId,
  actorRol,
  onCaja,
  onReembolso,
}: {
  actorUserId?: string;
  actorRol?: number;
  onCaja?: (caja: CajaRow) => void;
  onReembolso: (reembolso: ReembolsoModalTarget) => void;
}) {
  const params = useSearchParams();
  const convex = useConvex();
  const handled = useRef('');
  const caja = onCaja ? params.get('caja') : null;
  const reembolso = params.get('reembolso');
  useEffect(() => {
    const key = `${actorUserId}:${caja}:${reembolso}`;
    if (!actorUserId || (!caja && !reembolso) || handled.current === key) return;
    let cancelled = false;
    const open = async () => {
      try {
        if (reembolso) {
          const result = await convex.query(api.cajasMenores.obtenerDetalleReembolsoCajaMenor, {
            reembolsoId: reembolso as Id<'cajasMenoresReembolsos'>,
            actorUserId,
            actorRol,
          });
          if (!result) throw new Error('unavailable');
          if (!cancelled) onReembolso({ _id: result.reembolso._id, estado: result.reembolso.estado });
        } else if (caja && onCaja) {
          const result = await convex.query(api.cajasMenores.obtenerDetalleCaja, {
            cajaMenorId: caja as Id<'cajasMenores'>,
            actorUserId,
            actorRol,
          });
          if (!result) throw new Error('unavailable');
          if (!cancelled) onCaja(result.caja as CajaRow);
        }
      } catch {
        if (!cancelled) toast.error('El registro no está disponible con tus permisos actuales.');
      } finally {
        if (!cancelled) {
          handled.current = key;
          const url = new URL(window.location.href);
          url.searchParams.delete('caja');
          url.searchParams.delete('reembolso');
          window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
        }
      }
    };
    void open();
    return () => {
      cancelled = true;
    };
  }, [actorUserId, actorRol, caja, reembolso, convex, onCaja, onReembolso]);
}
