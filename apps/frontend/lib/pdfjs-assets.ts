/**
 * Ruta pública donde se sirven los binarios wasm de pdfjs-dist.
 *
 * pdf.js (v5+) descarga en tiempo de ejecución `jbig2.wasm`, `openjpeg.wasm` y
 * `qcms_bg.wasm` desde esta URL para decodificar imágenes JBIG2 / JPEG2000 y
 * perfiles de color ICC. Si la opción `wasmUrl` no se pasa a `getDocument`,
 * pdf.js omite esas imágenes en silencio y la página se ve en blanco.
 *
 * Los archivos los copia `scripts/copy-pdfjs-assets.mjs` en cada `dev`/`build`.
 * Debe terminar en "/" porque pdf.js concatena el nombre del archivo.
 */
export const PDFJS_WASM_URL = "/pdfjs/";
