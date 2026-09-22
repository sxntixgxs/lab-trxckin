"use client";

import { useEffect, useState } from "react";

import {
  formatValorContableInput,
  parseValorContableInput,
} from "../lib/valor-contable";

export function ValorContableInput({
  moneda,
  total,
  value,
  onChange,
  className,
  persistBeforeCruce = false,
}: {
  moneda: string;
  total: number;
  value: number;
  onChange: (value: number) => void;
  className?: string;
  persistBeforeCruce?: boolean;
}) {
  const [displayValue, setDisplayValue] = useState(() =>
    formatValorContableInput(value, moneda),
  );

  useEffect(() => {
    setDisplayValue(formatValorContableInput(value, moneda));
  }, [moneda, value]);

  return (
    <div
      className={
        className ??
        "rounded-xl border border-violet-200 bg-violet-50/60 p-4"
      }
    >
      <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-700">
        Valor contable a pagar
      </p>
      <p className="mt-1 text-xs text-violet-800">
        {persistBeforeCruce
          ? "Se guardará antes de abrir el cruce de anticipos o al aplicar la acción de fase. Total XML:"
          : "Se guardará al aplicar la acción de fase. Total XML:"}{" "}
        {formatValorContableInput(total, moneda)}.
      </p>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        className="mt-3 h-11 w-full rounded-lg border border-violet-200 bg-white px-3 text-lg font-semibold tabular-nums text-slate-950 outline-hidden transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
        value={displayValue}
        onChange={(event) => {
          const raw = event.target.value;
          const parsed = parseValorContableInput(raw);

          if (parsed === null) {
            setDisplayValue("");
            return;
          }

          setDisplayValue(formatValorContableInput(parsed, moneda));
          onChange(parsed);
        }}
        onBlur={() => {
          if (!displayValue) {
            setDisplayValue(formatValorContableInput(value, moneda));
          }
        }}
      />
    </div>
  );
}
