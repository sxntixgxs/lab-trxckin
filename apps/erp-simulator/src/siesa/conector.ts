import { calcularDvNit } from "../datos/nit";
import type { TipoIdentificacion } from "../datos/tipos";

/** Section of the import document an error belongs to, as SIESA reports it. */
export type NivelImportacion = "General" | "Inicial" | "Tercero" | "Proveedor" | "Cliente" | "Final";

export type ErrorImportacion = { nivel: NivelImportacion; campo: string; mensaje: string };

export type SucursalImportada = {
  id: string;
  descripcion: string;
  activa: boolean;
  condicionPago: string | null;
  tipoProveedor: string | null;
};

export type ImportacionTercero = {
  cia: number;
  tercero: {
    id: string;
    nit: string;
    dv: string | null;
    tipoIdentificacion: TipoIdentificacion;
    tipoTercero: 1 | 2;
    razonSocial: string;
    nombres: string | null;
    apellido1: string | null;
    apellido2: string | null;
    esCliente: boolean;
    esProveedor: boolean;
    activo: boolean;
    ciiu: string | null;
    contacto: {
      email: string | null;
      telefono: string | null;
      direccion: string | null;
      ciudad: string | null;
      departamento: string | null;
    };
  };
  proveedor: SucursalImportada[];
  cliente: SucursalImportada[];
};

export type ResultadoValidacion =
  | { ok: true; datos: ImportacionTercero }
  | { ok: false; errores: ErrorImportacion[] };

const TIPOS_IDENTIFICACION: readonly TipoIdentificacion[] = ["N", "C", "E", "P"];
const CONDICIONES_PAGO = ["CON", "ANT", "C15", "C30", "C60", "C90", "C120"];

type Registro = Record<string, unknown>;

/**
 * Validates a `conectoresimportar` body for the "tercero + proveedor/cliente" document:
 * `{ Inicial: [{F_CIA}], Tercero: [{F200_*, F015_*}], Proveedor?: [{F202_*}], Cliente?: [{F201_*}], Final: [{F_CIA}] }`.
 * Collects every error instead of stopping at the first one, like SIESA's import report.
 */
export function validarImportacion(cuerpo: unknown): ResultadoValidacion {
  const errores: ErrorImportacion[] = [];
  const error = (nivel: NivelImportacion, campo: string, mensaje: string) => errores.push({ nivel, campo, mensaje });

  if (!esRegistro(cuerpo)) {
    return { ok: false, errores: [{ nivel: "General", campo: "", mensaje: "El cuerpo debe ser un objeto JSON." }] };
  }

  const inicial = unico(cuerpo.Inicial);
  const final = unico(cuerpo.Final);
  const cia = inicial ? entero(inicial.F_CIA) : null;
  if (cia === null || cia < 1) error("Inicial", "F_CIA", "Indique la compañía (F_CIA).");
  if (!final || entero(final.F_CIA) !== cia) error("Final", "F_CIA", "F_CIA de Final debe coincidir con Inicial.");

  const tercero = unico(cuerpo.Tercero);
  if (!tercero) {
    error("Tercero", "", "Envíe exactamente un registro de Tercero.");
    return { ok: false, errores };
  }

  const tipoIdentificacion = texto(tercero.F200_ID_TIPO_IDENT)?.toUpperCase() as TipoIdentificacion | undefined;
  if (!tipoIdentificacion || !TIPOS_IDENTIFICACION.includes(tipoIdentificacion)) {
    error("Tercero", "F200_ID_TIPO_IDENT", "Tipo de identificación inválido (N, C, E o P).");
  }

  const nit = texto(tercero.F200_NIT) ?? "";
  if (!/^\d{5,15}$/.test(nit)) error("Tercero", "F200_NIT", "El número de documento debe tener entre 5 y 15 dígitos.");

  let dv: string | null = null;
  if (tipoIdentificacion === "N" && /^\d{5,15}$/.test(nit)) {
    dv = texto(tercero.F200_DV_NIT);
    if (!dv || dv !== calcularDvNit(nit)) {
      error("Tercero", "F200_DV_NIT", "El dígito de verificación no corresponde al NIT.");
    }
  }

  const id = texto(tercero.F200_ID) ?? "";
  if (!id || id.length > 15) error("Tercero", "F200_ID", "El código del tercero es obligatorio (máximo 15 caracteres).");

  const tipoTercero = entero(tercero.F200_IND_TIPO_TERCERO);
  if (tipoTercero !== 1 && tipoTercero !== 2) {
    error("Tercero", "F200_IND_TIPO_TERCERO", "Indique 1 (natural) o 2 (jurídica).");
  }

  const razonSocial = texto(tercero.F200_RAZON_SOCIAL) ?? "";
  if (!razonSocial || razonSocial.length > 120) {
    error("Tercero", "F200_RAZON_SOCIAL", "La razón social es obligatoria (máximo 120 caracteres).");
  }

  const esCliente = indicador(tercero.F200_IND_CLIENTE);
  const esProveedor = indicador(tercero.F200_IND_PROVEEDOR);
  if (esCliente === null) error("Tercero", "F200_IND_CLIENTE", "Indique 0 o 1.");
  if (esProveedor === null) error("Tercero", "F200_IND_PROVEEDOR", "Indique 0 o 1.");
  const estado = tercero.F200_IND_ESTADO === undefined ? true : indicador(tercero.F200_IND_ESTADO);
  if (estado === null) error("Tercero", "F200_IND_ESTADO", "Indique 0 o 1.");

  const proveedor = leerSucursales(cuerpo.Proveedor, "Proveedor", "F202", error);
  const cliente = leerSucursales(cuerpo.Cliente, "Cliente", "F201", error);
  if (proveedor.length === 0 && cliente.length === 0) {
    error("General", "", "Incluya al menos una sucursal de Proveedor o de Cliente.");
  }
  if (proveedor.length > 0 && esProveedor !== true) {
    error("Tercero", "F200_IND_PROVEEDOR", "Debe ser 1 cuando se envían sucursales de proveedor.");
  }
  if (cliente.length > 0 && esCliente !== true) {
    error("Tercero", "F200_IND_CLIENTE", "Debe ser 1 cuando se envían sucursales de cliente.");
  }

  if (errores.length > 0) return { ok: false, errores };

  return {
    ok: true,
    datos: {
      cia: cia as number,
      tercero: {
        id,
        nit,
        dv,
        tipoIdentificacion: tipoIdentificacion as TipoIdentificacion,
        tipoTercero: tipoTercero as 1 | 2,
        razonSocial,
        nombres: texto(tercero.F200_NOMBRES),
        apellido1: texto(tercero.F200_APELLIDO1),
        apellido2: texto(tercero.F200_APELLIDO2),
        esCliente: esCliente === true,
        esProveedor: esProveedor === true,
        activo: estado === true,
        ciiu: texto(tercero.F200_ID_CIIU),
        contacto: {
          email: texto(tercero.F015_EMAIL),
          telefono: texto(tercero.F015_TELEFONO),
          direccion: texto(tercero.F015_DIRECCION1),
          ciudad: texto(tercero.F015_CIUDAD),
          departamento: texto(tercero.F015_DEPARTAMENTO),
        },
      },
      proveedor,
      cliente,
    },
  };
}

