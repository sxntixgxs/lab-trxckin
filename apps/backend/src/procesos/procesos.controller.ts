import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { WorkosGuard } from "../auth/workos.guard";
import { CreateProcesoDto } from "./dto/create-proceso.dto";
import { UpdateProcesoDto } from "./dto/update-proceso.dto";
import { ProcesosService } from "./procesos.service";

@ApiTags("procesos")
@ApiBearerAuth()
@Controller("procesos")
@UseGuards(WorkosGuard, RolesGuard)
export class ProcesosController {
  constructor(private readonly procesosService: ProcesosService) {}

  @Get()
  @Roles("admin")
  list() {
    return this.procesosService.list();
  }

  @Post()
  @Roles("admin")
  create(@Body() body: CreateProcesoDto) {
    return this.procesosService.create(body);
  }

  @Patch(":id")
  @Roles("admin")
  update(@Param("id", ParseIntPipe) id: number, @Body() body: UpdateProcesoDto) {
    return this.procesosService.update(id, body);
  }

  @Delete(":id")
  @Roles("admin")
  remove(@Param("id", ParseIntPipe) id: number) {
    return this.procesosService.remove(id);
  }
}
