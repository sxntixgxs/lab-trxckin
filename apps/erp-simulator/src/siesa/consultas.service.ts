import { Injectable } from "@nestjs/common";
import type { Prisma } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ErrorConsulta } from "./errores";
import { construirFiltros, ESQUEMA_CLIENTES, ESQUEMA_COMPANIAS, ESQUEMA_PROVEEDORES } from "./filtros";
import { parsearPaginacion } from "./paginacion";
import { parsearParametros } from "./parametros";
import { filaCliente, filaCompania, filaProveedor, type FilaSiesa } from "./proyecciones";

export type ParametrosConsulta = {
  idCompania?: string;
  descripcion?: string;
  paginacion?: string;
  parametros?: string;
};

/** The standard queries ("consultas estándar") this fake SIESA exposes. */
export const CONSULTAS_DISPONIBLES = ["API_v2_Proveedores", "API_v2_Clientes", "API_v2_Companias"] as const;

@Injectable()
export class ConsultasService {
  constructor(private readonly prisma: PrismaService) {}

  /** Runs one page of a standard query; an empty page is returned as `[]` (the caller answers 400). */
  async ejecutar(params: ParametrosConsulta): Promise<FilaSiesa[]> {
    const idInstancia = params.idCompania?.trim();
    if (!idInstancia) throw new ErrorConsulta("Error", "Indique idCompania");
    const instancia = await this.prisma.compania.findFirst({
      where: { id_instancia: idInstancia },
      select: { id_instancia: true },
    });
    if (!instancia) throw new ErrorConsulta("Compañía no existe", `idCompania ${idInstancia} no existe`);

    const { pagina, tamano } = parsearPaginacion(params.paginacion);
    const condiciones = parsearParametros(params.parametros);
    const skip = (pagina - 1) * tamano;
    const descripcion = params.descripcion?.trim() ?? "";

    switch (descripcion.toLowerCase()) {
      case "api_v2_proveedores": {
        const filtros = construirFiltros(condiciones, ESQUEMA_PROVEEDORES);
        const filas = await this.prisma.proveedor.findMany({
          where: {
            AND: [
              { tercero: { AND: [{ id_instancia: idInstancia }, ...(filtros.tercero as Prisma.TerceroWhereInput[])] } },
              ...(filtros.fila as Prisma.ProveedorWhereInput[]),
            ],
          },
          include: { tercero: true },
          orderBy: [{ f202_rowid_tercero: "asc" }, { f202_id_sucursal: "asc" }],
          skip,
          take: tamano,
        });
        return filas.map(filaProveedor);
      }
      case "api_v2_clientes": {
        const filtros = construirFiltros(condiciones, ESQUEMA_CLIENTES);
        const filas = await this.prisma.cliente.findMany({
          where: {
            AND: [
              { tercero: { AND: [{ id_instancia: idInstancia }, ...(filtros.tercero as Prisma.TerceroWhereInput[])] } },
              ...(filtros.fila as Prisma.ClienteWhereInput[]),
            ],
          },
          include: { tercero: true },
          orderBy: [{ f201_rowid_tercero: "asc" }, { f201_id_sucursal: "asc" }],
          skip,
          take: tamano,
        });
        return filas.map(filaCliente);
      }
      case "api_v2_companias": {
        const filtros = construirFiltros(condiciones, ESQUEMA_COMPANIAS);
        const filas = await this.prisma.compania.findMany({
          where: { AND: [{ id_instancia: idInstancia }, ...(filtros.fila as Prisma.CompaniaWhereInput[])] },
          orderBy: { f010_id: "asc" },
          skip,
          take: tamano,
        });
        return filas.map(filaCompania);
      }
      default:
        throw new ErrorConsulta(
          "Consulta no existe",
          `No existe la consulta estándar "${descripcion}". Disponibles: ${CONSULTAS_DISPONIBLES.join(", ")}`,
        );
    }
  }
}
