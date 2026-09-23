import { BadRequestException, Controller, Get, Param, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { AuthedRequest } from "../auth/auth.types";
import { assertEmpresaAccesible } from "../auth/empresa-access";
import { Permisos } from "../auth/permisos.decorator";
import { PermisosGuard } from "../auth/permisos.guard";
import { usuarioDe } from "../auth/request-user";
import { WorkosGuard } from "../auth/workos.guard";
import { RUTA_TERCEROS_ERP, type EntidadErp } from "../erp/erp.config";
import { ListarCatalogoQueryDto } from "./dto/terceros-query.dto";
import { TercerosCatalogoService } from "./terceros-catalogo.service";

const ENTIDAD_POR_SEGMENTO: Readonly<Record<string, EntidadErp>> = {
  proveedores: "PROVEEDORES",
  clientes: "CLIENTES",
};

/** Administración → Terceros ERP: browse the catalog the sync keeps. */
@ApiTags("erp")
@ApiBearerAuth()
@Controller("erp/catalogo")
@UseGuards(WorkosGuard, PermisosGuard)
@Permisos(RUTA_TERCEROS_ERP)
export class CatalogoController {
  constructor(private readonly catalogo: TercerosCatalogoService) {}

  @Get(":entidad")
  listar(@Param("entidad") segmento: string, @Query() query: ListarCatalogoQueryDto, @Req() request: AuthedRequest) {
    const entidad = ENTIDAD_POR_SEGMENTO[segmento];
    if (!entidad) throw new BadRequestException("Use proveedores o clientes");
    assertEmpresaAccesible(usuarioDe(request), query.empresa);
    return this.catalogo.listar(entidad, query.empresa, query.q, query.page ?? 1, query.pageSize ?? 25);
  }
}
