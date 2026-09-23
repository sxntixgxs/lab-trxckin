import { Module } from "@nestjs/common";
import { CatalogoController } from "./catalogo.controller";
import { ProveedoresController } from "./proveedores.controller";
import { TercerosCatalogoService } from "./terceros-catalogo.service";

@Module({
  controllers: [ProveedoresController, CatalogoController],
  providers: [TercerosCatalogoService],
})
export class TercerosModule {}
