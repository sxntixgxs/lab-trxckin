  /** Shared SIESA proveedor search contract and NIT matching (anticipos + facturación). */

export type ProveedorSiesaBusqueda = {
  id: string;
  nit: string;
  sucursalId?: string | null;
  descripcionSucursal: string;
};

export type ProveedoresSiesaBusquedaResponse = {
  proveedores?: ProveedorSiesaBusqueda[];
};

export type ProveedorAnticipo =
  | {
      origen: "siesa";
      nit: string;
      razonSocial: string;
      siesaId: string;
      siesaSucursalId?: string;
    }
  | {
      origen: "manual_solicitud";
      nit: string;
      razonSocial: string;
      manualConfirmado: boolean;
    };

export type ProveedorOrigenAnticipo = ProveedorAnticipo["origen"];

export const SIESA_PROVEEDORES_SEARCH_PARAMS = {
  pageSize: "100",
  maxPages: "10",
  limit: "12",
} as const;

export const MIN_NIT_DIGITS = 5;

/** Digits only; keeps leading zeros (NITs can be zero-padded). */
export function proveedorNitDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * Strip separators/non-digits and leading zeros for matching/dedup.
 * Do not use this to decide if a typed NIT is long enough — use
 * {@link proveedorNitDigits} / {@link isNitConsultaReady}.
 */
export function normalizeProveedorNit(value: string): string {
  return proveedorNitDigits(value).replace(/^0+/, "");
}

export function isNitConsultaReady(value: string): boolean {
  return proveedorNitDigits(value).length >= MIN_NIT_DIGITS;
}

/**
 * Exact match: same normalized NIT, or one side is the other plus a single
 * verification digit. Partial substring matches are rejected.
 */
export function nitMatchesExact(
  queryNormalized: string,
  candidateNit: string
): boolean {
  const query = normalizeProveedorNit(queryNormalized);
  const candidate = normalizeProveedorNit(candidateNit);
  if (!query || !candidate) return false;
  if (candidate === query) return true;
  if (
    candidate.length === query.length + 1 &&
    candidate.startsWith(query)
  ) {
    return true;
  }
  if (
    query.length === candidate.length + 1 &&
    query.startsWith(candidate)
  ) {
    return true;
  }
  return false;
}

export function proveedorSiesaDedupKey(
  proveedor: ProveedorSiesaBusqueda
): string {
  return [
    proveedor.id,
    proveedor.sucursalId ?? "",
    normalizeProveedorNit(proveedor.nit),
  ].join("|");
}

/** Keep exact NIT matches and dedupe by id + sucursal + NIT. */
export function filterExactProveedoresSiesa(
  proveedores: ProveedorSiesaBusqueda[],
  nitQuery: string
): ProveedorSiesaBusqueda[] {
  const normalizedQuery = normalizeProveedorNit(nitQuery);
  const seen = new Set<string>();
  const result: ProveedorSiesaBusqueda[] = [];

  for (const proveedor of proveedores) {
    if (!nitMatchesExact(normalizedQuery, proveedor.nit)) continue;
    const key = proveedorSiesaDedupKey(proveedor);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(proveedor);
  }

  return result;
}

export function isProveedorAnticipoReady(
  proveedor: ProveedorAnticipo | null | undefined
): boolean {
  if (!proveedor) return false;
  if (!isNitConsultaReady(proveedor.nit)) return false;
  if (!proveedor.razonSocial.trim()) return false;

  if (proveedor.origen === "siesa") {
    return Boolean(proveedor.siesaId.trim());
  }

  return proveedor.manualConfirmado;
}

export function buildSiesaProveedoresSearchParams(args: {
  nit: string;
  empresa: number | string;
}): URLSearchParams {
  return new URLSearchParams({
    // Preserve leading zeros — SIESA may store padded document numbers.
    q: proveedorNitDigits(args.nit),
    empresa: String(args.empresa),
    ...SIESA_PROVEEDORES_SEARCH_PARAMS,
  });
}
