import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { WorkosGuard } from "../auth/workos.guard";
import { CreateRolDto } from "./dto/create-rol.dto";
import { UpdateRolDto } from "./dto/update-rol.dto";
import { RolesService } from "./roles.service";

@ApiTags("roles")
@ApiBearerAuth()
@Controller("roles")
@UseGuards(WorkosGuard, RolesGuard)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @Roles("admin")
  list() {
    return this.rolesService.list();
  }

  @Post()
  @Roles("admin")
  create(@Body() body: CreateRolDto) {
    return this.rolesService.create(body);
  }

  @Patch(":id")
  @Roles("admin")
  update(@Param("id", ParseIntPipe) id: number, @Body() body: UpdateRolDto) {
    return this.rolesService.update(id, body);
  }

  @Delete(":id")
  @Roles("admin")
  remove(@Param("id", ParseIntPipe) id: number) {
    return this.rolesService.remove(id);
  }
}
