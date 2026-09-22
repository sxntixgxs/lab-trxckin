export type CentroCostoCatalogScope = {
  empresa: 1 | 2;
  companiaId: string;
};

export type ParsedCentroCostoSiesaId = CentroCostoCatalogScope & {
  codigo: string;
};

const DEFAULT_SCOPE: CentroCostoCatalogScope = {
  empresa: 1,
  companiaId: "1",
};

const CENTRO_COSTO_SCOPE_BY_APP_EMPRESA: Readonly<
  Record<number, CentroCostoCatalogScope>
> = {
  1: DEFAULT_SCOPE,
  2: { empresa: 2, companiaId: "1" },
  3: { empresa: 1, companiaId: "7" },
  4: { empresa: 1, companiaId: "13" },
};

/**
 * Translates the app's legal-entity id into the exact Siesa catalog partition.
 * Legacy records without an entity belong to the default company (id 1); unsupported ids fail
 * closed so callers never broaden a catalog request by accident.
 */
export function resolveCentroCostoCatalogScope(
  appEmpresa: number | null | undefined,
): CentroCostoCatalogScope | null {
  if (appEmpresa == null) return DEFAULT_SCOPE;
  if (!Number.isInteger(appEmpresa)) return null;
  return CENTRO_COSTO_SCOPE_BY_APP_EMPRESA[appEmpresa] ?? null;
}

/** Parses the canonical Siesa key: `<empresa>:<compania_id>:<codigo>`. */
export function parseCentroCostoSiesaId(
  id: string | null | undefined,
): ParsedCentroCostoSiesaId | null {
  if (typeof id !== "string") return null;

  const normalized = id.trim();
  const parts = normalized.split(":");
  if (parts.length !== 3) return null;

  const [empresaRaw, companiaIdRaw, codigoRaw] = parts;
  const empresa = Number(empresaRaw);
  const companiaId = companiaIdRaw?.trim() ?? "";
  const codigo = codigoRaw?.trim() ?? "";

  if ((empresa !== 1 && empresa !== 2) || !/^\d+$/.test(companiaId) || !codigo) {
    return null;
  }

  return {
    empresa,
    companiaId,
    codigo,
  };
}

export function isCentroCostoSiesaIdInScope(
  id: string | null | undefined,
  appEmpresa: number | null | undefined,
): boolean {
  const parsed = parseCentroCostoSiesaId(id);
  const scope = resolveCentroCostoCatalogScope(appEmpresa);
  return Boolean(
    parsed &&
      scope &&
      parsed.empresa === scope.empresa &&
      parsed.companiaId === scope.companiaId,
  );
}
