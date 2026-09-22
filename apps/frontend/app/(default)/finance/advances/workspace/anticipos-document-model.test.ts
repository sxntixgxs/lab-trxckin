import { describe, expect, test } from "vitest";

import type { Id } from "@/convex/_generated/dataModel";
import type { AnticipoFase, AnticipoRow } from "../dashboard/types";
import {
  getDefaultAnticipoDocumentId,
  navigateAnticipoDocuments,
  normalizeAnticipoDocuments,
} from "./anticipos-document-model";

const storage = (value: string) => value as Id<"_storage">;

describe("anticipos document model", () => {
  test("orders request supports first and deduplicates phase attachments", () => {
    const anticipo = {
      _id: "anticipo-1" as Id<"anticipos">,
      soportesSolicitud: [
        { storageId: storage("request-pdf"), nombre: "solicitud.pdf" },
        { storageId: storage("shared"), nombre: "foto.jpg" },
      ],
    } as AnticipoRow;
    const phases = [
      {
        _id: "phase-2",
        _creationTime: 200,
        fechaInicio: 200,
        fase: "IV_DESEMBOLSO_TESORERIA",
        adjuntos: [{ storageId: storage("treasury"), nombre: "pago.xlsx" }],
      },
      {
        _id: "phase-1",
        _creationTime: 100,
        fechaInicio: 100,
        fase: "II_APROBACION_JEFE_DIRECTO",
        adjuntos: [
          { storageId: storage("shared"), nombre: "duplicado.jpg" },
          { storageId: storage("approval"), nombre: "aprobacion.png" },
        ],
      },
    ] as AnticipoFase[];

    const documents = normalizeAnticipoDocuments(anticipo, phases);
    expect(documents.map((document) => String(document.storageId))).toEqual([
      "request-pdf",
      "shared",
      "approval",
      "treasury",
    ]);
    expect(getDefaultAnticipoDocumentId(documents)).toBe(documents[0]?.id);
    expect(documents[3]).toEqual(
      expect.objectContaining({
        source: "fase",
        phase: "IV_DESEMBOLSO_TESORERIA",
        previewable: false,
      })
    );
  });

  test("navigates documents circularly", () => {
    const documents = normalizeAnticipoDocuments(
      {
        _id: "anticipo-2" as Id<"anticipos">,
        soportesSolicitud: [
          { storageId: storage("a"), nombre: "a.pdf" },
          { storageId: storage("b"), nombre: "b.png" },
        ],
      } as AnticipoRow,
      []
    );
    expect(navigateAnticipoDocuments(documents, documents[0]!.id, -1)).toBe(documents[1]?.id);
  });
});
