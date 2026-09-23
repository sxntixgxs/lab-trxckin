import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { EMPRESAS_ERP, ENTIDADES_ERP, leerConfigErp, type EntidadErp } from "../erp.config";
import { SiesaClient } from "../siesa/siesa-client";
import {
  SincronizadorErp,
  type OrigenSincronizacion,
  type ResumenSincronizacion,
} from "./sincronizador-erp";

export type CorridaVista = {
  id: string;
  entidad: string;
  empresa: number;
  alcance: string;
  nit: string | null;
  origen: string;
  estado: string;
  filasLeidas: number;
  creadas: number;
  actualizadas: number;
  eliminadas: number;
  error: string | null;
  usuario: string | null;
  iniciadaEn: string;
  finalizadaEn: string | null;
};

const ERP_NO_CONFIGURADO = "ERP no configurado: defina ERP_BASE_URL, ERP_CONNI_KEY y ERP_CONNI_TOKEN en apps/backend/.env.";

/** Nest wrapper around the framework-agnostic SincronizadorErp. */
@Injectable()
export class ErpSyncService {
  private readonly logger = new Logger("ErpSync");
  private readonly erp: SiesaClient | null;
  private readonly sincronizador: SincronizadorErp | null;

  constructor(private readonly prisma: PrismaService) {
    const config = leerConfigErp();
    this.erp = config ? new SiesaClient(config) : null;
    this.sincronizador = this.erp ? new SincronizadorErp(prisma, this.erp, this.logger) : null;
  }

  get configurado(): boolean {
    return this.sincronizador !== null;
  }

  clienteErp(): SiesaClient {
    if (!this.erp) throw new ServiceUnavailableException(ERP_NO_CONFIGURADO);
    return this.erp;
  }

  private requerirSincronizador(): SincronizadorErp {
    if (!this.sincronizador) throw new ServiceUnavailableException(ERP_NO_CONFIGURADO);
    return this.sincronizador;
  }

  /**
   * Records the runs and returns their ids at once; the work continues in the background and the
   * caller follows it through `listarCorridas`. A crash leaves runs EN_CURSO, which the next sync
   * closes as FALLIDA after 30 minutes.
   */
  async iniciarEnSegundoPlano(opciones: {
    entidades: readonly EntidadErp[];
    empresas: readonly number[];
    origen: OrigenSincronizacion;
    idUsuario?: string | null;
  }): Promise<string[]> {
    const sincronizador = this.requerirSincronizador();
    const corridas = await sincronizador.crearCorridas(opciones);
    void sincronizador.ejecutarCorridas(corridas).catch((error: unknown) => {
      this.logger.error(`Sincronización en segundo plano interrumpida: ${error instanceof Error ? error.message : String(error)}`);
    });
    return corridas.map((corrida) => corrida.id);
  }

  sincronizarTodo(origen: OrigenSincronizacion): Promise<ResumenSincronizacion[]> {
    return this.requerirSincronizador().sincronizar({ entidades: ENTIDADES_ERP, empresas: EMPRESAS_ERP, origen });
  }

  sincronizarNit(opciones: {
    entidad: EntidadErp;
    empresa: number;
    nitErp: string;
    origen: OrigenSincronizacion;
    idUsuario?: string | null;
  }): Promise<ResumenSincronizacion> {
    return this.requerirSincronizador().sincronizarNit(opciones);
  }

  async listarCorridas(opciones: { empresas: readonly number[]; limit: number }): Promise<CorridaVista[]> {
    const filas = await this.prisma.sincronizacionErp.findMany({
      where: { id_empresa: { in: [...opciones.empresas] } },
      orderBy: { iniciada_en: "desc" },
      take: opciones.limit,
      include: { usuario: { select: { nombre: true } } },
    });
    return filas.map((fila) => ({
      id: fila.id,
      entidad: fila.entidad,
      empresa: fila.id_empresa,
      alcance: fila.alcance,
      nit: fila.nit,
      origen: fila.origen,
      estado: fila.estado,
      filasLeidas: fila.filas_leidas,
      creadas: fila.creadas,
      actualizadas: fila.actualizadas,
      eliminadas: fila.eliminadas,
      error: fila.error,
      usuario: fila.usuario?.nombre ?? null,
      iniciadaEn: fila.iniciada_en.toISOString(),
      finalizadaEn: fila.finalizada_en?.toISOString() ?? null,
    }));
  }
}
