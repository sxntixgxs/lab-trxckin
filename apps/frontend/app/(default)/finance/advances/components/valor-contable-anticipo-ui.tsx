import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatterCOP } from "../dashboard/constants";
import {
  type AnticipoValorContableInput,
  formatValorContableInput,
  getValorContableAnticipo,
  parseValorContableInput,
  valorContableAnticipoDiffiereDelSolicitado,
} from "../lib/valor-contable-anticipo";

export type ValorContableCambioAnticipo = {
  valorAnterior: number;
  valorNuevo: number;
};

export function ValorContableCambioAnticipoBadge({
  cambio,
}: {
  cambio: ValorContableCambioAnticipo;
}) {
  return (
    <Badge className="mt-2 gap-1 rounded-full border-0 bg-violet-100 px-2.5 py-1 text-[11px] font-semibold text-violet-800 hover:bg-violet-100">
      Valor contable: {formatterCOP.format(cambio.valorAnterior)}
      <ArrowRight className="h-3 w-3" />
      {formatterCOP.format(cambio.valorNuevo)}
    </Badge>
  );
}

function AmountCard({
  label,
  value,
  highlight,
  action,
  editable,
  editableValue,
  onEditableChange,
  helperText,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  action?: ReactNode;
  editable?: boolean;
  editableValue?: number;
  onEditableChange?: (value: number) => void;
  helperText?: string;
}) {
  return (
    <div
      className={`rounded-lg border p-3 ${
        highlight
          ? "border-violet-200 bg-violet-50"
          : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          {label}
        </p>
        {action}
      </div>
      {editable && editableValue !== undefined && onEditableChange ? (
        <div className="mt-2 space-y-1.5">
          <Input
            id="anticipo-valor-contable"
            inputMode="numeric"
            value={formatValorContableInput(editableValue)}
            onChange={(event) => {
              const parsed = parseValorContableInput(event.target.value);
              if (parsed !== null) onEditableChange(parsed);
            }}
            className="h-9 bg-white text-sm font-semibold"
          />
          {helperText && (
            <p className="text-[11px] text-slate-500">{helperText}</p>
          )}
        </div>
      ) : (
        <p
          className={`mt-1 text-sm font-semibold ${
            highlight ? "text-violet-900" : "text-slate-900"
          }`}
        >
          {value}
        </p>
      )}
    </div>
  );
}

export function AnticipoAmountsHeader({
  anticipo,
  editable,
  draftValue,
  onDraftChange,
}: {
  anticipo: AnticipoValorContableInput;
  editable?: boolean;
  draftValue?: number;
  onDraftChange?: (value: number) => void;
}) {
  const valorSolicitado = anticipo.valorNumerico;
  const valorActual = draftValue ?? getValorContableAnticipo(anticipo);
  const differs =
    valorActual !== valorSolicitado ||
    valorContableAnticipoDiffiereDelSolicitado(anticipo);

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <AmountCard
        label="Valor solicitado"
        value={formatterCOP.format(valorSolicitado)}
      />
      <AmountCard
        label="Valor contable"
        value={formatterCOP.format(valorActual)}
        highlight={editable ? differs : valorContableAnticipoDiffiereDelSolicitado(anticipo)}
        editable={editable && onDraftChange !== undefined}
        editableValue={editable ? valorActual : undefined}
        onEditableChange={onDraftChange}
        helperText={
          editable
            ? "El cambio se guardará al aprobar la revisión de contabilidad."
            : undefined
        }
      />
    </div>
  );
}

/** @deprecated Use AnticipoAmountsHeader with editable + onDraftChange instead */
export function AnticipoValorContableEditor({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor="anticipo-valor-contable-legacy">Valor contable</Label>
      <Input
        id="anticipo-valor-contable-legacy"
        inputMode="numeric"
        value={formatValorContableInput(value)}
        onChange={(event) => {
          const parsed = parseValorContableInput(event.target.value);
          if (parsed !== null) onChange(parsed);
        }}
        className="bg-white"
      />
      <p className="text-xs text-slate-500">
        El cambio se guardará al aprobar la revisión de contabilidad.
      </p>
    </div>
  );
}

export function AnticipoPagoAmount({
  anticipo,
}: {
  anticipo: AnticipoValorContableInput;
}) {
  const valorContable = getValorContableAnticipo(anticipo);
  const differs = valorContableAnticipoDiffiereDelSolicitado(anticipo);

  if (!differs) {
    return <span>{formatterCOP.format(anticipo.valorNumerico)}</span>;
  }

  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-1.5">
      <span className="font-semibold text-slate-900">
        {formatterCOP.format(valorContable)}
      </span>
      <span className="text-xs text-slate-400 line-through">
        {formatterCOP.format(anticipo.valorNumerico)}
      </span>
    </span>
  );
}
