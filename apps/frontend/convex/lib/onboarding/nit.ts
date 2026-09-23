/** Pesos primos que usa la DIAN, desde el dígito de la derecha, para el dígito de verificación. */
const PESOS_DIAN = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71] as const;

/** Dígito de verificación (DV) de un NIT, "módulo 11" de la DIAN. */
export function calcularDvNit(nit: string): string {
  const digitos = nit.replace(/\D/g, "").replace(/^0+/, "");
  if (!digitos || digitos.length > PESOS_DIAN.length) {
    throw new Error("NIT inválido para calcular el dígito de verificación.");
  }
  let suma = 0;
  for (let i = 0; i < digitos.length; i++) {
    suma += Number(digitos[digitos.length - 1 - i]) * PESOS_DIAN[i];
  }
  const residuo = suma % 11;
  return String(residuo > 1 ? 11 - residuo : residuo);
}

function terminaEnDv(digitos: string): boolean {
  return digitos.length >= 6 && calcularDvNit(digitos.slice(0, -1)) === digitos.slice(-1);
}

/**
 * Valores de `NIT` almacenado (dígitos tal como se digitaron: pueden traer el DV o ceros a la
 * izquierda) que corresponden a un documento digitado. Siempre: los dígitos y los dígitos sin
 * ceros a la izquierda. Solo para NIT: también sin un DV final válido y con el DV calculado al
 * final, porque el mismo tercero pudo registrarse con o sin DV. A una cédula nunca se le quita
 * ni agrega un dígito (confundiría a una persona con otra cerca de 1 de cada 11 veces).
 */
export function candidatosNumeroDocumento(numeroDocumento: string, tipoDocumento?: string | null): string[] {
  const digitos = numeroDocumento.replace(/\D/g, "");
  const sinCeros = digitos.replace(/^0+/, "");
  const candidatos = new Set([digitos, sinCeros]);
  if ((tipoDocumento ?? "").trim().toUpperCase() === "NIT" && sinCeros) {
    const base = terminaEnDv(sinCeros) ? sinCeros.slice(0, -1) : sinCeros;
    candidatos.add(base);
    candidatos.add(`${base}${calcularDvNit(base)}`);
  }
  candidatos.delete("");
  return [...candidatos];
}
