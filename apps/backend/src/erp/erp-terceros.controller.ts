import { Body, Controller, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { AuthedRequest } from "../auth/auth.types";
import { assertEmpresaAccesible } from "../auth/empresa-access";
import { InternalKeyGuard } from "../auth/internal-key.guard";
import { usuarioDe } from "../auth/request-user";
import { WorkosGuard } from "../auth/workos.guard";
import { CrearTerceroErpDto } from "./dto/erp.dto";
import { ErpTercerosService } from "./erp-terceros.service";

/**
 * "Crear en ERP" from the last onboarding phase. Server-to-server only: the Next BFF holds the
 * internal key and calls this on behalf of the signed-in user, after Convex confirmed that user
 * may act on the phase. Nest cannot check onboarding roles itself (they live in Convex).
 */
@ApiTags("erp")
@ApiBearerAuth()
@Controller("erp/terceros")
@UseGuards(InternalKeyGuard, WorkosGuard)
export class ErpTercerosController {
  constructor(private readonly terceros: ErpTercerosService) {}

  @Post()
  crear(@Body() body: CrearTerceroErpDto, @Req() request: AuthedRequest) {
    const user = usuarioDe(request);
    assertEmpresaAccesible(user, body.empresa);
    return this.terceros.crearEnErp(body, user.id);
  }
}
