import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ADMIN_ROLE_SLUG } from "../auth/auth.types";
import { isSystemRoleSlug, slugifyNombre } from "../permisos-roles/rutas-catalogo";
import type { CreateRolDto } from "./dto/create-rol.dto";
import type { UpdateRolDto } from "./dto/update-rol.dto";

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.rol.findMany({
      where: { activo: true },
      orderBy: { id: "asc" },
      select: {
        id: true,
        slug: true,
        nombre: true,
        activo: true,
      },
    });
  }

  async create(dto: CreateRolDto) {
    const nombre = dto.nombre.trim();
    const slug = slugifyNombre(nombre);
    if (!slug) {
      throw new BadRequestException("El nombre del rol no es válido");
    }
    if (isSystemRoleSlug(slug)) {
      throw new BadRequestException("Ese nombre está reservado para un rol del sistema");
    }

    const existing = await this.prisma.rol.findUnique({ where: { slug } });
    if (existing) {
      throw new ConflictException("Ya existe un rol con ese nombre");
    }

    return this.prisma.rol.create({
      data: { slug, nombre, activo: true },
      select: {
        id: true,
        slug: true,
        nombre: true,
        activo: true,
      },
    });
  }

  async update(id: number, dto: UpdateRolDto) {
    const rol = await this.prisma.rol.findUnique({ where: { id } });
    if (!rol) {
      throw new NotFoundException("Rol no encontrado");
    }

    if (dto.activo === false && rol.slug === ADMIN_ROLE_SLUG) {
      throw new ForbiddenException("No puedes desactivar el rol de administrador");
    }

    let slug = rol.slug;
    let nombre = rol.nombre;
    if (dto.nombre !== undefined) {
      nombre = dto.nombre.trim();
      if (isSystemRoleSlug(rol.slug)) {
        slug = rol.slug;
      } else {
        const nextSlug = slugifyNombre(nombre);
        if (!nextSlug) {
          throw new BadRequestException("El nombre del rol no es válido");
        }
        if (isSystemRoleSlug(nextSlug)) {
          throw new BadRequestException("Ese nombre está reservado para un rol del sistema");
        }
        slug = nextSlug;
        const clash = await this.prisma.rol.findUnique({ where: { slug } });
        if (clash && clash.id !== rol.id) {
          throw new ConflictException("Ya existe un rol con ese nombre");
        }
      }
    }

    return this.prisma.rol.update({
      where: { id },
      data: {
        nombre,
        slug,
        ...(dto.activo !== undefined ? { activo: dto.activo } : {}),
      },
      select: {
        id: true,
        slug: true,
        nombre: true,
        activo: true,
      },
    });
  }

  async remove(id: number) {
    const rol = await this.prisma.rol.findUnique({ where: { id } });
    if (!rol) {
      throw new NotFoundException("Rol no encontrado");
    }
    if (isSystemRoleSlug(rol.slug)) {
      throw new ForbiddenException("No puedes eliminar un rol del sistema");
    }

    const usuarios = await this.prisma.usuario.count({ where: { id_rol: id } });
    if (usuarios > 0) {
      throw new ConflictException("No puedes eliminar un rol que todavía tiene usuarios");
    }

    await this.prisma.rol.delete({ where: { id } });
    return { ok: true as const };
  }
}
