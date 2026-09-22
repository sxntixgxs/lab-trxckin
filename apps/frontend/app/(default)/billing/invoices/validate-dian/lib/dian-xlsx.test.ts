import * as ExcelJS from "exceljs";
import { getAppUrl } from "../../../../../../lib/app-env";
import { describe, expect, test } from "vitest";
import { cleanDianRows, collectUniqueCufes } from "./clean-dian-rows";
import {
  chunkCufes,
  compareDianRows,
} from "./compare-dian-rows";
import {
  DIAN_HEADERS,
  DIAN_NUMERIC_HEADER_SET,
  type DianRow,
} from "./dian-headers";
import {
  buildValidacionDianFilename,
  buildValidacionDianWorkbook,
} from "./export-validacion-xlsx";
import {
  DianXlsxParseError,
  parseDianXlsxBuffer,
} from "./parse-dian-xlsx";

function emptyRow(overrides: Partial<DianRow> = {}): DianRow {
  const row = {} as DianRow;
  for (const header of DIAN_HEADERS) {
    row[header] = DIAN_NUMERIC_HEADER_SET.has(header) ? null : "";
  }
  return { ...row, ...overrides };
}

async function buildWorkbookBuffer(args: {
  headers?: string[];
  rows?: Array<Array<string | number | null>>;
  sheetName?: string;
  extraSheet?: {
    name: string;
    headers: string[];
    rows: Array<Array<string | number | null>>;
  };
}): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  const main = workbook.addWorksheet(args.sheetName ?? "DIAN");
  main.addRows([args.headers ?? [...DIAN_HEADERS], ...(args.rows ?? [])]);

  if (args.extraSheet) {
    const extra = workbook.addWorksheet(args.extraSheet.name);
    extra.addRows([args.extraSheet.headers, ...args.extraSheet.rows]);
  }

  const bytes = new Uint8Array(await workbook.xlsx.writeBuffer());
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

describe("parseDianXlsxBuffer", () => {
  test("lee encabezados correctos y conserva tipos", async () => {
    const buffer = await buildWorkbookBuffer({
      rows: [
        [
          "Factura electrónica",
          "CUFE-001",
          "100",
          "FE",
          "COP",
          "1",
          "ZZZ",
          "21-07-2026",
          "21-07-2026 10:00:00",
          "900123",
          "Emisor SA",
          "900000001",
          "ANDES LOGISTICA",
          19000,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          119000,
          "Aprobado",
          "Recibido",
        ],
      ],
    });

    const result = await parseDianXlsxBuffer(buffer);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.["CUFE/CUDE"]).toBe("CUFE-001");
    expect(result.rows[0]?.["Tipo de documento"]).toBe("Factura electrónica");
    expect(result.rows[0]?.IVA).toBe(19000);
    expect(result.rows[0]?.Total).toBe(119000);
    expect(typeof result.rows[0]?.["NIT Emisor"]).toBe("string");
  });

  test("acepta columnas adicionales y encabezados con diferencias de tildes/espacios", async () => {
    const headers = [
      "tipo de documento",
      "cufe/cude",
      "Folio",
      "Prefijo",
      "Divisa",
      "Forma de Pago",
      "Medio de Pago",
      "Fecha Emision",
      "Fecha Recepcion",
      "NIT Emisor",
      "Nombre Emisor",
      "NIT Receptor",
      "Nombre Receptor",
      "IVA",
      "ICA",
      "IC",
      "INC",
      "Timbre",
      "INC Bolsas",
      "IN Carbono",
      "IN Combustibles",
      "IC Datos",
      "ICL",
      "INPP",
      "IBUA",
      "ICUI",
      "Rete IVA",
      "Rete Renta",
      "Rete ICA",
      "Total",
      "Estado",
      "Grupo",
      "Columna Extra",
    ];
    const row = Array.from({ length: 33 }, (_, i) =>
      i === 0 ? "Nota de crédito electrónica" : i === 1 ? "CUFE-NC" : i === 29 ? 500 : i >= 13 && i <= 29 ? 0 : `v${i}`
    );
    const buffer = await buildWorkbookBuffer({ headers, rows: [row] });
    const result = await parseDianXlsxBuffer(buffer);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.["CUFE/CUDE"]).toBe("CUFE-NC");
    expect(result.rows[0]?.Total).toBe(500);
  });

  test("rechaza encabezados ausentes", async () => {
    const headers = DIAN_HEADERS.filter((h) => h !== "CUFE/CUDE");
    const buffer = await buildWorkbookBuffer({
      headers: [...headers],
      rows: [Array(headers.length).fill("x")],
    });
    await expect(parseDianXlsxBuffer(buffer)).rejects.toThrow(DianXlsxParseError);
  });

  test("omite filas vacías y usa la primera hoja con esquema completo", async () => {
    const goodRow = Array.from({ length: 32 }, (_, i) =>
      i === 0 ? "Factura electrónica" : i === 1 ? "CUFE-A" : i === 29 ? 10 : ""
    );
    const buffer = await buildWorkbookBuffer({
      sheetName: "Incompleta",
      headers: ["A", "B"],
      rows: [["1", "2"]],
      extraSheet: {
        name: "DIAN",
        headers: [...DIAN_HEADERS],
        rows: [Array(32).fill(null), goodRow],
      },
    });

    // La primera hoja no tiene esquema; debe elegir DIAN.
    // Rehacemos: book_append order puts Incompleta first, then DIAN via extraSheet.
    // But buildWorkbookBuffer always creates main first — so Incompleta is first.
    // Our parser should skip it and find DIAN.
    const result = await parseDianXlsxBuffer(buffer);
    expect(result.sheetName).toBe("DIAN");
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.["CUFE/CUDE"]).toBe("CUFE-A");
  });

  test("archivo inválido lanza error", async () => {
    const invalid = new TextEncoder().encode("not-an-xlsx").buffer;
    await expect(parseDianXlsxBuffer(invalid)).rejects.toThrow(DianXlsxParseError);
  });
});

