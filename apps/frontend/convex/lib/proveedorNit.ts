/** Server-side NIT normalization for anticipo proveedor validation. */

export const MIN_PROVEEDOR_NIT_DIGITS = 5;

/** Digits only; keeps leading zeros (NITs can be zero-padded). */
export function proveedorNitDigits(value: string): string {
  return value.replace(/\D/g, "");
}

export function assertProveedorNitValido(nit: string): string {
  const trimmed = nit.trim();
  if (!trimmed) {
    throw new Error("El NIT del proveedor es obligatorio.");
  }
  const digits = proveedorNitDigits(trimmed);
  if (digits.length < MIN_PROVEEDOR_NIT_DIGITS) {
    throw new Error(
      `El NIT del proveedor debe tener al menos ${MIN_PROVEEDOR_NIT_DIGITS} dígitos.`
    );
  }
  return trimmed;
}

export function assertProveedorRazonSocialValida(razonSocial: string): string {
  const trimmed = razonSocial.trim();
  if (!trimmed) {
    throw new Error("La razón social del proveedor es obligatoria.");
  }
  return trimmed;
}
