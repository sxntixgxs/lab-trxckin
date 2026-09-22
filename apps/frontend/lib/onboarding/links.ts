// Construcción de enlaces públicos de onboarding. Puro: importable desde Next y Convex.
import type { OnboardingModulo } from "./roles";

export type OnboardingTokenScope = "FORM" | "SIGN";

export const ONBOARDING_PUBLIC_SEGMENT: Record<OnboardingModulo, string> = {
  supplier: "supplier",
  customer: "customer",
};

export function buildPublicOnboardingUrl(
  baseUrl: string,
  args: { modulo: OnboardingModulo; scope: OnboardingTokenScope; inscripcionId: string; token: string },
): string {
  const base = baseUrl.replace(/\/+$/, "");
  const segment = ONBOARDING_PUBLIC_SEGMENT[args.modulo];
  const path = args.scope === "SIGN" ? `/onboarding/${segment}/sign` : `/onboarding/${segment}`;
  const params = new URLSearchParams({ id: args.inscripcionId, t: args.token });
  return `${base}${path}?${params.toString()}`;
}

export function buildInternalOnboardingUrl(baseUrl: string, modulo: OnboardingModulo): string {
  const base = baseUrl.replace(/\/+$/, "");
  return modulo === "supplier" ? `${base}/suppliers/onboarding` : `${base}/customers/onboarding`;
}
