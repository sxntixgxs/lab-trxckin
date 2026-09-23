import { Body, Controller, HttpCode, HttpStatus, Post, Query, UseGuards } from "@nestjs/common";
import { ApiHeader, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { ConniGuard } from "../auth/conni.guard";
import { ConectoresService } from "./conectores.service";
import { primerValor } from "./query";

@ApiTags("siesa")
@ApiHeader({ name: "ConniKey", required: true })
@ApiHeader({ name: "ConniToken", required: true })
@Controller("api/siesa/v3.1")
@UseGuards(ConniGuard)
export class ConectoresController {
  constructor(private readonly conectores: ConectoresService) {}

  @Post("conectoresimportar")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Import connector (SIESA Cloud): create or update a tercero with its supplier/customer branches",
    description:
      "Body: `{ Inicial: [{ F_CIA }], Tercero: [{ F200_*, F015_* }], Proveedor?: [{ F202_* }], Cliente?: [{ F201_* }], " +
      "Final: [{ F_CIA }] }`. Validation errors answer 400 with `detalle: [{ nivel, campo, mensaje }]`.",
  })
  @ApiQuery({ name: "idCompania", example: "5001" })
  @ApiQuery({ name: "idSistema", required: false, example: "2" })
  @ApiQuery({ name: "idDocumento", required: false })
  @ApiQuery({ name: "nombreDocumento", required: false, example: "tercero-proveedor" })
  importar(@Query() query: Record<string, unknown>, @Body() cuerpo: unknown) {
    return this.conectores.importar(
      {
        idCompania: primerValor(query.idCompania),
        idDocumento: primerValor(query.idDocumento),
        nombreDocumento: primerValor(query.nombreDocumento),
      },
      cuerpo,
    );
  }
}
