import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import type { Config } from "./config.js";

/**
 * Everything the tools read, behind one interface so tests can swap it. Types mirror the
 * `returns` validators of apps/frontend/convex/mcp/lectura.ts.
 */

export type Empresa = { id: number; nombre: string; nit: string };

export type Sla = {
  estado: "healthy" | "warning" | "breached";
  umbralDiasLaborales: number;
  diasLaboralesEnFase: number;
  diasLaboralesRestantes: number;
  venceEn: string;
};

export type FacturaResumen = {
  facturaId: string;
  empresa: number;
  numeroFactura: string;
  proveedor: { nit: string; nombre: string };
  valorAPagar: number;
  moneda: string;
  fechaEmision: string;
  fase: string;
  faseEtiqueta: string;
  activa: boolean;
  enFaseDesde: string | null;
  responsables: { nombre: string; email: string; rol: string }[];
  sla: Sla | null;
};

export type AnticipoResumen = {
  anticipoId: string;
  consecutivo: number;
  empresa: number;
  solicitante: { nombre: string | null; email: string | null };
  proveedor: { nit: string; razonSocial: string };
  fase: string;
  valorSolicitado: number;
  valorLegalizable: number;
  legalizado: number;
  pendiente: number;
  legalizaciones: number;
  fechaLimiteLegalizacion: string;
  legalizacionVencida: boolean;
};

export type ProveedorCatalogo = {
  id: string;
  nit: string;
  sucursalId: string;
  descripcionSucursal: string | null;
  razonSocial: string;
};

export interface LabData {
  empresas(): Promise<Empresa[]>;
  estadoFactura(args: {
    nowMs: number;
    facturaId?: string;
    numeroFactura?: string;
    proveedorNit?: string;
    empresa?: number;
  }): Promise<{ facturas: FacturaResumen[] }>;
  aprobacionesPendientes(args: {
    nowMs: number;
    empresa?: number;
    responsable?: string;
    proveedor?: string;
    limit?: number;
  }): Promise<{ empresa: number; facturas: FacturaResumen[]; hayMas: boolean; escaneoTruncado: boolean }>;
  saldoAnticipos(args: {
    nowMs: number;
    empresa?: number;
    anticipoId?: string;
    consecutivo?: number;
    solicitanteEmail?: string;
    limit?: number;
  }): Promise<{ anticipos: AnticipoResumen[]; totalPendiente: number }>;
  /** Undefined when the NestJS API is not configured. */
  buscarProveedores?(args: { empresa: number; q: string; limit: number }): Promise<{ proveedores: ProveedorCatalogo[] }>;
}

type Args<T> = T extends (args: infer A) => unknown ? A : never;

const ref = <Fn extends (args: never) => Promise<unknown>>(nombre: string) =>
  makeFunctionReference<"query", Args<Fn> & { secret: string }, Awaited<ReturnType<Fn>>>(nombre);

const queries = {
  empresas: makeFunctionReference<"query", { secret: string }, Empresa[]>("mcp/lectura:empresas"),
  estadoFactura: ref<LabData["estadoFactura"]>("mcp/lectura:estadoFactura"),
  aprobacionesPendientes: ref<LabData["aprobacionesPendientes"]>("mcp/lectura:aprobacionesPendientes"),
  saldoAnticipos: ref<LabData["saldoAnticipos"]>("mcp/lectura:saldoAnticipos"),
};

/** Convex queries (invoices, approvals, advances) plus the NestJS supplier catalog. */
export function crearLabData(config: Config, fetchImpl: typeof fetch = fetch): LabData {
  const convex = new ConvexHttpClient(config.convexUrl);
  const secret = config.convexSecret;

  const data: LabData = {
    empresas: () => convex.query(queries.empresas, { secret }),
    estadoFactura: (args) => convex.query(queries.estadoFactura, { ...args, secret }),
    aprobacionesPendientes: (args) => convex.query(queries.aprobacionesPendientes, { ...args, secret }),
    saldoAnticipos: (args) => convex.query(queries.saldoAnticipos, { ...args, secret }),
  };

  const api = config.api;
  if (api) {
    data.buscarProveedores = async ({ empresa, q, limit }) => {
      const url = new URL(`${api.url}/mcp/proveedores/search`);
      url.search = new URLSearchParams({ empresa: String(empresa), q, limit: String(limit) }).toString();
      const response = await fetchImpl(url, {
        headers: { "x-mcp-key": api.key },
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        const cuerpo = (await response.json().catch(() => null)) as { message?: unknown } | null;
        const detalle = typeof cuerpo?.message === "string" ? cuerpo.message : response.statusText;
        throw new Error(`Supplier catalog answered ${response.status}: ${detalle}`);
      }
      return (await response.json()) as { proveedores: ProveedorCatalogo[] };
    };
  }
  return data;
}