describe("cleanDianRows", () => {
  test("elimina solo Application response", () => {
    const rows = [
      emptyRow({
        "Tipo de documento": "Factura electrónica",
        "CUFE/CUDE": "A",
      }),
      emptyRow({
        "Tipo de documento": "  Application Response  ",
        "CUFE/CUDE": "B",
      }),
      emptyRow({
        "Tipo de documento": "Nota de crédito electrónica",
        "CUFE/CUDE": "C",
      }),
      emptyRow({
        "Tipo de documento": "Factura de contingencia",
        "CUFE/CUDE": "D",
      }),
      emptyRow({
        "Tipo de documento": "Documento equivalente POS",
        "CUFE/CUDE": "E",
      }),
    ];

    const cleaned = cleanDianRows(rows);
    expect(cleaned.originalCount).toBe(5);
    expect(cleaned.removedApplicationResponseCount).toBe(1);
    expect(cleaned.rows.map((r) => r["CUFE/CUDE"])).toEqual([
      "A",
      "C",
      "D",
      "E",
    ]);
  });

  test("collectUniqueCufes conserva primera aparición y omite vacíos", () => {
    const rows = [
      emptyRow({ "CUFE/CUDE": " AAA " }),
      emptyRow({ "CUFE/CUDE": "AAA" }),
      emptyRow({ "CUFE/CUDE": "" }),
      emptyRow({ "CUFE/CUDE": "BBB" }),
    ];
    expect(collectUniqueCufes(rows)).toEqual(["AAA", "BBB"]);
  });
});

describe("compareDianRows", () => {
  test("clasifica encontrados, no encontrados, vacíos y duplicados", () => {
    const rows = [
      emptyRow({ "CUFE/CUDE": "DUP" }),
      emptyRow({ "CUFE/CUDE": "MISS" }),
      emptyRow({ "CUFE/CUDE": "" }),
      emptyRow({ "CUFE/CUDE": "DUP" }),
      emptyRow({ "CUFE/CUDE": "OK" }),
    ];
    const result = compareDianRows(rows, [
      { cufe: "DUP", facturaId: "id-dup" },
      { cufe: "OK", facturaId: "id-ok" },
    ]);

    expect(result.encontradas).toHaveLength(3);
    expect(result.noEncontradas).toHaveLength(2);
    expect(result.encontradas.map((r) => r.facturaId)).toEqual([
      "id-dup",
      "id-dup",
      "id-ok",
    ]);
    expect(result.noEncontradas.map((r) => r.row["CUFE/CUDE"])).toEqual([
      "MISS",
      "",
    ]);
  });

  test("chunkCufes respeta el tamaño de lote", () => {
    const cufes = Array.from({ length: 501 }, (_, i) => `C${i}`);
    const chunks = chunkCufes(cufes, 250);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toHaveLength(250);
    expect(chunks[1]).toHaveLength(250);
    expect(chunks[2]).toHaveLength(1);
  });
});

