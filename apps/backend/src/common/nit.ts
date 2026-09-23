/** Prime weights DIAN applies from the rightmost digit when computing a NIT check digit. */
const PESOS_DIAN = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71] as const;

export function soloDigitos(valor: string): string {
  return valor.replace(/\D/g, "");
}

/** Digits only, without leading zeros: the catalog's canonical document number. */
export function normalizarNit(valor: string): string {
  return soloDigitos(valor).replace(/^0+/, "");
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

export function esTipoNit(tipoDocumento?: string | null): boolean {
  return (tipoDocumento ?? "").trim().toUpperCase() === "NIT";
}

/** True when the last digit is the valid DV of the digits before it. */
function terminaEnDv(digitos: string): boolean {
  return digitos.length >= 6 && calcularDvNit(digitos.slice(0, -1)) === digitos.slice(-1);
}

/**
 * Catalog document numbers a typed value may refer to: always the normalized digits, and for a
 * NIT also the digits without a trailing check digit when it is the valid DV of the rest
 * ("900.123.456-8" and "9001234568" both mean 900123456). Other document types never lose a
 * digit: stripping a "DV" from a cédula would match the wrong person about 1 time in 11.
 */
export function candidatosNit(documento: string, tipoDocumento?: string | null): string[] {
  const normalizado = normalizarNit(documento);
  if (!normalizado) return [];
  const candidatos = [normalizado];
  if (esTipoNit(tipoDocumento) && terminaEnDv(normalizado)) {
    const base = normalizarNit(normalizado.slice(0, -1));
    if (base) candidatos.push(base);
  }
  return candidatos;
}

/**
 * Splits a typed NIT into number and DV for sending it to the ERP. An explicit "-D" suffix is
 * always the DV; without one, a trailing digit is taken as the DV only when the value is 10+
 * digits long (company NITs have 9) and the digit checks out. The DV is always recomputed, so a
 * mistyped one never reaches the ERP. Other document types keep all their digits and get no DV.
 */
export function separarNitYDv(documento: string, tipoDocumento?: string | null): { nit: string; dv: string | null } {
  if (!esTipoNit(tipoDocumento)) return { nit: normalizarNit(documento), dv: null };
  const sufijo = /-\s*\d\s*$/.exec(documento.trim());
  let nit = normalizarNit(sufijo ? documento.trim().slice(0, sufijo.index) : documento);
  if (!sufijo && nit.length >= 10 && terminaEnDv(nit)) nit = normalizarNit(nit.slice(0, -1));
  return { nit, dv: nit ? calcularDvNit(nit) : null };
}
