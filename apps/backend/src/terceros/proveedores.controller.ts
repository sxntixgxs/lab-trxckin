import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { AuthedRequest } from "../auth/auth.types";
import { assertEmpresaAccesible } from "../auth/empresa-access";
import { Permisos } from "../auth/permisos.decorator";
import { PermisosGuard } from "../auth/permisos.guard";
import { usuarioDe } from "../auth/request-user";
import { WorkosGuard } from "../auth/workos.guard";
import { BuscarProveedoresQueryDto } from "./dto/terceros-query.dto";
import { TercerosCatalogoService } from "./terceros-catalogo.service";

/** ERP supplier catalog (read only). */
@ApiTags("proveedores")
@ApiBearerAuth()
@Controller("proveedores")
@UseGuards(WorkosGuard, PermisosGuard)
export class ProveedoresController {
  constructor(private readonly catalogo: TercerosCatalogoService) {}

  /**
   * SIESA search contract for the advance request and billing settings screens: active suppliers
   * of one company, capped at `limit`. An empty `q` returns no rows.
   */
  @Get("search")
  @Permisos("finance/advances/request", "billing/settings", "suppliers/onboarding")
  async search(@Query() query: BuscarProveedoresQueryDto, @Req() request: AuthedRequest) {
    assertEmpresaAccesible(usuarioDe(request), query.empresa);
    return {
      proveedores: await this.catalogo.buscarProveedoresActivos(query.empresa, query.q ?? "", query.limit ?? 12),
    };
  }
}
