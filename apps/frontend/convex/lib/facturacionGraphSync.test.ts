import { describe, expect, test } from "vitest";
import {
  advanceWatermark,
  buildInboxMessagesUrl,
  computeSevenDayBackfillStartIso,
  computeSyncStartIso,
  getRetryDelayMs,
  isRetryableGraphStatus,
  necesitaImportarAdjuntos,
  SYNC_BACKFILL_INICIAL_MS,
  SYNC_OVERLAP_MS,
} from "./facturacionGraphSync";

describe("computeSyncStartIso", () => {
  const now = Date.parse("2026-07-17T12:00:00.000Z");

  test("sin watermark usa la ventana de backfill inicial", () => {
    expect(computeSyncStartIso(undefined, now)).toBe(
      new Date(now - SYNC_BACKFILL_INICIAL_MS).toISOString()
    );
  });

  test("con watermark aplica el solape hacia atrás", () => {
    const watermark = "2026-07-17T10:00:00.000Z";
    expect(computeSyncStartIso(watermark, now)).toBe(
      new Date(Date.parse(watermark) - SYNC_OVERLAP_MS).toISOString()
    );
  });

  test("watermark inválido cae al backfill inicial", () => {
    expect(computeSyncStartIso("no-es-fecha", now)).toBe(
      new Date(now - SYNC_BACKFILL_INICIAL_MS).toISOString()
    );
  });
});

describe("computeSevenDayBackfillStartIso", () => {
  test("recupera exactamente los siete días anteriores", () => {
    const now = Date.parse("2026-07-17T12:00:00.000Z");
    expect(computeSevenDayBackfillStartIso(now)).toBe("2026-07-10T12:00:00.000Z");
  });
});

describe("buildInboxMessagesUrl", () => {
  test("filtra por receivedDateTime, ordena ascendente y pagina", () => {
    const url = new URL(
      buildInboxMessagesUrl("recepcion.facturas@example.com", "2026-07-10T00:00:00.000Z", 50)
    );
    expect(url.pathname).toBe(
      "/v1.0/users/recepcion.facturas%40example.com/mailFolders/Inbox/messages"
    );
    expect(url.searchParams.get("$filter")).toBe("receivedDateTime ge 2026-07-10T00:00:00.000Z");
    expect(url.searchParams.get("$orderby")).toBe("receivedDateTime asc");
    expect(url.searchParams.get("$top")).toBe("50");
    expect(url.searchParams.get("$select")).toContain("receivedDateTime");
  });
});

describe("advanceWatermark", () => {
  test("avanza hacia adelante", () => {
    expect(advanceWatermark("2026-07-17T10:00:00Z", "2026-07-17T11:00:00Z")).toBe(
      "2026-07-17T11:00:00Z"
    );
  });

  test("nunca retrocede", () => {
    expect(advanceWatermark("2026-07-17T11:00:00Z", "2026-07-17T10:00:00Z")).toBe(
      "2026-07-17T11:00:00Z"
    );
  });

  test("ignora candidatos inválidos y acepta el primero válido", () => {
    expect(advanceWatermark("2026-07-17T11:00:00Z", undefined)).toBe("2026-07-17T11:00:00Z");
    expect(advanceWatermark(undefined, "2026-07-17T10:00:00Z")).toBe("2026-07-17T10:00:00Z");
    expect(advanceWatermark("2026-07-17T11:00:00Z", "basura")).toBe("2026-07-17T11:00:00Z");
  });
});

describe("reintentos frente a Graph", () => {
  test("reintenta 429 y 5xx transitorios, no 4xx", () => {
    expect(isRetryableGraphStatus(429)).toBe(true);
    expect(isRetryableGraphStatus(500)).toBe(true);
    expect(isRetryableGraphStatus(502)).toBe(true);
    expect(isRetryableGraphStatus(503)).toBe(true);
    expect(isRetryableGraphStatus(504)).toBe(true);
    expect(isRetryableGraphStatus(400)).toBe(false);
    expect(isRetryableGraphStatus(401)).toBe(false);
    expect(isRetryableGraphStatus(404)).toBe(false);
  });

  test("respeta Retry-After en segundos", () => {
    expect(getRetryDelayMs(1, "7")).toBe(7000);
  });

  test("acota Retry-After a 60s", () => {
    expect(getRetryDelayMs(1, "600")).toBe(60_000);
  });

  test("respeta Retry-After como fecha HTTP", () => {
    const now = Date.parse("2026-07-17T12:00:00.000Z");
    const retryAt = new Date(now + 15_000).toUTCString();
    expect(getRetryDelayMs(1, retryAt, now)).toBeGreaterThanOrEqual(14_000);
    expect(getRetryDelayMs(1, retryAt, now)).toBeLessThanOrEqual(15_000);
  });

  test("sin Retry-After usa backoff exponencial", () => {
    expect(getRetryDelayMs(1, null)).toBe(1000);
    expect(getRetryDelayMs(2, null)).toBe(2000);
    expect(getRetryDelayMs(3, null)).toBe(4000);
  });
});

describe("necesitaImportarAdjuntos", () => {
  test("reimporta estados incompletos", () => {
    expect(necesitaImportarAdjuntos(undefined)).toBe(true);
    expect(necesitaImportarAdjuntos("none")).toBe(true);
    expect(necesitaImportarAdjuntos("pending")).toBe(true);
    expect(necesitaImportarAdjuntos("failed")).toBe(true);
    expect(necesitaImportarAdjuntos("partial")).toBe(true);
  });

  test("no reimporta estados finales", () => {
    expect(necesitaImportarAdjuntos("complete")).toBe(false);
    expect(necesitaImportarAdjuntos("skipped")).toBe(false);
  });
});
