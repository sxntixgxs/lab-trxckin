import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { EMPRESAS_ERP, ENTIDADES_ERP, leerConfigErp } from "../erp.config";
import { SiesaClient } from "../siesa/siesa-client";
import {
  SincronizadorErp,
  type OrigenSincronizacion,
  type ResumenSincronizacion,
} from "./sincronizador-erp";

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

  private requerirSincronizador(): SincronizadorErp {
    if (!this.sincronizador) throw new ServiceUnavailableException(ERP_NO_CONFIGURADO);
    return this.sincronizador;
  }

  sincronizarTodo(origen: OrigenSincronizacion): Promise<ResumenSincronizacion[]> {
    return this.requerirSincronizador().sincronizar({ entidades: ENTIDADES_ERP, empresas: EMPRESAS_ERP, origen });
  }
}
