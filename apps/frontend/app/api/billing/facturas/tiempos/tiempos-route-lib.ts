export type TimingProcessStatus = "todos" | "activos" | "finalizados" | "sin_workflow";

export type TimingQueryFilters = {
  preset?: string;
  from?: string;
  to?: string;
  busqueda?: string;
  estadoProceso?: TimingProcessStatus;
  responsableUserIds?: string[];
  responsableEmails?: string[];
  incluirSinResponsable?: boolean;
  fase?: string;
  documentoClase?: string;
  tipoFlujo?: string;
  causacionEstado?: "causado" | "no_causado" | "sin_registro";
  nowMs: number;
};

type CursorPage<Row> = {
  page: Row[];
  isDone: boolean;
  continueCursor: string;
};

function optionalValue(value: string | null) {
  return value || undefined;
}

function list(value: string | null) {
  if (!value) return undefined;
  const values = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return values.length ? values : undefined;
}

function processStatus(value: string | null): TimingProcessStatus | undefined {
  if (
    value === "todos" ||
    value === "activos" ||
    value === "finalizados" ||
    value === "sin_workflow"
  ) {
    return value;
  }
  return undefined;
}

/**
 * The screen and the Excel export intentionally share this parser so both
 * execute the exact same report filters.
 */
export function parseTimingQueryFilters(params: URLSearchParams, fallbackNowMs: number) {
  const rawNowMs = params.get("nowMs");
  const requestedNowMs = rawNowMs === null ? Number.NaN : Number(rawNowMs);
  return {
    preset: optionalValue(params.get("preset")),
    from: optionalValue(params.get("from")),
    to: optionalValue(params.get("to")),
    busqueda: optionalValue(params.get("q")),
    estadoProceso: processStatus(params.get("estado")),
    responsableUserIds: list(params.get("responsableUserIds")),
    responsableEmails: list(params.get("responsableEmails")),
    incluirSinResponsable: params.get("sinResponsable") === "true" ? true : undefined,
    fase: optionalValue(params.get("fase")),
    documentoClase: optionalValue(params.get("documentoClase")),
    tipoFlujo: optionalValue(params.get("tipoFlujo")),
    causacionEstado:
      params.get("causacionEstado") === "causado" ||
      params.get("causacionEstado") === "no_causado" ||
      params.get("causacionEstado") === "sin_registro"
        ? (params.get("causacionEstado") as "causado" | "no_causado" | "sin_registro")
        : undefined,
    nowMs: Number.isFinite(requestedNowMs) ? requestedNowMs : fallbackNowMs,
  } satisfies TimingQueryFilters;
}

/**
 * Convex scans a single bounded source batch per invocation to stay below its
 * one-second execution budget. A selective filter can therefore produce a
 * short internal page even though more matches exist. The HTTP boundary joins
 * those bounded pages into the page size promised by the UI.
 */
export async function fillTimingPage<Row>(args: {
  pageSize: number;
  cursor?: string;
  maxSourcePages?: number;
  fetchPage: (request: { cursor?: string; pageSize: number }) => Promise<CursorPage<Row>>;
}): Promise<CursorPage<Row>> {
  const pageSize = Math.max(1, Math.trunc(args.pageSize));
  const maxSourcePages = Math.max(1, Math.trunc(args.maxSourcePages ?? 25));
  const page: Row[] = [];
  let cursor = args.cursor;
  let isDone = false;
  let sourcePages = 0;
  const visitedCursors = new Set<string>();
  if (cursor) visitedCursors.add(cursor);

  while (page.length < pageSize && !isDone && sourcePages < maxSourcePages) {
    const result = await args.fetchPage({
      cursor,
      pageSize: pageSize - page.length,
    });
    sourcePages += 1;
    page.push(...result.page);
    isDone = result.isDone;

    if (isDone) {
      cursor = undefined;
      break;
    }

    const nextCursor = result.continueCursor || undefined;
    if (!nextCursor || visitedCursors.has(nextCursor)) {
      throw new Error("El reporte no pudo avanzar a la siguiente página.");
    }
    visitedCursors.add(nextCursor);
    cursor = nextCursor;
  }

  return {
    page,
    isDone,
    continueCursor: isDone ? "" : (cursor ?? ""),
  };
}
