import { Controller, Get, HttpStatus, Query, UseGuards } from "@nestjs/common";
import { ApiHeader, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { ConniGuard } from "../auth/conni.guard";
import { ConsultasService } from "./consultas.service";
import { ErrorConsulta, SiesaHttpException, sinRegistros } from "./errores";
import { primerValor } from "./query";

@ApiTags("siesa")
@ApiHeader({ name: "ConniKey", required: true })
@ApiHeader({ name: "ConniToken", required: true })
@Controller("api/siesa/v3")
@UseGuards(ConniGuard)
export class ConsultasController {
  constructor(private readonly consultas: ConsultasService) {}

  @Get("ejecutarconsultaestandar")
  @ApiOperation({
    summary: "Standard query (SIESA Cloud)",
    description:
      "Returns `{ codigo: 0, mensaje, detalle: { Table: [...] } }`. When nothing matches (including a page " +
      "past the end) it answers HTTP 400 with `detalle: \"No se encontraron registros\"`, like SIESA.",
  })
  @ApiQuery({ name: "idCompania", example: "5001", description: "Instance (SIESA Cloud connection)" })
  @ApiQuery({ name: "descripcion", example: "API_v2_Proveedores", description: "API_v2_Proveedores | API_v2_Clientes | API_v2_Companias" })
  @ApiQuery({ name: "paginacion", required: false, example: "numPag=1|tamPag=100" })
  @ApiQuery({ name: "parametros", required: false, example: "f200_id_cia = 1 AND f200_nit = ''900222333''" })
  async ejecutar(@Query() query: Record<string, unknown>) {
    try {
      const filas = await this.consultas.ejecutar({
        idCompania: primerValor(query.idCompania),
        descripcion: primerValor(query.descripcion),
        paginacion: primerValor(query.paginacion),
        parametros: primerValor(query.parametros),
      });
      if (filas.length === 0) throw sinRegistros();
      return { codigo: 0, mensaje: "Transacción Exitosa", detalle: { Table: filas } };
    } catch (error) {
      if (error instanceof ErrorConsulta) {
        throw new SiesaHttpException(HttpStatus.BAD_REQUEST, error.message, error.detalle);
      }
      throw error;
    }
  }
}
