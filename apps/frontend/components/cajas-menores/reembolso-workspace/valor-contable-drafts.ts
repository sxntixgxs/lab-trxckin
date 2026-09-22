import {
  createDefaultDistribucion,
  isDistribucionValid,
  toLegacyCentroCosto,
  type CentroCostoDistribucionRow,
} from "@/lib/cajas-menores/centros-costo-distribucion";

import type { ReembolsoInvoiceItem } from "./types";

export const FASES_EDICION_VALOR_CONTABLE_REEMBOLSO = [
  "pendiente_revision",
  "pendiente_revision_impuestos",
  "pendiente_eventos_dian",
] as const;

export type FaseEdicionValorContableReembolso =
  (typeof FASES_EDICION_VALOR_CONTABLE_REEMBOLSO)[number];

export type ValorContableDraft = {
  valorContableNuevo: number;
  centroCostoId?: string;
  centroCostoCodigo: string;
  centroCostoNombre: string;
  centrosCostoDistribucion: CentroCostoDistribucionRow[];
};

export type AjusteValorContablePayload = {
  movimientoId: string;
  valorContableNuevo: number;
  centroCostoId?: string;
  centroCostoCodigo: string;
  centroCostoNombre: string;
  centrosCostoDistribucion: CentroCostoDistribucionRow[];
};

export function puedeEditarValorContableReembolso(
  fase: string,
): fase is FaseEdicionValorContableReembolso {
  return (FASES_EDICION_VALOR_CONTABLE_REEMBOLSO as readonly string[]).includes(fase);
}

export function buildCentroCostoDraftFromInvoice(
  invoice: Pick<
    ReembolsoInvoiceItem,
    "valor" | "centroCostoCodigo" | "centroCostoNombre" | "centrosCostoDistribucion"
  >,
  valorObjetivo: number,
): CentroCostoDistribucionRow[] {
  return createDefaultDistribucion(valorObjetivo, {
    centroCostoCodigo: invoice.centroCostoCodigo,
    centroCostoNombre: invoice.centroCostoNombre,
    centrosCostoDistribucion: invoice.centrosCostoDistribucion,
  });
}

export function buildInitialValorContableDraft(
  invoice: ReembolsoInvoiceItem,
): ValorContableDraft {
  const distribucion = buildCentroCostoDraftFromInvoice(invoice, invoice.valor);
  const legacy = toLegacyCentroCosto(distribucion);
  return {
    valorContableNuevo: invoice.valor,
    centroCostoCodigo: legacy.centroCostoCodigo,
    centroCostoNombre: legacy.centroCostoNombre,
    centroCostoId: legacy.centroCostoId,
    centrosCostoDistribucion: distribucion,
  };
}

export function initializeValorContableDrafts(
  invoices: ReembolsoInvoiceItem[],
): Record<string, ValorContableDraft | undefined> {
  const drafts: Record<string, ValorContableDraft | undefined> = {};
  for (const invoice of invoices) {
    drafts[invoice.movimientoId] = undefined;
  }
  return drafts;
}

export function getEffectiveValor(
  invoice: ReembolsoInvoiceItem,
  drafts: Record<string, ValorContableDraft | undefined>,
): number {
  return drafts[invoice.movimientoId]?.valorContableNuevo ?? invoice.valor;
}

export function invoiceTieneBorradorAjustado(
  invoice: ReembolsoInvoiceItem,
  draft: ValorContableDraft | undefined,
): boolean {
  if (!draft) return false;
  if (draft.valorContableNuevo !== invoice.valor) return true;
  const savedDistribucion = buildCentroCostoDraftFromInvoice(invoice, invoice.valor);
  return !distribucionesEquivalentes(savedDistribucion, draft.centrosCostoDistribucion);
}

export function distribucionesEquivalentes(
  left: CentroCostoDistribucionRow[],
  right: CentroCostoDistribucionRow[],
) {
  if (left.length !== right.length) return false;
  return left.every((row, index) => {
    const other = right[index];
    if (!other) return false;
    return (
      row.centroCostoCodigo === other.centroCostoCodigo &&
      row.centroCostoNombre === other.centroCostoNombre &&
      row.valor === other.valor &&
      (row.centroCostoId ?? "") === (other.centroCostoId ?? "")
    );
  });
}

export function isValorContableDraftValid(
  draft: ValorContableDraft | undefined,
): boolean {
  if (!draft) return true;
  if (
    !Number.isFinite(draft.valorContableNuevo) ||
    !Number.isInteger(draft.valorContableNuevo) ||
    draft.valorContableNuevo < 1
  ) {
    return false;
  }
  return isDistribucionValid(draft.valorContableNuevo, draft.centrosCostoDistribucion);
}

