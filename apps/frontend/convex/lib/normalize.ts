/** Shared normalizers for identifiers that come from user input or legacy documents. */

export const DEFAULT_EMPRESA = 1;

/** Trims and lowercases an email address; a missing value becomes "". */
export function normalizeEmail(email?: string | null): string {
  return email?.trim().toLowerCase() ?? "";
}

/**
 * Returns `empresa` when it is a usable company id (finite, non-zero), otherwise `fallback`.
 * Most modules fall back to company 1; causación, cruces internos and the dashboard
 * projection pass `0` to mean "unknown company".
 */
export function normalizeEmpresa(
  empresa?: number | null,
  fallback: number = DEFAULT_EMPRESA,
): number {
  return empresa && Number.isFinite(empresa) ? empresa : fallback;
}
