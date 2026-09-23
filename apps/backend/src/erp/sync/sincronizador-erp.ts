import type { Prisma, PrismaClient } from "@prisma/client";
import { normalizarNit } from "../../common/nit";
import { companiaErpDeEmpresa, type EntidadErp } from "../erp.config";
import { literalSiesa, type SiesaClient } from "../siesa/siesa-client";
import { mapearFila, type RegistroCatalogo } from "../siesa/siesa-filas";
import { planificarSincronizacion, type FilaCatalogo } from "./plan-sincronizacion";

export type OrigenSincronizacion = "MANUAL" | "PROGRAMADA" | "CLI" | "CREACION_ERP";
export type AlcanceSincronizacion = "COMPLETA" | "NIT";
export type EstadoSincronizacion = "EN_CURSO" | "EXITOSA" | "FALLIDA" | "OMITIDA";

/** A recorded run (SincronizacionErp row) waiting to be executed. */
export type Corrida = {
  id: string;
  entidad: EntidadErp;
  empresa: number;
  alcance: AlcanceSincronizacion;
  /** NIT scope only: the document as the ERP stores it (may be zero-padded). */
  nitErp: string | null;
  iniciadaEn: Date;
};

export type ResumenSincronizacion = {
  id: string;
  entidad: EntidadErp;
  empresa: number;
  alcance: AlcanceSincronizacion;
  nit: string | null;
  estado: Exclude<EstadoSincronizacion, "EN_CURSO">;
  filasLeidas: number;
  creadas: number;
  actualizadas: number;
  eliminadas: number;
  error: string | null;
};

type Registro = { log(mensaje: string): void; error(mensaje: string): void };

/** A run still EN_CURSO after this long died with its process. */
const MINUTOS_CORRIDA_HUERFANA = 30;
const TAMANO_LOTE = 500;
/** Namespace of the transaction-level advisory locks that serialize syncs per catalog and company. */
const NAMESPACE_BLOQUEO = 7431;

const CONSULTA_POR_ENTIDAD: Record<EntidadErp, string> = {
  PROVEEDORES: "API_v2_Proveedores",
  CLIENTES: "API_v2_Clientes",
};

type DatosFila = RegistroCatalogo & { sincronizado_en: Date };

/** The subset of the Proveedor / Cliente delegates the sync uses; both tables share columns. */
type DelegadoCatalogo = {
  findMany(args: { where: Record<string, unknown> }): Promise<FilaCatalogo[]>;
  createMany(args: { data: DatosFila[]; skipDuplicates: boolean }): Promise<{ count: number }>;
  updateMany(args: { where: Record<string, unknown>; data: DatosFila }): Promise<{ count: number }>;
  deleteMany(args: { where: Record<string, unknown> }): Promise<{ count: number }>;
};

function delegadoCatalogo(cliente: Prisma.TransactionClient, entidad: EntidadErp): DelegadoCatalogo {
  return (entidad === "PROVEEDORES" ? cliente.proveedor : cliente.cliente) as unknown as DelegadoCatalogo;
}

function enLotes<T>(lista: readonly T[], tamano: number): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < lista.length; i += tamano) lotes.push(lista.slice(i, i + tamano));
  return lotes;
}

type ResultadoAplicacion =
  | { omitida: string }
  | { creadas: number; actualizadas: number; eliminadas: number };

/**
 * Copies the ERP's clientes/proveedores into the catalog tables. Framework-agnostic (takes a
 * PrismaClient and a SiesaClient) so the CLI script can run it without Nest.
 *
 * Safety rules:
 * - ERP pages are fetched before the transaction; a failed fetch changes nothing.
 * - If the ERP returns nothing for a scope the catalog has rows for, the run fails and the
 *   catalog is kept (a misconfigured company must not wipe it).
 * - Each (catalog, company) is serialized with a transaction-level advisory lock. Full runs skip
 *   when it is busy or when a newer full run already succeeded; targeted runs wait for it.
 * - Rows written by a newer run are never updated or deleted by an older one.
 */
