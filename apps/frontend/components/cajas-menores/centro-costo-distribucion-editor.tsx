"use client";

import { useState } from "react";
import { ChevronDown, PencilLine, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CentroCostoSiesaAsyncSelect } from "@/components/cajas-menores/centro-costo-siesa-async-select";
import {
  MAX_CENTROS_COSTO_DISTRIBUCION,
  type CentroCostoDistribucionRow,
  getDistribucionBalance,
  getDistribucionPercent,
  isDistribucionValid,
  roundCOP,
} from "@/lib/cajas-menores/centros-costo-distribucion";
import { formatCOP } from "@/lib/format";
import { cn } from "@/lib/utils";

type EditorProps = {
  total: number;
  value: CentroCostoDistribucionRow[];
  empresa: number | null | undefined;
  disabled?: boolean;
  onChange: (next: CentroCostoDistribucionRow[]) => void;
  compact?: boolean;
  forcePopover?: boolean;
  showHeader?: boolean;
  maxListHeight?: string;
};

function getBalanceStatus(total: number, value: CentroCostoDistribucionRow[]) {
  const { assigned, remaining } = getDistribucionBalance(total, value);
  const balanced = remaining === 0 && isDistribucionValid(total, value);

  if (balanced) {
    return {
      label: "Cuadra",
      tone: "balanced" as const,
      assigned,
      remaining,
    };
  }

  if (remaining > 0) {
    return {
      label: `Faltan ${formatCOP(remaining)}`,
      tone: "short" as const,
      assigned,
      remaining,
    };
  }

  return {
    label: `Excede ${formatCOP(Math.abs(remaining))}`,
    tone: "over" as const,
    assigned,
    remaining,
  };
}

const BALANCE_TONE_CLASSES = {
  balanced: "text-emerald-700 bg-emerald-50 ring-emerald-100",
  short: "text-amber-700 bg-amber-50 ring-amber-100",
  over: "text-rose-700 bg-rose-50 ring-rose-100",
} as const;

function DistribucionBalanceSummary({
  total,
  value,
  className,
}: {
  total: number;
  value: CentroCostoDistribucionRow[];
  className?: string;
}) {
  const status = getBalanceStatus(total, value);

  return (
    <div className={cn("text-xs", className)}>
      <span className="text-slate-500">
        Asignado:{" "}
        <span className="font-semibold tabular-nums text-slate-800">
          {formatCOP(status.assigned)}
        </span>
      </span>
      <span className="mx-2 text-slate-300">·</span>
      <span
        className={cn(
          "font-semibold tabular-nums",
          status.tone === "balanced"
            ? "text-emerald-700"
            : status.tone === "short"
              ? "text-amber-700"
              : "text-rose-700",
        )}
      >
        {status.label}
      </span>
    </div>
  );
}

