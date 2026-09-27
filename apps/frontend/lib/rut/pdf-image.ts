/**
 * First page of a PDF as a PNG, for models that read images but not PDFs (the DeepSeek
 * fallback). The RUT's page 1 holds every field the extractor asks for.
 *
 * pdf.js renders onto @napi-rs/canvas, its optional Node backend (prebuilt binaries, no
 * system libraries). No standard font data is loaded, so a PDF that relies on non-embedded
 * base-14 fonts may render its text poorly; this only affects the fallback, since the primary
 * model reads PDFs natively.
 */
export async function renderPdfFirstPage(bytes: Uint8Array, scale = 2): Promise<Uint8Array> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const { createCanvas } = await import("@napi-rs/canvas");
  // In Node, pdf.js runs its worker on the main thread. Left alone it imports the worker file by
  // path, which the Next.js server bundle does not ship; handing it the module avoids the lookup.
  const worker = globalThis as { pdfjsWorker?: unknown };
  // @ts-expect-error -- pdf.js ships no type declarations for its worker entry.
  worker.pdfjsWorker ??= await import("pdfjs-dist/legacy/build/pdf.worker.mjs");

  // pdf.js takes ownership of (and detaches) the buffer it is given.
  const loading = pdfjs.getDocument({ data: bytes.slice() });
  try {
    const page = await (await loading.promise).getPage(1);
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    await page.render({ canvas: canvas as unknown as HTMLCanvasElement, viewport, background: "#ffffff" }).promise;
    return new Uint8Array(await canvas.encode("png"));
  } finally {
    await loading.destroy();
  }
}
