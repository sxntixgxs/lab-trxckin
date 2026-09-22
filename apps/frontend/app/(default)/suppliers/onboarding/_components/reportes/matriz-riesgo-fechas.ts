import { Temporal } from "temporal-polyfill";

const TIME_ZONE = "America/Bogota";

export type FechaRangoInput = {
  desde: string;
  hasta: string;
};

export type FechaRangoTimestamps = {
  fechaDesde: number;
  fechaHastaExclusiva: number;
};

function parseIsoDate(value: string): Temporal.PlainDate {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error("Formato de fecha inválido. Use YYYY-MM-DD.");
  }
  return Temporal.PlainDate.from(trimmed);
}

/** Inclusive Bogotá date range → [desde 00:00, hasta+1 00:00) epoch ms. */
export function rangoFechasBogotaToTimestamps(input: FechaRangoInput): FechaRangoTimestamps {
  const desdeDate = parseIsoDate(input.desde);
  const hastaDate = parseIsoDate(input.hasta);

  const fechaDesde = desdeDate.toZonedDateTime({ timeZone: TIME_ZONE, plainTime: Temporal.PlainTime.from("00:00:00") }).epochMilliseconds;
  const fechaHastaExclusiva = hastaDate
    .add({ days: 1 })
    .toZonedDateTime({ timeZone: TIME_ZONE, plainTime: Temporal.PlainTime.from("00:00:00") }).epochMilliseconds;

  if (!Number.isFinite(fechaDesde) || !Number.isFinite(fechaHastaExclusiva)) {
    throw new Error("Rango de fechas inválido.");
  }
  if (fechaHastaExclusiva <= fechaDesde) {
    throw new Error("La fecha hasta debe ser posterior o igual a la fecha desde.");
  }
  return { fechaDesde, fechaHastaExclusiva };
}

export function rangoMesActualBogota(): FechaRangoInput {
  const today = Temporal.Now.plainDateISO(TIME_ZONE);
  const firstDay = today.with({ day: 1 });
  return { desde: firstDay.toString(), hasta: today.toString() };
}

export function validarRangoFechasInput(input: FechaRangoInput): string | null {
  if (!input.desde.trim() || !input.hasta.trim()) {
    return "Seleccione las fechas Desde y Hasta.";
  }
  try {
    rangoFechasBogotaToTimestamps(input);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "Rango de fechas inválido.";
  }
}

export function buildMatrizRiesgoFilename(desde: string, hasta: string): string {
  return `matriz-riesgo-proveedores_${desde.trim()}_a_${hasta.trim()}.xlsx`;
}
