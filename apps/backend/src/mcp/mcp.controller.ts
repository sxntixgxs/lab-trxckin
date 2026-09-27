import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { BuscarProveedoresQueryDto } from "../terceros/dto/terceros-query.dto";
import { TercerosCatalogoService } from "../terceros/terceros-catalogo.service";
import { McpReadGuard } from "./mcp-read.guard";
import { assertEmpresaMcp } from "./mcp-scope";

/** Read-only routes for apps/mcp-server. Nothing here writes. */
@ApiExcludeController()
@Controller("mcp")
@UseGuards(McpReadGuard)
export class McpController {
  constructor(private readonly catalogo: TercerosCatalogoService) {}

  /** Same search as GET /proveedores/search, limited to the companies in MCP_EMPRESAS. */
  @Get("proveedores/search")
  async buscarProveedores(@Query() query: BuscarProveedoresQueryDto) {
    assertEmpresaMcp(query.empresa);
    return {
      proveedores: await this.catalogo.buscarProveedoresActivos(query.empresa, query.q ?? "", query.limit ?? 10),
    };
  }
}
