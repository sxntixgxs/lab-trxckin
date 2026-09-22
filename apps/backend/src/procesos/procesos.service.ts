import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateProcesoDto } from "./dto/create-proceso.dto";
import type { UpdateProcesoDto } from "./dto/update-proceso.dto";

const includeLider = {
  lider: { select: { id: true, nombre: true, email: true } },
} as const;

@Injectable()
export class ProcesosService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.proceso.findMany({
      include: includeLider,
      orderBy: { nombre: "asc" },
    });
  }

  async create(dto: CreateProcesoDto) {
    return this.prisma.proceso.create({
      data: {
        nombre: dto.nombre.trim(),
        lider_user_id: dto.lider_user_id,
        activo: dto.activo ?? true,
      },
      include: includeLider,
    });
  }

  async update(id: number, dto: UpdateProcesoDto) {
    const existing = await this.prisma.proceso.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException("Proceso no encontrado");
    }
    return this.prisma.proceso.update({
      where: { id },
      data: {
        ...(dto.nombre !== undefined ? { nombre: dto.nombre.trim() } : {}),
        ...(dto.lider_user_id !== undefined ? { lider_user_id: dto.lider_user_id } : {}),
        ...(dto.activo !== undefined ? { activo: dto.activo } : {}),
      },
      include: includeLider,
    });
  }

  async remove(id: number) {
    const existing = await this.prisma.proceso.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException("Proceso no encontrado");
    }
    // Usuario_id_proceso_fkey is ON DELETE SET NULL, so members are detached by Postgres.
    await this.prisma.proceso.delete({ where: { id } });
    return { ok: true as const };
  }
}
