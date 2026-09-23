/** Express parses a repeated query key as an array; SIESA only reads the first value. */
export function primerValor(valor: unknown): string | undefined {
  if (typeof valor === "string") return valor;
  if (Array.isArray(valor) && typeof valor[0] === "string") return valor[0];
  return undefined;
}
