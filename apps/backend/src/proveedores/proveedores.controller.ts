import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { InternalKeyGuard } from "../auth/internal-key.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { WorkosGuard } from "../auth/workos.guard";
import { CreateProveedorDto } from "./dto/create-proveedor.dto";
import { UpdateProveedorDto } from "./dto/update-proveedor.dto";
import { UpsertProveedorDto } from "./dto/upsert-proveedor.dto";
import { ProveedoresService } from "./proveedores.service";

@ApiTags("proveedores")
@Controller("proveedores")
export class ProveedoresController {
  constructor(private readonly proveedoresService: ProveedoresService) {}

  /** Full catalog dump: admin-only (no member flow lists every supplier). */
  @Get()
  @ApiBearerAuth()
  @UseGuards(WorkosGuard, RolesGuard)
  @Roles("admin")
  list() {
    return this.proveedoresService.list();
  }

  /**
   * Open to every authenticated member: the advance-request form and billing
   * settings look suppliers up by name/NIT. Results are capped by the service.
   */
  @Get("search")
  @ApiBearerAuth()
  @UseGuards(WorkosGuard)
  search(@Query("q") q = "") {
    return this.proveedoresService.search(q);
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(WorkosGuard, RolesGuard)
  @Roles("admin")
  create(@Body() body: CreateProveedorDto) {
    return this.proveedoresService.create(body);
  }

  @Patch(":id")
  @ApiBearerAuth()
  @UseGuards(WorkosGuard, RolesGuard)
  @Roles("admin")
  update(@Param("id", ParseUUIDPipe) id: string, @Body() body: UpdateProveedorDto) {
    return this.proveedoresService.update(id, body);
  }

  @Post("upsert-from-invoice")
  @UseGuards(InternalKeyGuard)
  upsertFromInvoice(@Body() body: UpsertProveedorDto) {
    return this.proveedoresService.upsertFromInvoice(body);
  }
}
