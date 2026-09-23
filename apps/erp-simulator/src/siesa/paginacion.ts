import { ErrorConsulta } from "./errores";

export type Paginacion = { pagina: number; tamano: number };

export const TAMANO_PAGINA_POR_DEFECTO = 100;
export const TAMANO_PAGINA_MAXIMO = 1000;

/** Parses SIESA's `paginacion=numPag=1|tamPag=100`. Missing parts take the defaults. */
export function parsearPaginacion(valor: string | undefined): Paginacion {
  const resultado: Paginacion = { pagina: 1, tamano: TAMANO_PAGINA_POR_DEFECTO };
  const texto = valor?.trim();
  if (!texto) return resultado;

  for (const parte of texto.split("|")) {
    const [clave, numero, ...resto] = parte.split("=").map((s) => s.trim());
    const entero = Number(numero);
    if (resto.length > 0 || !numero || !/^\d+$/.test(numero) || entero < 1) {
      throw new ErrorConsulta("Error en paginación", `Valor inválido en paginacion: "${parte}"`);
    }
    switch (clave.toLowerCase()) {
      case "numpag":
        resultado.pagina = entero;
        break;
      case "tampag":
        if (entero > TAMANO_PAGINA_MAXIMO) {
          throw new ErrorConsulta("Error en paginación", `tamPag no puede superar ${TAMANO_PAGINA_MAXIMO}`);
        }
        resultado.tamano = entero;
        break;
      default:
        throw new ErrorConsulta("Error en paginación", `Parámetro de paginación desconocido: "${clave}"`);
    }
  }
  return resultado;
}
