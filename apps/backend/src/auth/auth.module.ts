import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { WorkosGuard } from "./workos.guard";
import { RolesGuard } from "./roles.guard";
import { PrismaModule } from "../prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  controllers: [AuthController],
  providers: [WorkosGuard, RolesGuard],
  exports: [WorkosGuard, RolesGuard],
})
export class AuthModule {}
