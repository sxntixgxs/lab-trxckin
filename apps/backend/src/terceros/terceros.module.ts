import { Module } from "@nestjs/common";
import { CatalogoController } from "./catalogo.controller";
import { ClientesController } from "./clientes.controller";
import { ProveedoresController } from "./proveedores.controller";
import { TercerosCatalogoService } from "./terceros-catalogo.service";

@Module({
  controllers: [ProveedoresController, ClientesController, CatalogoController],
  providers: [TercerosCatalogoService],
  exports: [TercerosCatalogoService],
})
export class TercerosModule {}
