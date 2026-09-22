import { Temporal } from "temporal-polyfill";
import { describe, expect, it } from "vitest";
import { buildMatrizRiesgoFilename, rangoFechasBogotaToTimestamps, rangoMesActualBogota, validarRangoFechasInput } from "./matriz-riesgo-fechas";

describe("matriz-riesgo-fechas", () => {
  it("convierte rango inclusivo en zona America/Bogota", () => {
    const { fechaDesde, fechaHastaExclusiva } = rangoFechasBogotaToTimestamps({ desde: "2026-01-01", hasta: "2026-01-31" });
    const desdeBogota = Temporal.Instant.fromEpochMilliseconds(fechaDesde).toZonedDateTimeISO("America/Bogota");
    const hastaExclusivaBogota = Temporal.Instant.fromEpochMilliseconds(fechaHastaExclusiva).toZonedDateTimeISO("America/Bogota");

    expect(desdeBogota.toPlainDate().toString()).toBe("2026-01-01");
    expect(desdeBogota.hour).toBe(0);
    expect(hastaExclusivaBogota.toPlainDate().toString()).toBe("2026-02-01");
    expect(hastaExclusivaBogota.hour).toBe(0);
  });

  it("cubre el último instante del día hasta seleccionado", () => {
    const { fechaDesde, fechaHastaExclusiva } = rangoFechasBogotaToTimestamps({ desde: "2026-03-10", hasta: "2026-03-10" });
    const lastInstant = fechaHastaExclusiva - 1;
    const lastBogota = Temporal.Instant.fromEpochMilliseconds(lastInstant).toZonedDateTimeISO("America/Bogota");
    expect(fechaDesde).toBeLessThanOrEqual(lastInstant);
    expect(lastBogota.toPlainDate().toString()).toBe("2026-03-10");
  });

  it("rechaza rango inválido", () => {
    expect(validarRangoFechasInput({ desde: "2026-02-01", hasta: "2026-01-01" })).toMatch(/posterior/i);
    expect(validarRangoFechasInput({ desde: "", hasta: "2026-01-01" })).toMatch(/Seleccione/i);
  });

  it("genera nombre de archivo con el rango", () => {
    expect(buildMatrizRiesgoFilename("2026-01-01", "2026-01-31")).toBe("matriz-riesgo-proveedores_2026-01-01_a_2026-01-31.xlsx");
  });

  it("rango inicial del mes actual en Colombia", () => {
    const rango = rangoMesActualBogota();
    expect(rango.desde).toMatch(/^\d{4}-\d{2}-01$/);
    expect(rango.desde <= rango.hasta).toBe(true);
  });
});
