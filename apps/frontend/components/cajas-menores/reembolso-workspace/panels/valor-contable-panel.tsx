"use client";

import { RotateCcw } from "lucide-react";

import { ValorContableInput } from "@/app/(default)/billing/components/valor-contable-input";
import { CentroCostoDistribucionEditor } from "@/components/cajas-menores/centro-costo-distribucion-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCOP } from "@/lib/format";
import {
  getDistribucionBalance,
  toLegacyCentroCosto,
  type CentroCostoDistribucionRow,
} from "@/lib/cajas-menores/centros-costo-distribucion";

import type { ReembolsoInvoiceItem } from "../types";
import {
  buildInitialValorContableDraft,
  getEffectiveValor,
  invoiceTieneBorradorAjustado,
  isValorContableDraftValid,
  type ValorContableDraft,
} from "../valor-contable-drafts";

export function ReembolsoValorContablePanel({
  invoice,
  draft,
  empresaId,
  onDraftChange,
  onRestore,
}: {
  invoice: ReembolsoInvoiceItem | null;
  draft: ValorContableDraft | undefined;
  empresaId?: number;
  onDraftChange: (draft: ValorContableDraft) => void;
  onRestore: () => void;
}) {
  if (!invoice) {
    return (
      <div className="border-b border-slate-200 px-4 py-3 text-xs text-slate-500">
        Selecciona una factura para revisar su valor contable.
      </div>
    );
  }

  const effectiveDraft = draft ?? buildInitialValorContableDraft(invoice);
  const effectiveValor = getEffectiveValor(invoice, draft ? { [invoice.movimientoId]: draft } : {});
  const adjusted = invoiceTieneBorradorAjustado(invoice, draft);
  const valid = isValorContableDraftValid(draft ?? undefined);
  const balance = getDistribucionBalance(
    effectiveDraft.valorContableNuevo,
    effectiveDraft.centrosCostoDistribucion,
  );

  function updateDistribucion(centrosCostoDistribucion: CentroCostoDistribucionRow[]) {
    const legacy = toLegacyCentroCosto(centrosCostoDistribucion);
    onDraftChange({
      ...effectiveDraft,
      centrosCostoDistribucion,
      centroCostoCodigo: legacy.centroCostoCodigo,
      centroCostoNombre: legacy.centroCostoNombre,
      centroCostoId: legacy.centroCostoId,
    });
  }

  return (
    <div className="shrink-0 space-y-3 border-b border-slate-200 bg-white px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-950">
            #{invoice.numeroFactura}
          </p>
          <p className="truncate text-xs text-slate-600">{invoice.proveedorNombre}</p>
        </div>
        {adjusted ? (
          <Badge className="shrink-0 border-0 bg-violet-100 text-violet-800 hover:bg-violet-100">
            Ajustada
          </Badge>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="font-medium text-slate-500">Total factura</p>
          <p className="mt-0.5 font-semibold tabular-nums text-slate-900">
            {formatCOP(invoice.totalFactura)}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="font-medium text-slate-500">Valor contable</p>
          <p className="mt-0.5 font-semibold tabular-nums text-slate-900">
            {formatCOP(effectiveValor)}
          </p>
          {adjusted && effectiveValor !== invoice.valor ? (
            <p className="mt-0.5 text-[10px] tabular-nums text-slate-500 line-through">
              {formatCOP(invoice.valor)}
            </p>
          ) : null}
        </div>
      </div>

      <ValorContableInput
        moneda={invoice.moneda}
        total={invoice.totalFactura}
        value={effectiveDraft.valorContableNuevo}
        onChange={(valorContableNuevo) => {
          const base = draft ?? buildInitialValorContableDraft(invoice);
          const copiedDistribucion = base.centrosCostoDistribucion.map((row) => ({ ...row }));
          onDraftChange({
            ...base,
            valorContableNuevo,
            centrosCostoDistribucion: copiedDistribucion,
          });
        }}
      />

      <CentroCostoDistribucionEditor
        empresa={empresaId}
        total={effectiveDraft.valorContableNuevo}
        value={effectiveDraft.centrosCostoDistribucion}
        onChange={updateDistribucion}
      />

      {balance.remaining !== 0 ? (
        <p className="text-xs font-medium text-amber-700">
          {balance.remaining > 0
            ? `Faltan ${formatCOP(balance.remaining)} por distribuir.`
            : `Excedente de ${formatCOP(Math.abs(balance.remaining))} en la distribución.`}
        </p>
      ) : null}

      {!valid && draft ? (
        <p className="text-xs font-medium text-red-600">
          El valor debe ser un entero mayor o igual a $1 COP y la distribución debe cuadrar.
        </p>
      ) : null}

      {adjusted ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 w-full rounded-lg"
          onClick={onRestore}
        >
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          Restaurar valor
        </Button>
      ) : null}
    </div>
  );
}