function leerSucursales(
  valor: unknown,
  nivel: "Proveedor" | "Cliente",
  prefijo: "F201" | "F202",
  error: (nivel: NivelImportacion, campo: string, mensaje: string) => void,
): SucursalImportada[] {
  if (valor === undefined || valor === null) return [];
  if (!Array.isArray(valor) || valor.length === 0) {
    error(nivel, "", "Envíe una lista con al menos una sucursal.");
    return [];
  }
  const campoEstado = prefijo === "F201" ? "F201_IND_ESTADO_ACTIVO" : "F202_IND_ESTADO";
  const vistas = new Set<string>();
  const sucursales: SucursalImportada[] = [];
  for (const fila of valor) {
    if (!esRegistro(fila)) {
      error(nivel, "", "Cada sucursal debe ser un objeto.");
      continue;
    }
    const id = texto(fila[`${prefijo}_ID_SUCURSAL`]) ?? "";
    const descripcion = texto(fila[`${prefijo}_DESCRIPCION_SUCURSAL`]) ?? "";
    const condicionPago = texto(fila[`${prefijo}_ID_COND_PAGO`]);
    const activa = fila[campoEstado] === undefined ? true : indicador(fila[campoEstado]);
    if (!/^\d{3}$/.test(id)) error(nivel, `${prefijo}_ID_SUCURSAL`, "La sucursal debe tener 3 dígitos (p. ej. 001).");
    else if (vistas.has(id)) error(nivel, `${prefijo}_ID_SUCURSAL`, `La sucursal ${id} está repetida.`);
    vistas.add(id);
    if (!descripcion || descripcion.length > 120) {
      error(nivel, `${prefijo}_DESCRIPCION_SUCURSAL`, "La descripción es obligatoria (máximo 120 caracteres).");
    }
    if (condicionPago && !CONDICIONES_PAGO.includes(condicionPago)) {
      error(nivel, `${prefijo}_ID_COND_PAGO`, `Condición de pago desconocida: ${condicionPago}.`);
    }
    if (activa === null) error(nivel, campoEstado, "Indique 0 o 1.");
    sucursales.push({
      id,
      descripcion,
      activa: activa !== false,
      condicionPago,
      tipoProveedor: prefijo === "F202" ? texto(fila.F202_ID_TIPO_PROV) : null,
    });
  }
  return sucursales;
}

function esRegistro(valor: unknown): valor is Registro {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

function unico(valor: unknown): Registro | null {
  return Array.isArray(valor) && valor.length === 1 && esRegistro(valor[0]) ? valor[0] : null;
}

function texto(valor: unknown): string | null {
  if (typeof valor === "number") return String(valor);
  if (typeof valor !== "string") return null;
  const limpio = valor.trim();
  return limpio ? limpio : null;
}

function entero(valor: unknown): number | null {
  const numero = typeof valor === "number" ? valor : typeof valor === "string" && /^\d+$/.test(valor.trim()) ? Number(valor) : NaN;
  return Number.isSafeInteger(numero) ? numero : null;
}

/** SIESA indicators are 0/1 (numbers or strings). */
function indicador(valor: unknown): boolean | null {
  const numero = entero(valor);
  return numero === 1 ? true : numero === 0 ? false : null;
}
