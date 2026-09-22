import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ADMIN_ROLE_SLUG } from "../auth/auth.types";
import { isAllowedRuta } from "./rutas-catalogo";
import type { BulkPermisosDto } from "./dto/bulk-permisos.dto";

@Injectable()
export class PermisosRolesService {
  constructor(private readonly prisma: PrismaService) {}

  listByRol(idRol: number) {
    return this.prisma.permisoRol.findMany({
      where: { id_rol: idRol, activo: true },
      select: {
        id: true,
        id_rol: true,
        ruta: true,
        activo: true,
      },
      orderBy: { ruta: "asc" },
    });
  }

  async listRolesConPermisos() {
    const roles = await this.prisma.rol.findMany({
      where: { activo: true },
      orderBy: { id: "asc" },
      include: {
        permisos: {
          where: { activo: true },
          select: { ruta: true },
        },
      },
    });

    return roles.map((rol) => ({
      id: rol.id,
      slug: rol.slug,
      nombre: rol.nombre,
      activo: rol.activo,
      permisos: rol.permisos.map((row) => row.ruta),
    }));
  }

  async replaceForRole(dto: BulkPermisosDto) {
    const rol = await this.prisma.rol.findUnique({ where: { id: dto.id_rol } });
    if (!rol) {
      throw new NotFoundException("Rol no encontrado");
    }
    if (rol.slug === ADMIN_ROLE_SLUG) {
      throw new ForbiddenException("El rol administrador tiene acceso total y no se edita aquí");
    }

    const invalid = dto.permisos.filter((ruta) => !isAllowedRuta(ruta));
    if (invalid.length > 0) {
      throw new BadRequestException(`Rutas no permitidas: ${invalid.join(", ")}`);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.permisoRol.deleteMany({ where: { id_rol: dto.id_rol } });
      if (dto.permisos.length > 0) {
        await tx.permisoRol.createMany({
          data: dto.permisos.map((ruta) => ({
            id_rol: dto.id_rol,
            ruta,
            activo: true,
          })),
        });
      }
    });

    const roles = await this.listRolesConPermisos();
    const updated = roles.find((item) => item.id === dto.id_rol);
    if (!updated) {
      throw new NotFoundException("Rol no encontrado");
    }
    return updated;
  }
}
