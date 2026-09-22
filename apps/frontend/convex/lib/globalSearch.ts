import { EMPRESAS_LIST } from "../../lib/empresas";
import { actorPuedeVerEmpresa, type BillingActor } from "./billingAuth";

/** Companies the palette search may read: the active one if allowed, else every visible one. */
export function resolveEmpresasBusqueda(actor: BillingActor, empresa: number | undefined): number[] {
  if (empresa !== undefined) {
    return actorPuedeVerEmpresa(actor, empresa) ? [empresa] : [];
  }
  if (actor.hasFullAccess || actor.accesoTodasEmpresas) {
    return EMPRESAS_LIST.map((e) => e.id);
  }
  return [...new Set(actor.empresas)];
}

/** Looks like a NIT / document number the user pasted ("900.123.456-7", "900123456"). */
export function looksLikeNit(term: string): boolean {
  return /^\d[\d.\-\s]{4,}$/.test(term.trim());
}

/**
 * Candidate `NIT` values for an exact `by_NIT` lookup. Onboarding stores every digit the user
 * typed, so "900123456-7" may be stored with or without the check digit: try both.
 */
export function nitCandidates(term: string): string[] {
  const trimmed = term.trim();
  const all = trimmed.replace(/\D/g, "");
  const sinDv = trimmed.replace(/-\s*\d$/, "").replace(/\D/g, "");
  return [...new Set([all, sinDv].filter((value) => value.length >= 5))];
}
