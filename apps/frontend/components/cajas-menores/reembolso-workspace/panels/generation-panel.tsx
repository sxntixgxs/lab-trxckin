"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, ReceiptText, UserCheck } from "lucide-react";

import { FacturacionUserPicker } from "@/app/(default)/billing/components/user-picker";
import type { FacturacionUsuario } from "@/app/(default)/billing/hooks/use-facturacion-users";
import { CentroCostoDistribucionEditor } from "@/components/cajas-menores/centro-costo-distribucion-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { formatCOP } from "@/lib/format";
import {
  isDistribucionValid,
  toLegacyCentroCosto,
  type CentroCostoDistribucionRow,
} from "@/lib/cajas-menores/centros-costo-distribucion";
import { cn } from "@/lib/utils";

import type { ReembolsoInvoiceItem } from "../types";

export type GenerationCentroDraft = {
  centroCostoId?: string;
  centroCostoCodigo: string;
  centroCostoNombre: string;
  centrosCostoDistribucion: CentroCostoDistribucionRow[];
};

export function ReembolsoGenerationPanel({
  invoice,
  invoices,
  centroDraft,
  onCentroChange,
  empresaId,
  requiereAprobacion,
  onRequiereAprobacionChange,
  aprobadorId,
  onAprobadorChange,
  usuarios,
  usuariosLoading,
  actorUserId,
  total,
  validDistribuciones,
  busy,
  onCancel,
  onGenerate,
}: {
  invoice: ReembolsoInvoiceItem | null;
  invoices: ReembolsoInvoiceItem[];
  centroDraft: GenerationCentroDraft | null;
  onCentroChange: (draft: GenerationCentroDraft) => void;
  empresaId?: number;
  requiereAprobacion: boolean;
  onRequiereAprobacionChange: (value: boolean) => void;
  aprobadorId: string | null;
  onAprobadorChange: (value: string | null) => void;
  usuarios: FacturacionUsuario[];
  usuariosLoading?: boolean;
  actorUserId?: string;
  total: number;
  validDistribuciones: number;
  busy?: boolean;
  onCancel: () => void;
  onGenerate: () => void;
}) {
  const [summaryOpen, setSummaryOpen] = useState(true);
  const aprobadores = usuarios.filter(
    (usuario) => usuario.activo && usuario.id !== actorUserId,
  );
  const allValid = validDistribuciones === invoices.length && invoices.length > 0;
  const generateDisabled =
    busy ||
    !allValid ||
    (requiereAprobacion && !aprobadorId);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 space-y-2 border-b border-slate-200 bg-slate-50/70 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-slate-950">Generar reembolso</p>
          <Badge
            variant="outline"
            className={cn(
              "tabular-nums",
              allValid
                ? "border-teal-200 bg-teal-50 text-teal-800"
                : "border-amber-200 bg-amber-50 text-amber-800",
            )}
          >
            {validDistribuciones}/{invoices.length} válidas
          </Badge>
        </div>
        <p className="text-xs text-slate-600">
          Edita el centro de costo de la factura activa. Generar aplica a todo el
          lote.
        </p>
        <p className="text-lg font-semibold tabular-nums text-slate-950">
          {formatCOP(total)}
        </p>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
        <button
          type="button"
          className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs font-semibold text-slate-700"
          onClick={() => setSummaryOpen((open) => !open)}
        >
          Factura activa
          {summaryOpen ? (
            <ChevronDown className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          )}
        </button>

        {summaryOpen && invoice ? (
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="text-sm font-semibold text-slate-900">
              #{invoice.numeroFactura}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">{invoice.proveedorNombre}</p>
            <p className="mt-2 line-clamp-3 text-sm text-slate-800">
              {invoice.observaciones?.trim() || invoice.concepto || "-"}
            </p>
            <p className="mt-2 text-sm font-semibold tabular-nums text-slate-900">
              {formatCOP(invoice.valor)}
            </p>
          </div>
        ) : null}

        {invoice && centroDraft ? (
          <div className="space-y-1.5">
            <Label className="text-xs">Centro de costo</Label>
            <CentroCostoDistribucionEditor
              total={invoice.valor}
              value={centroDraft.centrosCostoDistribucion}
              empresa={empresaId}
              disabled={busy}
              onChange={(centrosCostoDistribucion) => {
                const legacy = toLegacyCentroCosto(centrosCostoDistribucion);
                onCentroChange({
                  ...(legacy.centroCostoId
                    ? { centroCostoId: legacy.centroCostoId }
                    : {}),
                  centroCostoCodigo: legacy.centroCostoCodigo,
                  centroCostoNombre: legacy.centroCostoNombre,
                  centrosCostoDistribucion,
                });
              }}
            />
            {!isDistribucionValid(
              invoice.valor,
              centroDraft.centrosCostoDistribucion,
            ) ? (
              <p className="text-[11px] text-rose-700">
                Completa una distribución válida para esta factura.
              </p>
            ) : null}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-500">
            Selecciona una factura para editar su centro de costo.
          </p>
        )}

        <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3">
          <div className="flex items-start gap-2.5">
            <Checkbox
              id="ws-requiere-aprobacion-lider"
              checked={requiereAprobacion}
              disabled={busy}
              onCheckedChange={(checked) => {
                const next = checked === true;
                onRequiereAprobacionChange(next);
                if (!next) onAprobadorChange(null);
              }}
            />
            <div className="min-w-0 flex-1 space-y-2">
              <Label
                htmlFor="ws-requiere-aprobacion-lider"
                className="flex cursor-pointer items-center gap-1.5 text-sm font-semibold text-slate-950"
              >
                <UserCheck className="h-3.5 w-3.5 text-amber-700" aria-hidden />
                Aprobación líder (opcional)
              </Label>
              {requiereAprobacion ? (
                <FacturacionUserPicker
                  value={aprobadorId}
                  onChange={onAprobadorChange}
                  usuarios={aprobadores}
                  placeholder={
                    usuariosLoading
                      ? "Cargando usuarios..."
                      : "Selecciona líder aprobador..."
                  }
                  disabled={busy || usuariosLoading}
                />
              ) : (
                <p className="text-[11px] text-slate-500">
                  Activa si la solicitud debe pasar por un líder antes del revisor.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="shrink-0 space-y-2 border-t border-slate-200 bg-white px-4 py-3">
        <p className="text-[11px] font-medium text-slate-500">
          Acción del reembolso completo
        </p>
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-lg"
            disabled={busy}
            onClick={onCancel}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            size="sm"
            className="rounded-lg"
            disabled={generateDisabled}
            onClick={onGenerate}
          >
            <ReceiptText className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Generar {formatCOP(total)}
          </Button>
        </div>
      </div>
    </div>
  );
}
