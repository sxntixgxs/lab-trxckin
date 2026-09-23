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

export type SucursalTercero = {
  sucursalId: string;
  descripcion: string;
  activo: boolean;
  condicionPago: string | null;
};

export type TerceroCatalogo = {
  erpTerceroId: string;
  nit: string;
  dv: string | null;
  tipoDocumento: string;
  tipoPersona: string;
  razonSocial: string;
  /** Active tercero with at least one active branch. */
  activo: boolean;
  sucursales: SucursalTercero[];
  sincronizadoEn: string;
};

export type PaginaCatalogo = {
  items: TerceroCatalogo[];
  total: number;
  page: number;
  pageSize: number;
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
  groupBy(args: {
    by: string[];
    where: Record<string, unknown>;
    orderBy?: unknown;
    skip?: number;
    take?: number;
  }): Promise<Array<{ nit: string }>>;
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

  /** Admin catalog browser: terceros (with their branches) of a company, by name. */
  async listar(entidad: EntidadErp, empresa: number, q: string | undefined, page: number, pageSize: number): Promise<PaginaCatalogo> {
    const termino = q?.trim() ?? "";
    const filtro = termino ? this.filtroTexto(termino) : {};
    if (filtro === null) return { items: [], total: 0, page, pageSize };
    const where = { id_empresa: empresa, ...filtro };
    const delegado = this.delegado(entidad);

    const total = (await delegado.groupBy({ by: ["nit"], where })).length;
    const pagina = await delegado.groupBy({
      by: ["nit", "razon_social"],
      where,
      orderBy: [{ razon_social: "asc" }, { nit: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    const nits = pagina.map((grupo) => grupo.nit);
    const filas = nits.length
      ? await delegado.findMany({
          where: { id_empresa: empresa, nit: { in: nits } },
          orderBy: [{ nit: "asc" }, { sucursal_id: "asc" }],
        })
      : [];
    const items = nits.map((nit) => agrupar(filas.filter((fila) => fila.nit === nit)));
    return { items, total, page, pageSize };
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

function agrupar(filas: FilaCatalogoBD[]): TerceroCatalogo {
  const primera = filas[0];
  const sincronizadoEn = filas.reduce((max, fila) => (fila.sincronizado_en > max ? fila.sincronizado_en : max), primera.sincronizado_en);
  return {
    erpTerceroId: primera.erp_tercero_id,
    nit: primera.nit,
    dv: primera.dv,
    tipoDocumento: primera.tipo_documento,
    tipoPersona: primera.tipo_persona,
    razonSocial: primera.razon_social,
    activo: primera.tercero_activo && filas.some((fila) => fila.activo),
    sucursales: filas.map((fila) => ({
      sucursalId: fila.sucursal_id,
      descripcion: fila.descripcion_sucursal,
      activo: fila.activo && fila.tercero_activo,
      condicionPago: fila.condicion_pago,
    })),
    sincronizadoEn: sincronizadoEn.toISOString(),
  };
}
