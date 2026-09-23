/**
 * Browser-side client of the ERP catalog routes (app/api/{proveedores,clientes}/existe,
 * app/api/erp/*). Types mirror the Nest responses (apps/backend/src/terceros, src/erp).
 */

export type ModuloOnboarding = "supplier" | "customer";

export type SucursalTerceroErp = {
  sucursalId: string;
  descripcion: string;
  activo: boolean;
  condicionPago: string | null;
};

export type TerceroErp = {
  erpTerceroId: string;
  nit: string;
  dv: string | null;
  tipoDocumento: string;
  tipoPersona: string;
  razonSocial: string;
  /** Active tercero with at least one active branch. */
  activo: boolean;
  sucursales: SucursalTerceroErp[];
  sincronizadoEn: string;
};

export type ExistenciaTerceroErp = {
  existe: boolean;
  tercero: TerceroErp | null;
  catalogo: { sincronizado: boolean; ultimaSincronizacion: string | null };
};

export type EntidadErp = "PROVEEDORES" | "CLIENTES";

export type CorridaSincronizacion = {
  id: string;
  entidad: EntidadErp;
  empresa: number;
  alcance: "COMPLETA" | "NIT";
  nit: string | null;
  origen: "MANUAL" | "PROGRAMADA" | "CLI" | "CREACION_ERP";
  estado: "EN_CURSO" | "EXITOSA" | "FALLIDA" | "OMITIDA";
  filasLeidas: number;
  creadas: number;
  actualizadas: number;
  eliminadas: number;
  error: string | null;
  usuario: string | null;
  iniciadaEn: string;
  finalizadaEn: string | null;
};

export type PaginaCatalogoErp = {
  items: TerceroErp[];
  total: number;
  page: number;
  pageSize: number;
};

async function leer<T>(respuesta: Response, porDefecto: string): Promise<T> {
  const cuerpo: unknown = await respuesta.json().catch(() => null);
  if (!respuesta.ok) {
    const registro = (cuerpo ?? {}) as { error?: unknown; message?: unknown };
    const mensaje = typeof registro.error === "string" ? registro.error : typeof registro.message === "string" ? registro.message : null;
    throw new Error(mensaje ?? porDefecto);
  }
  return cuerpo as T;
}

export async function consultarExistenciaErp(
  modulo: ModuloOnboarding,
  params: { empresa: number; documento: string; tipoDocumento: string },
  signal?: AbortSignal,
): Promise<ExistenciaTerceroErp> {
  const ruta = modulo === "supplier" ? "/api/proveedores/existe" : "/api/clientes/existe";
  const query = new URLSearchParams({
    empresa: String(params.empresa),
    documento: params.documento,
    tipoDocumento: params.tipoDocumento,
  });
  const respuesta = await fetch(`${ruta}?${query.toString()}`, { credentials: "include", cache: "no-store", signal });
  return leer<ExistenciaTerceroErp>(respuesta, "No se pudo consultar el catálogo del ERP.");
}

export async function listarSincronizaciones(params: { empresa?: number; limit?: number } = {}): Promise<CorridaSincronizacion[]> {
  const query = new URLSearchParams();
  if (params.empresa !== undefined) query.set("empresa", String(params.empresa));
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  const respuesta = await fetch(`/api/erp/sincronizaciones?${query.toString()}`, { credentials: "include", cache: "no-store" });
  return leer(respuesta, "No se pudieron cargar las sincronizaciones.");
}

export async function iniciarSincronizacion(body: { empresa?: number; entidad?: EntidadErp } = {}): Promise<{ corridas: string[] }> {
  const respuesta = await fetch("/api/erp/sincronizaciones", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return leer(respuesta, "No se pudo iniciar la sincronización.");
}

export async function listarCatalogoErp(
  entidad: "proveedores" | "clientes",
  params: { empresa: number; q?: string; page?: number; pageSize?: number },
  signal?: AbortSignal,
): Promise<PaginaCatalogoErp> {
  const query = new URLSearchParams({ empresa: String(params.empresa) });
  if (params.q?.trim()) query.set("q", params.q.trim());
  if (params.page) query.set("page", String(params.page));
  if (params.pageSize) query.set("pageSize", String(params.pageSize));
  const respuesta = await fetch(`/api/erp/catalogo/${entidad}?${query.toString()}`, {
    credentials: "include",
    cache: "no-store",
    signal,
  });
  return leer(respuesta, "No se pudo cargar el catálogo.");
}
