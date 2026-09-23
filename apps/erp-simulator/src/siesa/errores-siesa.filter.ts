import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import type { Response } from "express";
import type { CuerpoErrorSiesa } from "./errores";

function esCuerpoSiesa(valor: unknown): valor is CuerpoErrorSiesa {
  return typeof valor === "object" && valor !== null && "codigo" in valor && "mensaje" in valor;
}

/** Every error leaves the simulator with SIESA's `{ codigo, mensaje, detalle }` body. */
@Catch()
export class ErroresSiesaFilter implements ExceptionFilter {
  private readonly logger = new Logger(ErroresSiesaFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    if (exception instanceof HttpException) {
      const cuerpo = exception.getResponse();
      response
        .status(exception.getStatus())
        .json(esCuerpoSiesa(cuerpo) ? cuerpo : { codigo: 1, mensaje: exception.message, detalle: cuerpo });
      return;
    }
    this.logger.error(exception instanceof Error ? (exception.stack ?? exception.message) : String(exception));
    response
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json({ codigo: 1, mensaje: "Error interno", detalle: "Error inesperado en el simulador del ERP." });
  }
}
