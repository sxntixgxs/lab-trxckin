import { Module } from "@nestjs/common";
import { ProcesosController } from "./procesos.controller";
import { ProcesosService } from "./procesos.service";

@Module({
  controllers: [ProcesosController],
  providers: [ProcesosService],
})
export class ProcesosModule {}
