import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { AuthModule } from "./auth/auth.module";
import { ErpModule } from "./erp/erp.module";
import { McpModule } from "./mcp/mcp.module";
import { HealthController } from "./health/health.controller";
import { PermisosRolesModule } from "./permisos-roles/permisos-roles.module";
import { PrismaModule } from "./prisma/prisma.module";
import { ProcesosModule } from "./procesos/procesos.module";
import { RolesModule } from "./roles/roles.module";
import { TercerosModule } from "./terceros/terceros.module";
import { UsuariosModule } from "./usuarios/usuarios.module";

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    UsuariosModule,
    RolesModule,
    PermisosRolesModule,
    ProcesosModule,
    TercerosModule,
    ErpModule,
    McpModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
