import type { CorridaSincronizacion, PaginaCatalogoErp, TerceroErp } from "@/lib/erp/terceros";

export { mensajeDeError } from "@/lib/erp/errores";

/** Catalog segment of `listarCatalogoErp`, also the value of each tab. */
export type EntidadCatalogo = "proveedores" | "clientes";

export type PaginaCatalogoConsultada = PaginaCatalogoErp & {
  /** Search term this page answers, so the texts match the rows while the next page loads. */
  q: string;
};

export const TAMANO_PAGINA = 25;
export const LIMITE_CORRIDAS = 20;
export const BUSQUEDA_MINIMA = 2;
export const INTERVALO_SONDEO_MS = 2_000;

/**
 * A run still EN_CURSO after this long died with its process; the backend closes it as FALLIDA on
 * the next sync (MINUTOS_CORRIDA_HUERFANA in apps/backend/src/erp/sync/sincronizador-erp.ts).
 */
const MS_CORRIDA_HUERFANA = 30 * 60_000;

export const tercerosErpKeys = {
  catalogoEmpresa: (empresa: number) => ["terceros-erp", "catalogo", empresa] as const,
  catalogo: (empresa: number, entidad: EntidadCatalogo, q: string, pagina: number) =>
    ["terceros-erp", "catalogo", empresa, entidad, q, pagina] as const,
  sincronizaciones: (empresa: number) => ["terceros-erp", "sincronizaciones", empresa] as const,
};

export function esEntidadCatalogo(valor: string): valor is EntidadCatalogo {
  return valor === "proveedores" || valor === "clientes";
}

const NOMBRE_ENTIDAD: Record<EntidadCatalogo, { singular: string; plural: string }> = {
  proveedores: { singular: "proveedor", plural: "proveedores" },
  clientes: { singular: "cliente", plural: "clientes" },
};

const ENTIDAD_ERP_LABEL: Record<string, string> = { PROVEEDORES: "Proveedores", CLIENTES: "Clientes" };

const ORIGEN_LABEL: Record<string, string> = {
  MANUAL: "Manual",
  PROGRAMADA: "Programada",
  CLI: "CLI",
  CREACION_ERP: "Crear en ERP",
};

const ESTADO_LABEL: Record<string, string> = {
  EN_CURSO: "En curso",
  EXITOSA: "Exitosa",
  FALLIDA: "Fallida",
  OMITIDA: "Omitida",
};

const TIPO_PERSONA_LABEL: Record<string, string> = {
  PERSONA_JURIDICA: "Jurídica",
  PERSONA_NATURAL: "Natural",
};

/** "12 proveedores", "1 cliente". */
export function contarTerceros(entidad: EntidadCatalogo, total: number): string {
  const nombre = NOMBRE_ENTIDAD[entidad];
  return `${formatearNumero(total)} ${total === 1 ? nombre.singular : nombre.plural}`;
}

export function etiquetaEntidadErp(entidad: string): string {
  return ENTIDAD_ERP_LABEL[entidad] ?? entidad;
}

export function etiquetaOrigen(origen: string): string {
  return ORIGEN_LABEL[origen] ?? origen;
}

export function etiquetaEstado(estado: string): string {
  return ESTADO_LABEL[estado] ?? estado;
}

export function etiquetaTipoPersona(tipoPersona: string): string {
  return TIPO_PERSONA_LABEL[tipoPersona] ?? tipoPersona;
}

export function etiquetaAlcance(corrida: Pick<CorridaSincronizacion, "alcance" | "nit">): string {
  return corrida.alcance === "NIT" ? `Documento ${corrida.nit ?? "—"}` : "Completa";
}

/** Document with its check digit when the ERP has one: `900123456-7`. */
export function documentoTercero(tercero: Pick<TerceroErp, "nit" | "dv">): string {
  const dv = tercero.dv?.trim();
  return dv ? `${tercero.nit}-${dv}` : tercero.nit;
}

export function totalPaginas(total: number, tamanoPagina: number): number {
  return Math.max(1, Math.ceil(total / Math.max(1, tamanoPagina)));
}

/** EN_CURSO for so long that the process running it must have died (see MS_CORRIDA_HUERFANA). */
export function corridaHuerfana(corrida: CorridaSincronizacion, referencia: number): boolean {
  return corrida.estado === "EN_CURSO" && referencia - Date.parse(corrida.iniciadaEn) > MS_CORRIDA_HUERFANA;
}

/**
 * Still running as of `referencia` (the time the list was fetched). Orphaned runs do not count,
 * so they neither keep the polling alive nor block "Sincronizar ahora".
 */
export function corridaEnCurso(corrida: CorridaSincronizacion, referencia: number): boolean {
  return corrida.estado === "EN_CURSO" && !corridaHuerfana(corrida, referencia);
}

const formatoNumero = new Intl.NumberFormat("es-CO");
const formatoFechaHora = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" });
const formatoFechaHoraSegundos = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "medium" });

export function formatearNumero(valor: number): string {
  return formatoNumero.format(valor);
}

export function formatearFechaHora(iso: string, opciones: { segundos?: boolean } = {}): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return "—";
  return (opciones.segundos ? formatoFechaHoraSegundos : formatoFechaHora).format(fecha);
}

/** Elapsed time of a finished run: "< 1 s", "42 s", "3 min 5 s", "1 h 2 min". */
export function formatearDuracion(inicio: string, fin: string | null): string {
  if (!fin) return "—";
  const milisegundos = Date.parse(fin) - Date.parse(inicio);
  if (!Number.isFinite(milisegundos) || milisegundos < 0) return "—";
  if (milisegundos < 1_000) return "< 1 s";
  const segundosTotales = Math.round(milisegundos / 1_000);
  if (segundosTotales < 60) return `${segundosTotales} s`;
  const minutosTotales = Math.floor(segundosTotales / 60);
  const segundos = segundosTotales % 60;
  if (minutosTotales < 60) return segundos ? `${minutosTotales} min ${segundos} s` : `${minutosTotales} min`;
  const horas = Math.floor(minutosTotales / 60);
  const minutos = minutosTotales % 60;
  return minutos ? `${horas} h ${minutos} min` : `${horas} h`;
}