describe("exportValidacionDianXlsx", () => {
  test("genera hojas, columnas, hipervínculos y hojas vacías válidas", async () => {
    const encontradas = [
      {
        row: emptyRow({
          "Tipo de documento": "Factura electrónica",
          "CUFE/CUDE": "CUFE-OK",
          Total: 1000,
        }),
        facturaId: "factura123",
      },
    ];
    const noEncontradas = [
      {
        row: emptyRow({
          "Tipo de documento": "Nota de crédito electrónica",
          "CUFE/CUDE": "CUFE-MISS",
          Total: 200,
        }),
        facturaId: null,
      },
    ];

    const workbook = await buildValidacionDianWorkbook({
      encontradas,
      noEncontradas,
    });

    expect(workbook.getWorksheet("Encontradas")).toBeTruthy();
    expect(workbook.getWorksheet("No encontradas")).toBeTruthy();

    const encontradasSheet = workbook.getWorksheet("Encontradas")!;
    const noEncontradasSheet = workbook.getWorksheet("No encontradas")!;

    expect(encontradasSheet.getRow(1).getCell(1).value).toBe(
      "Tipo de documento"
    );
    expect(encontradasSheet.getRow(1).getCell(33).value).toBe(
      "Factura en sistema"
    );
    expect(encontradasSheet.rowCount).toBe(2);
    expect(noEncontradasSheet.rowCount).toBe(2);

    const linkCell = encontradasSheet.getRow(2).getCell(33);
    expect(linkCell.value).toMatchObject({
      text: "factura123",
      hyperlink: `${getAppUrl()}/billing/invoices/factura123`,
    });

    const emptyWorkbook = await buildValidacionDianWorkbook({
      encontradas: [],
      noEncontradas: [],
    });
    expect(emptyWorkbook.getWorksheet("Encontradas")?.rowCount).toBe(1);
    expect(emptyWorkbook.getWorksheet("No encontradas")?.rowCount).toBe(1);

    expect(
      buildValidacionDianFilename({
        date: new Date("2026-07-21T12:00:00Z"),
      })
    ).toBe("validacion-facturas-dian-todas-2026-07-21.xlsx");
  });

  test("suma de filas exportadas coincide con limpias", async () => {
    const rows = [
      emptyRow({ "CUFE/CUDE": "A" }),
      emptyRow({ "CUFE/CUDE": "B" }),
      emptyRow({ "CUFE/CUDE": "C" }),
    ];
    const compared = compareDianRows(rows, [
      { cufe: "A", facturaId: "1" },
      { cufe: "C", facturaId: "3" },
    ]);
    const workbook = await buildValidacionDianWorkbook(compared);
    const encontradasCount =
      (workbook.getWorksheet("Encontradas")?.rowCount ?? 1) - 1;
    const noEncontradasCount =
      (workbook.getWorksheet("No encontradas")?.rowCount ?? 1) - 1;
    expect(encontradasCount + noEncontradasCount).toBe(rows.length);
  });
});

describe("aceptación con fixture sintética 1699/165", () => {
  test("conteos de lectura y limpieza", () => {
    const rows: DianRow[] = [];
    for (let i = 0; i < 1699; i += 1) {
      const isApp = i < 165;
      rows.push(
        emptyRow({
          "Tipo de documento": isApp
            ? "Application response"
            : "Factura electrónica",
          "CUFE/CUDE": `CUFE-${i}`,
          Total: i,
        })
      );
    }
    const cleaned = cleanDianRows(rows);
    expect(cleaned.originalCount).toBe(1699);
    expect(cleaned.removedApplicationResponseCount).toBe(165);
    expect(cleaned.rows).toHaveLength(1534);
  });
});

describe("aceptación con archivo DIAN real (si está disponible)", () => {
  test("1.699 leídos, 165 Application response, 1.534 limpios", async () => {
    const { existsSync, readFileSync } = await import("node:fs");
    // Optional local fixture: point DIAN_XLSX_FIXTURE at a real DIAN export.
    const fixturePath = process.env.DIAN_XLSX_FIXTURE;
    if (!fixturePath || !existsSync(fixturePath)) {
      return;
    }

    const file = readFileSync(fixturePath);
    const buffer = file.buffer.slice(
      file.byteOffset,
      file.byteOffset + file.byteLength
    );
    const parsed = await parseDianXlsxBuffer(buffer);
    const cleaned = cleanDianRows(parsed.rows);

    expect(cleaned.originalCount).toBe(1699);
    expect(cleaned.removedApplicationResponseCount).toBe(165);
    expect(cleaned.rows).toHaveLength(1534);

    const compared = compareDianRows(cleaned.rows, []);
    expect(
      compared.encontradas.length + compared.noEncontradas.length
    ).toBe(1534);
  });
});
