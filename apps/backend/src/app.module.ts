import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module";
import { HealthController } from "./health/health.controller";
import { PermisosRolesModule } from "./permisos-roles/permisos-roles.module";
import { PrismaModule } from "./prisma/prisma.module";
import { ProcesosModule } from "./procesos/procesos.module";
import { ProveedoresModule } from "./proveedores/proveedores.module";
import { RolesModule } from "./roles/roles.module";
import { UsuariosModule } from "./usuarios/usuarios.module";

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    UsuariosModule,
    RolesModule,
    PermisosRolesModule,
    ProcesosModule,
    ProveedoresModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
