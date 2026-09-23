"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { Coins } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { formatCurrency, formatDateTime } from "../../../lib/utils";
import { getValorContable } from "../../../lib/valor-contable";
import {
  getPagosParcialesFromAprobaciones,
  getSaldoPendientePagoParcial,
  sumPagosParciales,
} from "./pago-parcial-utils";

export function PagosParcialesSummaryCard({
  factura,
  aprobaciones,
}: {
  factura: Doc<"facturacionFacturas"> | null | undefined;
  aprobaciones: Doc<"facturacionAprobaciones">[] | undefined;
}) {
  const pagos = getPagosParcialesFromAprobaciones(aprobaciones);
  const totalPagado = sumPagosParciales(aprobaciones);
  const moneda = factura?.moneda ?? "COP";
  const saldo = getSaldoPendientePagoParcial(factura, totalPagado);
  const valorBase = factura ? getValorContable(factura) : 0;

  const storageIds = useMemo(
    () => pagos.map((p) => p.comprobanteStorageId),
    [pagos],
  );

  const storageUrls = useQuery(
    api.facturacionStorage.getUrls,
    storageIds.length > 0 && factura ? { storageIds, facturaIds: [factura._id] } : "skip",
  );

  const urlByStorageId = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const item of storageUrls ?? []) {
      map.set(String(item.storageId), item.url);
    }
    return map;
  }, [storageUrls]);

  if (pagos.length === 0) return null;

  return (
    <section className="rounded-xl border border-sky-200 bg-sky-50/40 p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Coins className="h-4 w-4 text-sky-700" />
          <div>
            <p className="text-sm font-semibold text-slate-900">Pagos parciales</p>
            <p className="mt-0.5 text-xs text-slate-500">
              Cuotas registradas en tesorería.
            </p>
          </div>
        </div>
        <Badge variant="outline" className="bg-white tabular-nums">
          {pagos.length}
        </Badge>
      </div>

      <div className="mb-4 grid gap-2 rounded-lg border border-sky-200/80 bg-white p-3 text-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="text-slate-600">Valor a pagar</span>
          <span className="font-semibold tabular-nums">
            {formatCurrency(valorBase, moneda)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-slate-600">Total pagado</span>
          <span className="font-semibold tabular-nums text-sky-800">
            {formatCurrency(totalPagado, moneda)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-2">
          <span className="font-medium text-slate-700">Saldo pendiente</span>
          <span className="font-semibold tabular-nums">
            {formatCurrency(saldo, moneda)}
          </span>
        </div>
      </div>

      <ul className="space-y-2">
        {pagos.map((pago, index) => {
          const url = urlByStorageId.get(String(pago.comprobanteStorageId));
          return (
            <li
              key={pago.id}
              className="rounded-lg border border-white bg-white px-3 py-2.5 shadow-xs"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-500">
                    Cuota {index + 1} · {formatDateTime(pago.creadoEn)}
                  </p>
                  <p className="mt-0.5 text-sm font-semibold tabular-nums text-slate-950">
                    {formatCurrency(pago.monto, moneda)}
                  </p>
                  <p className="mt-1 line-clamp-2 text-xs text-slate-600">
                    {pago.comentario}
                  </p>
                </div>
                <div className="text-right text-xs text-slate-500">
                  <p>{pago.actorNombre}</p>
                  {url ? (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-block font-medium text-sky-700 hover:underline"
                    >
                      {pago.comprobanteNombre}
                    </a>
                  ) : (
                    <p className="mt-1">{pago.comprobanteNombre}</p>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
