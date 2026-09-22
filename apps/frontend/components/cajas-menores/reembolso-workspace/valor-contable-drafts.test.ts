import { describe, expect, it } from "vitest";

import type { ReembolsoInvoiceItem } from "./types";
import {
  buildAjustesValorContablePayload,
  buildInitialValorContableDraft,
  computeReembolsoTotalConBorradores,
  getConfirmacionAjustesResumen,
  getEffectiveValor,
  hasValorContableDraftChanges,
  initializeValorContableDrafts,
  invoiceTieneBorradorAjustado,
  isValorContableDraftValid,
  requiresComentarioForAjustes,
  restoreValorContableDraft,
  upsertValorContableDraft,
} from "./valor-contable-drafts";

function sampleInvoice(overrides: Partial<ReembolsoInvoiceItem> = {}): ReembolsoInvoiceItem {
  return {
    key: "mov-1",
    movimientoId: "mov-1",
    facturaId: "fact-1",
    numeroFactura: "FE123",
    proveedorNombre: "Proveedor",
    concepto: "Compra",
    valor: 100_000,
    totalFactura: 120_000,
    valorContable: 100_000,
    moneda: "COP",
    centroCostoCodigo: "CC-1",
    centroCostoNombre: "Centro Uno",
    centrosCostoDistribucion: [
      {
        centroCostoCodigo: "CC-1",
        centroCostoNombre: "Centro Uno",
        valor: 100_000,
      },
    ],
    documents: [],
    ...overrides,
  };
}

describe("valor contable drafts", () => {
  it("initializes empty drafts per movimiento", () => {
    const invoices = [sampleInvoice(), sampleInvoice({ movimientoId: "mov-2", key: "mov-2" })];
    const drafts = initializeValorContableDrafts(invoices);
    expect(Object.keys(drafts)).toEqual(["mov-1", "mov-2"]);
    expect(drafts["mov-1"]).toBeUndefined();
  });

  it("restores a draft to undefined", () => {
    expect(restoreValorContableDraft(sampleInvoice())).toBeUndefined();
  });

  it("persists draft values across invoices", () => {
    const invoices = [
      sampleInvoice(),
      sampleInvoice({ movimientoId: "mov-2", key: "mov-2", valor: 50_000 }),
    ];
    const drafts = initializeValorContableDrafts(invoices);
    drafts["mov-1"] = upsertValorContableDraft(undefined, invoices[0]!, {
      valorContableNuevo: 90_000,
    });
    drafts["mov-2"] = upsertValorContableDraft(undefined, invoices[1]!, {
      valorContableNuevo: 45_000,
    });
    expect(getEffectiveValor(invoices[0]!, drafts)).toBe(90_000);
    expect(getEffectiveValor(invoices[1]!, drafts)).toBe(45_000);
  });

  it("builds payload only for real changes", () => {
    const invoice = sampleInvoice();
    const drafts = initializeValorContableDrafts([invoice]);
    expect(buildAjustesValorContablePayload([invoice], drafts)).toEqual([]);

    drafts["mov-1"] = upsertValorContableDraft(undefined, invoice, {
      valorContableNuevo: 80_000,
      centrosCostoDistribucion: [
        {
          centroCostoCodigo: "CC-1",
          centroCostoNombre: "Centro Uno",
          valor: 80_000,
        },
      ],
    });
    const payload = buildAjustesValorContablePayload([invoice], drafts);
    expect(payload).toHaveLength(1);
    expect(payload[0]?.valorContableNuevo).toBe(80_000);
  });

  it("computes new reimbursement total", () => {
    const invoices = [
      sampleInvoice(),
      sampleInvoice({ movimientoId: "mov-2", key: "mov-2", valor: 50_000 }),
    ];
    const drafts = initializeValorContableDrafts(invoices);
    drafts["mov-1"] = upsertValorContableDraft(undefined, invoices[0]!, {
      valorContableNuevo: 90_000,
      centrosCostoDistribucion: [
        {
          centroCostoCodigo: "CC-1",
          centroCostoNombre: "Centro Uno",
          valor: 90_000,
        },
      ],
    });
    expect(computeReembolsoTotalConBorradores(invoices, drafts)).toBe(140_000);
  });

  it("validates distribution against draft value", () => {
    const invoice = sampleInvoice();
    const invalid = upsertValorContableDraft(undefined, invoice, {
      valorContableNuevo: 80_000,
      centrosCostoDistribucion: [
        {
          centroCostoCodigo: "CC-1",
          centroCostoNombre: "Centro Uno",
          valor: 70_000,
        },
      ],
    });
    expect(isValorContableDraftValid(invalid)).toBe(false);
  });

  it("requires comment when there are adjusted invoices", () => {
    const invoice = sampleInvoice();
    const drafts = initializeValorContableDrafts([invoice]);
    drafts["mov-1"] = upsertValorContableDraft(undefined, invoice, {
      valorContableNuevo: 80_000,
      centrosCostoDistribucion: [
        {
          centroCostoCodigo: "CC-1",
          centroCostoNombre: "Centro Uno",
          valor: 80_000,
        },
      ],
    });
    expect(requiresComentarioForAjustes([invoice], drafts, "")).toBe(true);
    expect(requiresComentarioForAjustes([invoice], drafts, "Ajuste por diferencia")).toBe(false);
    expect(hasValorContableDraftChanges([invoice], drafts)).toBe(true);
    expect(invoiceTieneBorradorAjustado(invoice, drafts["mov-1"])).toBe(true);
  });

  it("builds confirmation summary for approve and reject", () => {
    const invoice = sampleInvoice();
    const drafts = initializeValorContableDrafts([invoice]);
    drafts["mov-1"] = upsertValorContableDraft(undefined, invoice, {
      valorContableNuevo: 80_000,
      centrosCostoDistribucion: [
        {
          centroCostoCodigo: "CC-1",
          centroCostoNombre: "Centro Uno",
          valor: 80_000,
        },
      ],
    });
    const summary = getConfirmacionAjustesResumen({
      valorTotalOriginal: 100_000,
      invoices: [invoice],
      drafts,
    });
    expect(summary.incluyeAjustes).toBe(true);
    expect(summary.facturasAjustadas).toBe(1);
    expect(summary.valorNuevo).toBe(80_000);
    expect(buildInitialValorContableDraft(invoice).valorContableNuevo).toBe(100_000);
  });
});
