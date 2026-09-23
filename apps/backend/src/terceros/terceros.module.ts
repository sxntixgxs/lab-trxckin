import { Module } from "@nestjs/common";
import { ProveedoresController } from "./proveedores.controller";
import { TercerosCatalogoService } from "./terceros-catalogo.service";

@Module({
  controllers: [ProveedoresController],
  providers: [TercerosCatalogoService],
})
export class TercerosModule {}
