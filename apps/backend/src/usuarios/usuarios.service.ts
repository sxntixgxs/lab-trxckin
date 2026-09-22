import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ADMIN_ROLE_SLUG, type AuthenticatedUser } from "../auth/auth.types";
import type { CreateUsuarioDto } from "./dto/create-usuario.dto";
import type { UpdateUsuarioDto } from "./dto/update-usuario.dto";
import { deleteWorkosUser, findOrCreateWorkosUser } from "./workos-users";
import { toAdminUsuario, toDirectoryUsuario } from "./usuarios.mapper";

const USUARIOS_LIST_CAP = 1000;

const includeUsuario = {
  rol: true,
  proceso: { select: { id: true, nombre: true, lider_user_id: true } },
  jefeDirecto: { select: { id: true, nombre: true, email: true } },
  procesosLider: { select: { id: true } },
  empresas: { select: { id_empresa: true } },
} as const;

function uniqueEmpresaIds(ids: number[] | undefined): number[] {
  return [...new Set((ids ?? []).filter((id) => Number.isInteger(id) && id > 0))];
}

function normalizeCargo(value: string | null | undefined): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed || null;
}

@Injectable()
export class UsuariosService {
  private readonly logger = new Logger(UsuariosService.name);

  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const usuarios = await this.prisma.usuario.findMany({
      include: includeUsuario,
      orderBy: { created_at: "desc" },
      take: USUARIOS_LIST_CAP,
    });
    return usuarios.map(toAdminUsuario);
  }

  async directory(options: { empresaId?: number; includeGlobalAccess?: boolean } = {}) {
    const empresaId =
      typeof options.empresaId === "number" && Number.isFinite(options.empresaId)
        ? options.empresaId
        : undefined;

    const usuarios = await this.prisma.usuario.findMany({
      where: {
        activo: true,
        ...(empresaId
          ? {
              OR: [
                { empresas: { some: { id_empresa: empresaId } } },
                ...(options.includeGlobalAccess ? [{ acceso_todas_empresas: true }] : []),
              ],
            }
          : {}),
      },
      include: includeUsuario,
      orderBy: { nombre: "asc" },
      take: USUARIOS_LIST_CAP,
    });
    return usuarios.map(toDirectoryUsuario);
  }

  async getById(id: string) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id },
      include: includeUsuario,
    });
    if (!usuario) {
      throw new NotFoundException("Usuario no encontrado");
    }
    return toDirectoryUsuario(usuario);
  }

  async create(dto: CreateUsuarioDto) {
    const email = dto.email.trim().toLowerCase();
    const nombre = dto.nombre.trim();

    const existing = await this.prisma.usuario.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException("Ya existe un usuario con ese correo");
    }

    const memberRole = await this.prisma.rol.findUnique({ where: { slug: "member" } });
    if (!memberRole) {
      throw new InternalServerErrorException("Los roles no están inicializados");
    }

    let idRol = dto.id_rol ?? memberRole.id;
    if (dto.id_rol !== undefined) {
      const role = await this.prisma.rol.findUnique({ where: { id: dto.id_rol } });
      if (!role || !role.activo) {
        throw new BadRequestException("Rol no encontrado");
      }
      idRol = role.id;
    }

    if (dto.id_proceso !== undefined) {
      await this.assertProceso(dto.id_proceso);
    }
    if (dto.id_jefe_directo !== undefined) {
      await this.assertUsuario(dto.id_jefe_directo);
    }

    const workosUser = await findOrCreateWorkosUser(email, nombre);

    const alreadyLinked = await this.prisma.usuario.findUnique({
      where: { workosUserId: workosUser.id },
    });
    if (alreadyLinked) {
      throw new ConflictException("Ese usuario de WorkOS ya está en el directorio");
    }

    let created;
    try {
      created = await this.insertUsuario(workosUser, nombre, idRol, dto);
    } catch (error) {
      if (workosUser.created) {
        await this.rollbackWorkosUser(workosUser.id);
      }
      throw error;
    }

    return toAdminUsuario(created);
  }

  private async rollbackWorkosUser(workosUserId: string) {
    try {
      await deleteWorkosUser(workosUserId);
      this.logger.warn(`Usuario WorkOS ${workosUserId} eliminado tras fallar la creación local`);
    } catch (error) {
      this.logger.error(
        `No se pudo eliminar el usuario WorkOS huérfano ${workosUserId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private insertUsuario(
    workosUser: { id: string; email: string },
    nombre: string,
    idRol: number,
    dto: CreateUsuarioDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const usuario = await tx.usuario.create({
        data: {
          workosUserId: workosUser.id,
          email: workosUser.email.toLowerCase(),
          nombre,
          id_rol: idRol,
          cargo: normalizeCargo(dto.cargo) ?? undefined,
          id_proceso: dto.id_proceso,
          id_jefe_directo: dto.id_jefe_directo,
          acceso_todas_empresas: dto.acceso_todas_empresas ?? true,
        },
      });
      await this.replaceEmpresas(tx, usuario.id, dto.empresas);
      if (dto.lider_proceso === true) {
        await this.setLiderProceso(tx, usuario.id, dto.id_proceso ?? null, true);
      }
      return tx.usuario.findUniqueOrThrow({
        where: { id: usuario.id },
        include: includeUsuario,
      });
    });
  }

  async update(id: string, dto: UpdateUsuarioDto, actor: AuthenticatedUser) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id },
      include: includeUsuario,
    });
    if (!usuario) {
      throw new NotFoundException("Usuario no encontrado");
    }

    if (usuario.id === actor.id) {
      if (dto.activo === false) {
        throw new ForbiddenException("No puedes desactivar tu propia cuenta");
      }
      if (dto.id_rol !== undefined && dto.id_rol !== usuario.id_rol) {
        const nextRole = await this.prisma.rol.findUnique({
          where: { id: dto.id_rol },
        });
        if (!nextRole) {
          throw new BadRequestException("Rol no encontrado");
        }
        if (usuario.rol.slug === ADMIN_ROLE_SLUG && nextRole.slug !== ADMIN_ROLE_SLUG) {
          throw new ForbiddenException("No puedes quitarte el rol de administrador");
        }
      }
    }

    if (dto.id_rol !== undefined) {
      const role = await this.prisma.rol.findUnique({
        where: { id: dto.id_rol },
      });
      if (!role || !role.activo) {
        throw new BadRequestException("Rol no encontrado");
      }
    }
    if (dto.id_proceso !== undefined && dto.id_proceso !== null) {
      await this.assertProceso(dto.id_proceso);
    }
    if (dto.id_jefe_directo !== undefined && dto.id_jefe_directo !== null) {
      if (dto.id_jefe_directo === id) {
        throw new BadRequestException("Un usuario no puede ser su propio jefe");
      }
      await this.assertUsuario(dto.id_jefe_directo);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.usuario.update({
        where: { id },
        data: {
          ...(dto.id_rol !== undefined ? { id_rol: dto.id_rol } : {}),
          ...(dto.activo !== undefined ? { activo: dto.activo } : {}),
          ...(dto.cargo !== undefined ? { cargo: normalizeCargo(dto.cargo) } : {}),
          ...(dto.id_proceso !== undefined ? { id_proceso: dto.id_proceso } : {}),
          ...(dto.id_jefe_directo !== undefined ? { id_jefe_directo: dto.id_jefe_directo } : {}),
          ...(dto.acceso_todas_empresas !== undefined
            ? { acceso_todas_empresas: dto.acceso_todas_empresas }
            : {}),
        },
      });
      if (dto.empresas !== undefined) {
        await this.replaceEmpresas(tx, id, dto.empresas);
      }
      if (dto.lider_proceso !== undefined) {
        const nextProcesoId =
          dto.id_proceso !== undefined ? dto.id_proceso : usuario.id_proceso;
        await this.setLiderProceso(tx, id, nextProcesoId, dto.lider_proceso);
      } else if (dto.id_proceso !== undefined && dto.id_proceso !== usuario.id_proceso) {
        // Moving to another proceso (or none) without saying anything about
        // leadership: drop leadership of every proceso the user no longer belongs to.
        await tx.proceso.updateMany({
          where: {
            lider_user_id: id,
            ...(dto.id_proceso !== null ? { NOT: { id: dto.id_proceso } } : {}),
          },
          data: { lider_user_id: null },
        });
      }
      return tx.usuario.findUniqueOrThrow({
        where: { id },
        include: includeUsuario,
      });
    });

    return toAdminUsuario(updated);
  }

  private async assertProceso(id: number) {
    const proceso = await this.prisma.proceso.findUnique({ where: { id } });
    if (!proceso || !proceso.activo) {
      throw new BadRequestException("Proceso no encontrado");
    }
  }

  private async assertUsuario(id: string) {
    const usuario = await this.prisma.usuario.findUnique({ where: { id } });
    if (!usuario) {
      throw new BadRequestException("Usuario no encontrado");
    }
  }

  private async replaceEmpresas(
    tx: Prisma.TransactionClient,
    userId: string,
    empresas: number[] | undefined,
  ) {
    if (empresas === undefined) {
      return;
    }
    await tx.usuarioEmpresa.deleteMany({ where: { id_usuario: userId } });
    const ids = uniqueEmpresaIds(empresas);
    if (ids.length === 0) {
      return;
    }
    await tx.usuarioEmpresa.createMany({
      data: ids.map((id_empresa) => ({ id_usuario: userId, id_empresa })),
    });
  }

  private async setLiderProceso(
    tx: Prisma.TransactionClient,
    userId: string,
    procesoId: number | null,
    lider: boolean,
  ) {
    if (!lider) {
      await tx.proceso.updateMany({
        where: { lider_user_id: userId },
        data: { lider_user_id: null },
      });
      return;
    }
    if (!procesoId) {
      throw new BadRequestException("Asigna un proceso antes de marcarlo como líder");
    }
    await tx.proceso.updateMany({
      where: { lider_user_id: userId, NOT: { id: procesoId } },
      data: { lider_user_id: null },
    });
    await tx.proceso.update({
      where: { id: procesoId },
      data: { lider_user_id: userId },
    });
  }
}
