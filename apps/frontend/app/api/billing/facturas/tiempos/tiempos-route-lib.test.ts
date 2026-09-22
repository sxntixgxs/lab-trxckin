import { describe, expect, it, vi } from "vitest";
import { fillTimingPage, parseTimingQueryFilters } from "./tiempos-route-lib";

describe("parseTimingQueryFilters", () => {
  it("forwards every report filter with the same Convex argument names", () => {
    const params = new URLSearchParams({
      preset: "personalizado",
      from: "2026-07-01",
      to: "2026-07-31",
      q: "William Tanaka",
      estado: "activos",
      responsableUserIds: "user-1,user-2",
      responsableEmails: "one@example.com,two@example.com",
      sinResponsable: "true",
      fase: "gerencia",
      documentoClase: "factura",
      tipoFlujo: "normal",
      causacionEstado: "causado",
      nowMs: "1786625258615",
    });

    expect(parseTimingQueryFilters(params, 1)).toEqual({
      preset: "personalizado",
      from: "2026-07-01",
      to: "2026-07-31",
      busqueda: "William Tanaka",
      estadoProceso: "activos",
      responsableUserIds: ["user-1", "user-2"],
      responsableEmails: ["one@example.com", "two@example.com"],
      incluirSinResponsable: true,
      fase: "gerencia",
      documentoClase: "factura",
      tipoFlujo: "normal",
      causacionEstado: "causado",
      nowMs: 1786625258615,
    });
  });

  it("uses the request timestamp fallback when nowMs is absent or invalid", () => {
    expect(parseTimingQueryFilters(new URLSearchParams(), 123).nowMs).toBe(123);
    expect(parseTimingQueryFilters(new URLSearchParams({ nowMs: "invalid" }), 456).nowMs).toBe(456);
  });
});

describe("fillTimingPage", () => {
  it("joins sparse source pages until the requested UI page is full", async () => {
    const source = [
      { page: [1, 2, 3, 4], isDone: false, continueCursor: "cursor-1" },
      {
        page: [5, 6, 7, 8, 9, 10, 11, 12, 13],
        isDone: false,
        continueCursor: "cursor-2",
      },
      {
        page: [14, 15, 16, 17, 18, 19, 20],
        isDone: false,
        continueCursor: "cursor-3",
      },
    ];
    const fetchPage = vi.fn(async () => source.shift()!);

    const result = await fillTimingPage({ pageSize: 20, fetchPage });

    expect(result).toEqual({
      page: Array.from({ length: 20 }, (_, index) => index + 1),
      isDone: false,
      continueCursor: "cursor-3",
    });
    expect(fetchPage.mock.calls.map(([request]) => request.pageSize)).toEqual([20, 16, 7]);
  });

  it("disables the next page when sparse matches are exhausted", async () => {
    const source = [
      { page: [1, 2, 3, 4], isDone: false, continueCursor: "cursor-1" },
      { page: [5, 6, 7, 8, 9], isDone: false, continueCursor: "cursor-2" },
      { page: [10, 11, 12], isDone: true, continueCursor: "ignored" },
    ];

    const result = await fillTimingPage({
      pageSize: 20,
      fetchPage: async () => source.shift()!,
    });

    expect(result.page).toEqual(Array.from({ length: 12 }, (_, index) => index + 1));
    expect(result.isDone).toBe(true);
    expect(result.continueCursor).toBe("");
  });

  it("keeps a continuation cursor when the HTTP safety bound is reached", async () => {
    let sourcePage = 0;
    const result = await fillTimingPage({
      pageSize: 20,
      maxSourcePages: 3,
      fetchPage: async () => {
        sourcePage += 1;
        return { page: [], isDone: false, continueCursor: `cursor-${sourcePage}` };
      },
    });

    expect(result).toEqual({ page: [], isDone: false, continueCursor: "cursor-3" });
  });

  it("stops malformed cursor cycles instead of looping forever", async () => {
    await expect(
      fillTimingPage({
        pageSize: 20,
        fetchPage: async () => ({ page: [], isDone: false, continueCursor: "same" }),
      })
    ).rejects.toThrow("no pudo avanzar");
  });
});
