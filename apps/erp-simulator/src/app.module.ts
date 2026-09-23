import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { PrismaModule } from "./prisma/prisma.module";
import { SiesaModule } from "./siesa/siesa.module";

@Module({
  imports: [PrismaModule, SiesaModule],
  controllers: [HealthController],
})
export class AppModule {}
