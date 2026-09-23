import { Injectable } from "@nestjs/common";
import { candidatosNit, normalizarNit } from "../common/nit";
import type { EntidadErp } from "../erp/erp.config";
import { PrismaService } from "../prisma/prisma.service";

/** SIESA search contract the app already consumes (apps/frontend/lib/siesa-proveedores.ts). */
export type ProveedorBusqueda = {
  id: string;
  nit: string;
  sucursalId: string;
  descripcionSucursal: string;
  razonSocial: string;
};

type FilaCatalogoBD = {
  erp_tercero_id: string;
  nit: string;
  dv: string | null;
  tipo_documento: string;
  tipo_persona: string;
  razon_social: string;
  sucursal_id: string;
  descripcion_sucursal: string;
  tercero_activo: boolean;
  activo: boolean;
  condicion_pago: string | null;
  sincronizado_en: Date;
};

/** The read subset of the Proveedor / Cliente delegates; both tables share columns. */
type DelegadoLectura = {
  findMany(args: { where: Record<string, unknown>; orderBy?: unknown; take?: number }): Promise<FilaCatalogoBD[]>;
};

/** Read side of the ERP catalog (Proveedor / Cliente), filled by the ERP sync. */
@Injectable()
export class TercerosCatalogoService {
  constructor(private readonly prisma: PrismaService) {}

  private delegado(entidad: EntidadErp): DelegadoLectura {
    return (entidad === "PROVEEDORES" ? this.prisma.proveedor : this.prisma.cliente) as unknown as DelegadoLectura;
  }

  /**
   * Supplier search for the advance request and billing settings: active tercero and branch only,
   * matched by document (with or without DV, or a part of it) or name. An empty term finds nothing.
   */
  async buscarProveedoresActivos(empresa: number, q: string, limit: number): Promise<ProveedorBusqueda[]> {
    const filtro = this.filtroTexto(q);
    if (!filtro) return [];
    const filas = await this.delegado("PROVEEDORES").findMany({
      where: { id_empresa: empresa, tercero_activo: true, activo: true, ...filtro },
      orderBy: [{ razon_social: "asc" }, { sucursal_id: "asc" }],
      take: limit,
    });
    return filas.map((fila) => ({
      id: fila.erp_tercero_id,
      nit: fila.nit,
      sucursalId: fila.sucursal_id,
      descripcionSucursal: fila.descripcion_sucursal,
      razonSocial: fila.razon_social,
    }));
  }

  /** Document and name matching; null when the term is too short to search. */
  private filtroTexto(q: string): Record<string, unknown> | null {
    const termino = q.trim();
    const digitos = normalizarNit(termino);
    const condiciones: Record<string, unknown>[] = [];
    if (digitos.length >= 3) {
      condiciones.push({ nit: { in: candidatosNit(termino, "NIT") } }, { nit: { contains: digitos } });
    }
    if (termino.length >= 2) {
      condiciones.push(
        { razon_social: { contains: termino, mode: "insensitive" } },
        { descripcion_sucursal: { contains: termino, mode: "insensitive" } },
      );
    }
    return condiciones.length > 0 ? { OR: condiciones } : null;
  }
}
