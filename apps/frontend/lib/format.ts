const copFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

/** Formats a Colombian peso amount without decimals, e.g. `$ 1.234.567`. */
export function formatCOP(value: number): string {
  return copFormatter.format(value);
}
