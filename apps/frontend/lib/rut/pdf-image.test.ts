import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { renderPdfFirstPage } from "./pdf-image";

const CASO = path.join(__dirname, "..", "..", "evals", "rut", "dataset", "cases", "rut-01", "document.pdf");

describe("renderPdfFirstPage", () => {
  it("renders a RUT's first page to a PNG", async () => {
    const png = await renderPdfFirstPage(new Uint8Array(readFileSync(CASO)));
    expect([...png.slice(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const view = new DataView(png.buffer, png.byteOffset);
    // IHDR width/height at scale 2 of a letter/A4 page: well above 1000 px.
    expect(view.getUint32(16)).toBeGreaterThan(1000);
    expect(view.getUint32(20)).toBeGreaterThan(1000);
  }, 20_000);

  it("rejects bytes that are not a PDF", async () => {
    await expect(renderPdfFirstPage(new TextEncoder().encode("not a pdf"))).rejects.toThrow();
  });
});
