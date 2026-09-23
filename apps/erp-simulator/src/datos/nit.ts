/** Prime weights DIAN applies from the rightmost digit when computing a NIT check digit. */
const PESOS_DIAN = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71] as const;

/** Digits only, without leading zeros ("0890.123.456" → "890123456"). */
export function normalizarNit(valor: string): string {
  return valor.replace(/\D/g, "").replace(/^0+/, "");
}

/** DIAN "módulo 11" check digit (DV) of a NIT. */
export function calcularDvNit(nit: string): string {
  const digitos = normalizarNit(nit);
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
