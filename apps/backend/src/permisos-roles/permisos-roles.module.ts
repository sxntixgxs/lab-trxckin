import { Module } from "@nestjs/common";
import { PermisosRolesController } from "./permisos-roles.controller";
import { PermisosRolesService } from "./permisos-roles.service";

@Module({
  controllers: [PermisosRolesController],
  providers: [PermisosRolesService],
})
export class PermisosRolesModule {}
