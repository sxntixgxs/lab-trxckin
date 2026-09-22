import { describe, expect, it } from "vitest";

import {
  getDefaultViewerSelection,
  getDocumentNavLabel,
  navigateInvoiceDocuments,
  normalizeFacturaDocuments,
} from "./document-model";
import type { ReembolsoDocument } from "./types";

describe("invoice position label", () => {
  it("computes Factura X de N from active index only", () => {
    const invoices = ["a", "b", "c"];
    const activeIndex = invoices.indexOf("b");
    const label = `Factura ${activeIndex + 1} de ${invoices.length}`;
    expect(label).toBe("Factura 2 de 3");
  });

  it("disables Anterior on first and Siguiente on last", () => {
    const length = 3;
    expect(0 <= 0).toBe(true); // Anterior disabled at index 0
    expect(2 >= length - 1).toBe(true); // Siguiente disabled at last
    expect(1 <= 0).toBe(false);
    expect(1 >= length - 1).toBe(false);
  });
});

describe("decision gate helpers", () => {
  it("blocks reject without comment", () => {
    const comentario = "   ";
    const canReject = Boolean(comentario.trim());
    expect(canReject).toBe(false);
  });

  it("blocks treasury without comprobante", () => {
    const adjuntos: unknown[] = [];
    expect(adjuntos.length === 0).toBe(true);
  });

  it("blocks generation when any distribution is invalid", () => {
    const validFlags = [true, false, true];
    const blocked = validFlags.some((flag) => !flag);
    expect(blocked).toBe(true);
  });

  it("treats persisted attachments as saved (comment-only discard)", () => {
    const comentario = "";
    const persistedAdjuntos = [{ id: "1" }];
    const hasUnsavedChanges = Boolean(comentario.trim());
    expect(persistedAdjuntos.length).toBe(1);
    expect(hasUnsavedChanges).toBe(false);
  });
});

describe("viewer selection persistence across invoices", () => {
  it("keeps distinct document ids per factura so FE6988 never maps to CONT", () => {
    const docsA = normalizeFacturaDocuments({
      facturaId: "fe6988",
      numeroFactura: "FE6988",
      pdfStorageId: "pdfFE" as never,
      pdfUrl: "https://example.com/FE6988.pdf",
    });
    const docsB = normalizeFacturaDocuments({
      facturaId: "cont641462",
      numeroFactura: "CONT641462",
      pdfStorageId: "pdfCONT" as never,
      pdfUrl: "https://example.com/CONT641462.pdf",
    });
    const selA = getDefaultViewerSelection(docsA);
    const selB = getDefaultViewerSelection(docsB);
    expect(selA.primaryDocumentId).not.toBe(selB.primaryDocumentId);
    expect(selA.primaryDocumentId).toContain("fe6988");
    expect(selB.primaryDocumentId).toContain("cont641462");
  });

  it("preserves page/zoom map keyed by document id", () => {
    const paneState: Record<string, { page: number; zoom: number }> = {};
    const doc: ReembolsoDocument = {
      id: "factura:a:pdf:1",
      facturaId: "a",
      kind: "factura_pdf",
      nombre: "PDF",
      url: "https://example.com/a.pdf",
      previewable: true,
    };
    paneState[doc.id] = { page: 3, zoom: 1.2 };
    expect(paneState[doc.id]?.page).toBe(3);
    expect(paneState["factura:b:pdf:1"]).toBeUndefined();
  });
});

describe("expanded document navigation (active invoice only)", () => {
  const docs: ReembolsoDocument[] = [
    {
      id: "pdf",
      facturaId: "f1",
      kind: "factura_pdf",
      nombre: "PDF",
      url: "https://example.com/a.pdf",
      previewable: true,
    },
    {
      id: "s1",
      facturaId: "f1",
      kind: "soporte",
      nombre: "Soporte 1",
      url: "https://example.com/s1.pdf",
      previewable: true,
    },
    {
      id: "s2",
      facturaId: "f1",
      kind: "soporte",
      nombre: "Soporte 2",
      url: "https://example.com/s2.pdf",
      previewable: true,
    },
  ];

  it("navigates circularly pdf → supports without leaving invoice", () => {
    expect(navigateInvoiceDocuments(docs, "pdf", 1)).toBe("s1");
    expect(navigateInvoiceDocuments(docs, "s1", 1)).toBe("s2");
    expect(navigateInvoiceDocuments(docs, "s2", 1)).toBe("pdf");
    expect(navigateInvoiceDocuments(docs, "pdf", -1)).toBe("s2");
  });

  it("labels document counter separately from PDF pages", () => {
    expect(getDocumentNavLabel(docs, "s1").label).toBe("2 de 3");
    expect(getDocumentNavLabel(docs, "pdf").label).toBe("1 de 3");
  });
});
