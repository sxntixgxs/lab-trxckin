import type { ConfigErp } from "../erp.config";

/** Text SIESA returns (with HTTP 400) when a query matches nothing. */
const SIN_REGISTROS = "no se encontraron registros";

/** Safety net against a misbehaving ERP that never returns a short page. */
const MAX_PAGINAS = 200;

/** Failure talking to the ERP. `status` is null when no HTTP response arrived. */
export class ErpError extends Error {
  constructor(
    mensaje: string,
    readonly status: number | null,
    readonly detalle: unknown = null,
  ) {
    super(mensaje);
    this.name = "ErpError";
  }
}

export type FilaErp = Record<string, unknown>;

export type OpcionesSiesaClient = {
  fetch?: typeof fetch;
  esperar?: (ms: number) => Promise<void>;
  reintentos?: number;
};

export type ConsultaSiesa = { idCompania: string; descripcion: string; parametros?: string };

/** SIESA string literal inside `parametros`, quoted the way SIESA clients send it. */
export function literalSiesa(valor: string): string {
  return `''${valor.replace(/'/g, "''''")}''`;
}

/**
 * Minimal SIESA Cloud client: standard queries (`ejecutarconsultaestandar`). Plain class so the
 * CLI can use it without Nest DI.
 */
export class SiesaClient {
  private readonly fetchImpl: typeof fetch;
  private readonly esperar: (ms: number) => Promise<void>;
  private readonly reintentos: number;

  constructor(
    private readonly config: ConfigErp,
    opciones: OpcionesSiesaClient = {},
  ) {
    this.fetchImpl = opciones.fetch ?? fetch;
    this.esperar = opciones.esperar ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.reintentos = opciones.reintentos ?? 2;
  }

  /** One page. SIESA answers "no records" with HTTP 400; that is an empty page here. */
  async consultarPagina(consulta: ConsultaSiesa & { pagina: number; tamano: number }): Promise<FilaErp[]> {
    const url = new URL(`${this.config.baseUrl}/api/siesa/v3/ejecutarconsultaestandar`);
    url.searchParams.set("idCompania", consulta.idCompania);
    url.searchParams.set("descripcion", consulta.descripcion);
    url.searchParams.set("paginacion", `numPag=${consulta.pagina}|tamPag=${consulta.tamano}`);
    if (consulta.parametros) url.searchParams.set("parametros", consulta.parametros);

    const respuesta = await this.conReintentos(() => this.solicitar(url, { method: "GET" }));
    const cuerpo = await leerJson(respuesta);
    if (respuesta.status === 400 && esSinRegistros(cuerpo)) return [];
    if (!respuesta.ok) throw errorDeRespuesta(respuesta.status, cuerpo);
    return filasDe(cuerpo);
  }

  /** Every page of a query, until a short page or "no records". */
  async consultarTodo(consulta: ConsultaSiesa): Promise<FilaErp[]> {
    const filas: FilaErp[] = [];
    for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
      const lote = await this.consultarPagina({ ...consulta, pagina, tamano: this.config.tamanoPagina });
      filas.push(...lote);
      if (lote.length < this.config.tamanoPagina) return filas;
    }
    throw new ErpError(`La consulta ${consulta.descripcion} superó ${MAX_PAGINAS} páginas.`, null);
  }

  private async solicitar(url: URL, init: RequestInit): Promise<Response> {
    const controlador = new AbortController();
    const temporizador = setTimeout(() => controlador.abort(), this.config.timeoutMs);
    try {
      return await this.fetchImpl(url, {
        ...init,
        signal: controlador.signal,
        headers: {
          "Content-Type": "application/json",
          ConniKey: this.config.conniKey,
          ConniToken: this.config.conniToken,
        },
      });
    } catch (error) {
      throw new ErpError(
        controlador.signal.aborted
          ? `El ERP no respondió en ${this.config.timeoutMs} ms.`
          : "No se pudo conectar con el ERP.",
        null,
        error instanceof Error ? error.message : null,
      );
    } finally {
      clearTimeout(temporizador);
    }
  }

  /** Retries network errors, 429 and 5xx with exponential backoff (500 ms, 1 s, ...). */
  private async conReintentos(operacion: () => Promise<Response>): Promise<Response> {
    for (let intento = 0; ; intento++) {
      try {
        const respuesta = await operacion();
        if (!esReintentable(respuesta.status) || intento >= this.reintentos) return respuesta;
        await respuesta.body?.cancel().catch(() => undefined);
      } catch (error) {
        if (!(error instanceof ErpError) || intento >= this.reintentos) throw error;
      }
      await this.esperar(500 * 2 ** intento);
    }
  }
}

function esReintentable(status: number): boolean {
  return status === 429 || status >= 500;
}

async function leerJson(respuesta: Response): Promise<unknown> {
  try {
    return await respuesta.json();
  } catch {
    return null;
  }
}

function comoRegistro(valor: unknown): Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor) ? (valor as Record<string, unknown>) : {};
}

function esSinRegistros(cuerpo: unknown): boolean {
  const detalle = comoRegistro(cuerpo).detalle;
  return typeof detalle === "string" && detalle.toLowerCase().includes(SIN_REGISTROS);
}

function errorDeRespuesta(status: number, cuerpo: unknown): ErpError {
  const registro = comoRegistro(cuerpo);
  const mensaje = typeof registro.mensaje === "string" && registro.mensaje ? registro.mensaje : `El ERP respondió ${status}.`;
  return new ErpError(mensaje, status, registro.detalle ?? null);
}

function filasDe(cuerpo: unknown): FilaErp[] {
  const detalle = comoRegistro(comoRegistro(cuerpo).detalle);
  const tabla = detalle.Table ?? detalle.Datos;
  if (!Array.isArray(tabla)) throw new ErpError("Respuesta del ERP sin detalle.Table.", 200, cuerpo);
  return tabla.filter((fila): fila is FilaErp => typeof fila === "object" && fila !== null && !Array.isArray(fila));
}
