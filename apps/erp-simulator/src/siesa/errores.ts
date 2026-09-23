import { HttpException, HttpStatus } from "@nestjs/common";

/** SIESA's text when a query matches nothing (it answers with HTTP 400, not an empty list). */
export const SIN_REGISTROS = "No se encontraron registros";

/** Body SIESA returns on errors: `{ codigo, mensaje, detalle }`. */
export type CuerpoErrorSiesa = { codigo: number; mensaje: string; detalle: unknown };

/** Error raised while reading the query string (bad paginacion/parametros, unknown query...). */
export class ErrorConsulta extends Error {
  constructor(
    mensaje: string,
    readonly detalle: string = mensaje,
  ) {
    super(mensaje);
  }
}

/** HTTP error with the SIESA body shape. */
export class SiesaHttpException extends HttpException {
  constructor(status: HttpStatus, mensaje: string, detalle: unknown) {
    super({ codigo: 1, mensaje, detalle } satisfies CuerpoErrorSiesa, status);
  }
}

export function sinRegistros(): SiesaHttpException {
  return new SiesaHttpException(HttpStatus.BAD_REQUEST, "Error", SIN_REGISTROS);
}
