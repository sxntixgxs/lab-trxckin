export type NotasContabilidadPdfProps = {
  justificacion?: string;
  archivos: { nombre: string; url: string }[];
};

type NotasContabilidadSource = {
  justificacionCambios?: string;
  archivosSoporte?: Array<{ storageId: string; nombre: string }>;
};

/**
 * Public origin for links embedded in PDFs (never the raw Convex storage URL).
 * Priority: NEXT_PUBLIC_APP_URL → (browser) window.location.origin.
 */
function publicAppBaseForLinks(): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (typeof window !== "undefined") return fromEnv || window.location.origin;
  return fromEnv || "";
}

/** Links go through the authenticated Next proxy `/api/convex/storage/:id`. */
export function storageDownloadUrl(storageId: string): string {
  const base = publicAppBaseForLinks().replace(/\/$/, "");
  const path = `/api/convex/storage/${encodeURIComponent(storageId)}`;
  return base ? `${base}${path}` : path;
}

/** Builds the accounting notes block for the form PDF (text + downloadable file links). */
export function resolveNotasContabilidadForPdf(
  ins: { notasContabilidadFaseVI?: NotasContabilidadSource },
): NotasContabilidadPdfProps | undefined {
  const n = ins.notasContabilidadFaseVI;
  if (!n) return undefined;
  const just = (n.justificacionCambios ?? "").trim();
  const archivos = (n.archivosSoporte ?? []).map((a) => ({
    nombre: a.nombre,
    url: storageDownloadUrl(String(a.storageId)),
  }));
  if (!just && archivos.length === 0) return undefined;
  return { justificacion: just || undefined, archivos };
}
