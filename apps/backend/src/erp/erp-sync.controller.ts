import { Body, Controller, ForbiddenException, Get, HttpCode, HttpStatus, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { AuthedRequest } from "../auth/auth.types";
import { assertEmpresaAccesible, empresasAccesibles } from "../auth/empresa-access";
import { Permisos } from "../auth/permisos.decorator";
import { PermisosGuard } from "../auth/permisos.guard";
import { usuarioDe } from "../auth/request-user";
import { WorkosGuard } from "../auth/workos.guard";
import { IniciarSincronizacionDto, ListarSincronizacionesQueryDto } from "./dto/erp.dto";
import { EMPRESAS_ERP, ENTIDADES_ERP, RUTA_TERCEROS_ERP } from "./erp.config";
import { ErpSyncService } from "./sync/erp-sync.service";

/** Administración → Terceros ERP: "Sincronizar ahora" and the run history. */
@ApiTags("erp")
@ApiBearerAuth()
@Controller("erp/sincronizaciones")
@UseGuards(WorkosGuard, PermisosGuard)
@Permisos(RUTA_TERCEROS_ERP)
export class ErpSyncController {
  constructor(private readonly sync: ErpSyncService) {}

  /** Starts a sync and answers at once (202); poll GET to follow its runs. */
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async iniciar(@Body() body: IniciarSincronizacionDto, @Req() request: AuthedRequest) {
    const user = usuarioDe(request);
    const empresas = this.empresasSolicitadas(request, body.empresa);
    const corridas = await this.sync.iniciarEnSegundoPlano({
      entidades: body.entidad ? [body.entidad] : ENTIDADES_ERP,
      empresas,
      origen: "MANUAL",
      idUsuario: user.id,
    });
    return { corridas };
  }

  @Get()
  listar(@Query() query: ListarSincronizacionesQueryDto, @Req() request: AuthedRequest) {
    return this.sync.listarCorridas({ empresas: this.empresasSolicitadas(request, query.empresa), limit: query.limit ?? 20 });
  }

  private empresasSolicitadas(request: AuthedRequest, empresa: number | undefined): number[] {
    const user = usuarioDe(request);
    if (empresa !== undefined) {
      assertEmpresaAccesible(user, empresa);
      return [empresa];
    }
    const empresas = empresasAccesibles(user, EMPRESAS_ERP);
    if (empresas.length === 0) throw new ForbiddenException("Empresa no autorizada");
    return empresas;
  }
}
