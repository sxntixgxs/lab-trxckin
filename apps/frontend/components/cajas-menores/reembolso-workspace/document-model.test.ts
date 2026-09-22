import { describe, expect, it } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";

import {
  buildFacturaPdfDocumentId,
  buildSupportDocumentId,
  getDefaultViewerSelection,
  normalizeFacturaDocuments,
  normalizeInvoiceItem,
} from "./document-model";

const facturaA = "facturaA" as Id<"facturacionFacturas">;
const facturaB = "facturaB" as Id<"facturacionFacturas">;
const pdfA = "storagePdfA" as Id<"_storage">;
const pdfB = "storagePdfB" as Id<"_storage">;
const legacySupport = "storageLegacy" as Id<"_storage">;
const adjuntoStorage = "storageAdjunto" as Id<"_storage">;
const adjuntoId = "adjunto1" as Id<"facturacionAdjuntos">;

describe("reembolso document ids", () => {
  it("builds unique composite ids for multiple primary PDFs", () => {
    const idA = buildFacturaPdfDocumentId(String(facturaA), String(pdfA));
    const idB = buildFacturaPdfDocumentId(String(facturaB), String(pdfB));
    expect(idA).not.toBe(idB);
    expect(idA).toBe("factura:facturaA:pdf:storagePdfA");
    expect(idB).toBe("factura:facturaB:pdf:storagePdfB");
  });

  it("never resolves FE6988 PDF to CONT641462 storage", () => {
    const urls = new Map<string, string>([
      [String(pdfA), "https://example.com/FE6988.pdf"],
      [String(pdfB), "https://example.com/CONT641462.pdf"],
    ]);

    const docsA = normalizeFacturaDocuments(
      {
        facturaId: String(facturaA),
        numeroFactura: "FE6988",
        pdfStorageId: pdfA,
      },
      urls,
    );
    const docsB = normalizeFacturaDocuments(
      {
        facturaId: String(facturaB),
        numeroFactura: "CONT641462",
        pdfStorageId: pdfB,
      },
      urls,
    );

    const pdfDocA = docsA.find((doc) => doc.kind === "factura_pdf");
    const pdfDocB = docsB.find((doc) => doc.kind === "factura_pdf");

    expect(pdfDocA?.id).toBe(buildFacturaPdfDocumentId(String(facturaA), String(pdfA)));
    expect(pdfDocB?.id).toBe(buildFacturaPdfDocumentId(String(facturaB), String(pdfB)));
    expect(pdfDocA?.url).toBe("https://example.com/FE6988.pdf");
    expect(pdfDocB?.url).toBe("https://example.com/CONT641462.pdf");
    expect(pdfDocA?.id).not.toBe(pdfDocB?.id);
  });
});

describe("normalizeFacturaDocuments", () => {
  it("dedupes legacy support against facturacionAdjuntos by storageId", () => {
    const docs = normalizeFacturaDocuments(
      {
        facturaId: String(facturaA),
        numeroFactura: "FE1",
        pdfStorageId: pdfA,
        soportesStorageId: legacySupport,
        soportesNombre: "Legacy",
        adjuntos: [
          {
            _id: adjuntoId,
            storageId: legacySupport,
            nombre: "Duplicado",
            url: "https://example.com/dup.pdf",
            creadoEn: 200,
          },
          {
            _id: "adjunto2" as Id<"facturacionAdjuntos">,
            storageId: adjuntoStorage,
            nombre: "Otro",
            url: "https://example.com/otro.pdf",
            creadoEn: 100,
          },
        ],
      },
      new Map([
        [String(pdfA), "https://example.com/pdf.pdf"],
        [String(legacySupport), "https://example.com/legacy.pdf"],
        [String(adjuntoStorage), "https://example.com/otro.pdf"],
      ]),
    );

    expect(docs.map((doc) => doc.kind)).toEqual([
      "factura_pdf",
      "soporte",
      "soporte",
    ]);
    expect(docs.filter((doc) => doc.storageId === legacySupport)).toHaveLength(1);
    expect(docs[1]?.nombre).toBe("Legacy");
    expect(docs[2]?.nombre).toBe("Otro");
  });

  it("orders adjuntos newest to oldest after pdf and legacy", () => {
    const docs = normalizeFacturaDocuments({
      facturaId: String(facturaA),
      pdfUrl: "https://example.com/pdf.pdf",
      pdfStorageId: pdfA,
      adjuntos: [
        {
          _id: "old" as Id<"facturacionAdjuntos">,
          storageId: "oldStorage" as Id<"_storage">,
          nombre: "Viejo",
          url: "https://example.com/old.pdf",
          creadoEn: 10,
        },
        {
          _id: "new" as Id<"facturacionAdjuntos">,
          storageId: "newStorage" as Id<"_storage">,
          nombre: "Nuevo",
          url: "https://example.com/new.pdf",
          creadoEn: 99,
        },
      ],
    });

    expect(docs.map((doc) => doc.nombre)).toEqual([
      "Factura · representación gráfica",
      "Nuevo",
      "Viejo",
    ]);
  });

  it("handles factura without pdf or supports", () => {
    const docs = normalizeFacturaDocuments({
      facturaId: String(facturaA),
      numeroFactura: "EMPTY",
    });
    expect(docs).toEqual([]);
  });

  it("marks null url as not previewable", () => {
    const docs = normalizeFacturaDocuments({
      facturaId: String(facturaA),
      pdfStorageId: pdfA,
      pdfUrl: null,
      adjuntos: [
        {
          _id: adjuntoId,
          storageId: adjuntoStorage,
          nombre: "scan.bin",
          url: null,
          mimeType: "application/octet-stream",
        },
      ],
    });
    expect(docs.every((doc) => doc.previewable === false)).toBe(true);
  });
});

describe("normalizeInvoiceItem + viewer selection", () => {
  it("preserves deterministic invoice order keys", () => {
    const item = normalizeInvoiceItem({
      key: "mov-1",
      movimientoId: "mov-1",
      facturaId: String(facturaA),
      numeroFactura: "FE6988",
      proveedorNombre: "Proveedor",
      concepto: "Gasolina",
      valor: 1000,
      centroCostoCodigo: "CC1",
      centroCostoNombre: "Centro",
      pdfStorageId: pdfA,
      pdfUrl: "https://example.com/FE6988.pdf",
    });
    expect(item.key).toBe("mov-1");
    expect(item.documents[0]?.id).toContain("facturaA");
  });

  it("defaults to full-width primary when no support", () => {
    const docs = normalizeFacturaDocuments({
      facturaId: String(facturaA),
      pdfStorageId: pdfA,
      pdfUrl: "https://example.com/a.pdf",
    });
    expect(getDefaultViewerSelection(docs)).toEqual({
      primaryDocumentId: buildFacturaPdfDocumentId(String(facturaA), String(pdfA)),
      supportDocumentId: null,
    });
  });

  it("uses first support as primary pane when no PDF", () => {
    const docs = normalizeFacturaDocuments({
      facturaId: String(facturaA),
      adjuntos: [
        {
          _id: adjuntoId,
          storageId: adjuntoStorage,
          nombre: "foto.jpg",
          url: "https://example.com/foto.jpg",
          mimeType: "image/jpeg",
          creadoEn: 1,
        },
      ],
    });
    expect(getDefaultViewerSelection(docs)).toEqual({
      primaryDocumentId: buildSupportDocumentId(String(facturaA), String(adjuntoId)),
      supportDocumentId: null,
    });
  });
});
