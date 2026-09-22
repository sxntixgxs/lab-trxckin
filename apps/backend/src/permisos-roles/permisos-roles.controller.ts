import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { AuthedRequest } from "../auth/auth.types";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { WorkosGuard } from "../auth/workos.guard";
import { BulkPermisosDto } from "./dto/bulk-permisos.dto";
import { PermisosRolesService } from "./permisos-roles.service";

@ApiTags("permisos-roles")
@ApiBearerAuth()
@Controller("permisos-roles")
@UseGuards(WorkosGuard, RolesGuard)
export class PermisosRolesController {
  constructor(private readonly permisosRolesService: PermisosRolesService) {}

  @Get("roles-con-permisos")
  @Roles("admin")
  listRolesConPermisos() {
    return this.permisosRolesService.listRolesConPermisos();
  }

  /**
   * Members may read the permissions of their own (effective) role — the
   * frontend loads them for the signed-in user; any other role needs admin.
   */
  @Get("rol/:id")
  listByRol(@Param("id", ParseIntPipe) id: number, @Req() request: AuthedRequest) {
    const user = request.user;
    if (!user || (!user.hasFullAccess && user.rol.id !== id)) {
      throw new ForbiddenException("No autorizado");
    }
    return this.permisosRolesService.listByRol(id);
  }

  @Post("bulk")
  @Roles("admin")
  replaceForRole(@Body() body: BulkPermisosDto) {
    return this.permisosRolesService.replaceForRole(body);
  }
}
