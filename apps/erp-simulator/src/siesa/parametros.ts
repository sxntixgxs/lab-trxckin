import { ErrorConsulta } from "./errores";

export type Operador = "=" | ">=";

export type Condicion = { campo: string; operador: Operador; valor: string | number };

// One condition: `campo op valor`. Values are integers, 'text' or ''text'' (the doubled form is
// what SIESA clients put in the URL). Quotes inside values are not supported: every whitelisted
// field holds codes, document numbers or dates.
const CONDICION = /^\s*([a-z][a-z0-9_]*)\s*(>=|=)\s*(''[^']*''|'[^']*'|-?\d+)\s*/i;
const SEPARADOR_AND = /^AND\b/i;

/**
 * Parses SIESA's `parametros` filter: `cond [AND cond]*`. Only the grammar is checked here; which
 * fields are allowed (and their types) is decided per query by `construirFiltros`.
 */
export function parsearParametros(valor: string | undefined): Condicion[] {
  let resto = valor?.trim() ?? "";
  if (!resto) return [];

  const condiciones: Condicion[] = [];
  for (;;) {
    const coincidencia = CONDICION.exec(resto);
    if (!coincidencia) {
      throw new ErrorConsulta("Error en parametros", `No se pudo interpretar: "${resto}"`);
    }
    const [texto, campo, operador, crudo] = coincidencia;
    condiciones.push({ campo: campo.toLowerCase(), operador: operador as Operador, valor: leerValor(crudo) });
    resto = resto.slice(texto.length);
    if (!resto) return condiciones;

    const and = SEPARADOR_AND.exec(resto);
    if (!and) {
      throw new ErrorConsulta("Error en parametros", `Se esperaba AND antes de: "${resto}"`);
    }
    resto = resto.slice(and[0].length);
    if (!resto.trim()) {
      throw new ErrorConsulta("Error en parametros", "Condición incompleta después de AND");
    }
  }
}

function leerValor(crudo: string): string | number {
  if (crudo.startsWith("''")) return crudo.slice(2, -2);
  if (crudo.startsWith("'")) return crudo.slice(1, -1);
  return Number(crudo);
}
