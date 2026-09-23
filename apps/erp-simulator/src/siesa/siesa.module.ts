import { Module } from "@nestjs/common";
import { ConectoresController } from "./conectores.controller";
import { ConectoresService } from "./conectores.service";
import { ConsultasController } from "./consultas.controller";
import { ConsultasService } from "./consultas.service";

@Module({
  controllers: [ConsultasController, ConectoresController],
  providers: [ConsultasService, ConectoresService],
})
export class SiesaModule {}
