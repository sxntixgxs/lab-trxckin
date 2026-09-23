import { EMPRESAS_APP } from "../auth/empresa-access";

/** The two catalogs the ERP feeds. */
export type EntidadErp = "PROVEEDORES" | "CLIENTES";
export const ENTIDADES_ERP: readonly EntidadErp[] = ["PROVEEDORES", "CLIENTES"];

/** Route permission of the Administración → Terceros ERP page (catalog browser + sync). */
export const RUTA_TERCEROS_ERP = "administracion/terceros-erp";

/** Where an app company lives in SIESA: the instance (`idCompania`) and the company inside it. */
export type CompaniaErp = { idCompania: string; cia: number };

/** SIESA instances; the default ids are the ERP simulator's (apps/erp-simulator). */
const INSTANCIAS = {
  1: { variable: "ERP_INSTANCIA_1_ID_COMPANIA", porDefecto: "5001" },
  2: { variable: "ERP_INSTANCIA_2_ID_COMPANIA", porDefecto: "5002" },
} as const;

/**
 * App company → SIESA partition. Same map as the cost-center catalog
 * (apps/frontend/lib/centro-costo-catalog-scope.ts): companies 1, 3 and 4 are companies 1, 7
 * and 13 of instance 1; company 2 is company 1 of instance 2.
 */
const PARTICION_POR_EMPRESA: Readonly<Record<number, { instancia: keyof typeof INSTANCIAS; cia: number }>> = {
  1: { instancia: 1, cia: 1 },
  2: { instancia: 2, cia: 1 },
  3: { instancia: 1, cia: 7 },
  4: { instancia: 1, cia: 13 },
};

export const EMPRESAS_ERP: readonly number[] = EMPRESAS_APP.filter((empresa) => empresa in PARTICION_POR_EMPRESA);

/** Null for companies without an ERP partition (fails closed). */
export function companiaErpDeEmpresa(empresa: number, env: NodeJS.ProcessEnv = process.env): CompaniaErp | null {
  const particion = PARTICION_POR_EMPRESA[empresa];
  if (!particion) return null;
  const instancia = INSTANCIAS[particion.instancia];
  return { idCompania: env[instancia.variable]?.trim() || instancia.porDefecto, cia: particion.cia };
}

export type ConfigErp = {
  baseUrl: string;
  conniKey: string;
  conniToken: string;
  timeoutMs: number;
  tamanoPagina: number;
};

/**
 * ERP connection settings, or null when they are not set. Without them the catalog is still
 * readable (existence checks answer from it) but nothing can sync or be created in the ERP.
 */
export function leerConfigErp(env: NodeJS.ProcessEnv = process.env): ConfigErp | null {
  const baseUrl = env.ERP_BASE_URL?.trim().replace(/\/+$/, "");
  const conniKey = env.ERP_CONNI_KEY?.trim();
  const conniToken = env.ERP_CONNI_TOKEN?.trim();
  if (!baseUrl || !conniKey || !conniToken) return null;
  return {
    baseUrl,
    conniKey,
    conniToken,
    timeoutMs: enteroPositivo(env.ERP_TIMEOUT_MS, 30_000),
    tamanoPagina: Math.min(enteroPositivo(env.ERP_TAM_PAGINA, 500), 1000),
  };
}

export type ConfigSyncProgramada = { habilitada: boolean; cron: string; zonaHoraria: string };

export function leerConfigSyncProgramada(env: NodeJS.ProcessEnv = process.env): ConfigSyncProgramada {
  return {
    habilitada: env.ERP_SYNC_PROGRAMADA?.trim().toLowerCase() !== "false",
    cron: env.ERP_SYNC_CRON?.trim() || "0 0 2 * * *",
    zonaHoraria: env.ERP_SYNC_TZ?.trim() || "America/Bogota",
  };
}

function enteroPositivo(valor: string | undefined, porDefecto: number): number {
  const numero = Number(valor);
  return Number.isInteger(numero) && numero > 0 ? numero : porDefecto;
}