function DistribucionEditorCore({
  total,
  value,
  empresa,
  disabled,
  onChange,
  compact = false,
  showHeader = true,
  maxListHeight,
}: EditorProps) {
  const { remaining } = getDistribucionBalance(total, value);
  const canAddRow = value.length < MAX_CENTROS_COSTO_DISTRIBUCION && !disabled;

  function patchRow(index: number, patch: Partial<CentroCostoDistribucionRow>) {
    onChange(
      value.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row,
      ),
    );
  }

  function addRow() {
    if (!canAddRow) return;
    onChange([
      ...value,
      {
        centroCostoCodigo: "",
        centroCostoNombre: "",
        valor: Math.max(0, remaining),
      },
    ]);
  }

  function removeRow(index: number) {
    if (value.length <= 1 || disabled) return;
    onChange(value.filter((_, rowIndex) => rowIndex !== index));
  }

  return (
    <div
      className={cn(
        "space-y-2",
        !compact && "rounded-xl border border-slate-200 bg-white p-3",
      )}
    >
      {showHeader && !compact ? (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Distribución por centro de costo
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Divide el valor del movimiento entre uno o más centros de costo.
          </p>
        </div>
      ) : null}

      <div
        className={cn("space-y-1.5", maxListHeight && "overflow-y-auto pr-1")}
        style={maxListHeight ? { maxHeight: maxListHeight } : undefined}
      >
        {value.map((row, index) => {
          const selectedValue = row.centroCostoCodigo
            ? `${row.centroCostoCodigo}||${row.centroCostoNombre}`
            : "";
          return (
            <div
              key={`${index}-${selectedValue}`}
              className={cn(
                "grid items-center gap-1.5 rounded-lg border border-slate-100 bg-slate-50/70 p-1.5",
                compact
                  ? "grid-cols-[minmax(0,1fr)_96px_32px]"
                  : "grid-cols-[minmax(0,1fr)_120px_36px]",
              )}
            >
              <CentroCostoSiesaAsyncSelect
                className="min-w-0"
                empresa={empresa}
                value={
                  row.centroCostoCodigo
                    ? {
                        id: row.centroCostoId,
                        codigo: row.centroCostoCodigo,
                        nombre: row.centroCostoNombre,
                      }
                    : null
                }
                disabled={disabled}
                onValueChange={(nextValue) => {
                  patchRow(index, {
                    centroCostoId: nextValue.id,
                    centroCostoCodigo: nextValue.codigo,
                    centroCostoNombre: nextValue.nombre,
                  });
                }}
              />
              <input
                type="number"
                min={0}
                step={1}
                disabled={disabled}
                className={cn(
                  "min-w-0 rounded-lg border border-slate-200 bg-white px-2 text-sm tabular-nums text-slate-900 outline-hidden transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100",
                  compact ? "h-9" : "h-10",
                )}
                value={row.valor || ""}
                onChange={(event) =>
                  patchRow(index, {
                    valor: roundCOP(Number(event.target.value) || 0),
                  })
                }
                placeholder="Valor"
                aria-label={`Valor para ${row.centroCostoCodigo || "centro de costo"}`}
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className={cn(
                  "shrink-0 text-slate-400 hover:text-rose-600",
                  compact ? "h-9 w-8" : "h-10 w-10",
                )}
                disabled={disabled || value.length <= 1}
                onClick={() => removeRow(index)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 rounded-lg"
          disabled={!canAddRow}
          onClick={addRow}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Agregar centro
        </Button>
        <DistribucionBalanceSummary total={total} value={value} />
      </div>
    </div>
  );
}

function CompactDistribucionSummary({
  total,
  value,
}: {
  total: number;
  value: CentroCostoDistribucionRow[];
}) {
  const status = getBalanceStatus(total, value);
  const completeRows = value.filter(
    (row) => row.centroCostoCodigo && row.valor > 0,
  );

  if (value.length === 1) {
    const row = value[0]!;
    return (
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-900">
          {row.centroCostoCodigo
            ? `${row.centroCostoCodigo} · ${row.centroCostoNombre}`
            : "Sin centro de costo"}
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-xs tabular-nums text-slate-500">
            {formatCOP(row.valor || 0)}
          </span>
          <span
            className={cn(
              "inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset",
              BALANCE_TONE_CLASSES[status.tone],
            )}
          >
            {status.label}
          </span>
        </div>
      </div>
    );
  }

  const previewRows = completeRows.slice(0, 2);
  const hiddenCount = Math.max(0, completeRows.length - previewRows.length);

  return (
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
          {value.length} centros
        </span>
        {previewRows.map((row, index) => (
          <span
            key={`${row.centroCostoCodigo}-${index}`}
            className="truncate text-xs font-medium text-slate-800"
          >
            {row.centroCostoCodigo}
            {index < previewRows.length - 1 || hiddenCount > 0 ? "," : ""}
          </span>
        ))}
        {hiddenCount > 0 ? (
          <span className="text-[10px] font-medium text-slate-500">
            +{hiddenCount}
          </span>
        ) : null}
      </div>
      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span className="text-xs tabular-nums text-slate-500">
          {formatCOP(status.assigned)} / {formatCOP(total)}
        </span>
        <span
          className={cn(
            "inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset",
            BALANCE_TONE_CLASSES[status.tone],
          )}
        >
          {status.label}
        </span>
      </div>
      {completeRows.length === 0 ? (
        <p className="mt-0.5 text-[11px] text-slate-400">Completa la distribución</p>
      ) : completeRows.length <= 2 ? (
        <div className="mt-1 space-y-0.5">
          {completeRows.map((row, index) => (
            <p
              key={`${row.centroCostoCodigo}-${index}`}
              className="truncate text-[11px] text-slate-500"
            >
              {row.centroCostoCodigo} · {formatCOP(row.valor)} (
              {getDistribucionPercent(row.valor, total).toFixed(0)}%)
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CompactDistribucionPopover(props: EditorProps) {
  const [open, setOpen] = useState(false);
  const status = getBalanceStatus(props.total, props.value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={props.disabled}
          aria-expanded={open}
          aria-label="Editar centro de costo"
          className={cn(
            "flex w-full items-start gap-2 rounded-lg border bg-white px-2 py-1.5 text-left transition",
            "hover:border-teal-300 hover:bg-teal-50/30 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-teal-200",
            status.tone === "balanced"
              ? "border-slate-200"
              : status.tone === "short"
                ? "border-amber-200 bg-amber-50/20"
                : "border-rose-200 bg-rose-50/20",
            props.disabled && "cursor-not-allowed opacity-60",
          )}
        >
          <CompactDistribucionSummary total={props.total} value={props.value} />
          <span className="mt-0.5 inline-flex shrink-0 items-center gap-0.5 text-slate-500">
            <PencilLine className="h-3.5 w-3.5" aria-hidden />
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 transition-transform",
                open && "rotate-180",
              )}
              aria-hidden
            />
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={6}
        className="w-[min(540px,calc(100vw-2rem))] p-3"
      >
        <DistribucionEditorCore
          {...props}
          compact
          showHeader={false}
          maxListHeight="280px"
        />
      </PopoverContent>
    </Popover>
  );
}

export function CentroCostoDistribucionEditor(props: EditorProps) {
  const usePopover =
    props.compact &&
    (props.forcePopover || props.value.length >= 2);

  if (usePopover) {
    return <CompactDistribucionPopover {...props} />;
  }

  return <DistribucionEditorCore {...props} />;
}
