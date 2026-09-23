import { ErrorConsulta } from "./errores";
import type { Condicion } from "./parametros";

type TipoCampo = "entero" | "texto" | "fecha";

/** Where a filterable column lives: the tercero (t200) or the row's own table (t201/t202/t010). */
type NivelCampo = "tercero" | "fila";

type DefinicionCampo = { nivel: NivelCampo; tipo: TipoCampo };

export type EsquemaConsulta = Readonly<Record<string, DefinicionCampo>>;

const CAMPOS_TERCERO: EsquemaConsulta = {
  f200_id_cia: { nivel: "tercero", tipo: "entero" },
  f200_nit: { nivel: "tercero", tipo: "texto" },
  f200_id: { nivel: "tercero", tipo: "texto" },
  f200_ind_estado: { nivel: "tercero", tipo: "entero" },
  f200_ind_tipo_tercero: { nivel: "tercero", tipo: "entero" },
  f200_fecha_actualizacion: { nivel: "tercero", tipo: "fecha" },
};

export const ESQUEMA_PROVEEDORES: EsquemaConsulta = {
  ...CAMPOS_TERCERO,
  f202_id_sucursal: { nivel: "fila", tipo: "texto" },
  f202_ind_estado: { nivel: "fila", tipo: "entero" },
};

export const ESQUEMA_CLIENTES: EsquemaConsulta = {
  ...CAMPOS_TERCERO,
  f201_id_sucursal: { nivel: "fila", tipo: "texto" },
  f201_ind_estado_activo: { nivel: "fila", tipo: "entero" },
};

export const ESQUEMA_COMPANIAS: EsquemaConsulta = {
  f010_id: { nivel: "fila", tipo: "entero" },
  f010_ind_estado: { nivel: "fila", tipo: "entero" },
};

/** One Prisma-style predicate per condition, split by level, to be combined with AND. */
export type Filtros = {
  tercero: Record<string, unknown>[];
  fila: Record<string, unknown>[];
};

/** Validates each condition against the query's whitelist and turns it into a predicate. */
export function construirFiltros(condiciones: readonly Condicion[], esquema: EsquemaConsulta): Filtros {
  const filtros: Filtros = { tercero: [], fila: [] };
  for (const { campo, operador, valor } of condiciones) {
    const definicion = esquema[campo];
    if (!definicion) {
      throw new ErrorConsulta("Error en parametros", `Campo no permitido en parametros: ${campo}`);
    }
    if (operador === ">=" && definicion.tipo === "texto") {
      throw new ErrorConsulta("Error en parametros", `El operador >= no aplica al campo ${campo}`);
    }
    const tipado = convertir(campo, definicion.tipo, valor);
    filtros[definicion.nivel].push({ [campo]: operador === ">=" ? { gte: tipado } : tipado });
  }
  return filtros;
}

function convertir(campo: string, tipo: TipoCampo, valor: string | number): string | number | Date {
  switch (tipo) {
    case "entero": {
      const numero = typeof valor === "number" ? valor : /^-?\d+$/.test(valor) ? Number(valor) : Number.NaN;
      if (!Number.isSafeInteger(numero)) {
        throw new ErrorConsulta("Error en parametros", `El campo ${campo} espera un número entero`);
      }
      return numero;
    }
    case "texto":
      return String(valor);
    case "fecha": {
      const fecha = typeof valor === "string" ? new Date(valor) : new Date(Number.NaN);
      if (Number.isNaN(fecha.getTime())) {
        throw new ErrorConsulta("Error en parametros", `El campo ${campo} espera una fecha 'AAAA-MM-DD'`);
      }
      return fecha;
    }
  }
}
