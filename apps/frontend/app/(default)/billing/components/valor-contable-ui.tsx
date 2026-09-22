import { type ReactNode, type RefObject } from "react";
import { ArrowRight, Pencil } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Doc } from "@/convex/_generated/dataModel";
import { formatCurrency } from "../lib/utils";
import {
  getValorContable,
  puedeEditarValorContable,
  valorContableDiffiereDelTotal,
} from "../lib/valor-contable";
import {
  getValorAPagarDisplay,
  shouldShowValorAPagar,
} from "../lib/valor-a-pagar";
import { ValorContableInput } from "./valor-contable-input";

export function ValorContableCambioBadge({
  cambio,
}: {
  cambio: NonNullable<Doc<"facturacionAprobaciones">["valorContableCambio"]>;
}) {
  return (
    <Badge className="mt-2 gap-1 rounded-full border-0 bg-violet-100 px-2.5 py-1 text-[11px] font-semibold text-violet-800 hover:bg-violet-100">
      Valor contable: {formatCurrency(cambio.valorAnterior, cambio.moneda)}
      <ArrowRight className="h-3 w-3" />
      {formatCurrency(cambio.valorNuevo, cambio.moneda)}
    </Badge>
  );
}

export function FacturaAmountsHeader({
  factura,
  fase,
  mode,
  draftValue,
  savedDraft,
  onFocusEditor,
  valorDocumentosInternos,
  valorAnticiposAplicados,
  pagosAplicados,
  valorAPagarEstimado,
}: {
  factura: Doc<"facturacionFacturas"> | null | undefined;
  fase: string;
  mode: "joint" | "individual";
  draftValue?: number;
  savedDraft?: boolean;
  onFocusEditor?: () => void;
  valorDocumentosInternos?: number;
  valorAnticiposAplicados?: number;
  pagosAplicados?: number;
  valorAPagarEstimado?: number | null;
}) {
  if (!factura) return null;

  const total = factura.total;
  const valorActual = draftValue ?? getValorContable(factura);
  const editable = puedeEditarValorContable(fase, factura);
  const canEdit = editable && mode === "individual";
  const differs =
    valorActual !== total || valorContableDiffiereDelTotal(factura);
  const valorAPagar =
    valorAPagarEstimado ??
    getValorAPagarDisplay({
      factura,
      fase,
      valorContableDraft: draftValue,
      valorDocumentosInternos,
      valorAnticiposAplicados,
      pagosAplicados,
    });
  const showValorAPagar = shouldShowValorAPagar(fase, factura);

  return (
    <div
      className={`mt-4 grid gap-3 ${showValorAPagar ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}
    >
      <AmountCard label="Total factura" value={formatCurrency(total, factura.moneda)} />
      <AmountCard
        label="Valor contable"
        value={formatCurrency(valorActual, factura.moneda)}
        highlight={differs || savedDraft}
        savedDraft={savedDraft}
        action={
          editable ? (
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-lg text-slate-500"
                      disabled={!canEdit}
                      onClick={onFocusEditor}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {canEdit
                    ? "Editar valor contable en el panel derecho"
                    : "Solo editable en revisión individual"}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : null
        }
      />
      {showValorAPagar && valorAPagar !== null ? (
        <AmountCard
          label={
            draftValue !== undefined && draftValue !== getValorContable(factura)
              ? "Valor a pagar (estimado)"
              : "Valor a pagar"
          }
          value={formatCurrency(valorAPagar, factura.moneda)}
          highlight={draftValue !== undefined && draftValue !== getValorContable(factura)}
        />
      ) : null}
    </div>
  );
}

export function ValorContableEditorPanel({
  factura,
  fase,
  mode,
  value,
  onChange,
  editorRef,
  persistBeforeCruce = false,
}: {
  factura: Doc<"facturacionFacturas"> | null | undefined;
  fase: string;
  mode: "joint" | "individual";
  value: number;
  onChange: (value: number) => void;
  editorRef?: RefObject<HTMLDivElement | null>;
  persistBeforeCruce?: boolean;
}) {
  if (!factura || !puedeEditarValorContable(fase, factura) || mode !== "individual") {
    return null;
  }

  return (
    <div ref={editorRef} className="mt-5 grid gap-2">
      <ValorContableInput
        moneda={factura.moneda}
        total={factura.total}
        value={value}
        onChange={onChange}
        persistBeforeCruce={persistBeforeCruce}
      />
    </div>
  );
}

export function FacturaPagoAmount({
  factura,
  fase,
  className,
  size = "sm",
  valorContableDraft,
  valorDocumentosInternos,
  valorAnticiposAplicados,
  pagosAplicados,
}: {
  factura: Pick<
    Doc<"facturacionFacturas">,
    | "total"
    | "valorContable"
    | "valorAPagar"
    | "moneda"
    | "esLegalizacionAnticipo"
    | "esPeaje"
    | "rolOperacion"
    | "esLegalizacionCajaMenor"
    | "valorCrucesDocumentosInternos"
  >;
  fase?: string;
  className?: string;
  size?: "sm" | "lg";
  valorContableDraft?: number;
  valorDocumentosInternos?: number;
  valorAnticiposAplicados?: number;
  pagosAplicados?: number;
}) {
  const total = factura.total;
  const valorContable = valorContableDraft ?? getValorContable(factura);
  const differs = valorContable !== total;
  const showValorAPagar =
    fase !== undefined && shouldShowValorAPagar(fase, factura);
  const valorAPagar = showValorAPagar
    ? getValorAPagarDisplay({
        factura,
        fase,
        valorContableDraft,
        valorDocumentosInternos,
        valorAnticiposAplicados,
        pagosAplicados,
      })
    : null;
  const showSecondary =
    showValorAPagar &&
    valorAPagar !== null &&
    factura.valorAPagar !== undefined;

  const primaryClass =
    size === "lg"
      ? "text-3xl font-semibold tabular-nums text-slate-950"
      : "text-base font-semibold tabular-nums text-slate-950";
  const secondaryClass =
    size === "lg"
      ? "mt-0.5 text-lg font-semibold tabular-nums text-emerald-700"
      : "mt-0.5 text-sm font-semibold tabular-nums text-emerald-700";
  const adjustedPrimaryClass =
    !showSecondary && differs
      ? size === "lg"
        ? "text-3xl font-semibold tabular-nums text-emerald-700"
        : "font-semibold tabular-nums text-emerald-700"
      : primaryClass;

  return (
    <span className={`inline-flex flex-col items-end ${className ?? ""}`}>
      {showSecondary ? (
        <span className={primaryClass}>
          {formatCurrency(valorContable, factura.moneda)}
        </span>
      ) : !differs ? (
        <span className={primaryClass}>
          {formatCurrency(total, factura.moneda)}
        </span>
      ) : (
        <>
          <span className={adjustedPrimaryClass}>
            {formatCurrency(valorContable, factura.moneda)}
          </span>
          <span className="text-[10px] text-slate-500 line-through">
            {formatCurrency(total, factura.moneda)}
          </span>
        </>
      )}
      {showSecondary ? (
        <span className={secondaryClass}>
          {formatCurrency(valorAPagar, factura.moneda)}
        </span>
      ) : null}
    </span>
  );
}

function AmountCard({
  label,
  value,
  highlight,
  savedDraft,
  action,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  savedDraft?: boolean;
  action?: ReactNode;
}) {
  return (
    <div
      className={`rounded-xl border px-4 py-3 ${
        savedDraft
          ? "border-violet-300 bg-violet-50"
          : highlight
            ? "border-violet-200 bg-violet-50/70"
            : "border-slate-200 bg-slate-50/70"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            {label}
          </p>
          {savedDraft ? (
            <Badge className="h-5 rounded-full border-0 bg-violet-200 px-2 text-[10px] font-semibold text-violet-900 hover:bg-violet-200">
              Guardado
            </Badge>
          ) : null}
        </div>
        {action}
      </div>
      <p
        className={`mt-1 text-2xl font-semibold tabular-nums ${
          highlight || savedDraft ? "text-violet-700" : "text-slate-950"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