export function countInvalidValorContableDrafts(
  invoices: ReembolsoInvoiceItem[],
  drafts: Record<string, ValorContableDraft | undefined>,
): number {
  let invalid = 0;
  for (const invoice of invoices) {
    const draft = drafts[invoice.movimientoId];
    if (draft && !isValorContableDraftValid(draft)) {
      invalid += 1;
    }
  }
  return invalid;
}

export function hasValorContableDraftChanges(
  invoices: ReembolsoInvoiceItem[],
  drafts: Record<string, ValorContableDraft | undefined>,
): boolean {
  return invoices.some((invoice) =>
    invoiceTieneBorradorAjustado(invoice, drafts[invoice.movimientoId]),
  );
}

export function countFacturasAjustadas(
  invoices: ReembolsoInvoiceItem[],
  drafts: Record<string, ValorContableDraft | undefined>,
): number {
  return invoices.filter((invoice) =>
    invoiceTieneBorradorAjustado(invoice, drafts[invoice.movimientoId]),
  ).length;
}

export function computeReembolsoTotalConBorradores(
  invoices: ReembolsoInvoiceItem[],
  drafts: Record<string, ValorContableDraft | undefined>,
): number {
  return invoices.reduce(
    (total, invoice) => total + Math.max(0, getEffectiveValor(invoice, drafts)),
    0,
  );
}

export function buildAjustesValorContablePayload(
  invoices: ReembolsoInvoiceItem[],
  drafts: Record<string, ValorContableDraft | undefined>,
): AjusteValorContablePayload[] {
  const payload: AjusteValorContablePayload[] = [];
  for (const invoice of invoices) {
    const draft = drafts[invoice.movimientoId];
    if (!draft || !invoiceTieneBorradorAjustado(invoice, draft)) continue;
    payload.push({
      movimientoId: invoice.movimientoId,
      valorContableNuevo: draft.valorContableNuevo,
      centroCostoId: draft.centroCostoId,
      centroCostoCodigo: draft.centroCostoCodigo,
      centroCostoNombre: draft.centroCostoNombre,
      centrosCostoDistribucion: draft.centrosCostoDistribucion,
    });
  }
  return payload;
}

export function requiresComentarioForAjustes(
  invoices: ReembolsoInvoiceItem[],
  drafts: Record<string, ValorContableDraft | undefined>,
  comentario: string,
): boolean {
  if (!hasValorContableDraftChanges(invoices, drafts)) return false;
  return !comentario.trim();
}

export type ConfirmacionAjustesResumen = {
  valorAnterior: number;
  valorNuevo: number;
  facturasAjustadas: number;
  incluyeAjustes: boolean;
};

export function getConfirmacionAjustesResumen(args: {
  valorTotalOriginal: number;
  invoices: ReembolsoInvoiceItem[];
  drafts: Record<string, ValorContableDraft | undefined>;
}): ConfirmacionAjustesResumen {
  const facturasAjustadas = countFacturasAjustadas(args.invoices, args.drafts);
  const valorNuevo = computeReembolsoTotalConBorradores(args.invoices, args.drafts);
  return {
    valorAnterior: args.valorTotalOriginal,
    valorNuevo,
    facturasAjustadas,
    incluyeAjustes: facturasAjustadas > 0,
  };
}

export function restoreValorContableDraft(
  invoice: ReembolsoInvoiceItem,
): undefined {
  return undefined;
}

export function upsertValorContableDraft(
  current: ValorContableDraft | undefined,
  invoice: ReembolsoInvoiceItem,
  patch: Partial<ValorContableDraft>,
): ValorContableDraft {
  const base = current ?? buildInitialValorContableDraft(invoice);
  const nextValor = patch.valorContableNuevo ?? base.valorContableNuevo;
  const nextDistribucion =
    patch.centrosCostoDistribucion ??
    (patch.valorContableNuevo !== undefined &&
    patch.valorContableNuevo !== base.valorContableNuevo
      ? buildCentroCostoDraftFromInvoice(invoice, nextValor)
      : base.centrosCostoDistribucion);
  const legacy = toLegacyCentroCosto(nextDistribucion);
  return {
    valorContableNuevo: nextValor,
    centrosCostoDistribucion: nextDistribucion,
    centroCostoCodigo: patch.centroCostoCodigo ?? legacy.centroCostoCodigo,
    centroCostoNombre: patch.centroCostoNombre ?? legacy.centroCostoNombre,
    centroCostoId: patch.centroCostoId ?? legacy.centroCostoId,
  };
}
