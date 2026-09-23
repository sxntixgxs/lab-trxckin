import { faseLabels } from "../dashboard/constants";
import type { AnticipoRoleConfig, AnticipoRow, UsuarioInfo } from "../dashboard/types";
import {
  getSaldoPendienteLegalizableAnticipo,
  getValorLegalizableAnticipo,
} from "../lib/valor-legalizable-anticipo";
import { getValorContableAnticipo } from "../lib/valor-contable-anticipo";
import type { AnticiposFilters, AnticiposOwnerWorkload, AnticiposUrgency } from "./types";

export type AnticiposInboxQuickFilter = AnticiposUrgency | "legalization";

const ROLE_BY_PHASE: Record<string, string> = {
  II_APROBACION_JEFE_DIRECTO: "Jefe directo",
  III_REVISION_CONTABILIDAD: "Contabilidad",
  IV_APROBACION_GERENCIA: "Gerencia",
  IV_DESEMBOLSO_TESORERIA: "Tesorería",
};

function normalizedName(value?: string | null) {
  const name = value?.trim();
  return name || null;
}

function displayName(value?: string | null) {
  const name = normalizedName(value);
  if (!name) return null;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const opaqueId = /^[a-z0-9_-]{20,}$/i;
  return uuid.test(name) || (!name.includes(" ") && !name.includes("@") && opaqueId.test(name))
    ? null
    : name;
}

export function resolveUserDisplayName(
  userId: string | null | undefined,
  usersById: ReadonlyMap<string, UsuarioInfo>,
  fallback?: string | null,
  unavailableLabel = "Usuario no disponible"
) {
  const userName = userId ? displayName(usersById.get(userId)?.nombre) : null;
  return userName ?? displayName(fallback) ?? unavailableLabel;
}

export function resolveAnticipoAssigneeName(
  row: AnticipoRow,
  usersById: ReadonlyMap<string, UsuarioInfo>,
  owners: AnticiposOwnerWorkload[]
) {
  const assignedId = normalizedName(row.faseEnCurso?.asignadoA);
  const directoryName = assignedId ? displayName(usersById.get(assignedId)?.nombre) : null;
  if (directoryName) return directoryName;

  const projectedName = assignedId
    ? displayName(owners.find((owner) => owner.userId === assignedId)?.nombre)
    : null;
  if (projectedName) return projectedName;

  const responsibleName = displayName(row.responsableNombre);
  if (
    responsibleName &&
    (!assignedId ||
      assignedId === row.responsableUserId ||
      row.faseActual === "V_PENDIENTE_LEGALIZACION")
  ) {
    return responsibleName;
  }

  return ROLE_BY_PHASE[row.faseActual] ?? faseLabels[row.faseActual] ?? "Usuario no disponible";
}

export function getInboxQuickFilterPatch(
  value: AnticiposInboxQuickFilter
): Partial<AnticiposFilters> {
  if (value === "legalization") {
    return { phase: "V_PENDIENTE_LEGALIZACION", urgency: "all" };
  }
  return {
    phase: undefined,
    urgency: value,
  };
}

export function isInboxQuickFilterActive(
  filters: AnticiposFilters,
  value: AnticiposInboxQuickFilter
) {
  if (value === "legalization") {
    return filters.phase === "V_PENDIENTE_LEGALIZACION" && filters.urgency === "all";
  }
  return filters.phase === undefined && filters.urgency === value;
}

export function getEffectiveLegalizable(row: AnticipoRow) {
  return getValorLegalizableAnticipo(row);
}

export function getPendingLegalizationBalance(row: AnticipoRow) {
  return getSaldoPendienteLegalizableAnticipo(row);
}

export function getLedgerPrimaryAmount(row: AnticipoRow) {
  if (row.faseActual === "V_PENDIENTE_LEGALIZACION") {
    return getPendingLegalizationBalance(row);
  }
  return getValorContableAnticipo(row);
}

export function canAccessAnticiposSettings({
  userId,
  roleId,
  empresa,
  roles,
}: {
  userId?: string;
  roleId?: number;
  empresa: number | null;
  roles?: AnticipoRoleConfig[];
}) {
  if (roleId === 1) return true;
  if (!userId || empresa === null || !roles) return false;

  return roles.some(
    (role) =>
      role.rol === "GERENCIA" &&
      role.userId === userId &&
      (role.empresa === empresa || role.empresa === undefined)
  );
}

/**
 * Mirrors `anularAnticipo`: before the disbursement the owner of the inbox row annuls; a
 * disbursed advance (pending legalization) only by Gerencia or Tesorería of its company
 * (company config first, else the global one) or an administrator.
 */
export function canAnularAnticipo({
  row,
  userId,
  roleId,
  roles,
}: {
  row: Pick<AnticipoRow, "faseActual" | "empresa" | "empresa_id">;
  userId?: string;
  roleId?: number;
  roles?: AnticipoRoleConfig[];
}) {
  if (row.faseActual !== "V_PENDIENTE_LEGALIZACION") return true;
  if (roleId === 1) return true;
  if (!userId || !roles) return false;
  const empresa = row.empresa_id ?? row.empresa ?? 1;
  return (["GERENCIA", "TESORERO"] as const).some((rol) => {
    const config =
      roles.find((role) => role.rol === rol && role.empresa === empresa) ??
      roles.find((role) => role.rol === rol && role.empresa === undefined);
    return config?.userId === userId;
  });
}
