import { useRef } from "react";
import { Loader2, UploadCloud } from "lucide-react";

import type { Doc } from "@/convex/_generated/dataModel";
import { Input } from "@/components/ui/input";
import { parseValorContableInput } from "../../../lib/valor-contable";
import { formatCurrency } from "../../../lib/utils";
import {
  getMaxMontoPagoParcial,
  getSaldoPendientePagoParcial,
  MAX_PAGO_PARCIAL_FILE_BYTES,
} from "./pago-parcial-utils";
import type { PagoParcialDraft } from "./types";

const montoCuotaFormatter = new Intl.NumberFormat("es-CO", {
  maximumFractionDigits: 0,
});

function formatMontoCuotaInput(monto: number | null | undefined) {
  if (monto === null || monto === undefined || !Number.isFinite(monto)) {
    return "";
  }
  return montoCuotaFormatter.format(Math.round(monto));
}

export function PagoParcialActionFields({
  draft,
  onChange,
  uploading,
  totalPagado,
  valorBase,
  moneda,
  factura,
  onUploadFiles,
}: {
  draft: PagoParcialDraft;
  onChange: (next: PagoParcialDraft) => void;
  uploading: boolean;
  totalPagado: number;
  valorBase: number;
  moneda: string;
  factura?: Pick<
    Doc<"facturacionFacturas">,
    "total" | "valorContable" | "valorAPagar" | "moneda" | "esLegalizacionAnticipo"
  > | null;
  onUploadFiles: (files: FileList | null) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const maxMonto = factura
    ? getMaxMontoPagoParcial(factura, totalPagado)
    : getMaxMontoPagoParcial(
        { total: valorBase, valorContable: valorBase, moneda, esLegalizacionAnticipo: false },
        totalPagado,
      );
  const saldo = getSaldoPendientePagoParcial(
    factura ?? { total: valorBase, valorContable: valorBase, moneda },
    totalPagado,
  );
  const saldoTrasPago =
    draft.monto && draft.monto > 0
      ? Math.max(0, saldo - draft.monto)
      : saldo;

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-950">
        <div className="grid gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-600">Saldo actual</span>
            <span className="font-semibold tabular-nums">
              {formatCurrency(saldo, moneda)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-600">Total pagado</span>
            <span className="font-semibold tabular-nums">
              {formatCurrency(totalPagado, moneda)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-sky-200/80 pt-2">
            <span className="font-medium text-slate-700">Saldo estimado tras pago</span>
            <span className="font-semibold tabular-nums">
              {formatCurrency(saldoTrasPago, moneda)}
            </span>
          </div>
        </div>
      </div>

      <div className="grid gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Monto de la cuota
        </p>
        <Input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={formatMontoCuotaInput(draft.monto)}
          disabled={maxMonto <= 0}
          onChange={(event) => {
            const raw = event.target.value;
            if (!raw.trim()) {
              onChange({ ...draft, monto: null });
              return;
            }
            const parsed = parseValorContableInput(raw);
            if (parsed !== null && parsed >= 0) {
              onChange({
                ...draft,
                monto: maxMonto > 0 ? Math.min(parsed, maxMonto) : 0,
              });
            }
          }}
          placeholder="0"
          className="h-11 rounded-xl tabular-nums"
        />
        <p className="text-xs text-slate-500">
          {maxMonto > 0 ? (
            <>
              Máximo permitido:{" "}
              <span className="font-semibold tabular-nums text-slate-700">
                {formatCurrency(maxMonto, moneda)}
              </span>{" "}
              (valor contable menos pagos ya registrados).
            </>
          ) : (
            "No queda saldo pendiente por registrar en pagos parciales."
          )}
        </p>
      </div>

      <div className="grid gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Comprobante (obligatorio)
        </p>
        <label
          className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-4 text-left transition hover:border-slate-400 hover:bg-slate-50"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            onUploadFiles(event.dataTransfer.files);
          }}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white shadow-xs">
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
            ) : (
              <UploadCloud className="h-4 w-4 text-slate-500" />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-slate-700">
              {draft.nombre ?? "Arrastra o haz clic para adjuntar"}
            </span>
            <span className="block text-xs text-slate-500">
              Máximo {MAX_PAGO_PARCIAL_FILE_BYTES / (1024 * 1024)}MB
            </span>
          </span>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            disabled={uploading}
            onChange={(event) => {
              onUploadFiles(event.target.files);
              if (fileInputRef.current) fileInputRef.current.value = "";
            }}
          />
        </label>
      </div>
    </div>
  );
}