export class SincronizadorErp {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly erp: SiesaClient,
    private readonly registro: Registro = console,
  ) {}

  /** Records one EN_CURSO run per catalog and company, so they are visible before the work starts. */
  async crearCorridas(opciones: {
    entidades: readonly EntidadErp[];
    empresas: readonly number[];
    origen: OrigenSincronizacion;
    idUsuario?: string | null;
  }): Promise<Corrida[]> {
    await this.cerrarCorridasHuerfanas();
    const corridas: Corrida[] = [];
    for (const empresa of opciones.empresas) {
      for (const entidad of opciones.entidades) {
        const fila = await this.prisma.sincronizacionErp.create({
          data: {
            entidad,
            id_empresa: empresa,
            alcance: "COMPLETA",
            origen: opciones.origen,
            estado: "EN_CURSO",
            id_usuario: opciones.idUsuario ?? null,
          },
        });
        corridas.push({ id: fila.id, entidad, empresa, alcance: "COMPLETA", nitErp: null, iniciadaEn: fila.iniciada_en });
      }
    }
    return corridas;
  }

  /** Runs recorded runs one after another. */
  async ejecutarCorridas(corridas: readonly Corrida[]): Promise<ResumenSincronizacion[]> {
    const resumenes: ResumenSincronizacion[] = [];
    for (const corrida of corridas) resumenes.push(await this.ejecutar(corrida));
    return resumenes;
  }

  /** Full sync of the given catalogs and companies, awaited (CLI and scheduled job). */
  async sincronizar(opciones: {
    entidades: readonly EntidadErp[];
    empresas: readonly number[];
    origen: OrigenSincronizacion;
    idUsuario?: string | null;
  }): Promise<ResumenSincronizacion[]> {
    return this.ejecutarCorridas(await this.crearCorridas(opciones));
  }

  /**
   * Re-syncs one document, right after it was created in the ERP. `nitErp` is the document as the
   * ERP stores it (the import response's f200_nit), so a zero-padded record is still found.
   */
  async sincronizarNit(opciones: {
    entidad: EntidadErp;
    empresa: number;
    nitErp: string;
    origen: OrigenSincronizacion;
    idUsuario?: string | null;
  }): Promise<ResumenSincronizacion> {
    const fila = await this.prisma.sincronizacionErp.create({
      data: {
        entidad: opciones.entidad,
        id_empresa: opciones.empresa,
        alcance: "NIT",
        nit: normalizarNit(opciones.nitErp),
        origen: opciones.origen,
        estado: "EN_CURSO",
        id_usuario: opciones.idUsuario ?? null,
      },
    });
    return this.ejecutar({
      id: fila.id,
      entidad: opciones.entidad,
      empresa: opciones.empresa,
      alcance: "NIT",
      nitErp: opciones.nitErp,
      iniciadaEn: fila.iniciada_en,
    });
  }

  private async ejecutar(corrida: Corrida): Promise<ResumenSincronizacion> {
    const base = {
      id: corrida.id,
      entidad: corrida.entidad,
      empresa: corrida.empresa,
      alcance: corrida.alcance,
      nit: corrida.nitErp === null ? null : normalizarNit(corrida.nitErp),
    };
    let filasLeidas = 0;
    try {
      const compania = companiaErpDeEmpresa(corrida.empresa);
      if (!compania) throw new Error(`La empresa ${corrida.empresa} no tiene compañía en el ERP.`);
      const parametros =
        corrida.alcance === "NIT"
          ? `f200_id_cia = ${compania.cia} AND f200_nit = ${literalSiesa(corrida.nitErp ?? "")}`
          : `f200_id_cia = ${compania.cia}`;

      const filas = await this.erp.consultarTodo({
        idCompania: compania.idCompania,
        descripcion: CONSULTA_POR_ENTIDAD[corrida.entidad],
        parametros,
      });
      filasLeidas = filas.length;
      const entrantes = filas
        .map((fila) => mapearFila(corrida.entidad, fila, corrida.empresa))
        .filter((registro): registro is RegistroCatalogo => registro !== null);

      const resultado = await this.prisma.$transaction((tx) => this.aplicar(tx, corrida, entrantes), {
        timeout: 60_000,
        maxWait: 10_000,
      });

      if ("omitida" in resultado) {
        return this.cerrar({ ...base, estado: "OMITIDA", filasLeidas, creadas: 0, actualizadas: 0, eliminadas: 0, error: resultado.omitida });
      }
      const resumen = await this.cerrar({ ...base, estado: "EXITOSA", filasLeidas, ...resultado, error: null });
      this.registro.log(
        `[ERP] ${corrida.entidad} empresa ${corrida.empresa} (${corrida.alcance}): ${filasLeidas} leídas, ` +
          `${resumen.creadas} creadas, ${resumen.actualizadas} actualizadas, ${resumen.eliminadas} eliminadas.`,
      );
      return resumen;
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error);
      this.registro.error(`[ERP] ${corrida.entidad} empresa ${corrida.empresa} (${corrida.alcance}) falló: ${mensaje}`);
      return this.cerrar({
        ...base,
        estado: "FALLIDA",
        filasLeidas,
        creadas: 0,
        actualizadas: 0,
        eliminadas: 0,
        error: mensaje.slice(0, 1000),
      });
    }
  }

  private async aplicar(
    tx: Prisma.TransactionClient,
    corrida: Corrida,
    entrantes: RegistroCatalogo[],
  ): Promise<ResultadoAplicacion> {
    if (!(await this.bloquear(tx, corrida))) {
      return { omitida: "Otra sincronización de este catálogo estaba en curso." };
    }
    if (corrida.alcance === "COMPLETA") {
      const masReciente = await tx.sincronizacionErp.findFirst({
        where: {
          entidad: corrida.entidad,
          id_empresa: corrida.empresa,
          alcance: "COMPLETA",
          estado: "EXITOSA",
          iniciada_en: { gt: corrida.iniciadaEn },
        },
        select: { id: true },
      });
      if (masReciente) return { omitida: "Una sincronización más reciente ya actualizó este catálogo." };
    }

    const catalogo = delegadoCatalogo(tx, corrida.entidad);
    const alcance: Record<string, unknown> =
      corrida.alcance === "NIT"
        ? { id_empresa: corrida.empresa, nit: normalizarNit(corrida.nitErp ?? "") }
        : { id_empresa: corrida.empresa };
    const existentes = await catalogo.findMany({ where: alcance });
    if (entrantes.length === 0 && existentes.length > 0) {
      throw new Error("El ERP no devolvió registros para este alcance; se conserva el catálogo actual.");
    }

    const plan = planificarSincronizacion(existentes, entrantes);
    const marca = corrida.iniciadaEn;
    // Rows written by a newer run (sincronizado_en after this run started) are left alone.
    const escritoAntes = { sincronizado_en: { lt: marca } };

    let creadas = 0;
    for (const lote of enLotes(plan.crear, TAMANO_LOTE)) {
      const resultado = await catalogo.createMany({
        data: lote.map((registro) => ({ ...registro, sincronizado_en: marca })),
        skipDuplicates: true,
      });
      creadas += resultado.count;
    }
    let actualizadas = 0;
    for (const { id, datos } of plan.actualizar) {
      const resultado = await catalogo.updateMany({ where: { id, ...escritoAntes }, data: { ...datos, sincronizado_en: marca } });
      actualizadas += resultado.count;
    }
    let eliminadas = 0;
    for (const lote of enLotes(plan.eliminar, TAMANO_LOTE)) {
      const resultado = await catalogo.deleteMany({ where: { id: { in: lote }, ...escritoAntes } });
      eliminadas += resultado.count;
    }
    return { creadas, actualizadas, eliminadas };
  }

  /** Full runs skip when the lock is taken; targeted runs follow a user action, so they wait. */
  private async bloquear(tx: Prisma.TransactionClient, corrida: Corrida): Promise<boolean> {
    const clave = (corrida.entidad === "PROVEEDORES" ? 1000 : 2000) + corrida.empresa;
    if (corrida.alcance === "NIT") {
      // $executeRaw on purpose: $queryRaw cannot deserialize the void column this returns.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${NAMESPACE_BLOQUEO}::int, ${clave}::int)`;
      return true;
    }
    const [fila] = await tx.$queryRaw<Array<{ ok: boolean }>>`
      SELECT pg_try_advisory_xact_lock(${NAMESPACE_BLOQUEO}::int, ${clave}::int) AS ok`;
    return fila?.ok === true;
  }

  private async cerrar(resumen: ResumenSincronizacion): Promise<ResumenSincronizacion> {
    await this.prisma.sincronizacionErp.update({
      where: { id: resumen.id },
      data: {
        estado: resumen.estado,
        filas_leidas: resumen.filasLeidas,
        creadas: resumen.creadas,
        actualizadas: resumen.actualizadas,
        eliminadas: resumen.eliminadas,
        error: resumen.error,
        finalizada_en: new Date(),
      },
    });
    return resumen;
  }

  private async cerrarCorridasHuerfanas(): Promise<void> {
    const limite = new Date(Date.now() - MINUTOS_CORRIDA_HUERFANA * 60_000);
    await this.prisma.sincronizacionErp.updateMany({
      where: { estado: "EN_CURSO", iniciada_en: { lt: limite } },
      data: {
        estado: "FALLIDA",
        error: "Interrumpida: el proceso terminó antes de finalizar.",
        finalizada_en: new Date(),
      },
    });
  }
}
