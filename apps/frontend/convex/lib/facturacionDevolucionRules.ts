export const DEVOLUCION_STAGE_ORDER = [
  "recepcion",
  "revision_lider",
  "causacion",
  "revision_impuestos",
  "eventos_dian",
  "gerencia",
  "revision_tesoreria",
] as const;

export type FaseDevolucionDestino = (typeof DEVOLUCION_STAGE_ORDER)[number];

export const DEVOLUCION_STAGE_LABELS: Record<FaseDevolucionDestino, string> = {
  recepcion: "Recepción",
  revision_lider: "Líder",
  causacion: "Causación",
  revision_impuestos: "Contabilidad",
  eventos_dian: "Eventos DIAN",
  gerencia: "Gerencia",
  revision_tesoreria: "Tesorería",
};

export type DevolucionDestino = {
  fase: FaseDevolucionDestino;
  label: string;
};

export const ESTADOS_TERMINALES_DEVOLUCION = [
  "pagada",
  "legalizada",
  "cerrada",
  "rechazada",
  "rechazada_dian",
  "nota_credito_cerrada",
] as const;

export type EstadoTerminalDevolucion = (typeof ESTADOS_TERMINALES_DEVOLUCION)[number];

const ESTADOS_TERMINALES = new Set<string>(ESTADOS_TERMINALES_DEVOLUCION);

const FASE_BASE_ESPECIAL: Record<string, FaseDevolucionDestino> = {
  jefe_directo: "revision_lider",
  aceptada: "revision_lider",
  pendiente_rechazar_dian: "eventos_dian",
  pendiente_nota_credito: "eventos_dian",
  reembolso_caja_menor: "causacion",
};

const RESPALDO_TERMINAL: Record<EstadoTerminalDevolucion, FaseDevolucionDestino> = {
  pagada: "revision_tesoreria",
  legalizada: "revision_impuestos",
  cerrada: "recepcion",
  rechazada: "revision_lider",
  rechazada_dian: "eventos_dian",
  nota_credito_cerrada: "causacion",
};

export function isEstadoTerminalDevolucion(estado: string): estado is EstadoTerminalDevolucion {
  return ESTADOS_TERMINALES.has(estado);
}

export function isEstadoEspecialDevolucion(estado: string): boolean {
  return estado in FASE_BASE_ESPECIAL;
}

export function requiereReaperturaSinAsignacionActiva(estadoActual: string): boolean {
  return isEstadoTerminalDevolucion(estadoActual) || isEstadoEspecialDevolucion(estadoActual);
}

export function normalizarEstadoAFaseDevolucion(
  estado: string
): FaseDevolucionDestino | null {
  if (DEVOLUCION_STAGE_ORDER.includes(estado as FaseDevolucionDestino)) {
    return estado as FaseDevolucionDestino;
  }
  if (FASE_BASE_ESPECIAL[estado]) {
    return FASE_BASE_ESPECIAL[estado];
  }
  if (isEstadoTerminalDevolucion(estado)) {
    return RESPALDO_TERMINAL[estado];
  }
  return null;
}

export function resolveFaseOrigenDevolucion(
  estadoActual: string,
  estadoAnteriorHistorico?: string | null
): FaseDevolucionDestino | null {
  if (estadoActual === "jefe_directo") {
    return "revision_lider";
  }

  if (isEstadoTerminalDevolucion(estadoActual)) {
    if (estadoAnteriorHistorico) {
      const normalizado = normalizarEstadoAFaseDevolucion(estadoAnteriorHistorico);
      if (normalizado) return normalizado;
    }
    return RESPALDO_TERMINAL[estadoActual];
  }

  if (FASE_BASE_ESPECIAL[estadoActual]) {
    return FASE_BASE_ESPECIAL[estadoActual];
  }

  const currentIndex = DEVOLUCION_STAGE_ORDER.indexOf(estadoActual as FaseDevolucionDestino);
  if (currentIndex >= 0) {
    return estadoActual as FaseDevolucionDestino;
  }

  return null;
}

function destinosDesdeFaseInclusive(faseReferencia: FaseDevolucionDestino): DevolucionDestino[] {
  const index = DEVOLUCION_STAGE_ORDER.indexOf(faseReferencia);
  if (index < 0) return [];

  return DEVOLUCION_STAGE_ORDER.slice(0, index + 1)
    .reverse()
    .map((fase) => ({
      fase,
      label: DEVOLUCION_STAGE_LABELS[fase],
    }));
}

function destinosAnterioresEnCadena(faseActual: FaseDevolucionDestino): DevolucionDestino[] {
  const index = DEVOLUCION_STAGE_ORDER.indexOf(faseActual);
  if (index <= 0) return [];

  return DEVOLUCION_STAGE_ORDER.slice(0, index)
    .reverse()
    .map((fase) => ({
      fase,
      label: DEVOLUCION_STAGE_LABELS[fase],
    }));
}

export function getDevolucionDestinos(
  estadoActual: string,
  faseOrigenResuelta?: FaseDevolucionDestino | null
): DevolucionDestino[] {
  if (estadoActual === "recepcion") return [];

  if (estadoActual === "jefe_directo") {
    return [
      {
        fase: "revision_lider",
        label: DEVOLUCION_STAGE_LABELS.revision_lider,
      },
    ];
  }

  if (isEstadoTerminalDevolucion(estadoActual)) {
    const origen =
      faseOrigenResuelta ??
      resolveFaseOrigenDevolucion(estadoActual, null);
    if (!origen) return [];
    return destinosDesdeFaseInclusive(origen);
  }

  if (FASE_BASE_ESPECIAL[estadoActual]) {
    const origen = faseOrigenResuelta ?? FASE_BASE_ESPECIAL[estadoActual];
    return destinosDesdeFaseInclusive(origen);
  }

  const currentIndex = DEVOLUCION_STAGE_ORDER.indexOf(estadoActual as FaseDevolucionDestino);
  if (currentIndex <= 0) return [];

  return destinosAnterioresEnCadena(estadoActual as FaseDevolucionDestino);
}

export function puedeDevolverFactura(args: {
  estadoActual: string;
  esPeaje: boolean;
  tieneTarea: boolean;
  faseOrigenResuelta?: FaseDevolucionDestino | null;
}): boolean {
  if (!args.tieneTarea || args.esPeaje) return false;
  if (args.estadoActual === "recepcion") return false;
  return getDevolucionDestinos(args.estadoActual, args.faseOrigenResuelta).length > 0;
}

export function assertDestinoDevolucionValido(
  estadoActual: string,
  faseDestino: string,
  faseOrigenResuelta?: FaseDevolucionDestino | null
) {
  const destinos = getDevolucionDestinos(estadoActual, faseOrigenResuelta);
  if (!destinos.some((destino) => destino.fase === faseDestino)) {
    if (isEstadoTerminalDevolucion(estadoActual) || FASE_BASE_ESPECIAL[estadoActual]) {
      throw new Error("Destino no permitido para reabrir la factura.");
    }
    throw new Error("Solo puedes devolver la factura a una fase anterior del flujo principal.");
  }
}
