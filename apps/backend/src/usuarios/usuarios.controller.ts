import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { WorkosGuard } from "../auth/workos.guard";
import type { AuthedRequest } from "../auth/auth.types";
import { CreateUsuarioDto } from "./dto/create-usuario.dto";
import { UpdateUsuarioDto } from "./dto/update-usuario.dto";
import { UpdateUsuarioRolDto } from "./dto/update-usuario-rol.dto";
import { UsuariosService } from "./usuarios.service";

@ApiTags("usuarios")
@ApiBearerAuth()
@Controller("usuarios")
@UseGuards(WorkosGuard, RolesGuard)
export class UsuariosController {
  constructor(private readonly usuariosService: UsuariosService) {}

  @Get()
  @Roles("admin")
  list() {
    return this.usuariosService.list();
  }

  @Post()
  @Roles("admin")
  create(@Body() body: CreateUsuarioDto) {
    return this.usuariosService.create(body);
  }

  /**
   * Intentionally open to every authenticated member: billing assignment,
   * advance-request approver pickers and devoluciones all pick leaders/finance
   * users from this list. The response is the reduced directory projection
   * (no role, WorkOS id or boss e-mail) — see toDirectoryUsuario.
   */
  @Get("directorio")
  directory(
    @Query("empresaId") empresaId?: string,
    @Query("includeGlobalAccess") includeGlobalAccess?: string,
  ) {
    const parsedEmpresa = empresaId ? Number(empresaId) : undefined;
    return this.usuariosService.directory({
      empresaId: Number.isFinite(parsedEmpresa) ? parsedEmpresa : undefined,
      includeGlobalAccess: includeGlobalAccess === "true",
    });
  }

  /** Same audience and projection as /usuarios/directorio (actor names, devoluciones). */
  @Get(":id")
  getById(@Param("id", ParseUUIDPipe) id: string) {
    return this.usuariosService.getById(id);
  }

  @Patch(":id")
  @Roles("admin")
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: UpdateUsuarioDto,
    @Req() request: AuthedRequest,
  ) {
    return this.usuariosService.update(id, body, request.user!);
  }

  @Patch(":id/rol")
  @Roles("admin")
  updateRol(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: UpdateUsuarioRolDto,
    @Req() request: AuthedRequest,
  ) {
    return this.usuariosService.update(id, { id_rol: body.id_rol }, request.user!);
  }
}
