import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateProveedorDto } from "./dto/create-proveedor.dto";
import type { UpdateProveedorDto } from "./dto/update-proveedor.dto";
import type { UpsertProveedorDto } from "./dto/upsert-proveedor.dto";

function normalizeNit(nit: string): string {
  return nit.replace(/\D/g, "");
}

@Injectable()
export class ProveedoresService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.proveedor.findMany({
      where: { activo: true },
      orderBy: { nombre: "asc" },
      take: 500,
    });
  }

  search(q: string) {
    const term = q.trim();
    if (!term) {
      return this.list();
    }
    const nit = normalizeNit(term);
    return this.prisma.proveedor.findMany({
      where: {
        activo: true,
        OR: [
          { nombre: { contains: term, mode: "insensitive" } },
          ...(nit ? [{ nit: { contains: nit } }] : []),
        ],
      },
      orderBy: { nombre: "asc" },
      take: 40,
    });
  }

  create(dto: CreateProveedorDto) {
    return this.prisma.proveedor.create({
      data: {
        nit: normalizeNit(dto.nit),
        nombre: dto.nombre.trim(),
        email: dto.email,
        telefono: dto.telefono,
        direccion: dto.direccion,
        activo: true,
      },
    });
  }

  async update(id: string, dto: UpdateProveedorDto) {
    const existing = await this.prisma.proveedor.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException("Proveedor no encontrado");
    }
    return this.prisma.proveedor.update({
      where: { id },
      data: {
        ...(dto.nit !== undefined ? { nit: normalizeNit(dto.nit) } : {}),
        ...(dto.nombre !== undefined ? { nombre: dto.nombre.trim() } : {}),
        ...(dto.email !== undefined ? { email: dto.email } : {}),
        ...(dto.telefono !== undefined ? { telefono: dto.telefono } : {}),
        ...(dto.direccion !== undefined ? { direccion: dto.direccion } : {}),
        ...(dto.activo !== undefined ? { activo: dto.activo } : {}),
      },
    });
  }

  upsertFromInvoice(dto: UpsertProveedorDto) {
    const nit = normalizeNit(dto.nit);
    return this.prisma.proveedor.upsert({
      where: { nit },
      create: {
        nit,
        nombre: dto.nombre.trim(),
        email: dto.email,
        telefono: dto.telefono,
        direccion: dto.direccion,
        activo: true,
      },
      update: {
        nombre: dto.nombre.trim(),
        ...(dto.email ? { email: dto.email } : {}),
        ...(dto.telefono ? { telefono: dto.telefono } : {}),
        ...(dto.direccion ? { direccion: dto.direccion } : {}),
        activo: true,
      },
    });
  }
}
