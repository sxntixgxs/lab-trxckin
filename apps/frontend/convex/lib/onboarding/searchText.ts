import { normalizeSearchText } from "../../../lib/search-text";

/**
 * Text indexed by the onboarding `search_text` index: business name (lowercase, no accents)
 * plus the NIT as stored and digits-only, so "900.123.456" and "900123456" both match.
 */
export function buildOnboardingSearchText(input: { NIT: string; razonSocial?: string }): string {
  const digits = input.NIT.replace(/\D/g, "");
  const parts = [normalizeSearchText(input.razonSocial), normalizeSearchText(input.NIT), digits];
  return [...new Set(parts.filter(Boolean))].join(" ");
}
