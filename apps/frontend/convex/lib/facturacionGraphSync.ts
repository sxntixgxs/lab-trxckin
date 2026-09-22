// Helpers puros para la sincronización de la bandeja de facturación con
// Microsoft Graph. Sin dependencias de Convex para poder testearlos aislados.

/** Solape hacia atrás sobre el watermark para no perder correos en el borde. */
export const SYNC_OVERLAP_MS = 60 * 60 * 1000; // 1 hora

/** Ventana inicial cuando una cuenta no tiene watermark todavía. */
export const SYNC_BACKFILL_INICIAL_MS = 7 * 24 * 60 * 60 * 1000; // 7 días

/** Tamaño de página pedido a Graph (no es una ventana: se siguen los nextLink). */
export const SYNC_PAGE_SIZE = 50;

/** Tope de mensajes por corrida; si queda trabajo se programa una continuación. */
export const SYNC_MAX_MENSAJES_POR_CORRIDA = 500;

/** Intentos máximos de procesamiento por correo antes de dejar de reintentar. */
export const SYNC_MAX_INTENTOS_CORREO = 5;

/** Duración del lease anti-solape entre corridas (cron cada 2 min + botón manual). */
export const SYNC_LEASE_MS = 5 * 60 * 1000;

/** Máximo de continuaciones encadenadas por corrida para evitar loops. */
export const SYNC_MAX_CONTINUACIONES = 10;

const GRAPH_MESSAGE_SELECT = [
  "id",
  "conversationId",
  "subject",
  "from",
  "toRecipients",
  "bodyPreview",
  "body",
  "receivedDateTime",
  "isRead",
  "hasAttachments",
  "importance",
  "isDraft",
].join(",");

/**
 * Punto de inicio de la consulta a Graph: watermark - solape, o ventana de
 * backfill inicial si la cuenta aún no tiene watermark.
 */
export function computeSyncStartIso(
  watermarkReceivedDateTime: string | undefined,
  nowMs: number
): string {
  const watermarkMs = watermarkReceivedDateTime ? Date.parse(watermarkReceivedDateTime) : NaN;

  const startMs = Number.isFinite(watermarkMs)
    ? watermarkMs - SYNC_OVERLAP_MS
    : nowMs - SYNC_BACKFILL_INICIAL_MS;

  return new Date(startMs).toISOString();
}

/** Inicio fijo para recuperar una ventana histórica sin tocar el watermark. */
export function computeSevenDayBackfillStartIso(nowMs: number): string {
  return new Date(nowMs - SYNC_BACKFILL_INICIAL_MS).toISOString();
}

/**
 * URL de la primera página de mensajes: filtra por receivedDateTime y ordena
 * ascendente para poder avanzar el watermark de forma segura.
 */
export function buildInboxMessagesUrl(
  accountEmail: string,
  startIso: string,
  pageSize: number = SYNC_PAGE_SIZE
): string {
  const base = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(accountEmail)}/mailFolders/Inbox/messages`;
  const params = new URLSearchParams({
    $filter: `receivedDateTime ge ${startIso}`,
    $orderby: "receivedDateTime asc",
    $top: String(pageSize),
    $select: GRAPH_MESSAGE_SELECT,
  });
  return `${base}?${params.toString()}`;
}

/** Solo avanza el watermark hacia adelante; nunca retrocede. */
export function advanceWatermark(
  current: string | undefined,
  candidate: string | undefined
): string | undefined {
  if (!candidate || !Number.isFinite(Date.parse(candidate))) return current;
  if (!current || !Number.isFinite(Date.parse(current))) return candidate;
  return Date.parse(candidate) > Date.parse(current) ? candidate : current;
}

/** Códigos HTTP de Graph que ameritan reintento. */
export function isRetryableGraphStatus(status: number): boolean {
  return status === 429 || status === 503 || status === 504 || status === 500 || status === 502;
}

/**
 * Delay antes del siguiente intento: respeta Retry-After (segundos o fecha
 * HTTP) y si no viene usa backoff exponencial.
 */
export function getRetryDelayMs(
  attempt: number,
  retryAfterHeader: string | null,
  nowMs: number = Date.now(),
  baseDelayMs = 1000
): number {
  if (retryAfterHeader) {
    const seconds = Number(retryAfterHeader);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1000, 60_000);
    }
    const dateMs = Date.parse(retryAfterHeader);
    if (Number.isFinite(dateMs) && dateMs > nowMs) {
      return Math.min(dateMs - nowMs, 60_000);
    }
  }
  return baseDelayMs * 2 ** (attempt - 1);
}

export type EstadoAdjuntos =
  | "none"
  | "pending"
  | "complete"
  | "partial"
  | "failed"
  | "skipped"
  | undefined;

/**
 * Un correo necesita (re)importar adjuntos si nunca se importaron o si el
 * último intento quedó incompleto ("partial" incluido: el XML de la factura
 * puede estar entre los adjuntos que fallaron). "complete" y "skipped" son
 * resultados finales. Los reintentos están acotados por
 * SYNC_MAX_INTENTOS_CORREO.
 */
export function necesitaImportarAdjuntos(estado: EstadoAdjuntos): boolean {
  return estado !== "complete" && estado !== "skipped";
}

export function formatSyncError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 500);
}
