import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { AuthedRequest } from "../auth/auth.types";
import { assertEmpresaAccesible } from "../auth/empresa-access";
import { Permisos } from "../auth/permisos.decorator";
import { PermisosGuard } from "../auth/permisos.guard";
import { usuarioDe } from "../auth/request-user";
import { WorkosGuard } from "../auth/workos.guard";
import { ExistenciaTerceroQueryDto } from "./dto/terceros-query.dto";
import { TercerosCatalogoService } from "./terceros-catalogo.service";

/** ERP customer catalog (read only). */
@ApiTags("clientes")
@ApiBearerAuth()
@Controller("clientes")
@UseGuards(WorkosGuard, PermisosGuard)
export class ClientesController {
  constructor(private readonly catalogo: TercerosCatalogoService) {}

  /** Customer onboarding: INSCRIPCIÓN vs ACTUALIZACIÓN. */
  @Get("existe")
  @Permisos("customers/onboarding")
  existe(@Query() query: ExistenciaTerceroQueryDto, @Req() request: AuthedRequest) {
    assertEmpresaAccesible(usuarioDe(request), query.empresa);
    return this.catalogo.existencia("CLIENTES", query.empresa, query.documento, query.tipoDocumento);
  }
}
